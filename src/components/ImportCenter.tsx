import { useRef, useState } from 'react'
import { AlertCircle, ArrowDownToLine, Bot, Check, ChevronRight, FileImage, FileSpreadsheet, FileText, LoaderCircle, Plus, ScanLine, Sparkles, UploadCloud, X } from 'lucide-react'
import { categoriesFor } from '../lib/classifier'
import { fingerprintBill } from '../lib/crypto'
import { createDraft, parseBillFile, parseOcrText, recognizeScreenshot } from '../lib/parser'
import type { CategoryRule, DraftTransaction, ImportBatch, SaveResult } from '../lib/types'
import type { BillSource } from '../lib/types'

interface Props {
  rules: CategoryRule[]
  batches: ImportBatch[]
  onSave: (drafts: DraftTransaction[], batch: Omit<ImportBatch, 'id' | 'status' | 'createdAt'>) => Promise<SaveResult>
}

type Tab = 'file' | 'ocr' | 'manual'

export function ImportCenter({ rules, batches, onSave }: Props) {
  const [tab, setTab] = useState<Tab>('file')
  const [drafts, setDrafts] = useState<DraftTransaction[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [sourceName, setSourceName] = useState('')
  const [source, setSource] = useState<BillSource>('csv')
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [ocrImage, setOcrImage] = useState('')
  const [ocrStatus, setOcrStatus] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const ocrInput = useRef<HTMLInputElement>(null)

  function acceptResult(result: { drafts: DraftTransaction[]; errors: string[]; totalRows: number }, name: string, billSource: BillSource) {
    setDrafts(result.drafts)
    setErrors(result.errors)
    setTotalRows(result.totalRows)
    setSourceName(name)
    setSource(billSource)
    setMessage(result.drafts.length ? `解析完成，请核对 ${result.drafts.length} 条账单后确认入账。` : '')
  }

  async function handleFile(file?: File) {
    if (!file) return
    setLoading(true)
    setMessage('')
    try {
      const result = await parseBillFile(file, rules)
      acceptResult(result, file.name, file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'excel')
    } catch (error) {
      setDrafts([])
      setErrors([error instanceof Error ? error.message : '文件解析失败'])
    } finally {
      setLoading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleOcr(file?: File) {
    if (!file) return
    setLoading(true)
    setErrors([])
    setDrafts([])
    setOcrImage(await fileToDataUrl(file))
    setSourceName(file.name)
    try {
      const text = await recognizeScreenshot(file, (status, progress) => setOcrStatus(`${ocrStatusText(status)} ${Math.round(progress * 100)}%`))
      setOcrText(text)
      const result = await parseOcrText(text, rules)
      acceptResult(result, file.name, 'ocr')
    } catch (error) {
      setErrors([error instanceof Error ? `OCR 失败：${error.message}。可在下方粘贴识别文本或改用手动录入。` : 'OCR 识别失败，请手动录入'])
    } finally {
      setLoading(false)
      setOcrStatus('')
      if (ocrInput.current) ocrInput.current.value = ''
    }
  }

  async function reparseOcr() {
    if (!ocrText.trim()) return setErrors(['请先粘贴 OCR 识别文本'])
    setLoading(true)
    try { acceptResult(await parseOcrText(ocrText, rules), sourceName || 'OCR 文本', 'ocr') } finally { setLoading(false) }
  }

  function updateDraft(tempId: string, patch: Partial<DraftTransaction>) {
    setDrafts(current => current.map(item => item.tempId === tempId ? { ...item, ...patch } : item))
  }

  async function confirmSave() {
    setSaving(true)
    setMessage('')
    try {
      const normalized = await Promise.all(drafts.map(async item => ({ ...item, fingerprint: await fingerprintBill(item.occurredOn, item.direction, item.amount, item.merchant) })))
      const result = await onSave(normalized, { source, fileName: sourceName, totalCount: totalRows || drafts.length, successCount: 0, failedCount: errors.length, errorSummary: errors.join('；') })
      setMessage(`成功入账 ${result.saved} 条${result.duplicates ? `，跳过 ${result.duplicates} 条重复账单` : ''}。`)
      setDrafts([])
      setErrors([])
      setOcrText('')
      setOcrImage('')
    } catch (error) {
      setErrors([error instanceof Error ? error.message : '保存失败，请稍后重试'])
    } finally {
      setSaving(false)
    }
  }

  return <div className="page import-page">
    <div className="page-heading"><div><span className="eyebrow">多源账单采集</span><h1>把散落的账单，放到一起。</h1><p>文件与截图均先解析、后确认，原始数据不会被直接写入。</p></div><div className="security-chip"><Check size={14} />本地解析 · 加密保存</div></div>
    <div className="import-layout">
      <section className="card import-workbench">
        <div className="segmented-tabs">
          <button className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')}><FileSpreadsheet size={17} />文件导入</button>
          <button className={tab === 'ocr' ? 'active' : ''} onClick={() => setTab('ocr')}><ScanLine size={17} />截图 OCR</button>
          <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}><Plus size={17} />手动记账</button>
        </div>
        {tab === 'file' && <div className="tab-body">
          <div className={`dropzone ${loading ? 'is-loading' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]) }}>
            <input ref={fileInput} type="file" accept=".csv,.xls,.xlsx" hidden onChange={event => void handleFile(event.target.files?.[0])} />
            {loading ? <LoaderCircle className="spin" size={34} /> : <UploadCloud size={36} />}
            <h3>{loading ? '正在解析账单…' : '拖入账单文件，或点击选择'}</h3>
            <p>支持支付宝、微信支付、银行 App 导出的 CSV / XLS / XLSX</p>
            <button className="button button-secondary" onClick={() => fileInput.current?.click()} disabled={loading}>选择账单文件</button>
            <small>文件最大 10 MB · 自动识别常见中文字段 · 重复账单自动跳过</small>
          </div>
          <div className="sample-row"><span>没有账单文件？</span><a href="samples/alipay-demo.csv" download><ArrowDownToLine size={14} />支付宝样例 CSV</a><a href="samples/wechat-demo.xlsx" download><ArrowDownToLine size={14} />微信样例 Excel</a></div>
        </div>}
        {tab === 'ocr' && <div className="tab-body">
          <input ref={ocrInput} type="file" accept="image/png,image/jpeg,image/webp,image/bmp" hidden onChange={event => void handleOcr(event.target.files?.[0])} />
          <div className="ocr-grid">
            <button className="ocr-upload" onClick={() => ocrInput.current?.click()} disabled={loading}>
              {ocrImage ? <img src={ocrImage} alt="待识别账单截图" /> : <><FileImage size={34} /><b>上传账单截图</b><span>PNG / JPG / WEBP，最大 8 MB</span></>}
              {loading && <div className="ocr-loading"><LoaderCircle className="spin" /><b>{ocrStatus || '正在准备 OCR 引擎'}</b><small>首次识别需加载中文模型，请保持网络畅通</small></div>}
            </button>
            <div className="ocr-text-panel"><label>OCR 识别文本 <span>可手动修正后重新解析</span></label><textarea value={ocrText} onChange={event => setOcrText(event.target.value)} placeholder={'识别文本会显示在这里。\n如果图片识别失败，也可粘贴账单文字，例如：\n交易时间：2026-11-03\n交易对方：瑞幸咖啡\n金额：¥38.50'} /><button className="button button-secondary button-small" onClick={() => void reparseOcr()} disabled={loading}><Sparkles size={15} />解析文本</button></div>
          </div>
          <p className="ocr-tip">支持单笔支付详情和账单列表截图；列表截图会一次识别多条，汇总金额不会计为账单。</p>
        </div>}
        {tab === 'manual' && <ManualEntry rules={rules} onDraft={draft => { acceptResult({ drafts: [draft], errors: [], totalRows: 1 }, '手动记账', 'manual'); setMessage('已生成账单预览，请确认后入账。') }} />}
        {message && <div className="inline-message success"><Check size={16} />{message}</div>}
        {errors.length > 0 && <div className="parse-errors"><b><AlertCircle size={15} />需要处理的问题</b>{errors.map((error, index) => <span key={index}>{error}</span>)}</div>}
      </section>
      <aside className="import-side">
        <section className="card process-card"><span className="eyebrow">可靠导入流程</span>{['上传原始账单', '智能解析与分类', '人工核对确认', '加密入库并去重'].map((item, index) => <div className="process-step" key={item}><i>{index + 1}</i><span>{item}</span>{index < 3 && <ChevronRight size={14} />}</div>)}</section>
        <section className="card rpa-card"><div className="card-title"><Bot size={18} /><h3>RPA 采集扩展</h3></div><p>可用 Power Automate 自动打开支付平台账单页、选择时间并导出文件，再交给本系统解析。</p><ul><li>验证码与登录必须由用户本人完成</li><li>页面结构变化时停止并转人工</li><li>不在脚本中保存支付密码</li></ul><span className="tag">设计预留 · 未伪造平台对接</span></section>
      </aside>
    </div>
    {drafts.length > 0 && <ImportPreview drafts={drafts} saving={saving} onUpdate={updateDraft} onRemove={tempId => setDrafts(current => current.filter(item => item.tempId !== tempId))} onCancel={() => setDrafts([])} onSave={() => void confirmSave()} />}
    <section className="card batch-card"><div className="section-heading"><div><h2>导入批次</h2><p>每次采集都有状态与异常记录，便于追踪和回放。</p></div><span className="tag">最近 {batches.length} 批</span></div>{batches.length ? <div className="table-wrap"><table><thead><tr><th>时间</th><th>来源 / 文件</th><th>状态</th><th>总行数</th><th>成功</th><th>异常/重复</th></tr></thead><tbody>{batches.slice(0, 8).map(batch => <tr key={batch.id}><td>{batch.createdAt ? new Date(batch.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td><td><b>{sourceLabel(batch.source)}</b><small className="table-sub">{batch.fileName || '手动记账'}</small></td><td><span className={`status status-${batch.status}`}>{batch.status === 'completed' ? '已完成' : batch.status === 'failed' ? '失败' : '处理中'}</span></td><td>{batch.totalCount}</td><td>{batch.successCount}</td><td title={batch.errorSummary}>{batch.failedCount}</td></tr>)}</tbody></table></div> : <div className="empty-inline"><FileText />完成第一次导入后，批次记录会出现在这里。</div>}</section>
  </div>
}

function ImportPreview({ drafts, saving, onUpdate, onRemove, onCancel, onSave }: { drafts: DraftTransaction[]; saving: boolean; onUpdate: (id: string, patch: Partial<DraftTransaction>) => void; onRemove: (id: string) => void; onCancel: () => void; onSave: () => void }) {
  return <section className="card preview-card"><div className="section-heading"><div><span className="eyebrow">第二步 · 人工核对</span><h2>账单解析预览 <span className="count-badge">{drafts.length}</span></h2><p>低置信度分类已标记，修改后可立即看到结果。</p></div><div className="preview-actions"><button className="button button-ghost" onClick={onCancel}>取消</button><button className="button button-primary" onClick={onSave} disabled={saving || !drafts.length}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{saving ? '正在加密入账…' : '确认入账'}</button></div></div><div className="table-wrap preview-table"><table><thead><tr><th>交易日期</th><th>交易对方</th><th>收支</th><th>金额（元）</th><th>智能分类</th><th>置信度</th><th /></tr></thead><tbody>{drafts.map(item => <tr key={item.tempId}><td><input className="table-input date-input" type="date" value={item.occurredOn} onChange={event => onUpdate(item.tempId, { occurredOn: event.target.value })} /></td><td><input className="table-input merchant-input" value={item.merchant} onChange={event => onUpdate(item.tempId, { merchant: event.target.value })} /></td><td><select className="table-input" value={item.direction} onChange={event => { const direction = event.target.value as 'income' | 'expense'; onUpdate(item.tempId, { direction, category: categoriesFor(direction)[0] }) }}><option value="expense">支出</option><option value="income">收入</option></select></td><td><input className="table-input amount-input" type="number" min="0.01" step="0.01" value={item.amount} onChange={event => onUpdate(item.tempId, { amount: Number(event.target.value) })} /></td><td><select className={`table-input category-select ${item.confidence < 0.5 ? 'needs-review' : ''}`} value={item.category} onChange={event => onUpdate(item.tempId, { category: event.target.value, categorySource: 'manual', confidence: 1 })}>{categoriesFor(item.direction).map(category => <option key={category}>{category}</option>)}</select></td><td><span className={`confidence ${item.confidence < 0.5 ? 'low' : ''}`}>{Math.round(item.confidence * 100)}%{item.confidence < 0.5 && ' · 待核对'}</span></td><td><button className="icon-button" title="移除此条" onClick={() => onRemove(item.tempId)}><X size={16} /></button></td></tr>)}</tbody></table></div></section>
}

function ManualEntry({ rules, onDraft }: { rules: CategoryRule[]; onDraft: (draft: DraftTransaction) => void }) {
  const [form, setForm] = useState({ occurredOn: new Date().toISOString().slice(0, 10), merchant: '', amount: '', direction: 'expense' as 'income' | 'expense', note: '' })
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!form.merchant.trim() || Number(form.amount) <= 0) return setError('请填写交易对方和有效金额')
    const draft = await createDraft({ occurredOn: form.occurredOn, direction: form.direction, amount: Number(form.amount), merchant: form.merchant, note: form.note, source: 'manual' }, rules)
    onDraft(draft)
    setForm(current => ({ ...current, merchant: '', amount: '', note: '' }))
    setError('')
  }
  return <form className="manual-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>交易日期</span><input type="date" required value={form.occurredOn} onChange={event => setForm({ ...form, occurredOn: event.target.value })} /></label><label className="field"><span>交易对方</span><input required value={form.merchant} onChange={event => setForm({ ...form, merchant: event.target.value })} placeholder="例如：瑞幸咖啡" /></label><label className="field"><span>金额（元）</span><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label><label className="field"><span>收支类型</span><select value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value as 'income' | 'expense' })}><option value="expense">支出</option><option value="income">收入</option></select></label><label className="field field-wide"><span>备注</span><input value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="选填，可补充消费用途" /></label></div>{error && <div className="form-error">{error}</div>}<button className="button button-primary"><Plus size={16} />生成账单预览</button></form>
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function ocrStatusText(status: string) {
  const labels: Record<string, string> = { 'loading tesseract core': '加载识别引擎', 'initializing tesseract': '初始化引擎', 'loading language traineddata': '加载中文模型', 'initializing api': '初始化识别服务', 'recognizing text': '正在识别文字' }
  return labels[status] ?? status
}

function sourceLabel(source: string) {
  return ({ csv: 'CSV 文件', excel: 'Excel 文件', ocr: '截图 OCR', manual: '手动记账', demo: '演示数据' } as Record<string, string>)[source] ?? source
}
