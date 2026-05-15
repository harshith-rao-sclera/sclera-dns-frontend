import { useEffect, useState } from 'react'
import {
  Alert, Button, Modal, TextField,
} from '../Common'
import { useModal } from '../../hooks/useModal'
import { updateSOA, validateTtl } from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

const SOA_BOUNDS = {
  refresh: { min: 1200, max: 43200, label: '1200 – 43200 sec (20 min – 12 h)' },
  retry: { min: 120, max: 7200, label: '120 – 7200 sec (2 min – 2 h)' },
  expire: { min: 1209600, max: 2419200, label: '1209600 – 2419200 sec (14 d – 28 d)' },
  minimum: { min: 60, max: 86400, label: '60 – 86400 sec (1 min – 1 d)' },
}

const HOSTNAME_PATTERN = /^(?=.{1,253}\.?$)(?!-)(?:[a-zA-Z0-9_-]{1,63}(?<!-)\.)+[a-zA-Z0-9_-]{1,63}\.?$/

function parseSoaContent(content = '') {
  const parts = String(content).trim().split(/\s+/)
  if (parts.length < 7) return null
  const [mname, rname, serial, refresh, retry, expire, minimum] = parts
  return {
    mname: mname.replace(/\.$/, ''),
    rname: rname.replace(/\.$/, ''),
    serial,
    refresh,
    retry,
    expire,
    minimum,
  }
}

function validateBoundedInt(value, { min, max }, label) {
  if (value === '' || value === null || value === undefined) {
    return `${label} is required.`
  }
  const n = Number(value)
  if (!Number.isInteger(n)) return `${label} must be a whole number.`
  if (n < min) return `${label} must be ≥ ${min}.`
  if (n > max) return `${label} must be ≤ ${max}.`
  return ''
}

function validateHostname(value, label) {
  if (!value || !value.trim()) return `${label} is required.`
  if (!HOSTNAME_PATTERN.test(value.trim())) {
    return `${label} must be a valid hostname (multiple labels, letters/digits/hyphens, trailing dot optional).`
  }
  return ''
}

