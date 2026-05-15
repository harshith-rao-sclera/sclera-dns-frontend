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
  { value: 'A', label: 'A - IPv4 address' },
  { value: 'AAAA', label: 'AAAA - IPv6 address' },
  { value: 'CNAME', label: 'CNAME - Canonical name' },
  { value: 'ALIAS', label: 'ALIAS - Apex-safe alias' },
  { value: 'MX', label: 'MX - Mail exchanger' },
  { value: 'NS', label: 'NS - Name server' },
  { value: 'PTR', label: 'PTR - Reverse pointer' },
  { value: 'TXT', label: 'TXT - Text record' },
]

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

function parseValuesByType(type, value) {
  if (type === 'TXT') {
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
    return { name: '', type: 'A', ttl: '300', value: '' }
  }

  return {
    name: record.name || '@',
    type: record.type || 'A',
    ttl: String(record.ttl || 300),
    value: record.values?.join('\n') || record.value || '',
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
    case 'CNAME':
      return {
        label: 'Canonical Target',
        placeholder: 'e.g. origin.example.net',
        helperText: 'Single hostname this record points to. Trailing dot is optional. CNAME is not allowed at the zone apex.',
        rows: 1,
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
    if (type === 'NS' || type === 'MX') {
      return checkTargetsAgainstCnames(punycoded, modal.data?.records || [], modal.data?.zone || '', type)
    }
    return ''
  }

  function extractHostTarget(type, value) {
    if (type === 'MX') {
      const match = String(value).trim().match(/^\d+\s+(\S.*)$/)
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
      // Skip Null MX (RFC 7505): target is "." — not a real hostname to cross-check.
      if (recordType === 'MX' && cleanHost === '') continue
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

      const rawValues = parseValuesByType(form.type, form.value)
      const values = rawValues.map((value) => punycodeIfDomain(form.type, value))

      if (values.length === 0) {
        throw new Error('Please provide at least one record value.')
      }

      if (form.type === 'CNAME' && values.length > 1) {
        throw new Error('CNAME records can only have a single target (RFC 1034 §3.6.2).')
      }

      if (form.type === 'ALIAS' && values.length > 1) {
        throw new Error('ALIAS records can only have a single target.')
      }

      if (form.type === 'MX' && values.length > 1) {
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
        type: form.type,
        zone: modal.data?.zone,
        records: modal.data?.records || [],
        currentRecord: modal.data?.record,
      })
      const nextTtlError = validateTtl(form.ttl)
      const perValueError = values.map((value) => validateRecordValue(form.type, value)).find(Boolean) || ''
      const crossError = (form.type === 'NS' || form.type === 'MX')
        ? checkTargetsAgainstCnames(values, modal.data?.records || [], modal.data?.zone || '', form.type)
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

      if ((form.type === 'CNAME' || form.type === 'ALIAS') && values.length === 1) {
        const target = trimTrailingDot(values[0]).toLowerCase()
        const lowerZone = normalizeZoneName(modal.data?.zone || '').toLowerCase()
        const recordFqdn = !submittedName || submittedName === '@'
          ? lowerZone
          : `${submittedName.toLowerCase()}.${lowerZone}`
        if (target && recordFqdn && target === recordFqdn) {
          throw new Error(`${form.type} target cannot point to itself (self-loop at ${recordFqdn}).`)
        }
      }

      const payload = {
        zone: modal.data?.zone,
        subdomain: submittedName,
        record_type: isEdit ? (modal.data?.record?.type || form.type) : form.type,
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
  const valueConfig = getRecordValueConfig(form.type)
  const isSingleValueType = form.type === 'CNAME' || form.type === 'ALIAS'
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

  const valuePreviewAscii = ['CNAME', 'ALIAS', 'NS', 'MX', 'PTR'].includes(form.type)
    ? parseValuesByType(form.type, form.value)
      .filter(hasNonAscii)
      .map((value) => punycodeIfDomain(form.type, value))
    : []

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
                  type: form.type,
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
                set('type', nextType)
                setNameError(validateRecordName({
                  name: form.name,
                  type: nextType,
                  zone,
                  records: modal.data?.records || [],
                  currentRecord: modal.data?.record,
                }))
                setValueError(validateCurrentValues(nextType, form.value))
              }}
              disabled={isEdit}
            />
          </div>
        </div>

        {isSingleValueType ? (
          <TextField
            label={valueConfig.label}
            placeholder={valueConfig.placeholder}
            value={form.value}
            onChange={(event) => {
              const nextValue = event.target.value
              set('value', nextValue)
              setValueError(validateCurrentValues(form.type, nextValue))
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
              setValueError(validateCurrentValues(form.type, nextValue))
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
          <p className="text-xs text-on-surface-variant mt-1.5">
            Time in seconds that resolvers should cache this record.
          </p>
        </div>
      </form>
    </Modal>
  )
}
