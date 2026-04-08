export function Table({
  columns = [],
  rows = [],
  selectable = true,
  selectedRows = [],
  onSelectRow = () => {},
  onSelectAll = () => {},
  isAllSelected = false,
  loading = false,
  onRowClick = null,
}) {
  return (
    <div className="bg-surface-container-lowest ring-1 ring-outline-variant/15 rounded overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[800px] border-collapse text-left">
          <thead className="sticky top-0 bg-surface-dim z-10 border-b border-outline-variant/10">
            <tr className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isAllSelected && rows.length > 0}
                    onChange={onSelectAll}
                    className="w-4 h-4 rounded border-outline-variant accent-primary"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : ''} ${col.className || ''}`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-surface-container-low text-sm">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-10 text-center text-sm text-on-surface-variant"
                >
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-10 text-center text-sm text-on-surface-variant"
                >
                  No data available
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={row.id ?? idx}
                  onClick={() => onRowClick?.(row)}
                  className={`${
                    idx % 2 !== 0 ? 'bg-surface-container-low/30' : ''
                  } hover:bg-surface-bright transition-colors group ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(row.id ?? idx)}
                        onChange={(e) => {
                          e.stopPropagation()
                          onSelectRow(row.id ?? idx)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-outline-variant accent-primary"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 align-middle ${col.align === 'right' ? 'text-right' : ''} ${col.tdClass || ''}`}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
