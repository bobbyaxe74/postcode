import { useState } from 'react'
import type { History } from '../store'
import { Card, ResponseView, StatusPill } from './ui'

export function HistoryView({ history, clear }: { history: History; clear: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Card title={`Request history (${history.length})`} actions={<button className="btn ghost" onClick={clear} disabled={!history.length}>Clear</button>}>
      {!history.length && <p className="muted">Requests you send from the Playground appear here.</p>}
      <div className="checks">
        {history.map((r) => (
          <div key={r.id} className="check-row">
            <button className="check-head" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <StatusPill status={r.status} />
              <span className={`method ${r.method.toLowerCase()}`}>{r.method}</span>
              <span className="mono check-title">{r.url.replace(/^https:\/\//, '')}</span>
              <span className="spacer" />
              <span className="muted mono sm">{r.timeMs} ms · {new Date(r.ts).toLocaleTimeString()}</span>
            </button>
            {open === r.id && <div className="check-body"><ResponseView r={r} /></div>}
          </div>
        ))}
      </div>
    </Card>
  )
}
