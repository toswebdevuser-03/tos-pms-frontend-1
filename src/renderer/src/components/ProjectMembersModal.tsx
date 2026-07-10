import { useState, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { Member, Project } from '../types'
import { roleLabel } from '../roles'
import { splitDisciplines } from '../disciplines'
import Icon from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'
import { useData } from '../context/DataContext'
import { useProjectMembersByProject } from '../hooks/useProjectMembers'

interface Props {
  projectId: number
  projectName: string
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
  // Optional: when provided, the picker shows each candidate's availability
  // (open tasks across these projects) and ranks best-fit (discipline match) first.
  projects?: Project[]
  projectDiscipline?: string
}

export default function ProjectMembersModal({ projectId, projectName, onClose, onToast, projects, projectDiscipline }: Props) {
  useEscapeKey(onClose)
  const { members, isLead } = useApp()
  const { tasks, refreshProjectMembers } = useData()
  const { data: assignedMembers = [], refetch: refetchAssigned } = useProjectMembersByProject(projectId)
  const assigned = useMemo(() => assignedMembers.map((m) => m.member_id), [assignedMembers])
  const [query, setQuery] = useState('')

  // Availability = open (not Done) tasks assigned to each member across all projects.
  const openByMember = useMemo(() => {
    const projectSet = new Set((projects ?? []).map((p) => Number(p.id)))
    const counts = new Map<string, number>()
    for (const t of tasks) {
      if (projects && projects.length > 0 && !projectSet.has(Number(t.project_id))) continue
      const mid = String(t.assigned_member_id ?? '')
      if (mid && t.status !== 'Done') counts.set(mid, (counts.get(mid) ?? 0) + 1)
    }
    return counts
  }, [tasks, projects])

  const projDisc = useMemo(() => splitDisciplines(projectDiscipline ?? ''), [projectDiscipline])
  const fitOf = useCallback((m: Member): boolean => {
    if (projDisc.length === 0) return false
    return splitDisciplines(m.discipline ?? '').some((d) => projDisc.includes(d))
  }, [projDisc])
  const openOf = useCallback((m: Member): number => openByMember.get(String(m.id)) ?? 0, [openByMember])

  // Active members + any departed member still assigned (so they can be removed).
  const selectable = members.filter((m) => m.status !== 'left' || assigned.includes(m.id))

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = !q ? selectable : selectable.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      (m.email ?? '').toLowerCase().includes(q) ||
      roleLabel(m.role).toLowerCase().includes(q)
    )
    // Rank: discipline-fit first, then most available (fewest open tasks), then name.
    return [...filtered].sort((a, b) => {
      const fa = fitOf(a) ? 1 : 0, fb = fitOf(b) ? 1 : 0
      if (fa !== fb) return fb - fa
      const oa = openOf(a), ob = openOf(b)
      if (oa !== ob) return oa - ob
      return a.name.localeCompare(b.name)
    })
  }, [selectable, query, fitOf, openOf])

  const toggle = async (m: Member): Promise<void> => {
    if (!isLead) { onToast('Only Team Leads and above can change project members', 'error'); return }
    if (assigned.includes(m.id)) {
      await window.api.projectMembers.unassign(projectId, m.id)
      onToast(`${m.name} removed from project`)
    } else {
      await window.api.projectMembers.assign(projectId, m.id)
      onToast(`${m.name} added to project`)
    }
    await Promise.all([refetchAssigned(), refreshProjectMembers()])
  }

  const showAvail = !!projects && projects.length > 0

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Members on “{projectName}”</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          {members.length === 0 ? (
            <div className="attach-empty">No members in the directory yet. Add team members first.</div>
          ) : (
            <>
              <div className="search-box" style={{ marginBottom: 10 }}>
                <Icon name="search" size={15} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search members by name, email or role…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {showAvail && <p className="attach-hint" style={{ marginTop: 0 }}>Ranked by best fit — discipline match first, then who’s most available (fewest open tasks).</p>}
              <div className="assign-list">
                {shown.length === 0 ? (
                  <div className="attach-empty">No members match “{query}”.</div>
                ) : shown.map((m) => (
                  <label key={m.id} className={`assign-row${m.status === 'left' ? ' row-left' : ''}`}>
                    <input
                      type="checkbox"
                      checked={assigned.includes(m.id)}
                      onChange={() => toggle(m)}
                      disabled={!isLead}
                    />
                    <span className="assign-name">{m.name}{m.status === 'left' && ' (departed)'}</span>
                    <span className="badge badge-not-started">{roleLabel(m.role)}</span>
                    {fitOf(m) && <span className="badge badge-on-going" title="Discipline matches this project">fit</span>}
                    {showAvail && <span className={`workload-pill${openOf(m) === 0 ? ' free' : ''}`} title="open tasks across projects">{openOf(m)} open</span>}
                    {m.email && <span className="assign-email">{m.email}</span>}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
