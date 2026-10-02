import { useState, type ReactNode } from 'react'
import { curlFor, type ApiResult } from '../api'
import type { Outcome, Severity } from '../checks'

export function StatusPill({ status }: { status: number }) {
  const cls = status === 0 ? 'bad' : status < 300 ? 'good' : status < 500 ? 'warn' : 'bad'
  return <span className={`pill ${cls}`}>{status === 0 ? 'NO RESPONSE' : status}</span>
}

const OUTCOME_ICON: Record<Outcome, string> = { pass: '✓', fail: '✕', warn: '!', info: 'i', error: '?' }
export function OutcomeBadge({ outcome }: { outcome: Outcome | 'running' | 'idle' }) {
  if (outcome === 'running') return <span className="badge running"><span className="spinner" /> running</span>
  if (outcome === 'idle') return <span className="badge idle">not run</span>
  return <span className={`badge ${outcome}`}>{OUTCOME_ICON[outcome]} {outcome}</span>
}

export function SeverityTag({ severity }: { severity: Severity }) {
  return <span className={`sev sev-${severity}`}>{severity}</span>
}

export function Json({ value }: { value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return <pre className="json">{text || '(empty body)'}</pre>
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn ghost sm"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? 'Copied' : label}
    </button>
  )
}

export function ResponseView({ r, body, compact }: { r: ApiResult; body?: string; compact?: boolean }) {
  const [tab, setTab] = useState<'body' | 'headers' | 'curl'>('body')
  const rl = r.headers['x-ratelimit-remaining']
  return (
    <div className="response">
      <div className="response-head">
        <StatusPill status={r.status} />
        <span className="mono muted">{r.timeMs} ms</span>
        {rl && <span className="mono muted">rate limit {rl}/{r.headers['x-ratelimit-limit']}</span>}
        <span className="mono muted auth-tag">{r.auth === 'env' ? 'env key' : r.auth === 'custom' ? 'custom key' : 'no key'}</span>
        <span className="spacer" />
        {!compact && (
          <div className="tabs">
            {(['body', 'headers', 'curl'] as const).map((t) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
        )}
      </div>
      <div className="mono url">{r.method} {r.url}</div>
      {r.error && <div className="error-line">{r.error}</div>}
      {tab === 'body' && <Json value={r.body} />}
      {tab === 'headers' && <Json value={r.headers} />}
      {tab === 'curl' && (
        <div className="rel">
          <Json value={curlFor(r, body)} />
          <div className="corner"><CopyButton text={curlFor(r, body)} /></div>
        </div>
      )}
    </div>
  )
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          <span className="spacer" />
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'neutral' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

/** Renders a postcode as its five labelled segments. */
export function PostcodePlate({ code }: { code: string }) {
  const c = code.replace(/[^a-z0-9]/gi, '').toUpperCase()
  if (c.length !== 11) return <span className="mono">{code}</span>
  const segs: [string, string][] = [
    [c.slice(0, 2), 'State'], [c.slice(2, 4), 'LGA'], [c.slice(4, 7), 'District'], [c.slice(7, 9), 'Area'], [c.slice(9, 11), 'Unit'],
  ]
  return (
    <div className="plate">
      {segs.map(([v, l]) => (
        <div key={l} className="plate-seg">
          <span className="plate-val">{v}</span>
          <span className="plate-lbl">{l}</span>
        </div>
      ))}
    </div>
  )
}
