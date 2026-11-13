import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BarChart3, BookOpenCheck, ChevronDown, CircleUserRound, FileUp, LayoutDashboard, LogOut, Menu, ReceiptText, ShieldCheck, X } from 'lucide-react'
import { AuthScreen, EncryptionGate } from './components/Auth'
import { cloud } from './lib/cloud'
import { createEncryptionSettings, unlockEncryption } from './lib/crypto'
import { createDemoTransactions } from './lib/demo'
import { getLocalSettings, saveLocalSettings } from './lib/localDb'
import { LocalStore } from './lib/localStore'
import { CloudStore, createCloudSettings, DemoStore, getCloudSettings, type BillStore, type StoreData } from './lib/store'
import type { DraftTransaction, ImportBatch, Transaction } from './lib/types'

type Page = 'dashboard' | 'import' | 'transactions' | 'reports' | 'rules'
type Stage = 'loading' | 'auth' | 'gate' | 'ready'

const NAV_ITEMS: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: '财务总览', icon: LayoutDashboard },
  { id: 'import', label: '账单导入', icon: FileUp },
  { id: 'transactions', label: '账单明细', icon: ReceiptText },
  { id: 'reports', label: '智能报表', icon: BarChart3 },
  { id: 'rules', label: '学习规则', icon: BookOpenCheck },
]

const PAGE_TITLES: Record<Page, string> = { dashboard: '财务总览', import: '账单导入', transactions: '账单明细', reports: '智能报表', rules: '学习规则' }
const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })))
const ImportCenter = lazy(() => import('./components/ImportCenter').then(module => ({ default: module.ImportCenter })))
const Transactions = lazy(() => import('./components/Transactions').then(module => ({ default: module.Transactions })))
const Reports = lazy(() => import('./components/Reports').then(module => ({ default: module.Reports })))
const Rules = lazy(() => import('./components/Rules').then(module => ({ default: module.Rules })))
const EMPTY_DATA: StoreData = { transactions: [], rules: [], batches: [], feedback: [] }
const currentMonth = () => new Date().toISOString().slice(0, 7)

