import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_BODY_BYTES = 10 * 1024 * 1024

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readVault(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'))
    return {
      settings: parsed.settings ?? null,
      payload: parsed.payload ?? null,
    }
  } catch (error) {
    if (error.code === 'ENOENT') return { settings: null, payload: null }
    throw error
  }
}

async function writeVault(file, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid vault')
  const data = { settings: value.settings ?? null, payload: value.payload ?? null }
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    await fs.copyFile(file, `${file}.bak`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const temporary = `${file}.${process.pid}.tmp`
  await fs.writeFile(temporary, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
  await fs.rename(temporary, file)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('too-large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function createVaultHandler(dataDir) {
  const file = path.join(dataDir, 'vault.json')
  return async function vaultHandler(req, res) {
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, await readVault(file))
        return
      }
      if (req.method === 'PUT') {
        if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
          sendJson(res, 415, { error: 'Content-Type must be application/json' })
          return
        }
        const body = await readBody(req)
        let parsed
        try {
          parsed = JSON.parse(body)
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON' })
          return
        }
        await writeVault(file, parsed)
        sendJson(res, 200, { saved: true })
        return
      }
      res.setHeader('Allow', 'GET, PUT')
      sendJson(res, 405, { error: 'Method not allowed' })
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'too-large'
      sendJson(res, tooLarge ? 413 : 500, { error: tooLarge ? 'Vault is too large' : 'Vault storage unavailable' })
    }
  }
}
