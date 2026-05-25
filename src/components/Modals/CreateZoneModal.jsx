import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, TextField, Alert } from '../Common'
import { useModal } from '../../hooks/useModal'
import {
  createZone, isInternalSystemZone, validateZoneName, toAsciiDomain, hasNonAscii,
  isIpAddress, secureZone, validateTtl,
} from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

const TTL_PRESETS = [
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '1h', value: 3600 },
  { label: '6h', value: 21600 },
  { label: '1d', value: 86400 },
]

function makeNameserver() {
  return { host: '', ipsRaw: '' }
}

function parseIps(raw) {
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function bailiwickOf(host, zoneAscii) {
  const trimmedHost = host.trim()
  if (!trimmedHost || !zoneAscii) return 'unknown'
  const lowerHost = toAsciiDomain(trimmedHost).replace(/\.$/, '').toLowerCase()
  const lowerZone = zoneAscii.replace(/\.$/, '').toLowerCase()
  if (!lowerHost) return 'unknown'
  if (lowerHost === lowerZone || lowerHost.endsWith(`.${lowerZone}`)) return 'in'
  return 'out'
}

function validateNameserver(ns, zoneAscii) {
  const host = ns.host.trim()
  if (!host) return 'Nameserver host is required.'

  const asciiHost = toAsciiDomain(host)
  const hostError = validateZoneName(asciiHost)
  if (hostError) return `Nameserver host: ${hostError.replace(/^Zone name/, 'Value')}`

  // A nameserver must be a fully-qualified host with at least two labels
  // (e.g. ns1.example.com). A single-label name like "c" passes the label
  // rules but is useless as a nameserver — the backend rejects it too.
  if (!asciiHost.replace(/\.$/, '').includes('.')) {
    return `Nameserver host "${host}" must be a fully-qualified domain name with at least two labels (e.g. ns1.example.com).`
  }

  const bailiwick = bailiwickOf(host, zoneAscii)

  if (bailiwick === 'in') {
    const ips = parseIps(ns.ipsRaw)
    const invalidIp = ips.find((ip) => !isIpAddress(ip))
    if (invalidIp) return `"${invalidIp}" is not a valid IPv4 or IPv6 address.`
    if (ips.length === 0) {
      return `In-bailiwick nameserver "${host}" requires at least one glue IP address.`
    }
  }

  return ''
}

function InBailiwickBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
      <span className="material-symbols-outlined text-[11px]">link</span>
      In-Bailiwick
    </span>
  )
}

