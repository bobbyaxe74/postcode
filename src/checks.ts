import { callApi, dataOf, errorOf, type ApiResult } from './api'
import { TEST_POSTCODES } from './endpoints'

export type Outcome = 'pass' | 'fail' | 'warn' | 'info' | 'error'
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type Category = 'Authentication' | 'Lookup' | 'Search' | 'Assembly' | 'Widget' | 'Errors & validation' | 'Performance' | 'Spec conformance'

export interface CheckResult {
  outcome: Outcome
  expected: string
  actual: string
  notes?: string
  evidence: ApiResult[]
}

export interface Check {
  id: string
  title: string
  category: Category
  /** Severity if the check fails or warns. */
  severity: Severity
  claim: string
  docRef: string
  run: () => Promise<CheckResult>
}

export interface StoredResult extends CheckResult {
  id: string
  ranAt: number
  durationMs: number
}

const DOCS = 'https://docs.postcode.gov.ng'
const KNOWN_VALID = 'FC-03-B06-AG-12'
const LAGOS = { lat: 6.45, lng: 3.39 }

const st = (r: ApiResult) => (r.status === 0 ? r.error ?? 'no response' : `HTTP ${r.status}`)
const brief = (r: ApiResult) => {
  const e = errorOf(r.body)
  if (e) return `${st(r)} ${e.code}: ${e.message}`
  if (r.status === 0) return st(r)
  const s = typeof r.body === 'string' ? r.body : JSON.stringify(r.body)
  return `${st(r)} ${s.length > 160 ? s.slice(0, 160) + '…' : s}`
}
const isEnvelope = (b: unknown) => {
  const e = errorOf(b)
  return !!e && typeof e.code === 'string' && typeof e.message === 'string'
}

