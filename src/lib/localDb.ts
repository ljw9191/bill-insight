const API = '/api/vault'

export interface LocalSettings {
  salt: string
  verifier_iv: string
  verifier_data: string
}

interface VaultPayload {
  settings: LocalSettings | null
  payload: { iv: string; data: string } | null
}

async function request(method: 'GET' | 'PUT', body?: VaultPayload): Promise<VaultPayload> {
  const response = await fetch(API, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error('本地文件保存服务不可用，请使用 start-dev.bat 启动项目')
  }
  return response.json() as Promise<VaultPayload>
}

async function readVault() {
  return request('GET')
}

async function updateVault(patch: Partial<VaultPayload>) {
  const current = await readVault()
  await request('PUT', { ...current, ...patch })
}

export async function getLocalSettings() {
  const vault = await readVault()
  return vault.settings ?? undefined
}

export async function saveLocalSettings(settings: LocalSettings) {
  await updateVault({ settings })
}

export async function readLocalPayload() {
  const vault = await readVault()
  return vault.payload ?? undefined
}

export async function writeLocalPayload(payload: { iv: string; data: string }) {
  await updateVault({ payload })
}
