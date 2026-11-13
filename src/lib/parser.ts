import * as XLSX from 'xlsx'
import { classifyBill } from './classifier'
import { fingerprintBill } from './crypto'
import type { CategoryRule, Direction, DraftTransaction, ParseResult } from './types'

const DATE_HEADERS = ['交易时间', '交易日期', '日期', '时间', '记账日期', '账单日期']
const AMOUNT_HEADERS = ['金额', '金额(元)', '金额（元）', '交易金额', '人民币金额', '收入金额', '支出金额', '金额(人民币)']
const DIRECTION_HEADERS = ['收/支', '收支', '收支类型', '交易类型', '借贷标志', '收入/支出']
const MERCHANT_HEADERS = ['交易对方', '商户名称', '商户全称', '对方账户', '收/付款方', '对方户名', '商品说明', '交易摘要', '摘要']
const NOTE_HEADERS = ['备注', '交易备注', '商品说明', '附言', '用途', '交易说明']

const normalize = (value: unknown) => String(value ?? '').replace(/[\s_]/g, '').trim()
const findColumn = (headers: string[], aliases: string[]) => headers.findIndex(header => aliases.some(alias => normalize(alias) === header || header.includes(normalize(alias))))

function parseDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  const text = String(value ?? '').trim()
  const match = text.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${date}T00:00:00`)
  return parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day ? date : null
}

function parseAmount(value: unknown): { amount: number; negative: boolean } | null {
  if (typeof value === 'number') return Number.isFinite(value) ? { amount: Math.abs(value), negative: value < 0 } : null
  const text = String(value ?? '').replace(/[¥￥,，\s]/g, '').trim()
  if (!text) return null
  const negative = /^-/.test(text) || /^\(.*\)$/.test(text)
  const amount = Number(text.replace(/[()+-]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? { amount, negative } : null
}

function parseDirection(value: unknown, negative: boolean, typeText = ''): Direction | null {
  const text = `${String(value ?? '')} ${typeText}`
  if (/不计收支|中性交易/.test(text)) return null
  if (/收入|收款|进账|转入|工资|退款|贷/.test(text)) return 'income'
  if (/支出|付款|消费|转出|借/.test(text) || negative) return 'expense'
  return negative ? 'expense' : 'expense'
}

export async function createDraft(input: {
  occurredOn: string
  direction: Direction
  amount: number
  merchant: string
  note?: string
  source: 'csv' | 'excel' | 'ocr' | 'manual'
  rawText?: string
  classifyText?: string
}, rules: CategoryRule[]): Promise<DraftTransaction> {
  const merchant = input.merchant.trim() || '未识别商户'
  const note = input.note?.trim() ?? ''
  const result = classifyBill(input.classifyText ?? `${merchant} ${note} ${input.rawText ?? ''}`, input.direction, rules)
  return {
    tempId: globalThis.crypto.randomUUID(),
    occurredOn: input.occurredOn,
    direction: input.direction,
    amount: input.amount,
    merchant,
    note,
    category: result.category,
    originalCategory: result.category,
    categorySource: result.source,
    confidence: result.confidence,
    source: input.source,
    rawText: input.rawText,
    corrected: false,
    fingerprint: await fingerprintBill(input.occurredOn, input.direction, input.amount, merchant),
  }
}

export async function parseBillFile(file: File, rules: CategoryRule[] = []): Promise<ParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) throw new Error('仅支持 CSV、XLS、XLSX 文件')
  if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB')

  const buffer = await file.arrayBuffer()
  let workbook: XLSX.WorkBook
  if (extension === 'csv') {
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
      text = new TextDecoder('gb18030').decode(buffer)
    }
    // Keep CSV date cells as text so invalid calendar dates cannot be silently normalized by the reader.
    workbook = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string', cellDates: false, raw: true })
  } else {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  }

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) throw new Error('文件中没有可读取的工作表')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '', raw: true })
  const headerIndex = rows.findIndex(row => {
    const headers = row.map(normalize)
    return findColumn(headers, DATE_HEADERS) >= 0 && findColumn(headers, AMOUNT_HEADERS) >= 0
  })
  if (headerIndex < 0) throw new Error('未找到表头：至少需要“交易时间”和“金额”两列，可下载样例核对格式')

  const headers = rows[headerIndex].map(normalize)
  const dateCol = findColumn(headers, DATE_HEADERS)
  const amountCol = findColumn(headers, AMOUNT_HEADERS)
  const directionCol = findColumn(headers, DIRECTION_HEADERS)
  const merchantCol = findColumn(headers, MERCHANT_HEADERS)
  const noteCol = findColumn(headers, NOTE_HEADERS)
  const dataRows = rows.slice(headerIndex + 1).filter(row => row.some(cell => String(cell).trim()))
  const drafts: DraftTransaction[] = []
  const errors: string[] = []

  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]
    const rowNumber = headerIndex + index + 2
    const occurredOn = parseDate(row[dateCol])
    const parsedAmount = parseAmount(row[amountCol])
    const direction = parsedAmount ? parseDirection(row[directionCol], parsedAmount.negative, merchantCol >= 0 ? String(row[merchantCol]) : '') : null
    const excluded = directionCol >= 0 && /不计收支|中性交易/.test(String(row[directionCol]))
    if (!occurredOn || !parsedAmount || !direction) {
      if (!excluded) errors.push(`第 ${rowNumber} 行：日期或金额无效`)
      continue
    }
    const merchant = merchantCol >= 0 ? String(row[merchantCol] ?? '') : '未命名账单'
    const note = noteCol >= 0 ? String(row[noteCol] ?? '') : ''
    drafts.push(await createDraft({ occurredOn, direction, amount: parsedAmount.amount, merchant, note, source: extension === 'csv' ? 'csv' : 'excel' }, rules))
  }
  return { drafts, errors: errors.slice(0, 20), totalRows: dataRows.length }
}

function extractOcrDate(text: string, fallback: string) {
  const full = text.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/)
  if (full) return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`
  const short = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (short) return `${fallback.slice(0, 4)}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`
  return fallback
}

