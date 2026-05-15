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

export { API_BASE_URL, client as scleraApiClient }
