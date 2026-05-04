import { useEffect, useState } from 'react'
import {
  Modal, TextField, TextArea, Select, Button, Alert,
} from '../Common'
import { useModal } from '../../hooks/useModal'
import {
  addRecord, parseRecordValues, updateRecord, isInternalSystemZone,
} from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

const RECORD_TYPES = [
  { value: 'A', label: 'A - IPv4 address' },
  { value: 'AAAA', label: 'AAAA - IPv6 address' },
  { value: 'CNAME', label: 'CNAME - Canonical name' },
  { value: 'NS', label: 'NS - Name server' },
  { value: 'TXT', label: 'TXT - Text record' },
]

const TTL_PRESETS = [
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '1h', value: 3600 },
  { label: '6h', value: 21600 },
  { label: '1d', value: 86400 },
]

const DOMAIN_PATTERN = /^(?=.{1,253}\.?$)(?!-)(?:[a-zA-Z0-9_*-]{1,63}(?<!-)\.)*[a-zA-Z0-9_*-]{1,63}\.?$/
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
      return isDomainLike(trimmed) ? '' : 'CNAME records must be valid hostnames.'
    case 'NS':
      return isDomainLike(trimmed) ? '' : 'NS records must be valid nameserver hostnames.'
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

function validateTtl(value) {
  const ttl = Number(value)

  if (!Number.isInteger(ttl) || ttl <= 0) {
    return 'TTL must be a positive whole number.'
  }

  return ''
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

function validateRecordPlacement({ name, type, records = [], currentRecord }) {
  const normalizedName = normalizeRecordNameKey(name)

  if (type === 'CNAME' && normalizedName === '@') {
    return 'CNAME records cannot be created at the zone apex.'
  }

  const siblingRecords = records.filter((record) => {
    if (currentRecord && record.id === currentRecord.id) {
      return false
    }

    return normalizeRecordNameKey(record.name) === normalizedName
  })

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
        placeholder: 'e.g. origin.example.net.',
        helperText: 'Enter the hostname this record should point to. CNAME is not allowed at the apex.',
        rows: 3,
      }
    case 'NS':
      return {
        label: 'Nameserver Hostname',
        placeholder: 'e.g. ns1.example.net.',
        helperText: 'Enter one nameserver hostname per line or separate multiple values with commas.',
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

  const validateCurrentValues = (type, rawValue) => {
    const values = parseValuesByType(type, rawValue)
    if (values.length === 0) return ''
    return values.map((value) => validateRecordValue(type, value)).find(Boolean) || ''
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

      const values = parseValuesByType(form.type, form.value)

      if (values.length === 0) {
        throw new Error('Please provide at least one record value.')
      }

      const nextNameError = validateRecordPlacement({
        name: form.name,
        type: form.type,
        records: modal.data?.records || [],
        currentRecord: modal.data?.record,
      })
      const nextTtlError = validateTtl(form.ttl)
      const nextValueError = values.map((value) => validateRecordValue(form.type, value)).find(Boolean) || ''

      setNameError(nextNameError)
      setTtlError(nextTtlError)
      setValueError(nextValueError)

      if (nextNameError || nextTtlError || nextValueError) {
        throw new Error(nextNameError || nextTtlError || nextValueError)
      }

      const payload = {
        zone: modal.data?.zone,
        subdomain: isEdit ? (modal.data?.record?.name || form.name) : form.name,
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
  const title = isEdit
    ? `Edit ${modal.data.record.type} Record: ${modal.data.record.name}`
    : 'Create DNS Record'

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
                setNameError(validateRecordPlacement({
                  name: nextName,
                  type: form.type,
                  records: modal.data?.records || [],
                  currentRecord: modal.data?.record,
                }))
              }}
              disabled={isEdit}
              error={!!nameError}
              errorMessage={nameError}
            />
            <Select
              label="Record Type"
              options={RECORD_TYPES}
              value={form.type}
              onChange={(event) => {
                const nextType = event.target.value
                set('type', nextType)
                setNameError(validateRecordPlacement({
                  name: form.name,
                  type: nextType,
                  records: modal.data?.records || [],
                  currentRecord: modal.data?.record,
                }))
                setValueError(validateCurrentValues(nextType, form.value))
              }}
              disabled={isEdit}
            />
          </div>
        </div>

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
          helperText={valueConfig.helperText}
          error={!!valueError}
          errorMessage={valueError}
        />

        <div>
          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide block mb-1.5">
            TTL (Seconds)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={form.ttl}
              onChange={(event) => {
                set('ttl', event.target.value)
                setTtlError('')
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
                  onClick={() => set('ttl', String(preset.value))}
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
