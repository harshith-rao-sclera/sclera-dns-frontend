import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_SCLERA_API_BASE_URL || 'http://ec2-65-2-96-103.ap-south-1.compute.amazonaws.com:7600'
export const INTERNAL_SYSTEM_ZONE = ['sclera', 'internal'].join('.')

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

function parseErrorMessage(error) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data

    if (typeof data === 'string' && data.trim()) {
      return data.trim()
    }

    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message.trim()
    }

    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim()
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return 'Something went wrong while talking to the ScleraDNS API.'
}

// When responseType is 'blob', axios delivers an error body as a Blob rather
// than a string, so the plain-text admin-API error never reaches
// parseErrorMessage. Read it back out before falling through.
async function readBlobErrorMessage(error) {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const text = (await error.response.data.text()).trim()
      if (text) return text
    } catch {
      // fall through to the generic parser
    }
  }
  return parseErrorMessage(error)
}

// Pull the server-suggested name out of a Content-Disposition header,
// preferring the RFC 5987 filename*= form when present.
function parseContentDispositionFilename(header = '') {
  if (typeof header !== 'string') return ''

  const extended = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ''))
    } catch {
      // fall through to the plain form
    }
  }

  const plain = header.match(/filename="?([^";]+)"?/i)
  return plain?.[1]?.trim() || ''
}

// Mirrors the server's scleraDNS-<UTC timestamp>.sqlite name, used only when
// the response carries no Content-Disposition (e.g. a proxy stripped it).
function defaultSnapshotName() {
  return `scleraDNS-${utcStamp()}.sqlite`
}

function utcStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// Fallback name for a records export when Content-Disposition is absent.
function defaultZonesExportName(format, zone) {
  const ext = format === 'xlsx' ? 'xlsx' : 'csv'
  const scope = zone ? `-${normalizeZoneName(zone)}` : ''
  return `scleraDNS-zones${scope}-${utcStamp()}.${ext}`
}

async function request(config) {
  try {
    const response = await client.request(config)
    return response.data
  } catch (error) {
    const apiError = new Error(parseErrorMessage(error))
    apiError.cause = error
    throw apiError
  }
}

export function trimTrailingDot(value = '') {
  return typeof value === 'string' ? value.replace(/\.$/, '') : value
}

export function toAsciiDomain(value = '') {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || trimmed === '@' || trimmed === '*') return trimmed

  // Pure-ASCII inputs don't need IDN normalization. Skipping the URL parser
  // here also avoids its legacy IPv4-shorthand expansion — e.g. a PTR
  // subdomain "5" in a reverse zone would otherwise become "0.0.0.5".
  if (!hasNonAscii(trimmed)) return trimmed.toLowerCase()

  const hadTrailingDot = trimmed.endsWith('.')
  let core = hadTrailingDot ? trimmed.slice(0, -1) : trimmed

  let prefix = ''
  if (core.startsWith('*.')) {
    prefix = '*.'
    core = core.slice(2)
  }

  if (!core) return value

  try {
    const ascii = new URL(`http://${core}`).hostname
    return `${prefix}${ascii}${hadTrailingDot ? '.' : ''}`
  } catch {
    return value
  }
}

export function hasNonAscii(value = '') {
  return typeof value === 'string' && /[^\x00-\x7f]/.test(value)
}

export const MAX_TTL = 2147483647

export function validateTtl(value) {
  if (value === '' || value === null || value === undefined) {
    return 'TTL is required.'
  }
  const ttl = Number(value)
  if (!Number.isInteger(ttl) || ttl < 0) {
    return 'TTL must be a non-negative whole number.'
  }
  if (ttl > MAX_TTL) {
    return `TTL must be at most ${MAX_TTL} seconds (RFC 2181).`
  }
  return ''
}

const ZONE_NAME_PATTERN = /^(?=.{1,253}\.?$)(?!-)(?:[a-zA-Z0-9_-]{1,63}(?<!-)\.)*[a-zA-Z0-9_-]{1,63}\.?$/

export function validateZoneName(value = '') {
  if (!value || !value.trim()) {
    return 'Zone name is required.'
  }
  const ascii = toAsciiDomain(value.trim())
  if (!ZONE_NAME_PATTERN.test(ascii)) {
    return 'Zone name must be a valid domain (letters, digits, hyphens; labels up to 63 chars; no spaces or wildcards).'
  }
  return ''
}

