import { describe, expect, it } from 'vitest'
import { classifyBill, extractLearningKeyword } from '../lib/classifier'
import { decryptJson, encryptJson, createEncryptionSettings, unlockEncryption } from '../lib/crypto'
import { createDemoTransactions } from '../lib/demo'
import { inferOcrDirection, parseBillFile, parseOcrText } from '../lib/parser'
import { DemoStore } from '../lib/store'
import { getMonthlyStats } from '../lib/stats'
import type { CategoryRule } from '../lib/types'

describe('账单文件解析', () => {
  const csv = '\uFEFF交易时间,交易对方,商品说明,收/支,金额,备注\n2026-11-03 09:12:00,瑞幸咖啡,生椰拿铁,支出,38.50,早餐\n2026-11-05 18:01:00,某科技有限公司,工资,收入,"12,800.00",十一月工资\n2026-11-06 20:10:00,滴滴出行,网约车,支出,24.80,\n'

  it('解析支付宝风格 CSV 并识别收支', async () => {
    const file = new File([csv], 'alipay.csv', { type: 'text/csv' })
    const result = await parseBillFile(file)
    expect(result.drafts).toHaveLength(3)
    expect(result.drafts[0]).toMatchObject({ occurredOn: '2026-11-03', merchant: '瑞幸咖啡', amount: 38.5, direction: 'expense', category: '餐饮' })
    expect(result.drafts[1]).toMatchObject({ amount: 12800, direction: 'income', category: '工资' })
    expect(new Set(result.drafts.map(item => item.fingerprint)).size).toBe(3)
  })

  it('跳过缺少日期或金额的无效行并保留错误信息', async () => {
    const invalid = '交易时间,交易对方,收/支,金额\n不是日期,咖啡店,支出,20\n2026-02-30,咖啡店,支出,20\n2026-11-03,咖啡店,支出,0\n'
    const result = await parseBillFile(new File([invalid], 'bad.csv', { type: 'text/csv' }))
    expect(result.drafts).toHaveLength(0)
    expect(result.errors).toHaveLength(3)
  })

  it('解析截图 OCR 文本并优先提取金额行', async () => {
    const text = '微信支付账单\n交易时间 2026-11-08 12:30\n商户全称：海底捞火锅\n付款方式 零钱\n实付金额 ¥186.50\n优惠 10.00\n收款方 海底捞'
    const result = await parseOcrText(text)
    expect(result.drafts[0]).toMatchObject({ occurredOn: '2026-11-08', amount: 186.5, direction: 'expense', category: '餐饮' })
    expect(result.drafts[0].merchant).toBe('海底捞火锅')
  })

  it('OCR 无金额时返回可操作错误', async () => {
    const result = await parseOcrText('这是一张模糊的图片')
    expect(result.drafts).toHaveLength(0)
    expect(result.errors[0]).toContain('未识别到有效金额')
  })

  it('支付详情中的“查看退款详情”不会被误判为收入', async () => {
    const text = '《 10 微信支付 Q 完\n到账时间 2026年11月13日 01:48:17\n查看退款详情\n拼多多平台商户\n先用后付订单已完成，已自动支付\n通过零钱扣款\n¥40.46\n交易详情\n下单时间 10月30日 23:20\n管理扣款服务'
    const result = await parseOcrText(text)
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0]).toMatchObject({ occurredOn: '2026-11-13', direction: 'expense', amount: 40.46, merchant: '拼多多平台商户', category: '购物' })
  })

  it('只把真正的退款成功识别为收入', () => {
    expect(inferOcrDirection('微信支付 支付成功 查看退款详情 ¥40.46')).toBe('expense')
    expect(inferOcrDirection('微信支付 退款成功 已退款到账 ¥40.46')).toBe('income')
    expect(inferOcrDirection('工资到账 实发工资 ¥12800')).toBe('income')
  })

  it('账单列表截图一次识别多条并忽略汇总金额', async () => {
    const text = `账单
全部账单 v
查找交易
收支统计 >
2026年11月
支出 ¥1346.91  收入 ¥1547.95
扫二维码付款-给明来明去   -15.00
11月10日 20:29
零食很忙   -33.90
11月10日 20:16
U街电 街电充电桩   -1.63
11月10日 19:47
抖音生活服务商家   -9.90
11月10日 17:33
高德打车   -6.15
11月10日 16:17
拼多多平台商户   -6.54
11月10日 09:17
拼多多平台商户   -11.10
11月10日 08:56
拼多多平台商户   -22.20
11月9日 22:28
美团   -16.84
11月9日 21:40`
    const result = await parseOcrText(text)
    expect(result.drafts).toHaveLength(9)
    expect(result.drafts[0]).toMatchObject({ occurredOn: '2026-11-10', merchant: '扫二维码付款-给明来明去', amount: 15, direction: 'expense' })
    expect(result.drafts[1]).toMatchObject({ occurredOn: '2026-11-10', merchant: '零食很忙', amount: 33.9, category: '餐饮' })
    expect(result.drafts[2]).toMatchObject({ merchant: '街电充电桩', amount: 1.63, category: '通讯' })
    expect(result.drafts[4]).toMatchObject({ merchant: '高德打车', amount: 6.15, category: '交通' })
    expect(result.drafts[5]).toMatchObject({ merchant: '拼多多平台商户', amount: 6.54, category: '购物' })
    expect(result.drafts[8]).toMatchObject({ occurredOn: '2026-11-09', merchant: '美团', amount: 16.84, category: '餐饮' })
    expect(result.errors).toHaveLength(0)
  })

  it('列表中相同金额的多笔账单不会被去重', async () => {
    const text = `2026年11月\n支出 ¥20.00\n第一家店 -10.00\n11月1日 10:00\n第二家店 -10.00\n11月2日 11:00`
    const result = await parseOcrText(text)
    expect(result.drafts).toHaveLength(2)
    expect(result.drafts.map(item => item.amount)).toEqual([10, 10])
  })

  it('多个金额中优先选择实付金额并去重', async () => {
    const text = '订单金额 ¥52.00\n优惠 ¥5.00\n实付金额 ¥47.00\n实付金额 ¥47.00'
    const result = await parseOcrText(text)
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0].amount).toBe(47)
  })
})

