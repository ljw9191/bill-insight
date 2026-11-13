/**
 * 量化验证脚本：OCR 字段准确率 + 分类命中率 + 反馈反哺机制验证
 * 运行：npx vite-node scripts/measure-metrics.ts
 *
 * 说明：脚本只使用仓库内可复核的素材（public/samples 下的样例单据与演示账单），
 * 输出真实识别与分类结果，不做任何估算或补造。
 */
import path from 'node:path'
import { createWorker } from 'tesseract.js'
import { parseOcrText } from '../src/lib/parser'
import { classifyBill } from '../src/lib/classifier'
import type { CategoryRule, Direction } from '../src/lib/types'

const root = path.resolve(import.meta.dirname, '..')

/** 样例单据的全部可见文字，用于计算字符级准确率 */
const GROUND_TRUTH_TEXT = `微信支付账单详情
支付金额
¥ 186.50
当前状态
支付成功
商户全称
海底捞火锅
商品说明
朋友聚餐
支付时间
2026年11月8日 12:30
支付方式
零钱
交易单号
420000241120261108`

/** 样例单据的人工标注字段 */
const GROUND_TRUTH_FIELDS = {
  occurredOn: '2026-11-08',
  direction: 'expense' as Direction,
  amount: 186.5,
  merchant: '海底捞火锅',
  category: '餐饮',
}

/** 与 src/lib/demo.ts 一致的标注集会：商户、备注、方向、人工标注分类 */
const LABELED_ROWS: { merchant: string; note: string; direction: Direction; label: string }[] = [
  { merchant: '某科技有限公司', note: '十一月工资', direction: 'income', label: '工资' },
  { merchant: '瑞幸咖啡', note: '生椰拿铁', direction: 'expense', label: '餐饮' },
  { merchant: '滴滴出行', note: '晚间打车', direction: 'expense', label: '交通' },
  { merchant: '海底捞火锅', note: '朋友聚餐', direction: 'expense', label: '餐饮' },
  { merchant: '京东商城', note: '机械键盘', direction: 'expense', label: '购物' },
  { merchant: '安心公寓', note: '十一月房租', direction: 'expense', label: '居住' },
  { merchant: '中石化加油站', note: '车辆加油', direction: 'expense', label: '交通' },
  { merchant: '万达电影', note: '周末观影', direction: 'expense', label: '娱乐' },
  { merchant: '美团外卖', note: '晚餐', direction: 'expense', label: '餐饮' },
  { merchant: '老百姓大药房', note: '常用药品', direction: 'expense', label: '医疗' },
  { merchant: '中国移动', note: '手机话费', direction: 'expense', label: '通讯' },
  { merchant: '得到课程', note: '产品设计课', direction: 'expense', label: '教育' },
  { merchant: '麦当劳', note: '早餐', direction: 'expense', label: '餐饮' },
  { merchant: '淘宝退款', note: '订单退款', direction: 'income', label: '退款' },
  { merchant: '哔哩哔哩', note: '会员与娱乐', direction: 'expense', label: '娱乐' },
  { merchant: '公共交通', note: '上月交通汇总', direction: 'expense', label: '交通' },
  { merchant: '餐饮商户', note: '上月餐饮汇总', direction: 'expense', label: '餐饮' },
  { merchant: '京东商城', note: '上月购物汇总', direction: 'expense', label: '购物' },
]

/** 低置信度兜底与反哺机制验证用的构造商户（明确标注为构造用例） */
const COLD_START_ROWS: { merchant: string; note: string; direction: Direction; label: string }[] = [
  { merchant: '楼下无名小馆', note: '午餐', direction: 'expense', label: '餐饮' },
  { merchant: '公司楼下停车位', note: '停车费', direction: 'expense', label: '交通' },
  { merchant: '社区诊所', note: '感冒药', direction: 'expense', label: '医疗' },
]

