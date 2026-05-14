import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MainLayout } from '../components/Layout/MainLayout'
import {
  Alert, Button, Badge, StatusBadge, TextField, Select, Table, Pagination, BulkActionBar, BulkAction,
} from '../components/Common'
import {
  getZone,
  getSubdomainFromRecordName,
  getZoneDisplayName,
  isInternalSystemZone,
  normalizeRecordValue,
} from '../api/scleraApi'
import { useModal } from '../hooks/useModal'
import { useFeedback } from '../hooks/useFeedback'
import { DnssecSection } from '../components/Zone/DnssecSection'

function mapRecordRows(rrsets, zoneName) {
  return rrsets.map((rrset) => {
    const values = rrset.records?.map((record) => normalizeRecordValue(record.content)) ?? []
    const subdomain = getSubdomainFromRecordName(rrset.name, zoneName)

    return {
      id: `${rrset.name}-${rrset.type}`,
      name: subdomain || '@',
      fullName: getZoneDisplayName(rrset.name),
      type: rrset.type,
      ttl: rrset.ttl,
      value: values.join(', '),
      values,
    }
  })
}

export function ZoneRecords() {
  const { zoneId } = useParams()
  const detailsModal = useModal('recordDetails')
  const editModal = useModal('editRecord')
  const deleteModal = useModal('deleteConfirm')
  const { showError } = useFeedback()
  const zoneName = decodeURIComponent(zoneId || 'example.com')
  const isInternalZone = isInternalSystemZone(zoneName)

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [recordType, setRecordType] = useState('')
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(1)
  const perPage = 10

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const rrsets = await getZone(zoneName)
      setRecords(mapRecordRows(rrsets, zoneName))
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load records for this zone.'
      setError(message)
      showError(message, 'Zone records failed to load')
    } finally {
      setLoading(false)
    }
  }, [showError, zoneName])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const recordTypeOptions = useMemo(
    () => Array.from(new Set(records.map((record) => record.type)))
      .sort()
      .map((type) => ({ value: type, label: type })),
    [records],
  )

  const filtered = useMemo(
    () => records.filter((record) => (
      (!recordType || record.type === recordType)
      && (
        record.name.toLowerCase().includes(search.toLowerCase())
        || record.type.toLowerCase().includes(search.toLowerCase())
        || record.value.toLowerCase().includes(search.toLowerCase())
      )
    )),
    [recordType, records, search],
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const rows = filtered.slice((page - 1) * perPage, page * perPage)

  useEffect(() => {
    setPage(1)
    setSelected([])
  }, [recordType, search, zoneName])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (value) => <span className="text-sm font-semibold text-primary">{value}</span>,
    },
    {
      key: 'type',
      label: 'Type',
      width: '80px',
      render: (value) => (
        <span className="inline-flex items-center rounded-md bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface-variant">
          {value}
        </span>
      ),
    },
    { key: 'ttl', label: 'TTL', width: '80px', tdClass: 'text-sm text-on-surface-variant' },
    {
      key: 'value',
      label: 'Value / Endpoint',
      render: (value) => (
        <span className="block max-w-[360px] truncate text-sm text-on-surface" title={value}>
          {value}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '120px',
      align: 'right',
      render: (_, row) => {
        const isApexNs = row.name === '@' && row.type === 'NS'
        const isSoa = row.type === 'SOA'

        if (isInternalZone) {
          return (
            <div className="flex justify-end gap-1">
              <span
                className="inline-flex items-center justify-center p-1 text-outline"
                title="This internal zone is managed by the system"
              >
                <span className="material-symbols-outlined text-[18px]">shield_lock</span>
              </span>
            </div>
          )
        }

        if (isSoa) {
          return (
            <div className="flex justify-end gap-1">
              <span
                className="inline-flex items-center justify-center p-1 text-outline"
                title="SOA records are managed by the system"
              >
                <span className="material-symbols-outlined text-[18px]">lock</span>
              </span>
            </div>
          )
        }

        return (
          <div className="flex justify-end gap-1">
            <button
              onClick={(event) => {
                event.stopPropagation()
                editModal.open({
                  zone: zoneName,
                  record: row,
                  records,
                  onSuccess: loadRecords,
                })
              }}
              className="p-1 text-on-surface-variant hover:text-primary transition-colors"
              title="Edit record"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
            {isApexNs ? (
              <span
                className="inline-flex items-center justify-center p-1 text-outline"
                title="Apex NS records are required (RFC 1035 §6.1) and cannot be deleted"
              >
                <span className="material-symbols-outlined text-[18px]">lock</span>
              </span>
            ) : (
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  deleteModal.open({
                    action: 'deleteRecordSet',
                    payload: {
                      zone: zoneName,
                      subdomain: row.name,
                      record_type: row.type,
                    },
                    name: `${row.name} ${row.type}`,
                    title: `Delete ${row.type} record at ${row.name}?`,
                    description: `This will remove all ${row.values.length} value${row.values.length === 1 ? '' : 's'} of the ${row.type} RRset at ${row.fullName}. This action cannot be undone.`,
                    confirmLabel: 'Delete Record',
                    onSuccess: loadRecords,
                  })
                }}
                className="p-1 text-on-surface-variant hover:text-error transition-colors"
                title="Delete record"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}
          </div>
        )
      },
    },
  ]

  const toggleRow = (id) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  const toggleAll = () =>
    setSelected(selected.length === rows.length ? [] : rows.map((row) => row.id))

  return (
    <MainLayout
      breadcrumbs={[
        { label: 'Hosted Zones', to: '/' },
        { label: zoneName.toUpperCase() },
      ]}
    >
      <section className="border-b border-border bg-surface px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[28px] font-semibold text-on-surface tracking-tight">{zoneName}</h2>
              {isInternalZone && (
                <Badge variant="zone">Internal</Badge>
              )}
            </div>
          </div>
          {!isInternalZone && (
            <Button icon="add" onClick={() => editModal.open({ zone: zoneName, records, onSuccess: loadRecords })}>
              Create Record
            </Button>
          )}
        </div>
      </section>

      {isInternalZone && (
        <section className="px-6 pt-4">
          <Alert title="System-managed zone">
            This zone is managed internally and cannot be changed from the frontend.
          </Alert>
        </section>
      )}

      {!isInternalZone && (
        <section className="px-6 pt-4">
          <DnssecSection zoneName={zoneName} />
        </section>
      )}

      <section className="px-6 py-4">
        {error && (
          <div className="pb-4">
            <Alert title="Zone records could not be loaded">
              {error}
            </Alert>
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <TextField
              placeholder="Search records (e.g. www, api)"
              icon="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value) }}
              className="flex-1 max-w-lg"
            />
            <Select
              options={recordTypeOptions}
              placeholder="All types"
              value={recordType}
              onChange={(event) => setRecordType(event.target.value)}
              className="w-full sm:w-40"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button className="flex h-9 items-center gap-2 rounded-md bg-surface-container-high px-3 text-sm font-medium text-on-surface">
              {records.length} RRsets
            </button>
            <div className="w-px h-4 bg-outline-variant/30" />
            <button
              type="button"
              onClick={loadRecords}
              className="flex h-9 w-9 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
          </div>
        </div>

        <div>
          <Table
            columns={columns}
            rows={rows}
            selectedRows={selected}
            onSelectRow={toggleRow}
            onSelectAll={toggleAll}
            isAllSelected={selected.length === rows.length && rows.length > 0}
            loading={loading}
            onRowClick={(row) => detailsModal.open({
              zone: zoneName,
              record: row,
              onEdit: () => editModal.open({
                zone: zoneName,
                record: row,
                records,
                onSuccess: loadRecords,
              }),
            })}
          />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filtered.length}
            itemsPerPage={perPage}
            onPageChange={setPage}
            label="records"
          />
        </div>
      </section>

      <BulkActionBar selectedCount={selected.length} onClose={() => setSelected([])} label="Records selected">
        <BulkAction icon="refresh" label="Refresh" onClick={loadRecords} />
      </BulkActionBar>
    </MainLayout>
  )
}
