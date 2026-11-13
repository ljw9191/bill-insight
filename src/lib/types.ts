export type Direction = 'income' | 'expense'
export type BillSource = 'csv' | 'excel' | 'ocr' | 'manual' | 'demo'
export type CategorySource = 'auto' | 'manual' | 'rule'

export interface Transaction {
  id?: number
  occurredOn: string
  direction: Direction
  amount: number
  merchant: string
  category: string
  originalCategory?: string
  categorySource: CategorySource
  confidence: number
  source: BillSource
  note: string
  rawText?: string
  batchId?: number
  fingerprint: string
  corrected: boolean
  createdAt?: string
}

export interface DraftTransaction extends Transaction {
  tempId: string
}

export interface CategoryRule {
  id?: number
  keyword: string
  category: string
  direction: Direction
  weight: number
  hitCount: number
  source: 'user'
}

export interface ImportBatch {
  id?: number
  source: BillSource
  fileName?: string
  status: 'processing' | 'completed' | 'failed'
  totalCount: number
  successCount: number
  failedCount: number
  errorSummary?: string
  createdAt?: string
}

export interface FeedbackEvent {
  id?: number
  transactionId: number
  oldCategory: string
  newCategory: string
  createdAt?: string
}

export interface SaveResult {
  saved: number
  duplicates: number
}

export interface ParseResult {
  drafts: DraftTransaction[]
  errors: string[]
  totalRows: number
}

export interface MonthlyStats {
  income: number
  expense: number
  balance: number
  count: number
  categoryExpenses: { category: string; amount: number }[]
  daily: { day: string; income: number; expense: number }[]
}