export default function App() {
  const [stage, setStage] = useState<Stage>('loading')
  const [page, setPage] = useState<Page>('dashboard')
  const [month, setMonth] = useState(currentMonth)
  const [data, setData] = useState<StoreData>(EMPTY_DATA)
  const [store, setStore] = useState<BillStore>()
  const [mode, setMode] = useState<'cloud' | 'local' | 'demo'>('cloud')
  const [hasSettings, setHasSettings] = useState(false)
  const [userName, setUserName] = useState('')
  const [authError, setAuthError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  const bootStarted = useRef(false)
  const demo = mode === 'demo'
  const localMode = mode === 'local'

  useEffect(() => {
    if (bootStarted.current) return
    bootStarted.current = true
    void boot()
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  function notify(message: string) {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }

  async function boot() {
    setStage('loading')
    setAuthError('')
    try {
      if (localStorage.getItem('bill-insight-mode') === 'local') {
        await enterLocal()
        return
      }
      const url = new URL(location.href)
      const provider = url.searchParams.get('provider')
      if (url.searchParams.has('code') || url.searchParams.has('error')) {
        if (provider === 'workbuddy') {
          const result = await cloud.auth.handleWorkBuddyCallback()
          if (result.error) throw new Error(result.error.message || '登录授权失败')
        } else if (url.searchParams.has('error')) {
          throw new Error(url.searchParams.get('error_description') || '登录未完成，请重试')
        }
        for (const key of ['code', 'state', 'provider', 'error', 'error_description']) url.searchParams.delete(key)
        history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      }
      const { data: session, error } = await cloud.auth.getSession()
      if (error) throw new Error(error.message)
      if (!session) {
        setStage('auth')
        return
      }
      setUserName(session.user.name || '我的账户')
      const settings = await getCloudSettings()
      setHasSettings(Boolean(settings))
      setStage('gate')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '初始化失败，请重试')
      setStage('auth')
    }
  }

  async function enterDemo() {
    const seed = await createDemoTransactions()
    const nextStore = new DemoStore(seed)
    setStore(nextStore)
    setMode('demo')
    setUserName('演示用户')
    setData(await nextStore.load())
    setStage('ready')
    notify('已进入演示模式，数据只保留在当前页面')
  }

  async function enterLocal() {
    try {
      const settings = await getLocalSettings()
      localStorage.setItem('bill-insight-mode', 'local')
      setHasSettings(Boolean(settings))
      setMode('local')
      setUserName('本地账本')
      setStage('gate')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '本地存储不可用')
      setStage('auth')
    }
  }

  async function unlock(password: string) {
    if (demo) return
    let key: CryptoKey
    if (localMode) {
      let settings = await getLocalSettings()
      if (!settings) {
        const created = await createEncryptionSettings(password)
        await saveLocalSettings(created.settings)
        key = created.key
        settings = created.settings
        setHasSettings(true)
      } else {
        key = await unlockEncryption(password, settings)
      }
      const nextStore = await LocalStore.open(key)
      const loaded = await nextStore.load()
      setStore(nextStore)
      setData(loaded)
      setStage('ready')
      notify(`本地保险箱已解锁，共 ${loaded.transactions.length} 条账单`)
      return
    }
    let settings = await getCloudSettings()
    if (!settings) {
      const created = await createEncryptionSettings(password)
      await createCloudSettings(created.settings)
      key = created.key
      settings = created.settings
      setHasSettings(true)
    } else {
      key = await unlockEncryption(password, settings)
    }
    const nextStore = new CloudStore(key)
    const loaded = await nextStore.load()
    setStore(nextStore)
    setData(loaded)
    setStage('ready')
    notify(`保险箱已解锁，共 ${loaded.transactions.length} 条账单`)
  }

  async function exitGate() {
    if (!localMode) await cloud.auth.signOut()
    resetToAuth()
  }

  function resetToAuth() {
    localStorage.removeItem('bill-insight-mode')
    setStore(undefined)
    setData(EMPTY_DATA)
    setMode('cloud')
    setStage('auth')
    setPage('dashboard')
    setMenuOpen(false)
  }

  async function signOut() {
    if (demo || localMode) resetToAuth()
    else {
      try { await cloud.auth.signOut() } finally { resetToAuth() }
    }
  }

  async function refresh() {
    if (!store) return
    setData(await store.load())
  }

  async function saveDrafts(drafts: DraftTransaction[], batch: Omit<ImportBatch, 'id' | 'status' | 'createdAt'>) {
    if (!store) throw new Error('当前会话不可用')
    const result = await store.saveDrafts(drafts, batch)
    await refresh()
    return result
  }

  async function correctCategory(transaction: Transaction, category: string) {
    if (!store) return
    try {
      await store.correctCategory(transaction, category, data.rules)
      await refresh()
      notify(`已改为「${category}」，学习规则已更新，之后的相似账单会优先归入该分类`)
    } catch (error) {
      notify(error instanceof Error ? error.message : '分类修改失败')
      throw error
    }
  }

  async function deleteTransaction(transaction: Transaction) {
    if (!store || !transaction.id) return
    try {
      await store.deleteTransaction(transaction.id)
      await refresh()
      notify('账单已删除')
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败')
    }
  }

  function navigate(next: Page) {
    setPage(next)
    setMenuOpen(false)
    setAccountOpen(false)
  }

  if (stage === 'loading') return <div className="boot-screen"><div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>账单管家</span></div><div className="boot-loader"><i /><i /><i /></div><p>正在安全加载你的财务空间…</p></div>
  if (stage === 'auth') return <AuthScreen onDemo={() => void enterDemo()} onLocal={() => void enterLocal()} error={authError} />
  if (stage === 'gate') return <EncryptionGate hasSettings={hasSettings} onUnlock={unlock} onExit={() => void exitGate()} />

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-top"><div className="brand brand-light"><span className="brand-mark"><i /><i /><i /></span><span>账单管家</span></div><button className="sidebar-close" onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
      <p className="nav-caption">工作空间</p>
      <nav>{NAV_ITEMS.map(item => { const Icon = item.icon; return <button className={page === item.id ? 'active' : ''} key={item.id} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span>{item.id === 'rules' && data.feedback.length > 0 && <em>{data.feedback.length}</em>}</button> })}</nav>
      <div className="sidebar-spacer" />
      <div className="privacy-card"><ShieldCheck /><b>数据已加密</b><p>敏感账单字段以 AES-GCM 密文存储，仅在本机解密。</p><span><i />安全连接</span></div>
      <button className="account-button" onClick={() => setAccountOpen(!accountOpen)}><span className="avatar"><CircleUserRound size={19} /></span><span><b>{userName}</b><small>{demo ? '演示空间' : localMode ? '本地加密空间' : '云端个人空间'}</small></span><ChevronDown size={15} /></button>
      {accountOpen && <div className="account-menu"><button onClick={() => void signOut()}><LogOut size={15} />退出当前空间</button></div>}
    </aside>
    {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="menu-button" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><span className="topbar-page">{PAGE_TITLES[page]}</span><span className="topbar-divider" /><span className="topbar-date">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</span></div><div className="topbar-right"><span className="secure-pill"><ShieldCheck size={14} />本地解密</span>{demo && <span className="demo-pill">演示模式</span>}<button className="top-avatar" onClick={() => setAccountOpen(!accountOpen)}>{userName.slice(0, 1)}</button></div></header>
      {(demo || localMode) && <div className="demo-banner"><span>{demo ? '当前为演示模式：示例数据不会写入云端，刷新后恢复初始状态。' : '本地独立模式：账单密文已保存到本机 data/vault.json，更换端口或重启后仍可解锁。'}</span><button onClick={() => navigate('import')}>试试导入<FileUp size={14} /></button></div>}
      <main className="content">
        <Suspense fallback={<div className="page-loading"><div className="boot-loader"><i /><i /><i /></div><span>正在加载页面…</span></div>}>
          {page === 'dashboard' && <Dashboard transactions={data.transactions} batches={data.batches} feedback={data.feedback} month={month} onMonth={setMonth} onNavigate={id => navigate(id as Page)} onAdd={() => navigate('import')} />}
          {page === 'import' && <ImportCenter rules={data.rules} batches={data.batches} onSave={saveDrafts} />}
          {page === 'transactions' && <Transactions transactions={data.transactions} month={month} onCorrect={correctCategory} onDelete={deleteTransaction} onAdd={() => navigate('import')} />}
          {page === 'reports' && <Reports transactions={data.transactions} month={month} onMonth={setMonth} onToast={notify} />}
          {page === 'rules' && <Rules rules={data.rules} feedback={data.feedback} transactions={data.transactions} />}
        </Suspense>
      </main>
      <footer className="app-footer"><span>账单管家 · 让每一笔都清楚</span><span><ShieldCheck size={13} />AES-GCM 加密 · 仅本人可见</span></footer>
    </div>
    {toast && <div className="toast"><span className="toast-mark">✓</span>{toast}</div>}
  </div>
}
