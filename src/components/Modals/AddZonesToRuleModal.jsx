import { useEffect, useMemo, useState } from 'react'
import { Modal, TextField, Button, Alert } from '../Common'
import { useModal } from '../../hooks/useModal'
import {
  addZoneToSmartIPRule, getZoneDisplayName, listZones, isInternalSystemZone,
} from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

export function AddZonesToRuleModal() {
  const formId = 'add-zones-to-rule-form'
  const modal = useModal('addZones')
  const { showError, showSuccess } = useFeedback()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [availableZones, setAvailableZones] = useState([])
  const [loading, setLoading] = useState(false)
  const [zonesLoading, setZonesLoading] = useState(false)
  const [error, setError] = useState('')

  const existingZones = modal.data?.linkedZones || []

  useEffect(() => {
    if (!modal.isOpen) return

    setSearch('')
    setSelected([])
    setError('')

    const loadZones = async () => {
      setZonesLoading(true)

      try {
        const zones = await listZones()
        setAvailableZones(zones.map(getZoneDisplayName).filter((zone) => !isInternalSystemZone(zone)))
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Unable to load zones.'
        setError(message)
        showError(message, 'Zones failed to load')
      } finally {
        setZonesLoading(false)
      }
    }

    loadZones()
  }, [modal.isOpen, showError])

  const filtered = useMemo(
    () => availableZones.filter((zone) => zone.toLowerCase().includes(search.toLowerCase())),
    [availableZones, search],
  )

  const toggle = (name) => {
    if (existingZones.includes(name)) {
      return
    }

    setSelected((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name])
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')

    try {
      await Promise.all(
        selected.map((zone) => addZoneToSmartIPRule({ id: modal.data.id, name: modal.data.name, zone })),
      )
      showSuccess('Zones linked to rule successfully.', 'Rule updated')
      await modal.data?.onSuccess?.()
      modal.close()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to update linked zones.'
      setError(message)
      showError(message, 'Linking zones failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title="Add Zones to Rule"
      subtitle={modal.data?.name ? `Linking to: ${modal.data.name}` : ''}
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={modal.close}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <Button type="submit" form={formId} disabled={selected.length === 0 || loading}>
            {loading ? 'Updating...' : 'Update Linked Zones'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
      >
        {error && (
          <Alert title="Unable to update linked zones">
            {error}
          </Alert>
        )}

        <TextField
          placeholder="Filter available zones..."
          icon="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Available Zones ({filtered.length})
            </span>
            <button
              type="button"
              onClick={() => setSelected(filtered.filter((zone) => !existingZones.includes(zone)))}
              className="text-[10px] font-bold text-primary uppercase tracking-wider hover:underline"
            >
              Select All New
            </button>
          </div>

          <div className="border border-outline-variant/20 rounded overflow-y-auto max-h-72 divide-y divide-outline-variant/10">
            {zonesLoading ? (
              <div className="px-4 py-8 text-sm text-center text-on-surface-variant">
                Loading zones...
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-8 text-sm text-center text-on-surface-variant">
                No zones available
              </div>
            ) : (
              filtered.map((zone) => {
                const isExisting = existingZones.includes(zone)
                const checked = isExisting || selected.includes(zone)

                return (
                  <label
                    key={zone}
                    className={`block w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                      checked ? 'bg-primary/5' : 'hover:bg-surface-container-low'
                    } ${isExisting ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isExisting}
                      onChange={() => toggle(zone)}
                      className="w-4 h-4 rounded border-outline-variant accent-primary flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${checked ? 'text-primary' : 'text-on-surface'}`}>
                        {zone}
                      </p>
                      <p className="text-[11px] text-on-surface-variant">
                        {isExisting ? 'Already linked to this rule' : 'Available to link'}
                      </p>
                    </div>
                  </label>
                )
              })
            )}
          </div>
        </div>

        {(existingZones.length > 0 || selected.length > 0) && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-primary font-medium">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              {selected.length} new zone{selected.length === 1 ? '' : 's'} selected
            </span>
            {existingZones.length > 0 && (
              <span className="text-on-surface-variant">
                {existingZones.length} already linked
              </span>
            )}
          </div>
        )}
      </form>
    </Modal>
  )
}
