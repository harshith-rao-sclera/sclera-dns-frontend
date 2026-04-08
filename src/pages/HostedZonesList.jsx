import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MainLayout } from '../components/Layout/MainLayout'
import {
  Alert, Button, TextField, Table, Pagination, BulkActionBar, BulkAction,
} from '../components/Common'
import {
  deleteZone, listRecords, getZoneDisplayName, isInternalSystemZone, normalizeRecordValue,
} from '../api/scleraApi'
import { useModal } from '../hooks/useModal'
import { useFeedback } from '../hooks/useFeedback'

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
  const { showError } = useFeedback()
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(1)
  const perPage = 10

  const loadZones = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const recordsByZone = await listRecords()
      setZones(mapZoneRows(recordsByZone))
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

  const columns = [
    {
      key: 'name',
      label: 'Zone Name',
      render: (value) => (
        <button
          onClick={(event) => {
            event.stopPropagation()
            navigate(`/zones/${encodeURIComponent(value)}`)
          }}
          className="font-semibold text-primary hover:underline cursor-pointer"
        >
          {value}
        </button>
      ),
    },
    {
      key: 'records',
      label: 'Records',
      align: 'right',
      width: '100px',
      render: (value) => <span className="font-mono text-[12px]">{value}</span>,
    },
    {
      key: 'nameservers',
      label: 'Nameservers',
      render: (value) => <span className="text-[11px] text-on-surface-variant font-mono">{value}</span>,
    },
  ]

  const toggleRow = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const toggleAll = () =>
    setSelected(selected.length === rows.length ? [] : rows.map((row) => row.id))

  const selectedZones = zones.filter((zone) => selected.includes(zone.id))

  const handleDeleteSelected = () => {
    if (selectedZones.length === 0) return

    if (selectedZones.length === 1) {
      const [zone] = selectedZones
      deleteModal.open({
        action: 'deleteZone',
        name: zone.name,
        title: `Delete Zone: ${zone.name}?`,
        description: 'This action cannot be undone. The zone and all of its records will be permanently removed.',
        confirmLabel: 'Delete Zone',
        onSuccess: async () => {
          setSelected([])
          await loadZones()
        },
      })
      return
    }

    deleteModal.open({
      title: `Delete ${selectedZones.length} Zones?`,
      description: 'This action cannot be undone. All selected zones and their records will be permanently removed.',
      confirmLabel: 'Delete Zones',
      zones: selectedZones.map((zone) => zone.name),
      onConfirm: async () => {
        await Promise.all(selectedZones.map((zone) => deleteZone(zone.name)))
      },
      onSuccess: async () => {
        setSelected([])
        await loadZones()
      },
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
          <div className="flex items-center flex-1 max-w-2xl">
            <TextField
              placeholder="Search zone name..."
              icon="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadZones}
              className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition-colors"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <Button icon="add" onClick={() => createZoneModal.open({ onSuccess: loadZones })}>
              Add Hosted Zone
            </Button>
          </div>
        </div>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        </section>

        <div>
          <Table
            columns={columns}
            rows={rows}
            selectedRows={selected}
            onSelectRow={toggleRow}
            onSelectAll={toggleAll}
            isAllSelected={selected.length === rows.length && rows.length > 0}
            onRowClick={(row) => navigate(`/zones/${encodeURIComponent(row.name)}`)}
            loading={loading}
          />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filtered.length}
            itemsPerPage={perPage}
            onPageChange={setPage}
            label="Hosted Zones"
          />
        </div>
      </div>

      <BulkActionBar
        selectedCount={selected.length}
        onClose={() => setSelected([])}
        label="Zones selected"
      >
        <BulkAction icon="delete" label="Delete" variant="danger" onClick={handleDeleteSelected} />
      </BulkActionBar>
    </MainLayout>
  )
}
