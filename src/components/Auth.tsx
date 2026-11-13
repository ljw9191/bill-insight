import { useState } from 'react'
import { ArrowRight, Check, FileSpreadsheet, HardDrive, LockKeyhole, ScanLine, ShieldCheck, Sparkles } from 'lucide-react'
import { cloud } from '../lib/cloud'

export function AuthScreen({ onDemo, onLocal, error: externalError }: { onDemo: () => void; onLocal: () => void; error?: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(externalError)

  async function login() {
    setLoading(true)
    setError(undefined)
    const back = new URL(location.href)
    back.pathname = '/'
    for (const key of ['code', 'state', 'provider']) back.searchParams.delete(key)
    const { data, error } = await cloud.auth.signInWithOAuth({ provider: 'workbuddy', redirectTo: back.toString() })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      location.assign(data.url)
    }
  }

  return <main className="auth-page">
    <section className="auth-brand">
      <div className="brand brand-light"><span className="brand-mark"><i /><i /><i /></span><span>账单管家</span></div>
      <div className="auth-hero-copy">
        <span className="eyebrow light">BILL INSIGHT · 智能财务管理</span>
        <h1>让每一笔，<br />都成为更好的决定。</h1>
        <p>把散落的账单变成清晰的财务全貌。<br />从采集到反馈，每一步都安全、透明、可追踪。</p>
      </div>
      <div className="auth-features">
        <div><ScanLine /><span><b>多源采集</b><small>OCR · CSV · Excel</small></span></div>
        <div><Sparkles /><span><b>越用越懂你</b><small>修正反哺分类规则</small></span></div>
        <div><ShieldCheck /><span><b>端到端保护</b><small>AES-GCM 加密存储</small></span></div>
      </div>
      <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" />
    </section>
    <section className="auth-panel">
      <div className="auth-form-wrap">
        <div className="auth-mobile-logo"><FileSpreadsheet /></div>
        <span className="eyebrow">欢迎回来</span>
        <h2>你的财务全貌，<br />从这里开始。</h2>
        <p className="muted">登录后数据仅本人可见，刷新也不会丢失。</p>
        <button className="button button-primary button-full auth-login" onClick={login} disabled={loading}>{loading ? '正在前往授权…' : '使用 WorkBuddy 登录'}<ArrowRight size={18} /></button>
        {(error || externalError) && <div className="form-error">{error || externalError}</div>}
        <div className="auth-divider"><span>或</span></div>
        <button className="button button-local button-full" onClick={onLocal}><HardDrive size={16} />本地独立模式</button>
        <p className="demo-note local-note">数据加密保存在本机项目文件，无需账号，重启或换端口仍可恢复。</p>
        <button className="demo-entry" onClick={onDemo}>快速体验演示数据 <ArrowRight size={13} /></button>
        <div className="auth-security"><LockKeyhole size={15} /><span>敏感字段在浏览器加密后才写入云端<br />账号隔离 · 传输加密 · 本地 OCR</span></div>
      </div>
      <footer className="auth-footer"><span><Check size={13} />无需安装</span><span><Check size={13} />数据可导出</span><span><Check size={13} />随时退出</span></footer>
    </section>
  </main>
}

export function EncryptionGate({ hasSettings, onUnlock, onExit, demo = false }: { hasSettings: boolean; onUnlock: (password: string) => Promise<void>; onExit: () => void; demo?: boolean }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password.length < 8) return setError('加密口令至少需要 8 位')
    if (!hasSettings && password !== confirm) return setError('两次输入的口令不一致')
    setLoading(true)
    setError('')
    try { await onUnlock(password) } catch { setError('口令不正确或加密设置不可用，请重试') } finally { setLoading(false) }
  }

  return <main className="unlock-page"><form className="unlock-card" onSubmit={submit}>
    <div className="unlock-icon"><LockKeyhole /></div>
    <span className="eyebrow">本地加密保险箱</span>
    <h2>{demo ? '设置演示口令' : hasSettings ? '解锁你的账单' : '首次使用，设置加密口令'}</h2>
    <p>{hasSettings ? '输入口令后，账单才会在浏览器中解密。' : '口令不会上传。忘记口令将无法恢复已加密数据，请妥善保管。'}</p>
    <label className="field"><span>加密口令</span><input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="至少 8 位" autoComplete={hasSettings ? 'current-password' : 'new-password'} /></label>
    {!hasSettings && <label className="field"><span>确认口令</span><input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="再次输入" autoComplete="new-password" /></label>}
    {error && <div className="form-error">{error}</div>}
    <button className="button button-primary button-full" disabled={loading}>{loading ? '正在安全解锁…' : hasSettings ? '解锁并进入' : '创建保险箱并进入'}<ArrowRight size={17} /></button>
    <button type="button" className="text-button" onClick={onExit}>返回登录页</button>
  </form></main>
}
