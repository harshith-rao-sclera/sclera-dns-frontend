import { useEffect, useState } from 'react'
import {
  Modal, TextField, TextArea, Select, Button, Alert,
} from '../Common'
import { useModal } from '../../hooks/useModal'
import {
  addRecord, parseRecordValues, updateRecord, isInternalSystemZone, getSubdomainFromRecordName,
  toAsciiDomain, hasNonAscii, trimTrailingDot, normalizeZoneName, validateTtl, MAX_TTL,
} from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

const RECORD_TYPES = [
  { value: 'A', label: 'A – Routes a hostname to an IPv4 address' },
  { value: 'AAAA', label: 'AAAA – Routes a hostname to an IPv6 address' },
  { value: 'CAA', label: 'CAA – Restricts which CAs may issue certificates' },
  { value: 'CNAME', label: 'CNAME – Points this name to another domain name' },
  { value: 'DS', label: 'DS – Links a delegated child zone into DNSSEC' },
  { value: 'HTTPS', label: 'HTTPS – Connection hints for browsers (ALPN, port, ECH)' },
  { value: 'MX', label: 'MX – Specifies the mail servers for the domain' },
  { value: 'NAPTR', label: 'NAPTR – Rewrites a name into a service or URI' },
  { value: 'NS', label: 'NS – Declares the authoritative name servers' },
  { value: 'PTR', label: 'PTR – Maps an IP address back to a hostname' },
  { value: 'SRV', label: 'SRV – Advertises the host and port of a service' },
  { value: 'SSHFP', label: 'SSHFP – Publishes an SSH host-key fingerprint' },
  { value: 'SVCB', label: 'SVCB – Generic service binding (HTTPS-style)' },
  { value: 'TLSA', label: 'TLSA – Pins a TLS certificate/key for DANE' },
  { value: 'TXT', label: 'TXT – Text values (SPF, DKIM, verification)' },
]

const ALIAS_ELIGIBLE_TYPES = new Set(['A', 'AAAA'])

function getEffectiveType(type, alias) {
  return alias && ALIAS_ELIGIBLE_TYPES.has(type) ? 'ALIAS' : type
}

const TTL_PRESETS = [
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '1h', value: 3600 },
  { label: '6h', value: 21600 },
  { label: '1d', value: 86400 },
]

const DOMAIN_PATTERN = /^(?=.{1,253}\.?$)(?:\*\.)?(?!-)(?:[a-zA-Z0-9_-]{1,63}(?<!-)\.)*[a-zA-Z0-9_-]{1,63}\.?$/

const IPV4_SEGMENT = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV4_PATTERN = new RegExp(`^${IPV4_SEGMENT}(\\.${IPV4_SEGMENT}){3}$`)
const IPV6_PATTERN = /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,7}:|:((:[0-9A-Fa-f]{1,4}){1,7}|:)|([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,5}(:[0-9A-Fa-f]{1,4}){1,2}|([0-9A-Fa-f]{1,4}:){1,4}(:[0-9A-Fa-f]{1,4}){1,3}|([0-9A-Fa-f]{1,4}:){1,3}(:[0-9A-Fa-f]{1,4}){1,4}|([0-9A-Fa-f]{1,4}:){1,2}(:[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:((:[0-9A-Fa-f]{1,4}){1,6}))$/

function isDomainLike(value) {
  return DOMAIN_PATTERN.test(value.trim())
}

// tokenizeNaptr splits a NAPTR value into whitespace-separated fields,
// treating each double-quoted string (quotes preserved, escapes intact) as a
// single token. Mirrors the backend tokenizer so the UI rejects the same
// inputs. Returns null on an unterminated quote.
function tokenizeNaptr(value) {
  const tokens = []
  let i = 0
  const n = value.length

  while (i < n) {
    while (i < n && (value[i] === ' ' || value[i] === '\t')) i += 1
    if (i >= n) break

    if (value[i] === '"') {
      let tok = '"'
      i += 1
      let closed = false
      while (i < n) {
        const c = value[i]
        if (c === '\\' && i + 1 < n) {
          tok += c + value[i + 1]
          i += 2
          continue
        }
        if (c === '"') {
          tok += '"'
          i += 1
          closed = true
          break
        }
        tok += c
        i += 1
      }
      if (!closed) return null
      tokens.push(tok)
      continue
    }

    const start = i
    while (i < n && value[i] !== ' ' && value[i] !== '\t') i += 1
    tokens.push(value.slice(start, i))
  }

  return tokens
}

// splitCaa parses a CAA value "<flags> <tag> <value>" into its three
// positional fields. flags and tag are whitespace-delimited; value is the
// rest (its quotes, if any, are preserved). Returns null if a field is
// missing. Mirrors the backend splitCAA.
function splitCaa(value) {
  const match = value.trim().match(/^(\S+)\s+(\S+)\s+(.+)$/)
  if (!match) return null
  return { flags: match[1], tag: match[2], value: match[3].trim() }
}

// tokenizeSvc splits an HTTPS/SVCB value into whitespace-separated tokens,
// treating a double-quoted run as part of its token. Mirrors the backend
// tokenizer. Returns null on an unterminated quote.
function tokenizeSvc(value) {
  const tokens = []
  let cur = ''
  let inQuote = false
  let escape = false
  let started = false
  const flush = () => {
    if (started) {
      tokens.push(cur)
      cur = ''
      started = false
    }
  }
  for (const ch of value) {
    if (escape) { cur += ch; escape = false; started = true; continue }
    if (ch === '\\') { cur += ch; escape = true; started = true; continue }
    if (ch === '"') { inQuote = !inQuote; cur += ch; started = true; continue }
    if (ch === ' ' || ch === '\t') {
      if (inQuote) { cur += ch; started = true } else { flush() }
      continue
    }
    cur += ch
    started = true
  }
  if (inQuote) return null
  flush()
  return tokens
}

const SVC_PARAM_KEYS = new Set([
  'mandatory', 'alpn', 'no-default-alpn', 'port', 'ipv4hint', 'ipv6hint', 'ech', 'dohpath',
])

function checkSvcParam(typeLabel, key, val, hasVal) {
  const needsValue = () => ((!hasVal || val === '') ? `${typeLabel} SvcParam "${key}" requires a value.` : '')
  switch (key) {
    case 'no-default-alpn':
      return hasVal ? `${typeLabel} SvcParam no-default-alpn takes no value.` : ''
    case 'port': {
      const e = needsValue(); if (e) return e
      const n = Number(val)
      return Number.isInteger(n) && n >= 0 && n <= 65535 ? '' : `${typeLabel} SvcParam port must be a whole number 0-65535.`
    }
    case 'alpn':
    case 'mandatory':
    case 'ech':
    case 'dohpath':
      return needsValue()
    case 'ipv4hint': {
      const e = needsValue(); if (e) return e
      return val.split(',').every((ip) => IPV4_PATTERN.test(ip)) ? '' : `${typeLabel} ipv4hint contains an invalid IPv4 address.`
    }
    case 'ipv6hint': {
      const e = needsValue(); if (e) return e
      return val.split(',').every((ip) => IPV6_PATTERN.test(ip)) ? '' : `${typeLabel} ipv6hint contains an invalid IPv6 address.`
    }
    default:
      return '' // generic keyNNNNN
  }
}

// validateSvcbRecord validates an HTTPS or SVCB value (RFC 9460) — identical
// presentation format; only the error-message label differs.
function validateSvcbRecord(typeLabel, trimmed) {
  const tokens = tokenizeSvc(trimmed)
  if (!tokens) {
    return `${typeLabel} record has an unterminated quoted value.`
  }
  if (tokens.length < 2) {
    return `${typeLabel} records must be "<priority> <target> [params...]", e.g. "1 . alpn=h2 port=443".`
  }
  const priority = Number(tokens[0])
  if (!Number.isInteger(priority) || priority < 0 || priority > 65535) {
    return `${typeLabel} SvcPriority must be a whole number between 0 and 65535 (RFC 9460).`
  }
  const target = tokens[1]
  if (target !== '.' && !isDomainLike(target)) {
    return `${typeLabel} target must be a domain name, or "." for the owner name itself.`
  }
  const params = tokens.slice(2)
  if (priority === 0) {
    return params.length > 0 ? `${typeLabel} in AliasMode (priority 0) must not have SvcParams.` : ''
  }
  const seen = new Set()
  for (const p of params) {
    const eq = p.indexOf('=')
    const key = eq === -1 ? p : p.slice(0, eq)
    let val = eq === -1 ? '' : p.slice(eq + 1)
    const hasVal = eq !== -1
    if (seen.has(key)) {
      return `${typeLabel} SvcParam "${key}" appears more than once.`
    }
    seen.add(key)
    if (!SVC_PARAM_KEYS.has(key) && !/^key[0-9]+$/.test(key)) {
      return `${typeLabel} unknown SvcParam key "${key}".`
    }
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1)
    }
    const paramError = checkSvcParam(typeLabel, key, val, hasVal)
    if (paramError) return paramError
  }
  return ''
}

