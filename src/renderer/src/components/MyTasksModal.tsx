import { useState, useEffect, useMemo } from 'react'
import { Project } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { nameById } from '../lib/people'
import Icon from './Icon'
import { useFilters } from './FilterBar'
import { useEscapeKey } from '../lib/useEscapeKey'

interface TaskRow extends Record<string, unknown> {
  id: number
  project_id: number
  projectName: string
}

interface Props {
  projects: Project[]
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}

// ── Self task time tracker (localStorage-backed, survives restart) ────────────
interface TimerState { running: { key: string; start: number } | null; acc: Record<string, number> }
const TIMER_LS = 'tt_self_timer'
const loadTimers = (): TimerState => {
  try { return { running: null, acc: {}, ...JSON.parse(localStorage.getItem(TIMER_LS) || '{}') } }
  catch { return { running: null, acc: {} } }
}
const saveTimers = (t: TimerState): void => localStorage.setItem(TIMER_LS, JSON.stringify(t))
const fmtClock = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export default function MyTasksModal({ projects, onClose, onToast }: Props) {
  useEscapeKey(onClose)
  const { currentMember, members } = useApp()
  // Cross-project tasks come from the shared data layer (one cached load) instead
  // of a per-project fetch loop.
  const { tasks: allTasks, refreshTasks } = useData()
  const projName = useMemo(() => new Map(projects.map((p) => [Number(p.id), p.name])), [projects])
  const [tab, setTab] = useState<'mine' | 'delegated'>('mine')
  const [timers, setTimers] = useState<TimerState>(loadTimers)
  const [, setTick] = useState(0)

  // Re-render every second while a timer runs so the clock advances live.
  useEffect(() => {
    if (!timers.running) return
    const iv = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(iv)
  }, [timers.running])

  const update = (t: TimerState): void => { saveTimers(t); setTimers(t) }
  const elapsedOf = (key: string): number =>
    (timers.acc[key] ?? 0) + (timers.running?.key === key ? (Date.now() - timers.running.start) / 1000 : 0)

  const startTimer = (key: string): void => {
    const t = { ...timers, acc: { ...timers.acc } }
    if (t.running) t.acc[t.running.key] = (t.acc[t.running.key] ?? 0) + (Date.now() - t.running.start) / 1000
    t.running = { key, start: Date.now() }
    update(t)
  }
  const stopTimer = (key: string): void => {
    if (timers.running?.key !== key) return
    const t = { ...timers, acc: { ...timers.acc } }
    t.acc[key] = (t.acc[key] ?? 0) + (Date.now() - timers.running.start) / 1000
    t.running = null
    update(t)
  }
  const resetTimer = (key: string): void => {
    const t = { running: timers.running?.key === key ? null : timers.running, acc: { ...timers.acc } }
    delete t.acc[key]
    update(t)
  }
  const logToTimesheet = async (t: TaskRow): Promise<void> => {
    if (!currentMember) return
    const key = `${t.project_id}-${t.id}`
    const hours = Math.round((elapsedOf(key) / 3600) * 100) / 100
    if (hours <= 0) { onToast('No time tracked yet', 'error'); return }
    const today = new Date().toISOString().slice(0, 10)
    const res = await window.api.items.create('timesheet', {
      project_id: t.project_id, member_id: currentMember.id, date: today,
      task: String(t.name ?? 'Task'), execution_hrs: hours,
      discussion_hrs: 0, qc_hrs: 0, it_issue_hrs: 0, overtime_hrs: 0, correction_hrs: 0,
      total_hrs: hours
    })
    if (res.ok) { resetTimer(key); onToast(`Logged ${hours}h to timesheet`) }
    else onToast(res.error ?? 'Log failed', 'error')
  }

  const tasks = useMemo<TaskRow[]>(() => {
    const all: TaskRow[] = []
    for (const t of allTasks) {
      const pid = Number(t.project_id)
      const projectName = projName.get(pid)
      if (projectName === undefined) continue // only projects passed in via props
      all.push({ ...(t as TaskRow), project_id: pid, projectName })
    }
    return all
  }, [allTasks, projName])

  const writeTask = async (t: TaskRow, patch: Record<string, unknown>): Promise<void> => {
    await window.api.items.update('task', {
      id: t.id, project_id: t.project_id,
      name: t.name ?? '', assigned_member_id: t.assigned_member_id ?? '',
      deadline: t.deadline ?? '', status: t.status ?? 'Not Started',
      acceptance: t.acceptance ?? '', assigned_by: t.assigned_by ?? '', ...patch
    })
    refreshTasks()
  }

  const mine = useMemo(
    () => tasks.filter((t) => currentMember && String(t.assigned_member_id) === String(currentMember.id)),
    [tasks, currentMember]
  )
  const delegated = useMemo(
    () => tasks.filter((t) => currentMember && String(t.assigned_by) === String(currentMember.id)),
    [tasks, currentMember]
  )

  const rows = tab === 'mine' ? mine : delegated
  const { filtered, bar } = useFilters(rows, {
    searchKeys: ['name', 'projectName'],
    searchPlaceholder: 'Search tasks…',
    selects: [
      { key: 'status', label: 'Status' },
      { key: 'projectName', label: 'Project' }
    ],
    dateKey: 'deadline',
    dateLabel: 'Deadline'
  })
  const shownRows = filtered as TaskRow[]
  const badge = (v: string): React.JSX.Element | string =>
    v ? <span className={`badge badge-${v.toLowerCase().replace(/\s+/g, '-')}`}>{v}</span> : '—'

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 820 }}>
        <div className="modal-header">
          <h3><Icon name="checkSquare" size={18} /> My Tasks</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          {!currentMember ? (
            <div className="attach-hint">Select who you are with the “Acting as” selector (or sign in) to see your tasks.</div>
          ) : (
            <>
              <div className="mytasks-tabs">
                <button className={`tab-btn${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>
                  Assigned to me{mine.length ? <span className="tab-count">{mine.length}</span> : null}
                </button>
                <button className={`tab-btn${tab === 'delegated' ? ' active' : ''}`} onClick={() => setTab('delegated')}>
                  Assigned by me{delegated.length ? <span className="tab-count">{delegated.length}</span> : null}
                </button>
              </div>

              {rows.length === 0 ? (
                <div className="attach-empty">{tab === 'mine' ? 'No tasks assigned to you.' : 'You haven’t delegated any tasks.'}</div>
              ) : (
                <>
                {bar}
                {shownRows.length === 0 ? (
                  <div className="attach-empty">No tasks match the current filters.</div>
                ) : (
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Project</th><th>Task</th>
                      {tab === 'delegated' && <th>Assignee</th>}
                      <th>Deadline</th><th>Handoff</th><th>Status</th>
                      {tab === 'mine' && <th>Time tracked</th>}
                      {tab === 'mine' && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.map((t) => (
                      <tr key={`${t.project_id}-${t.id}`}>
                        <td>{t.projectName}</td>
                        <td>{String(t.name ?? '')}</td>
                        {tab === 'delegated' && <td>{nameById(members, t.assigned_member_id, '—')}</td>}
                        <td>{String(t.deadline ?? '') || '—'}</td>
                        <td>{badge(String(t.acceptance ?? ''))}</td>
                        <td>{badge(String(t.status ?? ''))}</td>
                        {tab === 'mine' && (() => {
                          const key = `${t.project_id}-${t.id}`
                          const running = timers.running?.key === key
                          const sec = elapsedOf(key)
                          return (
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span className={`timer-clock${running ? ' running' : ''}`}>{fmtClock(sec)}</span>
                              {running
                                ? <button className="btn-icon" title="Pause" onClick={() => stopTimer(key)}><Icon name="pause" size={15} /></button>
                                : <button className="btn-icon" title="Start timer" onClick={() => startTimer(key)}><Icon name="play" size={15} /></button>}
                              {sec > 0 && <button className="btn-icon" title="Log to timesheet" onClick={() => logToTimesheet(t)}><Icon name="clipboard" size={15} /></button>}
                              {sec > 0 && !running && <button className="btn-icon" title="Reset" onClick={() => resetTimer(key)}><Icon name="close" size={15} /></button>}
                            </td>
                          )
                        })()}
                        {tab === 'mine' && (
                          <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {t.acceptance === 'Pending' ? (
                              <>
                                <button className="btn btn-primary btn-xs" onClick={() => writeTask(t, { acceptance: 'Accepted' }).then(() => onToast('Task accepted'))}>Accept</button>{' '}
                                <button className="btn btn-secondary btn-xs" onClick={() => writeTask(t, { acceptance: 'Declined' }).then(() => onToast('Task declined'))}>Decline</button>
                              </>
                            ) : t.status !== 'Done' ? (
                              <button className="btn btn-secondary btn-xs" onClick={() => writeTask(t, { status: 'Done' }).then(() => onToast('Marked done'))}>Mark done</button>
                            ) : (
                              <span style={{ color: 'var(--success)' }}>✓</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
                </>
              )}
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
