import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createVaultHandler } from './server/vault.js'

const vaultHandler = createVaultHandler(path.resolve(process.env.BILL_INSIGHT_DATA_DIR || 'data'))

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'vault-file-storage',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/vault')) {
            void vaultHandler(req, res)
            return
          }
          if (req.url === '/data' || req.url?.startsWith('/data/')) {
            res.statusCode = 404
            res.end('Not found')
            return
          }
          next()
        })
      },
    },
  ],
  server: { port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
