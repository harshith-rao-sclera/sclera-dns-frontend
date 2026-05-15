import { useMemo, useState } from 'react'
import { MainLayout } from '../components/Layout/MainLayout'
import { Badge, CodeBlock, CopyButton, TextField } from '../components/Common'
import { API_BASE_URL } from '../api/scleraApi'

function buildCurl(endpoint) {
  if (endpoint.method === 'GET') {
    const qs = endpoint.sampleQuery ? `?${endpoint.sampleQuery}` : ''
    return `curl "${API_BASE_URL}${endpoint.path}${qs}"`
  }
  const lines = [`curl -X ${endpoint.method} "${API_BASE_URL}${endpoint.path}"`]
  if (endpoint.body) {
    const compact = endpoint.body.replace(/\s*\n\s*/g, ' ').trim()
    lines.push('  -H "Content-Type: application/json"')
    lines.push(`  -d '${compact}'`)
  }
  return lines.join(' \\\n')
}

const API_SECTIONS = [
  {
    title: 'Service',
    accent: 'bg-emerald-500',
    endpoints: [
      {
        method: 'GET',
        path: '/health',
        summary: 'Health check endpoint.',
        params: 'None',
        body: null,
        responses: [
          { status: 200, body: '{"status":"ok"}' },
        ],
      },
    ],
  },
  {
    title: 'Zones',
    accent: 'bg-sky-500',
    endpoints: [
      {
        method: 'POST',
        path: '/createZone',
        summary: 'Create a DNS zone explicitly. In-bailiwick nameservers must include one or more IP addresses, while out-of-bailiwick nameservers must not.',
        params: 'None',
        body: `{
  "zone": "example.com",
  "nameservers": [
    { "host": "ns1.example.com", "ips": ["192.0.2.10", "2001:db8::10"] },
    { "host": "ns2.provider.net" }
  ]
}`,
        responses: [
          { status: 201, body: 'Zone created successfully' },
          { status: 409, body: 'Zone already exists: example.com' },
        ],
      },
      {
        method: 'GET',
        path: '/listZones',
        summary: 'List all zone names. Returned names always include a trailing dot.',
        params: 'None',
        body: null,
        responses: [
          { status: 200, body: '["example.com.", "test.local."]' },
        ],
      },
      {
        method: 'GET',
        path: '/listRecords',
        summary: 'Return all zones with full RRset payloads.',
        params: 'None',
        body: null,
        responses: [
          { status: 200, body: '{"example.com.":[{"name":"www.example.com.","type":"A","ttl":60,"records":[{"content":"1.2.3.4","disabled":false}]}]}' },
          { status: 200, body: '{}' },
        ],
      },
      {
        method: 'GET',
        path: '/getZone',
        summary: 'Fetch every RRset for a single zone.',
        params: 'Query: zone (required)',
        sampleQuery: 'zone=example.com',
        body: null,
        responses: [
          { status: 200, body: '[{"name":"www.example.com.","type":"A","ttl":60,"records":[{"content":"1.2.3.4","disabled":false}]}]' },
          { status: 404, body: 'Failed to get zone...' },
        ],
      },
      {
        method: 'POST',
        path: '/deleteZone',
        summary: 'Delete an entire zone and all of its records.',
        params: 'None',
        body: '{ "zone": "example.com" }',
        responses: [
          { status: 200, body: 'Zone deleted successfully' },
        ],
      },
    ],
  },
  {
    title: 'Records',
    accent: 'bg-violet-500',
    endpoints: [
      {
        method: 'GET',
        path: '/getRecord',
        summary: 'Fetch all values for one RRset.',
        params: 'Query: zone (required), subdomain, record_type (required)',
        sampleQuery: 'zone=example.com&subdomain=www&record_type=A',
        body: null,
        responses: [
          { status: 200, body: '["1.2.3.4", "5.6.7.8"]' },
          { status: 200, body: 'null' },
        ],
      },
      {
        method: 'POST',
        path: '/addRecord',
        summary: 'Add a single value to an RRset. Creates the zone if needed. The frontend exposes A, AAAA, CNAME, ALIAS, MX, NS, PTR, and TXT; SOA is managed by the system. ALIAS is a vendor extension (not in any DNS RFC) — the server resolves the target and returns its A/AAAA values on the wire, which makes it safe at the zone apex where CNAME is forbidden. The frontend-side subdomain field accepts plain labels (e.g. "www") and strips the zone suffix on submit, so passing "www.example.com" for zone "example.com" still resolves to subdomain "www".',
        params: 'subdomain uses "@" or "" for apex. record_type: A, AAAA, CNAME, ALIAS, MX, NS, PTR, TXT (SOA is system-managed). MX values are "<preference> <hostname>".',
        body: '{ "zone": "example.com", "subdomain": "www", "record_type": "A", "value": "1.2.3.4", "ttl": 60 }',
        responses: [
          { status: 200, body: 'Record added successfully' },
        ],
      },
      {
        method: 'PUT',
        path: '/updateRecord',
        summary: 'Replace all values for an RRset. Non-additive. Creates the zone if needed.',
        params: 'None',
        body: '{ "zone": "example.com", "subdomain": "www", "record_type": "A", "values": ["9.9.9.9"], "ttl": 60 }',
        responses: [
          { status: 200, body: 'Record updated successfully' },
        ],
      },
      {
        method: 'PUT',
        path: '/updateSOA',
        summary: 'Update the zone SOA with structured fields. Validates against RFC 1912 §2.2 (refresh/retry/expire/minimum bounds + retry < refresh) and RFC 2308 (negative-cache minimum). The frontend never sends "serial" — the backend auto-increments it (current + 1) so the SOA always advances monotonically. The "rname" field uses dot-encoding: "hostmaster.example.com" represents hostmaster@example.com.',
        params: 'None',
        body: '{\n  "zone":    "example.com",\n  "mname":   "ns1.example.com",\n  "rname":   "hostmaster.example.com",\n  "refresh": 10800,\n  "retry":   3600,\n  "expire":  1209600,\n  "minimum": 3600,\n  "ttl":     3600\n}',
        responses: [
          { status: 200, body: 'SOA updated successfully' },
          { status: 400, body: 'retry must be less than refresh' },
          { status: 400, body: 'refresh out of range [1200, 43200]' },
          { status: 404, body: 'zone not found' },
          { status: 500, body: 'PDNS PATCH failed: ...' },
        ],
      },
      {
        method: 'POST',
        path: '/deleteRecord',
        summary: 'Remove one value from an RRset. Deletes the RRset if the last value is removed.',
        params: 'None',
        body: '{ "zone": "example.com", "subdomain": "www", "record_type": "A", "value": "1.2.3.4" }',
        responses: [
          { status: 200, body: 'Record deleted successfully' },
        ],
      },
      {
        method: 'POST',
        path: '/deleteAllRecords',
        summary: 'Delete a full RRset for one subdomain and record type.',
        params: 'None',
        body: '{ "zone": "example.com", "subdomain": "www", "record_type": "A" }',
        responses: [
          { status: 200, body: 'All records deleted successfully' },
        ],
      },
    ],
  },
  {
    title: 'Smart IP Rules',
    accent: 'bg-amber-500',
    endpoints: [
      {
        method: 'POST',
        path: '/addSmartIPRule',
        summary: 'Create or update a dynamic regex rule. Pass `id: 0` or omit it to create, or send an existing id to update and optionally rename the rule.',
        params: 'pattern must be Go-compatible regex',
        body: '{ "id": 0, "name": "Office Rule", "description": "Optional description with spaces", "zones": ["example.com"], "pattern": "office-([0-9-]+).*", "ttl": 60 }',
        responses: [
          { status: 200, body: 'Smart IP rule added successfully' },
        ],
      },
      {
        method: 'POST',
        path: '/addZoneToSmartIPRule',
        summary: 'Attach an additional zone to an existing smart IP rule. Use id when available.',
        params: 'None',
        body: '{ "id": 1, "zone": "other.net" }',
        responses: [
          { status: 200, body: 'Zone "other.net." added to rule "Office Rule"' },
        ],
      },
      {
        method: 'POST',
        path: '/removeZoneFromSmartIPRule',
        summary: 'Detach a zone from an existing smart IP rule. Use id when available.',
        params: 'None',
        body: '{ "id": 1, "zone": "example.com" }',
        responses: [
          { status: 200, body: 'Zone removed successfully' },
        ],
      },
      {
        method: 'GET',
        path: '/listSmartIPRules',
        summary: 'List all smart IP rules with ids, descriptions, and their linked zones.',
        params: 'None',
        body: null,
        responses: [
          { status: 200, body: '[{"ID":1,"Name":"Office Rule","Description":"Optional description with spaces","Zones":["example.com."],"Pattern":"office-([0-9-]+).*","TTL":60}]' },
        ],
      },
      {
        method: 'POST',
        path: '/deleteSmartIPRule',
        summary: 'Delete a smart IP rule by id (preferred) or by name.',
        params: 'None',
        body: '{ "id": 1 }',
        responses: [
          { status: 200, body: 'Smart IP rule deleted successfully' },
        ],
      },
    ],
  },
  {
    title: 'DNSSEC',
    accent: 'bg-fuchsia-500',
    endpoints: [
      {
        method: 'POST',
        path: '/secureZone',
        summary: 'Provision a KSK + ZSK (ECDSA P-256) for the zone and return DS records that must be published at the parent registrar. Refuses if the zone already has cryptokeys — call /unsecureZone first to rotate.',
        params: 'None',
        body: '{ "zone": "example.com" }',
        responses: [
          { status: 200, body: '{"zone":"example.com.","secured":true,"keys":[{"id":1,"keytype":"ksk","active":true,"algorithm":"ECDSAP256SHA256","dnskey":"257 3 13 mdsswUyr3...","ds":["12345 13 2 abc...","12345 13 4 def..."]},{"id":2,"keytype":"zsk","active":true,"algorithm":"ECDSAP256SHA256","dnskey":"256 3 13 hijkLmno...","ds":null}]}' },
          { status: 400, body: 'zone is required' },
          { status: 404, body: 'Failed to secure zone: zone X not found' },
          { status: 409, body: 'Failed to secure zone: zone X already has N cryptokey(s); call /unsecureZone first' },
        ],
      },
      {
        method: 'POST',
        path: '/unsecureZone',
        summary: 'Remove all cryptokeys from the zone and revert to unsigned. If the zone is publicly delegated with a DS record at its registrar, remove the DS record there first and wait for propagation — otherwise validators will SERVFAIL the entire domain.',
        params: 'None',
        body: '{ "zone": "example.com" }',
        responses: [
          { status: 200, body: 'Zone DNSSEC disabled' },
          { status: 400, body: 'zone is required' },
          { status: 404, body: 'Failed to unsecure zone: zone X not found' },
        ],
      },
      {
        method: 'GET',
        path: '/getZoneDNSSEC',
        summary: 'Return the zone\'s current DNSSEC state without modifying anything. Used by the frontend to populate the DNSSEC section on the zone detail page.',
        params: 'Query: zone (required)',
        sampleQuery: 'zone=example.com',
        body: null,
        responses: [
          { status: 200, body: '{"zone":"example.com.","secured":false,"keys":null}' },
          { status: 200, body: '{"zone":"example.com.","secured":true,"keys":[{"id":1,"keytype":"ksk","active":true,"algorithm":"ECDSAP256SHA256","dnskey":"257 3 13 ...","ds":["12345 13 2 ...","12345 13 4 ..."]},{"id":2,"keytype":"zsk","active":true,"algorithm":"ECDSAP256SHA256","dnskey":"256 3 13 ...","ds":null}]}' },
          { status: 400, body: 'zone query parameter is required' },
          { status: 404, body: 'zone X not found' },
        ],
      },
    ],
  },
  {
    title: 'Resolver',
    accent: 'bg-rose-500',
    endpoints: [
      {
        method: 'GET',
        path: '/resolve',
        summary: 'Query the DNS server directly.',
        params: 'Query: name (required), type (required)',
        sampleQuery: 'name=www.example.com&type=A',
        body: null,
        responses: [
          { status: 200, body: '[{"name":"www.example.com.","type":"A","ttl":60,"value":"www.example.com.\\t60\\tIN\\tA\\t1.2.3.4"}]' },
          { status: 200, body: 'null' },
        ],
      },
    ],
  },
]

