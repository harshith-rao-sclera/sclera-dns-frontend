import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, Alert } from '../Common'
import { useModal } from '../../hooks/useModal'
import { useFeedback } from '../../hooks/useFeedback'
import {
  exportDatabase, exportZones, importZones, guessImportFormat,
} from '../../api/scleraApi'
import { triggerBlobDownload } from '../../utils/download'

const ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const EXPORT_ACTIONS = [
  { target: 'csv', icon: 'description', title: 'Records — CSV', desc: 'All zones, human-readable' },
  { target: 'xlsx', icon: 'table_view', title: 'Records — Excel', desc: 'All zones, .xlsx spreadsheet' },
  { target: 'db', icon: 'database', title: 'Full database', desc: 'Complete .sqlite backup (keys & rules)' },
]

function formatBytes(bytes = 0) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`
}

function PaneHeading({ icon, title }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </div>
      <h3 className="text-base font-semibold tracking-tight text-on-surface">{title}</h3>
    </div>
  )
}

export function ImportExportModal() {
  const modal = useModal('importExport')
  const { showError, showSuccess } = useFeedback()
  const inputRef = useRef(null)

  const [exporting, setExporting] = useState(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    if (modal.isOpen) {
      setExporting(null)
      setFile(null)
      setDragging(false)
      setImporting(false)
      setImportError('')
    }
  }, [modal.isOpen])

  const format = useMemo(() => (file ? guessImportFormat(file.name) : null), [file])

  const handleExport = async (target) => {
    setExporting(target)
    try {
      const { blob, filename } = target === 'db'
        ? await exportDatabase()
        : await exportZones({ format: target })
      triggerBlobDownload(blob, filename)
      showSuccess(`Saved ${filename}`, target === 'db' ? 'Database exported' : 'Records exported')
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : 'Unable to export.'
      showError(message, 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const selectFile = (next) => {
    if (!next) return
    setFile(next)
    setImportError('')
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    selectFile(event.dataTransfer.files?.[0])
  }

  const handleImport = async () => {
    if (!file) return
    setImporting(true)
    setImportError('')
    try {
      await importZones({ file })
      showSuccess('Zones imported successfully.', 'Import complete')
      await modal.data?.onSuccess?.()
      modal.close()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import zones.'
      setImportError(message)
      showError(message, 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      isOpen={modal.isOpen}
      onClose={modal.close}
      title="Import & Export"
      subtitle="Download records or a full backup, or bulk-create zones from a file."
      size="xxl"
    >
      <div className="grid gap-6 md:grid-cols-2 md:divide-x md:divide-border">
        {/* Export */}
        <section className="space-y-4 md:pr-6">
          <PaneHeading icon="download" title="Export" />
          <p className="text-xs leading-5 text-on-surface-variant">
            Records export as a spreadsheet (no keys or rules). The full database is a
            restorable binary snapshot — use it for replication and disaster recovery.
          </p>
          <div className="space-y-2">
            {EXPORT_ACTIONS.map((action) => (
              <button
                key={action.target}
                type="button"
                disabled={Boolean(exporting)}
                onClick={() => handleExport(action.target)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-container-lowest px-3.5 py-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-container-low/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[20px] text-on-surface-variant ${
                  exporting === action.target ? 'animate-spin' : ''
                }`}
                >
                  {exporting === action.target ? 'progress_activity' : action.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-on-surface">{action.title}</span>
                  <span className="block text-xs text-on-surface-variant">{action.desc}</span>
                </span>
                <span className="material-symbols-outlined text-[18px] text-outline">download</span>
              </button>
            ))}
          </div>
        </section>

        {/* Import */}
        <section className="space-y-4 md:pl-6">
          <PaneHeading icon="upload" title="Import" />

          {importError && <Alert title="Unable to import">{importError}</Alert>}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragging
                ? 'border-primary bg-primary/[0.04]'
                : 'border-outline-variant/50 hover:border-primary/40 hover:bg-surface-container-lowest/60'
            }`}
          >
            <span className="material-symbols-outlined text-3xl text-on-surface-variant">
              {file ? 'description' : 'upload_file'}
            </span>
            {file ? (
              <>
                <span className="text-sm font-semibold text-on-surface">{file.name}</span>
                <span className="text-xs text-on-surface-variant">
                  {formatBytes(file.size)} · will import as {format === 'xlsx' ? 'Excel' : 'CSV'}
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold text-on-surface">
                  Drop a file here, or click to browse
                </span>
                <span className="text-xs text-on-surface-variant">CSV or Excel (.csv, .xlsx)</span>
              </>
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />

          <p className="text-xs leading-5 text-on-surface-variant">
            Use a file in the same layout as a records export. Importing adds zones and
            records in bulk — it does not delete anything already present.
          </p>

          <Button
            type="button"
            onClick={handleImport}
            disabled={!file || importing}
            className="w-full"
          >
            {importing ? 'Importing…' : 'Import file'}
          </Button>
        </section>
      </div>
    </Modal>
  )
}
