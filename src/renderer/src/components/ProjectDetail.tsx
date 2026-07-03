import { useState, useEffect, useCallback, useMemo } from 'react'
import { Project, ProjectStatus, ToastFn, ToastAction } from '../types'
import RFITab from '../tabs/RFITab'
import DispatchTab from '../tabs/DispatchTab'
import StatusTab from '../tabs/StatusTab'
import QCTab from '../tabs/QCTab'
import TasksTab from '../tabs/TasksTab'
import TimesheetTab from '../tabs/TimesheetTab'
import StandardsTab from '../tabs/StandardsTab'
import FeedbackTab from '../tabs/FeedbackTab'
import DashboardTab from '../tabs/DashboardTab'
import PathTab from '../tabs/PathTab'
import ScopeTab from '../tabs/ScopeTab'
import FormModal, { FieldDef } from './FormModal'
import ProjectMembersModal from './ProjectMembersModal'
import ConfirmDialog from './ConfirmDialog'
import { useApp } from '../context/AppContext'
import { DISCIPLINES } from '../disciplines'
import Icon, { DisciplineIcon } from './Icon'
import { ProjectUpdate } from '../lib/projectUpdates'

const TABS = ['Dashboard', 'Scope', 'Input', 'RFI/Queries', 'Dispatch', 'Tasks', 'Status', 'QC', 'Meetings', 'Timesheet', 'Standards', 'Feedback'] as const
type Tab = (typeof TABS)[number]

// Display labels (internal tab ids stay stable for navigation/counts).
const TAB_LABEL: Partial<Record<Tab, string>> = { Dispatch: 'Dispatch/W.I.P', QC: 'QA/QC' }

const COUNT_TYPES: Record<string, string> = {
  Scope: 'scope', Input: 'input', 'RFI/Queries': 'rfi', Dispatch: 'dispatch', Tasks: 'task',
  QC: 'qc', Meetings: 'meeting', Timesheet: 'timesheet', Standards: 'standard', Feedback: 'feedback'
}

// Which tab shows the "unseen updates" pill for each update kind.
const KIND_TAB: Record<ProjectUpdate['kind'], Tab> = { task: 'Tasks', rfi: 'RFI/Queries', dispatch: 'Dispatch', status: 'Status' }

const PROJECT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Project Name', required: true },
  { key: 'client', label: 'Client' },
  { key: 'location', label: 'Location' },
  { key: 'discipline', label: 'Discipline', type: 'multiselect', options: DISCIPLINES },
  { key: 'type', label: 'Project Type', type: 'select', optionValues: [
    { label: '— Standard', value: '' },
    { label: 'Man-month', value: 'Man-month' },
    { label: 'Time-Sheet based', value: 'Time-Sheet based' },
    { label: 'Miscellaneous', value: 'Miscellaneous' }
  ] },
  { key: 'quoted_hours', label: 'Quoted Hours (budget)', type: 'number' },
  { key: 'start_date', label: 'Start Date', type: 'date' },
  { key: 'end_date', label: 'Target End Date', type: 'date' }
]

interface Props {
  project: Project
  onUpdate: () => void
  onDelete: () => void
  onToast: ToastFn
  onBack?: () => void
  gotoTab?: { tab: string; n: number }
  refreshKey?: number
  onOpenRecycleBin?: () => void
  updates?: ProjectUpdate[] // unseen updates across all visible projects; filtered here to this one
}

