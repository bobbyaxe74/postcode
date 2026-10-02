import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

// The API key stays on the dev server. The browser tells the proxy which key to
// use via `x-pc-auth` (env | custom | none) and, for custom, `x-pc-key`.
function proxyFor(target: string, prefix: string, envKey: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    proxyTimeout: 15000,
    timeout: 15000,
    rewrite: (p) => p.replace(new RegExp(`^${prefix}`), ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        const mode = (req.headers['x-pc-auth'] as string) || 'env'
        const custom = req.headers['x-pc-key'] as string | undefined
        proxyReq.removeHeader('x-pc-auth')
        proxyReq.removeHeader('x-pc-key')
        proxyReq.removeHeader('x-api-key')
        proxyReq.removeHeader('origin')
        proxyReq.removeHeader('referer')
        if (mode === 'env' && envKey) proxyReq.setHeader('X-API-Key', envKey)
        if (mode === 'custom' && custom) proxyReq.setHeader('X-API-Key', custom)
      })
      proxy.on('error', (err, _req, res) => {
        const r = res as import('http').ServerResponse
        if (!r.headersSent) {
          r.writeHead(504, { 'content-type': 'application/json', 'x-pc-proxy-error': '1' })
        }
        r.end(JSON.stringify({ proxy_error: { code: (err as NodeJS.ErrnoException).code ?? 'proxy_error', message: err.message } }))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.API_KEY ?? ''
  const kind = key.match(/^nipost_(pk_)?(test|live)/)?.[0] ?? (key ? 'unknown' : 'none')
  return {
    plugins: [react()],
    define: {
      // Only the key's prefix (e.g. "nipost_test") is exposed, never the secret.
      __ENV_KEY_KIND__: JSON.stringify(kind),
    },
    server: {
      proxy: {
        '/gw': proxyFor('https://api.postcode.gov.ng', '/gw', key),
        '/platform': proxyFor('https://platform.postcode.gov.ng', '/platform', key),
      },
    },
  }
})
