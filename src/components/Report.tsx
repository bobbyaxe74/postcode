import { useMemo } from 'react'
import { autoSummary, buildReport, STATUS_LABEL, toMarkdown } from '../report'
import type { ReportMeta, Results } from '../store'
import { Card, CopyButton, SeverityTag, Stat } from './ui'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function Report({ meta, setMeta, results }: { meta: ReportMeta; setMeta: (m: ReportMeta) => void; results: Results }) {
  const model = useMemo(() => buildReport(meta, results), [meta, results])
  const md = useMemo(() => toMarkdown(model), [model])
  const stamp = model.generatedAt.slice(0, 10)
  const ran = model.totals.total - model.totals.notRun

  return (
    <div className="stack">
      <Card title="Report settings" className="no-print">
        <div className="form">
          <label className="field full"><span>Title</span><input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></label>
          <label className="field"><span>Prepared by</span><input value={meta.preparedBy} onChange={(e) => setMeta({ ...meta, preparedBy: e.target.value })} /></label>
          <label className="field"><span>Audience</span><input value={meta.audience} onChange={(e) => setMeta({ ...meta, audience: e.target.value })} /></label>
          <label className="field full">
            <span>Executive summary <small className="muted">(leave blank to auto-generate from results)</small></span>
            <textarea rows={4} value={meta.summary} placeholder={autoSummary(model)} onChange={(e) => setMeta({ ...meta, summary: e.target.value })} />
          </label>
        </div>
        {ran === 0 && <p className="error-line">No checks have run yet. Go to Test suite → Run all for a complete report.</p>}
        <div className="form-actions">
          <button className="btn primary" onClick={() => window.print()}>Print / Save as PDF</button>
          <button className="btn" onClick={() => download(`postcode-api-report-${stamp}.md`, md, 'text/markdown')}>Download Markdown</button>
          <button className="btn" onClick={() => download(`postcode-api-results-${stamp}.json`, JSON.stringify({ model, results }, null, 2), 'application/json')}>Download raw JSON</button>
          <CopyButton text={md} label="Copy Markdown" />
        </div>
      </Card>

      <article className="report">
        <header>
          <h1>{model.meta.title}</h1>
          <p className="muted">
            Generated {new Date(model.generatedAt).toLocaleString()}
            {model.meta.preparedBy && <> · Prepared by {model.meta.preparedBy}</>} · For {model.meta.audience}
          </p>
          <p className="muted sm">Target: api.postcode.gov.ng · Docs: docs.postcode.gov.ng · Key type: <code>{model.keyKind}</code></p>
        </header>

        <h2>Executive summary</h2>
        <p>{model.meta.summary || autoSummary(model)}</p>

        <h2>Results at a glance</h2>
        <div className="stats">
          <Stat label="Checks passed" value={model.totals.pass} tone="good" />
          <Stat label="Checks failed" value={model.totals.fail} tone="bad" />
          <Stat label="Warnings" value={model.totals.warn} tone="warn" />
          <Stat label="High / critical issues" value={model.bySeverity.high + model.bySeverity.critical} tone="bad" />
          <Stat label="Total findings" value={model.issues.length} tone="neutral" />
        </div>

        <h2>Findings</h2>
        <table className="table">
          <thead><tr><th>#</th><th>Severity</th><th>Area</th><th>Finding</th><th>Result</th></tr></thead>
          <tbody>
            {model.issues.map((i, n) => (
              <tr key={i.id}>
                <td className="num">{n + 1}</td>
                <td><SeverityTag severity={i.severity} /></td>
                <td>{i.area}</td>
                <td><a href={`#f-${i.id}`}>{i.title}</a></td>
                <td>{STATUS_LABEL[i.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {model.issues.map((i, n) => (
          <section key={i.id} id={`f-${i.id}`} className="finding">
            <h3>{n + 1}. {i.title}</h3>
            <p className="meta"><SeverityTag severity={i.severity} /> <span className="muted">{i.area} · {STATUS_LABEL[i.status]}</span></p>
            <dl className="kv wide">
              {i.claim && <div><dt>Docs say</dt><dd>{i.claim}{i.docRef && <> <a href={i.docRef} target="_blank" rel="noreferrer">source ↗</a></>}</dd></div>}
              {i.expected && <div><dt>Expected</dt><dd>{i.expected}</dd></div>}
              <div><dt>Observed</dt><dd>{i.observed}</dd></div>
              {i.notes && <div><dt>Impact</dt><dd>{i.notes}</dd></div>}
              {i.recommendation && <div><dt>Recommendation</dt><dd>{i.recommendation}</dd></div>}
            </dl>
          </section>
        ))}

        {model.passed.length > 0 && (
          <>
            <h2>What works</h2>
            <ul className="passed">{model.passed.map((p) => <li key={p.title}>✓ {p.title} <span className="muted">({p.area})</span></li>)}</ul>
          </>
        )}

        {model.info.length > 0 && (
          <>
            <h2>Observations</h2>
            <ul>{model.info.map((i) => <li key={i.id}><strong>{i.title}:</strong> {i.observed}</li>)}</ul>
          </>
        )}

        <h2>Method</h2>
        <p className="muted">
          Checks were run from a local dashboard through a dev-server proxy, which injects the API key server-side. Each check encodes one claim from the public docs or OpenAPI spec and compares it with live responses. Latency figures include the local proxy hop.
        </p>
      </article>
    </div>
  )
}
