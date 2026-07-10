import { useState, useEffect, useCallback, useMemo } from 'react'
import { Project, OvertimeRequest } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import Donut from './charts/Donut'
import Icon from './Icon'
import { useFilters } from './FilterBar'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  projects: Project[]
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}
type Row = Record<string, unknown>

const BASE_CAP = 8.5
const PIE = ['#4c8dff', '#22c55e', '#f59e0b', '#a78bfa', '#ef4444', '#06b6d4', '#ec4899', '#94a3b8']
const num = (v: unknown): number => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }
const iso = (d: Date): string => d.toISOString().slice(0, 10)
const isWeekend = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6
const fmtDay = (ds: string): string => new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

interface Seg { taskId: unknown; name: string; project: string; hours: number; color: string }
interface Day { date: string; segs: Seg[]; cap: number }

export default function MyAllocationModal({ projects, onClose, onToast }: Props) {
  useEscapeKey(onClose)
  const { currentMember } = useApp()
  const { tasks: allTasks } = useData()
  const [overtime, setOvertime] = useState<OvertimeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const projName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])
  const projIds = useMemo(() => new Set(projects.map((p) => Number(p.id))), [projects])
  const tasks = useMemo<Array<Row & { __project: string }>>(() => {
    if (!currentMember) return []
    return allTasks
      .filter((t) => projIds.has(Number(t.project_id)) && String(t.assigned_member_id) === String(currentMember.id) && t.status !== 'Done')
      .map((t) => ({ ...t, __project: projName.get(Number(t.project_id)) ?? '' }))
  }, [allTasks, projIds, currentMember, projName])

  const load = useCallback(async () => {
    setLoading(true)
    const o = await window.api.overtime.list()
    if (o.ok) setOvertime((o.data as OvertimeRequest[]).filter((x) => String(x.member_id) === String(currentMember?.id ?? '')))
    setLoading(false)
  }, [currentMember])
  useEffect(() => { load() }, [load])

  const otApprovedByDate = useMemo(() => {
    const m = new Map<string, number>()
    overtime.filter((o) => o.status === 'approved').forEach((o) => m.set(o.date, (m.get(o.date) ?? 0) + num(o.hours)))
    return m
  }, [overtime])
  // Most recent request per date (list comes back newest-first).
  const otReqByDate = useMemo(() => {
    const m = new Map<string, OvertimeRequest>()
    overtime.forEach((o) => { if (!m.has(o.date)) m.set(o.date, o) })
    return m
  }, [overtime])

  const estimated = useMemo(() => tasks.filter((t) => num(t.hours) > 0), [tasks])
  const unestimated = useMemo(() => tasks.filter((t) => num(t.hours) <= 0), [tasks])

  // Filter the member's scheduled tasks before they are laid out into days.
  const { filtered: shownTasks, bar } = useFilters(estimated, {
    searchKeys: ['name', '__project'],
    searchPlaceholder: 'Search your tasks…',
    selects: [{ key: '__project', label: 'Project' }],
    dateKey: 'deadline',
    dateLabel: 'Deadline'
  })
  const filteredEstimated = shownTasks as Array<Row & { __project: string }>

  // Fill weekdays forward from today; each day holds 8.5h + that day's APPROVED overtime.
  const days = useMemo<Day[]>(() => {
    const list = [...filteredEstimated].sort((a, b) => {
      const ad = String(a.deadline ?? '') || '9999-99-99'
      const bd = String(b.deadline ?? '') || '9999-99-99'
      return ad < bd ? -1 : ad > bd ? 1 : 0
    })
    const colorOf = new Map<string, string>()
    list.forEach((t, i) => colorOf.set(String(t.id), PIE[i % PIE.length]))

    const capOf = (ds: string): number => BASE_CAP + (otApprovedByDate.get(ds) ?? 0)
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0)
    while (isWeekend(cursor)) cursor.setDate(cursor.getDate() + 1)
    const out: Day[] = [{ date: iso(cursor), segs: [], cap: capOf(iso(cursor)) }]
    const advance = (): void => { do { cursor.setDate(cursor.getDate() + 1) } while (isWeekend(cursor)); out.push({ date: iso(cursor), segs: [], cap: capOf(iso(cursor)) }) }

    for (const t of list) {
      let remaining = num(t.hours)
      let guard = 0
      while (remaining > 0 && guard++ < 400) {
        const d = out[out.length - 1]
        const used = d.segs.reduce((s, x) => s + x.hours, 0)
        const free = Math.round((d.cap - used) * 10) / 10
        if (free <= 0) { advance(); continue }
        const put = Math.min(free, remaining)
        d.segs.push({ taskId: t.id, name: String(t.name ?? 'Task'), project: t.__project, hours: Math.round(put * 10) / 10, color: colorOf.get(String(t.id))! })
        remaining = Math.round((remaining - put) * 10) / 10
      }
    }
    return out
  }, [filteredEstimated, otApprovedByDate])

  const applyOvertime = async (date: string): Promise<void> => {
    const input = window.prompt(`Request overtime hours for ${fmtDay(date)}?\nThese count only after a Project/Team Lead AND a Manager both approve.`)
    if (input == null) return
    const hrs = parseFloat(input)
    if (!hrs || hrs <= 0) { onToast('Enter a positive number of hours', 'error'); return }
    const res = await window.api.overtime.request({ date, hours: hrs })
    if (res.ok) { onToast('Overtime requested — pending approval'); load() }
    else onToast(res.error ?? 'Failed to request overtime', 'error')
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: '95vw', maxWidth: 1180 }}>
        <div className="modal-header">
          <h3><Icon name="calendar" size={18} /> My Allocation</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="attach-hint">Your tasks scheduled at <strong>{BASE_CAP}h/day</strong> — anything over a day rolls to the next. Need more in a day? <strong>Apply for overtime</strong> (counts only after a Lead <em>and</em> a Manager approve).</p>
          {loading ? <div className="attach-empty">Loading…</div> : estimated.length === 0 ? (
            <div className="attach-empty">No tasks with planned hours assigned to you. (Tasks need a “Planned hrs” value to be scheduled.)</div>
          ) : (
            <>
            {bar}
            <div className="taskalloc-wrap">
              {days.map((d) => {
                const used = Math.round(d.segs.reduce((s, x) => s + x.hours, 0) * 10) / 10
                const ot = otReqByDate.get(d.date)
                const otApproved = otApprovedByDate.get(d.date) ?? 0
                return (
                  <div className="taskalloc-col myalloc-col" key={d.date}>
                    <div className="taskalloc-head">
                      <strong>{fmtDay(d.date)}</strong>
                      <span className={`myalloc-cap${used > d.cap ? ' over' : ''}`}>{used} / {d.cap}h</span>
                    </div>
                    <div className="myalloc-pie">
                      {d.segs.length ? (
                        <Donut
                          segments={d.segs.map((s) => ({ label: `${s.name} · ${s.hours}h`, value: s.hours, color: s.color }))}
                          centerLabel={`${used}h`}
                          centerSub={otApproved ? `+${otApproved} OT` : `of ${d.cap}`}
                        />
                      ) : <div className="attach-empty" style={{ padding: 14, fontSize: 12 }}>Free day</div>}
                    </div>
                    <div className="myalloc-segs">
                      {d.segs.map((s, i) => (
                        <div className="myalloc-seg" key={i}>
                          <span className="myalloc-dot" style={{ background: s.color }} />
                          <span className="myalloc-seg-name" title={`${s.project} · ${s.name}`}>{s.name}</span>
                          <span className="myalloc-seg-hrs">{s.hours}h</span>
                        </div>
                      ))}
                    </div>
                    <div className="myalloc-ot">
                      {ot && ot.status === 'pending' && <span className="badge badge-pending" title="Awaiting a Project/Team Lead">OT {ot.hours}h · awaiting lead</span>}
                      {ot && ot.status === 'lead_approved' && <span className="badge badge-pending" title="Lead approved — awaiting a Manager">OT {ot.hours}h · awaiting Mgr</span>}
                      {ot && ot.status === 'approved' && <span className="badge badge-on-going">OT {otApproved}h approved</span>}
                      {ot && ot.status === 'rejected' && <span className="badge badge-overdue">OT rejected</span>}
                      <button className="btn btn-secondary btn-xs" onClick={() => applyOvertime(d.date)}>Apply OT</button>
                    </div>
                  </div>
                )
              })}
            </div>
            </>
          )}
          {unestimated.length > 0 && (
            <div className="myalloc-unest">
              <strong>Not scheduled</strong> (no planned hours): {unestimated.map((t) => `${t.name} (${t.__project})`).join(', ')}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