function parseValuesByType(type, value) {
  // TXT, NAPTR, CAA, and HTTPS values can legitimately contain commas
  // (inside quoted strings / the NAPTR regexp / CAA issue parameters /
  // HTTPS alpn & iphint lists), so split multiple entries on newlines only —
  // never commas — to avoid shredding a single record's value.
  if (type === 'TXT' || type === 'NAPTR' || type === 'CAA' || type === 'HTTPS' || type === 'SVCB') {
    return value
      .split(/\n+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  return parseRecordValues(value)
}

function countUnescapedQuotes(value) {
  let count = 0

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"' && value[index - 1] !== '\\') {
      count += 1
    }
  }

  return count
}

function validateRecordValue(type, value) {
  const trimmed = value.trim()

  switch (type) {
    case 'A':
      return IPV4_PATTERN.test(trimmed) ? '' : 'A records must be valid IPv4 addresses.'
    case 'AAAA':
      return IPV6_PATTERN.test(trimmed) ? '' : 'AAAA records must be valid IPv6 addresses.'
    case 'CAA': {
      const parsed = splitCaa(trimmed)
      if (!parsed) {
        return 'CAA records must be "<flags> <tag> "<value>"", e.g. 0 issue "letsencrypt.org".'
      }
      const flagsNum = Number(parsed.flags)
      if (!Number.isInteger(flagsNum) || flagsNum < 0 || flagsNum > 255) {
        return 'CAA flags must be a whole number between 0 and 255 (RFC 8659).'
      }
      const tagLower = parsed.tag.toLowerCase()
      const allowedTags = ['issue', 'issuewild', 'iodef', 'contactemail', 'contactphone']
      if (!allowedTags.includes(tagLower)) {
        return 'CAA tag must be one of issue, issuewild, iodef, contactemail, contactphone (RFC 8659).'
      }
      const caaValue = parsed.value
      const inner = caaValue.length >= 2 && caaValue.startsWith('"') && caaValue.endsWith('"')
        ? caaValue.slice(1, -1)
        : caaValue
      if (tagLower === 'iodef' && !/^(mailto:|https?:)/.test(inner)) {
        return 'CAA iodef value must be a mailto:, http:, or https: URL.'
      }
      return ''
    }
    case 'DS': {
      const parts = trimmed.split(/\s+/)
      if (parts.length !== 4) {
        return 'DS records must be "<key-tag> <algorithm> <digest-type> <digest>", e.g. "12345 13 2 <64-hex-digits>".'
      }
      const keyTag = Number(parts[0])
      if (!Number.isInteger(keyTag) || keyTag < 0 || keyTag > 65535) {
        return 'DS key tag must be a whole number between 0 and 65535 (RFC 4034).'
      }
      const algo = Number(parts[1])
      if (!Number.isInteger(algo) || algo < 0 || algo > 255) {
        return 'DS algorithm must be a whole number between 0 and 255 (RFC 4034).'
      }
      const digestHexLen = { 1: 40, 2: 64, 4: 96 }
      const wantLen = digestHexLen[parts[2]]
      if (wantLen === undefined) {
        return 'DS digest type must be 1 (SHA-1), 2 (SHA-256), or 4 (SHA-384).'
      }
      const digest = parts[3]
      if (!/^[0-9a-fA-F]+$/.test(digest)) {
        return 'DS digest must be hexadecimal.'
      }
      if (digest.length !== wantLen) {
        return `DS digest for type ${parts[2]} must be ${wantLen} hex characters, got ${digest.length}.`
      }
      return ''
    }
    case 'TLSA': {
      const parts = trimmed.split(/\s+/)
      if (parts.length !== 4) {
        return 'TLSA records must be "<usage> <selector> <matching-type> <cert-data>", e.g. "3 1 1 <64-hex-digits>".'
      }
      const usage = Number(parts[0])
      if (!Number.isInteger(usage) || usage < 0 || usage > 3) {
        return 'TLSA usage must be 0-3 (0=PKIX-TA, 1=PKIX-EE, 2=DANE-TA, 3=DANE-EE) (RFC 6698).'
      }
      const selector = Number(parts[1])
      if (!Number.isInteger(selector) || selector < 0 || selector > 1) {
        return 'TLSA selector must be 0 (full certificate) or 1 (public key).'
      }
      const matching = Number(parts[2])
      if (!Number.isInteger(matching) || matching < 0 || matching > 2) {
        return 'TLSA matching type must be 0 (exact), 1 (SHA-256), or 2 (SHA-512).'
      }
      const data = parts[3]
      if (!/^[0-9a-fA-F]+$/.test(data) || data.length % 2 !== 0) {
        return 'TLSA certificate-association data must be even-length hexadecimal.'
      }
      if (matching === 1 && data.length !== 64) {
        return 'TLSA SHA-256 data (matching type 1) must be 64 hex characters.'
      }
      if (matching === 2 && data.length !== 128) {
        return 'TLSA SHA-512 data (matching type 2) must be 128 hex characters.'
      }
      return ''
    }
    case 'SSHFP': {
      const parts = trimmed.split(/\s+/)
      if (parts.length !== 3) {
        return 'SSHFP records must be "<algorithm> <fingerprint-type> <fingerprint>", e.g. "4 2 <64-hex-digits>".'
      }
      const algo = Number(parts[0])
      if (!Number.isInteger(algo) || algo < 1 || algo > 4) {
        return 'SSHFP algorithm must be 1 (RSA), 2 (DSA), 3 (ECDSA), or 4 (Ed25519) (RFC 4255).'
      }
      const fpHexLen = { 1: 40, 2: 64 }
      const wantLen = fpHexLen[parts[1]]
      if (wantLen === undefined) {
        return 'SSHFP fingerprint type must be 1 (SHA-1) or 2 (SHA-256).'
      }
      const fp = parts[2]
      if (!/^[0-9a-fA-F]+$/.test(fp)) {
        return 'SSHFP fingerprint must be hexadecimal.'
      }
      if (fp.length !== wantLen) {
        return `SSHFP fingerprint for type ${parts[1]} must be ${wantLen} hex characters, got ${fp.length}.`
      }
      return ''
    }
    case 'HTTPS':
      return validateSvcbRecord('HTTPS', trimmed)
    case 'SVCB':
      return validateSvcbRecord('SVCB', trimmed)
    case 'CNAME':
      if (trimmed.startsWith('*.')) {
        return 'CNAME target cannot be a wildcard pattern (RFC 4592 covers owner names only).'
      }
      return isDomainLike(trimmed) ? '' : 'CNAME records must be valid hostnames.'
    case 'ALIAS':
      if (trimmed.startsWith('*.')) {
        return 'ALIAS target cannot be a wildcard pattern.'
      }
      return isDomainLike(trimmed) ? '' : 'ALIAS records must point to a valid hostname.'
    case 'NS':
      if (trimmed.startsWith('*.')) {
        return 'NS target cannot be a wildcard pattern.'
      }
      if (IPV4_PATTERN.test(trimmed)) {
        return 'NS targets must be hostnames, not IP addresses (RFC 1035 §3.3.11).'
      }
      return isDomainLike(trimmed) ? '' : 'NS records must be valid nameserver hostnames.'
    case 'MX': {
      const match = trimmed.match(/^(\d+)\s+(\S.*)$/)
      if (!match) {
        return 'MX records must be "<preference> <hostname>", e.g. "10 mail.example.com". Use "0 ." for Null MX (RFC 7505).'
      }
      const pref = Number(match[1])
      if (!Number.isInteger(pref) || pref < 0 || pref > 65535) {
        return 'MX preference must be a whole number between 0 and 65535 (RFC 1035 §3.3.9).'
      }
      const target = match[2].trim()
      // Null MX (RFC 7505): "0 ." advertises that the domain does not accept mail.
      const isNullTarget = target === '.' || target === ''
      if (isNullTarget) {
        if (pref !== 0) {
          return 'Null MX records (target ".") must have preference 0 (RFC 7505).'
        }
        return ''
      }
      if (target.startsWith('*.')) {
        return 'MX target cannot be a wildcard pattern.'
      }
      if (IPV4_PATTERN.test(target)) {
        return 'MX target must be a hostname, not an IP address (RFC 1035 §3.3.9).'
      }
      return isDomainLike(target) ? '' : 'MX target must be a valid hostname.'
    }
    case 'PTR':
      if (trimmed.startsWith('*.')) {
        return 'PTR target cannot be a wildcard pattern.'
      }
      if (IPV4_PATTERN.test(trimmed)) {
        return 'PTR targets must be hostnames, not IP addresses (RFC 1035 §3.3.12).'
      }
      return isDomainLike(trimmed) ? '' : 'PTR records must be valid hostnames.'
    case 'SRV': {
      const match = trimmed.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S.*)$/)
      if (!match) {
        return 'SRV records must be "<priority> <weight> <port> <target>", e.g. "10 60 5060 sip1.example.com".'
      }
      const fields = [
        { n: Number(match[1]), label: 'priority' },
        { n: Number(match[2]), label: 'weight' },
        { n: Number(match[3]), label: 'port' },
      ]
      const badField = fields.find(({ n }) => !Number.isInteger(n) || n < 0 || n > 65535)
      if (badField) {
        return `SRV ${badField.label} must be a whole number between 0 and 65535 (RFC 2782).`
      }
      const target = match[4].trim()
      // RFC 2782: target "." means the service is decidedly not available here.
      if (target === '.') {
        return ''
      }
      if (target.startsWith('*.')) {
        return 'SRV target cannot be a wildcard pattern.'
      }
      if (IPV4_PATTERN.test(target)) {
        return 'SRV target must be a hostname, not an IP address (RFC 2782).'
      }
      return isDomainLike(target) ? '' : 'SRV target must be a valid hostname.'
    }
    case 'NAPTR': {
      const tokens = tokenizeNaptr(trimmed)
      if (!tokens) {
        return 'NAPTR has an unterminated quoted field — check your double quotes.'
      }
      if (tokens.length !== 6) {
        return 'NAPTR must be "<order> <preference> "<flags>" "<service>" "<regexp>" <replacement>" (6 fields).'
      }
      const nums = [
        { n: Number(tokens[0]), label: 'order' },
        { n: Number(tokens[1]), label: 'preference' },
      ]
      const badNum = nums.find(({ n }) => !Number.isInteger(n) || n < 0 || n > 65535)
      if (badNum) {
        return `NAPTR ${badNum.label} must be a whole number between 0 and 65535 (RFC 3403).`
      }
      const quoted = [
        { tok: tokens[2], label: 'flags' },
        { tok: tokens[3], label: 'service' },
        { tok: tokens[4], label: 'regexp' },
      ]
      const badQuote = quoted.find(({ tok }) => tok.length < 2 || !tok.startsWith('"') || !tok.endsWith('"'))
      if (badQuote) {
        return `NAPTR ${badQuote.label} must be a double-quoted string (use "" for empty).`
      }
      const flags = tokens[2].slice(1, -1)
      if (!/^[A-Za-z0-9]*$/.test(flags)) {
        return 'NAPTR flags must contain only letters and digits (RFC 3403).'
      }
      const regexpEmpty = tokens[4] === '""'
      const replacement = tokens[5]
      const terminal = replacement === '.'
      if (!regexpEmpty && !terminal) {
        return 'NAPTR regexp and replacement are mutually exclusive — set replacement to "." when using a regexp (RFC 3403 §4.1).'
      }
      if (!terminal && !isDomainLike(replacement)) {
        return 'NAPTR replacement must be a valid domain name, or "." when a regexp is used.'
      }
      return ''
    }
    case 'TXT': {
      if (!trimmed) {
        return 'TXT records cannot be empty.'
      }

      if (countUnescapedQuotes(trimmed) % 2 !== 0) {
        return 'TXT records must use balanced double quotes when quotes are included.'
      }

      const unwrapped = trimmed.startsWith('"') && trimmed.endsWith('"')
        ? trimmed.slice(1, -1)
        : trimmed

      if (unwrapped.length > 255) {
        return 'Each TXT entry should stay within 255 characters. Split long text into separate entries.'
      }

      return ''
    }
    default:
      return trimmed ? '' : 'Record value cannot be empty.'
  }
}


