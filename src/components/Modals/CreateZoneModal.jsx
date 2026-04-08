import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, TextField, TextArea, Alert } from '../Common'
import { useModal } from '../../hooks/useModal'
import { createZone, isInternalSystemZone, normalizeZoneName, parseRecordValues } from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

const DOMAIN_PATTERN = /^(?=.{1,253}\.?$)(?!-)(?:[a-zA-Z0-9-]{1,63}(?<!-)\.)+[a-zA-Z]{2,63}\.?$/
const IPV4_SEGMENT = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV4_PATTERN = new RegExp(`^${IPV4_SEGMENT}(\\.${IPV4_SEGMENT}){3}$`)
const IPV6_PATTERN = /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,7}:|:((:[0-9A-Fa-f]{1,4}){1,7}|:)|([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,5}(:[0-9A-Fa-f]{1,4}){1,2}|([0-9A-Fa-f]{1,4}:){1,4}(:[0-9A-Fa-f]{1,4}){1,3}|([0-9A-Fa-f]{1,3}:){1,3}(:[0-9A-Fa-f]{1,4}){1,4}|([0-9A-Fa-f]{1,2}:){1,2}(:[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:((:[0-9A-Fa-f]{1,4}){1,6}))$/

function createNameserverRow() {
  return { hostname: '', ips: '' }
}

function isValidIpAddress(value) {
  const trimmed = value.trim()
  return IPV4_PATTERN.test(trimmed) || IPV6_PATTERN.test(trimmed)
}

function isInBailiwick(hostname, zone) {
  const normalizedHostname = normalizeZoneName(hostname).toLowerCase()
  const normalizedZone = normalizeZoneName(zone).toLowerCase()

  if (!normalizedHostname || !normalizedZone) return false

  return normalizedHostname === normalizedZone || normalizedHostname.endsWith(`.${normalizedZone}`)
}

function validateNameserverRow(row, zone) {
  const hostname = row.hostname.trim()

  if (!hostname) {
    return { hostname: 'Nameserver hostname is required.', ips: '' }
  }

  if (!DOMAIN_PATTERN.test(hostname)) {
    return { hostname: 'Enter a valid nameserver hostname.', ips: '' }
  }

  if (!isInBailiwick(hostname, zone)) {
    return { hostname: '', ips: '' }
  }

  const ips = parseRecordValues(row.ips)
  if (ips.length === 0) {
    return {
      hostname: '',
      ips: 'In-bailiwick nameservers need at least one glue IP address.',
    }
  }

  const invalidIp = ips.find((ip) => !isValidIpAddress(ip))
  if (invalidIp) {
    return {
      hostname: '',
      ips: `IP address "${invalidIp}" is not a valid IPv4 or IPv6 address.`,
    }
  }

  return { hostname: '', ips: '' }
}

export function CreateZoneModal() {
  const formId = 'create-zone-form'
  const modal = useModal('createZone')
  const { showError, showSuccess } = useFeedback()
  const [zone, setZone] = useState('')
  const [nameservers, setNameservers] = useState([createNameserverRow()])
  const [error, setError] = useState('')
  const [nameserverErrors, setNameserverErrors] = useState([createNameserverRow()])
  const [loading, setLoading] = useState(false)

  const hasStructuredNameservers = useMemo(
    () => nameservers.some((row) => row.hostname.trim() || row.ips.trim()),
    [nameservers],
  )

  useEffect(() => {
    if (modal.isOpen) {
      setZone(modal.data?.zone ?? '')
      setNameservers([createNameserverRow()])
      setError('')
      setNameserverErrors([createNameserverRow()])
    }
  }, [modal.data, modal.isOpen])

  const updateNameserver = (index, key, value) => {
    setNameservers((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    )
    setNameserverErrors((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: '' } : row)),
    )
  }

  const addNameserver = () => {
    setNameservers((current) => [...current, createNameserverRow()])
    setNameserverErrors((current) => [...current, createNameserverRow()])
  }

  const removeNameserver = (index) => {
    setNameservers((current) => (current.length === 1 ? current : current.filter((_, rowIndex) => rowIndex !== index)))
    setNameserverErrors((current) => (current.length === 1 ? current : current.filter((_, rowIndex) => rowIndex !== index)))
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      if (isInternalSystemZone(zone)) {
        throw new Error('This zone name is reserved for internal system use and cannot be managed from the frontend.')
      }

      const activeNameservers = nameservers.filter((row) => row.hostname.trim() || row.ips.trim())
      if (activeNameservers.length === 0) {
        throw new Error('Provide at least one nameserver.')
      }

      const nextNameserverErrors = activeNameservers.map((row) => validateNameserverRow(row, zone))
      setNameserverErrors([
        ...nextNameserverErrors,
        ...Array.from({ length: Math.max(0, nameservers.length - nextNameserverErrors.length) }, createNameserverRow),
      ])

      const firstNameserverError = nextNameserverErrors
        .flatMap((row) => [row.hostname, row.ips])
        .find(Boolean)

      if (firstNameserverError) {
        throw new Error(firstNameserverError)
      }

      const parsedNameservers = activeNameservers.map((row) => {
        const host = row.hostname.trim()

        if (!isInBailiwick(host, zone)) {
          return { host }
        }

        return {
          host,
          ips: parseRecordValues(row.ips),
        }
      })

      const message = await createZone(zone, parsedNameservers)
      showSuccess(typeof message === 'string' ? message : 'Zone created successfully', 'Zone created')
      await modal.data?.onSuccess?.()
      modal.close()
      setZone('')
      setNameservers([createNameserverRow()])
      setNameserverErrors([createNameserverRow()])
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to create zone.'
      setError(message)
      showError(message, 'Create zone failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title="Create Hosted Zone"
      subtitle="Configure a new DNS container for your domain records."
      size="xxl"
      footer={
        <>
          <Button type="button" onClick={modal.close} variant="ghost" className="px-6">
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={loading || !zone.trim() || !hasStructuredNameservers}
            className="min-w-[144px] rounded-xl shadow-[0_10px_24px_rgba(0,85,204,0.28)]"
          >
            {loading ? 'Creating...' : 'Create Zone'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-8"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {error && (
          <Alert title="Unable to create zone">
            {error}
          </Alert>
        )}

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[18px]">domain</span>
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-on-surface">Zone Basics</h3>
            </div>
          </div>

          <div className="max-w-[420px] space-y-2">
            <TextField
              label="Domain Name"
              placeholder="example.com"
              value={zone}
              onChange={(event) => {
                setZone(event.target.value)
                setNameserverErrors((current) => current.map(() => createNameserverRow()))
              }}
            />
            <p className="text-xs text-on-surface-variant">
              Specify the apex domain you wish to manage.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[18px]">dns</span>
                </div>
                <h3 className="text-base font-semibold tracking-tight text-on-surface">Nameserver Configuration</h3>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="add"
              onClick={addNameserver}
              className="rounded-xl text-primary hover:bg-primary/8 hover:text-primary"
            >
              Add Nameserver
            </Button>
          </div>

          <div className="space-y-4">
            {nameservers.map((row, index) => {
              const rowIsInBailiwick = isInBailiwick(row.hostname, zone)
              const rowErrors = nameserverErrors[index] || createNameserverRow()

              return (
                <div
                  key={`nameserver-${index}`}
                  className={`rounded-2xl border p-5 transition-all ${
                    rowIsInBailiwick
                      ? 'border-primary/28 bg-primary/[0.03] shadow-[inset_0_0_0_1px_rgba(0,85,204,0.08)]'
                      : 'border-outline-variant/18 bg-surface-container-low/24'
                  }`}
                >
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_40px] md:items-start">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-[0.02em] text-on-surface-variant">
                        Nameserver Hostname
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="ns1.example.com"
                          value={row.hostname}
                          onChange={(event) => updateNameserver(index, 'hostname', event.target.value)}
                          className={`h-10 w-full rounded-xl border bg-surface-container-lowest text-sm outline-none transition-all placeholder:text-outline ${
                            rowErrors.hostname
                              ? 'border-error ring-1 ring-error/20'
                              : 'border-outline-variant/35 focus:border-primary focus:ring-2 focus:ring-primary/12'
                          } ${row.hostname.trim() && rowIsInBailiwick ? 'pl-3 pr-28' : 'px-3'}`}
                        />
                        {row.hostname.trim() && rowIsInBailiwick && (
                          <span className="pointer-events-none absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-full border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.04em] text-primary">
                            <span className="material-symbols-outlined text-[9px]">link</span>
                            In-Bailiwick
                          </span>
                        )}
                      </div>
                      {rowErrors.hostname && <p className="text-xs text-error">{rowErrors.hostname}</p>}
                    </div>

                    <div className="space-y-2">
                      {rowIsInBailiwick ? (
                        <>
                          <label className="text-[11px] font-bold uppercase tracking-[0.02em] text-on-surface-variant">
                            Glue IP Address
                          </label>
                          <textarea
                            placeholder="1.2.3.4&#10;2001:db8::10"
                            value={row.ips}
                            onChange={(event) => updateNameserver(index, 'ips', event.target.value)}
                            rows={2}
                            className={`min-h-[72px] w-full rounded-xl border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-all placeholder:text-outline ${
                              rowErrors.ips
                                ? 'border-error ring-1 ring-error/20'
                                : 'border-outline-variant/35 focus:border-primary focus:ring-2 focus:ring-primary/12'
                            }`}
                          />
                          <p className={`text-[11px] ${rowErrors.ips ? 'text-error' : 'text-on-surface-variant'}`}>
                            {rowErrors.ips || `Required because the hostname is within ${normalizeZoneName(zone) || 'this zone'}.`}
                          </p>
                        </>
                      ) : (
                        <div className="flex h-full items-center pt-7">
                          <p className="text-sm italic text-on-surface-variant/80">No glue records required</p>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end md:pt-7">
                      <button
                        type="button"
                        onClick={() => removeNameserver(index)}
                        disabled={nameservers.length === 1}
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-35"
                        title="Remove nameserver"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </form>
    </Modal>
  )
}