describe('分类与反馈学习', () => {
  it('学习规则优先于内置规则', () => {
    const text = '瑞幸咖啡 下午茶'
    expect(classifyBill(text, 'expense').category).toBe('餐饮')
    const rules: CategoryRule[] = [{ id: 1, keyword: '瑞幸', category: '人情', direction: 'expense', weight: 100, hitCount: 1, source: 'user' }]
    const learned = classifyBill(text, 'expense', rules)
    expect(learned.category).toBe('人情')
    expect(learned.source).toBe('rule')
  })

  it('修正后生成规则，复用的规则权重与命中数增加', async () => {
    const seed = await createDemoTransactions()
    const store = new DemoStore(seed)
    const target = seed[1]
    await store.correctCategory(target, '人情')
    let data = await store.load()
    expect(data.rules).toHaveLength(1)
    expect(data.rules[0]).toMatchObject({ keyword: '瑞幸咖啡', category: '人情', hitCount: 1 })
    expect(data.feedback[0]).toMatchObject({ oldCategory: target.category, newCategory: '人情' })
    await store.correctCategory(target, '购物')
    data = await store.load()
    expect(data.rules).toHaveLength(1)
    expect(data.rules[0]).toMatchObject({ category: '购物', hitCount: 2, weight: 110 })
  })

  it('清洗支付渠道词后提取稳定关键词', () => {
    expect(extractLearningKeyword('瑞幸咖啡（扫码支付）')).toBe('瑞幸咖啡')
  })
})

describe('统计与加密', () => {
  it('按月汇总收支、分类与日趋势', async () => {
    const seed = await createDemoTransactions()
    const month = seed[0].occurredOn.slice(0, 7)
    const stats = getMonthlyStats(seed, month)
    expect(stats.count).toBeGreaterThan(0)
    expect(stats.income).toBeGreaterThan(0)
    expect(stats.expense).toBeGreaterThan(0)
    expect(stats.balance).toBeCloseTo(stats.income - stats.expense)
    expect(stats.categoryExpenses[0].amount).toBeGreaterThanOrEqual(stats.categoryExpenses.at(-1)!.amount)
  })

  it('AES-GCM 往返解密且错误口令无法解锁', async () => {
    const created = await createEncryptionSettings('correct-horse-battery')
    const encrypted = await encryptJson(created.key, { merchant: '敏感商户', amount: 88.5 })
    await expect(decryptJson(created.key, encrypted.iv, encrypted.data)).resolves.toEqual({ merchant: '敏感商户', amount: 88.5 })
    const unlocked = await unlockEncryption('correct-horse-battery', created.settings)
    await expect(decryptJson(unlocked, encrypted.iv, encrypted.data)).resolves.toMatchObject({ amount: 88.5 })
    await expect(unlockEncryption('wrong-password', created.settings)).rejects.toBeTruthy()
  })

  it('演示数据可完成导入去重和批次留痕', async () => {
    const seed = await createDemoTransactions()
    const store = new DemoStore(seed)
    const draft = { ...seed[0], tempId: 'same', fingerprint: 'brand-new-import-fingerprint' }
    const first = await store.saveDrafts([draft], { source: 'csv', fileName: 'demo.csv', totalCount: 1, successCount: 0, failedCount: 0 })
    const second = await store.saveDrafts([draft], { source: 'csv', fileName: 'demo.csv', totalCount: 1, successCount: 0, failedCount: 0 })
    expect(first).toEqual({ saved: 1, duplicates: 0 })
    expect(second).toEqual({ saved: 0, duplicates: 1 })
    const data = await store.load()
    expect(data.batches[0].failedCount).toBe(1)
  })
})
