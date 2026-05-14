import { useEffect, useMemo, useState } from 'react'
import {
  Modal, TextField, Button, Alert,
} from '../Common'
import { useModal } from '../../hooks/useModal'
import {
  addSmartIPRule,
  getZoneDisplayName,
  listZones,
  isInternalSystemZone,
  normalizeRegexPattern,
  validateTtl as validateTtlValue,
} from '../../api/scleraApi'
import { useFeedback } from '../../hooks/useFeedback'

const TTL_PRESETS = [
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '1h', value: 3600 },
  { label: '6h', value: 21600 },
  { label: '1d', value: 86400 },
]

function inferSmartIpAnswer(capturedValue = '') {
  const value = capturedValue.trim()

  if (/^\d{1,3}(?:-\d{1,3}){3}$/.test(value)) {
    return value.replace(/-/g, '.')
  }

  return value
}

export function CreateSmartIPRuleModal() {
  const formId = 'create-smart-rule-form'
  const modal = useModal('createRule')
  const { showError, showSuccess } = useFeedback()
  const editingRule = modal.data?.rule || null
  const isEdit = Boolean(editingRule)
  const [form, setForm] = useState({
    name: '',
    description: '',
    pattern: '',
    ttl: '300',
  })
  const [availableZones, setAvailableZones] = useState([])
  const [selectedZones, setSelectedZones] = useState([])
  const [loading, setLoading] = useState(false)
  const [zonesLoading, setZonesLoading] = useState(false)
  const [error, setError] = useState('')
  const [ttlError, setTtlError] = useState('')
  const [search, setSearch] = useState('')
  const [simulatorQuery, setSimulatorQuery] = useState('')
  const [showSimulator, setShowSimulator] = useState(false)

  useEffect(() => {
    if (!modal.isOpen) return

    setForm({
      name: editingRule?.name ?? '',
      description: editingRule?.description ?? '',
      pattern: editingRule?.pattern ?? '',
      ttl: String(editingRule?.ttl ?? 300),
    })
    setSelectedZones(editingRule?.linkedZones ?? [])
    setSearch('')
    setError('')
    setTtlError('')
    setSimulatorQuery('')
    setShowSimulator(false)

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
  }, [editingRule, modal.isOpen, showError])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const validateTtl = (value) => validateTtlValue(value)

  const filteredZones = useMemo(
    () => availableZones.filter((zone) => zone.toLowerCase().includes(search.toLowerCase())),
    [availableZones, search],
  )

  const simulatorResult = useMemo(() => {
    const pattern = normalizeRegexPattern(form.pattern)
    const query = simulatorQuery.trim()

    if (!pattern) {
      return { state: 'idle' }
    }

    try {
      const regex = new RegExp(pattern)

      if (!query) {
        return { state: 'ready' }
      }

      if (!query.endsWith('.')) {
        return {
          state: 'missing-dot',
          query,
        }
      }

      const match = regex.exec(query)

      if (!match) {
        return { state: 'no-match' }
      }

      const captured = match[1] ?? ''

      if (!captured) {
        return {
          state: 'missing-capture',
          match: match[0],
        }
      }

      return {
        state: 'matched',
        query,
        match: match[0],
        captured,
        answer: inferSmartIpAnswer(captured),
      }
    } catch (simulatorError) {
      return {
        state: 'invalid-regex',
        message: simulatorError instanceof Error ? simulatorError.message : 'Invalid regex pattern.',
      }
    }
  }, [form.pattern, simulatorQuery])

  const toggleZone = (zone) => {
    setSelectedZones((current) => (
      current.includes(zone)
        ? current.filter((item) => item !== zone)
        : [...current, zone]
    ))
  }

  const handleSubmit = async () => {
    setError('')
    const nextTtlError = validateTtl(form.ttl)
    setTtlError(nextTtlError)

    if (!form.name.trim()) {
      setError('Rule name is required.')
      return
    }

    if (nextTtlError) {
      setError(nextTtlError)
      return
    }

    setLoading(true)

    try {
      await addSmartIPRule({
        id: editingRule?.id ?? 0,
        name: form.name,
        description: form.description,
        pattern: normalizeRegexPattern(form.pattern),
        zones: selectedZones,
        ttl: form.ttl,
      })
      showSuccess(
        isEdit ? 'Smart IP rule updated successfully.' : 'Smart IP rule created successfully.',
        isEdit ? 'Rule updated' : 'Rule created',
      )
      await modal.data?.onSuccess?.()
      modal.close()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : `Unable to ${isEdit ? 'update' : 'create'} rule.`
      setError(message)
      showError(message, isEdit ? 'Rule update failed' : 'Rule creation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title={isEdit ? 'Edit Smart IP Rule' : 'Create Smart IP Rule'}
      subtitle={isEdit ? `Updating rule #${editingRule.id}` : ''}
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
          <Button type="submit" form={formId} disabled={loading || !form.name.trim() || !form.pattern || !!ttlError || !form.ttl}>
            {loading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Rule' : 'Create Rule')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {error && (
          <Alert title={isEdit ? 'Unable to update rule' : 'Unable to create rule'}>
            {error}
          </Alert>
        )}

        <TextField
          label="Rule Name"
          placeholder="e.g. Rule 1 "
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
        />

        <TextField
          label="Description (Optional)"
          placeholder="Description"
          value={form.description}
          onChange={(event) => set('description', event.target.value)}
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              Regex Pattern
            </label>
          </div>
          <textarea
            placeholder="^(\d{1,3}(?:-\d{1,3}){3})\."
            value={form.pattern}
            onChange={(event) => set('pattern', event.target.value)}
            rows={3}
            className="w-full bg-surface-container-lowest border border-outline-variant/40 focus:border-primary focus:ring-2 focus:ring-primary/15 p-3 text-sm rounded outline-none transition-all font-mono"
          />
          <p className="mt-1.5 text-xs text-on-surface-variant">
            Only the first capture group is used to derive the returned answer.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest">
          <button
            type="button"
            onClick={() => setShowSimulator((current) => !current)}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface-container-low/30"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">science</span>
              <span className="text-base font-semibold text-on-surface">Simulation Lab</span>
              <span className="inline-flex items-center rounded bg-surface-container px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                Test Environment
              </span>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">
              {showSimulator ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showSimulator && (
            <div className="space-y-3 border-t border-outline-variant/10 p-4">
              <TextField
                label="Sample Query"
                placeholder="e.g. 192-168-1-10.office.example.com"
                value={simulatorQuery}
                onChange={(event) => setSimulatorQuery(event.target.value)}
              />

              <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-4 py-3">
                {simulatorResult.state === 'idle' && (
                  <p className="text-sm text-on-surface-variant">
                    Add a regex pattern to start simulating.
                  </p>
                )}

                {simulatorResult.state === 'ready' && (
                  <p className="text-sm text-on-surface-variant">
                    Enter a sample query to preview the generated answer.
                  </p>
                )}

                {simulatorResult.state === 'missing-dot' && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-600">Include the trailing dot in the sample query.</p>
                    <p className="text-xs text-on-surface-variant">
                      DNS queries are evaluated as fully qualified names like <span className="font-mono">{`${simulatorResult.query}.`}</span>.
                    </p>
                  </div>
                )}

                {simulatorResult.state === 'invalid-regex' && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-error">Invalid regex pattern</p>
                    <p className="text-xs text-error">{simulatorResult.message}</p>
                  </div>
                )}

                {simulatorResult.state === 'no-match' && (
                  <p className="text-sm text-on-surface-variant">
                    No match for this query. The rule would not generate an answer from the sample input.
                  </p>
                )}

                {simulatorResult.state === 'missing-capture' && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-600">Pattern matched, but no answer value could be derived.</p>
                    <p className="text-xs text-on-surface-variant">
                      Update the pattern so the match contains the value that should become the DNS answer.
                    </p>
                  </div>
                )}

                {simulatorResult.state === 'matched' && (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                          Regex Match
                        </div>
                        <div className="mt-1 break-all font-mono text-sm text-on-surface">
                          {simulatorResult.match}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                          Query Tested
                        </div>
                        <div className="mt-1 break-all font-mono text-sm text-on-surface">
                          {simulatorResult.query}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                          Simulated Answer
                        </div>
                        <div className="mt-1 break-all font-mono text-sm font-semibold text-primary">
                          {simulatorResult.answer}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide block mb-1.5">
            TTL (Seconds)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="300"
              value={form.ttl}
              onChange={(event) => {
                const value = event.target.value
                set('ttl', value)
                setTtlError(validateTtl(value))
              }}
              className={`w-24 bg-surface-container-lowest border ${
                ttlError ? 'border-error ring-1 ring-error/20' : 'border-outline-variant/40'
              } focus:border-primary focus:ring-2 focus:ring-primary/15 h-9 px-3 text-sm rounded outline-none transition-all`}
            />
            <div className="flex gap-1">
              {TTL_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    set('ttl', String(preset.value))
                    setTtlError('')
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                    String(preset.value) === form.ttl
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {ttlError && <p className="text-xs text-error mt-1.5">{ttlError}</p>}
          <p className="text-xs text-on-surface-variant mt-1.5">
            Time in seconds that generated smart-IP answers should be cached.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              Link Zones
            </p>
            <span className="text-xs text-on-surface-variant">
              {selectedZones.length} selected
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">
            Optional. You can create the rule first and link zones later.
          </p>
          <TextField
            placeholder="Filter zones..."
            icon="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="border border-outline-variant/20 rounded overflow-y-auto max-h-64 divide-y divide-outline-variant/10">
            {zonesLoading ? (
              <div className="px-4 py-8 text-sm text-center text-on-surface-variant">
                Loading zones...
              </div>
            ) : filteredZones.length === 0 ? (
              <div className="px-4 py-8 text-sm text-center text-on-surface-variant">
                No zones available
              </div>
            ) : (
              filteredZones.map((zone) => {
                const checked = selectedZones.includes(zone)
                return (
                  <label
                    key={zone}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      checked ? 'bg-primary/5' : 'hover:bg-surface-container-low'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleZone(zone)}
                      className="w-4 h-4 rounded border-outline-variant accent-primary flex-shrink-0"
                    />
                    <span className={`text-sm font-medium ${checked ? 'text-primary' : 'text-on-surface'}`}>
                      {zone}
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      </form>
    </Modal>
  )
}
