import React, { useState, useMemo, useEffect } from 'react'
import Icon from './Icon'

export interface Column {
  key: string
  label: string
  width?: string
  render?: (val: unknown, row: Record<string, unknown>) => React.ReactNode
}

interface Props {
  columns: Column[]
  rows: Record<string, unknown>[]
  onEdit: (row: Record<string, unknown>) => void
  onDelete: (row: Record<string, unknown>) => void
  emptyHint?: string
  canEdit?: (row: Record<string, unknown>) => boolean
  canDelete?: (row: Record<string, unknown>) => boolean
  editLabel?: string
  // Optional row selection (for "export selected").
  selectable?: boolean
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  onToggleAll?: (ids: number[], select: boolean) => void
  // Optional controlled sort: when onHeaderSort is supplied the parent owns the
  // sort (rows arrive pre-sorted, e.g. from useFilters) and header clicks call
  // back instead of re-sorting locally — keeping the Sort-by menu in sync.
  sortKey?: string | null
  sortDir?: 'asc' | 'desc'
  onHeaderSort?: (key: string) => void
  // Rows per page (default 25). Pager is hidden when everything fits on one page.
  pageSize?: number
}

// Windowed page-number list with '…' gaps, e.g. [1, '…', 4, 5, 6, '…', 20].
function pageWindow(current: number, total: number): (number | '…')[] {
  const out: (number | '…')[] = []
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - current) <= 1) out.push(i)
    else if (out[out.length - 1] !== '…') out.push('…')
  }
  return out
}

function statusBadge(val: string): React.ReactNode {
  if (!val) return <span style={{ color: 'var(--text-dim)' }}>—</span>
  const key = val.toLowerCase().replace(/\s+/g, '-')
  return <span className={`badge badge-${key}`}>{val}</span>
}

const STATUS_KEYS = new Set(['status', 'result', 'overall'])

export default function DataTable({ columns, rows, onEdit, onDelete, emptyHint, canEdit, canDelete, editLabel, selectable, selectedIds, onToggleSelect, onToggleAll, sortKey: ctrlKey, sortDir: ctrlDir, onHeaderSort, pageSize = 25 }: Props) {
  const controlled = !!onHeaderSort
  const [localKey, setLocalKey] = useState<string | null>(null)
  const [localDir, setLocalDir] = useState<'asc' | 'desc'>('asc')
  const sortKey = controlled ? (ctrlKey || null) : localKey
  const sortDir = controlled ? (ctrlDir ?? 'asc') : localDir

  const sorted = useMemo(() => {
    // In controlled mode the parent already sorted the rows.
    if (controlled || !sortKey) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = String(a[sortKey] ?? '').toLowerCase()
      const bv = String(b[sortKey] ?? '').toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [rows, sortKey, sortDir, controlled])

  const toggleSort = (key: string): void => {
    if (controlled) { onHeaderSort?.(key); return }
    if (sortKey === key) setLocalDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setLocalKey(key); setLocalDir('asc') }
  }

  // Reset to page 1 whenever the result set size changes (new search/filter),
  // so filtering never leaves the view stuck on a now-empty page.
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [rows.length])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  if (!rows.length) {
    return (
      <div className="empty-table">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
        </svg>
        <p>{emptyHint || 'No records yet. Click “Add” to create one.'}</p>
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  title="Select all on this page"
                  checked={pageRows.length > 0 && pageRows.every((r) => selectedIds?.has(r.id as number))}
                  onChange={(e) => onToggleAll?.(pageRows.map((r) => r.id as number), e.target.checked)}
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className="sortable"
                onClick={() => toggleSort(c.key)}
              >
                <span className="th-inner">
                  {c.label}
                  <span className={`sort-arrow${sortKey === c.key ? ' active' : ''}`}>
                    <Icon name="chevronDown" size={11} style={sortKey === c.key && sortDir === 'asc' ? { transform: 'rotate(180deg)' } : undefined} />
                  </span>
                </span>
              </th>
            ))}
            <th style={{ width: 90 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => {
            const by = String(row.updated_by ?? row.created_by ?? '')
            const at = String(row.updated_at ?? row.created_at ?? '').slice(0, 16).replace('T', ' ')
            const audit = by || at ? `Last edited${by ? ` by ${by}` : ''}${at ? ` · ${at}` : ''}` : undefined
            return (
            <tr key={row.id as number} title={audit}>
              {selectable && (
                <td>
                  <input type="checkbox" checked={!!selectedIds?.has(row.id as number)} onChange={() => onToggleSelect?.(row.id as number)} />
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key}>
                  {c.render
                    ? c.render(row[c.key], row)
                    : STATUS_KEYS.has(c.key)
                    ? statusBadge(String(row[c.key] ?? ''))
                    : String(row[c.key] ?? '') || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                </td>
              ))}
              <td>
                <div className="td-actions">
                  {(!canEdit || canEdit(row)) && (
                    <button className="btn-icon" title={editLabel || 'Edit'} onClick={() => onEdit(row)}>
                      <Icon name="edit" size={15} />
                    </button>
                  )}
                  {(!canDelete || canDelete(row)) && (
                    <button className="btn-icon danger" title="Delete" onClick={() => onDelete(row)}>
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                  {canEdit && !canEdit(row) && (!canDelete || !canDelete(row)) && (
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                  )}
                </div>
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.length > pageSize && (
        <div className="table-pager">
          <span className="pager-info">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="pager-controls">
            <button className="btn-icon" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} title="Previous page">
              <Icon name="chevronLeft" size={16} />
            </button>
            {pageWindow(currentPage, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="pager-ellipsis">…</span>
              ) : (
                <button key={p} className={`pager-num${p === currentPage ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              )
            )}
            <button className="btn-icon" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} title="Next page">
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
