import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Member } from '../types'
import { ROLES, roleLabel, roleRank } from '../roles'
import { DISCIPLINES } from '../disciplines'
import Avatar from './Avatar'
import Icon from './Icon'

interface Props {
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}

export default function MembersModal({ onClose, onToast }: Props) {
  const { members, refreshMembers, isCompanyAdmin } = useApp()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Employee')
  const [discipline, setDiscipline] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [showLeft, setShowLeft] = useState(false)

  const leftCount = members.filter((m) => m.status === 'left').length
  const shown = members.filter((m) => showLeft || m.status !== 'left')

  const reset = () => { setName(''); setEmail(''); setRole('Employee'); setDiscipline(''); setEditId(null) }

  const submit = async () => {
    if (!name.trim()) { onToast('Name is required', 'error'); return }
    if (editId) {
      await window.api.members.update({ id: editId, name, email, role, discipline })
      onToast('Member updated')
    } else {
      await window.api.members.create({ name, email, role, discipline })
      onToast('Member added')
    }
    reset()
    refreshMembers()
  }

  const edit = (m: Member) => { setEditId(m.id); setName(m.name); setEmail(m.email); setRole(m.role); setDiscipline(m.discipline || '') }

  const remove = async (m: Member) => {
    if (!confirm(`Remove ${m.name} from the directory?`)) return
    await window.api.members.delete(m.id)
    onToast('Member removed')
    if (editId === m.id) reset()
    refreshMembers()
  }

  const exportCsv = async () => {
    const rows = shown.map((m) => ({
      name: m.name, email: m.email, role: m.role, discipline: m.discipline || '',
      status: m.status || 'active', left_date: m.left_date || ''
    }))
    if (!rows.length) { onToast('Nothing to export', 'error'); return }
    const res = await window.api.csv.export('members', 'members', rows)
    if (res.ok && res.data?.filePath) onToast('Members exported')
  }

  const toggleActive = async (m: Member) => {
    const active = m.status === 'left'
    if (!active && !confirm(`Mark ${m.name} as a departed employee? They'll be hidden from assignment lists but their history is kept.`)) return
    const res = await window.api.members.setActive(m.id, active)
    if (res.ok) { onToast(active ? `${m.name} restored` : `${m.name} marked as departed`); refreshMembers() }
    else onToast(res.error ?? 'Failed', 'error')
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 600 }}>
        <div className="modal-header">
          <h3><Icon name="users" size={18} /> Team Members</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {leftCount > 0 && (
              <button className="archive-toggle" onClick={() => setShowLeft((v) => !v)}>
                {showLeft ? '✓ ' : ''}Show departed ({leftCount})
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
              <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} title="Discipline (scopes Managers/Leads)">
                <option value="">— Discipline (any)</option>
                {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={submit}>{editId ? 'Update' : 'Add'}</button>
              {editId && <button className="btn btn-secondary btn-sm" onClick={reset}>Cancel</button>}
            </div>
          )}

          {members.length === 0 ? (
            <div className="attach-empty">No members yet. Add your team above.</div>
          ) : (
            <table className="mini-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Discipline</th>{isCompanyAdmin && <th></th>}</tr></thead>
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
                    {isCompanyAdmin && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn-icon" onClick={() => edit(m)} title="Edit"><Icon name="edit" size={16} /></button>
                        <button className="btn-icon" onClick={() => toggleActive(m)} title={m.status === 'left' ? 'Restore' : 'Mark as departed'}><Icon name={m.status === 'left' ? 'restore' : 'logout'} size={16} /></button>
                        <button className="btn-icon danger" onClick={() => remove(m)} title="Delete"><Icon name="trash" size={16} /></button>
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
    </div>
  )
}
