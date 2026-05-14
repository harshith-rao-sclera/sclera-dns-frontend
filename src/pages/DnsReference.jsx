import { MainLayout } from '../components/Layout/MainLayout'
import { Badge } from '../components/Common'

const RECORD_TYPES = [
  {
    type: 'A',
    title: 'Address record',
    what: 'Maps a hostname to a 32-bit IPv4 address.',
    how: 'When a resolver asks for the A record of a name, the authoritative server returns one or more IPv4 addresses. Multiple A records at the same name act as a simple round-robin pool.',
    example: 'www.example.com.  300  IN  A  192.0.2.10',
    rfc: 'RFC 1035 §3.4.1',
  },
  {
    type: 'AAAA',
    title: 'IPv6 address record',
    what: 'Maps a hostname to a 128-bit IPv6 address.',
    how: 'Identical role to A, but for IPv6. A name can hold both A and AAAA records; clients pick based on their network stack.',
    example: 'www.example.com.  300  IN  AAAA  2001:db8::10',
    rfc: 'RFC 3596',
  },
  {
    type: 'CNAME',
    title: 'Canonical name (alias)',
    what: 'Points one name at another name — the "canonical" name the resolver should look up instead.',
    how: 'The resolver replaces the queried name with the CNAME target and restarts resolution. Because the alias replaces ALL data at that name, a CNAME cannot coexist with any other record type and cannot exist at the zone apex.',
    example: 'blog.example.com.  300  IN  CNAME  hosting-provider.net.',
    rfc: 'RFC 1034 §3.6.2',
  },
  {
    type: 'ALIAS',
    title: 'Apex-safe alias (vendor extension)',
    what: 'Behaves like a CNAME but is legal at the zone apex.',
    how: 'The authoritative server resolves the target itself and returns the target’s A/AAAA records on the wire — so the client never sees a CNAME. This sidesteps the apex-CNAME prohibition. ALIAS is not standardized; each DNS provider implements it slightly differently.',
    example: 'example.com.  300  IN  ALIAS  load-balancer.provider.net.',
    rfc: 'Non-RFC vendor extension',
  },
  {
    type: 'MX',
    title: 'Mail exchanger',
    what: 'Declares the mail servers that accept email for a domain, each with a preference value.',
    how: 'Sending mail servers sort MX records by preference (lowest first) and try them in order. The exchange must be a hostname with A/AAAA records — never an IP, never a CNAME.',
    example: 'example.com.  3600  IN  MX  10 mail.example.com.',
    rfc: 'RFC 1035 §3.3.9',
  },
  {
    type: 'NS',
    title: 'Name server',
    what: 'Declares which servers are authoritative for a zone, and delegates subzones.',
    how: 'At the apex, NS records list the zone’s own authoritative servers. At a subdomain, NS records delegate that subdomain to a child zone. The apex NS RRset cannot be removed — without it the zone is unservable.',
    example: 'example.com.  86400  IN  NS  ns1.example.com.',
    rfc: 'RFC 1035 §3.3.11',
  },
  {
    type: 'PTR',
    title: 'Reverse pointer',
    what: 'Maps an IP address back to a hostname — the reverse of an A/AAAA lookup.',
    how: 'The owner name is the IP address reversed under in-addr.arpa (IPv4) or ip6.arpa (IPv6). Used by mail servers and logging tools to label connections.',
    example: '10.2.0.192.in-addr.arpa.  3600  IN  PTR  mail.example.com.',
    rfc: 'RFC 1035 §3.3.12',
  },
  {
    type: 'TXT',
    title: 'Text record',
    what: 'Holds arbitrary text strings attached to a name.',
    how: 'Each string is limited to 255 characters; a record can hold several strings concatenated. Widely repurposed for SPF, DKIM, DMARC, and domain-ownership verification tokens.',
    example: 'example.com.  3600  IN  TXT  "v=spf1 include:_spf.provider.net ~all"',
    rfc: 'RFC 1035 §3.3.14',
  },
  {
    type: 'SOA',
    title: 'Start of Authority',
    what: 'Zone-level metadata: primary nameserver, admin contact, serial number, and timing parameters.',
    how: 'Exactly one SOA exists per zone, at the apex. The serial number drives zone-transfer freshness; the timers control secondary refresh behavior. Managed by the system — not editable from this frontend.',
    example: 'example.com.  IN  SOA  ns1.example.com. admin.example.com. 2024010101 7200 3600 1209600 3600',
    rfc: 'RFC 1035 §3.3.13',
  },
]

