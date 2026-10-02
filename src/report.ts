import { ENV_KEY_KIND } from './api'
import { CHECKS, type Outcome, type Severity } from './checks'
import type { ReportMeta, Results } from './store'

/** Recommended action per automated check, used when that check fails or warns. */
const RECOMMENDATIONS: Record<string, string> = {
  'auth-public': 'Either make these endpoints public as documented, or update the docs to say every call needs a key. Until then, plan for key management even on free tiers, and format/validate postcodes locally rather than calling Assembly.',
  'auth-level-not-granted': 'Handle 403 level_not_granted explicitly. Request the highest level you need and fall back on error.',
  'auth-ratelimit-headers': 'Send rate-limit headers on every response, including errors.',
  'auth-cors': 'Add Access-Control-Expose-Headers: X-RateLimit-Limit, X-RateLimit-Remaining.',
  'lookup-doc-example': 'Replace EK-01-A03-FK-01 in the docs with a postcode that exists in production.',
  'lookup-test-postcodes': 'Refresh the test postcode table. Integrators should not rely on it. Use reverse geocode or nearby search to find live codes.',
  'lookup-input-tolerance': 'Normalize input client-side to the dashed form before calling.',
  'lookup-echo-normalized': 'Always echo the canonical dashed form. Until then, normalize the echoed value client-side.',
  'lookup-schema': 'Add `status` and `verified` to the spec and docs, with their enum values and meaning.',
  'val-lookup-missing-code': 'Return 400 for a missing code instead of a 200 "invalid".',
  'val-lookup-level-range': 'Validate `level` and return 400 for values outside 1–5 or non-integers.',
  'val-envelope': 'Return the JSON error envelope for unknown routes too (currently plain-text 404).',
  'asm-zero-segment': 'Reject 00 in assemble to match the documented rule and disassemble’s behaviour.',
  'asm-disassemble-forms': 'Accept all documented input styles.',
  'ac-doc-example': 'Return `label` (the place name) for each suggestion as the spec documents.',
  'ac-segments': 'Fix unit-level autocomplete, or document that completion stops at the area segment.',
  'ac-empty': 'Validate `q` up front and return 400 immediately. Clients should debounce and never send an empty q.',
  'nearby-radius': 'Document the result cap and add pagination (limit/offset or cursor) if more results are needed.',
  'nearby-schema': 'Add a response schema for nearby search, and make gateway and widget shapes consistent.',
  'rev-found': 'Investigate reverse geocode correctness.',
  'rev-consistent': 'Make reverse geocode return only units that look up as valid.',
}

/** How each check reads as a finding when it fails or warns: state the problem, not the expectation. */
const ISSUE_TITLES: Record<string, string> = {
  'auth-health': 'Health check is unreachable',
  'auth-public': 'Every endpoint requires an API key, including those documented as public',
  'auth-invalid-key': 'Invalid API keys are not rejected correctly',
  'auth-level-not-granted': 'Over-level lookups are refused (403), not capped as the docs describe',
  'auth-ratelimit-headers': 'Rate-limit headers are missing on error responses',
  'auth-cors': 'Browser clients cannot read rate-limit headers (CORS)',
  'lookup-doc-example': 'The docs’ own example postcode (EK-01-A03-FK-01) does not exist',
  'lookup-test-postcodes': 'Most documented test postcodes return not_found',
  'lookup-input-tolerance': 'Lookup is not tolerant of all documented input formats',
  'lookup-echo-normalized': 'Echoed postcode format depends on whether the code exists',
  'lookup-invalid': 'Malformed postcodes are not reported as invalid',
  'lookup-schema': 'Lookup returns undocumented fields (status, verified)',
  'val-lookup-missing-code': 'Missing `code` returns 200 instead of 400',
  'val-lookup-level-range': 'Invalid `level` values are silently accepted',
  'val-envelope': 'Unknown routes return plain text instead of the JSON error envelope',
  'asm-doc-example': 'Assemble does not match the documented example',
  'asm-zero-segment': 'Assemble accepts 00 segments that disassemble rejects',
  'asm-invalid': 'Assemble does not reject malformed segments',
  'asm-disassemble-forms': 'Disassemble rejects documented input formats',
  'asm-roundtrip': 'Assemble → disassemble does not round-trip',
  'ac-doc-example': 'Autocomplete suggestions have no `label` (place name)',
  'ac-segments': 'Autocomplete returns nothing at the unit segment',
  'ac-empty': 'Autocomplete with an empty query hangs instead of returning 400',
  'rev-found': 'Reverse geocode fails for a known coordinate',
  'rev-consistent': 'Reverse geocode returns postcodes that do not look up as valid',
  'rev-clamp': 'Reverse geocode does not clamp the radius to 250 m',
  'rev-not-found': 'Reverse geocode mishandles empty areas',
  'rev-missing': 'Reverse geocode does not validate lat/lng',
  'nearby-radius': 'Nearby search is silently capped at 10 results, whatever the radius',
  'nearby-schema': 'Nearby search response is undocumented and differs from the widget variant',
  'widget-secret-key': 'Widget session accepts a secret key',
  'widget-no-key': 'Widget session works without a key',
  'perf-latency': 'Latency above 1.5 s p50',
}

