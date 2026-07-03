import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Member } from '../types'
import { ROLES, roleLabel, roleRank, RANK_EMPLOYEE } from '../roles'
import { DISCIPLINES } from '../disciplines'
import Avatar from './Avatar'
import Icon from './Icon'
import ConfirmDialog from './ConfirmDialog'
import { useFilters } from './FilterBar'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
  onViewDashboard?: (m: Member) => void
}

export default function MembersModal({ onClose, onToast, onViewDashboard }: Props) {
  useEscapeKey(onClose)
  const { members, refreshMembers, isCompanyAdmin, currentMember, authMode, authUser } = useApp()
  // A higher role may open the dashboard of any STRICTLY lower-ranked member.
  const myRank = isCompanyAdmin ? 99 : roleRank(authMode === 'remote' ? authUser?.role : currentMember?.role)
  const canViewAny = !!onViewDashboard && myRank > RANK_EMPLOYEE
  const canViewMember = (m: Member): boolean =>
    !!onViewDashboard && m.status !== 'left' && m.id !== currentMember?.id && myRank > roleRank(m.role)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Employee')
  const [discipline, setDiscipline] = useState('')
  const [engagement, setEngagement] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null)
  const [confirmDepart, setConfirmDepart] = useState<Member | null>(null)

  const leftCount = members.filter((m) => m.status === 'left').length
  const base = members
    .filter((m) => showLeft || m.status !== 'left')
    .map((m) => ({ ...m, status: m.status ?? 'active' })) as unknown as Record<string, unknown>[]
  const { filtered, bar } = useFilters(base, {
    searchKeys: ['name', 'email'],
    searchPlaceholder: 'Search members…',
    selects: [
      { key: 'role', label: 'Role' },
      { key: 'discipline', label: 'Discipline' },
      { key: 'status', label: 'Status', options: ['active', 'left'] }
    ]
  })
  const shown = filtered as unknown as Member[]

  const reset = () => { setName(''); setEmail(''); setRole('Employee'); setDiscipline(''); setEngagement(''); setEditId(null) }

  const submit = async () => {
    if (!name.trim()) { onToast('Name is required', 'error'); return }
    if (editId) {
      await window.api.members.update({ id: editId, name, email, role, discipline, engagement })
      onToast('Member updated')
    } else {
      await window.api.members.create({ name, email, role, discipline, engagement })
      onToast('Member added')
    }
    reset()
    refreshMembers()
  }

  const edit = (m: Member) => { setEditId(m.id); setName(m.name); setEmail(m.email); setRole(m.role); setDiscipline(m.discipline || ''); setEngagement(m.engagement || '') }

  const remove = async (m: Member) => {
    await window.api.members.delete(m.id)
    onToast('Member removed')
    if (editId === m.id) reset()
    refreshMembers()
  }

  const exportCsv = async () => {
    const rows = shown.map((m) => ({
      name: m.name, email: m.email, role: m.role, discipline: m.discipline || '', engagement: m.engagement || '',
      status: m.status || 'active', left_date: m.left_date || ''
    }))
    if (!rows.length) { onToast('Nothing to export', 'error'); return }
    const res = await window.api.csv.export('members', 'members', rows)
    if (res.ok && res.data?.filePath) onToast('Members exported')
  }

  const toggleActive = async (m: Member) => {
    const active = m.status === 'left'
    const res = await window.api.members.setActive(m.id, active)
    if (res.ok) { onToast(active ? `${m.name} restored` : `${m.name} marked as departed`); refreshMembers() }
    else onToast(res.error ?? 'Failed', 'error')
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 600 }}>
        <div className="modal-header">
          <h3><Icon name="users" size={18} /> Team Members</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {leftCount > 0 && (
              <button className="archive-toggle" onClick={() => setShowLeft((v) => !v)}>
                {showLeft && <Icon name="checkCircle" size={13} />} Show departed ({leftCount})
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Icon name="download" size={14} /> CSV</button>
            <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
          </div>
        </div>
        <div className="modal-body">
          {isCompanyAdmin && (
            <div className="member-form">
              <input placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
              <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={engagement} onChange={(e) => setEngagement(e.target.value)} title="Engagement type">
                <option value="">— Engagement</option>
                <option value="Man-month">Man-month</option>
                <option value="Miscellaneous">Miscellaneous</option>
              </select>
              <div className="multiselect ms-inline" title="Discipline (any combination)">
                {DISCIPLINES.map((d) => {
                  const sel = discipline ? discipline.split(',').map((s) => s.trim()).filter(Boolean) : []
                  return (
                    <label key={d} className="ms-option">
                      <input
                        type="checkbox"
                        checked={sel.includes(d)}
                        onChange={(e) => {
                          const next = e.target.checked ? [...sel, d] : sel.filter((x) => x !== d)
                          setDiscipline(DISCIPLINES.filter((x) => next.includes(x)).join(', '))
                        }}
                      />
                      {d}
                    </label>
                  )
                })}
              </div>
              <button className="btn btn-primary btn-sm" onClick={submit}>{editId ? 'Update' : 'Add'}</button>
              {editId && <button className="btn btn-secondary btn-sm" onClick={reset}>Cancel</button>}
            </div>
          )}

          {members.length > 0 && bar}

          {members.length === 0 ? (
            <div className="attach-empty">No members yet. Add your team above.</div>
          ) : (
            <table className="mini-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Discipline</th><th>Engagement</th>{(isCompanyAdmin || canViewAny) && <th></th>}</tr></thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id} className={m.status === 'left' ? 'row-left' : undefined}>
                    <td>
                      <span className="cell-user"><Avatar name={m.name} size={28} />{m.name}
                        {m.status === 'left' && <span className="badge badge-archived" title={m.left_date ? `Left ${m.left_date}` : 'Departed'}>Left{m.left_date ? ` ${m.left_date}` : ''}</span>}
                      </span>
                    </td>
                    <td>{m.email || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                    <td><span className={`badge ${roleRank(m.role) >= 3 ? 'badge-on-going' : roleRank(m.role) === 2 ? 'badge-design' : 'badge-not-started'}`}>{roleLabel(m.role)}</span></td>
                    <td>{m.discipline || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                    <td>{m.engagement ? <span className="badge badge-design">{m.engagement}</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                    {(isCompanyAdmin || canViewAny) && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {canViewMember(m) && (
                          <button className="btn-icon" onClick={() => onViewDashboard!(m)} title={`View ${m.name.split(' ')[0]}'s dashboard`}><Icon name="barChart" size={16} /></button>
                        )}
                        {isCompanyAdmin && (
                          <>
                            <button className="btn-icon" onClick={() => edit(m)} title="Edit"><Icon name="edit" size={16} /></button>
                            <button className="btn-icon" onClick={() => (m.status === 'left' ? toggleActive(m) : setConfirmDepart(m))} title={m.status === 'left' ? 'Restore' : 'Mark as departed'}><Icon name={m.status === 'left' ? 'restore' : 'logout'} size={16} /></button>
                            <button className="btn-icon danger" onClick={() => setConfirmRemove(m)} title="Delete"><Icon name="trash" size={16} /></button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isCompanyAdmin && <div className="attach-hint">Only Company Admins can add members or set roles.</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
      {confirmRemove && (
        <ConfirmDialog
          title="Remove member"
          message={`Remove ${confirmRemove.name} from the directory?`}
          onConfirm={() => { const m = confirmRemove; setConfirmRemove(null); remove(m) }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
      {confirmDepart && (
        <ConfirmDialog
          title="Mark as departed"
          message={`Mark ${confirmDepart.name} as a departed employee? They'll be hidden from assignment lists but their history is kept.`}
          confirmLabel="Mark departed"
          onConfirm={() => { const m = confirmDepart; setConfirmDepart(null); toggleActive(m) }}
          onCancel={() => setConfirmDepart(null)}
        />
      )}
    </div>
  )
}
