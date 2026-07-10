import { useState, useEffect, useMemo } from 'react'
import { ProjectStatus, Member } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { roleRank, RANK_MANAGER } from '../roles'
import { useItems } from '../hooks/useItems'
import { useProjectMembersByProject } from '../hooks/useProjectMembers'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeyFactory } from '../hooks/queryKeyFactory'

const STATUS_OPTIONS = ['Yet to start', 'On-going', 'On-hold', 'Dispatched', 'Closed']
const FACTOR: Record<string, number> = { 'Done': 1, 'In Progress': 0.5, 'Not Started': 0 }

// Map legacy stage values onto the new options so old projects pre-select correctly.
const LEGACY_STAGE: Record<string, string> = {
  'On Hold': 'On-hold', Planning: 'On-going', Design: 'On-going', Construction: 'On-going',
  Completed: 'Closed', Resolved: 'Closed'
}
function normalizeStage(s: string): string {
  return STATUS_OPTIONS.includes(s) ? s : (LEGACY_STAGE[s] ?? 'On-going')
}

interface Props {
  projectId: number
  onToast: (msg: string, type?: 'success' | 'error') => void
}

export default function StatusTab({ projectId, onToast }: Props) {
  const { isLead, members: allMembers } = useApp() // project status is project setup: Team Lead+ may edit; others view only

  const queryClient = useQueryClient()
  const { refreshStatuses, refreshTasks } = useData()
  const { data: statusRows = [] } = useItems('status', projectId) as { data: any[] }

  const { data: tasks = [] } = useItems('task', projectId) as { data: any[] }

  const { data: feedback = [] } = useItems('feedback', projectId)

  const { data: assignedLinks = [] } = useProjectMembersByProject(projectId)

  const members = useMemo(() => {
    const ids = new Set(assignedLinks.map((l) => l.member_id))
    return (allMembers as Member[]).filter((m) => ids.has(m.id))
  }, [assignedLinks, allMembers])

  const [status, setStatus] = useState<ProjectStatus | null>(null)
  const [overall, setOverall] = useState('On-going')
  const [notes, setNotes] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if ((statusRows as ProjectStatus[]).length > 0) {
      const s = (statusRows as ProjectStatus[])[0]
      setStatus(s); setOverall(normalizeStage(s.overall)); setNotes(s.notes)
    } else {
      setStatus(null); setOverall('On-going'); setNotes('')
    }
    setDirty(false)
  }, [statusRows])

  // A project can only be Closed once every assigned member has feedback — EXCEPT
  // Managers and above, whose feedback is not required to close a project.
  const missingFeedback = useMemo(
    () => members.filter((m) => roleRank((m as any).role) < RANK_MANAGER && !feedback.some((f) => String(f.member_id) === String((m as any).id))),
    [members, feedback]

  )






  const handleSave = async () => {
    if (overall === 'Closed' && missingFeedback.length > 0) {
      onToast(`Can't close: feedback missing for ${missingFeedback.map((m) => m.name).join(', ')}`, 'error')
      return
    }
    await window.api.items.create('status', { project_id: projectId, overall, notes })
    onToast('Status saved')
    setDirty(false)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.items.byProject('status', projectId) }),
      refreshStatuses(),
      refreshTasks()
    ])
  }

  // weighted % from tasks
  const totalWeight = tasks.reduce((s, t) => s + (parseFloat(String(t.weight)) || 1), 0)
  const earned = tasks.reduce((s, t) => s + (parseFloat(String(t.weight)) || 1) * (FACTOR[String(t.status)] ?? 0), 0)
  const pct = totalWeight ? Math.round((earned / totalWeight) * 100) : 0
  const counts = {
    done: tasks.filter((t) => t.status === 'Done').length,
    progress: tasks.filter((t) => t.status === 'In Progress').length,
    todo: tasks.filter((t) => t.status === 'Not Started').length
  }

  return (
    <div className="tab-content">
      <div className="status-form">
        <h3>Progress</h3>
        {tasks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
            No tasks yet — add tasks in the <strong>Tasks</strong> tab to track % completion automatically.
          </p>
        ) : (
          <div className="progress-block">
            <div className="progress-top">
              <span className="progress-pct">{pct}%</span>
              <span className="progress-sub">
                {counts.done} done · {counts.progress} in progress · {counts.todo} not started
              </span>
            </div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          </div>
        )}

        <h3 style={{ marginTop: 28 }}>Project Status</h3>
        {status?.last_updated && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Last updated: {status.last_updated}</p>
        )}
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Overall Stage</label>
          <select value={overall} onChange={(e) => { setOverall(e.target.value); setDirty(true) }} disabled={!isLead}>
            {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true) }} rows={4} disabled={!isLead} />
        </div>
        {overall === 'Closed' && missingFeedback.length > 0 && (
          <p className="attach-hint" style={{ color: 'var(--danger)' }}>
            ⚠ Feedback is required before closing for every member below Manager. Missing for: <strong>{missingFeedback.map((m) => m.name).join(', ')}</strong>.
          </p>
        )}
        {isLead ? (
          <div className="actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || (overall === 'Closed' && missingFeedback.length > 0)} style={{ opacity: (dirty && !(overall === 'Closed' && missingFeedback.length > 0)) ? 1 : 0.5 }}>
              Save Status
            </button>
          </div>
        ) : (
          <p className="attach-hint">Only Team Leads and Managers can change the project status.</p>
        )}
      </div>
    </div>
  )
}
