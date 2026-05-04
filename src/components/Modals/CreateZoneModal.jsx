import { useEffect, useState } from 'react'
import { Button, Modal, TextField, Alert } from '../Common'
import { useModal } from '../../hooks/useModal'
import { createZone, isInternalSystemZone } from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

export function CreateZoneModal() {
  const formId = 'create-zone-form'
  const modal = useModal('createZone')
  const { showError, showSuccess } = useFeedback()
  const [zone, setZone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (modal.isOpen) {
      setZone(modal.data?.zone ?? '')
      setError('')
    }
  }, [modal.data, modal.isOpen])

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      if (isInternalSystemZone(zone)) {
        throw new Error('This zone name is reserved for internal system use and cannot be managed from the frontend.')
      }

      const message = await createZone(zone)
      showSuccess(typeof message === 'string' ? message : 'Zone created successfully', 'Zone created')
      await modal.data?.onSuccess?.()
      modal.close()
      setZone('')
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
      subtitle="Create a new DNS container for your domain records."
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
            <div>
              <h3 className="text-base font-semibold tracking-tight text-on-surface">Zone Basics</h3>
            </div>
          </div>

          <div className="max-w-[420px] space-y-2">
            <TextField
              label="Domain Name"
              placeholder="example.com"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
            />
            <p className="text-xs text-on-surface-variant">
              Specify the apex domain you want to manage.
            </p>
          </div>
        </section>
      </form>
    </Modal>
  )
}
