import { useState } from 'react'
import {
  Modal, Badge, Button, Alert,
} from '../Common'
import { useModal } from '../../hooks/useModal'
import { deleteSmartIPRule, deleteZone, deleteAllRecords } from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

export function DeleteConfirmationModal() {
  const formId = 'delete-confirm-form'
  const modal = useModal('deleteConfirm')
  const { showError, showSuccess } = useFeedback()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const itemName = modal.data?.name || 'Unknown'
  const itemId = modal.data?.id
  const affectedZones = modal.data?.zones || []

  const handleConfirm = async () => {
    setLoading(true)
    setError('')

    try {
      if (modal.data?.action === 'deleteRule') {
        await deleteSmartIPRule({ id: itemId, name: itemName })
        showSuccess('Smart IP rule deleted successfully.', 'Rule deleted')
      } else if (modal.data?.action === 'deleteZone') {
        await deleteZone(itemName)
        showSuccess('Hosted zone deleted successfully.', 'Zone deleted')
      } else if (modal.data?.action === 'deleteRecordSet') {
        await deleteAllRecords(modal.data.payload)
        showSuccess('Record set deleted successfully.', 'Record deleted')
      } else if (modal.data?.onConfirm) {
        await modal.data.onConfirm()
      }

      await modal.data?.onSuccess?.()
      modal.close()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to delete item.'
      setError(message)
      showError(message, 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  const title = modal.data?.title || `Delete Rule: ${itemName}?`
  const description = modal.data?.description
    || `This action cannot be undone. All linked zones (${affectedZones.length}) will no longer use this pattern for IP resolution.`
  const buttonLabel = modal.data?.confirmLabel || 'Delete Rule'

  return (
    <Modal isOpen={modal.isOpen} onClose={modal.close} size="sm">
      <form
        id={formId}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          handleConfirm()
        }}
      >
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-error-container flex items-center justify-center">
            <span className="material-symbols-outlined text-error text-3xl">warning</span>
          </div>
        </div>

        <div className="text-center">
          <h3 className="text-base font-bold text-on-surface">
            {title}
          </h3>
          <p className="text-sm text-on-surface-variant mt-2">
            {description}
          </p>
        </div>

        {error && (
          <Alert title="Unable to complete delete">
            {error}
          </Alert>
        )}

        {affectedZones.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-amber-500">warning</span>
              Affected Zones
            </p>
            <div className="flex flex-wrap gap-1.5">
              {affectedZones.map((zone) => (
                <Badge key={zone} variant="zone">{zone}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={modal.close}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <Button type="submit" form={formId} variant="danger" disabled={loading} icon="delete">
            {loading ? 'Deleting...' : buttonLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