const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

export interface ReportItem {
  id: string
  title: string
  severity: Severity
  area: string
  status: Outcome
  claim?: string
  expected?: string
  observed: string
  notes?: string
  recommendation: string
  docRef?: string
}

export interface ReportModel {
  meta: ReportMeta
  generatedAt: string
  keyKind: string
  totals: Record<Outcome, number> & { total: number; notRun: number }
  bySeverity: Record<Severity, number>
  issues: ReportItem[]
  passed: { title: string; area: string }[]
  info: ReportItem[]
}

export function buildReport(meta: ReportMeta, results: Results): ReportModel {
  const totals = { pass: 0, fail: 0, warn: 0, info: 0, error: 0, total: CHECKS.length, notRun: 0 }
  const issues: ReportItem[] = []
  const passed: { title: string; area: string }[] = []
  const info: ReportItem[] = []

  for (const c of CHECKS) {
    const r = results[c.id]
    if (!r) {
      totals.notRun++
      continue
    }
    totals[r.outcome]++
    const item: ReportItem = {
      id: c.id, title: r.outcome === 'pass' || r.outcome === 'info' ? c.title : ISSUE_TITLES[c.id] ?? c.title, area: c.category, status: r.outcome, claim: c.claim, docRef: c.docRef,
      expected: r.expected, observed: r.actual, notes: r.notes,
      severity: r.outcome === 'warn' ? demote(c.severity) : c.severity,
      recommendation: RECOMMENDATIONS[c.id] ?? '',
    }
    if (r.outcome === 'pass') passed.push({ title: c.title, area: c.category })
    else if (r.outcome === 'info') info.push(item)
    else issues.push(item)
  }

  issues.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || rank(a.status) - rank(b.status))
  const bySeverity = Object.fromEntries(SEV_ORDER.map((s) => [s, issues.filter((i) => i.severity === s).length])) as Record<Severity, number>

  return { meta, generatedAt: new Date().toISOString(), keyKind: ENV_KEY_KIND, totals, bySeverity, issues, passed, info }
}

function demote(s: Severity): Severity {
  return s === 'critical' ? 'high' : s === 'high' ? 'medium' : s === 'medium' ? 'low' : s
}
function rank(s: ReportItem['status']) {
  return ['fail', 'error', 'warn'].indexOf(s)
}

export const STATUS_LABEL: Record<ReportItem['status'], string> = {
  pass: 'Pass', fail: 'Fail', warn: 'Warning', info: 'Info', error: 'Error',
}

