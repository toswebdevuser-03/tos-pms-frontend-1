import { useMemo } from 'react'
import CrudTab from '../components/CrudTab'
import { Column } from '../components/DataTable'
import { FieldDef } from '../components/FormModal'

import { useApp } from '../context/AppContext'
import { memberNameMap } from '../lib/people'
import { useProjectMembersByProject } from '../hooks/useProjectMembers'

interface Props {
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
}

// Merged Dispatch + WIP: schedule each deliverable for dispatch (date + assignee);
// a reminder appears in the Inbox as the scheduled date approaches/passes.
const STATUS = ['Scheduled', 'In Progress', 'Dispatched', 'Acknowledged', 'Hold']

export default function DispatchTab({ projectId, projectName, onToast }: Props) {
  const { isLead, members: allMembers } = useApp() // project-setup section: Team Lead+ only
  const { data: assignedLinks = [] } = useProjectMembersByProject(projectId)

  const members = useMemo(() => {
    const ids = new Set(assignedLinks.map((l) => l.member_id))
    return allMembers.filter((m) => ids.has(m.id))
  }, [allMembers, assignedLinks])


  const nameById = useMemo(() => memberNameMap(members), [members])

  const columns: Column[] = [
    { key: 'dispatch_number', label: 'Ref', width: '90px' },
    { key: 'description', label: 'Item / deliverable' },
    {
      key: 'assigned_member_id', label: 'Assignee', width: '140px',
      render: (v, row) => (v ? (nameById.get(String(v)) || '—') : (row.recipient ? String(row.recipient) : '—'))
    },
    { key: 'dispatch_date', label: 'Scheduled', width: '120px' },
    { key: 'status', label: 'Status', width: '120px' }
  ]

  const fields: FieldDef[] = [
    { key: 'dispatch_number', label: 'Reference (optional)' },
    { key: 'description', label: 'Item / deliverable', type: 'textarea', required: true },
    {
      key: 'assigned_member_id', label: 'Assignee', type: 'select',
      optionValues: [{ label: '— Unassigned', value: '' }, ...members.map((m) => ({ label: m.name, value: String(m.id) }))]
    },
    { key: 'recipient', label: 'Recipient (client)' },
    { key: 'dispatch_date', label: 'Scheduled dispatch date', type: 'date', required: true },
    { key: 'status', label: 'Status', type: 'select', options: STATUS }
  ]

  return (
    <CrudTab
      type="dispatch" singular="Dispatch" projectId={projectId} projectName={projectName}
      columns={columns} fields={fields} onToast={onToast}
      addAllowed={isLead} canEditRow={() => isLead} canDeleteRow={() => isLead}
      emptyHint="No dispatches scheduled yet. Add a deliverable with its scheduled date and assignee — a reminder appears in the Inbox as the date approaches."
    />
  )
}