function MethodBadge({ method }) {
  const tone = {
    GET: 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20',
    POST: 'bg-sky-500/12 text-sky-700 ring-1 ring-sky-500/20',
    PUT: 'bg-amber-500/12 text-amber-700 ring-1 ring-amber-500/20',
    DELETE: 'bg-rose-500/12 text-rose-700 ring-1 ring-rose-500/20',
  }[method] || 'bg-surface-container text-on-surface ring-1 ring-outline-variant/20'

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-widest ${tone}`}>
      {method}
    </span>
  )
}

function StatusBadge({ status }) {
  const tone = status >= 400
    ? 'bg-rose-500/12 text-rose-700 ring-1 ring-rose-500/20'
    : 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ${tone}`}>
      {status}
    </span>
  )
}

function endpointMatches(endpoint, query) {
  if (!query) return true
  const lower = query.toLowerCase()
  return [endpoint.method, endpoint.path, endpoint.summary, endpoint.params]
    .some((f) => typeof f === 'string' && f.toLowerCase().includes(lower))
}

export function ApiDocs() {
  const [search, setSearch] = useState('')
  const query = search.trim()

  const filteredSections = useMemo(
    () => API_SECTIONS
      .map((section) => ({
        ...section,
        endpoints: section.endpoints.filter((e) => endpointMatches(e, query)),
      }))
      .filter((section) => section.endpoints.length > 0),
    [query],
  )
  const totalEndpoints = filteredSections.reduce((sum, s) => sum + s.endpoints.length, 0)

  return (
    <MainLayout breadcrumbs={[{ label: 'API Docs' }]}>
      <div className="api-docs-page min-h-full">
        <div className="api-docs-page__layer api-docs-page__layer--light" />
        <div className="api-docs-page__layer api-docs-page__layer--dark" />
        <div className="api-docs-page__content">
        <section className="px-6 pt-8 pb-6">
          <div className="api-docs-card relative overflow-hidden rounded-[28px] border border-border bg-surface-container-lowest/90 p-8 shadow-[0_20px_80px_color-mix(in_oklab,var(--color-on-surface)_10%,transparent)]">
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-sky-500/12 blur-3xl" />
            <div className="absolute bottom-0 right-20 h-24 w-24 rounded-full bg-amber-500/12 blur-2xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-container-low px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  ScleraDNS Reference
                </div>
                <h1 className="font-serif text-4xl leading-tight text-on-surface md:text-5xl">
                  HTTP API documentation for every zone, record, rule, and resolver call.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-on-surface-variant">
                  A frontend-friendly reference for the ScleraDNS service. All error responses are plain text,
                  and zone names returned by the backend may include trailing dots.
                </p>
                <div className="mt-5 max-w-md">
                  <TextField
                    icon="search"
                    placeholder="Search endpoints (e.g. zone, smart, dnssec)…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>
              <div className="api-docs-card api-docs-shell grid gap-3 rounded-3xl border border-border px-5 py-4 shadow-lg">
                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  Base URL
                </div>
                <code className="text-sm text-primary">{API_BASE_URL}</code>
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm text-amber-400">warning</span>
                  Errors return plain text for `400`, `404`, `405`, `409`, and `500`.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-10">
          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="xl:sticky xl:top-20 xl:self-start">
              <div className="api-docs-card rounded-[24px] border border-border bg-surface-container-lowest/90 p-5 shadow-[0_12px_48px_color-mix(in_oklab,var(--color-on-surface)_8%,transparent)]">
                <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  Quick Index
                </div>
                <div className="space-y-2">
                  {filteredSections.map((section) => (
                    <a
                      key={section.title}
                      href={`#${section.title.toLowerCase().replace(/\s+/g, '-')}`}
                      className="flex items-center justify-between rounded-2xl border border-transparent bg-surface-container-low px-3 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-border hover:bg-surface-container-lowest hover:text-on-surface"
                    >
                      <span>{section.title}</span>
                      <span className={`h-2.5 w-2.5 rounded-full ${section.accent}`} />
                    </a>
                  ))}
                  {filteredSections.length === 0 && (
                    <p className="text-xs italic text-on-surface-variant">No endpoints match your search.</p>
                  )}
                  <a
                    href="/reference"
                    className="flex items-center justify-between rounded-2xl border border-transparent bg-surface-container-low px-3 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-border hover:bg-surface-container-lowest hover:text-on-surface"
                  >
                    <span>DNS Reference &amp; RFCs</span>
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_outward</span>
                  </a>
                </div>
              </div>
            </aside>

            <div className="min-w-0 space-y-8">
              {filteredSections.length === 0 && (
                <div className="api-docs-card rounded-[28px] border border-border bg-surface-container-lowest/90 p-8 text-center">
                  <p className="text-sm text-on-surface-variant">
                    No endpoints match <strong className="text-on-surface">"{query}"</strong>. Try the {' '}
                    <a href="/reference" className="font-medium text-primary hover:underline">DNS Reference</a> for terminology.
                  </p>
                </div>
              )}
              {query && totalEndpoints > 0 && (
                <p className="text-xs text-on-surface-variant">
                  Showing {totalEndpoints} endpoint{totalEndpoints === 1 ? '' : 's'} matching "{query}".
                </p>
              )}
              {filteredSections.map((section) => (
                <section
                  key={section.title}
                  id={section.title.toLowerCase().replace(/\s+/g, '-')}
                  className="api-docs-card min-w-0 rounded-[28px] border border-border bg-surface-container-lowest/90 p-6 shadow-[0_16px_60px_color-mix(in_oklab,var(--color-on-surface)_8%,transparent)]"
                >
                  <div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${section.accent}`} />
                      <h2 className="text-2xl font-semibold tracking-tight text-on-surface">
                        {section.title}
                      </h2>
                    </div>
                    <Badge variant="zone">{section.endpoints.length} endpoints</Badge>
                  </div>

                  <div className="space-y-5">
                    {section.endpoints.map((endpoint) => (
                      <article
                        key={`${endpoint.method}-${endpoint.path}`}
                        className="api-docs-card overflow-hidden rounded-[24px] border border-border bg-surface-container-lowest/95"
                      >
                        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                              <MethodBadge method={endpoint.method} />
                              <code className="text-sm font-semibold text-on-surface">{endpoint.path}</code>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-on-surface-variant">{endpoint.summary}</p>
                          </div>
                        </div>

                        <div className="min-w-0 space-y-5 px-5 py-5">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="min-w-0">
                              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                                Parameters
                              </div>
                              <div className="api-docs-surface h-[calc(100%-1.75rem)] rounded-2xl border border-border bg-surface-container-lowest px-4 py-3 text-sm text-on-surface break-words">
                                {endpoint.params}
                              </div>
                            </div>

                            {endpoint.body ? (
                              <div className="min-w-0">
                                <CodeBlock label="Request Body" code={endpoint.body} />
                              </div>
                            ) : (
                              <div className="min-w-0">
                                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                                  Request Body
                                </div>
                                <div className="api-docs-surface h-[calc(100%-1.75rem)] rounded-2xl border border-border bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
                                  No request body.
                                </div>
                              </div>
                            )}
                          </div>

                          <CodeBlock label="cURL" code={buildCurl(endpoint)} />

                          <div>
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                              Responses
                            </div>
                            <div className="space-y-3">
                              {endpoint.responses.map((response, index) => (
                                <div
                                  key={`${endpoint.path}-${response.status}-${index}`}
                                  className="overflow-hidden rounded-2xl border border-border bg-surface-container-lowest"
                                >
                                  <div className="flex items-center justify-between border-b border-border px-4 py-2">
                                    <StatusBadge status={response.status} />
                                    <CopyButton text={response.body} />
                                  </div>
                                  <pre className="custom-scrollbar overflow-x-auto whitespace-pre-wrap break-words px-4 py-3 text-xs leading-6 text-on-surface">
                                    <code className="font-mono">{response.body}</code>
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
        </div>
      </div>
    </MainLayout>
  )
}