const CONCEPTS = [
  {
    term: 'Zone',
    definition: 'A contiguous portion of the DNS namespace managed as one administrative unit — e.g. example.com and everything under it that has not been delegated away.',
  },
  {
    term: 'RRset (Resource Record set)',
    definition: 'All records sharing the same name, type, and class. DNS operates on RRsets as a unit — you add or remove individual values, but they are served together.',
  },
  {
    term: 'TTL (Time To Live)',
    definition: 'How long, in seconds, a resolver may cache a record before re-querying. 0 means "do not cache". The maximum is 2147483647 (a signed 32-bit integer).',
  },
  {
    term: 'Zone apex (root)',
    definition: 'The bare domain itself (example.com) as opposed to any subdomain. Written as "@" in this UI. Must hold SOA and NS records; cannot hold a CNAME.',
  },
  {
    term: 'Subdomain',
    definition: 'Any name beneath the apex — www.example.com, api.example.com. In this UI you enter just the label ("www"); the zone suffix is appended automatically.',
  },
  {
    term: 'FQDN (Fully Qualified Domain Name)',
    definition: 'A complete, unambiguous name including the implicit trailing dot — www.example.com. The dot represents the DNS root.',
  },
  {
    term: 'Delegation',
    definition: 'Handing authority for a subdomain to a different set of nameservers by placing NS records at the delegation point. The parent zone "points down" to the child.',
  },
  {
    term: 'Bailiwick',
    definition: 'Whether a nameserver’s hostname lives inside the zone it serves (in-bailiwick, e.g. ns1.example.com for example.com) or outside it (out-of-bailiwick, e.g. ns1.provider.net).',
  },
  {
    term: 'Glue records',
    definition: 'A/AAAA records for in-bailiwick nameservers, published in the parent zone. They break the circular dependency of needing example.com’s nameserver to look up example.com’s nameserver.',
  },
  {
    term: 'Wildcard',
    definition: 'A "*" as the full leftmost label (*.example.com) that synthesizes answers for any otherwise-unmatched name at that level. Valid only as the leftmost label — never embedded.',
  },
  {
    term: 'IDN / Punycode',
    definition: 'Internationalized Domain Names. DNS labels are ASCII-only, so non-ASCII names (münchen.de) are encoded to an ASCII "xn--" form (xn--mnchen-3ya.de). This UI converts automatically on submit.',
  },
  {
    term: 'In-addr.arpa / ip6.arpa',
    definition: 'Special reverse-DNS zones. An IPv4 address is reversed octet-by-octet under in-addr.arpa; an IPv6 address nibble-by-nibble under ip6.arpa. PTR records live here.',
  },
]

const DNSSEC_TERMS = [
  {
    term: 'DNSSEC',
    definition: 'DNS Security Extensions — cryptographic signatures over DNS data so resolvers can verify a response genuinely came from the zone owner and was not tampered with in transit.',
  },
  {
    term: 'KSK (Key Signing Key)',
    definition: 'The key that signs the zone’s DNSKEY RRset. Its public hash becomes the DS record published at the parent. Rotated rarely.',
  },
  {
    term: 'ZSK (Zone Signing Key)',
    definition: 'The key that signs every other RRset in the zone. Smaller and rotated more frequently than the KSK.',
  },
  {
    term: 'DS record (Delegation Signer)',
    definition: 'A hash of the KSK, published at the parent registrar. It links the parent’s trust to the child zone — the single thing an operator must manually publish to "go live" with DNSSEC.',
  },
  {
    term: 'Chain of trust',
    definition: 'The verifiable path from the DNS root down to a zone: each parent’s DS record vouches for the child’s DNSKEY, which signs the child’s records.',
  },
  {
    term: 'RRSIG',
    definition: 'The signature record covering a specific RRset. Resolvers validate the RRSIG against the DNSKEY to confirm the data is authentic.',
  },
  {
    term: 'Algorithm 13 (ECDSA P-256)',
    definition: 'The elliptic-curve signing algorithm this system provisions. Compact keys and signatures, widely supported by modern validating resolvers.',
  },
]

