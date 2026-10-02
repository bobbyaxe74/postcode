export type Host = 'gw' | 'platform'
export type AuthMode = 'env' | 'custom' | 'none'

export const HOSTS: Record<Host, string> = {
  gw: 'https://api.postcode.gov.ng',
  platform: 'https://platform.postcode.gov.ng',
}

export interface ApiRequest {
  host?: Host
  method?: 'GET' | 'POST'
  path: string
  query?: Record<string, string | number | undefined>
  body?: unknown
  rawBody?: string
  auth?: AuthMode
  customKey?: string
  timeoutMs?: number
  /** Call the real host straight from the browser (bypasses the proxy; used for CORS checks). */
  direct?: boolean
}

export interface ApiResult {
  id: string
  ts: number
  method: string
  url: string
  auth: AuthMode
  status: number
  ok: boolean
  timeMs: number
  headers: Record<string, string>
  body: unknown
  text: string
  error?: string
  timedOut?: boolean
}

declare const __ENV_KEY_KIND__: string
export const ENV_KEY_KIND: string = __ENV_KEY_KIND__

let seq = 0
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`

export function buildUrl(req: ApiRequest): string {
  const host = req.host ?? 'gw'
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (v !== undefined) qs.set(k, String(v))
  }
  const q = qs.toString()
  return `${HOSTS[host]}${req.path}${q ? `?${q}` : ''}`
}

export async function callApi(req: ApiRequest): Promise<ApiResult> {
  const host = req.host ?? 'gw'
  const method = req.method ?? 'GET'
  const auth = req.auth ?? 'env'
  const publicUrl = buildUrl(req)
  const fetchUrl = req.direct ? publicUrl : publicUrl.replace(HOSTS[host], `/${host}`)

  const headers: Record<string, string> = {}
  if (!req.direct) {
    headers['x-pc-auth'] = auth
    if (auth === 'custom' && req.customKey) headers['x-pc-key'] = req.customKey
  } else if (auth === 'custom' && req.customKey) {
    headers['X-API-Key'] = req.customKey
  }
  let body: string | undefined
  if (req.rawBody !== undefined) {
    body = req.rawBody
    headers['Content-Type'] = 'application/json'
  } else if (req.body !== undefined) {
    body = JSON.stringify(req.body)
    headers['Content-Type'] = 'application/json'
  }

  const ctrl = new AbortController()
  const timeoutMs = req.timeoutMs ?? 12000
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const t0 = performance.now()
  const base = { id: uid(), ts: Date.now(), method, url: publicUrl, auth }
  try {
    const res = await fetch(fetchUrl, { method, headers, body, signal: ctrl.signal })
    const text = await res.text()
    const timeMs = Math.round(performance.now() - t0)
    const hdrs: Record<string, string> = {}
    res.headers.forEach((v, k) => (hdrs[k] = v))
    let parsed: unknown = text
    try {
      parsed = JSON.parse(text)
    } catch {
      /* non-JSON body */
    }
    const proxyErr = hdrs['x-pc-proxy-error'] === '1'
    return {
      ...base,
      status: proxyErr ? 0 : res.status,
      ok: res.ok,
      timeMs,
      headers: hdrs,
      body: parsed,
      text,
      error: proxyErr ? `Upstream did not respond (${timeMs} ms)` : undefined,
      timedOut: proxyErr,
    }
  } catch (e) {
    const timeMs = Math.round(performance.now() - t0)
    const aborted = (e as Error).name === 'AbortError'
    return {
      ...base,
      status: 0,
      ok: false,
      timeMs,
      headers: {},
      body: null,
      text: '',
      error: aborted ? `Timed out after ${timeoutMs} ms` : `Network/CORS error: ${(e as Error).message}`,
      timedOut: aborted,
    }
  } finally {
    clearTimeout(timer)
  }
}

export function curlFor(r: Pick<ApiResult, 'method' | 'url' | 'auth'>, body?: string): string {
  const parts = [`curl -X ${r.method} "${r.url}"`]
  if (r.auth !== 'none') parts.push(`-H "X-API-Key: $API_KEY"`)
  if (body) parts.push(`-H "Content-Type: application/json" -d '${body}'`)
  return parts.join(' \\\n  ')
}

/** Pull `{error:{code,message}}` out of a response body if present. */
export function errorOf(body: unknown): { code?: string; message?: string } | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error: unknown }).error
    if (e && typeof e === 'object') return e as { code?: string; message?: string }
  }
  return undefined
}

export function dataOf<T = Record<string, unknown>>(body: unknown): T | undefined {
  if (body && typeof body === 'object' && 'data' in body) return (body as { data: T }).data
  return undefined
}
