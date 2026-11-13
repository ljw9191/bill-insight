import type { MonthlyStats, Transaction } from './types'

export function getMonthlyStats(transactions: Transaction[], month: string): MonthlyStats {
  const rows = transactions.filter(item => item.occurredOn.startsWith(month))
  const income = rows.filter(item => item.direction === 'income').reduce((sum, item) => sum + item.amount, 0)
  const expense = rows.filter(item => item.direction === 'expense').reduce((sum, item) => sum + item.amount, 0)
  const categoryMap = new Map<string, number>()
  const dailyMap = new Map<string, { income: number; expense: number }>()

  for (const item of rows) {
    if (item.direction === 'expense') categoryMap.set(item.category, (categoryMap.get(item.category) ?? 0) + item.amount)
    const day = item.occurredOn.slice(8, 10)
    const current = dailyMap.get(day) ?? { income: 0, expense: 0 }
    current[item.direction] += item.amount
    dailyMap.set(day, current)
  }

  return {
    income,
    expense,
    balance: income - expense,
    count: rows.length,
    categoryExpenses: [...categoryMap.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    daily: [...dailyMap.entries()].map(([day, values]) => ({ day, ...values })).sort((a, b) => a.day.localeCompare(b.day)),
  }
}

export function getInsights(transactions: Transaction[], month: string) {
  const stats = getMonthlyStats(transactions, month)
  const insights: { title: string; detail: string; tone: 'good' | 'warn' | 'info' }[] = []
  if (!stats.count) return [{ title: '从第一笔账单开始', detail: '导入 CSV、Excel 或截图后，这里会生成可执行的消费建议。', tone: 'info' }]

  const savingRate = stats.income > 0 ? (stats.balance / stats.income) * 100 : 0
  insights.push(stats.balance >= 0
    ? { title: `本月结余率 ${savingRate.toFixed(1)}%`, detail: stats.income > 0 ? `本月结余 ¥${stats.balance.toFixed(2)}，保持当前节奏。` : '当前支出小于收入。', tone: 'good' }
    : { title: '本月支出超过收入', detail: `收支缺口 ¥${Math.abs(stats.balance).toFixed(2)}，建议优先检查大额支出。`, tone: 'warn' })

  const top = stats.categoryExpenses[0]
  if (top && stats.expense > 0) insights.push({ title: `${top.category}是最大支出项`, detail: `支出 ¥${top.amount.toFixed(2)}，占总支出的 ${(top.amount / stats.expense * 100).toFixed(1)}%。`, tone: 'info' })

  const previousMonth = new Date(`${month}-01T00:00:00`)
  previousMonth.setMonth(previousMonth.getMonth() - 1)
  const previousKey = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`
  const previous = getMonthlyStats(transactions, previousKey)
  if (previous.expense > 0) {
    const change = (stats.expense - previous.expense) / previous.expense * 100
    insights.push({ title: `支出环比${change >= 0 ? '上升' : '下降'} ${Math.abs(change).toFixed(1)}%`, detail: change > 20 ? '涨幅较明显，建议查看下方大额账单。' : '与上月相比，支出节奏总体可控。', tone: change > 20 ? 'warn' : 'good' })
  }
  return insights.slice(0, 3)
}
