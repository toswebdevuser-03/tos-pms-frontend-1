import { useMemo } from 'react'
import CrudTab from '../components/CrudTab'
import { Column } from '../components/DataTable'
import { FieldDef } from '../components/FormModal'
import Icon from '../components/Icon'

import { useApp } from '../context/AppContext'
import { memberNameMap } from '../lib/people'
import { useProjectMembersByProject } from '../hooks/useProjectMembers'

interface Props {
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
}

// QA/QC is a folder-path record (like Input) that can be ASSIGNED to a member like
// a task. The assignee times the QA/QC work in the Task Timer; that time is logged
// as CORRECTION hours on the timesheet.
const RESULTS = ['Pending', 'In Progress', 'Pass', 'Fail']

export default function QCTab({ projectId, projectName, onToast }: Props) {
  const { isLead, members: allMembers } = useApp()
  const { data: assignedLinks = [] } = useProjectMembersByProject(projectId)

  const members = useMemo(() => {
    const ids = new Set(assignedLinks.map((l) => l.member_id))
    return allMembers.filter((m) => ids.has(m.id))
  }, [allMembers, assignedLinks])


  const nameById = useMemo(() => memberNameMap(members), [members])
  const copyPath = async (p: string): Promise<void> => {
    try { await navigator.clipboard.writeText(p); onToast('Path copied — paste it into Explorer') } catch { onToast('Could not copy path', 'error') }
  }
  // Assignees: new entries store a comma-list in `assigned_member_ids`; fall back to
  // the legacy single `assigned_member_id`.
  const assigneeNames = (row: Record<string, unknown>): string => {
    const ids = String(row.assigned_member_ids ?? row.assigned_member_id ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return ids.length ? ids.map((id) => nameById.get(id) || '—').join(', ') : '—'
  }

  const columns: Column[] = [
    { key: 'checklist_item', label: 'Title / Area' },
    {
      key: 'path', label: 'Folder path',
      render: (v) => v ? (
        <div className="path-cell"><span className="path-text" title={String(v)}>{String(v)}</span>
          <button className="btn-icon" title="Copy path" onClick={(e) => { e.stopPropagation(); copyPath(String(v)) }}><Icon name="clipboard" size={15} /></button>
        </div>
      ) : <span style={{ color: 'var(--text-dim)' }}>No path set</span>
    },
    { key: 'assigned_member_ids', label: 'Assignees', width: '180px', render: (_v, row) => assigneeNames(row) },
    { key: 'result', label: 'Status', width: '110px', render: (v) => <span className={`badge badge-${String(v || 'pending').toLowerCase().replace(/\s+/g, '-')}`}>{String(v || 'Pending')}</span> },
    { key: 'inspection_date', label: 'Date', width: '110px' }
  ]

  const fields: FieldDef[] = [
    { key: 'checklist_item', label: 'Title / Area', required: true },
    { key: 'path', label: 'Folder Path', type: 'path' },
    { key: 'assigned_member_ids', label: 'Assignees (one or more)', type: 'multiselect', optionValues: members.map((m) => ({ label: m.name, value: String(m.id) })) },
    { key: 'result', label: 'Status', type: 'select', options: RESULTS },
    { key: 'inspection_date', label: 'Date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]

  return (
    <CrudTab
      type="qc" singular="QA/QC Item" projectId={projectId} projectName={projectName}
      columns={columns} fields={fields} onToast={onToast}
      addAllowed={isLead} canEditRow={() => isLead} canDeleteRow={() => isLead}
      headerExtra={<p className="attach-hint">QA/QC items hold the folder path and can be assigned to <strong>one or more members</strong>. An assignee times QA/QC work in the floating <strong>Task Timer</strong> — that time is logged as <strong>Correction</strong> hours.</p>}
      emptyHint="No QA/QC items yet. Add one with its folder path and assign it to one or more members."
    />
  )
}
