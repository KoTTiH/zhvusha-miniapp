import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'

/**
 * Dev-only plugin: serves `api/*.ts` routes from the Vite dev server.
 * In production this plugin does nothing — Vercel picks up api/ directly.
 */
function aiDevApi(): Plugin {
  return {
    name: 'zhvusha-ai-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? ''
        if (!rawUrl.startsWith('/api/')) return next()
        const match = rawUrl.match(/^\/api\/([a-z0-9-]+)(?:\?|$)/)
        if (!match) return next()
        const t0 = Date.now()
        console.log('[dev-api] ->', req.method, rawUrl)
        res.on('close', () => {
          const dt = Date.now() - t0
          console.log('[dev-api] <-', req.method, rawUrl, res.statusCode ?? '??', `${dt}ms`)
        })

        try {
          if (req.method === 'POST') {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(chunk as Buffer)
            const raw = Buffer.concat(chunks).toString('utf-8')
            if (raw) {
              try {
                ;(req as unknown as { body: unknown }).body = JSON.parse(raw)
              } catch {
                ;(req as unknown as { body: unknown }).body = {}
              }
            } else {
              ;(req as unknown as { body: unknown }).body = {}
            }
          }

          const polyRes = res as unknown as {
            status: (code: number) => typeof polyRes
            json: (obj: unknown) => void
          }
          polyRes.status = (code: number) => {
            res.statusCode = code
            return polyRes
          }
          polyRes.json = (obj: unknown) => {
            if (!res.getHeader('Content-Type')) {
              res.setHeader('Content-Type', 'application/json')
            }
            res.end(JSON.stringify(obj))
          }

          const modulePath = `/api/${match[1]}.ts`
          const mod = (await server.ssrLoadModule(modulePath)) as {
            default?: (req: unknown, res: unknown) => unknown | Promise<unknown>
          }
          if (typeof mod.default !== 'function') {
            res.statusCode = 500
            res.end(JSON.stringify({ error: `No default export in ${modulePath}` }))
            return
          }
          await mod.default(req, res)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('[dev-api] error:', message)
          if (!res.writableEnded) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: message }))
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Forward env from `.env.local` (and friends) into Node's process.env so that
  // our dev-api plugin can read server-side secrets.
  for (const key of [
    'OPENROUTER_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'ALLOW_UNAUTH',
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'BLOB_READ_WRITE_TOKEN',
    'BLOB_STORE_ID',
  ]) {
    if (env[key] !== undefined && process.env[key] === undefined) {
      process.env[key] = env[key]
    }
  }
  // По умолчанию dev-сервер слушает только localhost и не разрешает произвольные
  // Host-заголовки — он же форвардит секреты из .env.local в api/*, и открытый
  // на все интерфейсы dev = утечка ключей всему LAN. Для HTTPS-туннелей
  // (serveo/ngrok/cloudflared) включаем VITE_DEV_TUNNEL=1.
  const tunnel = env.VITE_DEV_TUNNEL === '1' || process.env.VITE_DEV_TUNNEL === '1'
  const analyze = env.ANALYZE === '1' || process.env.ANALYZE === '1'
  return {
    plugins: [
      react(),
      tailwindcss(),
      aiDevApi(),
      ...(analyze
        ? [
            visualizer({
              filename: 'dist/stats.html',
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
          ]
        : []),
    ],
    server: {
      host: tunnel ? true : 'localhost',
      port: 5173,
      allowedHosts: tunnel ? true : ['localhost'],
    },
  }
})
