import { MainLayout } from '../components/Layout/MainLayout'
import { Badge } from '../components/Common'
import { API_BASE_URL } from '../api/scleraApi'

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
        body: null,
        responses: [
          { status: 200, body: '["1.2.3.4", "5.6.7.8"]' },
          { status: 200, body: 'null' },
        ],
      },
      {
        method: 'POST',
        path: '/addRecord',
        summary: 'Add a single value to an RRset. Creates the zone if needed.',
        params: 'subdomain uses "@" or "" for apex. record_type: A, AAAA, CNAME, SOA.',
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
    title: 'Resolver',
    accent: 'bg-rose-500',
    endpoints: [
      {
        method: 'GET',
        path: '/resolve',
        summary: 'Query the DNS server directly.',
        params: 'Query: name (required), type (required)',
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

export function ApiDocs() {
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
          <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
            <aside className="xl:sticky xl:top-20 xl:self-start">
              <div className="api-docs-card rounded-[24px] border border-border bg-surface-container-lowest/90 p-5 shadow-[0_12px_48px_color-mix(in_oklab,var(--color-on-surface)_8%,transparent)]">
                <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  Quick Index
                </div>
                <div className="space-y-2">
                  {API_SECTIONS.map((section) => (
                    <a
                      key={section.title}
                      href={`#${section.title.toLowerCase().replace(/\s+/g, '-')}`}
                      className="flex items-center justify-between rounded-2xl border border-transparent bg-surface-container-low px-3 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-border hover:bg-surface-container-lowest hover:text-on-surface"
                    >
                      <span>{section.title}</span>
                      <span className={`h-2.5 w-2.5 rounded-full ${section.accent}`} />
                    </a>
                  ))}
                </div>
              </div>
            </aside>

            <div className="space-y-8">
              {API_SECTIONS.map((section) => (
                <section
                  key={section.title}
                  id={section.title.toLowerCase().replace(/\s+/g, '-')}
                  className="api-docs-card rounded-[28px] border border-border bg-surface-container-lowest/90 p-6 shadow-[0_16px_60px_color-mix(in_oklab,var(--color-on-surface)_8%,transparent)]"
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

                        <div className="grid gap-5 px-5 py-5 lg:grid-cols-2">
                          <div className="space-y-4">
                            <div>
                              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                                Parameters
                              </div>
                              <div className="api-docs-surface rounded-2xl border border-border bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
                                {endpoint.params}
                              </div>
                            </div>

                            {endpoint.body && (
                              <div>
                                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                                  Request Body
                                </div>
                                <pre className="api-docs-surface api-docs-code custom-scrollbar overflow-x-auto rounded-2xl border border-border px-4 py-3 text-xs leading-6">
                                  <code>{endpoint.body}</code>
                                </pre>
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                              Responses
                            </div>
                            <div className="space-y-3">
                              {endpoint.responses.map((response, index) => (
                                <div
                                  key={`${endpoint.path}-${response.status}-${index}`}
                                  className="api-docs-surface rounded-2xl border border-border bg-surface-container-lowest p-4"
                                >
                                  <div className="mb-3 flex items-center gap-2">
                                    <StatusBadge status={response.status} />
                                  </div>
                                  <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-on-surface">
                                    <code>{response.body}</code>
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
