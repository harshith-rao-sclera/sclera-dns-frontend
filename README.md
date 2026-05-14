# dns_frontend

A React + Vite control plane for the **ScleraDNS** HTTP API. It manages hosted zones, RRsets, DNSSEC signing, and the custom "Smart IP" rule engine, and validates user input against the DNS RFCs before it leaves the browser.

## Stack

- React 19, Vite 8, React Router 7
- Tailwind CSS 4 (PostCSS pipeline)
- Axios HTTP client
- ESLint 9

## Getting started

```bash
npm install
npm run dev      # dev server with HMR
npm run build    # production build
npm run preview  # preview the production build
npm run lint     # ESLint
```

### Configuration

The backend base URL defaults to a hardcoded EC2 host in [src/api/scleraApi.js](src/api/scleraApi.js) and can be overridden by setting `VITE_SCLERA_API_BASE_URL`:

```bash
VITE_SCLERA_API_BASE_URL=http://localhost:8082 npm run dev
```

## Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `HostedZonesList` | List, create, and bulk-delete zones |
| `/zones/:zoneId` | `ZoneRecords` | View, create, edit, and delete RRsets in one zone; DNSSEC panel |
| `/rules` | `SmartRulesList` | Manage Smart IP regex rules and zone associations |
| `/docs` | `ApiDocs` | Live HTTP API reference — formatted request/response payloads, copy buttons, per-endpoint cURL |
| `/reference` | `DnsReference` | DNS record types, core concepts, DNSSEC terminology, and the RFC compliance rules the frontend enforces |

## Project layout

```
src/
  api/scleraApi.js         HTTP client + normalization/validation helpers
  components/
    Common/                Button, Modal, Table, TextField/TextArea, Select, Alert, Badge, CopyButton, CodeBlock…
    Layout/                MainLayout, TopBar, Sidebar
    Modals/                EditRecord, RecordDetails, CreateZone, DeleteConfirmation, Smart IP modals
    Zone/                  DnssecSection (collapsible DNSSEC panel for the zone detail page)
  context/                 Modal, Feedback, Theme providers
  hooks/                   useModal, useFeedback, useTheme
  pages/                   HostedZonesList, ZoneRecords, SmartRulesList, ApiDocs, DnsReference
  styles/globals.css       Tailwind + design-system tokens
```

## Backend API surface

