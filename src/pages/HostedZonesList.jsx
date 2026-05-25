import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MainLayout } from '../components/Layout/MainLayout'
import {
  Alert, Button, TextField,
} from '../components/Common'
import {
  listRecords, listZonesDNSSEC, getZoneDisplayName, isInternalSystemZone, normalizeRecordValue, exportDatabase,
} from '../api/scleraApi'
import { useModal } from '../hooks/useModal'
import { useFeedback } from '../hooks/useFeedback'

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function mapZoneRows(recordsByZone) {
  return Object.entries(recordsByZone)
    .filter(([zoneName]) => !isInternalSystemZone(zoneName))
    .map(([zoneName, rrsets]) => {
    const cleanName = getZoneDisplayName(zoneName)
    const nameserverSet = rrsets.find((rrset) => rrset.type === 'NS')
    const nameservers = nameserverSet?.records?.length
      ? nameserverSet.records
        .map((record) => normalizeRecordValue(record.content))
        .join(', ')
      : 'Not configured'

    return {
      id: cleanName,
      name: cleanName,
      records: rrsets.length,
      nameservers,
    }
    })
}

export function HostedZonesList() {
  const navigate = useNavigate()
  const createZoneModal = useModal('createZone')
  const deleteModal = useModal('deleteConfirm')
  const { showError, showSuccess } = useFeedback()
  const [zones, setZones] = useState([])
  const [dnssecStats, setDnssecStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const perPage = 10

  const loadZones = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [recordsResult, dnssecResult] = await Promise.allSettled([
        listRecords(),
        listZonesDNSSEC(),
      ])

      if (recordsResult.status === 'rejected') {
        throw recordsResult.reason
      }

      setZones(mapZoneRows(recordsResult.value))

      if (dnssecResult.status === 'fulfilled' && Array.isArray(dnssecResult.value?.zones)) {
        const visible = dnssecResult.value.zones.filter((entry) => !isInternalSystemZone(entry.zone))
        setDnssecStats({
          secured: visible.filter((entry) => entry.secured).length,
          total: visible.length,
        })
      } else {
        setDnssecStats(null)
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load hosted zones.'
      setError(message)
      showError(message, 'Hosted zones failed to load')
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    loadZones()
  }, [loadZones])

  const filtered = useMemo(
    () => zones.filter((zone) => zone.name.toLowerCase().includes(search.toLowerCase())),
    [search, zones],
  )
  const totalRecords = zones.reduce((sum, zone) => sum + zone.records, 0)
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const rows = filtered.slice((page - 1) * perPage, page * perPage)

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const { blob, filename } = await exportDatabase()
      triggerBlobDownload(blob, filename)
      showSuccess(`Saved ${filename}`, 'Database exported')
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : 'Unable to export the database.'
      showError(message, 'Export failed')
    } finally {
      setExporting(false)
    }
  }, [showError, showSuccess])

  const openZone = (row) => navigate(`/zones/${encodeURIComponent(row.name)}`)

  const requestDelete = (row) => {
    deleteModal.open({
      action: 'deleteZone',
      name: row.name,
      title: `Delete Zone: ${row.name}?`,
      description: 'This action cannot be undone. The zone and all of its records will be permanently removed.',
      confirmLabel: 'Delete Zone',
      onSuccess: loadZones,
    })
  }

  return (
    <MainLayout breadcrumbs={[{ label: 'Hosted Zones', to: '/' }]}>
      <div className="px-6 py-5 space-y-5">
        {error && (
          <Alert title="Hosted zones could not be loaded">
            {error}
          </Alert>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full max-w-md">
            <TextField
              placeholder="Search zone name..."
              icon="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              onClear={() => { setSearch(''); setPage(1) }}
            />
          </div>
          <div className="flex items-center gap-2 lg:shrink-0">
            <button
              type="button"
              onClick={loadZones}
              className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition-colors"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <Button
              variant="secondary"
              icon={exporting ? 'progress_activity' : 'download'}
              onClick={handleExport}
              disabled={exporting}
              title="Download a consistent SQLite snapshot of the DNS database"
              className={exporting ? '[&>span:first-child]:animate-spin' : ''}
            >
              {exporting ? 'Exporting…' : 'Export Database'}
            </Button>
            <Button
              icon="add"
              onClick={() => createZoneModal.open({
                onSuccess: (createdZone) => {
                  if (createdZone) {
                    navigate(`/zones/${encodeURIComponent(createdZone)}`)
                  } else {
                    loadZones()
                  }
                },
              })}
            >
              Add Hosted Zone
            </Button>
          </div>
        </div>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="bg-surface-container-lowest px-5 py-4 rounded-xl ring-1 ring-outline-variant/10 transition-all">
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.14em]">
              Total Hosted Zones
            </p>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-[2rem] font-bold text-on-surface leading-none">{zones.length}</span>
              <span className="material-symbols-outlined text-outline-variant text-[24px]">language</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest px-5 py-4 rounded-xl ring-1 ring-outline-variant/10 transition-all">
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.14em]">
              Total Records
            </p>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-[2rem] font-bold text-on-surface leading-none">{totalRecords}</span>
              <span className="material-symbols-outlined text-outline-variant text-[24px]">dns</span>
            </div>
          </div>
          {dnssecStats && (
            <div className="bg-surface-container-lowest px-5 py-4 rounded-xl ring-1 ring-outline-variant/10 transition-all">
              <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.14em]">
                DNSSEC Enabled
              </p>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-[2rem] font-bold text-on-surface leading-none">{dnssecStats.secured}</span>
                <span className="material-symbols-outlined text-outline-variant text-[24px]">shield</span>
              </div>
            </div>
          )}
        </section>

        <div className="bg-surface-container-lowest rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/20">
                  <th className="px-5 py-3.5 text-[11px] text-outline font-semibold uppercase tracking-[0.12em]">Zone Name</th>
                  <th className="px-5 py-3.5 text-[11px] text-outline font-semibold uppercase tracking-[0.12em]">Records</th>
                  <th className="px-5 py-3.5 text-[11px] text-outline font-semibold uppercase tracking-[0.12em]">Nameservers</th>
                  <th className="w-28 px-5 py-3.5 text-right text-[11px] text-outline font-semibold uppercase tracking-[0.12em]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-on-surface-variant">
                      Loading zones...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-on-surface-variant">
                      No zones found
                    </td>
                  </tr>
                ) : (
                  rows.map((zone) => (
                    <tr
                      key={zone.id}
                      onClick={() => openZone(zone)}
                      className="group cursor-pointer transition-colors hover:bg-surface-container-low/40"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          <span className="block max-w-[260px] truncate text-base font-semibold text-on-surface" title={zone.name}>
                            {zone.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <code className="text-[13px] font-mono bg-surface-container-high/50 px-2.5 py-1 rounded-md text-on-surface-variant">
                          {zone.records}
                        </code>
                      </td>
                      <td className="px-5 py-4">
                        <span className="block max-w-[360px] truncate font-mono text-[13px] text-on-surface-variant" title={zone.nameservers}>
                          {zone.nameservers}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              requestDelete(zone)
                            }}
                            className="p-1 text-outline hover:text-error transition-colors hover:bg-surface-container-high rounded-full"
                            title="Delete zone"
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
              <span className="font-semibold text-on-surface">{zones.length}</span> zones
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