function levenshtein(a: string, b: string) {
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

const strip = (text: string) => text.replace(/\s+/g, '')

function scoreLabeled(rows: typeof LABELED_ROWS, rules: CategoryRule[] = []) {
  let matched = 0
  let correct = 0
  const detail: { merchant: string; label: string; predicted: string; confidence: number; hit: boolean }[] = []
  for (const row of rows) {
    const result = classifyBill(`${row.merchant} ${row.note}`, row.direction, rules)
    const hit = result.confidence >= 0.72
    if (hit) matched += 1
    if (result.category === row.label) correct += 1
    detail.push({ merchant: row.merchant, label: row.label, predicted: result.category, confidence: Number(result.confidence.toFixed(3)), hit })
  }
  return { total: rows.length, matched, correct, detail }
}

async function main() {
  const worker = await createWorker('chi_sim', 1, {
    langPath: path.join(root, 'public/tessdata'),
    gzip: false,
    cachePath: path.join(root, '.tess-cache'),
    logger: () => {},
  })
  const startedAt = Date.now()
  // 与浏览器 enhanceScreenshot 同一算法预处理后的样例图（scripts/gen_variants.py 生成），
  // 测量的是浏览器实际输入给 Tesseract 的图，而不是原始截图。
  const image = path.join(root, 'public/samples/wechat-ocr-demo-enhanced.png')
  const { data } = await worker.recognize(image)
  const elapsedMs = Date.now() - startedAt
  await worker.terminate()

  const rawText = String(data.text ?? '')
  const cer = levenshtein(strip(GROUND_TRUTH_TEXT), strip(rawText)) / strip(GROUND_TRUTH_TEXT).length
  const parsed = await parseOcrText(rawText)
  const draft = parsed.drafts[0]

  const fieldChecks = draft
    ? [
        { field: '日期', expected: GROUND_TRUTH_FIELDS.occurredOn, actual: draft.occurredOn, ok: draft.occurredOn === GROUND_TRUTH_FIELDS.occurredOn },
        { field: '收支方向', expected: '支出', actual: draft.direction === 'income' ? '收入' : '支出', ok: draft.direction === GROUND_TRUTH_FIELDS.direction },
        { field: '金额', expected: GROUND_TRUTH_FIELDS.amount.toFixed(2), actual: draft.amount.toFixed(2), ok: Math.abs(draft.amount - GROUND_TRUTH_FIELDS.amount) < 0.005 },
        { field: '商户', expected: GROUND_TRUTH_FIELDS.merchant, actual: draft.merchant, ok: draft.merchant.includes(GROUND_TRUTH_FIELDS.merchant) },
        { field: '分类', expected: GROUND_TRUTH_FIELDS.category, actual: draft.category, ok: draft.category === GROUND_TRUTH_FIELDS.category },
      ]
    : []

  const baseline = scoreLabeled(LABELED_ROWS)
  const coldStartBefore = scoreLabeled(COLD_START_ROWS)

  // 模拟用户在明细页修正 3 条冷启动账单：生成个人规则后重新分类
  const learned: CategoryRule[] = COLD_START_ROWS.map((row, index) => ({
    id: index + 1,
    keyword: row.merchant,
    category: row.label,
    direction: row.direction,
    weight: 100,
    hitCount: 1,
    source: 'user' as const,
  }))
  const coldStartAfter = scoreLabeled(COLD_START_ROWS, learned)

  const report = {
    ocr: {
      image: 'public/samples/wechat-ocr-demo-enhanced.png',
      elapsedMs,
      characterErrorRate: Number((cer * 100).toFixed(2)),
      characterAccuracy: Number(((1 - cer) * 100).toFixed(2)),
      fieldChecks,
      fieldAccuracy: Number((fieldChecks.filter(item => item.ok).length / Math.max(1, fieldChecks.length) * 100).toFixed(1)),
      parsedDraft: draft ? { occurredOn: draft.occurredOn, direction: draft.direction, amount: draft.amount, merchant: draft.merchant, category: draft.category, confidence: draft.confidence } : null,
      parseErrors: parsed.errors,
      rawText,
    },
    classification: {
      dataset: 'src/lib/demo.ts 标注集',
      total: baseline.total,
      ruleHitRate: Number((baseline.matched / baseline.total * 100).toFixed(1)),
      categoryAccuracy: Number((baseline.correct / baseline.total * 100).toFixed(1)),
      detail: baseline.detail,
    },
    feedback: {
      dataset: '构造冷启动用例（3 条无内置关键词商户）',
      before: { hitRate: Number((coldStartBefore.matched / coldStartBefore.total * 100).toFixed(1)), accuracy: Number((coldStartBefore.correct / coldStartBefore.total * 100).toFixed(1)) },
      after: { hitRate: Number((coldStartAfter.matched / coldStartAfter.total * 100).toFixed(1)), accuracy: Number((coldStartAfter.correct / coldStartAfter.total * 100).toFixed(1)) },
      detail: coldStartAfter.detail,
    },
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
