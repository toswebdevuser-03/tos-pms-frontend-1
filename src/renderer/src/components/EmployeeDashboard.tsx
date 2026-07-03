import { useMemo } from 'react'
import { Member } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { roleLabel } from '../roles'
import { scopeProjectsFor } from '../lib/projectScope'
import HomeDashboard from './HomeDashboard'
import Icon from './Icon'

interface Props {
  member: Member
  onSelect: (id: number) => void
  onBack: () => void
}

// Read-only "view as" of a lower-ranked member's Home Dashboard: the same dashboard
// the member sees, scoped to the projects THEY can see. Opened by a higher role from
// the Members list.
export default function EmployeeDashboard({ member, onSelect, onBack }: Props) {
  const { members } = useApp()
  const { projects, statusMap, projectMembers } = useData()

  const assigned = useMemo(
    () => new Set(projectMembers.filter((l) => l.member_id === member.id).map((l) => l.project_id)),
    [projectMembers, member.id]
  )
  const theirProjects = useMemo(
    () => scopeProjectsFor(
      { role: member.role, discipline: member.discipline, name: member.name },
      projects.filter((p) => !p.archived),
      assigned
    ),
    [projects, assigned, member]
  )
  const scopeIds = useMemo(() => theirProjects.map((p) => p.id), [theirProjects])
  const firstName = member.name.split(' ')[0]

  return (
    <div className="emp-dash-view">
      <div className="emp-dash-banner">
        <button className="btn btn-secondary btn-sm" onClick={onBack}><Icon name="arrowLeft" size={14} /> Back</button>
        <span className="emp-dash-title"><Icon name="user" size={15} /> Viewing <strong>{member.name}</strong>’s dashboard</span>
        <span className="role-chip">{roleLabel(member.role)}</span>
        <span className="emp-dash-hint">Read-only · scoped to {firstName}’s projects</span>
      </div>
      {theirProjects.length === 0 ? (
        <div className="empty-table" style={{ marginTop: 24 }}>
          <p>{member.name} has no projects assigned yet.</p>
        </div>
      ) : (
        <HomeDashboard
          projects={theirProjects}
          statusMap={statusMap}
          members={members}
          isManager={false}
          canQuote={false}
          onSelect={onSelect}
          onQuote={() => { /* read-only view */ }}
          scopeIds={scopeIds}
        />
      )}
    </div>
  )
}
