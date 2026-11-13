import { classifyBill } from './classifier'
import { fingerprintBill } from './crypto'
import type { Transaction } from './types'

const rows = [
  [0, 2, '工资', 'income', 12800, '某科技有限公司', '十一月工资'],
  [0, 3, '餐饮', 'expense', 38.5, '瑞幸咖啡', '生椰拿铁'],
  [0, 3, '交通', 'expense', 24.8, '滴滴出行', '晚间打车'],
  [0, 4, '餐饮', 'expense', 86, '海底捞火锅', '朋友聚餐'],
  [0, 5, '购物', 'expense', 329, '京东商城', '机械键盘'],
  [0, 6, '居住', 'expense', 2600, '安心公寓', '十一月房租'],
  [0, 7, '交通', 'expense', 126, '中石化加油站', '车辆加油'],
  [0, 8, '娱乐', 'expense', 45, '万达电影', '周末观影'],
  [0, 9, '餐饮', 'expense', 52.6, '美团外卖', '晚餐'],
  [0, 10, '医疗', 'expense', 89.9, '老百姓大药房', '常用药品'],
  [0, 11, '通讯', 'expense', 100, '中国移动', '手机话费'],
  [0, 12, '教育', 'expense', 199, '得到课程', '产品设计课'],
  [0, 13, '餐饮', 'expense', 24, '麦当劳', '早餐'],
  [0, 14, '退款', 'income', 79.9, '淘宝退款', '订单退款'],
  [-1, 2, '工资', 'income', 12800, '某科技有限公司', '上月工资'],
  [-1, 5, '居住', 'expense', 2600, '安心公寓', '上月房租'],
  [-1, 8, '餐饮', 'expense', 638, '餐饮商户', '上月餐饮汇总'],
  [-1, 12, '交通', 'expense', 412, '公共交通', '上月交通汇总'],
  [-1, 18, '购物', 'expense', 780, '京东商城', '上月购物汇总'],
  [-1, 22, '娱乐', 'expense', 230, '哔哩哔哩', '会员与娱乐'],
] as const

export async function createDemoTransactions(): Promise<Transaction[]> {
  const now = new Date()
  return Promise.all(rows.map(async ([monthOffset, day, _category, direction, amount, merchant, note]) => {
    const date = new Date(now.getFullYear(), now.getMonth() + monthOffset, Math.min(day, 28))
    const occurredOn = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const auto = classifyBill(`${merchant} ${note}`, direction)
    return {
      id: Math.floor(Math.random() * 100000),
      occurredOn,
      direction,
      amount,
      merchant,
      note,
      category: auto.category,
      originalCategory: auto.category,
      categorySource: auto.source,
      confidence: auto.confidence,
      source: 'demo',
      corrected: false,
      fingerprint: await fingerprintBill(occurredOn, direction, amount, merchant),
      createdAt: new Date().toISOString(),
    }
  }))
}