function getInitialForm(data) {
  const record = data?.record

  if (!record) {
    return { name: '', type: 'A', ttl: '300', value: '', alias: false }
  }

  const rawType = record.type || 'A'
  const isAlias = rawType === 'ALIAS'

  return {
    name: record.name || '@',
    type: isAlias ? 'A' : rawType,
    ttl: String(record.ttl || 300),
    value: record.values?.join('\n') || record.value || '',
    alias: isAlias,
  }
}

function normalizeRecordNameKey(value = '') {
  const trimmed = value.trim()

  if (!trimmed || trimmed === '@') {
    return '@'
  }

  return trimmed.replace(/\.$/, '').toLowerCase()
}

function normalizeNameInput(name, zone) {
  if (!zone) return name.trim().replace(/\.$/, '')
  return getSubdomainFromRecordName(toAsciiDomain(name), zone)
}

function validateRecordName({ name, type, zone = '', records = [], currentRecord }) {
  const normalizedSubdomain = normalizeNameInput(name, zone)

  if (normalizedSubdomain !== '@' && normalizedSubdomain && !DOMAIN_PATTERN.test(normalizedSubdomain)) {
    return 'Record name must be a valid hostname (letters, digits, hyphens, underscores; labels up to 63 chars; "*" only as the full leftmost label).'
  }

  if (type === 'CNAME' && normalizedSubdomain === '@') {
    return 'CNAME records cannot be created at the zone apex.'
  }

  if (type === 'SRV') {
    const sub = normalizedSubdomain === '@' ? '' : normalizedSubdomain
    const labels = sub.split('.')
    const wellFormed = labels.length >= 2
      && labels[0].length > 1 && labels[0].startsWith('_')
      && labels[1].length > 1 && labels[1].startsWith('_')
    if (!wellFormed) {
      return 'SRV records require a _service._proto name, e.g. "_sip._tcp" (RFC 2782).'
    }
  }

  const lookupKey = normalizeRecordNameKey(normalizedSubdomain)

  const siblingRecords = records.filter((record) => {
    if (currentRecord && record.id === currentRecord.id) {
      return false
    }
    return normalizeRecordNameKey(record.name) === lookupKey
  })

  if (!currentRecord && (type === 'CNAME' || type === 'ALIAS')) {
    const sameTypeSibling = siblingRecords.find((record) => record.type === type)
    if (sameTypeSibling) {
      return `An existing ${type} record at "${normalizedSubdomain}" already exists. Use Edit on that row to change it (a new ${type} would replace it).`
    }
  }

  const hasCnameSibling = siblingRecords.some((record) => record.type === 'CNAME')
  const hasNonCnameSibling = siblingRecords.some((record) => record.type !== 'CNAME')

  if (type === 'CNAME' && hasNonCnameSibling) {
    return 'A CNAME record cannot coexist with other record types on the same name.'
  }

  if (type !== 'CNAME' && hasCnameSibling) {
    return 'This name already has a CNAME record, so other record types are not allowed here.'
  }

  if (type === 'DS') {
    if (normalizedSubdomain === '@') {
      return 'DS records cannot be placed at the zone apex — a zone’s own DS goes in its parent (your registrar). DS here is only for delegations to child zones you host.'
    }
    if (!siblingRecords.some((record) => record.type === 'NS')) {
      return 'DS must be placed at a delegation point — add the NS record(s) delegating this name to its child zone first (RFC 4034).'
    }
  }

  if (type === 'TLSA') {
    const sub = normalizedSubdomain === '@' ? '' : normalizedSubdomain
    const labels = sub.split('.')
    const portLabel = labels[0] || ''
    const protoLabel = labels[1] || ''
    const port = Number(portLabel.slice(1))
    const wellFormed = labels.length >= 2
      && portLabel.startsWith('_') && Number.isInteger(port) && port >= 1 && port <= 65535
      && protoLabel.length > 1 && protoLabel.startsWith('_')
    if (!wellFormed) {
      return 'TLSA records require a _<port>._<proto> name, e.g. "_443._tcp" (RFC 6698).'
    }
  }

  return ''
}