const MERCHANT_BOUNDARIES = ['扫二维码', '拼多多', '美团', '高德', '零食', '街电', '抖音', '饿了么', '淘宝', '天猫', '京东', '滴滴', '瑞幸', '肯德基', '麦当劳']

function cleanOcrMerchant(value: string) {
  let merchant = value
    .replace(/拌音|抖单|抖首/g, '抖音')
    .replace(/拼夕夕|并多多/g, '拼多多')
    .replace(/[¥￥\s·•]+$/g, '')
    .trim()
    .replace(/^.{1,5}\s+(?=[\u4e00-\u9fa5]{3,}$)/, '')
  const boundary = MERCHANT_BOUNDARIES
    .map(term => merchant.indexOf(term))
    .filter(index => index > 0 && index <= 4)
    .sort((a, b) => a - b)[0]
  if (boundary !== undefined) merchant = merchant.slice(boundary)
  // 最后一步：合并 OCR 在汉字间插入的空格（"海底 捞 火 锅"→"海底捞火锅"）。
  // 必须放在前缀剥离与边界裁剪之后，否则 "U街电 街电充电桩" 会先粘连、剥不掉前缀。
  return merchant.replace(/(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '').trim()
}

interface OcrListRecord {
  occurredOn: string
  direction: Direction
  amount: number
  merchant: string
  missingDate: boolean
}

function parseListDate(line: string, year: number, headerMonth = 1): string | null {
  // OCR can lose the month digits or read 日 as 昌; recover the day and use the statement month.
  const match = line.match(/(?:(\d{1,2})\s*)?月\s*(\d{1,2})\s*[日昌]/)
  if (!match) return null
  let month = match[1] ? Number(match[1]) : headerMonth
  const day = Number(match[2])
  if (day < 1 || day > 31) return null
  if (month === 1 && headerMonth >= 10) month = headerMonth
  let resolvedYear = year
  if (month < headerMonth - 6) resolvedYear = year + 1
  if (month > headerMonth + 6) resolvedYear = year - 1
  const date = `${resolvedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${date}T00:00:00`)
  return parsed.getMonth() + 1 === month && parsed.getDate() === day ? date : null
}

