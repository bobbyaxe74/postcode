import { useState } from 'react'
import { ENV_KEY_KIND } from './api'
import { HistoryView } from './components/HistoryView'
import { Overview, type Page } from './components/Overview'
import { Playground } from './components/Playground'
import { Report } from './components/Report'
import { TestSuite } from './components/TestSuite'
import { DEFAULT_META, usePersistent, type History, type ReportMeta, type Results } from './store'

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◎' },
  { id: 'playground', label: 'Playground', icon: '⌁' },
  { id: 'tests', label: 'Test suite', icon: '✓' },
  { id: 'report', label: 'Report', icon: '▤' },
  { id: 'history', label: 'History', icon: '↺' },
]

export default function App() {
  const [savedPage, setPage] = usePersistent<Page>('pc.page', 'overview')
  const page = NAV.some((n) => n.id === savedPage) ? savedPage : 'overview'
  const [results, setResults] = usePersistent<Results>('pc.results', {})
  const [history, setHistory] = usePersistent<History>('pc.history', [])
  const [meta, setMeta] = usePersistent<ReportMeta>('pc.meta', DEFAULT_META)
  const [menu, setMenu] = useState(false)

  const fails = Object.values(results).filter((r) => r.outcome === 'fail').length
  const go = (p: Page) => {
    setPage(p)
    setMenu(false)
    window.scrollTo(0, 0)
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo">PC</div>
          <div>
            <div className="brand-name">Postcode API</div>
            <div className="muted sm">Test dashboard</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${page === n.id ? 'on' : ''}`} onClick={() => go(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
              {n.id === 'tests' && fails > 0 && <span className="count bad">{fails}</span>}
              {n.id === 'history' && history.length > 0 && <span className="count">{history.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot muted sm">
          <div>Key: <code>{ENV_KEY_KIND}</code></div>
          <a href="https://docs.postcode.gov.ng" target="_blank" rel="noreferrer">docs.postcode.gov.ng ↗</a>
        </div>
      </aside>

      <main className="main">
        <header className="topbar no-print">
          <button className="btn ghost menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
          <h2>{NAV.find((n) => n.id === page)?.label}</h2>
        </header>
        <div className="content">
          {page === 'overview' && <Overview results={results} history={history} go={go} />}
          {page === 'playground' && <Playground onResult={(r) => setHistory((h) => [r, ...h].slice(0, 200))} />}
          {page === 'tests' && <TestSuite results={results} setResults={setResults} />}
          {page === 'report' && <Report meta={meta} setMeta={setMeta} results={results} />}
          {page === 'history' && <HistoryView history={history} clear={() => setHistory([])} />}
        </div>
      </main>
    </div>
  )
}
