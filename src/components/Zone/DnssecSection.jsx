import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, ConfirmDialog } from '../Common'
import {
  getZoneDNSSEC, secureZone, unsecureZone, getZoneDisplayName,
} from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

const DS_DIGEST_META = {
  1: { name: 'SHA-1', note: 'Legacy', tone: 'bg-amber-500/10 text-amber-700' },
  2: { name: 'SHA-256', note: 'Recommended', tone: 'bg-emerald-500/10 text-emerald-700' },
  4: { name: 'SHA-384', note: 'Strong alternative', tone: 'bg-sky-500/10 text-sky-700' },
}

const DIGEST_PRIORITY = { 2: 0, 4: 1, 1: 2 }

function parseDsRecord(value) {
  const parts = String(value).trim().split(/\s+/)
  if (parts.length < 4) return null
  const digestType = Number(parts[2])
  return {
    keytag: parts[0],
    algorithm: parts[1],
    digestType: Number.isFinite(digestType) ? digestType : null,
    raw: value,
  }
}

function sortDsRecords(records) {
  return records
    .map((r) => ({ value: r, parsed: parseDsRecord(r) }))
    .sort((a, b) => {
      const pa = DIGEST_PRIORITY[a.parsed?.digestType] ?? 99
      const pb = DIGEST_PRIORITY[b.parsed?.digestType] ?? 99
      return pa - pb
    })
}