export function parseOcrList(lines: string[], fallbackDate = new Date().toISOString().slice(0, 10)): OcrListRecord[] {
  const headerYear = Number(fallbackDate.slice(0, 4))
  const header = lines.join('\n').match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/)
  const year = header ? Number(header[1]) : headerYear
  const headerMonth = header ? Number(header[2]) : Number(fallbackDate.slice(5, 7))
  const records: OcrListRecord[] = []
  const isDateLine = (line: string) => /^\D{0,4}\d{1,2}\s*月\s*\d{1,2}\s*日(?:\s*\d{1,2}:\d{2})?\s*$/.test(line)
  const isSummary = (line: string) => /支出.*收入|收入.*支出|合计|总计|收支统计|全部账单|查找交易/.test(line)

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (isSummary(line) || isDateLine(line)) continue
    const signed = line.match(/([-+−–—])\s*[¥￥]?\s*(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/)
    if (!signed) continue
    const amountText = signed[2].replace(/,/g, '')
    const amount = Number(amountText)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const direction: Direction = signed[1] === '+' ? 'income' : 'expense'

    let merchant = line.slice(0, signed.index)
      .replace(/^\D{0,4}\d{1,2}\s*月\s*\d{1,2}\s*日(?:\s*\d{1,2}:\d{2})?\s*/, '')
    merchant = cleanOcrMerchant(merchant)
    if (!merchant || !/[\u4e00-\u9fa5A-Za-z]/.test(merchant)) {
      for (let previous = index - 1; previous >= Math.max(0, index - 2); previous--) {
        const candidate = lines[previous]
        if (!isDateLine(candidate) && !/^[-+]?\s*[¥￥]?\d[\d,]*\.\d{2}$/.test(candidate) && /[\u4e00-\u9fa5A-Za-z]/.test(candidate)) {
          merchant = candidate.trim()
          break
        }
      }
    }
    if (!merchant) merchant = '未识别商户'

    let occurredOn: string | null = parseListDate(line, year, headerMonth)
    for (let offset = 1; !occurredOn && offset <= 2; offset++) {
      const next = lines[index + offset]
      if (next) occurredOn = parseListDate(next, year, headerMonth)
    }
    for (let offset = 1; !occurredOn && offset <= 2; offset++) {
      const previous = lines[index - offset]
      if (previous) occurredOn = parseListDate(previous, year, headerMonth)
    }
    records.push({
      occurredOn: occurredOn ?? fallbackDate,
      direction,
      amount,
      merchant,
      missingDate: !occurredOn,
    })
  }
  return records
}

export function inferOcrDirection(text: string): Direction {
  // Detail pages often contain links or warnings such as "查看退款详情"; only a completed refund is income.
  const cleaned = text.replace(/查看退款详情|退款详情|退款说明|退款规则|退款政策|申请退款/g, '')
  const incomeScore = [
    /退款成功|退款到账|已退款|退款已原路退回/.test(cleaned) ? 6 : 0,
    /收款成功|收款到账|已收款|收款金额/.test(cleaned) ? 5 : 0,
    /工资|薪资|奖金|劳务费|报销到账/.test(cleaned) ? 4 : 0,
    /入账金额|到账金额|收入|转入/.test(cleaned) ? 3 : 0,
  ].reduce((sum, score) => sum + score, 0)
  const expenseScore = [
    /支付成功|付款成功|已支付|自动支付|扣款成功|已扣款|扣款|消费|支出|实付/.test(cleaned) ? 4 : 0,
    /订单已完成|付款方式|商品金额|付款金额/.test(cleaned) ? 2 : 0,
  ].reduce((sum, score) => sum + score, 0)
  return incomeScore > expenseScore ? 'income' : 'expense'
}

