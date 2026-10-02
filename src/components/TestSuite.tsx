import { useState } from 'react'
import { CATEGORIES, CHECKS, runCheck, type Check, type Outcome } from '../checks'
import type { Results } from '../store'
import { Card, OutcomeBadge, ResponseView, SeverityTag, Stat } from './ui'

type Filter = 'all' | Outcome | 'idle'

export function TestSuite({ results, setResults }: { results: Results; setResults: (f: (p: Results) => Results) => void }) {
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const run = async (checks: Check[]) => {
    setRunning(new Set(checks.map((c) => c.id)))
    // Small concurrency pool: fast, but gentle on the 600/min rate limit.
    const queue = [...checks]
    const worker = async () => {
      while (queue.length) {
        const c = queue.shift()!
        const r = await runCheck(c)
        setResults((p) => ({ ...p, [c.id]: r }))
        setRunning((s) => {
          const n = new Set(s)
          n.delete(c.id)
          return n
        })
      }
    }
    await Promise.all([worker(), worker(), worker()])
  }

  const counts = { pass: 0, fail: 0, warn: 0, info: 0, error: 0 } as Record<Outcome, number>
  Object.values(results).forEach((r) => counts[r.outcome]++)
  const notRun = CHECKS.filter((c) => !results[c.id]).length
  const busy = running.size > 0
  const lastRun = Math.max(0, ...Object.values(results).map((r) => r.ranAt))

  const visible = (c: Check) => {
    if (filter === 'all') return true
    if (filter === 'idle') return !results[c.id]
    return results[c.id]?.outcome === filter
  }

  return (
    <div className="stack">
      <Card
        title="Conformance checks"
        actions={
          <>
            {lastRun > 0 && <span className="muted sm">Last run {new Date(lastRun).toLocaleString()}</span>}
            <button className="btn ghost" disabled={busy} onClick={() => setResults(() => ({}))}>Clear</button>
            <button className="btn primary" disabled={busy} onClick={() => run(CHECKS)}>
              {busy ? `Running… ${CHECKS.length - running.size}/${CHECKS.length}` : `Run all ${CHECKS.length} checks`}
            </button>
          </>
        }
      >
        <p className="muted">
          Each check takes one claim from the docs or OpenAPI spec and tests it against the live API. Failures and warnings feed straight into the report.
        </p>
        <div className="stats">
          <Stat label="Passed" value={counts.pass} tone="good" />
          <Stat label="Failed" value={counts.fail} tone="bad" />
          <Stat label="Warnings" value={counts.warn} tone="warn" />
          <Stat label="Info / errors" value={counts.info + counts.error} tone="neutral" />
          <Stat label="Not run" value={notRun} tone="neutral" />
        </div>
        {busy && <div className="progress"><div style={{ width: `${((CHECKS.length - running.size) / CHECKS.length) * 100}%` }} /></div>}
        <div className="seg filter">
          {(['all', 'fail', 'warn', 'pass', 'info', 'error', 'idle'] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'idle' ? 'not run' : f}</button>
          ))}
        </div>
      </Card>

      {CATEGORIES.map((cat) => {
        const list = CHECKS.filter((c) => c.category === cat && visible(c))
        if (!list.length) return null
        return (
          <Card key={cat} title={cat} actions={<button className="btn ghost sm" disabled={busy} onClick={() => run(CHECKS.filter((c) => c.category === cat))}>Run group</button>}>
            <div className="checks">
              {list.map((c) => {
                const r = results[c.id]
                const isOpen = open === c.id
                return (
                  <div key={c.id} className={`check-row ${isOpen ? 'open' : ''}`}>
                    <button className="check-head" onClick={() => setOpen(isOpen ? null : c.id)}>
                      <OutcomeBadge outcome={running.has(c.id) ? 'running' : r?.outcome ?? 'idle'} />
                      <span className="check-title">{c.title}</span>
                      {r && (r.outcome === 'fail' || r.outcome === 'warn') && <SeverityTag severity={c.severity} />}
                      <span className="spacer" />
                      {r && <span className="muted mono sm">{r.durationMs} ms</span>}
                      <span className="chev">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="check-body">
                        <dl className="kv wide">
                          <div><dt>Docs say</dt><dd>{c.claim} <a href={c.docRef} target="_blank" rel="noreferrer">source ↗</a></dd></div>
                          {r && <div><dt>Expected</dt><dd>{r.expected}</dd></div>}
                          {r && <div><dt>Observed</dt><dd className="mono-ish">{r.actual}</dd></div>}
                          {r?.notes && <div><dt>Impact</dt><dd>{r.notes}</dd></div>}
                        </dl>
                        <div className="form-actions">
                          <button className="btn sm" disabled={busy} onClick={() => run([c])}>Re-run</button>
                        </div>
                        {r && r.evidence.length > 0 && (
                          <details>
                            <summary>Evidence ({r.evidence.length} request{r.evidence.length > 1 ? 's' : ''})</summary>
                            <div className="stack">{r.evidence.map((e) => <ResponseView key={e.id} r={e} compact />)}</div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
