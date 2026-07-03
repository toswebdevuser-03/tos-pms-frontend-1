import { useState, useEffect, useCallback } from 'react'
import { Project, Member } from '../types'
import { useApp } from '../context/AppContext'
import { nameById, activeMembers } from '../lib/people'
import Icon, { DisciplineIcon } from './Icon'
import Avatar from './Avatar'
import EmptyState from './EmptyState'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  projects: Project[]
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}

export default function StaffingModal({ projects, onClose, onToast }: Props) {
  useEscapeKey(onClose)
  const { members, isLead } = useApp()
  const [byProject, setByProject] = useState<Record<number, number[]>>({})
  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)
  const [rosterQuery, setRosterQuery] = useState('')

  const allRoster = activeMembers(members)
  const rq = rosterQuery.trim().toLowerCase()
  const roster = !rq ? allRoster : allRoster.filter((m) => m.name.toLowerCase().includes(rq))

  const load = useCallback(async () => {
    const map: Record<number, number[]> = {}
    await Promise.all(projects.map(async (p) => {
      const res = await window.api.projectMembers.get(p.id)
      if (res.ok) map[p.id] = (res.data as Member[]).map((m) => m.id)
    }))
    setByProject(map)
  }, [projects])
  useEffect(() => { load() }, [load])

  const assign = async (projectId: number, memberId: number): Promise<void> => {
    if (!isLead) { onToast('Only Team Leads and above can staff projects', 'error'); return }
    if ((byProject[projectId] ?? []).includes(memberId)) return
    const res = await window.api.projectMembers.assign(projectId, memberId)
    if (res.ok) { onToast(`${nameById(members, memberId, 'Member')} added`); load() }
    else onToast(res.error ?? 'Assign failed', 'error')
  }
  const unassign = async (projectId: number, memberId: number): Promise<void> => {
    const res = await window.api.projectMembers.unassign(projectId, memberId)
    if (res.ok) { onToast('Removed from project'); load() }
    else onToast(res.error ?? 'Failed', 'error')
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 920, maxWidth: '95vw' }}>
        <div className="modal-header">
          <h3><Icon name="userPlus" size={18} /> Staffing — drag people onto projects</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          {projects.length === 0 ? (
            <EmptyState icon="folder" title="No projects to staff yet" hint="Create a project first, then drag team members onto it here." />
          ) : (
          <div className="staff-layout">
            <div className="staff-roster">
              <div className="staff-col-head">Team ({roster.length})</div>
              <div className="search-box" style={{ marginBottom: 8 }}>
                <Icon name="search" size={14} />
                <input
                  type="text"
                  placeholder="Search team…"
                  value={rosterQuery}
                  onChange={(e) => setRosterQuery(e.target.value)}
                />
              </div>
              {roster.map((m) => (
                <div
                  key={m.id}
                  className={`staff-person${dragId === m.id ? ' dragging' : ''}`}
                  draggable={isLead}
                  onDragStart={() => setDragId(m.id)}
                  onDragEnd={() => { setDragId(null); setOverId(null) }}
                >
                  <Avatar name={m.name} size={26} />
                  <span className="staff-person-name">{m.name}</span>
                  <span className="staff-person-role">{m.discipline || m.role}</span>
                </div>
              ))}
              {roster.length === 0 && <div className="attach-empty">{rq ? `No members match "${rosterQuery}".` : 'No active members.'}</div>}
            </div>

            <div className="staff-projects">
              <div className="staff-col-head">Projects ({projects.length})</div>
              {projects.map((p) => {
                const ids = byProject[p.id] ?? []
                return (
                  <div
                    key={p.id}
                    className={`staff-project${overId === p.id ? ' drop-over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setOverId(p.id) }}
                    onDragLeave={() => setOverId((cur) => (cur === p.id ? null : cur))}
                    onDrop={(e) => { e.preventDefault(); setOverId(null); if (dragId != null) assign(p.id, dragId); setDragId(null) }}
                  >
                    <div className="staff-project-head">
                      <span className="staff-proj-icon"><DisciplineIcon discipline={p.discipline} size={16} /></span>
                      <strong>{p.name}</strong>
                      {p.discipline && <span className="badge badge-design">{p.discipline}</span>}
                      <span className="staff-count">{ids.length}</span>
                    </div>
                    <div className="staff-chips">
                      {ids.length === 0
                        ? <span className="staff-empty">Drop a person here</span>
                        : ids.map((id) => (
                          <span key={id} className="staff-chip" title="Click to remove" onClick={() => unassign(p.id, id)}>
                            {nameById(members, id, '—')}<span className="alloc-x"><Icon name="close" size={10} /></span>
                          </span>
                        ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          )}
          {projects.length > 0 && <p className="attach-hint">Drag a team member onto a project to assign them. Click a name chip to remove. Departed staff are hidden.</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
