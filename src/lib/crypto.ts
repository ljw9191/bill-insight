const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

export async function deriveKey(passphrase: string, saltBase64: string) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(saltBase64), iterations: 150_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function createEncryptionSettings(passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const saltBase64 = toBase64(salt)
  const key = await deriveKey(passphrase, saltBase64)
  const verifier = await encryptJson(key, { valid: 'bill-insight-v1' })
  return { key, settings: { salt: saltBase64, verifier_iv: verifier.iv, verifier_data: verifier.data } }
}

export async function unlockEncryption(passphrase: string, settings: { salt: string; verifier_iv: string; verifier_data: string }) {
  const key = await deriveKey(passphrase, settings.salt)
  const verifier = await decryptJson<{ valid: string }>(key, settings.verifier_iv, settings.verifier_data)
  if (verifier.valid !== 'bill-insight-v1') throw new Error('密钥校验失败')
  return key
}

export async function encryptJson(key: CryptoKey, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)))
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) }
}

export async function decryptJson<T>(key: CryptoKey, iv: string, data: string): Promise<T> {
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(data))
  return JSON.parse(decoder.decode(decrypted)) as T
}

export async function fingerprintBill(occurredOn: string, direction: string, amount: number, merchant: string) {
  const input = `${occurredOn}|${direction}|${amount.toFixed(2)}|${merchant.trim().toLowerCase()}`
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return toBase64(new Uint8Array(digest))
}