export const CHECKS: Check[] = [
  // ───────────── Authentication ─────────────
  {
    id: 'auth-health', title: 'Health check is reachable without a key', category: 'Authentication', severity: 'critical',
    claim: 'GET /healthz returns 200 and requires no security.', docRef: `${DOCS}/api-reference/openapi.yaml`,
    run: async () => {
      const r = await callApi({ path: '/healthz', auth: 'none' })
      return { outcome: r.status === 200 ? 'pass' : 'fail', expected: 'HTTP 200', actual: brief(r), evidence: [r] }
    },
  },
  {
    id: 'auth-public', title: 'Search, Assembly and Lookup L1 work without a key', category: 'Authentication', severity: 'high',
    claim: 'Search, Assembly and Lookup L1 are public and need no API key.',
    docRef: `${DOCS}/authentication#scopes-%26-access-levels`,
    run: async () => {
      const calls: [string, Parameters<typeof callApi>[0]][] = [
        ['lookup L1', { path: '/v1/lookup', query: { code: KNOWN_VALID, level: 1 } }],
        ['autocomplete', { path: '/v1/search/autocomplete', query: { q: 'EK01' } }],
        ['reverse', { path: '/v1/search/reverse', query: LAGOS }],
        ['nearby', { path: '/v1/search/nearby', query: LAGOS }],
        ['disassemble', { path: '/v1/assembly/disassemble', query: { code: 'EK01A03FK01' } }],
        ['assemble', { path: '/v1/assembly/assemble', method: 'POST', body: { state: 'ek', lga: '1', district: 'a03', area: 'fk', unit: '1' } }],
      ]
      const rs = await Promise.all(calls.map(([, req]) => callApi({ ...req, auth: 'none' })))
      const blocked = calls.filter((_, i) => rs[i].status !== 200).map(([n]) => n)
      return {
        outcome: blocked.length === 0 ? 'pass' : 'fail',
        expected: 'HTTP 200 for all 6 endpoints without X-API-Key',
        actual: calls.map(([n], i) => `${n} → ${rs[i].status}${errorOf(rs[i].body)?.code ? ` ${errorOf(rs[i].body)?.code}` : ''}`).join('; '),
        notes: blocked.length ? `${blocked.length}/6 documented-public endpoints need a key. Keyless client-side use (e.g. a public type-ahead) is not possible as the docs describe.` : undefined,
        evidence: rs,
      }
    },
  },
  {
    id: 'auth-invalid-key', title: 'Invalid key is rejected with 401', category: 'Authentication', severity: 'high',
    claim: '401 = missing/invalid API key.', docRef: `${DOCS}/authentication#errors`,
    run: async () => {
      const r = await callApi({ path: '/v1/lookup', query: { code: KNOWN_VALID, level: 1 }, auth: 'custom', customKey: 'nipost_test_definitely_not_real' })
      return {
        outcome: r.status === 401 && isEnvelope(r.body) ? 'pass' : 'fail',
        expected: 'HTTP 401 with error envelope', actual: brief(r), evidence: [r],
      }
    },
  },
  {
    id: 'auth-level-not-granted', title: 'Requesting above granted level returns 403', category: 'Authentication', severity: 'medium',
    claim: '403 = key lacks the scope or level for this request; responses are capped at the granted level.',
    docRef: `${DOCS}/concepts/lookup-levels`,
    run: async () => {
      const r = await callApi({ path: '/v1/lookup', query: { code: KNOWN_VALID, level: 3 } })
      const d = dataOf<Record<string, unknown>>(r.body)
      if (r.status === 200 && d?.building_use_status !== undefined) {
        return { outcome: 'info', expected: '403 if key < L3', actual: 'Key has L3 access; check not applicable', evidence: [r] }
      }
      if (r.status === 200) {
        return { outcome: 'warn', expected: 'HTTP 403 level_not_granted, or a capped 200 that says so', actual: `${brief(r)} (silently capped)`, evidence: [r] }
      }
      const docsSayCapped = 'Docs say "the response is capped at your organization\'s granted level" but the API refuses instead of capping.'
      return {
        outcome: r.status === 403 ? 'pass' : 'fail', expected: 'HTTP 403', actual: brief(r),
        notes: r.status === 403 ? docsSayCapped : undefined, evidence: [r],
      }
    },
  },
  {
    id: 'auth-ratelimit-headers', title: 'Rate-limit headers are present', category: 'Authentication', severity: 'low',
    claim: 'Each response includes X-RateLimit-Limit and X-RateLimit-Remaining.', docRef: `${DOCS}/authentication#rate-limits`,
    run: async () => {
      const ok = await callApi({ path: '/v1/lookup', query: { code: KNOWN_VALID, level: 1 } })
      const err = await callApi({ path: '/v1/lookup', query: { code: KNOWN_VALID, level: 1 }, auth: 'none' })
      const has = (r: ApiResult) => 'x-ratelimit-limit' in r.headers && 'x-ratelimit-remaining' in r.headers
      const outcome: Outcome = has(ok) ? (has(err) ? 'pass' : 'warn') : 'fail'
      return {
        outcome, expected: 'Both headers on every response',
        actual: `Keyed 200: ${has(ok) ? `limit=${ok.headers['x-ratelimit-limit']} remaining=${ok.headers['x-ratelimit-remaining']}` : 'missing'}; unkeyed ${err.status}: ${has(err) ? 'present' : 'missing'}`,
        notes: outcome === 'warn' ? 'Headers are only sent on keyed responses.' : undefined,
        evidence: [ok, err],
      }
    },
  },
  {
    id: 'auth-cors', title: 'Browser CORS is allowed for direct calls', category: 'Authentication', severity: 'medium',
    claim: 'Publishable keys are meant to run in browsers, so the gateway must allow CORS with X-API-Key.',
    docRef: `${DOCS}/widget/publishable-keys`,
    run: async () => {
      // A custom header forces a preflight; the bogus key keeps the real one out of the browser.
      const r = await callApi({ path: '/v1/lookup', query: { code: KNOWN_VALID }, direct: true, auth: 'custom', customKey: 'nipost_pk_test_cors_probe' })
      const exposed = 'x-ratelimit-limit' in r.headers
      return {
        outcome: r.status > 0 ? 'pass' : 'fail',
        expected: 'Response readable from a browser origin after preflight',
        actual: r.status > 0 ? `${brief(r)}` : r.error ?? 'blocked',
        notes: r.status > 0 && !exposed ? 'Access-Control-Expose-Headers is not set, so browsers cannot read X-RateLimit-* headers.' : undefined,
        evidence: [r],
      }
    },
  },

  // ───────────── Lookup ─────────────
  {
    id: 'lookup-doc-example', title: 'Docs example postcode EK-01-A03-FK-01 is valid', category: 'Lookup', severity: 'medium',
    claim: 'Quickstart and every example use EK-01-A03-FK-01 and show valid: true.', docRef: `${DOCS}/quickstart`,
    run: async () => {
      const r = await callApi({ path: '/v1/lookup', query: { code: 'EK-01-A03-FK-01', level: 1 } })
      const d = dataOf<{ valid?: boolean; status?: string }>(r.body)
      return {
        outcome: d?.valid === true ? 'pass' : 'fail', expected: 'valid: true', actual: brief(r), evidence: [r],
      }
    },
  },
  {
    id: 'lookup-test-postcodes', title: 'All 20 documented test postcodes resolve as valid', category: 'Lookup', severity: 'high',
    claim: 'Lookup levels page: "Use these real, active postcodes to test your integration."',
    docRef: `${DOCS}/concepts/lookup-levels#test-postcodes`,
    run: async () => {
      const rs = await Promise.all(TEST_POSTCODES.map(([c]) => callApi({ path: '/v1/lookup', query: { code: c, level: 1 } })))
      const rows = rs.map((r, i) => {
        const d = dataOf<{ valid?: boolean; status?: string }>(r.body)
        return { code: TEST_POSTCODES[i][0], state: TEST_POSTCODES[i][1], valid: d?.valid === true, status: d?.status ?? st(r) }
      })
      const good = rows.filter((x) => x.valid)
      const bad = rows.filter((x) => !x.valid)
      return {
        outcome: bad.length === 0 ? 'pass' : 'fail',
        expected: '20/20 valid',
        actual: `${good.length}/20 valid. Valid: ${good.map((x) => x.code).join(', ') || 'none'}. Failing: ${bad.map((x) => `${x.code} (${x.status})`).join(', ') || 'none'}`,
        evidence: rs,
      }
    },
  },
  {
    id: 'lookup-input-tolerance', title: 'Lookup accepts dashed, spaced, compact and lowercase input', category: 'Lookup', severity: 'medium',
    claim: 'The API is tolerant of spaces, hyphens and case.', docRef: `${DOCS}/concepts/postcode-format#rules`,
    run: async () => {
      const forms = ['FC-03-B06-AG-12', 'FC 03 B06 AG 12', 'FC03B06AG12', 'fc03b06ag12', 'fc-03-b06-ag-12']
      const rs = await Promise.all(forms.map((code) => callApi({ path: '/v1/lookup', query: { code, level: 1 } })))
      const ds = rs.map((r) => dataOf<{ valid?: boolean; postcode?: string }>(r.body))
      const allValid = ds.every((d) => d?.valid === true)
      const echoes = new Set(ds.map((d) => d?.postcode))
      return {
        outcome: allValid ? (echoes.size === 1 ? 'pass' : 'warn') : 'fail',
        expected: 'All forms valid, same canonical postcode echoed',
        actual: forms.map((f, i) => `"${f}" → ${ds[i]?.valid} (${ds[i]?.postcode})`).join('; '),
        evidence: rs,
      }
    },
  },
  {
    id: 'lookup-echo-normalized', title: 'Echoed postcode is canonical even when not found', category: 'Lookup', severity: 'low',
    claim: 'Responses echo the canonical dashed postcode (see L3 response example).', docRef: `${DOCS}/concepts/lookup-levels#example`,
    run: async () => {
      const r = await callApi({ path: '/v1/lookup', query: { code: 'zz99z99zz99', level: 1 } })
      const d = dataOf<{ postcode?: string }>(r.body)
      return {
        outcome: d?.postcode === 'ZZ-99-Z99-ZZ-99' ? 'pass' : 'warn',
        expected: 'postcode: "ZZ-99-Z99-ZZ-99"', actual: brief(r),
        notes: 'Valid codes are normalized to dashed form, but unknown well-formed codes are echoed compact. Clients cannot rely on a single format.',
        evidence: [r],
      }
    },
  },
  {
    id: 'lookup-invalid', title: 'Malformed postcode reports invalid', category: 'Lookup', severity: 'medium',
    claim: 'Validity status is returned at every level.', docRef: `${DOCS}/concepts/lookup-levels`,
    run: async () => {
      const r = await callApi({ path: '/v1/lookup', query: { code: 'garbage', level: 1 } })
      const d = dataOf<{ valid?: boolean; status?: string }>(r.body)
      return { outcome: d?.valid === false ? 'pass' : 'fail', expected: 'valid: false', actual: brief(r), evidence: [r] }
    },
  },
  {
    id: 'lookup-schema', title: 'Lookup response matches the documented schema', category: 'Spec conformance', severity: 'low',
    claim: 'LookupResponse has postcode, valid, administrative_address, recent_house_address, building_use_status, other_building_info, point_geometry.',
    docRef: `${DOCS}/api-reference/openapi.yaml`,
    run: async () => {
      const r = await callApi({ path: '/v1/lookup', query: { code: KNOWN_VALID, level: 1 } })
      const d = dataOf<Record<string, unknown>>(r.body) ?? {}
      const documented = ['postcode', 'valid', 'administrative_address', 'recent_house_address', 'building_use_status', 'other_building_info', 'point_geometry']
      const extra = Object.keys(d).filter((k) => !documented.includes(k))
      return {
        outcome: extra.length ? 'warn' : 'pass', expected: 'Only documented fields',
        actual: extra.length ? `Undocumented fields: ${extra.map((k) => `${k}=${JSON.stringify(d[k])}`).join(', ')}` : 'Matches',
        notes: extra.includes('status') ? '`status` (valid / not_found / invalid) is more useful than `valid` but is not in the spec or docs.' : undefined,
        evidence: [r],
      }
    },
  },

  // ───────────── Errors & validation ─────────────
  {
    id: 'val-lookup-missing-code', title: 'Lookup without code is a 400', category: 'Errors & validation', severity: 'low',
    claim: '`code` is a required query parameter.', docRef: `${DOCS}/api-reference/openapi.yaml`,
    run: async () => {
      const r = await callApi({ path: '/v1/lookup' })
      return { outcome: r.status === 400 || r.status === 422 ? 'pass' : 'warn', expected: 'HTTP 400/422', actual: brief(r), evidence: [r] }
    },
  },
  {
    id: 'val-lookup-level-range', title: 'Out-of-range level values are rejected', category: 'Errors & validation', severity: 'low',
    claim: 'level is an integer, minimum 1, maximum 5.', docRef: `${DOCS}/api-reference/openapi.yaml`,
    run: async () => {
      const levels = ['0', '9', 'abc', '-1']
      const rs = await Promise.all(levels.map((level) => callApi({ path: '/v1/lookup', query: { code: KNOWN_VALID, level } })))
      const bad = rs.filter((r) => r.status === 200)
      return {
        outcome: bad.length === 0 && rs.every((r) => r.status === 400 || r.status === 422) ? 'pass' : 'warn',
        expected: 'HTTP 400/422 for each',
        actual: levels.map((l, i) => `level=${l} → ${brief(rs[i])}`).join('; '),
        notes: 'Invalid values are silently treated as L1, or reported as level_not_granted, rather than as a validation error.',
        evidence: rs,
      }
    },
  },
  {
    id: 'val-envelope', title: 'Errors use the consistent envelope', category: 'Errors & validation', severity: 'low',
    claim: 'Errors use { "error": { "code", "message" } }.', docRef: `${DOCS}/authentication#errors`,
    run: async () => {
      const rs = await Promise.all([
        callApi({ path: '/v1/lookup', query: { code: KNOWN_VALID }, auth: 'none' }),
        callApi({ path: '/v1/search/reverse', query: { lat: 6.45 } }),
        callApi({ path: '/v1/assembly/assemble', method: 'POST', rawBody: 'not json' }),
        callApi({ path: '/v1/assembly/disassemble', query: { code: 'EK' } }),
        callApi({ path: '/v1/does-not-exist' }),
      ])
      const bad = rs.filter((r) => !isEnvelope(r.body))
      return {
        outcome: bad.length === 0 ? 'pass' : 'warn', expected: 'Envelope on every error',
        actual: rs.map((r) => `${new URL(r.url).pathname} → ${r.status} ${isEnvelope(r.body) ? '✓' : `✗ ${JSON.stringify(r.text.slice(0, 40))}`}`).join('; '),
        evidence: rs,
      }
    },
  },

  // ───────────── Assembly ─────────────
  {
    id: 'asm-doc-example', title: 'Assemble zero-fills and uppercases (docs example)', category: 'Assembly', severity: 'medium',
    claim: '{"state":"ek","lga":"1",...} → EK-01-A03-FK-01 / display / compact.', docRef: `${DOCS}/concepts/postcode-format#assemble-%26-disassemble`,
    run: async () => {
      const r = await callApi({ path: '/v1/assembly/assemble', method: 'POST', body: { state: 'ek', lga: '1', district: 'a03', area: 'fk', unit: '1' } })
      const d = dataOf<Record<string, string>>(r.body)
      const ok = d?.postcode === 'EK-01-A03-FK-01' && d?.display === 'EK 01 A03 FK 01' && d?.compact === 'EK01A03FK01'
      return { outcome: ok ? 'pass' : 'fail', expected: 'EK-01-A03-FK-01 · EK 01 A03 FK 01 · EK01A03FK01', actual: brief(r), evidence: [r] }
    },
  },
  {
    id: 'asm-zero-segment', title: 'Assemble rejects 00 numeric segments', category: 'Assembly', severity: 'medium',
    claim: 'Numeric segments range 01–99 (never 00).', docRef: `${DOCS}/concepts/postcode-format#rules`,
    run: async () => {
      const lga = await callApi({ path: '/v1/assembly/assemble', method: 'POST', body: { state: 'ek', lga: '0', district: 'a03', area: 'fk', unit: '1' } })
      const unit = await callApi({ path: '/v1/assembly/assemble', method: 'POST', body: { state: 'ek', lga: '1', district: 'a03', area: 'fk', unit: '00' } })
      const dis = await callApi({ path: '/v1/assembly/disassemble', query: { code: 'EK00A03FK01' } })
      const rejected = (r: ApiResult) => r.status >= 400 && r.status < 500
      const all = [lga, unit, dis]
      return {
        outcome: all.every(rejected) ? 'pass' : 'fail', expected: '4xx invalid_segments for each',
        actual: `assemble lga=0 → ${brief(lga)}; assemble unit=00 → ${brief(unit)}; disassemble EK00A03FK01 → ${brief(dis)}`,
        notes: 'Assemble and disassemble disagree: a code assemble produces may be one disassemble refuses.',
        evidence: all,
      }
    },
  },
  {
    id: 'asm-invalid', title: 'Assemble rejects malformed segments', category: 'Assembly', severity: 'low',
    claim: 'State is 2 alpha, LGA 2 numeric, etc.', docRef: `${DOCS}/concepts/postcode-format`,
    run: async () => {
      const r = await callApi({ path: '/v1/assembly/assemble', method: 'POST', body: { state: 'e', lga: '1', district: 'a03', area: 'fk', unit: '1' } })
      return {
        outcome: r.status >= 400 && r.status < 500 && isEnvelope(r.body) ? 'pass' : 'fail', expected: '4xx with error envelope', actual: brief(r),
        notes: r.status === 422 ? 'HTTP 422 and code invalid_segments are not documented in the spec responses.' : undefined,
        evidence: [r],
      }
    },
  },
  {
    id: 'asm-disassemble-forms', title: 'Disassemble accepts compact, spaced and dashed input', category: 'Assembly', severity: 'medium',
    claim: 'The three styles are interchangeable on input.', docRef: `${DOCS}/concepts/postcode-format#rules`,
    run: async () => {
      const forms = ['EK01A03FK01', 'EK 01 A03 FK 01', 'EK-01-A03-FK-01', 'ek01a03fk01']
      const rs = await Promise.all(forms.map((code) => callApi({ path: '/v1/assembly/disassemble', query: { code } })))
      const ok = rs.every((r) => dataOf<Record<string, string>>(r.body)?.district === 'A03')
      return { outcome: ok ? 'pass' : 'fail', expected: 'Same segments for each', actual: forms.map((f, i) => `"${f}" → ${rs[i].status}`).join('; '), evidence: rs }
    },
  },
  {
    id: 'asm-roundtrip', title: 'Assemble → disassemble round-trips', category: 'Assembly', severity: 'medium',
    claim: 'Assembly endpoints build and parse codes programmatically.', docRef: `${DOCS}/concepts/postcode-format#assemble-%26-disassemble`,
    run: async () => {
      const seg = { state: 'LA', lga: '14', district: 'A01', area: 'CA', unit: '03' }
      const a = await callApi({ path: '/v1/assembly/assemble', method: 'POST', body: seg })
      const code = dataOf<{ compact?: string }>(a.body)?.compact
      const d = await callApi({ path: '/v1/assembly/disassemble', query: { code: code ?? '' } })
      const back = dataOf<Record<string, string>>(d.body)
      const ok = back && Object.entries(seg).every(([k, v]) => back[k] === v)
      return { outcome: ok ? 'pass' : 'fail', expected: JSON.stringify(seg), actual: `${code} → ${JSON.stringify(back)}`, evidence: [a, d] }
    },
  },

  // ───────────── Search ─────────────
  {
    id: 'ac-doc-example', title: 'Autocomplete docs example (q=EK01) returns LGA suggestions', category: 'Search', severity: 'medium',
    claim: 'Returns the active segment and suggestions [{code, label}].', docRef: `${DOCS}/quickstart#try-autocomplete`,
    run: async () => {
      const r = await callApi({ path: '/v1/search/autocomplete', query: { q: 'EK01' } })
      const d = dataOf<{ segment?: string; suggestions?: { code: string; label?: string }[] }>(r.body)
      const hasLabels = d?.suggestions?.every((s) => typeof s.label === 'string')
      return {
        outcome: d?.segment === 'lga' && d.suggestions?.length ? (hasLabels ? 'pass' : 'warn') : 'fail',
        expected: 'segment=lga, suggestions with code + label', actual: brief(r),
        notes: hasLabels ? undefined : 'Suggestions have no `label`, so a type-ahead UI cannot show place names (e.g. "01 – Ado Ekiti").',
        evidence: [r],
      }
    },
  },
  {
    id: 'ac-segments', title: 'Autocomplete advances through every segment', category: 'Search', severity: 'medium',
    claim: 'Segment enum: state, lga, district, area, unit.', docRef: `${DOCS}/api-reference/segment-aware-autocomplete`,
    run: async () => {
      // LA-14-A01-CA-01…11 exist (verified via nearby search around Lagos Island).
      const qs = ['LA', 'LA14', 'LA14A', 'LA14A01C', 'LA14A01CA0']
      const rs = await Promise.all(qs.map((q) => callApi({ path: '/v1/search/autocomplete', query: { q } })))
      const ds = rs.map((r) => dataOf<{ segment?: string; suggestions?: unknown[] }>(r.body))
      const empty = ds.map((d, i) => (!d?.suggestions?.length ? qs[i] : null)).filter(Boolean)
      return {
        outcome: empty.length === 0 ? 'pass' : 'fail', expected: 'Non-empty suggestions at each segment',
        actual: qs.map((q, i) => `${q} → ${ds[i]?.segment}:${ds[i]?.suggestions?.length ?? st(rs[i])}`).join('; '),
        notes: empty.length ? `No suggestions for: ${empty.join(', ')}. Unit-level completion returns nothing even though those units exist.` : undefined,
        evidence: rs,
      }
    },
  },
  {
    id: 'ac-empty', title: 'Autocomplete with empty q fails fast', category: 'Search', severity: 'high',
    claim: '`q` is required; a missing/empty value should be a quick 4xx.', docRef: `${DOCS}/api-reference/segment-aware-autocomplete`,
    run: async () => {
      const r = await callApi({ path: '/v1/search/autocomplete', query: { q: '' }, timeoutMs: 8000 })
      return {
        outcome: r.status >= 400 && r.status < 500 ? 'pass' : r.timedOut ? 'fail' : 'warn',
        expected: 'HTTP 400 within a second', actual: `${brief(r)} after ${r.timeMs} ms`,
        notes: r.timedOut ? 'The request hangs until the client gives up, so it ties up a connection. Under load this could cause denial of service.' : undefined,
        evidence: [r],
      }
    },
  },
  {
    id: 'rev-found', title: 'Reverse geocode resolves a known coordinate', category: 'Search', severity: 'high',
    claim: 'Returns unit code, hierarchy, distance and confidence; radius_m always set.', docRef: `${DOCS}/api-reference/reverse-geocode`,
    run: async () => {
      const r = await callApi({ path: '/v1/search/reverse', query: { ...LAGOS, max_distance_m: 100 } })
      const d = dataOf<{ found?: boolean; unit?: { postcode?: string; confidence?: string; distance_m?: number }; radius_m?: number; area?: string }>(r.body)
      const ok = d?.found && d.unit?.postcode && d.unit.confidence && typeof d.unit.distance_m === 'number' && d.radius_m === 100 && d.area
      return { outcome: ok ? 'pass' : 'fail', expected: 'found=true, unit{postcode,confidence,distance_m}, area, radius_m=100', actual: brief(r), evidence: [r] }
    },
  },
  {
    id: 'rev-consistent', title: 'Reverse-geocoded postcode looks up as valid', category: 'Search', severity: 'medium',
    claim: 'Reverse returns the nearest *active* unit.', docRef: `${DOCS}/api-reference/reverse-geocode`,
    run: async () => {
      const r = await callApi({ path: '/v1/search/reverse', query: { ...LAGOS, max_distance_m: 100 } })
      const pc = dataOf<{ unit?: { postcode?: string } }>(r.body)?.unit?.postcode
      if (!pc) return { outcome: 'error', expected: 'A postcode to look up', actual: brief(r), evidence: [r] }
      const l = await callApi({ path: '/v1/lookup', query: { code: pc, level: 1 } })
      const d = dataOf<{ valid?: boolean }>(l.body)
      return { outcome: d?.valid ? 'pass' : 'fail', expected: `${pc} valid`, actual: brief(l), evidence: [r, l] }
    },
  },
  {
    id: 'rev-clamp', title: 'Reverse clamps max_distance_m to 250 m', category: 'Search', severity: 'low',
    claim: 'Silently clamped to the 250 m hard ceiling; radius_m reports what was applied.', docRef: `${DOCS}/api-reference/reverse-geocode`,
    run: async () => {
      const r = await callApi({ path: '/v1/search/reverse', query: { ...LAGOS, max_distance_m: 10000 } })
      const d = dataOf<{ radius_m?: number }>(r.body)
      return { outcome: d?.radius_m === 250 ? 'pass' : 'fail', expected: 'radius_m = 250', actual: brief(r), evidence: [r] }
    },
  },
  {
    id: 'rev-not-found', title: 'Reverse returns found=false away from buildings', category: 'Search', severity: 'low',
    claim: 'found=false with message when nothing is in range; radius_m always set.', docRef: `${DOCS}/api-reference/reverse-geocode`,
    run: async () => {
      const r = await callApi({ path: '/v1/search/reverse', query: { lat: 3.0, lng: 3.0 } })
      const d = dataOf<{ found?: boolean; message?: string; radius_m?: number }>(r.body)
      return { outcome: d?.found === false && d.message && d.radius_m === 25 ? 'pass' : 'fail', expected: 'found=false, message, radius_m=25', actual: brief(r), evidence: [r] }
    },
  },
  {
    id: 'rev-missing', title: 'Reverse without lng is a 400', category: 'Errors & validation', severity: 'low',
    claim: 'lat and lng are required.', docRef: `${DOCS}/api-reference/reverse-geocode`,
    run: async () => {
      const r = await callApi({ path: '/v1/search/reverse', query: { lat: 6.45 } })
      return { outcome: r.status === 400 && isEnvelope(r.body) ? 'pass' : 'fail', expected: 'HTTP 400 + envelope', actual: brief(r), evidence: [r] }
    },
  },
  {
    id: 'nearby-radius', title: 'Nearby honours radius and sorts by distance', category: 'Search', severity: 'medium',
    claim: 'Returns units within a specified radius (default 300 m).', docRef: `${DOCS}/api-reference/location-search`,
    run: async () => {
      const small = await callApi({ path: '/v1/search/nearby', query: { ...LAGOS, radius: 30 } })
      const def = await callApi({ path: '/v1/search/nearby', query: LAGOS })
      const big = await callApi({ path: '/v1/search/nearby', query: { ...LAGOS, radius: 2000 } })
      type U = { distance_m: number }
      const arr = (r: ApiResult) => (Array.isArray(dataOf(r.body)) ? (dataOf<U[]>(r.body) as U[]) : [])
      const s = arr(small), d = arr(def), b = arr(big)
      const sorted = [s, d, b].every((a) => a.every((u, i) => i === 0 || a[i - 1].distance_m <= u.distance_m))
      const within = s.every((u) => u.distance_m <= 30)
      const maxD = (a: U[]) => (a.length ? Math.max(...a.map((u) => u.distance_m)) : 0)
      const capped = d.length === b.length && d.length > 0 && maxD(b) < 300
      return {
        outcome: sorted && within ? (capped ? 'warn' : 'pass') : 'fail',
        expected: 'All within radius, sorted ascending; more results for larger radius',
        actual: `r=30 → ${s.length} (max ${maxD(s)} m); r=300 → ${d.length} (max ${maxD(d)} m); r=2000 → ${b.length} (max ${maxD(b)} m)`,
        notes: capped ? `Results appear hard-capped at ${d.length} regardless of radius. The cap and any pagination are undocumented, so "within radius" really means "the ${d.length} closest".` : undefined,
        evidence: [small, def, big],
      }
    },
  },
  {
    id: 'nearby-schema', title: 'Nearby response shape is documented', category: 'Spec conformance', severity: 'low',
    claim: 'Spec gives only "200: Units with distances", with no schema.', docRef: `${DOCS}/api-reference/location-search`,
    run: async () => {
      const r = await callApi({ path: '/v1/search/nearby', query: LAGOS })
      const d = dataOf(r.body)
      return {
        outcome: 'warn', expected: 'A response schema in the OpenAPI spec',
        actual: `No schema. Observed: data is ${Array.isArray(d) ? `an array of ${JSON.stringify(Object.keys((d as object[])[0] ?? {}))}` : typeof d}`,
        notes: 'The widget variant is documented as returning data.results, while the gateway returns a bare data[] array.',
        evidence: [r],
      }
    },
  },

  // ───────────── Widget ─────────────
  {
    id: 'widget-secret-key', title: 'Widget session rejects a secret key', category: 'Widget', severity: 'high',
    claim: '403 when the key is not publishable/widget-scoped.', docRef: `${DOCS}/api-reference/start-an-embeddable-widget-session`,
    run: async () => {
      const r = await callApi({ host: 'platform', path: '/v1/widget/session', method: 'POST', body: { identifier_type: 'email', identifier: 'ada@example.com' } })
      if (r.status === 200) return { outcome: 'info', expected: '403 for secret keys', actual: 'Configured key is publishable; session created', evidence: [r] }
      return { outcome: r.status === 403 ? 'pass' : 'fail', expected: 'HTTP 403', actual: brief(r), evidence: [r] }
    },
  },
  {
    id: 'widget-no-key', title: 'Widget session requires a key', category: 'Widget', severity: 'high',
    claim: '401 when the publishable key is missing.', docRef: `${DOCS}/api-reference/start-an-embeddable-widget-session`,
    run: async () => {
      const r = await callApi({ host: 'platform', path: '/v1/widget/session', method: 'POST', auth: 'none', body: { identifier_type: 'email', identifier: 'ada@example.com' } })
      return { outcome: r.status === 401 ? 'pass' : 'fail', expected: 'HTTP 401', actual: brief(r), evidence: [r] }
    },
  },

  // ───────────── Performance ─────────────
  {
    id: 'perf-latency', title: 'Typical latency for core endpoints', category: 'Performance', severity: 'info',
    claim: 'Not specified. Measured for context (includes local proxy overhead).', docRef: DOCS,
    run: async () => {
      const calls = [
        () => callApi({ path: '/v1/lookup', query: { code: KNOWN_VALID, level: 1 } }),
        () => callApi({ path: '/v1/search/autocomplete', query: { q: 'LA14A' } }),
        () => callApi({ path: '/v1/search/reverse', query: LAGOS }),
        () => callApi({ path: '/v1/search/nearby', query: LAGOS }),
      ]
      const names = ['lookup', 'autocomplete', 'reverse', 'nearby']
      const all: ApiResult[] = []
      const stats: string[] = []
      for (let i = 0; i < calls.length; i++) {
        const rs: ApiResult[] = []
        for (let k = 0; k < 5; k++) rs.push(await calls[i]())
        all.push(...rs)
        const t = rs.map((r) => r.timeMs).sort((a, b) => a - b)
        stats.push(`${names[i]} p50 ${t[2]} ms / max ${t[4]} ms`)
      }
      const p50s = stats.map((s) => Number(s.match(/p50 (\d+)/)?.[1]))
      return { outcome: Math.max(...p50s) < 1500 ? 'info' : 'warn', expected: 'p50 < 1.5 s', actual: stats.join('; '), evidence: all }
    },
  },
]

export const CATEGORIES: Category[] = ['Authentication', 'Lookup', 'Search', 'Assembly', 'Widget', 'Errors & validation', 'Spec conformance', 'Performance']

export async function runCheck(c: Check): Promise<StoredResult> {
  const t0 = performance.now()
  try {
    const res = await c.run()
    return { ...res, id: c.id, ranAt: Date.now(), durationMs: Math.round(performance.now() - t0) }
  } catch (e) {
    return {
      id: c.id, ranAt: Date.now(), durationMs: Math.round(performance.now() - t0),
      outcome: 'error', expected: '-', actual: `Check threw: ${(e as Error).message}`, evidence: [],
    }
  }
}
