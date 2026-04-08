import { useCallback, useEffect, useMemo, useState } from 'react'
import { MainLayout } from '../components/Layout/MainLayout'
import { Alert, Button, Badge, TextField } from '../components/Common'
import { listSmartIPRules, getZoneDisplayName } from '../api/scleraApi'
import { useModal } from '../hooks/useModal'
import { useFeedback } from '../hooks/useFeedback'

function mapRules(rows) {
  return rows.map((rule) => ({
    id: rule.ID ?? rule.Id ?? rule.id ?? 0,
    name: rule.Name ?? rule.name ?? '',
    description: rule.Description ?? rule.description ?? '',
    pattern: rule.Pattern ?? rule.pattern ?? '',
    ttl: rule.TTL ?? rule.ttl ?? 0,
    linkedZones: (rule.Zones || []).map(getZoneDisplayName),
  }))
}

export function SmartRulesList() {
  const createModal = useModal('createRule')
  const detailsModal = useModal('ruleDetails')
  const addZonesModal = useModal('addZones')
  const deleteModal = useModal('deleteConfirm')
  const { showError } = useFeedback()

  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const perPage = 8

  const loadRules = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await listSmartIPRules()
      setRules(mapRules(data))
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load smart IP rules.'
      setError(message)
      showError(message, 'Smart IP rules failed to load')
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const filtered = useMemo(
    () => rules.filter((rule) => (
      rule.name.toLowerCase().includes(search.toLowerCase())
      || rule.description.toLowerCase().includes(search.toLowerCase())
      || rule.pattern.toLowerCase().includes(search.toLowerCase())
      || rule.linkedZones.some((zone) => zone.toLowerCase().includes(search.toLowerCase()))
    )),
    [rules, search],
  )
  const totalLinked = rules.reduce((sum, rule) => sum + rule.linkedZones.length, 0)
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginatedRules = filtered.slice((page - 1) * perPage, page * perPage)

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const openRuleDetails = (rule) => {
    detailsModal.open({
      rule,
      onSuccess: loadRules,
      onEdit: () => createModal.open({ rule, onSuccess: loadRules }),
      onAddZones: () => addZonesModal.open({ ...rule, onSuccess: loadRules }),
    })
  }

  return (
    <MainLayout breadcrumbs={[{ label: 'Smart IP Rules', to: '/rules' }]}>
      <div className="px-6 py-5 space-y-5">
        {error && (
          <Alert title="Smart IP rules could not be loaded">
            {error}
          </Alert>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full max-w-md">
            <TextField
              placeholder="Search rules..."
              icon="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 lg:shrink-0">
            <button
              type="button"
              onClick={loadRules}
              className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition-colors"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <Button icon="add_circle" onClick={() => createModal.open({ onSuccess: loadRules })}>
              Create Smart IP Rule
            </Button>
          </div>
        </div>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="bg-surface-container-lowest px-5 py-4 rounded-xl ring-1 ring-outline-variant/10 transition-all">
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.14em]">
              Total Rules
            </p>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-[2rem] font-bold text-on-surface leading-none">{rules.length}</span>
              <span className="material-symbols-outlined text-outline-variant text-[24px]">rule</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest px-5 py-4 rounded-xl ring-1 ring-outline-variant/10 transition-all">
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.14em]">
              Total Linked Zones
            </p>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-[2rem] font-bold text-on-surface leading-none">{totalLinked}</span>
              <span className="material-symbols-outlined text-outline-variant text-[24px]">domain</span>
            </div>
          </div>
        </section>

        <div className="bg-surface-container-lowest rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/20">
                  <th className="px-5 py-3.5 text-[11px] text-outline font-semibold uppercase tracking-[0.12em]">Rule Name</th>
                  <th className="px-5 py-3.5 text-[11px] text-outline font-semibold uppercase tracking-[0.12em]">Regex Pattern</th>
                  <th className="px-5 py-3.5 text-[11px] text-outline font-semibold uppercase tracking-[0.12em]">TTL</th>
                  <th className="px-5 py-3.5 text-[11px] text-outline font-semibold uppercase tracking-[0.12em]">Linked Zones</th>
                  <th className="w-28 px-5 py-3.5 text-right text-[11px] text-outline font-semibold uppercase tracking-[0.12em]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">
                      Loading rules...
                    </td>
                  </tr>
                ) : paginatedRules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">
                      No rules found
                    </td>
                  </tr>
                ) : (
                  paginatedRules.map((rule) => (
                    <tr
                      key={rule.id}
                      onClick={() => openRuleDetails(rule)}
                      className="group cursor-pointer transition-colors hover:bg-surface-container-low/40"
                    >
                    <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          <span className="text-base font-semibold text-on-surface">{rule.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <code className="text-[13px] font-mono bg-surface-container-high/50 px-2.5 py-1 rounded-md text-on-surface-variant">
                          {rule.pattern}
                        </code>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-[15px] text-on-surface-variant">
                          {rule.ttl}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {rule.linkedZones.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {rule.linkedZones.map((zone) => (
                              <Badge key={zone} variant="zone">{zone}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              addZonesModal.open({ ...rule, onSuccess: loadRules })
                            }}
                            className="p-1 text-outline hover:text-on-surface transition-colors hover:bg-surface-container-high rounded-full"
                            title="Add zones"
                          >
                            <span className="material-symbols-outlined">add_link</span>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              deleteModal.open({
                                action: 'deleteRule',
                                id: rule.id,
                                name: rule.name,
                                zones: rule.linkedZones,
                                onSuccess: loadRules,
                              })
                            }}
                            className="p-1 text-outline hover:text-error transition-colors hover:bg-surface-container-high rounded-full"
                            title="Delete rule"
                          >
                            <span className="material-symbols-outlined">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3.5 bg-surface-container-low/20 flex items-center justify-between border-t border-outline-variant/10">
            <p className="text-sm text-on-surface-variant">
              Showing <span className="font-semibold text-on-surface">{filtered.length}</span> of{' '}
              <span className="font-semibold text-on-surface">{rules.length}</span> rules
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="px-3 py-1.5 border border-outline-variant/30 rounded text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
                disabled={page === 1}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="px-3 py-1.5 border border-outline-variant/30 rounded text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
