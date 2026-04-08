import { useState } from 'react'
import { Alert, Badge, Button, Modal } from '../Common'
import { useModal } from '../../hooks/useModal'
import { removeZoneFromSmartIPRule } from '../../api/scleraApi'
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
  const [removingZone, setRemovingZone] = useState('')
  const [error, setError] = useState('')

  if (!rule) return null

  const handleRemoveZone = async (zone) => {
    setRemovingZone(zone)
    setError('')

    try {
      await removeZoneFromSmartIPRule({ id: rule.id, name: rule.name, zone })
      showSuccess(`Removed ${zone} from ${rule.name}.`, 'Zone removed')
      await modal.data?.onSuccess?.()
      modal.close()
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'Unable to remove zone from rule.'
      setError(message)
      showError(message, 'Zone removal failed')
    } finally {
      setRemovingZone('')
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
          <Alert title="Unable to update linked zones">
            {error}
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Badge variant="zone">Smart IP</Badge>
          <Badge variant="primary">{rule.linkedZones.length} linked zone{rule.linkedZones.length === 1 ? '' : 's'}</Badge>
        </div>

        <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-4">
          <DetailRow label="TTL" value={String(rule.ttl)} mono />
          <DetailRow label="Regex Pattern" value={rule.pattern} mono />
        </div>

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Linked Zones
          </div>
          <div className="space-y-2">
            {rule.linkedZones.length > 0 ? (
              rule.linkedZones.map((zone) => (
                <div
                  key={zone}
                  className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-3 py-2"
                >
                  <Badge variant="zone">{zone}</Badge>
                  <button
                    type="button"
                    onClick={() => handleRemoveZone(zone)}
                    disabled={removingZone === zone}
                    className="inline-flex items-center gap-1 text-xs font-medium text-error transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm">link_off</span>
                    {removingZone === zone ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))
            ) : (
              <span className="text-sm text-on-surface-variant">No zones linked</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
