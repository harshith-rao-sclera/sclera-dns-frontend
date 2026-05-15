import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, TextField, Alert } from '../Common'
import { useModal } from '../../hooks/useModal'
import {
  createZone, isInternalSystemZone, validateZoneName, toAsciiDomain, hasNonAscii,
  isIpAddress, secureZone,
} from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

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
  const [nameservers, setNameservers] = useState([])
  const [nsErrors, setNsErrors] = useState([])
  const [enableDnssec, setEnableDnssec] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (modal.isOpen) {
      setZone(modal.data?.zone ?? '')
      setNameservers([])
      setNsErrors([])
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
      const ns = nameservers.map((entry) => validateNameserver(entry, asciiZone))
      setZoneError(z)
      setNsErrors(ns)
      const firstNsError = ns.find(Boolean) || ''
      if (z || firstNsError) {
        throw new Error(z || firstNsError)
      }

      const nameserverPayload = nameservers
        .filter((entry) => entry.host.trim())
        .map((entry) => {
          const host = toAsciiDomain(entry.host.trim())
          const inBailiwick = bailiwickOf(entry.host, asciiZone) === 'in'
          const ips = inBailiwick ? parseIps(entry.ipsRaw) : []
          return ips.length > 0 ? { host, ips } : { host }
        })

      const message = await createZone(zone, nameserverPayload)
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

      await modal.data?.onSuccess?.()
      modal.close()
      setZone('')
      setNameservers([])
      setEnableDnssec(false)
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
      size="lg"
      footer={(
        <>
          <Button type="button" onClick={modal.close} variant="ghost" className="px-6">
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={loading || !zone.trim()}
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
          </div>

          <button
            type="button"
            onClick={() => setEnableDnssec((v) => !v)}
            className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
              enableDnssec
                ? 'border-primary/40 bg-primary/[0.04]'
                : 'border-outline-variant/40 bg-surface-container-lowest/40 hover:bg-surface-container-lowest/70'
            }`}
          >
            <span
              role="switch"
              aria-checked={enableDnssec}
              className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                enableDnssec ? 'bg-primary' : 'bg-outline/40'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  enableDnssec ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface">
                Enable DNSSEC after creation
              </p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                Provisions a KSK + ZSK (ECDSA P-256) immediately after the zone is created. DS records will be
                available on the zone detail page for publication at your registrar.
              </p>
            </div>
          </button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[18px]">dns</span>
              </div>
              <h3 className="text-base font-semibold tracking-tight text-on-surface">Nameserver Configuration</h3>
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

          {nameservers.length === 0 ? (
            <p className="text-xs text-on-surface-variant">
              Optional — leave empty to use server defaults. The bailiwick of each host is detected from the zone name.
            </p>
          ) : (
            <div className="space-y-3">
              {nameservers.length === 1 && (
                <Alert tone="info" title="Consider adding a second nameserver">
                  RFC 1034 §4.2 recommends at least two nameservers per zone for redundancy. You can still create the zone with one — this is just a heads-up.
                </Alert>
              )}
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
                        className="p-2 text-outline hover:text-error transition-colors"
                        title="Remove nameserver"
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
          )}
        </section>
      </form>
    </Modal>
  )
}
