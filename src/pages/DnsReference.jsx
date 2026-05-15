import { useEffect, useMemo, useState } from 'react'
import { MainLayout } from '../components/Layout/MainLayout'
import { Badge, TextField } from '../components/Common'

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
    how: 'Exactly one SOA exists per zone, at the apex. The serial drives zone-transfer freshness; the timers control secondary refresh behavior. The SOA is editable from the UI via a structured form (PUT /updateSOA) — the backend validates timers against RFC 1912 §2.2 and auto-increments the serial on every change so the UI never needs to expose it.',
    example: 'example.com.  IN  SOA  ns1.example.com. admin.example.com. 2024010101 7200 3600 1209600 3600',
    rfc: 'RFC 1035 §3.3.13 (timers redefined by RFC 2308)',
    fields: [
      { name: 'MNAME', sample: 'ns1.example.com.', description: 'Primary master nameserver — the authoritative source for this zone.' },
      { name: 'RNAME', sample: 'admin.example.com.', description: 'Responsible-party email, with the first dot replacing the "@" (admin.example.com → admin@example.com).' },
      { name: 'SERIAL', sample: '2024010101', description: 'Zone serial number — incremented on every change. Secondaries compare this to detect that they need to re-transfer.' },
      { name: 'REFRESH', sample: '7200', description: 'Seconds between secondary refresh polls of the primary.' },
      { name: 'RETRY', sample: '3600', description: 'Seconds to wait before retrying a failed refresh.' },
      { name: 'EXPIRE', sample: '1209600', description: 'Seconds after which a secondary stops serving the zone if it cannot reach the primary (here, 14 days).' },
      { name: 'MINIMUM', sample: '3600', description: 'TTL for negative-cache responses (NXDOMAIN / no-data) per RFC 2308 — originally the zone-wide minimum TTL.' },
    ],
  },
]

const EMAIL_AUTH = [
  {
    name: 'SPF',
    fullName: 'Sender Policy Framework',
    owner: 'Zone apex (example.com)',
    what: 'Lists which hosts are authorized to send email on behalf of the domain. Receivers reject mail from anywhere else.',
    how: 'Published as a single TXT record at the apex with a "v=spf1" prefix and a list of mechanisms (include:, ip4:, ip6:, a:, mx:) terminated by an "all" rule. "-all" hard-fails unauthorized senders; "~all" soft-fails (suspicious but not rejected).',
    example: 'example.com.  3600  IN  TXT  "v=spf1 include:_spf.google.com ~all"',
    rfc: 'RFC 7208',
  },
  {
    name: 'DKIM',
    fullName: 'DomainKeys Identified Mail',
    owner: '<selector>._domainkey.example.com',
    what: 'Lets the sending mail server cryptographically sign outgoing messages so receivers can verify the body and key headers were not tampered with in transit.',
    how: 'For each signing key (the "selector"), a TXT record at <selector>._domainkey.<domain> publishes the public key. The sending server adds a "DKIM-Signature" header; receivers fetch the TXT, look up the public key, and verify the signature.',
    example: 'mail._domainkey.example.com.  3600  IN  TXT  "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQ..."',
    rfc: 'RFC 6376',
  },
  {
    name: 'DMARC',
    fullName: 'Domain-based Message Authentication, Reporting and Conformance',
    owner: '_dmarc.example.com',
    what: 'Tells receivers what to do with mail that fails SPF or DKIM (none / quarantine / reject), and where to send aggregate or forensic reports.',
    how: 'A single TXT record at _dmarc.<domain> with a "v=DMARC1" prefix. Common tags: p= (policy: none/quarantine/reject), rua= (aggregate report mailbox), ruf= (forensic), sp= (subdomain policy), pct= (rollout percentage), adkim/aspf= (alignment strictness).',
    example: '_dmarc.example.com.  3600  IN  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; pct=100"',
    rfc: 'RFC 7489',
  },
  {
    name: 'BIMI',
    fullName: 'Brand Indicators for Message Identification',
    owner: '<selector>._bimi.example.com (selector is usually "default")',
    what: 'Lets the domain advertise a verified logo URL that supporting mail clients (Gmail, Apple Mail, Yahoo) display next to authenticated messages.',
    how: 'A TXT record at default._bimi.<domain> pointing at an SVG-Tiny logo (l=) and optionally a Verified Mark Certificate (a=). Requires DMARC at p=quarantine or p=reject. Most providers also require the VMC.',
    example: 'default._bimi.example.com.  3600  IN  TXT  "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem"',
    rfc: 'IETF draft (not yet a finalized RFC)',
  },
  {
    name: 'MTA-STS',
    fullName: 'SMTP MTA Strict Transport Security',
    owner: '_mta-sts.example.com',
    what: 'Forces sending mail servers to use TLS — and to validate the certificate — when delivering mail to the domain. Closes the downgrade-attack window in vanilla SMTP.',
    how: 'A TXT record at _mta-sts.<domain> with a policy "id". The actual policy (mode, allowed MX hosts, max age) is served separately as text at https://mta-sts.<domain>/.well-known/mta-sts.txt. Senders cache the policy until the id changes.',
    example: '_mta-sts.example.com.  3600  IN  TXT  "v=STSv1; id=20240101000000"',
    rfc: 'RFC 8461',
  },
  {
    name: 'TLSRPT',
    fullName: 'SMTP TLS Reporting',
    owner: '_smtp._tls.example.com',
    what: 'Asks senders to report TLS connection failures (handshake errors, certificate mismatches, MTA-STS violations) so the domain owner can detect misconfiguration or active interference.',
    how: 'A TXT record at _smtp._tls.<domain> declaring where to send daily aggregate reports — either a mailto: address (rua=mailto:...) or an HTTPS endpoint (rua=https://...).',
    example: '_smtp._tls.example.com.  3600  IN  TXT  "v=TLSRPTv1; rua=mailto:tls-reports@example.com"',
    rfc: 'RFC 8460',
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
      { rfc: 'RFC 1035 §3.3.13 / RFC 1912 §2.2 / RFC 2308', rule: 'SOA records are editable via a dedicated structured endpoint (PUT /updateSOA) with timer-range validation (refresh 1200-43200, retry 120-7200, expire 1209600-2419200, minimum 60-86400, retry < refresh). The backend auto-increments the serial on every change — the UI does not expose it. SOA records cannot be deleted — every zone needs exactly one.' },
      { rfc: 'RFC 1035 §6.1 / RFC 1912 §2.8', rule: 'The apex NS RRset cannot be deleted — every zone must retain authoritative nameservers at the apex.' },
      { rfc: 'RFC 1035 §2.3.4', rule: 'Zone names are validated as proper domain names on creation (length, label rules, IDN auto-punycoding).' },
      { rfc: 'RFC 1034 §4.2.2', rule: 'On zone creation, in-bailiwick nameserver hosts must include at least one glue IP; out-of-bailiwick hosts must not.' },
      { rfc: 'RFC 4033-4035', rule: 'DNSSEC signing is exposed via /secureZone, /unsecureZone, and /getZoneDNSSEC. KSK + ZSK are provisioned with ECDSA P-256; DS records are surfaced for publication at the parent registrar.' },
    ],
  },
]