ScleraDNS is an HTTP/JSON control plane (not a DNS-protocol server itself — see [Scope](#scope-this-is-a-control-plane)). Every call goes through `request()` in [src/api/scleraApi.js](src/api/scleraApi.js), which normalizes input and unwraps error messages.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service health |
| POST | `/createZone` | Create zone with nameservers (in/out-of-bailiwick checked server-side) |
| GET | `/listZones` | All zone names (trailing dot included) |
| GET | `/listRecords` | All zones with their RRsets |
| GET | `/getZone` | RRsets for one zone |
| POST | `/deleteZone` | Delete zone + records |
| GET | `/getRecord` | All values for one RRset |
| POST | `/addRecord` | Append one value to an RRset |
| PUT | `/updateRecord` | Replace all values in an RRset |
| POST | `/deleteRecord` | Remove one value (RRset auto-deleted when last value goes) |
| POST | `/deleteAllRecords` | Delete a whole RRset |
| POST | `/addSmartIPRule` | Create or update a Smart IP regex rule |
| POST | `/addZoneToSmartIPRule` | Attach a zone to a rule |
| POST | `/removeZoneFromSmartIPRule` | Detach a zone from a rule |
| GET | `/listSmartIPRules` | All Smart IP rules |
| POST | `/deleteSmartIPRule` | Delete a Smart IP rule |
| POST | `/secureZone` | Provision KSK + ZSK (ECDSA P-256) and return DS records to publish at the registrar |
| POST | `/unsecureZone` | Remove all cryptokeys and revert the zone to unsigned |
| GET | `/getZoneDNSSEC` | Read current DNSSEC state (keys + DS records) without modifying anything |
| GET | `/resolve` | Direct DNS-style query (name + type) |

## Smart IP rules

A custom routing layer (not a DNS RFC). Each rule attaches a Go-compatible regex pattern to one or more zones. When a query matches, capture group 1 is interpreted as the answer — and the dashed-IP convention (`10-10-10-10` → `10.10.10.10`) is auto-converted on the resolver side.

Example pattern:

```
^(\d{1,3}(?:-\d{1,3}){3})\.
```

Queried name `10-10-10-10.example.com.` → answer `10.10.10.10`.

The Create/Edit Smart IP Rule modal includes a live regex simulator that shows the matched substring, the inferred IP, and what happens for misses.

## RFC compliance — what the frontend enforces

The browser validates this before any data is sent to the backend. The same list is rendered on the `/reference` page (the DNS Reference) from a single data source ([RFC_COMPLIANCE in DnsReference.jsx](src/pages/DnsReference.jsx)), alongside record-type definitions and DNSSEC terminology.

### Names & labels
- **RFC 1035 §2.3.4** — Domain ≤ 253 chars; each label ≤ 63 chars. Applied to both record names and target values.
- **RFC 4343** — Record name comparisons are case-insensitive.
- **RFC 4592** — Wildcard `*` is allowed only as the full leftmost label (`*.example.com`). `*foo.example.com` is rejected.
- **RFC 5891 / RFC 3492** — Internationalized names are auto-converted to punycode (`xn--…`) on submit, with a live preview in the form. Implementation uses the browser's URL parser (`new URL('http://' + name).hostname`). See `toAsciiDomain` in [scleraApi.js](src/api/scleraApi.js).

### CNAME rules
- **RFC 1034 §3.6.2 / RFC 2181 §10.1** — CNAME cannot coexist with any other type at the same name.
- **RFC 1034 §3.6.2 / RFC 2181 §10.1** — CNAME forbidden at the zone apex.
- **RFC 1034 §3.6.2** — CNAME RRset can only contain a single target.
- **Self-loop guard** — CNAME and ALIAS cannot point to themselves (zone-aware FQDN comparison at submit).

### Record values
- **RFC 791 / RFC 4291** — A records must be valid IPv4; AAAA must be valid IPv6.
- **RFC 1035 §3.3.14** — TXT strings are limited to 255 chars each; quotes must be balanced; long values must be split into multiple strings.
- **RFC 1035 §3.3.11** — NS RDATA must be a hostname, not an IP address.
- **RFC 1035 §3.3.9** — MX records are `<preference> <hostname>`; preference is 0-65535 and the exchange must be a hostname (not an IP, not a wildcard).
- **RFC 1035 §3.3.12** — PTR records point to a single valid hostname.
- **RFC 4592** — CNAME, ALIAS, NS, MX, and PTR targets cannot be wildcard patterns (wildcards are owner-name semantics only).
- **RFC 2181 §10.3** — NS and MX targets cannot point to a name that already has a CNAME record (same-zone check at validation time).
- **RFC 2181 §8** — TTL must be a non-negative integer ≤ 2147483647 (0 means "do not cache").

### Zone integrity
- **RFC 1035 §3.3.13** — SOA records are system-managed; not editable or deletable from the UI.
- **RFC 1035 §6.1 / RFC 1912 §2.8** — The apex NS RRset cannot be deleted.
- **RFC 1035 §2.3.4** — Zone names are validated as proper domain names on creation (length, label rules, IDN auto-punycoding).
- **RFC 1034 §4.2.2** — On zone creation, in-bailiwick nameserver hosts must include at least one glue IP; out-of-bailiwick hosts must not.
- **RFC 4033-4035** — DNSSEC signing is exposed via `/secureZone`, `/unsecureZone`, `/getZoneDNSSEC`. KSK + ZSK are provisioned with ECDSA P-256 (algorithm 13); DS records are surfaced in the UI for publication at the parent registrar.

### Vendor extensions (non-RFC)

- **ALIAS** — apex-safe alias to another hostname. The server resolves the target and returns its A/AAAA values on the wire, sidestepping the CNAME-at-apex prohibition. The frontend validates the target as a hostname and constrains it to a single value, but ALIAS isn't standardized in any RFC and each provider implements it slightly differently.

### UX-level normalization (frontend convenience)

These aren't RFC requirements but reduce common user errors:

- **Subdomain auto-strip on submit** — typing `www.example.com` for zone `example.com` is normalized to subdomain `www` before sending. The Record Name field surfaces a hint when the input ends with the zone name. See `getSubdomainFromRecordName` and `toAsciiDomain` in [scleraApi.js](src/api/scleraApi.js).
- **Internal system zone gate** — zones matching `INTERNAL_SYSTEM_ZONE` (currently `sclera.internal`) are read-only in the UI.

## Scope: this is a control plane

The frontend talks to ScleraDNS over JSON/HTTP. Whether a true authoritative DNS server (UDP/TCP port 53, RFC 1035 wire format) sits behind `/resolve` is a backend concern and not visible from this repo. The frontend assumes:

- The backend stores zones/RRsets faithfully and applies the values it receives.
- DNSSEC key material, signing, and validation happen on the backend; the frontend only triggers `/secureZone` / `/unsecureZone` and displays the keys + DS records returned.
- AXFR/IXFR zone transfers, EDNS0, NOTIFY, and wire-level glue handling are backend responsibilities.
- Cross-record checks (e.g. RFC 2181 §10.3 — NS/MX targets must not be CNAMEs) are enforced on the client **only against records in the currently loaded zone**. A target in another zone can't be checked without a resolver, so the backend remains the final authority.

## Notable client behavior

- **Helper text minimization** — the Record Name field stays clean by default; hints appear only when relevant (input ends with the zone, or the input contains non-ASCII characters and a punycode preview is needed).
- **Per-row record actions** — each RRset row in the Zone Records table shows Edit + Delete, with locked icons and explanatory tooltips for SOA, apex NS, and internal-zone records.
- **DNSSEC panel** — the zone detail page has a collapsible DNSSEC section that reads `/getZoneDNSSEC` on load, surfaces DS records (sorted SHA-256 → SHA-384 → SHA-1) with copy buttons, hides raw DNSKEYs behind a "Technical details" disclosure, and gates enable/disable behind confirmation modals. DNSSEC can also be toggled on at zone-creation time.
- **Record type coverage** — A, AAAA, CNAME, ALIAS, MX, NS, PTR, TXT are creatable from the UI; SOA is system-managed.
- **Single source of truth for RFC docs** — the `/reference` page renders directly from the `RFC_COMPLIANCE` data structure, so adding or removing an enforced rule means editing one place.

## License

Private / internal.