const RFC_COMPLIANCE = [
  {
    category: 'Names & Labels',
    rules: [
      { rfc: 'RFC 1035 §2.3.4', rule: 'Domain name ≤ 253 characters total; each label ≤ 63 characters. Applied to both record names and target values.' },
      { rfc: 'RFC 4343', rule: 'Record name comparisons are case-insensitive.' },
      { rfc: 'RFC 4592', rule: 'Wildcards are accepted only as the full leftmost label (e.g. "*.example.com"). "*foo.example.com" is rejected.' },
      { rfc: 'RFC 5891 / RFC 3492', rule: 'Internationalized names are auto-converted to punycode (xn--…) on submit, with a live preview in the form.' },
    ],
  },
  {
    category: 'CNAME Rules',
    rules: [
      { rfc: 'RFC 1034 §3.6.2 / RFC 2181 §10.1', rule: 'CNAME cannot coexist with any other record type at the same name.' },
      { rfc: 'RFC 1034 §3.6.2 / RFC 2181 §10.1', rule: 'CNAME is forbidden at the zone apex.' },
      { rfc: 'RFC 1034 §3.6.2', rule: 'A CNAME RRset can only contain one target value.' },
      { rfc: '—', rule: 'CNAME and ALIAS records cannot point to themselves (self-loop detection at submit time).' },
    ],
  },
  {
    category: 'Record Values',
    rules: [
      { rfc: 'RFC 791 / RFC 4291', rule: 'A records must be valid IPv4 addresses; AAAA records must be valid IPv6 addresses.' },
      { rfc: 'RFC 1035 §3.3.14', rule: 'TXT strings are limited to 255 characters each; quotes must be balanced. Long values must be split into multiple strings.' },
      { rfc: 'RFC 1035 §3.3.11', rule: 'NS RDATA must be a hostname, not an IP address.' },
      { rfc: 'RFC 1035 §3.3.9', rule: 'MX records must be "<preference> <hostname>". Preference is a 16-bit unsigned integer (0-65535); the exchange must be a hostname.' },
      { rfc: 'RFC 1035 §3.3.12', rule: 'PTR records point to a single valid hostname (not an IP, not a wildcard).' },
      { rfc: 'RFC 4592', rule: 'CNAME, ALIAS, NS, MX, and PTR targets cannot be wildcard patterns — wildcards are owner-name semantics only.' },
      { rfc: 'RFC 2181 §10.3', rule: 'NS and MX targets cannot point to a name that already has a CNAME record (same-zone check at validation time).' },
      { rfc: 'RFC 2181 §8', rule: 'TTL must be a non-negative integer no greater than 2147483647 (32-bit signed). Zero means "do not cache".' },
    ],
  },
  {
    category: 'Zone Integrity',
    rules: [
      { rfc: 'RFC 1035 §3.3.13', rule: 'SOA records are managed by the system and cannot be edited or deleted from the frontend.' },
      { rfc: 'RFC 1035 §6.1 / RFC 1912 §2.8', rule: 'The apex NS RRset cannot be deleted — every zone must retain authoritative nameservers at the apex.' },
      { rfc: 'RFC 1035 §2.3.4', rule: 'Zone names are validated as proper domain names on creation (length, label rules, IDN auto-punycoding).' },
      { rfc: 'RFC 1034 §4.2.2', rule: 'On zone creation, in-bailiwick nameserver hosts must include at least one glue IP; out-of-bailiwick hosts must not.' },
      { rfc: 'RFC 4033-4035', rule: 'DNSSEC signing is exposed via /secureZone, /unsecureZone, and /getZoneDNSSEC. KSK + ZSK are provisioned with ECDSA P-256; DS records are surfaced for publication at the parent registrar.' },
    ],
  },
]

const INDEX = [
  { id: 'record-types', label: 'Record Types', accent: 'bg-violet-500' },
  { id: 'core-concepts', label: 'Core Concepts', accent: 'bg-sky-500' },
  { id: 'dnssec', label: 'DNSSEC Terms', accent: 'bg-fuchsia-500' },
  { id: 'rfc-compliance', label: 'RFC Compliance', accent: 'bg-indigo-500' },
]

