import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import type { MonthlyStats } from '../lib/types'

ChartJS.register(ArcElement, BarElement, CategoryScale, Legend, LinearScale, Tooltip)

const COLORS = ['#173f35', '#769b56', '#d8e78d', '#df866b', '#e8b45b', '#7a9da0', '#b5a2c7', '#9cb8a1', '#d2a397', '#bdc4b8', '#e3ddd0']
const INCOME_COLORS = ['#2f5d7c', '#6f9d7a', '#e0c46a', '#c98b6d', '#8fa7b8', '#a9bd8f', '#d5b3a1', '#7f8f9c', '#c3d0a8', '#b6a9c6', '#dfd9c9']

export function CategoryDonut({ stats, direction = 'expense', large = false }: { stats: MonthlyStats; direction?: 'expense' | 'income'; large?: boolean }) {
  const isIncome = direction === 'income'
  const data = (isIncome ? stats.categoryIncomes : stats.categoryExpenses).slice(0, 8)
  const total = isIncome ? stats.income : stats.expense
  return <div className={large ? 'chart chart-large' : 'chart'}>
    {data.length ? <Doughnut data={{ labels: data.map(item => item.category), datasets: [{ data: data.map(item => item.amount), backgroundColor: isIncome ? INCOME_COLORS : COLORS, borderWidth: 0, hoverOffset: 6 }] }} options={{ maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, padding: 14, color: '#63736d', font: { size: 12 } } }, tooltip: { callbacks: { label: context => ` ${context.label}  ¥${Number(context.raw).toFixed(2)}` } } } }} /> : <EmptyChart text={isIncome ? '本月还没有收入账单' : '导入账单后生成可视化'} />}
    {data.length > 0 && <div className="donut-center"><strong>¥{total.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</strong><span>{isIncome ? '总收入' : '总支出'}</span></div>}
  </div>
}

export function ExpenseDonut({ stats, large = false }: { stats: MonthlyStats; large?: boolean }) {
  return <CategoryDonut stats={stats} direction="expense" large={large} />
}

export function IncomeDonut({ stats, large = false }: { stats: MonthlyStats; large?: boolean }) {
  return <CategoryDonut stats={stats} direction="income" large={large} />
}

export function DailyBar({ stats }: { stats: MonthlyStats }) {
  return <div className="chart chart-bar">{stats.daily.length ? <Bar data={{ labels: stats.daily.map(item => `${Number(item.day)}日`), datasets: [{ label: '支出', data: stats.daily.map(item => item.expense), backgroundColor: '#df866b', borderRadius: 5, barPercentage: 0.65 }, { label: '收入', data: stats.daily.map(item => item.income), backgroundColor: '#72975a', borderRadius: 5, barPercentage: 0.65 }] }} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, color: '#63736d' } }, tooltip: { callbacks: { label: context => ` ${context.dataset.label} ¥${Number(context.raw).toFixed(2)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8a9691', maxTicksLimit: 12 } }, y: { border: { display: false }, grid: { color: '#edf0e9' }, ticks: { color: '#8a9691', callback: value => `¥${value}` } } } }} /> : <EmptyChart />}</div>
}

export function TrendBar({ transactions, month }: { transactions: import('../lib/types').Transaction[]; month: string }) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${month}-01T00:00:00`)
    date.setMonth(date.getMonth() - 5 + index)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
  const values = months.map(key => transactions.filter(item => item.occurredOn.startsWith(key)).reduce((sum, item) => sum + (item.direction === 'expense' ? item.amount : 0), 0))
  return <div className="chart chart-large"><Bar data={{ labels: months.map(item => `${Number(item.slice(5))}月`), datasets: [{ label: '月支出', data: values, backgroundColor: values.map((_, index) => index === 5 ? '#df866b' : '#cbd9bd'), borderRadius: 8, maxBarThickness: 42 }] }} options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => ` 支出 ¥${Number(context.raw).toFixed(2)}` } } }, scales: { x: { grid: { display: false } }, y: { border: { display: false }, grid: { color: '#edf0e9' }, ticks: { callback: value => `¥${value}` } } } }} /></div>
}

function EmptyChart({ text = '导入账单后生成可视化' }: { text?: string }) {
  return <div className="empty-chart">{text}</div>
}