const IPV4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV4_RE = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`)
const IPV6_RE = /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,7}:|:((:[0-9A-Fa-f]{1,4}){1,7}|:)|([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,5}(:[0-9A-Fa-f]{1,4}){1,2}|([0-9A-Fa-f]{1,4}:){1,4}(:[0-9A-Fa-f]{1,4}){1,3}|([0-9A-Fa-f]{1,4}:){1,3}(:[0-9A-Fa-f]{1,4}){1,4}|([0-9A-Fa-f]{1,4}:){1,2}(:[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:((:[0-9A-Fa-f]{1,4}){1,6}))$/

export function isIpAddress(value = '') {
  const trimmed = String(value).trim()
  return IPV4_RE.test(trimmed) || IPV6_RE.test(trimmed)
}

export function normalizeZoneName(value = '') {
  return trimTrailingDot(value).trim()
}

export function getZoneDisplayName(value = '') {
  return trimTrailingDot(value)
}

export function isInternalSystemZone(value = '') {
  return normalizeZoneName(value).toLowerCase() === INTERNAL_SYSTEM_ZONE
}

export function normalizeRecordValue(value = '') {
  return typeof value === 'string' ? value.trim().replace(/\.$/, '') : value
}

export function getSubdomainFromRecordName(recordName = '', zoneName = '') {
  const cleanRecordName = trimTrailingDot(recordName)
  const cleanZoneName = normalizeZoneName(zoneName)

  if (!cleanRecordName || !cleanZoneName || cleanRecordName === cleanZoneName) {
    return '@'
  }

  const suffix = `.${cleanZoneName}`
  return cleanRecordName.endsWith(suffix)
    ? cleanRecordName.slice(0, -suffix.length)
    : cleanRecordName
}

export function normalizeSubdomain(value = '') {
  const trimmed = value.trim()
  return trimmed === '@' ? '' : trimmed
}

export function parseRecordValues(value = '') {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function normalizeRegexPattern(value = '') {
  return typeof value === 'string'
    ? value.trim().replace(/\\\\/g, '\\')
    : value
}

export function normalizeNameserverEntries(values = []) {
  return values
    .map((value) => {
      if (typeof value === 'string') {
        return { host: normalizeZoneName(value) }
      }

      const host = normalizeZoneName(value?.host ?? value?.hostname)
      const ips = Array.isArray(value?.ips)
        ? value.ips.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
        : Array.isArray(value?.ip)
          ? value.ip.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
          : typeof value?.ips === 'string'
            ? [value.ips.trim()].filter(Boolean)
            : typeof value?.ip === 'string'
              ? [value.ip.trim()].filter(Boolean)
              : []

      return ips.length > 0 ? { host, ips } : { host }
    })
    .filter((value) => value.host)
}

export async function getHealth() {
  return request({
    method: 'GET',
    url: '/health',
  })
}

export async function createZone(zone, nameservers = [], nsTtl) {
  const data = {
    zone: normalizeZoneName(zone),
    nameservers: normalizeNameserverEntries(nameservers),
  }
  if (nsTtl !== undefined && nsTtl !== null && String(nsTtl).trim() !== '') {
    const parsed = Number(nsTtl)
    if (Number.isFinite(parsed)) {
      data.ns_ttl = parsed
    }
  }
  return request({
    method: 'POST',
    url: '/createZone',
    data,
  })
}

export async function listZones() {
  const data = await request({
    method: 'GET',
    url: '/listZones',
  })

  return Array.isArray(data) ? data : []
}

export async function listRecords() {
  const data = await request({
    method: 'GET',
    url: '/listRecords',
  })

  return data && typeof data === 'object' ? data : {}
}

export async function getZone(zone) {
  const data = await request({
    method: 'GET',
    url: '/getZone',
    params: { zone: normalizeZoneName(zone) },
  })

  return Array.isArray(data) ? data : []
}

export async function getRecord({ zone, subdomain = '', record_type }) {
  return request({
    method: 'GET',
    url: '/getRecord',
    params: {
      zone: normalizeZoneName(zone),
      subdomain: normalizeSubdomain(subdomain),
      record_type,
    },
  })
}

export async function addRecord({ zone, subdomain = '', record_type, value, ttl }) {
  return request({
    method: 'POST',
    url: '/addRecord',
    data: {
      zone: normalizeZoneName(zone),
      subdomain: normalizeSubdomain(subdomain),
      record_type,
      value: value.trim(),
      ttl: Number(ttl),
    },
  })
}

export async function updateRecord({ zone, subdomain = '', record_type, values, ttl }) {
  return request({
    method: 'PUT',
    url: '/updateRecord',
    data: {
      zone: normalizeZoneName(zone),
      subdomain: normalizeSubdomain(subdomain),
      record_type,
      values,
      ttl: Number(ttl),
    },
  })
}

export async function deleteRecord({ zone, subdomain = '', record_type, value }) {
  return request({
    method: 'POST',
    url: '/deleteRecord',
    data: {
      zone: normalizeZoneName(zone),
      subdomain: normalizeSubdomain(subdomain),
      record_type,
      value,
    },
  })
}

export async function updateSOA({ zone, mname, rname, refresh, retry, expire, minimum, ttl, serial }) {
  const data = {
    zone: normalizeZoneName(zone),
    mname: trimTrailingDot(toAsciiDomain(mname)),
    rname: trimTrailingDot(toAsciiDomain(rname)),
    refresh: Number(refresh),
    retry: Number(retry),
    expire: Number(expire),
    minimum: Number(minimum),
    ttl: Number(ttl),
  }
  if (serial !== undefined && serial !== null && String(serial).trim() !== '') {
    data.serial = Number(serial)
  }
  return request({
    method: 'PUT',
    url: '/updateSOA',
    data,
  })
}

export async function deleteAllRecords({ zone, subdomain = '', record_type }) {
  return request({
    method: 'POST',
    url: '/deleteAllRecords',
    data: {
      zone: normalizeZoneName(zone),
      subdomain: normalizeSubdomain(subdomain),
      record_type,
    },
  })
}

export async function deleteZone(zone) {
  return request({
    method: 'POST',
    url: '/deleteZone',
    data: { zone: normalizeZoneName(zone) },
  })
}

export async function addSmartIPRule({
  id = 0,
  name,
  description = '',
  zones,
  pattern,
  ttl,
}) {
  return request({
    method: 'POST',
    url: '/addSmartIPRule',
    data: {
      id: Number(id) || 0,
      name: name.trim(),
      description: description.trim(),
      zones: zones.map(normalizeZoneName),
      pattern: normalizeRegexPattern(pattern),
      ttl: Number(ttl),
    },
  })
}

export async function addZoneToSmartIPRule({ id, name, zone }) {
  const data = {
    zone: normalizeZoneName(zone),
  }

  if (id) {
    data.id = Number(id)
  } else if (name) {
    data.name = name.trim()
  }

  return request({
    method: 'POST',
    url: '/addZoneToSmartIPRule',
    data,
  })
}

export async function removeZoneFromSmartIPRule({ id, name, zone }) {
  const data = {
    zone: normalizeZoneName(zone),
  }

  if (id) {
    data.id = Number(id)
  } else if (name) {
    data.name = name.trim()
  }

  return request({
    method: 'POST',
    url: '/removeZoneFromSmartIPRule',
    data,
  })
}

export async function listSmartIPRules() {
  const data = await request({
    method: 'GET',
    url: '/listSmartIPRules',
  })

  return Array.isArray(data) ? data : []
}

export async function deleteSmartIPRule({ id, name }) {
  const data = {}

  if (id) {
    data.id = Number(id)
  } else if (name) {
    data.name = name.trim()
  }

  return request({
    method: 'POST',
    url: '/deleteSmartIPRule',
    data,
  })
}

export async function setSmartIPRuleActive({ id, name, active }) {
  const data = { active: Boolean(active) }

  if (id) {
    data.id = Number(id)
  } else if (name) {
    data.name = name.trim()
  }

  return request({
    method: 'POST',
    url: '/setSmartIPRuleActive',
    data,
  })
}

export async function secureZone(zone) {
  return request({
    method: 'POST',
    url: '/secureZone',
    data: { zone: normalizeZoneName(zone) },
  })
}

export async function unsecureZone(zone) {
  return request({
    method: 'POST',
    url: '/unsecureZone',
    data: { zone: normalizeZoneName(zone) },
  })
}

export async function getZoneDNSSEC(zone) {
  return request({
    method: 'GET',
    url: '/getZoneDNSSEC',
    params: { zone: normalizeZoneName(zone) },
  })
}

export async function listZonesDNSSEC() {
  return request({
    method: 'GET',
    url: '/listZonesDNSSEC',
  })
}

export async function resolveDns({ name, type }) {
  return request({
    method: 'GET',
    url: '/resolve',
    params: {
      name,
      type,
    },
  })
}

// Streams a consistent SQLite snapshot from GET /exportDB. Returns the raw
// file Blob plus the server-suggested filename so the caller can save it.
export async function exportDatabase() {
  try {
    const response = await client.request({
      method: 'GET',
      url: '/exportDB',
      responseType: 'blob',
    })

    return {
      blob: response.data,
      filename:
        parseContentDispositionFilename(response.headers?.['content-disposition'])
        || defaultSnapshotName(),
    }
  } catch (error) {
    const apiError = new Error(await readBlobErrorMessage(error))
    apiError.cause = error
    throw apiError
  }
}

// Downloads human-readable DNS records from GET /exportZones as CSV or XLSX.
// Pass a `zone` to scope the export to one zone; omit it to export all zones.
// Returns the file Blob plus the server-suggested filename.
export async function exportZones({ format = 'csv', zone } = {}) {
  const params = { format: format === 'xlsx' ? 'xlsx' : 'csv' }
  const scopedZone = zone ? normalizeZoneName(zone) : ''
  if (scopedZone) {
    params.zone = scopedZone
  }

  try {
    const response = await client.request({
      method: 'GET',
      url: '/exportZones',
      params,
      responseType: 'blob',
    })

    return {
      blob: response.data,
      filename:
        parseContentDispositionFilename(response.headers?.['content-disposition'])
        || defaultZonesExportName(params.format, scopedZone),
    }
  } catch (error) {
    const apiError = new Error(await readBlobErrorMessage(error))
    apiError.cause = error
    throw apiError
  }
}

// Infers the import format from a filename when not given explicitly.
export function guessImportFormat(filename = '') {
  return /\.xlsx$/i.test(filename) ? 'xlsx' : 'csv'
}

// Excel's "CSV UTF-8" export prepends a byte-order mark (EF BB BF). Go's
// encoding/csv treats it as part of the first field, which trips
// "bare quote in non-quoted field" on a quoted first column. Drop a leading
// BOM at the byte level (leaving every other byte untouched) so the server
// sees clean CSV. Binary formats never match the BOM signature.
async function stripUtf8Bom(file) {
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer())
  if (head.length === 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
    return new File([file.slice(3)], file.name, { type: file.type || 'text/csv' })
  }
  return file
}

// Bulk-creates zones + records from an uploaded CSV/XLSX via POST /importZones.
// Sends the file as multipart (field "file").
//
// IMPORTANT: the axios client sets a default `Content-Type: application/json`.
// For a FormData body that default must be cleared, otherwise axios sends the
// multipart bytes labelled `application/json` WITH NO boundary — the server
// then can't find the file part, reads the raw body, and parses the multipart
// envelope's boundary line as the CSV header ("missing required column zone").
// Setting Content-Type to undefined makes the browser generate the correct
// `multipart/form-data; boundary=…` header itself.
// Resolves to the server's JSON ImportReport.
export async function importZones({ file, format } = {}) {
  if (!file) {
    throw new Error('Choose a CSV or XLSX file to import.')
  }

  const resolvedFormat = format || guessImportFormat(file.name)
  const payload = resolvedFormat === 'csv' ? await stripUtf8Bom(file) : file

  const formData = new FormData()
  formData.append('file', payload)

  return request({
    method: 'POST',
    url: '/importZones',
    params: { format: resolvedFormat },
    data: formData,
    headers: { 'Content-Type': undefined },
  })
}

export { API_BASE_URL, client as scleraApiClient }
