import type { AuthMode, Host } from './api'

export interface Field {
  name: string
  label?: string
  default?: string
  required?: boolean
  hint?: string
  options?: string[]
}

export interface Endpoint {
  id: string
  group: 'Lookup' | 'Search' | 'Assembly' | 'Widget' | 'System'
  title: string
  method: 'GET' | 'POST'
  host: Host
  path: string
  summary: string
  access: string
  query?: Field[]
  body?: Field[]
  defaultAuth?: AuthMode
  samples?: { label: string; values: Record<string, string> }[]
}

export const TEST_POSTCODES = [
  ['AK-11-I61-ZF-12', 'Akwa Ibom'], ['AK-11-H40-WD-11', 'Akwa Ibom'],
  ['BA-02-M67-BL-69', 'Bauchi'], ['BA-02-E99-NE-30', 'Bauchi'],
  ['EB-13-G95-FR-90', 'Ebonyi'], ['EB-13-I97-AB-30', 'Ebonyi'],
  ['EN-05-V19-CD-22', 'Enugu'], ['EN-05-V19-FT-20', 'Enugu'],
  ['FC-03-B06-AG-12', 'FCT'], ['FC-02-B19-RT-30', 'FCT'],
  ['JI-24-O18-JP-23', 'Jigawa'], ['JI-24-N11-VM-58', 'Jigawa'],
  ['KN-31-F82-WJ-80', 'Kano'], ['KN-31-D78-IQ-38', 'Kano'],
  ['LA-11-W06-TC-10', 'Lagos'], ['LA-11-U34-ZR-63', 'Lagos'],
  ['NI-09-J67-QC-65', 'Niger'], ['NI-09-A75-DA-10', 'Niger'],
  ['OG-14-T18-BN-16', 'Ogun'], ['OG-14-M82-QA-09', 'Ogun'],
] as const

export const ENDPOINTS: Endpoint[] = [
  {
    id: 'lookup', group: 'Lookup', title: 'Graded lookup', method: 'GET', host: 'gw', path: '/v1/lookup',
    summary: 'Resolve a postcode to graded attributes. L1 validity, L2 admin + recent address, L3 building use (spec lists up to L5).',
    access: 'Docs: L1 public, L2–L3 need a key with lookup scope + credits',
    query: [
      { name: 'code', required: true, default: 'FC-03-B06-AG-12', hint: 'Dashed, spaced or compact' },
      { name: 'level', default: '1', options: ['1', '2', '3', '4', '5'] },
    ],
    samples: TEST_POSTCODES.slice(0, 20).filter((_, i) => i % 2 === 0).map(([c, s]) => ({ label: `${c} (${s})`, values: { code: c } })),
  },
  {
    id: 'autocomplete', group: 'Search', title: 'Segment-aware autocomplete', method: 'GET', host: 'gw', path: '/v1/search/autocomplete',
    summary: 'Suggestions for the segment currently being typed (state → lga → district → area → unit).',
    access: 'Docs: public (no key)',
    query: [{ name: 'q', required: true, default: 'LA14A', hint: "Partial postcode, e.g. 'EK 01 A'" }],
    samples: [
      { label: 'State: LA', values: { q: 'LA' } },
      { label: 'LGA: EK01', values: { q: 'EK01' } },
      { label: 'District: LA14A', values: { q: 'LA14A' } },
      { label: 'Area: LA14A01C', values: { q: 'LA14A01C' } },
      { label: 'Unit: LA14A01CA0', values: { q: 'LA14A01CA0' } },
    ],
  },
  {
    id: 'reverse', group: 'Search', title: 'Reverse geocode', method: 'GET', host: 'gw', path: '/v1/search/reverse',
    summary: 'Nearest active unit to a coordinate within max_distance_m (default 25 m, clamped to 250 m).',
    access: 'Docs: public; admin names only for L2+ keys',
    query: [
      { name: 'lat', required: true, default: '6.45' },
      { name: 'lng', required: true, default: '3.39' },
      { name: 'max_distance_m', default: '25' },
    ],
    samples: [
      { label: 'Lagos Island', values: { lat: '6.45', lng: '3.39' } },
      { label: 'Abuja (Wuse)', values: { lat: '9.0765', lng: '7.4686', max_distance_m: '250' } },
      { label: 'Atlantic Ocean', values: { lat: '3.0', lng: '3.0' } },
    ],
  },
  {
    id: 'nearby', group: 'Search', title: 'Location (nearby) search', method: 'GET', host: 'gw', path: '/v1/search/nearby',
    summary: 'Units within a radius of a coordinate (default 300 m).',
    access: 'Docs: public (no key)',
    query: [
      { name: 'lat', required: true, default: '6.45' },
      { name: 'lng', required: true, default: '3.39' },
      { name: 'radius', default: '300' },
    ],
    samples: [
      { label: 'Lagos Island', values: { lat: '6.45', lng: '3.39' } },
      { label: 'Abuja (Wuse)', values: { lat: '9.0765', lng: '7.4686' } },
      { label: 'Ado-Ekiti', values: { lat: '7.6233', lng: '5.2209' } },
    ],
  },
  {
    id: 'assemble', group: 'Assembly', title: 'Assemble segments', method: 'POST', host: 'gw', path: '/v1/assembly/assemble',
    summary: 'Build a canonical postcode from segments; zero-fills and uppercases.',
    access: 'Docs: public (no key)',
    body: [
      { name: 'state', default: 'ek' },
      { name: 'lga', default: '1' },
      { name: 'district', default: 'a03' },
      { name: 'area', default: 'fk' },
      { name: 'unit', default: '1' },
    ],
  },
  {
    id: 'disassemble', group: 'Assembly', title: 'Disassemble postcode', method: 'GET', host: 'gw', path: '/v1/assembly/disassemble',
    summary: 'Split a postcode into its five segments.',
    access: 'Docs: public (no key)',
    query: [{ name: 'code', required: true, default: 'EK01A03FK01' }],
    samples: [
      { label: 'Compact', values: { code: 'EK01A03FK01' } },
      { label: 'Spaced', values: { code: 'EK 01 A03 FK 01' } },
      { label: 'Partial', values: { code: 'EK 01 A03' } },
    ],
  },
  {
    id: 'widget-session', group: 'Widget', title: 'Start widget session', method: 'POST', host: 'platform', path: '/v1/widget/session',
    summary: 'Exchange a publishable key + NIN/email for a short-lived widget token. Platform host.',
    access: 'Requires a publishable key (nipost_pk_…) with widget scope',
    body: [
      { name: 'identifier_type', default: 'email', options: ['email', 'nin'] },
      { name: 'identifier', default: 'ada@example.com' },
    ],
  },
  {
    id: 'healthz', group: 'System', title: 'Health check', method: 'GET', host: 'gw', path: '/healthz',
    summary: 'Gateway liveness.', access: 'Public', defaultAuth: 'none',
  },
]