function SectionCard({ id, accent, title, count, countLabel, children }) {
  return (
    <section
      id={id}
      className="api-docs-card rounded-[28px] border border-border bg-surface-container-lowest/90 p-6 shadow-[0_16px_60px_color-mix(in_oklab,var(--color-on-surface)_8%,transparent)]"
    >
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${accent}`} />
          <h2 className="text-2xl font-semibold tracking-tight text-on-surface">{title}</h2>
        </div>
        <Badge variant="zone">{count} {countLabel}</Badge>
      </div>
      {children}
    </section>
  )
}

export function DnsReference() {
  const rfcCount = RFC_COMPLIANCE.reduce((sum, group) => sum + group.rules.length, 0)

  return (
    <MainLayout breadcrumbs={[{ label: 'DNS Reference' }]}>
      <div className="api-docs-page min-h-full">
        <div className="api-docs-page__layer api-docs-page__layer--light" />
        <div className="api-docs-page__layer api-docs-page__layer--dark" />
        <div className="api-docs-page__content">
          <section className="px-6 pt-8 pb-6">
            <div className="api-docs-card relative overflow-hidden rounded-[28px] border border-border bg-surface-container-lowest/90 p-8 shadow-[0_20px_80px_color-mix(in_oklab,var(--color-on-surface)_10%,transparent)]">
              <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-violet-500/12 blur-3xl" />
              <div className="absolute bottom-0 right-20 h-24 w-24 rounded-full bg-fuchsia-500/12 blur-2xl" />
              <div className="relative max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-container-low px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  Concepts & Terminology
                </div>
                <h1 className="font-serif text-4xl leading-tight text-on-surface md:text-5xl">
                  DNS Reference — types, terms, and the rules this system enforces.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-on-surface-variant">
                  A plain-language guide to every record type you can create, the core DNS concepts behind them,
                  DNSSEC terminology, and the exact RFC rules the frontend validates before anything reaches the server.
                </p>
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
                    {INDEX.map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="flex items-center justify-between rounded-2xl border border-transparent bg-surface-container-low px-3 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-border hover:bg-surface-container-lowest hover:text-on-surface"
                      >
                        <span>{item.label}</span>
                        <span className={`h-2.5 w-2.5 rounded-full ${item.accent}`} />
                      </a>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="min-w-0 space-y-8">
                <SectionCard
                  id="record-types"
                  accent="bg-violet-500"
                  title="Record Types"
                  count={RECORD_TYPES.length}
                  countLabel="types"
                >
                  <div className="space-y-4">
                    {RECORD_TYPES.map((record) => (
                      <article
                        key={record.type}
                        className="api-docs-card overflow-hidden rounded-[24px] border border-border bg-surface-container-lowest/95"
                      >
                        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
                          <code className="rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
                            {record.type}
                          </code>
                          <span className="text-sm font-semibold text-on-surface">{record.title}</span>
                          <span className="ml-auto rounded-md bg-surface-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                            {record.rfc}
                          </span>
                        </div>
                        <div className="space-y-3 px-5 py-4">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                              What it does
                            </span>
                            <p className="mt-1 text-sm leading-6 text-on-surface">{record.what}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                              How it works
                            </span>
                            <p className="mt-1 text-sm leading-6 text-on-surface-variant">{record.how}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                              Example
                            </span>
                            <pre className="mt-1 overflow-x-auto rounded-xl border border-border bg-surface-container-lowest px-4 py-2.5 text-xs leading-6">
                              <code className="font-mono text-on-surface">{record.example}</code>
                            </pre>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  id="core-concepts"
                  accent="bg-sky-500"
                  title="Core Concepts"
                  count={CONCEPTS.length}
                  countLabel="terms"
                >
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {CONCEPTS.map((item) => (
                      <div
                        key={item.term}
                        className="rounded-2xl border border-border bg-surface-container-lowest/95 p-4"
                      >
                        <dt className="text-sm font-semibold text-on-surface">{item.term}</dt>
                        <dd className="mt-1.5 text-xs leading-5 text-on-surface-variant">{item.definition}</dd>
                      </div>
                    ))}
                  </dl>
                </SectionCard>

                <SectionCard
                  id="dnssec"
                  accent="bg-fuchsia-500"
                  title="DNSSEC Terms"
                  count={DNSSEC_TERMS.length}
                  countLabel="terms"
                >
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {DNSSEC_TERMS.map((item) => (
                      <div
                        key={item.term}
                        className="rounded-2xl border border-border bg-surface-container-lowest/95 p-4"
                      >
                        <dt className="text-sm font-semibold text-on-surface">{item.term}</dt>
                        <dd className="mt-1.5 text-xs leading-5 text-on-surface-variant">{item.definition}</dd>
                      </div>
                    ))}
                  </dl>
                </SectionCard>

                <SectionCard
                  id="rfc-compliance"
                  accent="bg-indigo-500"
                  title="RFC Compliance"
                  count={rfcCount}
                  countLabel="rules enforced"
                >
                  <p className="mb-5 max-w-3xl text-sm leading-6 text-on-surface-variant">
                    These are the DNS protocol rules the frontend validates before sending data to the backend.
                  </p>
                  <div className="space-y-5">
                    {RFC_COMPLIANCE.map((group) => (
                      <div
                        key={group.category}
                        className="api-docs-card overflow-hidden rounded-[24px] border border-border bg-surface-container-lowest/95"
                      >
                        <div className="flex items-center justify-between border-b border-border px-5 py-3">
                          <h3 className="text-sm font-semibold text-on-surface">{group.category}</h3>
                          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                            {group.rules.length} {group.rules.length === 1 ? 'rule' : 'rules'}
                          </span>
                        </div>
                        <ul className="divide-y divide-border">
                          {group.rules.map((entry) => (
                            <li
                              key={entry.rule}
                              className="flex flex-col gap-2 px-5 py-4 lg:flex-row lg:items-start lg:gap-4"
                            >
                              <code className="shrink-0 rounded-md bg-surface-container px-2 py-1 text-[11px] font-semibold text-primary lg:w-44">
                                {entry.rfc}
                              </code>
                              <p className="text-sm leading-6 text-on-surface">{entry.rule}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            </div>
          </section>
        </div>
      </div>
    </MainLayout>
  )
}
