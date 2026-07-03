import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { Project } from '../types'
import { nameById, activeMembers } from '../lib/people'
import Icon, { DisciplineIcon } from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  projects: Project[]
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
  onChanged: () => void
  embedded?: boolean // rendered inline inside the Allocation hub (no modal chrome)
}

export default function AssignmentsModal({ projects, onClose, onToast, onChanged, embedded }: Props) {
  useEscapeKey(onClose)
  const { members: allMembers } = useApp()
  const members = activeMembers(allMembers)
  const [memberId, setMemberId] = useState<number | null>(members[0]?.id ?? null)
  const [assigned, setAssigned] = useState<Set<number>>(new Set())

  const loadAssignments = useCallback(async () => {
    if (!memberId) { setAssigned(new Set()); return }
    const res = await window.api.projectMembers.all()
    if (res.ok) {
      const ids = (res.data as { project_id: number; member_id: number }[])
        .filter((r) => r.member_id === memberId)
        .map((r) => r.project_id)
      setAssigned(new Set(ids))
    }
  }, [memberId])

  useEffect(() => { loadAssignments() }, [loadAssignments])

  const toggle = async (p: Project): Promise<void> => {
    if (!memberId) return
    const name = nameById(members, memberId)
    if (assigned.has(p.id)) {
      await window.api.projectMembers.unassign(p.id, memberId)
      onToast(`Removed ${name} from “${p.name}”`)
    } else {
      await window.api.projectMembers.assign(p.id, memberId)
      onToast(`Assigned “${p.name}” to ${name}`)
    }
    await loadAssignments()
    onChanged()
  }

  const body = (
    <>
      <p className="attach-hint">
        Choose a member and tick the projects they should see. Assigned projects appear in that member’s app.
      </p>
      <div className="field">
        <label>Member</label>
        <select value={memberId ?? ''} onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : null)}>
          {members.length === 0 && <option value="">No members — add some first</option>}
          {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
        </select>
      </div>

      {memberId && (
        <div className="assign-list" style={{ marginTop: 8 }}>
          {projects.length === 0 ? (
            <div className="attach-empty">No projects yet.</div>
          ) : (
            projects.map((p) => (
              <label key={p.id} className="assign-row">
                <input type="checkbox" checked={assigned.has(p.id)} onChange={() => toggle(p)} />
                <span className="proj-icon"><DisciplineIcon discipline={p.discipline} size={15} /></span>
                <span className="assign-name">{p.name}</span>
                {p.discipline && <span className="badge badge-design">{p.discipline}</span>}
                {p.client && <span className="assign-email">{p.client}</span>}
              </label>
            ))
          )}
        </div>
      )}
    </>
  )

  if (embedded) return <div className="tab-content" style={{ padding: '4px 24px 20px', overflow: 'auto' }}>{body}</div>

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-header">
          <h3>Assign Projects to Member</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">{body}</div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
