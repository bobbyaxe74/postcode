import { useEffect, useMemo, useRef, useState } from 'react'
import { callApi, dataOf, ENV_KEY_KIND, type ApiResult, type AuthMode } from '../api'
import { ENDPOINTS, type Endpoint } from '../endpoints'
import { Card, PostcodePlate, ResponseView } from './ui'

const defaults = (ep: Endpoint) =>
  Object.fromEntries([...(ep.query ?? []), ...(ep.body ?? [])].map((f) => [f.name, f.default ?? '']))

export function Playground({ onResult }: { onResult: (r: ApiResult) => void }) {
  const [epId, setEpId] = useState(ENDPOINTS[0].id)
  const ep = ENDPOINTS.find((e) => e.id === epId)!
  const [values, setValues] = useState<Record<string, string>>(defaults(ep))
  const [auth, setAuth] = useState<AuthMode>(ep.defaultAuth ?? 'env')
  const [customKey, setCustomKey] = useState('')
  const [result, setResult] = useState<ApiResult | null>(null)
  const [sentBody, setSentBody] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(false)

  const select = (e: Endpoint) => {
    setEpId(e.id)
    setValues(defaults(e))
    setAuth(e.defaultAuth ?? 'env')
    setResult(null)
    setLive(false)
  }

  const send = async (vals = values) => {
    setLoading(true)
    const body = ep.body ? Object.fromEntries(ep.body.map((f) => [f.name, vals[f.name]])) : undefined
    const query = ep.query ? Object.fromEntries(ep.query.filter((f) => vals[f.name] !== '' || f.required).map((f) => [f.name, vals[f.name]])) : undefined
    const r = await callApi({ host: ep.host, method: ep.method, path: ep.path, query, body, auth, customKey })
    setSentBody(body ? JSON.stringify(body) : undefined)
    setResult(r)
    onResult(r)
    setLoading(false)
  }

  // Live type-ahead for autocomplete. Never sends an empty q (that request hangs upstream).
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!live || ep.id !== 'autocomplete') return
    window.clearTimeout(timer.current)
    if (!values.q?.trim()) return
    timer.current = window.setTimeout(() => send(), 300)
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.q, live])

  const groups = useMemo(() => [...new Set(ENDPOINTS.map((e) => e.group))], [])

  return (
    <div className="playground">
      <nav className="ep-list">
        {groups.map((g) => (
          <div key={g}>
            <div className="ep-group">{g}</div>
            {ENDPOINTS.filter((e) => e.group === g).map((e) => (
              <button key={e.id} className={`ep-item ${e.id === epId ? 'on' : ''}`} onClick={() => select(e)}>
                <span className={`method ${e.method.toLowerCase()}`}>{e.method}</span>
                <span>{e.title}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="ep-main">
        <Card>
          <div className="ep-title">
            <span className={`method ${ep.method.toLowerCase()}`}>{ep.method}</span>
            <code>{ep.path}</code>
            <span className="muted host">{ep.host === 'platform' ? 'platform.postcode.gov.ng' : 'api.postcode.gov.ng'}</span>
          </div>
          <p className="muted">{ep.summary}</p>
          <p className="access">{ep.access}</p>

          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            {[...(ep.query ?? []), ...(ep.body ?? [])].map((f) => (
              <label key={f.name} className="field">
                <span>
                  {f.label ?? f.name}
                  {f.required && <em> *</em>}
                  <small className="muted">{ep.body?.includes(f) ? ' body' : ' query'}</small>
                </span>
                {f.options ? (
                  <select value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                    {f.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input value={values[f.name] ?? ''} placeholder={f.hint} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
                )}
              </label>
            ))}

            <div className="field">
              <span>Authentication</span>
              <div className="seg">
                {(['env', 'none', 'custom'] as AuthMode[]).map((m) => (
                  <button type="button" key={m} className={auth === m ? 'on' : ''} onClick={() => setAuth(m)}>
                    {m === 'env' ? `.env key (${ENV_KEY_KIND})` : m === 'none' ? 'No key' : 'Custom key'}
                  </button>
                ))}
              </div>
              {auth === 'custom' && (
                <input type="password" placeholder="nipost_pk_test_…" value={customKey} onChange={(e) => setCustomKey(e.target.value)} />
              )}
            </div>

            <div className="form-actions">
              <button className="btn primary" disabled={loading}>{loading ? 'Sending…' : 'Send request'}</button>
              <button type="button" className="btn ghost" onClick={() => setValues(defaults(ep))}>Reset</button>
              {ep.id === 'autocomplete' && (
                <label className="check">
                  <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live type-ahead
                </label>
              )}
            </div>
          </form>

          {ep.samples && (
            <div className="samples">
              <span className="muted">Try:</span>
              {ep.samples.map((s) => (
                <button key={s.label} className="chip" onClick={() => {
                  const v = { ...defaults(ep), ...s.values }
                  setValues(v)
                  send(v)
                }}>{s.label}</button>
              ))}
            </div>
          )}
        </Card>

        {result && (
          <>
            <Insight ep={ep} r={result} />
            <Card title="Response"><ResponseView r={result} body={sentBody} /></Card>
          </>
        )}
      </div>
    </div>
  )
}

/** Endpoint-specific rendering of a successful response. */
function Insight({ ep, r }: { ep: Endpoint; r: ApiResult }) {
  const d = dataOf<Record<string, unknown>>(r.body)
  if (!d || r.status !== 200) return null

  if (ep.id === 'lookup' || ep.id === 'disassemble' || ep.id === 'assemble') {
    const code = (d.postcode as string) ?? (ep.id === 'disassemble' ? Object.values(d).join('') : '')
    return (
      <Card title="Parsed">
        <div className="insight-row">
          <PostcodePlate code={code} />
          {'status' in d && <span className={`badge ${d.valid ? 'pass' : 'fail'}`}>{String(d.status)}</span>}
        </div>
        {'administrative_address' in d && <KV obj={d.administrative_address as Record<string, string>} />}
      </Card>
    )
  }

  if (ep.id === 'autocomplete') {
    const s = d as { segment?: string; suggestions?: { code: string; label?: string }[] }
    return (
      <Card title={`Suggestions for segment: ${s.segment}`}>
        {s.suggestions?.length ? (
          <div className="samples">{s.suggestions.map((x) => <span key={x.code} className="chip mono">{x.code}{x.label ? ` · ${x.label}` : ''}</span>)}</div>
        ) : <p className="muted">No suggestions returned.</p>}
      </Card>
    )
  }

  if (ep.id === 'reverse') {
    const rv = d as { found?: boolean; unit?: { postcode: string; distance_m: number; confidence: string }; radius_m?: number; message?: string }
    return (
      <Card title="Reverse geocode">
        {rv.found && rv.unit ? (
          <div className="insight-row">
            <PostcodePlate code={rv.unit.postcode} />
            <span className={`badge ${rv.unit.confidence === 'high' ? 'pass' : rv.unit.confidence === 'medium' ? 'warn' : 'fail'}`}>{rv.unit.confidence} confidence</span>
            <span className="muted">{rv.unit.distance_m} m away · radius {rv.radius_m} m</span>
          </div>
        ) : <p className="muted">{rv.message} (radius {rv.radius_m} m)</p>}
      </Card>
    )
  }

  if (ep.id === 'nearby' && Array.isArray(d)) {
    return <NearbyPlot units={d as { postcode: string; distance_m: number }[]} />
  }
  return null
}

function KV({ obj }: { obj: Record<string, unknown> }) {
  return (
    <dl className="kv">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
      ))}
    </dl>
  )
}

/** Distance-only results: plot as a strip so clustering and the result cap are visible. */
function NearbyPlot({ units }: { units: { postcode: string; distance_m: number }[] }) {
  if (!units.length) return <Card title="Nearby units"><p className="muted">No units in range.</p></Card>
  const max = Math.max(...units.map((u) => u.distance_m), 1)
  return (
    <Card title={`Nearby units (${units.length})`}>
      <div className="bars">
        {units.map((u) => (
          <div key={u.postcode} className="bar-row">
            <span className="mono">{u.postcode}</span>
            <div className="bar-track"><div className="bar" style={{ width: `${(u.distance_m / max) * 100}%` }} /></div>
            <span className="mono muted num">{u.distance_m} m</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
