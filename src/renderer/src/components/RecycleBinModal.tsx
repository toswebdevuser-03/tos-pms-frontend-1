import { useState, useEffect, useCallback } from 'react'
import { Project, ToastFn } from '../types'
import { useApp } from '../context/AppContext'
import { useFilters } from './FilterBar'
import Icon from './Icon'
import ConfirmDialog from './ConfirmDialog'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  onClose: () => void
  onToast: ToastFn
  onChanged?: () => void
}

const RETENTION_DAYS = 15
const daysLeft = (deletedAt?: string): number => {
  if (!deletedAt) return RETENTION_DAYS
  const t = new Date(deletedAt).getTime()
  if (isNaN(t)) return RETENTION_DAYS
  return Math.max(0, Math.ceil(RETENTION_DAYS - (Date.now() - t) / 86400000))
}

// Recycle bin: soft-deleted projects, restorable for 15 days before auto-purge.
export default function RecycleBinModal({ onClose, onToast, onChanged }: Props) {
  useEscapeKey(onClose)
  const { isCompanyAdmin } = useApp()
  const [rows, setRows] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmPurge, setConfirmPurge] = useState<Project | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.api.projects.deleted()
    if (res.ok) setRows(res.data as Project[])
    else onToast(res.error ?? 'Could not load the recycle bin', 'error')
    setLoading(false)
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])


  const restore = async (p: Project): Promise<void> => {
    const res = await window.api.projects.restore(p.id)
    if (res.ok) { onToast(`Restored “${p.name}”`); load(); onChanged?.() }
    else onToast(res.error ?? 'Restore failed', 'error')
  }
  const purge = async (p: Project): Promise<void> => {
    const res = await window.api.projects.purge(p.id)
    if (res.ok) { onToast(`Permanently deleted “${p.name}”`); load() }
    else onToast(res.error ?? 'Delete failed', 'error')
  }

  const { filtered, bar } = useFilters(rows as unknown as Record<string, unknown>[], {
    searchKeys: ['name', 'client', 'discipline'],
    searchPlaceholder: 'Search deleted projects…'
  })
  const shown = filtered as unknown as Project[]

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 980 }}>
        <div className="modal-header">
          <h3><Icon name="trash" size={18} /> Recycle bin</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="attach-hint">Deleted projects are kept for {RETENTION_DAYS} days, then permanently removed. Restore one to bring back all its data (tasks, RFIs, timesheets, scope…).</p>
          {loading ? (
            <div className="attach-empty">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="attach-empty">Recycle bin is empty.</div>
          ) : (
            <>
              {bar}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Project</th><th>Client</th><th>Discipline</th><th>Deleted</th><th>Time left</th><th></th></tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => {
                      const left = daysLeft(p.deleted_at)
                      return (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{p.client || '—'}</td>
                          <td>{p.discipline || '—'}</td>
                          <td>{p.deleted_at ? new Date(p.deleted_at).toLocaleString() : '—'}</td>
                          <td><span className={`badge ${left <= 3 ? 'badge-pending' : 'badge-resolved'}`}>{left} day{left === 1 ? '' : 's'}</span></td>
                          <td className="quote-row-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => restore(p)}><Icon name="restore" size={14} /> Restore</button>
                            {isCompanyAdmin && <button className="btn-icon danger" title="Delete permanently" onClick={() => setConfirmPurge(p)}><Icon name="trash" size={16} /></button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {confirmPurge && (
        <ConfirmDialog
          title="Delete permanently"
          message={`Permanently delete "${confirmPurge.name}" and ALL its data? This cannot be undone.`}
          onConfirm={() => { const p = confirmPurge; setConfirmPurge(null); purge(p) }}
          onCancel={() => setConfirmPurge(null)}
        />
      )}
    </div>
  )
}
