import { cloud } from './cloud'
import { decryptJson, encryptJson } from './crypto'
import { extractLearningKeyword } from './classifier'
import type { CategoryRule, DraftTransaction, FeedbackEvent, ImportBatch, SaveResult, Transaction } from './types'

export interface StoreData {
  transactions: Transaction[]
  rules: CategoryRule[]
  batches: ImportBatch[]
  feedback: FeedbackEvent[]
}

export interface BillStore {
  load(): Promise<StoreData>
  saveDrafts(drafts: DraftTransaction[], batch: Omit<ImportBatch, 'id' | 'status' | 'createdAt'>): Promise<SaveResult>
  correctCategory(transaction: Transaction, newCategory: string, rules: CategoryRule[]): Promise<CategoryRule[]>
  deleteTransaction(id: number): Promise<void>
}

interface Payload {
  amount: number
  merchant: string
  note: string
  rawText?: string
}

function unwrap<T>(result: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (result.error) throw new Error(result.error.message || '云端操作失败')
  if (result.data === null) throw new Error('云端未返回数据')
  return result.data
}

export async function getCloudSettings() {
  const { data, error } = await cloud.database.from('user_settings').select('salt, verifier_iv, verifier_data').maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function createCloudSettings(settings: { salt: string; verifier_iv: string; verifier_data: string }) {
  const { data, error } = await cloud.database.from('user_settings').insert(settings).select('salt, verifier_iv, verifier_data')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('加密设置保存失败，请重新登录后再试')
}

export class CloudStore implements BillStore {
  constructor(private key: CryptoKey) {}

  async load(): Promise<StoreData> {
    const [transactionResult, ruleResult, batchResult, feedbackResult] = await Promise.all([
      cloud.database.from('transactions').select('*').order('occurred_on', { ascending: false }).limit(1000),
      cloud.database.from('category_rules').select('*').order('updated_at', { ascending: false }).limit(300),
      cloud.database.from('import_batches').select('*').order('created_at', { ascending: false }).limit(50),
      cloud.database.from('feedback_events').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    const rows = unwrap(transactionResult)
    const ruleRows = unwrap(ruleResult)
    const transactions = await Promise.all(rows.map(async row => {
      const payload = await decryptJson<Payload>(this.key, row.payload_iv, row.payload_data)
      return {
        id: row.id,
        occurredOn: row.occurred_on,
        direction: row.direction,
        amount: payload.amount,
        merchant: payload.merchant,
        note: payload.note,
        rawText: payload.rawText,
        category: row.category,
        originalCategory: row.original_category,
        categorySource: row.category_source,
        confidence: Number(row.confidence),
        source: row.source,
        batchId: row.batch_id,
        fingerprint: row.fingerprint,
        corrected: row.corrected,
        createdAt: row.created_at,
      } as Transaction
    }))
    const rules = await Promise.all(ruleRows.map(async row => ({
      id: row.id,
      keyword: await decryptJson<string>(this.key, row.keyword_iv, row.keyword_data),
      category: row.category,
      direction: row.direction,
      weight: row.weight,
      hitCount: row.hit_count,
      source: 'user' as const,
    })))
    return {
      transactions,
      rules,
      batches: unwrap(batchResult).map(row => ({ id: row.id, source: row.source, fileName: row.file_name, status: row.status, totalCount: row.total_count, successCount: row.success_count, failedCount: row.failed_count, errorSummary: row.error_summary, createdAt: row.created_at })),
      feedback: unwrap(feedbackResult).map(row => ({ id: row.id, transactionId: row.transaction_id, oldCategory: row.old_category, newCategory: row.new_category, createdAt: row.created_at })),
    }
  }

  async saveDrafts(drafts: DraftTransaction[], batch: Omit<ImportBatch, 'id' | 'status' | 'createdAt'>): Promise<SaveResult> {
    const batchRow = unwrap(await cloud.database.from('import_batches').insert({
      source: batch.source,
      file_name: batch.fileName,
      status: 'processing',
      total_count: batch.totalCount,
      success_count: 0,
      failed_count: batch.failedCount,
      error_summary: batch.errorSummary,
    }).select())
    const batchId = batchRow[0]?.id
    if (!batchId) throw new Error('导入批次创建失败')

    try {
      const rows = await Promise.all(drafts.map(async item => {
        const encrypted = await encryptJson(this.key, { amount: item.amount, merchant: item.merchant, note: item.note, rawText: item.rawText } satisfies Payload)
        return {
          occurred_on: item.occurredOn,
          month: item.occurredOn.slice(0, 7),
          direction: item.direction,
          category: item.category,
          original_category: item.originalCategory,
          category_source: item.categorySource,
          confidence: item.confidence,
          payload_iv: encrypted.iv,
          payload_data: encrypted.data,
          source: item.source,
          batch_id: batchId,
          fingerprint: item.fingerprint,
          corrected: false,
        }
      }))
      let saved = 0
      for (let index = 0; index < rows.length; index += 50) {
        const inserted = unwrap(await cloud.database.from('transactions').upsert(rows.slice(index, index + 50), { onConflict: 'owner_id,fingerprint', ignoreDuplicates: true }).select('id'))
        saved += inserted.length
      }
      const duplicates = drafts.length - saved
      const failedCount = batch.failedCount + duplicates
      const errorSummary = [batch.errorSummary, duplicates ? `${duplicates} 条重复账单已跳过` : ''].filter(Boolean).join('；')
      const updated = unwrap(await cloud.database.from('import_batches').update({ status: 'completed', success_count: saved, failed_count: failedCount, error_summary: errorSummary }).eq('id', batchId).select('id'))
      if (!updated.length) throw new Error('批次状态更新失败')
      return { saved, duplicates }
    } catch (error) {
      await cloud.database.from('import_batches').update({ status: 'failed', error_summary: error instanceof Error ? error.message : '导入失败' }).eq('id', batchId)
      throw error
    }
  }

  async correctCategory(transaction: Transaction, newCategory: string, rules: CategoryRule[]) {
    if (!transaction.id) throw new Error('账单尚未保存')
    const updated = unwrap(await cloud.database.from('transactions').update({ category: newCategory, original_category: transaction.originalCategory ?? transaction.category, category_source: 'manual', corrected: true, confidence: 1, updated_at: new Date().toISOString() }).eq('id', transaction.id).select('id'))
    if (!updated.length) throw new Error('账单不存在或无权修改')
    await cloud.database.from('feedback_events').insert({ transaction_id: transaction.id, old_category: transaction.category, new_category: newCategory })

    const keyword = extractLearningKeyword(transaction.merchant, transaction.note)
    if (!keyword) return rules
    const existing = rules.find(rule => rule.direction === transaction.direction && rule.keyword.toLowerCase() === keyword.toLowerCase())
    if (existing?.id) {
      const next = { ...existing, hitCount: existing.hitCount + 1, weight: existing.weight + 10 }
      await cloud.database.from('category_rules').update({ category: newCategory, hit_count: next.hitCount, weight: next.weight, updated_at: new Date().toISOString() }).eq('id', existing.id)
      return rules.map(rule => rule.id === existing.id ? next : rule)
    }
    const encrypted = await encryptJson(this.key, keyword)
    const inserted = unwrap(await cloud.database.from('category_rules').insert({ keyword_iv: encrypted.iv, keyword_data: encrypted.data, category: newCategory, direction: transaction.direction, weight: 100, hit_count: 1, source: 'user' }).select())
    if (!inserted.length) throw new Error('分类已修改，但学习规则保存失败')
    const newRule: CategoryRule = { id: inserted[0].id, keyword, category: newCategory, direction: transaction.direction, weight: 100, hitCount: 1, source: 'user' }
    return [newRule, ...rules]
  }

  async deleteTransaction(id: number) {
    const data = unwrap(await cloud.database.from('transactions').delete().eq('id', id).select('id'))
    if (!data.length) throw new Error('账单不存在或无权删除')
  }
}

export class DemoStore implements BillStore {
  private transactions: Transaction[]
  private rules: CategoryRule[] = []
  private batches: ImportBatch[] = []
  private feedback: FeedbackEvent[] = []
  private nextId = 1000

  constructor(seed: Transaction[]) {
    this.transactions = structuredClone(seed)
  }

  async load() {
    return structuredClone({ transactions: this.transactions, rules: this.rules, batches: this.batches, feedback: this.feedback })
  }

  async saveDrafts(drafts: DraftTransaction[], batch: Omit<ImportBatch, 'id' | 'status' | 'createdAt'>) {
    const existing = new Set(this.transactions.map(item => item.fingerprint))
    const unique = drafts.filter(item => !existing.has(item.fingerprint))
    const duplicates = drafts.length - unique.length
    const savedRows = unique.map(item => ({ ...item, id: this.nextId++, batchId: this.nextId, tempId: undefined } as Transaction))
    this.transactions = [...savedRows, ...this.transactions]
    this.batches.unshift({ ...batch, id: this.nextId++, status: 'completed', successCount: savedRows.length, failedCount: batch.failedCount + duplicates, errorSummary: [batch.errorSummary, duplicates ? `${duplicates} 条重复账单已跳过` : ''].filter(Boolean).join('；'), createdAt: new Date().toISOString() })
    return { saved: savedRows.length, duplicates }
  }

  async correctCategory(transaction: Transaction, newCategory: string) {
    this.transactions = this.transactions.map(item => item.id === transaction.id ? { ...item, category: newCategory, originalCategory: item.originalCategory ?? item.category, categorySource: 'manual', corrected: true, confidence: 1 } : item)
    if (transaction.id) this.feedback.unshift({ id: this.nextId++, transactionId: transaction.id, oldCategory: transaction.category, newCategory, createdAt: new Date().toISOString() })
    const keyword = extractLearningKeyword(transaction.merchant, transaction.note)
    if (!keyword) return this.rules
    const existing = this.rules.find(rule => rule.direction === transaction.direction && rule.keyword.toLowerCase() === keyword.toLowerCase())
    if (existing) {
      existing.category = newCategory
      existing.hitCount += 1
      existing.weight += 10
    } else {
      this.rules.unshift({ id: this.nextId++, keyword, category: newCategory, direction: transaction.direction, weight: 100, hitCount: 1, source: 'user' })
    }
    return structuredClone(this.rules)
  }

  async deleteTransaction(id: number) {
    this.transactions = this.transactions.filter(item => item.id !== id)
  }
}
