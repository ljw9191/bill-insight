import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Download, Search, SlidersHorizontal, Trash2, WandSparkles } from 'lucide-react'
import { categoriesFor } from '../lib/classifier'
import { exportTransactions } from '../lib/export'
import type { Transaction } from '../lib/types'

interface Props {
  transactions: Transaction[]
  month: string
  onCorrect: (transaction: Transaction, category: string) => Promise<void>
  onDelete: (transaction: Transaction) => Promise<void>
  onAdd: () => void
}

const money = (value: number) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function Transactions({ transactions, month, onCorrect, onDelete, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [direction, setDirection] = useState('all')
  const [category, setCategory] = useState('all')
  const [scope, setScope] = useState<'month' | 'all'>('month')
  const [busyId, setBusyId] = useState<number>()
  const [page, setPage] = useState(1)
  const pageSize = 12

  const filtered = useMemo(() => transactions.filter(item => {
    if (scope === 'month' && !item.occurredOn.startsWith(month)) return false
    if (direction !== 'all' && item.direction !== direction) return false
    if (category !== 'all' && item.category !== category) return false
    if (query && !`${item.merchant} ${item.note} ${item.category}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [transactions, month, scope, direction, category, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const categories = [...new Set([...categoriesFor('expense'), ...categoriesFor('income'), ...transactions.map(item => item.category)])]

  async function correct(transaction: Transaction, nextCategory: string) {
    if (nextCategory === transaction.category || !transaction.id) return
    setBusyId(transaction.id)
    try { await onCorrect(transaction, nextCategory) } finally { setBusyId(undefined) }
  }

  return <div className="page transactions-page">
    <div className="page-heading"><div><span className="eyebrow">账单明细</span><h1>每一笔，都有据可查。</h1><p>修改分类会立即生成学习规则，并在下一条相似账单中生效。</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => exportTransactions(filtered, month)}><Download size={16} />导出当前结果</button><button className="button button-primary" onClick={onAdd}>记一笔</button></div></div>
    <section className="card filter-card"><div className="search-box"><Search size={17} /><input value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder="搜索商户、分类或备注" /></div><div className="filter-group"><SlidersHorizontal size={16} /><select value={direction} onChange={event => { setDirection(event.target.value); setPage(1) }}><option value="all">全部收支</option><option value="expense">仅支出</option><option value="income">仅收入</option></select><select value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}><option value="all">全部分类</option>{categories.map(item => <option key={item}>{item}</option>)}</select><select value={scope} onChange={event => { setScope(event.target.value as 'month' | 'all'); setPage(1) }}><option value="month">本月</option><option value="all">全部时间</option></select></div><span className="filter-count">{filtered.length} 笔</span></section>

    <section className="card transactions-table-card">
      <div className="table-wrap"><table className="transactions-table"><thead><tr><th>交易日期</th><th>交易对方 / 备注</th><th>来源</th><th>收支</th><th className="align-right">金额</th><th>分类</th><th>学习状态</th><th /></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={busyId === item.id ? 'row-busy' : ''}><td className="date-cell">{item.occurredOn}</td><td><b>{item.merchant}</b><small className="table-sub">{item.note || '无备注'}</small></td><td><span className={`source-chip source-${item.source}`}>{sourceLabel(item.source)}</span></td><td><span className={`direction-chip ${item.direction}`}>{item.direction === 'income' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}{item.direction === 'income' ? '收入' : '支出'}</span></td><td className={`align-right amount ${item.direction === 'income' ? 'income-text' : ''}`}>{item.direction === 'income' ? '+' : '-'}{money(item.amount)}</td><td><select className="category-inline" value={item.category} disabled={busyId === item.id} onChange={event => void correct(item, event.target.value)}>{categoriesFor(item.direction).includes(item.category) ? null : <option>{item.category}</option>}{categoriesFor(item.direction).map(value => <option key={value}>{value}</option>)}</select></td><td>{item.categorySource === 'manual' ? <span className="learn-state corrected"><WandSparkles size={13} />已反哺</span> : item.categorySource === 'rule' ? <span className="learn-state learned">规则命中</span> : <span className="learn-state auto">自动分类</span>}</td><td>{item.id && <button className="icon-button danger" title="删除账单" onClick={() => { if (window.confirm(`确定删除“${item.merchant}”这笔账单吗？该操作不可恢复。`)) void onDelete(item) }}><Trash2 size={15} /></button>}</td></tr>)}</tbody></table></div>
      {!visible.length && <div className="empty-state"><Search /><h3>没有匹配的账单</h3><p>换个筛选条件，或导入新的账单文件。</p></div>}
      {filtered.length > 0 && <div className="pagination"><span>第 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} 条，共 {filtered.length} 条</span><div><button className="button button-ghost button-small" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</button><b>{page} / {totalPages}</b><button className="button button-ghost button-small" disabled={page === totalPages} onClick={() => setPage(page + 1)}>下一页</button></div></div>}
    </section>
    <p className="table-note">支出与收入的分类相互独立。修改后，规则会以商户关键词为特征参与后续匹配。</p>
  </div>
}

function sourceLabel(source: string) {
  return ({ csv: 'CSV', excel: 'Excel', ocr: 'OCR', manual: '手动', demo: '演示' } as Record<string, string>)[source] ?? source
}
