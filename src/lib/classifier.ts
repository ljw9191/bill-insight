import type { CategoryRule, Direction } from './types'

export const EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '居住', '医疗', '教育', '娱乐', '通讯', '旅行', '人情', '其他支出']
export const INCOME_CATEGORIES = ['工资', '奖金', '退款', '投资', '转账', '其他收入']

interface SystemRule {
  category: string
  direction: Direction
  keywords: string[]
}

const SYSTEM_RULES: SystemRule[] = [
  { category: '餐饮', direction: 'expense', keywords: ['餐饮', '美食', '咖啡', '奶茶', '肯德基', '麦当劳', '星巴克', '瑞幸', '美团外卖', '美团', '饿了么', '餐厅', '火锅', '食堂', '早餐', '午餐', '晚餐', '超市', '便利店', '零食'] },
  { category: '交通', direction: 'expense', keywords: ['滴滴', '出租车', '网约车', '打车', '高德', '地铁', '公交', '高铁', '火车票', '12306', '加油', '停车', '共享单车', '哈啰', '航空', '机票'] },
  { category: '购物', direction: 'expense', keywords: ['淘宝', '天猫', '京东', '拼多多', '抖音商城', '购物', '服装', '数码', '百货', '商场', '订单'] },
  { category: '居住', direction: 'expense', keywords: ['房租', '租金', '物业', '水费', '电费', '燃气', '供暖', '家政', '贝壳'] },
  { category: '医疗', direction: 'expense', keywords: ['医院', '药房', '医药', '挂号', '门诊', '体检', '牙科'] },
  { category: '教育', direction: 'expense', keywords: ['学费', '培训', '课程', '考试', '图书', '书店', '教育'] },
  { category: '娱乐', direction: 'expense', keywords: ['电影', '游戏', '音乐', '视频', '会员', '演出', '健身', '娱乐', '爱奇艺', '哔哩哔哩'] },
  { category: '通讯', direction: 'expense', keywords: ['话费', '流量', '宽带', '中国移动', '中国联通', '中国电信', '街电', '充电桩', '充电宝'] },
  { category: '旅行', direction: 'expense', keywords: ['酒店', '民宿', '旅游', '携程', '飞猪', '去哪儿', '景区'] },
  { category: '人情', direction: 'expense', keywords: ['红包', '礼金', '礼物', '捐款', '亲友'] },
  { category: '工资', direction: 'income', keywords: ['工资', '薪资', '薪水', '代发工资', '劳务费'] },
  { category: '奖金', direction: 'income', keywords: ['奖金', '年终奖', '绩效', '补贴', '报销'] },
  { category: '退款', direction: 'income', keywords: ['退款', '退货', '退费'] },
  { category: '投资', direction: 'income', keywords: ['利息', '分红', '理财', '基金', '股票', '收益'] },
  { category: '转账', direction: 'income', keywords: ['转账', '转入', '收款'] },
]

export function classifyBill(text: string, direction: Direction, userRules: CategoryRule[] = []) {
  const normalized = text.toLowerCase().replace(/\s+/g, '')
  const matchedUserRules = userRules
    .filter(rule => rule.direction === direction && normalized.includes(rule.keyword.toLowerCase().replace(/\s+/g, '')))
    .sort((a, b) => (b.weight + b.keyword.length * 2 + Math.log2(b.hitCount + 1)) - (a.weight + a.keyword.length * 2 + Math.log2(a.hitCount + 1)))

  if (matchedUserRules[0]) {
    return { category: matchedUserRules[0].category, confidence: 0.99, source: 'rule' as const, ruleId: matchedUserRules[0].id }
  }

  let best: { category: string; score: number } | undefined
  for (const rule of SYSTEM_RULES) {
    if (rule.direction !== direction) continue
    const hits = rule.keywords.filter(keyword => normalized.includes(keyword.toLowerCase()))
    const score = hits.reduce((sum, keyword) => sum + 10 + keyword.length, 0)
    if (score > (best?.score ?? 0)) best = { category: rule.category, score }
  }
  if (best) return { category: best.category, confidence: Math.min(0.95, 0.72 + best.score / 100), source: 'auto' as const }
  return { category: direction === 'income' ? '其他收入' : '其他支出', confidence: 0.3, source: 'auto' as const }
}

export function extractLearningKeyword(merchant: string, note = '') {
  const cleaned = merchant
    .replace(/扫码支付|在线支付|快捷支付|消费|付款|收款|交易对方|商户全称|商户名称/g, '')
    .replace(/[：:，,。；;（）()\s]/g, '')
    .trim()
  const candidate = cleaned.length >= 2 ? cleaned : note.trim()
  return candidate.slice(0, 24)
}

export function categoriesFor(direction: Direction) {
  return direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}
