const API = '/api/vault'
const TOKEN_KEY = 'bill-insight.vault-token'

export interface LocalSettings {
  salt: string
  verifier_iv: string
  verifier_data: string
}

interface VaultPayload {
  settings: LocalSettings | null
  payload: { iv: string; data: string } | null
}

/** 读取部署访问令牌：仅当服务端设置了 VAULT_TOKEN 时才需要填写。 */
export function getVaultToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

/** 保存部署访问令牌；传空字符串则清除。 */
export function setVaultToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 隐私模式下 localStorage 不可用，忽略即可
  }
}

function requestHeaders(body?: VaultPayload) {
  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'
  const token = getVaultToken()
  if (token) headers['X-Vault-Token'] = token
  return headers
}

async function request(method: 'GET' | 'PUT', body?: VaultPayload): Promise<VaultPayload> {
  const response = await fetch(API, {
    method,
    headers: requestHeaders(body),
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (response.status === 401) {
    throw new Error('服务器要求部署访问令牌，请在解锁页填写 VAULT_TOKEN 后重试')
  }
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