function getRecordValueConfig(type) {
  switch (type) {
    case 'A':
      return {
        label: 'IPv4 Address',
        placeholder: 'e.g. 192.0.2.10',
        helperText: 'Use valid IPv4 addresses only. You can enter multiple values with commas or new lines.',
        rows: 3,
      }
    case 'AAAA':
      return {
        label: 'IPv6 Address',
        placeholder: 'e.g. 2001:db8::10',
        helperText: 'Use valid IPv6 addresses only. You can enter multiple values with commas or new lines.',
        rows: 3,
      }
    case 'CAA':
      return {
        label: 'CAA Policy',
        placeholder: '0 issue "letsencrypt.org"',
        helperText: 'Format: "<flags> <tag> "<value>"" (RFC 8659). flags 0-255 (usually 0); tag is issue, issuewild, or iodef. issue/issuewild take a CA domain (or ";" to forbid all); iodef takes a mailto:/https: URL. One policy per line.',
        rows: 3,
      }
    case 'CNAME':
      return {
        label: 'Canonical Target',
        placeholder: 'e.g. origin.example.net',
        helperText: 'Single hostname this record points to. Trailing dot is optional. CNAME is not allowed at the zone apex.',
        rows: 1,
      }
    case 'DS':
      return {
        label: 'Delegation Signer',
        placeholder: '12345 13 2 <64-hex-digit digest>',
        helperText: 'Format: "<key-tag> <algorithm> <digest-type> <digest>" (RFC 4034). digest-type 1=SHA-1, 2=SHA-256, 4=SHA-384; the digest is hex of the matching length. Place this at a sub-name you delegate via NS — not the apex — and the parent zone must already be DNSSEC-signed. Your own zone’s DS goes at your registrar, not here.',
        rows: 2,
      }
    case 'HTTPS':
      return {
        label: 'HTTPS Service Binding',
        placeholder: '1 . alpn=h2,h3 port=443 ipv4hint=192.0.2.1',
        helperText: 'Format: "<priority> <target> [params...]" (RFC 9460). priority 0 = AliasMode (target only — the apex-alias use case); >0 = ServiceMode with params: alpn=h2,h3, port=8443, ipv4hint=/ipv6hint=, ech=, no-default-alpn, mandatory=. Target "." means the owner name. Browsers actually use these. One record per line.',
        rows: 3,
      }
    case 'SVCB':
      return {
        label: 'SVCB Service Binding',
        placeholder: '1 svc.example.net port=853 alpn=dot',
        helperText: 'Generic service binding — same format as HTTPS (RFC 9460): "<priority> <target> [params...]". priority 0 = AliasMode (target only); >0 = ServiceMode with params (alpn, port, ipv4hint, ipv6hint, ech, mandatory, no-default-alpn). Use it for non-HTTP protocols (e.g. DNS-over-TLS). One record per line.',
        rows: 3,
      }
    case 'ALIAS':
      return {
        label: 'Alias Target',
        placeholder: 'e.g. app.example.net',
        helperText: 'Single hostname to alias. Trailing dot is optional. The server resolves the target and returns its A/AAAA values, so this works at the zone apex.',
        rows: 1,
      }
    case 'NS':
      return {
        label: 'Nameserver Hostname',
        placeholder: 'e.g. ns1.example.net',
        helperText: 'One nameserver hostname per line or comma-separated. Trailing dot is optional.',
        rows: 3,
      }
    case 'MX':
      return {
        label: 'Mail Exchanger',
        placeholder: '10 mail.example.com',
        helperText: 'Format: "<preference> <hostname>". Lower preference is preferred (RFC 5321 §5.1). Multiple entries allowed, one per line or comma-separated. Use "0 ." for Null MX (RFC 7505) to declare the domain accepts no mail — must be the only entry.',
        rows: 3,
      }
    case 'PTR':
      return {
        label: 'Hostname Target',
        placeholder: 'e.g. host.example.com',
        helperText: 'Hostname this PTR record points to (used for reverse DNS). Trailing dot is optional.',
        rows: 2,
      }
    case 'SRV':
      return {
        label: 'Service Target',
        placeholder: '10 60 5060 sip1.example.com',
        helperText: 'Format: "<priority> <weight> <port> <target>" (RFC 2782). Lower priority is preferred; weight splits load among equal priorities. The record name must be _service._proto (e.g. _sip._tcp). Multiple entries allowed, one per line. Use "0 0 0 ." to declare the service unavailable.',
        rows: 3,
      }
    case 'TLSA':
      return {
        label: 'TLSA / DANE Record',
        placeholder: '3 1 1 <64-hex-digit SHA-256>',
        helperText: 'Format: "<usage> <selector> <matching-type> <cert-data>" (RFC 6698). Common: "3 1 1" = DANE-EE, public key, SHA-256. The record name must be _<port>._<proto> (e.g. _443._tcp), and the zone must be DNSSEC-signed — DANE relies on DNSSEC. Mostly used for mail (_25._tcp); browsers do not do DANE.',
        rows: 2,
      }
    case 'SSHFP':
      return {
        label: 'SSH Host-Key Fingerprint',
        placeholder: '4 2 <64-hex-digit SHA-256>',
        helperText: 'Format: "<algorithm> <fingerprint-type> <fingerprint>" (RFC 4255). algorithm 1=RSA, 2=DSA, 3=ECDSA, 4=Ed25519; fingerprint-type 1=SHA-1, 2=SHA-256. The record name is the host itself. Generate with "ssh-keygen -r <host>". The zone must be DNSSEC-signed — ssh ignores unsigned SSHFP.',
        rows: 3,
      }
    case 'NAPTR':
      return {
        label: 'NAPTR Rule',
        placeholder: '100 10 "S" "SIP+D2U" "" _sip._udp.example.com.',
        helperText: 'Format: "<order> <preference> "<flags>" "<service>" "<regexp>" <replacement>" (RFC 3403). The three quoted fields stay quoted ("" for empty). regexp and replacement are mutually exclusive — use a regexp with replacement ".", or a replacement domain with regexp "". One rule per line.',
        rows: 3,
      }
    case 'TXT':
      return {
        label: 'TXT Value',
        placeholder: '"v=spf1 include:mail.example.com ~all"',
        helperText: 'Enter one TXT value per line. Commas stay inside the TXT value, and quotes must be balanced.',
        rows: 4,
      }
    default:
      return {
        label: 'Record Value',
        placeholder: 'Enter a record value',
        helperText: 'Use commas or new lines to enter multiple values.',
        rows: 3,
      }
  }
}