function DsRecordRow({ value, parsed, onCopy }) {
  const meta = parsed ? DS_DIGEST_META[parsed.digestType] : null

  return (
    <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {meta ? (
            <>
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.tone}`}>
                {meta.name}
              </span>
              <span className="text-[11px] text-on-surface-variant">{meta.note}</span>
              {parsed?.keytag && (
                <span className="text-[11px] text-on-surface-variant">· keytag {parsed.keytag}</span>
              )}
            </>
          ) : (
            <span className="text-[11px] text-on-surface-variant">Unparsed digest</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onCopy(value)}
          className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
          title="Copy DS record"
        >
          <span className="material-symbols-outlined text-[14px]">content_copy</span>
          Copy
        </button>
      </div>
      <code className="block break-all font-mono text-xs leading-5 text-on-surface">
        {value}
      </code>
    </div>
  )
}

function KeyRow({ entry }) {
  return (
    <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest/60 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {entry.keytype}
        </span>
        <span className="text-xs text-on-surface-variant">
          ID #{entry.id} · {entry.algorithm}
        </span>
        {entry.active && (
          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Active
          </span>
        )}
      </div>
      <code className="block break-all font-mono text-[11px] leading-5 text-on-surface-variant">
        {entry.dnskey}
      </code>
    </div>
  )
}

export function DnssecSection({ zoneName }) {
  const { showError, showSuccess } = useFeedback()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmEnable, setConfirmEnable] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [expanded, setExpanded] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getZoneDNSSEC(zoneName)
      setStatus(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to load DNSSEC status.'
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }, [zoneName])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleEnable = async () => {
    setActionLoading(true)
    try {
      await secureZone(zoneName)
      showSuccess('DNSSEC enabled. Publish the DS records at your registrar to complete the chain of trust.', 'DNSSEC enabled')
      setConfirmEnable(false)
      await refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to enable DNSSEC.'
      showError(message, 'Failed to enable DNSSEC')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDisable = async () => {
    setActionLoading(true)
    try {
      await unsecureZone(zoneName)
      showSuccess('DNSSEC disabled. The zone is now unsigned.', 'DNSSEC disabled')
      setConfirmDisable(false)
      await refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to disable DNSSEC.'
      showError(message, 'Failed to disable DNSSEC')
    } finally {
      setActionLoading(false)
    }
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      showSuccess('Copied to clipboard.')
    } catch {
      showError('Unable to copy to clipboard.')
    }
  }

  const secured = !!status?.secured
  const keys = (status?.keys || [])
    .slice()
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  const rawDsRecords = keys.flatMap((k) => (Array.isArray(k.ds) ? k.ds : []))
  const dsRecords = sortDsRecords(rawDsRecords)
  const verifyUrl = `https://dnssec-analyzer.verisignlabs.com/${getZoneDisplayName(zoneName).replace(/\.$/, '')}`

  return (
    <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-container-lowest/40"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[18px]">lock</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-on-surface">DNSSEC</h3>
            <p className="text-xs text-on-surface-variant mt-0.5 truncate">
              RFC 4033-4035 chain of trust for this zone.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!loading && !loadError && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                secured
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-outline/10 text-on-surface-variant'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${secured ? 'bg-emerald-500' : 'bg-outline'}`} />
              {secured ? 'Active' : 'Disabled'}
            </span>
          )}
          <span
            className={`material-symbols-outlined text-[20px] text-on-surface-variant transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          >
            expand_more
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-1 border-t border-outline-variant/20">
          {loading && (
            <p className="text-sm text-on-surface-variant mt-4">Loading DNSSEC status…</p>
          )}

          {loadError && !loading && (
            <div className="mt-4">
              <Alert title="DNSSEC status unavailable">{loadError}</Alert>
            </div>
          )}

          {!loading && !loadError && !secured && (
            <div className="space-y-3 mt-4">
              <p className="text-sm text-on-surface-variant leading-6">
                DNSSEC is not enabled for this zone. Enabling will provision a KSK and ZSK (ECDSA P-256)
                and produce DS records you must publish at your registrar.
              </p>
              <Button icon="lock" onClick={() => setConfirmEnable(true)}>
                Enable DNSSEC
              </Button>
            </div>
          )}

          {!loading && !loadError && secured && (
            <div className="space-y-5 mt-4">
              <Alert tone="info" title="Publish DS records at your registrar">
                DNSSEC is active. To complete the chain of trust, publish these DS records at your registrar.
                Until you do, this domain is locally signed but not publicly validated.
              </Alert>

              {dsRecords.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">
                    DS Records ({dsRecords.length}) — publish one at your registrar
                  </h4>
                  <div className="space-y-2">
                    {dsRecords.map(({ value, parsed }, index) => (
                      <DsRecordRow
                        key={`${value}-${index}`}
                        value={value}
                        parsed={parsed}
                        onCopy={copyToClipboard}
                      />
                    ))}
                  </div>
                </div>
              )}

              {keys.length > 0 && (
                <details className="group rounded-lg border border-outline-variant/20 bg-surface-container-lowest/40">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:text-on-surface">
                    <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-90">
                      chevron_right
                    </span>
                    Technical details · {keys.length} DNSKEY{keys.length === 1 ? '' : 's'}
                  </summary>
                  <div className="space-y-2 border-t border-outline-variant/20 px-3 py-3">
                    {keys.map((entry) => (
                      <KeyRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                </details>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-outline-variant/20">
                <a
                  href={verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Verify chain on Verisign Labs
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
                <Button variant="danger" icon="lock_open" onClick={() => setConfirmDisable(true)}>
                  Disable DNSSEC
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmEnable}
        onClose={() => (actionLoading ? null : setConfirmEnable(false))}
        onConfirm={handleEnable}
        title={`Enable DNSSEC for ${zoneName}?`}
        confirmText="Enable DNSSEC"
        isLoading={actionLoading}
      >
        <div className="text-left text-sm text-on-surface-variant space-y-2">
          <p>
            This will provision a KSK and ZSK (ECDSA P-256) for <strong className="text-on-surface">{zoneName}</strong>
            {' '}and begin signing responses.
          </p>
          <p>
            After signing, you'll need to publish the returned DS records at your registrar to complete
            the chain of trust (RFC 4033 §3).
          </p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={confirmDisable}
        onClose={() => (actionLoading ? null : setConfirmDisable(false))}
        onConfirm={handleDisable}
        title={`Disable DNSSEC for ${zoneName}?`}
        confirmText="Disable DNSSEC"
        isDangerous
        isLoading={actionLoading}
      >
        <div className="text-left text-sm text-on-surface-variant space-y-2">
          <p>
            <strong className="text-error">Important:</strong> If this zone is publicly delegated and has a DS
            record at its registrar, remove the DS record there <strong>first</strong> and wait for propagation
            before disabling DNSSEC here.
          </p>
          <p>
            Otherwise validators will return <code className="rounded bg-surface-container px-1 py-0.5 text-xs">SERVFAIL</code> for
            the entire domain.
          </p>
        </div>
      </ConfirmDialog>
    </section>
  )
}
