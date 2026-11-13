import { extractLearningKeyword } from './classifier'
import { decryptJson, encryptJson } from './crypto'
import { readLocalPayload, writeLocalPayload } from './localDb'
import type { BillStore, StoreData } from './store'
import type { CategoryRule, DraftTransaction, ImportBatch, SaveResult, Transaction } from './types'

const EMPTY: StoreData = { transactions: [], rules: [], batches: [], feedback: [] }

export class LocalStore implements BillStore {
  private data: StoreData
  private nextId: number

  private constructor(private key: CryptoKey, data: StoreData) {
    this.data = data
    this.nextId = Math.max(0, data.transactions.length, data.rules.length, data.batches.length, data.feedback.length) + 1000
  }

  static async open(key: CryptoKey) {
    const payload = await readLocalPayload()
    const data = payload ? await decryptJson<StoreData>(key, payload.iv, payload.data) : structuredClone(EMPTY)
    return new LocalStore(key, data)
  }

  private async persist() {
    const encrypted = await encryptJson(this.key, this.data)
    await writeLocalPayload(encrypted)
  }

  async load() {
    return structuredClone(this.data)
  }

  async saveDrafts(drafts: DraftTransaction[], batch: Omit<ImportBatch, 'id' | 'status' | 'createdAt'>): Promise<SaveResult> {
    const existing = new Set(this.data.transactions.map(item => item.fingerprint))
    const unique = drafts.filter(item => !existing.has(item.fingerprint))
    const duplicates = drafts.length - unique.length
    const rows = unique.map(item => ({ ...item, id: this.nextId++, tempId: undefined } as Transaction))
    this.data.transactions = [...rows, ...this.data.transactions]
    this.data.batches.unshift({ ...batch, id: this.nextId++, status: 'completed', successCount: rows.length, failedCount: batch.failedCount + duplicates, errorSummary: [batch.errorSummary, duplicates ? `${duplicates} 条重复账单已跳过` : ''].filter(Boolean).join('；'), createdAt: new Date().toISOString() })
    await this.persist()
    return { saved: rows.length, duplicates }
  }

  async correctCategory(transaction: Transaction, newCategory: string) {
    this.data.transactions = this.data.transactions.map(item => item.id === transaction.id ? { ...item, category: newCategory, originalCategory: item.originalCategory ?? item.category, categorySource: 'manual', corrected: true, confidence: 1 } : item)
    if (transaction.id) this.data.feedback.unshift({ id: this.nextId++, transactionId: transaction.id, oldCategory: transaction.category, newCategory, createdAt: new Date().toISOString() })
    const keyword = extractLearningKeyword(transaction.merchant, transaction.note)
    const existing = this.data.rules.find(rule => rule.direction === transaction.direction && rule.keyword.toLowerCase() === keyword.toLowerCase())
    if (keyword && existing) {
      existing.category = newCategory
      existing.hitCount += 1
      existing.weight += 10
    } else if (keyword) {
      this.data.rules.unshift({ id: this.nextId++, keyword, category: newCategory, direction: transaction.direction, weight: 100, hitCount: 1, source: 'user' } satisfies CategoryRule)
    }
    await this.persist()
    return structuredClone(this.data.rules)
  }

  async deleteTransaction(id: number) {
    this.data.transactions = this.data.transactions.filter(item => item.id !== id)
    await this.persist()
  }
}