export function EditRecordModal() {
  const formId = 'edit-record-form'
  const modal = useModal('editRecord')
  const { showError, showSuccess } = useFeedback()
  const [form, setForm] = useState(getInitialForm(null))
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState('')
  const [valueError, setValueError] = useState('')
  const [ttlError, setTtlError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (modal.isOpen) {
      setForm(getInitialForm(modal.data))
      setError('')
      setNameError('')
      setValueError('')
      setTtlError('')
    }
  }, [modal.data, modal.isOpen])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const punycodeIfDomain = (type, value) => {
    if (type === 'CNAME' || type === 'ALIAS' || type === 'NS' || type === 'PTR') {
      return toAsciiDomain(value)
    }
    if (type === 'MX') {
      const match = String(value).trim().match(/^(\d+)\s+(\S.*)$/)
      if (!match) return value
      return `${match[1]} ${toAsciiDomain(match[2].trim())}`
    }
    if (type === 'SRV') {
      const match = String(value).trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S.*)$/)
      if (!match) return value
      const target = match[4].trim()
      return `${match[1]} ${match[2]} ${match[3]} ${target === '.' ? '.' : toAsciiDomain(target)}`
    }
    return value
  }

  const validateCurrentValues = (type, rawValue) => {
    const values = parseValuesByType(type, rawValue)
    if (values.length === 0) return ''
    const punycoded = values.map((value) => punycodeIfDomain(type, value))
    const valueError = punycoded
      .map((value) => validateRecordValue(type, value))
      .find(Boolean)
    if (valueError) return valueError
    if (type === 'NS' || type === 'MX' || type === 'SRV') {
      return checkTargetsAgainstCnames(punycoded, modal.data?.records || [], modal.data?.zone || '', type)
    }
    return ''
  }

  function extractHostTarget(type, value) {
    if (type === 'MX') {
      const match = String(value).trim().match(/^\d+\s+(\S.*)$/)
      return match ? match[1].trim() : String(value)
    }
    if (type === 'SRV') {
      const match = String(value).trim().match(/^\d+\s+\d+\s+\d+\s+(\S.*)$/)
      return match ? match[1].trim() : String(value)
    }
    return String(value)
  }

  function checkTargetsAgainstCnames(targets, records, zone, recordType) {
    if (!records.length) return ''
    const cnameKeys = new Set(
      records.filter((r) => r.type === 'CNAME').map((r) => normalizeRecordNameKey(r.name)),
    )
    if (cnameKeys.size === 0) return ''
    for (const target of targets) {
      const host = extractHostTarget(recordType, target)
      const cleanHost = trimTrailingDot(String(host).trim())
      // Skip sentinel targets that aren't real hostnames to cross-check:
      // Null MX (RFC 7505, "0 .") and SRV "service unavailable" ("... .").
      if ((recordType === 'MX' || recordType === 'SRV') && cleanHost === '') continue
      const ascii = toAsciiDomain(cleanHost)
      const subdomain = getSubdomainFromRecordName(ascii, zone)
      if (cnameKeys.has(normalizeRecordNameKey(subdomain))) {
        return `${recordType} target "${target}" points to a name that already has a CNAME — RFC 2181 §10.3 forbids this.`
      }
    }
    return ''
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      if (isInternalSystemZone(modal.data?.zone)) {
        throw new Error('This zone is system-managed and cannot be changed from the frontend.')
      }

      if (modal.data?.record?.type === 'SOA') {
        throw new Error('SOA records are managed by the system and cannot be edited here.')
      }

      const effectiveType = getEffectiveType(form.type, form.alias)
      const rawValues = parseValuesByType(effectiveType, form.value)
      const values = rawValues.map((value) => punycodeIfDomain(effectiveType, value))

      if (values.length === 0) {
        throw new Error('Please provide at least one record value.')
      }

      if (effectiveType === 'CNAME' && values.length > 1) {
        throw new Error('CNAME records can only have a single target (RFC 1034 §3.6.2).')
      }

      if (effectiveType === 'ALIAS' && values.length > 1) {
        throw new Error('ALIAS records can only have a single target.')
      }

      if (effectiveType === 'MX' && values.length > 1) {
        const hasNullMx = values.some((v) => {
          const m = String(v).trim().match(/^(\d+)\s+(\S.*)$/)
          if (!m) return false
          const target = m[2].trim()
          return Number(m[1]) === 0 && (target === '.' || target === '')
        })
        if (hasNullMx) {
          throw new Error('Null MX (RFC 7505) cannot coexist with other MX records — it explicitly declares the domain accepts no mail.')
        }
      }

      const dedupKeys = values.map((v) => String(v).trim().replace(/\.$/, '').toLowerCase())
      const dupKey = dedupKeys.find((k, i) => dedupKeys.indexOf(k) !== i)
      if (dupKey) {
        throw new Error(`Duplicate value "${dupKey}" — each value in an RRset must be unique.`)
      }

      const nextNameError = validateRecordName({
        name: form.name,
        type: effectiveType,
        zone: modal.data?.zone,
        records: modal.data?.records || [],
        currentRecord: modal.data?.record,
      })
      const nextTtlError = validateTtl(form.ttl)
      const perValueError = values.map((value) => validateRecordValue(effectiveType, value)).find(Boolean) || ''
      const crossError = (effectiveType === 'NS' || effectiveType === 'MX')
        ? checkTargetsAgainstCnames(values, modal.data?.records || [], modal.data?.zone || '', effectiveType)
        : ''
      const nextValueError = perValueError || crossError

      setNameError(nextNameError)
      setTtlError(nextTtlError)
      setValueError(nextValueError)

      if (nextNameError || nextTtlError || nextValueError) {
        throw new Error(nextNameError || nextTtlError || nextValueError)
      }

      const submittedName = isEdit
        ? (modal.data?.record?.name || form.name)
        : getSubdomainFromRecordName(toAsciiDomain(form.name), modal.data?.zone)

      if ((effectiveType === 'CNAME' || effectiveType === 'ALIAS') && values.length === 1) {
        const target = trimTrailingDot(values[0]).toLowerCase()
        const lowerZone = normalizeZoneName(modal.data?.zone || '').toLowerCase()
        const recordFqdn = !submittedName || submittedName === '@'
          ? lowerZone
          : `${submittedName.toLowerCase()}.${lowerZone}`
        if (target && recordFqdn && target === recordFqdn) {
          throw new Error(`${effectiveType} target cannot point to itself (self-loop at ${recordFqdn}).`)
        }
      }

      const payload = {
        zone: modal.data?.zone,
        subdomain: submittedName,
        record_type: isEdit ? (modal.data?.record?.type || effectiveType) : effectiveType,
        ttl: Number(form.ttl),
      }

      if (modal.data?.record) {
        await updateRecord({
          ...payload,
          values,
        })
        showSuccess('Record updated successfully.', 'Record updated')
      } else {
        await Promise.all(values.map((value) => addRecord({ ...payload, value })))
        showSuccess('Record created successfully.', 'Record created')
      }

      await modal.data?.onSuccess?.()
      modal.close()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to save record.'
      setError(message)
      showError(message, 'Record save failed')
    } finally {
      setLoading(false)
    }
  }

  const isEdit = !!modal.data?.record
  const zone = modal.data?.zone || ''
  const effectiveType = getEffectiveType(form.type, form.alias)
  const aliasEligible = ALIAS_ELIGIBLE_TYPES.has(form.type)
  const valueConfig = getRecordValueConfig(effectiveType)
  const isSingleValueType = effectiveType === 'CNAME' || effectiveType === 'ALIAS'
  const title = isEdit
    ? `Edit ${modal.data.record.type} Record: ${modal.data.record.name}`
    : 'Create DNS Record'

  const namePreviewAscii = !isEdit && hasNonAscii(form.name)
    ? toAsciiDomain(form.name)
    : ''
  const showNamePreview = namePreviewAscii && namePreviewAscii !== form.name.trim()

  const trimmedName = form.name.trim().replace(/\.$/, '').toLowerCase()
  const lowerZone = zone.trim().replace(/\.$/, '').toLowerCase()
  const endsWithZone = !isEdit && lowerZone && (
    trimmedName === lowerZone || trimmedName.endsWith(`.${lowerZone}`)
  )

  const valuePreviewAscii = ['CNAME', 'ALIAS', 'NS', 'MX', 'PTR'].includes(effectiveType)
    ? parseValuesByType(effectiveType, form.value)
      .filter(hasNonAscii)
      .map((value) => punycodeIfDomain(effectiveType, value))
    : []

  const existingRrset = !isEdit
    ? (() => {
      const lookupKey = normalizeRecordNameKey(normalizeNameInput(form.name, zone))
      if (!lookupKey) return null
      return (modal.data?.records || []).find((record) => (
        normalizeRecordNameKey(record.name) === lookupKey && record.type === effectiveType
      )) || null
    })()
    : null

  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title={title}
      subtitle={zone ? `Zone: ${zone}` : undefined}
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={modal.close}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <Button type="submit" form={formId} disabled={loading}>
            {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Record'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {error && (
          <Alert title="Unable to save record">
            {error}
          </Alert>
        )}

        {isEdit && (
          <Alert title="Safe edit mode">
            Record name and type are locked while editing so this update stays attached to the same RRset.
          </Alert>
        )}

        <div>
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">
            Basic Information
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Record Name"
              placeholder="e.g. api, www, @"
              value={form.name}
              onChange={(event) => {
                const nextName = event.target.value
                set('name', nextName)
                setNameError(validateRecordName({
                  name: nextName,
                  type: effectiveType,
                  zone,
                  records: modal.data?.records || [],
                  currentRecord: modal.data?.record,
                }))
              }}
              disabled={isEdit}
              error={!!nameError}
              errorMessage={nameError}
              helperText={endsWithZone
                ? `Just the subdomain — don't include "${zone}".`
                : showNamePreview
                  ? `Will be saved as "${namePreviewAscii}" (IDN, RFC 5891).`
                  : undefined
              }
            />
            <Select
              label="Record Type"
              options={RECORD_TYPES}
              value={form.type}
              onChange={(event) => {
                const nextType = event.target.value
                const nextAlias = form.alias && ALIAS_ELIGIBLE_TYPES.has(nextType)
                const nextEffective = getEffectiveType(nextType, nextAlias)
                setForm((current) => ({ ...current, type: nextType, alias: nextAlias }))
                setNameError(validateRecordName({
                  name: form.name,
                  type: nextEffective,
                  zone,
                  records: modal.data?.records || [],
                  currentRecord: modal.data?.record,
                }))
                setValueError(validateCurrentValues(nextEffective, form.value))
              }}
              disabled={isEdit}
            />
          </div>
        </div>

        {aliasEligible && (!isEdit || form.alias) && (
          <div className="-mt-2 flex items-start gap-3 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.alias}
              disabled={isEdit}
              onClick={() => {
                const nextAlias = !form.alias
                const nextEffective = getEffectiveType(form.type, nextAlias)
                set('alias', nextAlias)
                setNameError(validateRecordName({
                  name: form.name,
                  type: nextEffective,
                  zone,
                  records: modal.data?.records || [],
                  currentRecord: modal.data?.record,
                }))
                setValueError(validateCurrentValues(nextEffective, form.value))
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                form.alias ? 'bg-primary' : 'bg-surface-container-high'
              } ${isEdit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  form.alias ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`}
              />
            </button>
            <div className="text-xs leading-snug">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-on-surface">Alias</span>
                <span className="group relative inline-flex">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-on-surface-variant cursor-help">
                    <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
                  </svg>
                  <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 hidden w-80 rounded-md bg-surface-container-high px-3 py-2 text-[11px] leading-relaxed text-on-surface shadow-lg ring-1 ring-outline-variant/30 group-hover:block">
                    An apex-safe alternative to CNAME. Point this {form.type} record at a hostname instead of an IP — the authoritative server resolves the target and returns its A/AAAA records on the wire, sidestepping the apex-CNAME prohibition (RFC 1034 §3.6.2). ALIAS is a vendor extension, not an RFC record type, so behavior differs slightly between DNS providers.
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        {isSingleValueType ? (
          <TextField
            label={valueConfig.label}
            placeholder={valueConfig.placeholder}
            value={form.value}
            onChange={(event) => {
              const nextValue = event.target.value
              set('value', nextValue)
              setValueError(validateCurrentValues(effectiveType, nextValue))
            }}
            helperText={valuePreviewAscii.length > 0
              ? `${valueConfig.helperText} Will be saved as: ${valuePreviewAscii.join(', ')} (IDN, RFC 5891).`
              : valueConfig.helperText
            }
            error={!!valueError}
            errorMessage={valueError}
          />
        ) : (
          <TextArea
            label={valueConfig.label}
            placeholder={valueConfig.placeholder}
            value={form.value}
            onChange={(event) => {
              const nextValue = event.target.value
              set('value', nextValue)
              setValueError(validateCurrentValues(effectiveType, nextValue))
            }}
            rows={valueConfig.rows}
            helperText={valuePreviewAscii.length > 0
              ? `${valueConfig.helperText} Will be saved as: ${valuePreviewAscii.join(', ')} (IDN, RFC 5891).`
              : valueConfig.helperText
            }
            error={!!valueError}
            errorMessage={valueError}
          />
        )}

        <div>
          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide block mb-1.5">
            TTL (Seconds)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={form.ttl}
              onChange={(event) => {
                const value = event.target.value
                set('ttl', value)
                setTtlError(validateTtl(value))
              }}
              className={`w-24 bg-surface-container-lowest border ${
                ttlError ? 'border-error ring-1 ring-error/20' : 'border-outline-variant/40'
              } focus:border-primary focus:ring-2 focus:ring-primary/15 h-9 px-3 text-sm rounded outline-none transition-all`}
            />
            <div className="flex gap-1">
              {TTL_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    set('ttl', String(preset.value))
                    setTtlError('')
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                    String(preset.value) === form.ttl
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {ttlError && <p className="text-xs text-error mt-1.5">{ttlError}</p>}
          {existingRrset ? (
            <p className="text-xs text-on-surface-variant mt-1.5 inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <span className="material-symbols-outlined text-[13px] text-primary align-middle">link</span>
              Joining the
              <span className="font-semibold text-on-surface">{effectiveType}</span>
              RRset at
              <span className="font-semibold text-on-surface">{existingRrset.name}</span>
              — current TTL
              <button
                type="button"
                onClick={() => {
                  set('ttl', String(existingRrset.ttl))
                  setTtlError('')
                }}
                className="font-semibold text-primary underline-offset-2 hover:underline"
                title={`Set TTL to ${existingRrset.ttl} to match the existing RRset`}
              >
                {existingRrset.ttl}
              </button>
              . Your TTL replaces it.
              <span className="group relative inline-flex ml-0.5 align-middle">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-on-surface-variant cursor-help">
                  <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
                </svg>
                <span className="pointer-events-none absolute right-0 bottom-full mb-1.5 z-50 hidden w-72 rounded-md bg-surface-container-high px-3 py-2 text-[11px] leading-relaxed text-on-surface shadow-lg ring-1 ring-outline-variant/30 group-hover:block">
                  RFC 2181 §5.2 mandates a single TTL per RRset (same owner + type + class). Resolvers that see mixed TTLs are required to coerce them anyway.
                </span>
              </span>
            </p>
          ) : (
            <p className="text-xs text-on-surface-variant mt-1.5">
              Time in seconds that resolvers should cache this record.
            </p>
          )}
        </div>
      </form>
    </Modal>
  )
}