export function autoSummary(m: ReportModel): string {
  const ran = m.totals.total - m.totals.notRun
  if (!ran) return 'No automated checks have been run yet.'
  const passedIds = new Set(m.passed.map((p) => p.title))
  const works = [
    ['Reverse geocode resolves a known coordinate', 'reverse geocoding'],
    ['Assemble zero-fills and uppercases (docs example)', 'assembly'],
    ['Lookup accepts dashed, spaced, compact and lowercase input', 'L1 lookup of live postcodes'],
    ['Widget session rejects a secret key', 'widget key enforcement'],
  ].filter(([t]) => passedIds.has(t)).map(([, label]) => label)
  const top = m.issues.filter((i) => i.severity === 'critical' || i.severity === 'high').slice(0, 3).map((i) => i.title)
  return [
    `We ran ${ran} automated checks against the live NIPOST Postcode API (api.postcode.gov.ng) with a ${m.keyKind} key: ${m.totals.pass} passed, ${m.totals.fail} failed and ${m.totals.warn} raised warnings.`,
    works.length ? `Working as documented: ${works.join(', ')}.` : '',
    top.length ? `Most significant issues: ${top.join('; ')}.` : '',
    m.totals.fail + m.totals.warn > 0 ? 'Because behaviour differs from the documentation in several places, integrators should test against the live API rather than rely on the docs alone.' : '',
  ].filter(Boolean).join(' ')
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function toMarkdown(m: ReportModel): string {
  const L: string[] = []
  L.push(`# ${m.meta.title}`, '')
  L.push(`**Generated:** ${new Date(m.generatedAt).toLocaleString()}  `)
  if (m.meta.preparedBy) L.push(`**Prepared by:** ${m.meta.preparedBy}  `)
  L.push(`**Audience:** ${m.meta.audience}  `)
  L.push(`**Target:** https://api.postcode.gov.ng · Docs: https://docs.postcode.gov.ng · Key type: \`${m.keyKind}\``, '')

  L.push('## Executive summary', '', m.meta.summary || autoSummary(m), '')

  L.push('## Results at a glance', '')
  L.push('| Passed | Failed | Warnings | Info | Errors | Not run |', '|---|---|---|---|---|---|')
  L.push(`| ${m.totals.pass} | ${m.totals.fail} | ${m.totals.warn} | ${m.totals.info} | ${m.totals.error} | ${m.totals.notRun} |`, '')
  L.push('| Critical | High | Medium | Low | Info |', '|---|---|---|---|---|')
  L.push(`| ${m.bySeverity.critical} | ${m.bySeverity.high} | ${m.bySeverity.medium} | ${m.bySeverity.low} | ${m.bySeverity.info} |`, '')

  L.push('## Findings', '')
  L.push('| # | Severity | Area | Finding | Result |', '|---|---|---|---|---|')
  m.issues.forEach((i, n) => L.push(`| ${n + 1} | ${i.severity} | ${i.area} | ${esc(i.title)} | ${STATUS_LABEL[i.status]} |`))
  L.push('')

  m.issues.forEach((i, n) => {
    L.push(`### ${n + 1}. ${i.title}`, '')
    L.push(`**Severity:** ${i.severity} · **Area:** ${i.area} · **Result:** ${STATUS_LABEL[i.status]}`, '')
    if (i.claim) L.push(`**Documented behaviour:** ${i.claim}${i.docRef ? ` ([source](${i.docRef}))` : ''}`, '')
    if (i.expected) L.push(`**Expected:** ${i.expected}`, '')
    L.push(`**Observed:** ${i.observed}`, '')
    if (i.notes) L.push(`**Impact:** ${i.notes}`, '')
    if (i.recommendation) L.push(`**Recommendation:** ${i.recommendation}`, '')
  })

  if (m.passed.length) {
    L.push('## What works', '')
    m.passed.forEach((p) => L.push(`- ${p.title} *(${p.area})*`))
    L.push('')
  }
  if (m.info.length) {
    L.push('## Observations', '')
    m.info.forEach((i) => L.push(`- **${i.title}:** ${i.observed}`))
    L.push('')
  }
  L.push('## Method', '')
  L.push('Checks were run from a local dashboard through a dev-server proxy, which injects the API key server-side. Each check encodes one claim from the public docs or OpenAPI spec and compares it with live responses. Latency figures include the local proxy hop.', '')
  return L.join('\n')
}
