import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, ReceiptText, Sparkles, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { CategoryDonut, DailyBar } from './Charts'
import { getInsights, getMonthlyStats } from '../lib/stats'
import type { FeedbackEvent, ImportBatch, Transaction } from '../lib/types'

interface Props {
  transactions: Transaction[]
  batches: ImportBatch[]
  feedback: FeedbackEvent[]
  month: string
  onMonth: (month: string) => void
  onNavigate: (page: string) => void
  onAdd: () => void
}

const money = (value: number) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function Dashboard({ transactions, batches, feedback, month, onMonth, onNavigate, onAdd }: Props) {
  const [chartDirection, setChartDirection] = useState<'expense' | 'income'>('expense')
  const stats = getMonthlyStats(transactions, month)
  const recent = transactions.filter(item => item.occurredOn.startsWith(month)).slice(0, 6)
  const insights = getInsights(transactions, month)
  const savingRate = stats.income > 0 ? Math.max(-100, Math.min(100, stats.balance / stats.income * 100)) : 0
  const autoCount = transactions.filter(item => item.categorySource !== 'manual').length
  const autoRate = transactions.length ? Math.round(autoCount / transactions.length * 100) : 0
  const previous = new Date(`${month}-01T00:00:00`)
  previous.setMonth(previous.getMonth() - 1)
  const prevKey = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
  const prevStats = getMonthlyStats(transactions, prevKey)
  const expenseChange = prevStats.expense ? (stats.expense - prevStats.expense) / prevStats.expense * 100 : 0

  return <div className="page dashboard-page">
    <div className="page-heading dashboard-heading"><div><span className="eyebrow">财务总览 · {month.replace('-', ' 年 ')} 月</span><h1>每一笔，都在构成你的生活。</h1><p>本月已记录 {stats.count} 笔账单，数据更新于刚刚。</p></div><div className="heading-actions"><label className="month-picker"><span>账单月份</span><input type="month" value={month} onChange={event => onMonth(event.target.value)} /></label><button className="button button-primary" onClick={onAdd}><ReceiptText size={17} />记一笔</button></div></div>

    <section className="metrics-grid">
      <article className="metric-card metric-expense"><span className="metric-icon"><TrendingDown /></span><div className="metric-label">本月支出 <span className={`change ${expenseChange > 0 ? 'up' : 'down'}`}>{prevStats.expense ? <>{expenseChange > 0 ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}{Math.abs(expenseChange).toFixed(1)}%</> : '上月暂无'}</span></div><strong>{money(stats.expense)}</strong><small>较上月{expenseChange > 0 ? '增加' : '减少'} {money(Math.abs(stats.expense - prevStats.expense))}</small></article>
      <article className="metric-card metric-income"><span className="metric-icon"><TrendingUp /></span><div className="metric-label">本月收入</div><strong>{money(stats.income)}</strong><small>{stats.income ? '收入结构见智能报表' : '尚未导入收入账单'}</small></article>
      <article className="metric-card metric-balance"><span className="metric-icon"><Wallet /></span><div className="metric-label">本月结余</div><strong className={stats.balance < 0 ? 'negative' : ''}>{money(stats.balance)}</strong><small>{stats.balance >= 0 ? '保持得不错，继续记录' : '支出已超过本月收入'}</small></article>
      <article className="metric-card metric-save"><span className="metric-icon"><Target /></span><div className="metric-label">结余率</div><strong>{stats.income ? `${savingRate.toFixed(1)}%` : '—'}</strong><div className="mini-progress"><i style={{ width: `${Math.max(0, savingRate)}%` }} /></div></article>
    </section>

    <div className="dashboard-main-grid">
      <section className="card chart-card"><div className="section-heading"><div><h2>{chartDirection === 'expense' ? '支出去了哪里' : '收入从哪里来'}</h2><p>{chartDirection === 'expense' ? '按分类统计本月支出' : '按分类统计本月收入构成'}</p></div><div className="heading-tools"><div className="chart-tabs" role="tablist" aria-label="收支分类切换"><button role="tab" aria-selected={chartDirection === 'expense'} className={chartDirection === 'expense' ? 'active' : ''} onClick={() => setChartDirection('expense')}>支出</button><button role="tab" aria-selected={chartDirection === 'income'} className={chartDirection === 'income' ? 'active' : ''} onClick={() => setChartDirection('income')}>收入</button></div><button className="text-link" onClick={() => onNavigate('reports')}>查看报表<ChevronRight size={15} /></button></div></div><CategoryDonut stats={stats} direction={chartDirection} /></section>
      <section className="card chart-card"><div className="section-heading"><div><h2>每日收支节奏</h2><p>看见消费高峰，提前做好安排</p></div><span className="legend"><i className="expense-dot" />支出<i className="income-dot" />收入</span></div><DailyBar stats={stats} /></section>
    </div>

    <div className="dashboard-bottom-grid">
      <section className="card insights-card"><div className="section-heading"><div><h2><Sparkles size={18} />本月财务洞察</h2><p>基于你的账单自动生成，不构成投资建议</p></div></div><div className="insight-list">{insights.map((item, index) => <div className={`insight-item ${item.tone}`} key={item.title}><i>0{index + 1}</i><div><b>{item.title}</b><p>{item.detail}</p></div></div>)}</div></section>
      <section className="card recent-card"><div className="section-heading"><div><h2>最近账单</h2><p>本月最新 {recent.length} 笔</p></div><button className="text-link" onClick={() => onNavigate('transactions')}>全部明细<ChevronRight size={15} /></button></div>{recent.length ? <div className="recent-list">{recent.map(item => <div className="recent-row" key={item.id}><span className={`merchant-avatar avatar-${item.category.length % 5}`}>{item.merchant.slice(0, 1)}</span><div className="recent-merchant"><b>{item.merchant}</b><small>{item.occurredOn.slice(5).replace('-', '月')}日 · {item.category}{item.categorySource === 'rule' && <em>已学习</em>}</small></div><strong className={item.direction === 'income' ? 'income-text' : ''}>{item.direction === 'income' ? '+' : '-'}{money(item.amount)}</strong></div>)}</div> : <div className="empty-inline"><ReceiptText />本月还没有账单，导入或手动记一笔。</div>}<button className="button button-soft button-full" onClick={onAdd}>继续添加账单</button></section>
    </div>

    <section className="card pipeline-card"><div className="section-heading"><div><span className="eyebrow">业务闭环</span><h2>从原始账单到可执行洞察</h2></div><span className="tag live"><i />流程运行中</span></div><div className="pipeline-steps"><button onClick={() => onNavigate('import')}><i>01</i><span><b>多源采集</b><small>{batches.length} 个导入批次</small></span></button><div className="pipeline-line" /><button onClick={() => onNavigate('reports')}><i>02</i><span><b>智能解析</b><small>{autoRate}% 自动分类</small></span></button><div className="pipeline-line" /><button onClick={() => onNavigate('transactions')}><i>03</i><span><b>人工校正</b><small>{transactions.filter(item => item.corrected).length} 条已修正</small></span></button><div className="pipeline-line" /><button onClick={() => onNavigate('reports')}><i>04</i><span><b>统计洞察</b><small>实时月报</small></span></button><div className="pipeline-line" /><button onClick={() => onNavigate('rules')}><i>05</i><span><b>规则反哺</b><small>{feedback.length} 次反馈</small></span></button></div></section>
  </div>
}
