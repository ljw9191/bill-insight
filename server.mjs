import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVaultHandler } from './server/vault.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(root, 'dist')
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 4173)
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'))
const vaultHandler = createVaultHandler(dataDir)

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
  '.traineddata': 'application/octet-stream',
  '.wasm': 'application/wasm',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (url.pathname === '/api/vault') {
    await vaultHandler(req, res)
    return
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('ok\n')
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  const requested = pathname === '/' ? '/index.html' : pathname
  const file = path.resolve(dist, `.${requested}`)
  if (!file.startsWith(`${dist}${path.sep}`)) {
    res.writeHead(403)
    res.end()
    return
  }

  let target = file
  try {
    const stat = await fs.promises.stat(target)
    if (stat.isDirectory()) target = path.join(target, 'index.html')
  } catch {
    if (!path.extname(pathname)) target = path.join(dist, 'index.html')
    else {
      res.writeHead(404)
      res.end('Not found')
      return
    }
  }

  try {
    const content = await fs.promises.readFile(target)
    const extension = path.extname(target).toLowerCase()
    res.writeHead(200, {
      'Content-Type': mime[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-cache' : extension === '.traineddata' ? 'public, max-age=604800' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    })
    res.end(req.method === 'HEAD' ? undefined : content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

server.listen(port, host, () => {
  console.log(`Bill Insight: http://${host}:${port}`)
  console.log(`Vault file: ${path.join(dataDir, 'vault.json')}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
