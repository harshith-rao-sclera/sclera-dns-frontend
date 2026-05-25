import { useEffect, useState } from 'react'
import { Alert, Badge, Button, CopyButton, Modal } from '../Common'
import { useModal } from '../../hooks/useModal'
import { setSmartIPRuleActive } from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 border-b border-outline-variant/10 py-3 last:border-b-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </div>
      <div className={mono ? 'break-all font-mono text-sm text-on-surface' : 'text-sm text-on-surface'}>
        {value}
      </div>
    </div>
  )
}

export function SmartRuleDetailsModal() {
  const modal = useModal('ruleDetails')
  const { showError, showSuccess } = useFeedback()
  const rule = modal.data?.rule
  const [error, setError] = useState('')
  const [active, setActive] = useState(true)
  const [togglingActive, setTogglingActive] = useState(false)

  useEffect(() => {
    if (modal.isOpen) {
      setActive(modal.data?.rule?.active ?? true)
      setError('')
    }
  }, [modal.isOpen, modal.data])

  if (!rule) return null

  const handleToggleActive = async () => {
    const next = !active
    setTogglingActive(true)
    setError('')
    setActive(next)

    try {
      await setSmartIPRuleActive({ id: rule.id, name: rule.name, active: next })
      showSuccess(
        next ? `${rule.name} enabled.` : `${rule.name} disabled.`,
        next ? 'Rule enabled' : 'Rule disabled',
      )
      await modal.data?.onSuccess?.()
    } catch (toggleError) {
      setActive(!next)
      const message = toggleError instanceof Error ? toggleError.message : 'Unable to update rule status.'
      setError(message)
      showError(message, 'Status update failed')
    } finally {
      setTogglingActive(false)
    }
  }

  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title={rule.name}
      subtitle={rule.description || 'Inspect linked zones, pattern, and cache duration'}
      size="xl"
      footer={
        <>
          <button
            onClick={modal.close}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
          >
            Close
          </button>
          <Button
            variant="secondary"
            onClick={() => {
              modal.close()
              modal.data?.onAddZones?.()
            }}
          >
            Add Zones
          </Button>
          <Button
            onClick={() => {
              modal.close()
              modal.data?.onEdit?.()
            }}
          >
            Edit Rule
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <Alert title="Unable to update rule">
            {error}
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Badge variant="primary">{rule.linkedZones.length} linked zone{rule.linkedZones.length === 1 ? '' : 's'}</Badge>
          <Badge variant={active ? 'success' : 'secondary'}>{active ? 'Active' : 'Inactive'}</Badge>
        </div>

        <button
          type="button"
          onClick={handleToggleActive}
          disabled={togglingActive}
          className={`flex w-full items-center justify-between gap-4 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
            active
              ? 'border-primary/40 bg-primary/[0.04]'
              : 'border-outline-variant/40 bg-surface-container-lowest'
          }`}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">
              {active ? 'Rule is active' : 'Rule is inactive'}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">
              {active
                ? 'Resolving matching queries. Toggle off to disable without deleting it.'
                : 'Disabled — not resolving any queries. Toggle on to re-enable it.'}
            </p>
          </div>
          <span
            role="switch"
            aria-checked={active}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              active ? 'bg-primary' : 'bg-outline/40'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                active ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>

        <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-4">
          <DetailRow label="TTL" value={String(rule.ttl)} mono />
          <DetailRow
            label="Regex Pattern"
            mono
            value={(
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-all">{rule.pattern}</span>
                <CopyButton text={rule.pattern} className="shrink-0 self-start whitespace-nowrap" />
              </div>
            )}
          />
        </div>

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Linked Zones
          </div>
          {rule.linkedZones.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {rule.linkedZones.map((zone) => (
                <Badge key={zone} variant="zone">{zone}</Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-on-surface-variant">No zones linked</span>
          )}
        </div>
      </div>
    </Modal>
  )
}
