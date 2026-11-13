import { useState } from 'react'
import { ArrowDownToLine, FileText, Printer, Share2, Sparkles, TrendingUp } from 'lucide-react'
import { DailyBar, ExpenseDonut, TrendBar } from './Charts'
import { getInsights, getMonthlyStats } from '../lib/stats'
import { exportMonthlyReport, exportTransactions } from '../lib/export'
import type { Transaction } from '../lib/types'

const money = (value: number) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function Reports({ transactions, month, onMonth, onToast }: { transactions: Transaction[]; month: string; onMonth: (value: string) => void; onToast: (message: string) => void }) {
  const stats = getMonthlyStats(transactions, month)
  const insights = getInsights(transactions, month)
  const [shareOpen, setShareOpen] = useState(false)
  const topCategories = stats.categoryExpenses.slice(0, 8)
  const savingRate = stats.income > 0 ? stats.balance / stats.income * 100 : 0

  async function shareReport() {
    const text = `${month} 月度账单报告：收入 ${money(stats.income)}，支出 ${money(stats.expense)}，结余 ${money(stats.balance)}。${insights[0]?.title ?? ''}`
    try {
      if (navigator.share) await navigator.share({ title: `账单管家 ${month} 月报`, text })
      else { await navigator.clipboard.writeText(text); onToast('月报摘要已复制到剪贴板') }
      setShareOpen(false)
    } catch {
      onToast('已取消分享')
    }
  }

  return <div className="page reports-page">
    <div className="page-heading"><div><span className="eyebrow">智能月度报表</span><h1>数据不只是数字，<br />也是生活的形状。</h1><p>自动汇总收支、分类与趋势，可导出 Excel 或打印为 PDF。</p></div><div className="heading-actions"><label className="month-picker"><span>报表月份</span><input type="month" value={month} onChange={event => onMonth(event.target.value)} /></label><button className="button button-primary" onClick={() => setShareOpen(true)}><Share2 size={16} />分享月报</button></div></div>

    <section className="report-hero"><div className="report-hero-main"><span className="eyebrow light">MONTHLY REPORT · {month}</span><h2>{stats.count ? <>本月共记录 <em>{stats.count}</em> 笔账单</> : '这个月还没有账单'}</h2><div className="hero-numbers"><div><span>总收入</span><strong>{money(stats.income)}</strong></div><div><span>总支出</span><strong>{money(stats.expense)}</strong></div><div><span>结余</span><strong>{money(stats.balance)}</strong></div></div><div className="report-hero-foot"><span><TrendingUp size={15} />结余率 {stats.income ? `${savingRate.toFixed(1)}%` : '—'}</span><span>自动分类率 {transactions.length ? Math.round(transactions.filter(item => item.categorySource !== 'manual').length / transactions.length * 100) : 0}%</span></div></div><div className="report-actions"><button onClick={() => exportMonthlyReport(transactions, month)}><FileText /><span><b>导出月报</b><small>HTML 可打印为 PDF</small></span></button><button onClick={() => { exportTransactions(transactions, month); onToast('Excel 明细已开始下载') }}><ArrowDownToLine /><span><b>导出明细</b><small>XLSX 格式</small></span></button><button onClick={() => window.print()}><Printer /><span><b>直接打印</b><small>当前页面</small></span></button></div></section>

    <div className="reports-grid">
      <section className="card chart-card large-chart-card"><div className="section-heading"><div><h2>支出分类占比</h2><p>找到本月最大的消费去向</p></div><span className="tag">{topCategories.length} 个分类</span></div><ExpenseDonut stats={stats} large /></section>
      <section className="card analysis-card"><div className="section-heading"><div><h2><Sparkles size={18} />本月关键洞察</h2><p>从数据中提炼可行动建议</p></div></div><div className="analysis-list">{insights.map((item, index) => <div className={`analysis-item tone-${item.tone}`} key={item.title}><i>{index + 1}</i><div><b>{item.title}</b><p>{item.detail}</p></div></div>)}</div><div className="report-note">统计仅基于已入账数据；退款计入收入，重复账单已自动排除。</div></section>
    </div>

    <section className="card chart-card full-chart-card"><div className="section-heading"><div><h2>近六个月支出趋势</h2><p>深色柱为当前选择月份</p></div></div><TrendBar transactions={transactions} month={month} /></section>

    <div className="reports-bottom-grid">
      <section className="card chart-card"><div className="section-heading"><div><h2>每日收支</h2><p>识别消费高峰日期</p></div></div><DailyBar stats={stats} /></section>
      <section className="card category-ranking"><div className="section-heading"><div><h2>分类排行</h2><p>按本月支出从高到低</p></div></div>{topCategories.length ? <div className="ranking-list">{topCategories.map((item, index) => <div className="ranking-row" key={item.category}><b>{String(index + 1).padStart(2, '0')}</b><span>{item.category}</span><div className="ranking-bar"><i style={{ width: `${stats.expense ? item.amount / stats.expense * 100 : 0}%` }} /></div><strong>{money(item.amount)}</strong><small>{stats.expense ? (item.amount / stats.expense * 100).toFixed(1) : 0}%</small></div>)}</div> : <div className="empty-inline">暂无分类数据</div>}</section>
    </div>

    {shareOpen && <div className="modal-backdrop" onClick={() => setShareOpen(false)}><div className="modal" onClick={event => event.stopPropagation()}><span className="eyebrow">分享月报摘要</span><h3>把这份财务小结分享出去</h3><p>仅包含汇总数字与第一条洞察，不包含具体商户和账单明细。</p><div className="share-preview"><b>{month} 月度账单报告</b><span>收入 {money(stats.income)}</span><span>支出 {money(stats.expense)}</span><span>结余 {money(stats.balance)}</span><p>{insights[0]?.title}</p></div><div className="modal-actions"><button className="button button-ghost" onClick={() => setShareOpen(false)}>取消</button><button className="button button-primary" onClick={() => void shareReport()}><Share2 size={15} />确认分享</button></div></div></div>}
  </div>
}
