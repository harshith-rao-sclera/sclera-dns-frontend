import { Badge, Button, Modal } from '../Common'
import { useModal } from '../../hooks/useModal'
import { isInternalSystemZone } from '../../api/scleraApi'

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 py-3 border-b border-outline-variant/10 last:border-b-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </div>
      <div className={mono ? 'font-mono text-sm text-on-surface break-all' : 'text-sm text-on-surface'}>
        {value}
      </div>
    </div>
  )
}

export function RecordDetailsModal() {
  const modal = useModal('recordDetails')
  const record = modal.data?.record
  const zone = modal.data?.zone || ''
  const isInternalZone = isInternalSystemZone(zone)
  const canEdit = !!record && record.type !== 'SOA' && !isInternalZone

  if (!record) return null

  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title={`Record Details: ${record.name}`}
      subtitle={`Zone: ${zone}`}
      size="xl"
      footer={
        <>
          <button
            onClick={modal.close}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Close
          </button>
          {canEdit && (
            <Button
              onClick={() => {
                modal.close()
                modal.data?.onEdit?.()
              }}
            >
              Edit Record
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Badge variant="zone">{record.type}</Badge>
          {record.type === 'SOA' && <Badge variant="primary">System Managed</Badge>}
          {isInternalZone && <Badge variant="primary">Internal Zone</Badge>}
        </div>

        <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-4">
          <DetailRow label="Subdomain" value={record.name} />
          <DetailRow label="Full Name" value={record.fullName} mono />
          <DetailRow label="Type" value={record.type} />
          <DetailRow label="TTL" value={String(record.ttl)} mono />
          <DetailRow label="Value Count" value={String(record.values?.length || 0)} mono />
        </div>

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Record Values
          </div>
          <div className="space-y-2">
            {(record.values || []).map((value, index) => (
              <div
                key={`${record.id}-value-${index}`}
                className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 font-mono text-sm text-on-surface break-all"
              >
                {value}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
