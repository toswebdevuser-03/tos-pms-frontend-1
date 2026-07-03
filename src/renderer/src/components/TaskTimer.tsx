import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Project } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { usePopout } from '../lib/usePopout'
import { track } from '../lib/analytics'
import Icon from './Icon'

interface Props {
  projects: Project[]
  onToast: (msg: string, type?: 'success' | 'error') => void
}
type Row = Record<string, unknown>
type Task = Row & { __project: string; __projectId: number; __kind: 'task' | 'qc' }

const LS = 'tos_task_timer'

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

// Floating, draggable stopwatch. Times one of the member's tasks; on stop it logs
// a timesheet entry (execution hrs) for the elapsed time and marks the task
// Done / In Progress. State persists in localStorage so it survives navigation/refresh.
export default function TaskTimer({ projects, onToast }: Props) {
  const { currentMember } = useApp()
  // Cross-project tasks come from the shared data layer (one cached load) instead
  // of a per-project fetch loop.
  const { tasks: allTasks, qc: allQc, refreshTasks, refreshQc } = useData()
  const projName = useMemo(() => new Map(projects.map((p) => [Number(p.id), p.name])), [projects])
  const [taskId, setTaskId] = useState('')
  const [running, setRunning] = useState(false)
  const [accMs, setAccMs] = useState(0)
  const [since, setSince] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const offset = useRef({ dx: 0, dy: 0 })
  const cardRef = useRef<HTMLDivElement>(null)
  const hydrated = useRef(false)

  // Restore persisted state once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS)
      if (raw) {
        const s = JSON.parse(raw)
        setTaskId(s.taskId ?? ''); setAccMs(s.accMs ?? 0); setSince(s.since ?? null)
        setRunning(!!s.running); setOpen(!!s.open); if (s.pos) setPos(s.pos)
      }
    } catch { /* ignore */ }
    hydrated.current = true
  }, [])

  // Persist.
  useEffect(() => {
    if (!hydrated.current) return
    localStorage.setItem(LS, JSON.stringify({ taskId, accMs, since, running, open, pos }))
  }, [taskId, accMs, since, running, open, pos])

  // 1s tick while running.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const tasks = useMemo<Task[]>(() => {
    if (!currentMember) return []
    const mine: Task[] = []
    const mineId = String(currentMember.id)
    for (const t of allTasks) {
      const pid = Number(t.project_id)
      const name = projName.get(pid)
      if (name === undefined) continue // only projects passed in via props
      if (String(t.assigned_member_id) === mineId && t.status !== 'Done') {
        mine.push({ ...t, __project: name, __projectId: pid, __kind: 'task' })
      }
    }
    // QC items assigned to me (one of possibly several assignees) — time logs as CORRECTION hrs.
    for (const q of allQc) {
      const pid = Number(q.project_id)
      const name = projName.get(pid)
      if (name === undefined) continue
      const ids = String(q.assigned_member_ids ?? q.assigned_member_id ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      if (ids.includes(mineId) && q.result !== 'Pass') {
        mine.push({ ...q, name: q.checklist_item ?? 'QA/QC', __project: name, __projectId: pid, __kind: 'qc' })
      }
    }
    return mine
  }, [allTasks, allQc, projName, currentMember])

  const clampToViewport = (x: number, y: number): { x: number; y: number } => {
    const w = cardRef.current?.offsetWidth ?? 300, h = cardRef.current?.offsetHeight ?? 180
    return {
      x: Math.max(6, Math.min(window.innerWidth - w - 6, x)),
      y: Math.max(6, Math.min(window.innerHeight - h - 6, y))
    }
  }

  // Drag handling.
  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent): void => setPos(clampToViewport(e.clientX - offset.current.dx, e.clientY - offset.current.dy))
    const up = (): void => setDragging(false)
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [dragging])

  // A position restored from a previous session (e.g. dragged on a normal monitor)
  // can end up off-screen or under OS/remote-desktop chrome on a smaller viewport
  // (Remote Desktop sessions especially) — re-clamp on load and on resize so the
  // timer is never stuck somewhere unreachable.
  useEffect(() => {
    if (!pos) return
    const reclamp = (): void => setPos((p) => (p ? clampToViewport(p.x, p.y) : p))
    reclamp()
    window.addEventListener('resize', reclamp)
    return () => window.removeEventListener('resize', reclamp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos !== null])

  // Separate always-on-top window (Document Picture-in-Picture, popup fallback).
  const popout = usePopout({ title: 'Task timer', width: 320, height: 250 })

  if (!currentMember) return null

  const elapsed = accMs + (running && since ? Date.now() - since : 0)
  // taskId is a composite "kind:id" so a task and a QC item sharing an id don't collide.
  const task = tasks.find((t) => `${t.__kind}:${String(t.id)}` === taskId)

  const startDrag = (e: React.MouseEvent): void => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (rect) offset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    setDragging(true)
  }

  const start = (): void => {
    if (!taskId) { onToast('Pick a task to time', 'error'); return }
    setSince(Date.now()); setRunning(true)
  }
  const pause = (): void => { setAccMs((a) => a + (since ? Date.now() - since : 0)); setSince(null); setRunning(false) }
  const resume = (): void => { setSince(Date.now()); setRunning(true) }
  const reset = (): void => { setAccMs(0); setSince(null); setRunning(false); setStopping(false) }
  const stop = (): void => { if (running) pause(); setStopping(true) }

  const finish = async (status: 'Done' | 'In Progress'): Promise<void> => {
    if (!task) { onToast('No task selected', 'error'); reset(); return }
    const totalMs = accMs + (since ? Date.now() - since : 0)
    let hrs = Math.round((totalMs / 3600000) * 100) / 100
    if (totalMs > 0 && hrs <= 0) hrs = 0.01 // floor so short sessions still log
    const isQc = task.__kind === 'qc'
    if (hrs > 0) {
      // QC time is logged as CORRECTION hours (and isn't "productive"); task time is execution.
      const res = await window.api.items.create('timesheet', {
        project_id: task.__projectId, member_id: currentMember.id, date: new Date().toISOString().slice(0, 10),
        task: (isQc ? 'QA/QC — ' : '') + String(task.name ?? ''), task_id: task.id,
        execution_hrs: isQc ? '' : hrs, discussion_hrs: '', qc_hrs: '', it_issue_hrs: '', overtime_hrs: '',
        correction_hrs: isQc ? hrs : '',
        productive_hrs: isQc ? 0 : hrs, total_hrs: hrs
      })
      if (!res.ok) { onToast(res.error ?? 'Could not save timesheet — time kept', 'error'); return }
      track('time_logged', { kind: isQc ? 'qc' : 'task', hours: hrs, project_id: task.__projectId })
    }
    if (isQc) {
      const up = await window.api.items.update('qc', {
        id: task.id, project_id: task.__projectId,
        checklist_item: task.checklist_item ?? task.name ?? '', path: task.path ?? '',
        assigned_member_ids: task.assigned_member_ids ?? '', assigned_member_id: task.assigned_member_id ?? '',
        inspection_date: task.inspection_date ?? '', notes: task.notes ?? '', result: status === 'Done' ? 'Pass' : 'In Progress'
      })
      if (!up.ok) onToast(up.error ?? `Logged ${hrs}h (correction), but couldn't update QA/QC`, 'error')
      else onToast(hrs > 0 ? `Logged ${hrs}h as correction · QA/QC ${status === 'Done' ? 'Pass' : 'In Progress'}` : `QA/QC updated`)
      reset(); refreshQc()
    } else {
      const up = await window.api.items.update('task', {
        id: task.id, project_id: task.__projectId, name: task.name ?? '', assigned_member_id: task.assigned_member_id ?? '',
        deadline: task.deadline ?? '', hours: task.hours ?? '', status, acceptance: task.acceptance ?? '', assigned_by: task.assigned_by ?? ''
      })
      if (!up.ok) onToast(up.error ?? `Logged ${hrs}h, but couldn't set status`, 'error')
      else onToast(hrs > 0 ? `Logged ${hrs}h to timesheet · task ${status}` : `Task ${status}`)
      reset(); refreshTasks()
    }
  }

  const style: React.CSSProperties = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : {}
  const locked = running || elapsed > 0 // don't switch tasks mid-timing

  // Timer body — identical whether docked in-app or shown in the pop-out window.
  const controls = (
    <div className="tt-body">
      <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={locked} title={locked ? 'Stop the timer to switch tasks' : undefined}>
        <option value="">{tasks.length ? '— Pick a task' : 'No open tasks assigned to you'}</option>
        {tasks.map((t) => <option key={`${t.__kind}:${String(t.id)}`} value={`${t.__kind}:${String(t.id)}`}>{t.__kind === 'qc' ? 'QA/QC: ' : ''}{String(t.name ?? 'Task')} · {t.__project}</option>)}
      </select>

      <div className={`tt-time${running ? ' live' : ''}`}>{fmt(elapsed)}</div>

      {stopping ? (
        <div className="tt-stop">
          <div className="tt-stop-label">{task?.__kind === 'qc' ? 'Mark QA/QC:' : 'Mark task:'}</div>
          <div className="tt-row">
            <button className="btn btn-primary btn-sm" onClick={() => finish('Done')}>Complete</button>
            <button className="btn btn-secondary btn-sm" onClick={() => finish('In Progress')}>In Progress</button>
          </div>
          <button className="btn btn-secondary btn-xs" onClick={() => setStopping(false)}>Keep timing</button>
        </div>
      ) : (
        <div className="tt-row">
          {!running && elapsed === 0 && task && <button className="btn btn-primary btn-sm" onClick={start}><Icon name="play" size={14} /> Start</button>}
          {!running && elapsed === 0 && !task && <span className="tt-hint">Pick a task above to start timing.</span>}
          {running && <button className="btn btn-secondary btn-sm" onClick={pause}><Icon name="pause" size={14} /> Pause</button>}
          {!running && elapsed > 0 && <button className="btn btn-primary btn-sm" onClick={resume}><Icon name="play" size={14} /> Resume</button>}
          {elapsed > 0 && <button className="btn btn-secondary btn-sm" onClick={stop}>Stop &amp; log</button>}
        </div>
      )}
      {task && <div className="tt-hint">Logs to <strong>{task.__project}</strong> as execution hours for today.</div>}
    </div>
  )

  // Popped out into its own always-on-top window: portal the card there, and keep
  // a small in-app handle to focus/dock it back.
  if (popout.isOpen && popout.container) {
    return (
      <>
        {createPortal(
          <div className="tt-popout">
            <div className="tt-card">
              <div className="tt-head">
                <span><Icon name="clock" size={15} /> Task timer</span>
                <button className="btn-icon" onClick={popout.close} title="Dock back into the app"><Icon name="close" size={15} /></button>
              </div>
              {controls}
            </div>
          </div>,
          popout.container
        )}
        <div className="task-timer tt-collapsed" style={style} ref={cardRef}>
          <button className="tt-pill" onClick={() => popout.open()} title="Timer is in a separate window — click to focus">
            <Icon name="externalLink" size={14} />
            <span className="tt-pill-time">{running || elapsed > 0 ? fmt(elapsed) : 'Timer ↗'}</span>
          </button>
        </div>
      </>
    )
  }

  // Collapsed pill
  if (!open) {
    return (
      <div className={`task-timer tt-collapsed${dragging ? ' dragging' : ''}`} style={style} ref={cardRef}>
        <button className="tt-pill" onMouseDown={startDrag} onClick={() => !dragging && setOpen(true)} title="Task timer">
          <Icon name={running ? 'pause' : 'clock'} size={15} />
          <span className="tt-pill-time">{running || elapsed > 0 ? fmt(elapsed) : 'Timer'}</span>
        </button>
      </div>
    )
  }

  return (
    <div className={`task-timer${dragging ? ' dragging' : ''}`} style={style} ref={cardRef}>
      <div className="tt-card">
        <div className="tt-head" onMouseDown={startDrag}>
          <span><Icon name="clock" size={15} /> Task timer</span>
          <span className="tt-head-actions">
            <button className="btn-icon" onClick={() => popout.open()} title="Pop out to a floating window"><Icon name="externalLink" size={14} /></button>
            <button className="btn-icon" onClick={() => setOpen(false)} title="Minimize"><Icon name="close" size={15} /></button>
          </span>
        </div>
        {controls}
      </div>
    </div>
  )
}
