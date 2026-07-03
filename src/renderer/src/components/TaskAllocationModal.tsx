import { useState, useMemo } from 'react'
import { Project, Member } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { useFilters } from './FilterBar'
import { num, hoursForTask, fmtDuration } from '../lib/hours'
import { nameById, memberMap } from '../lib/people'
import { splitDisciplines } from '../disciplines'
import Icon from './Icon'

interface Props {
  projects: Project[]
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
  embedded?: boolean // inside the Allocation hub — the hub provides the ← Back
}
type Row = Record<string, unknown>

// Full-page project-wise task allocation: one column per project. Top row sets the QC
// reviewer; further rows assign tasks to allocated members (each creates a real Task).
// Each task shows the time used so far (summed from logged timesheets for that task).
export default function TaskAllocationModal({ projects, onClose, onToast, embedded }: Props) {
  const { currentMember, members } = useApp()
  // Cross-project tasks/timesheets/members come from the shared data layer
  // (one cached load) instead of a per-project fetch loop.
  const { tasksByProject: tasksFor, timesheetsByProject: tsFor, memberIdsForProject, refreshTasks, refreshAll } = useData()
  const memById = useMemo(() => memberMap(members), [members])
  const membersFor = (pid: number): Member[] =>
    memberIdsForProject(pid).map((id) => memById.get(String(id))).filter((m): m is Member => !!m && m.status !== 'left')
  const [qcPick, setQcPick] = useState<Record<number, string>>({})
  const [taskPick, setTaskPick] = useState<Record<number, string>>({})
  const [taskName, setTaskName] = useState<Record<number, string>>({})
  const [taskHrs, setTaskHrs] = useState<Record<number, string>>({})
  const [taskDisc, setTaskDisc] = useState<Record<number, string>>({})

  // Filter which project columns are shown (by name/client and discipline).
  const { filtered, bar } = useFilters(projects as unknown as Row[], {
    searchKeys: ['name', 'client', 'discipline'],
    searchPlaceholder: 'Search projects…',
    selects: [{ key: 'discipline', label: 'Discipline' }]
  })
  const shownProjects = filtered as unknown as Project[]

  const isQcTask = (t: Row): boolean => String(t.name ?? '').trim().toUpperCase().startsWith('QC')
  // Open tasks with the QC task(s) pinned to the top.
  const openTasks = (pid: number): Row[] => tasksFor(pid).filter((t) => t.status !== 'Done')
    .sort((a, b) => (isQcTask(b) ? 1 : 0) - (isQcTask(a) ? 1 : 0))

  // Hours logged against a task (shared logic in lib/hours).
  const usedFor = (pid: number, t: Row): number => hoursForTask(tsFor(pid), t)
  const fmtDur = fmtDuration

  const createTask = async (pid: number, memberId: string, name: string, hours = '', discipline = ''): Promise<void> => {
    if (!memberId) { onToast('Pick a member first', 'error'); return }
    if (!name.trim()) { onToast('Enter a task name', 'error'); return }
    const res = await window.api.items.create('task', {
      project_id: pid, name: name.trim(), assigned_member_id: Number(memberId), discipline,
      deadline: '', hours, status: 'Not Started', acceptance: 'Pending', assigned_by: currentMember?.id ?? ''
    })
    if (res.ok) { onToast(`Assigned “${name.trim()}”`); refreshTasks() }
    else onToast(res.error ?? 'Failed — needs Project Lead or above', 'error')
  }

  const setQc = (pid: number): void => { void createTask(pid, qcPick[pid] ?? '', 'QC') }
  const addTask = async (pid: number): Promise<void> => {
    const proj = projects.find((x) => x.id === pid)
    const pDiscs = splitDisciplines(proj?.discipline || '')
    const disc = taskDisc[pid] || (pDiscs.length === 1 ? pDiscs[0] : '')
    await createTask(pid, taskPick[pid] ?? '', taskName[pid] ?? '', taskHrs[pid] ?? '', disc)
    setTaskName((s) => ({ ...s, [pid]: '' }))
    setTaskHrs((s) => ({ ...s, [pid]: '' }))
  }

  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="tab-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!embedded && <button className="btn btn-secondary btn-sm" onClick={onClose}><Icon name="arrowLeft" size={14} /> Back</button>}
          <span className="toolbar-progress" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="checkSquare" size={16} /> Task Allocation</span>
        </div>
        <div className="tab-toolbar-right">
          <button className="btn btn-secondary btn-sm" onClick={refreshAll}><Icon name="refresh" size={15} /> Refresh</button>
        </div>
      </div>
      <p className="attach-hint">Each column is a project. Set the <strong>QC</strong> reviewer, then assign tasks to allocated members — each assignment creates a Task. Each task shows time used so far (from logged timesheets / the task timer).</p>

      {projects.length === 0 ? (
        <div className="attach-empty">No projects yet.</div>
      ) : (
        <>
          {bar}
          {shownProjects.length === 0 ? (
            <div className="attach-empty">No projects match the filters.</div>
          ) : (
          <div className="taskalloc-wrap">
          {shownProjects.map((p) => {
            const opts = membersFor(p.id)
            const pDiscs = splitDisciplines(p.discipline || '')
            const effDisc = taskDisc[p.id] ?? (pDiscs.length === 1 ? pDiscs[0] : '')
            // The discipline selector just TAGS the task; a specific-discipline task can
            // be assigned to any allocated member (no member filtering).
            const taskOpts = opts
            return (
              <div className="taskalloc-col" key={p.id}>
                <div className="taskalloc-head">
                  <strong>{p.name}</strong>
                  {p.type ? <span className="badge badge-design">{p.type}</span> : null}
                </div>
                {opts.length === 0 ? (
                  <div className="attach-empty" style={{ padding: 10, fontSize: 12 }}>No members on this project. Add them in Work allocation or Assign projects.</div>
                ) : (
                  <>
                    <div className="taskalloc-row taskalloc-qc">
                      <span className="taskalloc-tag">QC</span>
                      <select value={qcPick[p.id] ?? ''} onChange={(e) => setQcPick((s) => ({ ...s, [p.id]: e.target.value }))}>
                        <option value="">— member</option>
                        {opts.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                      </select>
                      <button className="btn btn-secondary btn-xs" onClick={() => setQc(p.id)}>Set</button>
                    </div>
                    <div className="taskalloc-row">
                      {pDiscs.length > 0 && (
                        <select value={effDisc} onChange={(e) => setTaskDisc((s) => ({ ...s, [p.id]: e.target.value }))} title="Discipline for this task (assignable to any member)">
                          <option value="">— discipline</option>
                          {pDiscs.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      )}
                      <select value={taskPick[p.id] ?? ''} onChange={(e) => setTaskPick((s) => ({ ...s, [p.id]: e.target.value }))} title="Assign to any member">
                        <option value="">— member</option>
                        {taskOpts.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                      </select>
                      <input placeholder="Task name" value={taskName[p.id] ?? ''} onChange={(e) => setTaskName((s) => ({ ...s, [p.id]: e.target.value }))} />
                      <input type="number" min="0" step="0.5" placeholder="Hrs" style={{ width: 54 }} value={taskHrs[p.id] ?? ''} onChange={(e) => setTaskHrs((s) => ({ ...s, [p.id]: e.target.value }))} />
                      <button className="btn btn-primary btn-xs" onClick={() => addTask(p.id)}>Assign</button>
                    </div>
                    <div className="taskalloc-tasks">
                      {openTasks(p.id).length === 0 ? (
                        <div className="taskalloc-none">No open tasks assigned yet</div>
                      ) : openTasks(p.id).map((t) => {
                        const used = usedFor(p.id, t)
                        const planned = num(t.hours)
                        return (
                          <div className="taskalloc-task" key={String(t.id)}>
                            <div className="taskalloc-task-top">
                              <span className="taskalloc-task-who">{nameById(members, t.assigned_member_id)}</span>
                              <span className={`badge badge-${String(t.status ?? 'Not Started').toLowerCase().replace(/\s+/g, '-')}`}>{String(t.status ?? '')}</span>
                            </div>
                            <div className="taskalloc-task-name" title={String(t.name ?? '')}>{String(t.name ?? '')}</div>
                            <div className="taskalloc-task-time">
                              <Icon name="clock" size={11} /> {fmtDur(used)} used{planned > 0 ? ` / ${planned}h planned` : ''}
                            </div>
                            {planned > 0 && (
                              <div className="ta-bar" title={`${fmtDur(used)} of ${planned}h`}>
                                <div className="ta-bar-fill" style={{ width: `${Math.min(used / planned, 1) * 100}%`, background: used > planned ? 'var(--danger)' : used >= planned * 0.85 ? 'var(--warning)' : 'var(--accent)' }} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
          )}
        </>
      )}
    </div>
  )
}