export async function parseOcrText(text: string, rules: CategoryRule[] = [], fallbackDate = new Date().toISOString().slice(0, 10)): Promise<ParseResult> {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const occurredOn = extractOcrDate(text, fallbackDate)
  const listRecords = parseOcrList(lines, fallbackDate)
  if (listRecords.length >= 2) {
    const drafts = await Promise.all(listRecords.map(item => createDraft({
      occurredOn: item.occurredOn,
      direction: item.direction,
      amount: item.amount,
      merchant: item.merchant,
      source: 'ocr',
      rawText: text,
      classifyText: item.merchant,
    }, rules)))
    const missingDates = listRecords.filter(item => item.missingDate).length
    return {
      drafts,
      errors: missingDates ? [`${missingDates} 条账单未识别到日期，已使用当前日期，请在预览中核对。`] : [],
      totalRows: drafts.length,
    }
  }

  const direction = inferOcrDirection(text)
  const merchantLine = lines.find(line => /商户|交易对方|收款方|付款方|商家/.test(line))
  // 先归一 OCR 插入的汉字间空格（"商户 全 称"→"商户全称"），前缀剥离与清洗才能命中
  let merchant = merchantLine?.replace(/(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '')
    .replace(/.*(?:商户全称|商户名称|交易对方|收款方|付款方|商家)\s*[：:]?\s*/, '').trim() ?? ''
  if (!merchant) merchant = lines.find(line => !/金额|交易|支付|时间|日期|订单|账单|¥|￥|\d+\.\d{2}/.test(line) && /[\u4e00-\u9fa5A-Za-z]/.test(line)) ?? 'OCR 未识别商户'
  merchant = cleanOcrMerchant(merchant)

  const candidates = new Map<number, { amount: number; line: string; score: number }>()
  for (const line of lines) {
    const matches = line.matchAll(/[¥￥]?\s*(-?\d+(?:,\d{3})*\.\d{1,2})/g)
    for (const match of matches) {
      const amount = Math.abs(Number(match[1].replace(/,/g, '')))
      if (!(amount > 0 && amount <= 10_000_000)) continue
      let score = 0
      if (/[¥￥]/.test(line)) score += 5
      if (/实付|支付金额|付款金额|合计|总计/.test(line)) score += 6
      if (/退款金额|收款金额|到账金额/.test(line)) score += 5
      if (/金额|付款|收款|消费|支出|收入|转账/.test(line)) score += 2
      if (/优惠|立减|折扣|手续费|余额/.test(line)) score -= 4
      const current = candidates.get(amount)
      if (!current || score > current.score) candidates.set(amount, { amount, line, score })
    }
  }
  const best = [...candidates.values()].sort((a, b) => b.score - a.score)[0]
  const drafts = best
    ? [await createDraft({ occurredOn, direction, amount: best.amount, merchant, source: 'ocr', rawText: text }, rules)]
    : []
  return {
    drafts,
    errors: drafts.length ? [] : ['未识别到有效金额，请上传更清晰的截图，或在预览中手动补录。'],
    totalRows: drafts.length,
  }
}

async function enhanceScreenshot(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(bitmap.width < 1000 ? 2 : 1, 3200 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法处理截图')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  // 灰度（YIQ 权重）+ 二值化（阈值 200）：与 scripts/gen_variants.py 完全同一套像素算法，
  // 保证浏览器预处理与量化验证脚本可对照；曾用 CSS contrast 滤镜，实测会把金额笔画破坏（5→2）。
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 0; index < image.data.length; index += 4) {
    const gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114
    const value = gray < 200 ? 0 : 255
    image.data[index] = value
    image.data[index + 1] = value
    image.data[index + 2] = value
  }
  context.putImageData(image, 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('截图预处理失败')), 'image/png')
  })
}

export async function recognizeScreenshot(file: File, onProgress: (status: string, progress: number) => void) {
  if (!/^image\/(png|jpeg|jpg|webp|bmp)$/.test(file.type)) throw new Error('请上传 PNG、JPG、WEBP 或 BMP 图片')
  if (file.size > 8 * 1024 * 1024) throw new Error('截图不能超过 8 MB')
  onProgress('enhancing image', 0.02)
  const enhanced = await enhanceScreenshot(file)
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker(['chi_sim'], 1, {
    langPath: new URL('tessdata', document.baseURI).toString().replace(/\/$/, ''),
    gzip: false,
    logger: message => onProgress(message.status, message.progress),
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
    const result = await worker.recognize(enhanced)
    return result.data.text
  } finally {
    await worker.terminate()
  }
}