export function EditSoaModal() {
  const formId = 'edit-soa-form'
  const modal = useModal('editSoa')
  const { showError, showSuccess } = useFeedback()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    mname: '',
    rname: '',
    refresh: '10800',
    retry: '3600',
    expire: '1209600',
    minimum: '3600',
    ttl: '3600',
  })
  const [fieldErrors, setFieldErrors] = useState({})

  const zoneName = modal.data?.zone || ''
  const record = modal.data?.record

  useEffect(() => {
    if (!modal.isOpen) return
    const parsed = parseSoaContent(record?.values?.[0])
    setForm({
      mname: parsed?.mname || '',
      rname: parsed?.rname || '',
      refresh: parsed?.refresh || '10800',
      retry: parsed?.retry || '3600',
      expire: parsed?.expire || '1209600',
      minimum: parsed?.minimum || '3600',
      ttl: String(record?.ttl ?? 3600),
    })
    setFieldErrors({})
    setError('')
  }, [modal.isOpen, record])

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  const validate = () => {
    const errors = {}
    errors.mname = validateHostname(form.mname, 'mname')
    if (!form.rname || !form.rname.trim()) {
      errors.rname = 'rname is required.'
    } else if (form.rname.includes('@')) {
      errors.rname = 'rname must use a dot for "@" (e.g. hostmaster.example.com).'
    } else if (!HOSTNAME_PATTERN.test(form.rname.trim())) {
      errors.rname = 'rname must be a valid dot-encoded hostname.'
    }
    errors.refresh = validateBoundedInt(form.refresh, SOA_BOUNDS.refresh, 'refresh')
    errors.retry = validateBoundedInt(form.retry, SOA_BOUNDS.retry, 'retry')
    errors.expire = validateBoundedInt(form.expire, SOA_BOUNDS.expire, 'expire')
    errors.minimum = validateBoundedInt(form.minimum, SOA_BOUNDS.minimum, 'minimum')

    if (!errors.refresh && !errors.retry) {
      if (Number(form.retry) >= Number(form.refresh)) {
        errors.retry = 'retry must be strictly less than refresh (RFC 1912 §2.2).'
      }
    }

    errors.ttl = validateTtl(form.ttl)

    return Object.fromEntries(Object.entries(errors).filter(([, v]) => v))
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    const errs = validate()
    setFieldErrors(errs)

    if (Object.keys(errs).length > 0) {
      const firstError = Object.values(errs)[0]
      setError(firstError)
      setLoading(false)
      return
    }

    try {
      const result = await updateSOA({
        zone: zoneName,
        mname: form.mname,
        rname: form.rname,
        refresh: form.refresh,
        retry: form.retry,
        expire: form.expire,
        minimum: form.minimum,
        ttl: form.ttl,
      })
      const message = typeof result === 'string' ? result : 'SOA updated successfully.'
      showSuccess(message, 'SOA updated')
      await modal.data?.onSuccess?.()
      modal.close()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to update SOA.'
      setError(message)
      showError(message, 'SOA update failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title={`Edit SOA: ${zoneName}`}
      subtitle="Start of Authority — zone-level metadata and refresh timers."
      size="xl"
      footer={(
        <>
          <button
            type="button"
            onClick={modal.close}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <Button type="submit" form={formId} disabled={loading}>
            {loading ? 'Saving…' : 'Save SOA'}
          </Button>
        </>
      )}
    >
      <form
        id={formId}
        className="space-y-7"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {error && <Alert title="Unable to save SOA">{error}</Alert>}

        <div>
          <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Authority
          </h4>
          <div className="space-y-5">
            <TextField
              label="MNAME — Primary nameserver"
              placeholder="ns1.example.com"
              value={form.mname}
              onChange={(event) => set('mname', event.target.value)}
              error={!!fieldErrors.mname}
              errorMessage={fieldErrors.mname}
              helperText="The authoritative primary nameserver for this zone."
            />
            <TextField
              label='RNAME — Admin email (dot-encoded)'
              placeholder="hostmaster.example.com"
              value={form.rname}
              onChange={(event) => set('rname', event.target.value)}
              error={!!fieldErrors.rname}
              errorMessage={fieldErrors.rname}
              helperText='Use a dot in place of "@" — "hostmaster.example.com" means hostmaster@example.com.'
            />
          </div>
        </div>

        <div>
          <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Timers (RFC 1912 §2.2 / RFC 2308)
          </h4>
          <div className="space-y-5">
            <TextField
              type="number"
              label="REFRESH (seconds)"
              placeholder="10800"
              value={form.refresh}
              onChange={(event) => set('refresh', event.target.value)}
              error={!!fieldErrors.refresh}
              errorMessage={fieldErrors.refresh}
              helperText={`How often secondaries should re-poll the primary. Valid range: ${SOA_BOUNDS.refresh.label}.`}
            />
            <TextField
              type="number"
              label="RETRY (seconds)"
              placeholder="3600"
              value={form.retry}
              onChange={(event) => set('retry', event.target.value)}
              error={!!fieldErrors.retry}
              errorMessage={fieldErrors.retry}
              helperText={`How long to wait before retrying after a failed refresh. Valid range: ${SOA_BOUNDS.retry.label}. Must be strictly less than REFRESH.`}
            />
            <TextField
              type="number"
              label="EXPIRE (seconds)"
              placeholder="1209600"
              value={form.expire}
              onChange={(event) => set('expire', event.target.value)}
              error={!!fieldErrors.expire}
              errorMessage={fieldErrors.expire}
              helperText={`After this long without reaching the primary, secondaries stop serving the zone. Valid range: ${SOA_BOUNDS.expire.label}.`}
            />
            <TextField
              type="number"
              label="MINIMUM — negative-cache TTL (seconds)"
              placeholder="3600"
              value={form.minimum}
              onChange={(event) => set('minimum', event.target.value)}
              error={!!fieldErrors.minimum}
              errorMessage={fieldErrors.minimum}
              helperText={`TTL for negative responses (NXDOMAIN / no-data) per RFC 2308. Valid range: ${SOA_BOUNDS.minimum.label}.`}
            />
          </div>
        </div>

        <div>
          <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Record TTL
          </h4>
          <TextField
            type="number"
            label="TTL (seconds)"
            placeholder="3600"
            value={form.ttl}
            onChange={(event) => set('ttl', event.target.value)}
            error={!!fieldErrors.ttl}
            errorMessage={fieldErrors.ttl}
            helperText="How long resolvers may cache the SOA record itself. 0 = do not cache (RFC 2181 §8)."
          />
        </div>
      </form>
    </Modal>
  )
}
