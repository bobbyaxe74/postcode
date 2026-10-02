import { useEffect, useState } from 'react'
import { callApi, ENV_KEY_KIND, type ApiResult } from '../api'
import { CHECKS } from '../checks'
import { ENDPOINTS } from '../endpoints'
import type { History, Results } from '../store'
import { Card, OutcomeBadge, PostcodePlate, Stat } from './ui'

const RELATED: Record<string, string[]> = {
  lookup: ['lookup-', 'auth-public', 'val-lookup', 'auth-level'],
  autocomplete: ['ac-', 'auth-public'],
  reverse: ['rev-', 'auth-public'],
  nearby: ['nearby-', 'auth-public'],
  assemble: ['asm-doc', 'asm-zero', 'asm-invalid', 'asm-roundtrip', 'auth-public'],
  disassemble: ['asm-disassemble', 'asm-roundtrip', 'auth-public'],
  'widget-session': ['widget-'],
  healthz: ['auth-health'],
}

export type Page = 'overview' | 'playground' | 'tests' | 'report' | 'history'

export function Overview({ results, history, go }: { results: Results; history: History; go: (p: Page) => void }) {
  const [health, setHealth] = useState<ApiResult | null>(null)
  const [keyProbe, setKeyProbe] = useState<ApiResult | null>(null)

  useEffect(() => {
    callApi({ path: '/healthz', auth: 'none' }).then(setHealth)
    callApi({ path: '/v1/lookup', query: { code: 'FC-03-B06-AG-12', level: 1 } }).then(setKeyProbe)
  }, [])

  const rs = Object.values(results)
  const fails = rs.filter((r) => r.outcome === 'fail').length
  const warns = rs.filter((r) => r.outcome === 'warn').length
  const passes = rs.filter((r) => r.outcome === 'pass').length
  const latest = history[0] ?? keyProbe
  const keyOk = keyProbe?.status === 200

  return (
    <div className="stack">
      <div className="stats">
        <Stat label="Gateway" value={health ? (health.status === 200 ? 'Online' : 'Down') : '…'} tone={health ? (health.status === 200 ? 'good' : 'bad') : 'neutral'} />
        <Stat label={`API key (${ENV_KEY_KIND})`} value={keyProbe ? (keyOk ? 'Accepted' : `HTTP ${keyProbe.status}`) : '…'} tone={keyProbe ? (keyOk ? 'good' : 'bad') : 'neutral'} />
        <Stat label="Rate limit remaining" value={latest?.headers['x-ratelimit-remaining'] ? `${latest.headers['x-ratelimit-remaining']}/${latest.headers['x-ratelimit-limit']}` : '-'} tone="neutral" />
        <Stat label="Checks pass / fail / warn" value={rs.length ? `${passes} / ${fails} / ${warns}` : 'Not run'} tone={fails ? 'bad' : rs.length ? 'good' : 'neutral'} />
      </div>

      <div className="grid-2">
        <Card title="Get started">
          <ol className="steps">
            <li><button className="link" onClick={() => go('playground')}>Playground</button>: send requests to any endpoint, with or without your key.</li>
            <li><button className="link" onClick={() => go('tests')}>Test suite</button>: run {CHECKS.length} automated checks of the docs' claims against the live API.</li>
            <li><button className="link" onClick={() => go('report')}>Report</button>: produce a shareable write-up (PDF, Markdown or JSON).</li>
          </ol>
          <p className="muted sm">Your key stays on the Vite dev server and is never sent to the browser. The proxy adds it to each request.</p>
        </Card>

        <Card title="Postcode format">
          <PostcodePlate code="FC-03-B06-AG-12" />
          <p className="muted sm">12 characters in 5 segments: <code>AA-99-H77-BB-55</code>. Numeric segments are zero-filled, 01–99. Input may be dashed, spaced or compact.</p>
        </Card>
      </div>

      <Card title="API surface">
        <table className="table">
          <thead><tr><th>Endpoint</th><th>Host</th><th>Documented access</th><th>Related checks</th></tr></thead>
          <tbody>
            {ENDPOINTS.map((e) => {
              const related = CHECKS.filter((c) => RELATED[e.id]?.some((p) => c.id.startsWith(p)))
              return (
                <tr key={e.id}>
                  <td><span className={`method ${e.method.toLowerCase()}`}>{e.method}</span> <code>{e.path}</code></td>
                  <td className="muted">{e.host === 'gw' ? 'api' : 'platform'}</td>
                  <td>{e.access}</td>
                  <td>
                    <div className="mini-badges">
                      {related.map((c) => <span key={c.id} title={c.title}><OutcomeBadge outcome={results[c.id]?.outcome ?? 'idle'} /></span>)}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