export default function ProjectDetail({ project, onUpdate, onDelete, onToast, onBack, gotoTab, refreshKey = 0, onOpenRecycleBin, updates = [] }: Props) {
  const { isAdmin, isManager } = useApp()
  const [activeTab, setActiveTab] = useState<Tab>((gotoTab?.tab as Tab) || 'Dashboard')
  const [editing, setEditing] = useState(false)
  const [managingMembers, setManagingMembers] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [overall, setOverall] = useState<string>('')

  // Per-tab unseen-update counts for this project (Tasks/RFI/Dispatch/Status), so the
  // tab bar shows where the new activity is instead of only a lump sum elsewhere.
  const newCounts = useMemo(() => {
    const m: Partial<Record<Tab, number>> = {}
    for (const u of updates) {
      if (u.projectId !== project.id) continue
      const t = KIND_TAB[u.kind]
      m[t] = (m[t] ?? 0) + 1
    }
    return m
  }, [updates, project.id])

  const loadMeta = useCallback(async () => {
    const result: Record<string, number> = {}
    await Promise.all(
      Object.entries(COUNT_TYPES).map(async ([tab, type]) => {
        const res = await window.api.items.getByProject(project.id, type)
        if (res.ok) result[tab] = (res.data as unknown[]).length
      })
    )
    setCounts(result)
    const sres = await window.api.items.getByProject(project.id, 'status')
    if (sres.ok && (sres.data as ProjectStatus[]).length > 0) setOverall((sres.data as ProjectStatus[])[0].overall)
    else setOverall('')
  }, [project.id])

  useEffect(() => { loadMeta() }, [loadMeta, refreshKey])
  // Jump to a tab requested from the command palette (fires on each palette pick).
  useEffect(() => { if (gotoTab && TABS.includes(gotoTab.tab as Tab)) setActiveTab(gotoTab.tab as Tab) }, [gotoTab?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToast = (msg: string, type: 'success' | 'error' = 'success', action?: ToastAction): void => {
    onToast(msg, type, action)
    loadMeta()
  }

  const handleEditSubmit = async (data: Record<string, string>) => {
    await window.api.projects.update({ id: project.id, ...data } as Parameters<typeof window.api.projects.update>[0])
    onToast('Project updated')
    setEditing(false)
    onUpdate()
  }

  const handleDelete = async () => {
    const res = await window.api.projects.delete(project.id)
    if (!res.ok) { onToast(res.error ?? 'Delete failed', 'error'); return }
    onToast('Project moved to recycle bin', 'success', { label: 'Open recycle bin', onClick: () => onOpenRecycleBin?.() })
    onDelete()
  }

  const handleArchiveToggle = async () => {
    const next = !project.archived
    const res = await window.api.projects.setArchived(project.id, next)
    if (res.ok) { onToast(next ? 'Project archived' : 'Project restored'); onUpdate() }
    else onToast(res.error ?? 'Failed', 'error')
  }

  const overallKey = overall.toLowerCase().replace(/\s+/g, '-')
  const tabProps = { projectId: project.id, projectName: project.name, onToast: handleToast }

  return (
    <div className="project-detail">
      <div className="project-header">
        {onBack && <button className="btn btn-secondary back-btn" onClick={onBack} title="Back to overview"><Icon name="arrowLeft" size={16} /> Overview</button>}
        <div className="project-header-left">
          <div className="project-title-row">
            <span className="header-icon" title={project.discipline}><DisciplineIcon discipline={project.discipline} size={22} /></span>
            <h2>{project.name}</h2>
            {project.discipline && <span className="badge badge-design">{project.discipline}</span>}
            {overall && <span className={`badge badge-${overallKey}`}>{overall}</span>}
            {project.archived && <span className="badge badge-archived"><Icon name="archive" size={12} /> Archived</span>}
          </div>
          <div className="header-meta">
            {[project.client, project.location].filter(Boolean).join(' · ') || 'No client / location set'}
            {(project.updated_by || project.updated_at) && (
              <span className="header-audit"> · edited{project.updated_by ? ` by ${project.updated_by}` : ''}{project.updated_at ? ` · ${String(project.updated_at).slice(0, 10)}` : ''}</span>
            )}
          </div>
        </div>
        <div className="project-header-right">
          <button className="btn btn-secondary btn-sm" onClick={() => setManagingMembers(true)}><Icon name="users" size={15} /> Members</button>
          {isAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> Edit</button>}
          {isManager && <button className="btn btn-secondary btn-sm" onClick={handleArchiveToggle}>{project.archived ? <><Icon name="restore" size={15} /> Restore</> : <><Icon name="archive" size={15} /> Archive</>}</button>}
          {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => setConfirmingDelete(true)}>Delete</button>}
        </div>
      </div>

      <div className="tab-bar">
        {TABS.filter((t) => t !== 'Feedback' || isAdmin).map((t) => (
          <button key={t} className={`tab-btn${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
            {TAB_LABEL[t] ?? t}
            {COUNT_TYPES[t] && counts[t] > 0 && <span className="tab-count">{counts[t]}</span>}
            {!!newCounts[t] && <span className="reminder-pill" title={`${newCounts[t]} unseen update${newCounts[t] === 1 ? '' : 's'}`}>{newCounts[t]}</span>}
          </button>
        ))}
      </div>

      <div className="tab-host" key={refreshKey}>
        {activeTab === 'Dashboard' && <DashboardTab {...tabProps} quotedHours={project.quoted_hours} onNavigate={(t) => setActiveTab(t as Tab)} project={project} overall={overall} />}
        {activeTab === 'Scope' && <ScopeTab {...tabProps} />}
        {activeTab === 'Input' && <PathTab type="input" singular="Input" primaryKey="date" primaryLabel="Date" primaryType="date" {...tabProps} hint="No inputs yet. Log the date you received an input and link the file/folder path, then open them from here." />}
        {activeTab === 'RFI/Queries' && <RFITab {...tabProps} />}
        {activeTab === 'Dispatch' && <DispatchTab {...tabProps} />}
        {activeTab === 'Tasks' && <TasksTab {...tabProps} />}
        {activeTab === 'Status' && <StatusTab projectId={project.id} onToast={handleToast} />}
        {activeTab === 'QC' && <QCTab {...tabProps} />}
        {activeTab === 'Meetings' && <PathTab type="meeting" singular="Meeting" withDate {...tabProps} hint="No meetings yet. Add a meeting with its date and the path to notes/recording, then open from here." />}
        {activeTab === 'Timesheet' && <TimesheetTab {...tabProps} quotedHours={project.quoted_hours} />}
        {activeTab === 'Standards' && <StandardsTab {...tabProps} />}
        {activeTab === 'Feedback' && isAdmin && <FeedbackTab {...tabProps} />}
      </div>

      {editing && (
        <FormModal
          title="Edit Project"
          fields={PROJECT_FIELDS}
          initial={{ name: project.name, client: project.client, location: project.location, discipline: project.discipline, quoted_hours: project.quoted_hours, start_date: project.start_date, end_date: project.end_date }}
          onSubmit={handleEditSubmit}
          onClose={() => setEditing(false)}
        />
      )}
      {managingMembers && (
        <ProjectMembersModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setManagingMembers(false)}
          onToast={onToast}
        />
      )}
      {confirmingDelete && (
        <ConfirmDialog
          title="Delete project"
          message={`Move project "${project.name}" to the recycle bin? You can restore it within 15 days (Workspace → Recycle bin).`}
          confirmLabel="Move to recycle bin"
          onConfirm={() => { setConfirmingDelete(false); handleDelete() }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