const INDEX = [
  { id: 'record-types', label: 'Record Types', accent: 'bg-violet-500' },
  { id: 'email-auth', label: 'Email Authentication', accent: 'bg-rose-500' },
  { id: 'core-concepts', label: 'Core Concepts', accent: 'bg-sky-500' },
  { id: 'dnssec', label: 'DNSSEC Terms', accent: 'bg-fuchsia-500' },
  { id: 'rfc-compliance', label: 'RFC Compliance', accent: 'bg-indigo-500' },
]

const QUICK_START = [
  {
    icon: 'category',
    accent: 'bg-violet-500/12 text-violet-600',
    title: 'Record Types',
    description: 'A, AAAA, CNAME, ALIAS, MX, NS, PTR, TXT, and SOA — what each one does, how it works, and a working example.',
    href: '#record-types',
    cta: 'Browse types',
  },
  {
    icon: 'mail',
    accent: 'bg-rose-500/12 text-rose-600',
    title: 'Email Authentication',
    description: 'SPF, DKIM, DMARC, BIMI, MTA-STS, and TLSRPT — how the TXT-record patterns at well-known names secure mail.',
    href: '#email-auth',
    cta: 'View patterns',
  },
  {
    icon: 'lock',
    accent: 'bg-fuchsia-500/12 text-fuchsia-600',
    title: 'DNSSEC Terms',
    description: 'KSK, ZSK, DS records, RRSIG, chain of trust — the vocabulary you need to read or operate a signed zone.',
    href: '#dnssec',
    cta: 'Read glossary',
  },
]

function QuickStartCard({ entry }) {
  return (
    <a
      href={entry.href}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface-container-lowest p-5 transition-all hover:border-primary/40 hover:shadow-lg"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${entry.accent}`}>
        <span className="material-symbols-outlined text-[20px]">{entry.icon}</span>
      </div>
      <h3 className="text-base font-semibold tracking-tight text-on-surface">{entry.title}</h3>
      <p className="flex-1 text-sm leading-6 text-on-surface-variant">{entry.description}</p>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-transform group-hover:translate-x-0.5">
        {entry.cta}
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </span>
    </a>
  )
}