export function CreateZoneModal() {
  const formId = 'create-zone-form'
  const modal = useModal('createZone')
  const { showError, showSuccess } = useFeedback()
  const [zone, setZone] = useState('')
  const [zoneError, setZoneError] = useState('')
  const [nameservers, setNameservers] = useState([makeNameserver()])
  const [nsErrors, setNsErrors] = useState([])
  const [nsTtl, setNsTtl] = useState('3600')
  const [nsTtlError, setNsTtlError] = useState('')
  const [enableDnssec, setEnableDnssec] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (modal.isOpen) {
      setZone(modal.data?.zone ?? '')
      setNameservers([makeNameserver()])
      setNsErrors([])
      setNsTtl('3600')
      setNsTtlError('')
      setEnableDnssec(false)
      setZoneError('')
      setError('')
    }
  }, [modal.data, modal.isOpen])

  const asciiZone = useMemo(
    () => (zone.trim() ? toAsciiDomain(zone.trim()).replace(/\.$/, '') : ''),
    [zone],
  )
  const showZonePunyPreview = hasNonAscii(zone) && asciiZone && asciiZone !== zone.trim().replace(/\.$/, '')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      if (isInternalSystemZone(zone)) {
        throw new Error('This zone name is reserved for internal system use.')
      }
      const z = validateZoneName(zone)
      const filledNameservers = nameservers.filter((entry) => entry.host.trim())
      if (filledNameservers.length === 0) {
        throw new Error('At least one nameserver is required.')
      }
      const ns = nameservers.map((entry) => validateNameserver(entry, asciiZone))

      const seenHosts = new Map()
      nameservers.forEach((entry, index) => {
        if (ns[index]) return
        const key = toAsciiDomain(entry.host.trim()).replace(/\.$/, '').toLowerCase()
        if (!key) return
        if (seenHosts.has(key)) {
          ns[index] = `Duplicate nameserver host — "${entry.host.trim()}" is already listed above.`
        } else {
          seenHosts.set(key, index)
        }
      })

      const ttlErr = validateTtl(nsTtl)
      setZoneError(z)
      setNsErrors(ns)
      setNsTtlError(ttlErr)
      const firstNsError = ns.find(Boolean) || ''
      if (z || firstNsError || ttlErr) {
        throw new Error(z || firstNsError || ttlErr)
      }

      const nameserverPayload = filledNameservers.map((entry) => {
        const host = toAsciiDomain(entry.host.trim())
        const inBailiwick = bailiwickOf(entry.host, asciiZone) === 'in'
        const ips = inBailiwick ? parseIps(entry.ipsRaw) : []
        return ips.length > 0 ? { host, ips } : { host }
      })

      const message = await createZone(zone, nameserverPayload, nsTtl)
      showSuccess(typeof message === 'string' ? message : 'Zone created successfully', 'Zone created')

      if (enableDnssec) {
        try {
          await secureZone(zone)
          showSuccess('DNSSEC enabled. Publish the DS records (from the zone detail page) at your registrar.', 'DNSSEC enabled')
        } catch (dnssecError) {
          const dnssecMessage = dnssecError instanceof Error
            ? dnssecError.message
            : 'Unable to enable DNSSEC.'
          showError(`Zone created, but DNSSEC could not be enabled: ${dnssecMessage}`, 'DNSSEC step failed')
        }
      }

      modal.close()
      setZone('')
      setNameservers([makeNameserver()])
      setNsTtl('3600')
      setEnableDnssec(false)
      await modal.data?.onSuccess?.(asciiZone)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to create zone.'
      setError(message)
      showError(message, 'Create zone failed')
    } finally {
      setLoading(false)
    }
  }

  const addNs = () => setNameservers((current) => [...current, makeNameserver()])
  const removeNs = (index) => {
    setNameservers((current) => current.filter((_, i) => i !== index))
    setNsErrors((current) => current.filter((_, i) => i !== index))
  }
  const updateNs = (index, key, value) => {
    setNameservers((current) => current.map((ns, i) => (i === index ? { ...ns, [key]: value } : ns)))
  }

  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title="Create Hosted Zone"
      subtitle="Configure a new DNS container for your domain records."
      size="xl"
      footer={(
        <>
          <Button type="button" onClick={modal.close} variant="ghost" className="px-6">
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={loading || !zone.trim() || nameservers.filter((entry) => entry.host.trim()).length === 0}
            className="min-w-[144px]"
          >
            {loading ? 'Creating...' : 'Create Zone'}
          </Button>
        </>
      )}
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
          <Alert title="Unable to create zone">
            {error}
          </Alert>
        )}

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[18px]">domain</span>
            </div>
            <h3 className="text-base font-semibold tracking-tight text-on-surface">Zone Basics</h3>
          </div>

          <div className="space-y-2">
            <TextField
              label="Domain Name"
              placeholder="example.com"
              value={zone}
              onChange={(event) => {
                setZone(event.target.value)
                setZoneError('')
              }}
              error={!!zoneError}
              errorMessage={zoneError}
              helperText={showZonePunyPreview
                ? `Will be saved as "${asciiZone}" (IDN, RFC 5891).`
                : 'Specify the apex domain you wish to manage.'}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[18px]">lock</span>
            </div>
            <h3 className="text-base font-semibold tracking-tight text-on-surface">DNSSEC</h3>
            <span className="group relative inline-flex">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-on-surface-variant cursor-help">
                <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
              </svg>
              <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 hidden w-72 rounded-md bg-surface-container-high px-3 py-2 text-[11px] leading-relaxed text-on-surface shadow-lg ring-1 ring-outline-variant/30 group-hover:block">
                Provisions a KSK + ZSK (ECDSA P-256) immediately after the zone is created. DS records will be available on the zone detail page for publication at your registrar.
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setEnableDnssec((v) => !v)}
            className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${
              enableDnssec
                ? 'border-primary/40 bg-primary/[0.04]'
                : 'border-outline-variant/40 bg-surface-container-lowest/40 hover:bg-surface-container-lowest/70'
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface">
                Enable DNSSEC Signing
              </p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                Add a layer of <span className="text-primary">security</span> by cryptographically signing your DNS records.
              </p>
            </div>
            <span
              role="switch"
              aria-checked={enableDnssec}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                enableDnssec ? 'bg-primary' : 'bg-outline/40'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  enableDnssec ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[18px]">dns</span>
              </div>
              <h3 className="text-base font-semibold tracking-tight text-on-surface">Nameserver Configuration</h3>
              <span className="group relative inline-flex">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-on-surface-variant cursor-help">
                  <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
                </svg>
                <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 hidden w-72 rounded-md bg-surface-container-high px-3 py-2 text-[11px] leading-relaxed text-on-surface shadow-lg ring-1 ring-outline-variant/30 group-hover:block">
                  RFC 1034 §4.2 recommends at least two nameservers per zone for redundancy. You can still create the zone with one — this is just a heads-up.
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={addNs}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add Nameserver
            </button>
          </div>

          <div className="space-y-3">
            {nameservers.map((ns, index) => {
                const bailiwick = bailiwickOf(ns.host, asciiZone)
                const isIn = bailiwick === 'in'
                const isOut = bailiwick === 'out'

                return (
                  <div
                    key={index}
                    className={`rounded-xl border p-4 transition-colors ${
                      isIn
                        ? 'border-primary/40 bg-primary/[0.03]'
                        : 'border-outline-variant/40 bg-surface-container-lowest/60'
                    }`}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5">
                      {/* Row 1: labels */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                          Nameserver Hostname
                        </label>
                        {isIn && <InBailiwickBadge />}
                      </div>
                      <div className="flex items-center">
                        {isIn && (
                          <label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                            Glue IP Address
                          </label>
                        )}
                      </div>
                      <div />

                      {/* Row 2: inputs */}
                      <TextField
                        placeholder="ns1.example.net"
                        value={ns.host}
                        onChange={(event) => updateNs(index, 'host', event.target.value)}
                      />
                      {isIn ? (
                        <TextField
                          placeholder="192.0.2.10, 2001:db8::10"
                          value={ns.ipsRaw}
                          onChange={(event) => updateNs(index, 'ipsRaw', event.target.value)}
                          helperText={asciiZone ? `Required as the hostname is within ${asciiZone}.` : undefined}
                        />
                      ) : (
                        <div className="flex h-9 items-center">
                          <p className={isOut ? 'text-sm italic text-on-surface-variant' : 'text-xs italic text-on-surface-variant'}>
                            {isOut
                              ? 'No glue records required'
                              : zone.trim()
                                ? 'Bailiwick will be detected once you enter a host.'
                                : 'Enter the domain name above to detect bailiwick.'}
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeNs(index)}
                        disabled={nameservers.length === 1}
                        className="p-2 text-outline transition-colors enabled:hover:text-error disabled:opacity-40 disabled:cursor-not-allowed"
                        title={nameservers.length === 1 ? 'At least one nameserver is required' : 'Remove nameserver'}
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>

                    {nsErrors[index] && (
                      <p className="mt-2 text-xs text-error">{nsErrors[index]}</p>
                    )}
                  </div>
                )
              })}
          </div>

          <div className="pt-2">
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide block mb-1.5">
              NS Record TTL (seconds)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={nsTtl}
                onChange={(event) => {
                  const value = event.target.value
                  setNsTtl(value)
                  setNsTtlError(validateTtl(value))
                }}
                className={`w-24 bg-surface-container-lowest border ${
                  nsTtlError ? 'border-error ring-1 ring-error/20' : 'border-outline-variant/40'
                } focus:border-primary focus:ring-2 focus:ring-primary/15 h-9 px-3 text-sm rounded outline-none transition-all`}
              />
              <div className="flex flex-wrap gap-1">
                {TTL_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setNsTtl(String(preset.value))
                      setNsTtlError('')
                    }}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                      String(preset.value) === nsTtl
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            {nsTtlError && <p className="text-xs text-error mt-1.5">{nsTtlError}</p>}
            <p className="text-xs text-on-surface-variant mt-1.5">
              Applied to both the apex NS RRset and any glue A/AAAA records.
            </p>
          </div>
        </section>
      </form>
    </Modal>
  )
}
