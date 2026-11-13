import * as XLSX from 'xlsx'
import { getInsights, getMonthlyStats } from './stats'
import type { Transaction } from './types'

export function exportTransactions(transactions: Transaction[], month: string) {
  const rows = transactions.filter(item => item.occurredOn.startsWith(month)).map(item => ({
    交易日期: item.occurredOn,
    收支: item.direction === 'income' ? '收入' : '支出',
    分类: item.category,
    金额: item.amount,
    交易对方: item.merchant,
    备注: item.note,
    来源: item.source,
    分类方式: item.categorySource === 'manual' ? '人工修正' : item.categorySource === 'rule' ? '学习规则' : '内置规则',
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 30 }, { wch: 10 }, { wch: 12 }]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '账单明细')
  XLSX.writeFile(book, `账单管家-${month}-明细.xlsx`)
}

export function exportMonthlyReport(transactions: Transaction[], month: string) {
  const stats = getMonthlyStats(transactions, month)
  const insights = getInsights(transactions, month)
  const rows = transactions.filter(item => item.occurredOn.startsWith(month)).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>账单管家 ${month} 月度报表</title><style>body{font-family:system-ui,"Microsoft YaHei";max-width:960px;margin:40px auto;color:#173f35;padding:0 24px}h1{font-size:32px}small{color:#71817b}.cards{display:flex;gap:16px;margin:28px 0}.card{background:#f1f5ef;border-radius:14px;padding:20px;flex:1}.card b{display:block;font-size:24px;margin-top:8px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;border-bottom:1px solid #e0e7df;padding:10px;font-size:13px}th{background:#f4f6f2}.insight{padding:12px 16px;border-left:3px solid #7a9f49;background:#f7f9f5;margin:8px 0}.bar{height:8px;background:#dfe8d7;border-radius:8px;overflow:hidden}.bar i{display:block;height:100%;background:#dc795f}@media print{body{margin:0}.no-print{display:none}}</style></head><body><small>账单管家 · 自动生成于 ${new Date().toLocaleString('zh-CN')}</small><h1>${month} 月度财务报告</h1><div class="cards"><div class="card">收入<b>¥${stats.income.toFixed(2)}</b></div><div class="card">支出<b>¥${stats.expense.toFixed(2)}</b></div><div class="card">结余<b>¥${stats.balance.toFixed(2)}</b></div></div><h2>消费洞察</h2>${insights.map(item => `<div class="insight"><b>${escape(item.title)}</b><br>${escape(item.detail)}</div>`).join('')}<h2>支出构成</h2><table><tr><th>分类</th><th>金额</th><th>占比</th></tr>${stats.categoryExpenses.map(item => `<tr><td>${escape(item.category)}</td><td>¥${item.amount.toFixed(2)}</td><td><div class="bar"><i style="width:${stats.expense ? item.amount / stats.expense * 100 : 0}%"></i></div>${stats.expense ? (item.amount / stats.expense * 100).toFixed(1) : 0}%</td></tr>`).join('')}</table><h2>账单明细（${rows.length} 笔）</h2><table><tr><th>日期</th><th>商户</th><th>分类</th><th>收支</th><th>金额</th></tr>${rows.map(item => `<tr><td>${item.occurredOn}</td><td>${escape(item.merchant)}</td><td>${escape(item.category)}</td><td>${item.direction === 'income' ? '收入' : '支出'}</td><td>¥${item.amount.toFixed(2)}</td></tr>`).join('')}</table><p class="no-print">提示：可使用浏览器“打印 → 另存为 PDF”。</p><script>if(new URLSearchParams(location.search).has('print'))print()<\/script></body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `账单管家-${month}-月度报告.html`
  link.click()
  URL.revokeObjectURL(url)
}