function matches(query, ...fields) {
  if (!query) return true
  const lower = query.toLowerCase()
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(lower))
}

function SectionCard({ id, accent, title, count, countLabel, children }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-24">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">{title}</h2>
        </div>
        <Badge variant="zone">{count} {countLabel}</Badge>
      </div>
      {children}
    </section>
  )
}

export function DnsReference() {
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState('quick-start')
  const query = search.trim()

  const filteredRecordTypes = useMemo(
    () => RECORD_TYPES.filter((r) => matches(
      query, r.type, r.title, r.what, r.how, r.example, r.rfc,
      ...(r.fields ? r.fields.flatMap((f) => [f.name, f.description, f.sample]) : []),
    )),
    [query],
  )

  const filteredEmailAuth = useMemo(
    () => EMAIL_AUTH.filter((e) => matches(
      query, e.name, e.fullName, e.owner, e.what, e.how, e.example, e.rfc,
    )),
    [query],
  )

  const filteredConcepts = useMemo(
    () => CONCEPTS.filter((c) => matches(query, c.term, c.definition)),
    [query],
  )

  const filteredDnssec = useMemo(
    () => DNSSEC_TERMS.filter((d) => matches(query, d.term, d.definition)),
    [query],
  )

  const filteredRfc = useMemo(
    () => RFC_COMPLIANCE
      .map((group) => ({
        ...group,
        rules: group.rules.filter((r) => matches(query, group.category, r.rfc, r.rule)),
      }))
      .filter((group) => group.rules.length > 0),
    [query],
  )

  const visibility = {
    'record-types': filteredRecordTypes.length > 0,
    'email-auth': filteredEmailAuth.length > 0,
    'core-concepts': filteredConcepts.length > 0,
    'dnssec': filteredDnssec.length > 0,
    'rfc-compliance': filteredRfc.length > 0,
  }
  const anyVisible = Object.values(visibility).some(Boolean)

  const rfcCount = filteredRfc.reduce((sum, group) => sum + group.rules.length, 0)

  const visibleTocItems = useMemo(
    () => [
      { id: 'quick-start', label: 'Quick Start Paths' },
      ...INDEX.filter((item) => visibility[item.id]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredRecordTypes.length, filteredEmailAuth.length, filteredConcepts.length, filteredDnssec.length, filteredRfc.length],
  )

  useEffect(() => {
    const elements = visibleTocItems.map((item) => document.getElementById(item.id)).filter(Boolean)
    if (elements.length === 0) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: '-96px 0px -65% 0px', threshold: 0 },
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [visibleTocItems])

  return (
    <MainLayout breadcrumbs={[{ label: 'Docs', to: '/docs' }, { label: 'DNS Reference' }]}>
      <div className="min-h-full bg-surface">
        <div className="mx-auto w-full max-w-7xl px-6 py-8">
          <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_240px]">
            <main className="min-w-0">
              <header className="mb-10">
                <h1 className="text-3xl font-bold tracking-tight text-on-surface md:text-4xl">
                  DNS Reference
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-on-surface-variant">
                  A plain-language guide to every record type you can create, email-authentication records,
                  core DNS concepts, DNSSEC terminology, and the exact RFC rules the frontend validates before
                  anything reaches the server.
                </p>
              </header>

              <section id="quick-start" className="mb-12 scroll-mt-24">
                <h2 className="mb-4 text-xl font-bold tracking-tight text-on-surface">Quick Start Paths</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {QUICK_START.map((entry) => (
                    <QuickStartCard key={entry.title} entry={entry} />
                  ))}
                </div>
              </section>

              {!anyVisible && (
                <div className="rounded-2xl border border-border bg-surface-container-lowest p-8 text-center">
                  <p className="text-sm text-on-surface-variant">
                    No types, terms, or rules match <strong className="text-on-surface">"{query}"</strong>.
                  </p>
                </div>
              )}

              <div className="space-y-12">
                {visibility['record-types'] && (
                  <SectionCard
                    id="record-types"
                    accent="bg-violet-500"
                    title="Record Types"
                    count={filteredRecordTypes.length}
                    countLabel="types"
                  >
                    <div className="space-y-4">
                      {filteredRecordTypes.map((record) => (
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
                            {record.fields && (
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                                  Fields (in order)
                                </span>
                                <dl className="mt-1 divide-y divide-border rounded-xl border border-border bg-surface-container-lowest">
                                  {record.fields.map((field) => (
                                    <div
                                      key={field.name}
                                      className="grid gap-1 px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-3"
                                    >
                                      <dt className="flex flex-col gap-0.5">
                                        <code className="font-mono text-xs font-bold text-primary">{field.name}</code>
                                        <code className="font-mono text-[11px] text-on-surface-variant">{field.sample}</code>
                                      </dt>
                                      <dd className="text-xs leading-5 text-on-surface-variant">{field.description}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {visibility['email-auth'] && (
                  <SectionCard
                    id="email-auth"
                    accent="bg-rose-500"
                    title="Email Authentication"
                    count={filteredEmailAuth.length}
                    countLabel="records"
                  >
                    <p className="mb-4 text-sm leading-6 text-on-surface-variant">
                      These are not separate DNS record types — they are TXT records at well-known names, with
                      type-specific value formats. Each closes a different gap in vanilla SMTP security.
                    </p>
                    <div className="space-y-4">
                      {filteredEmailAuth.map((entry) => (
                        <article
                          key={entry.name}
                          className="api-docs-card overflow-hidden rounded-[24px] border border-border bg-surface-container-lowest/95"
                        >
                          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
                            <code className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-sm font-bold text-rose-700">
                              {entry.name}
                            </code>
                            <span className="text-sm font-semibold text-on-surface">{entry.fullName}</span>
                            <span className="ml-auto rounded-md bg-surface-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                              {entry.rfc}
                            </span>
                          </div>
                          <div className="space-y-3 px-5 py-4">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                                Owner name
                              </span>
                              <code className="mt-1 block font-mono text-xs text-on-surface">{entry.owner}</code>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                                What it does
                              </span>
                              <p className="mt-1 text-sm leading-6 text-on-surface">{entry.what}</p>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                                How it works
                              </span>
                              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{entry.how}</p>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                                Example
                              </span>
                              <pre className="mt-1 overflow-x-auto rounded-xl border border-border bg-surface-container-lowest px-4 py-2.5 text-xs leading-6">
                                <code className="font-mono text-on-surface">{entry.example}</code>
                              </pre>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {visibility['core-concepts'] && (
                  <SectionCard
                    id="core-concepts"
                    accent="bg-sky-500"
                    title="Core Concepts"
                    count={filteredConcepts.length}
                    countLabel="terms"
                  >
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {filteredConcepts.map((item) => (
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
                )}

                {visibility['dnssec'] && (
                  <SectionCard
                    id="dnssec"
                    accent="bg-fuchsia-500"
                    title="DNSSEC Terms"
                    count={filteredDnssec.length}
                    countLabel="terms"
                  >
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {filteredDnssec.map((item) => (
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
                )}

                {visibility['rfc-compliance'] && (
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
                      {filteredRfc.map((group) => (
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
                )}
              </div>
            </main>

            <aside className="hidden xl:block">
              <div className="sticky top-20 space-y-6 self-start">
                <TextField
                  icon="search"
                  placeholder="Search types, terms, RFCs…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <div>
                  <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                    <span>On This Page</span>
                    {query && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="font-medium normal-case tracking-normal text-primary hover:underline"
                      >
                        clear
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1 border-l border-border">
                    {visibleTocItems.map((item) => {
                      const isActive = activeId === item.id
                      return (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            className={`block -ml-px border-l-2 py-1.5 pl-3 text-sm transition-colors ${
                              isActive
                                ? 'border-primary font-semibold text-primary'
                                : 'border-transparent text-on-surface-variant hover:border-outline-variant hover:text-on-surface'
                            }`}
                          >
                            {item.label}
                          </a>
                        </li>
                      )
                    })}
                    {!anyVisible && (
                      <li className="pl-3 py-1.5 text-xs italic text-on-surface-variant">No matches.</li>
                    )}
                  </ul>
                </div>

                <div>
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                    Need Help?
                  </div>
                  <ul className="space-y-2">
                    <li>
                      <a
                        href="/docs"
                        className="flex items-center gap-2 text-sm text-on-surface-variant transition-colors hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-[16px]">terminal</span>
                        API Docs
                      </a>
                    </li>
                    <li>
                      <a
                        href="/rules"
                        className="flex items-center gap-2 text-sm text-on-surface-variant transition-colors hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-[16px]">rule</span>
                        Smart IP Rules
                      </a>
                    </li>
                    <li>
                      <a
                        href="/"
                        className="flex items-center gap-2 text-sm text-on-surface-variant transition-colors hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-[16px]">language</span>
                        Hosted Zones
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
