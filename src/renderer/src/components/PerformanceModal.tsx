import { useState, useEffect, useMemo, useCallback } from 'react'
import { Project, Member } from '../types'
import { useApp } from '../context/AppContext'
import { overallOf } from '../tabs/FeedbackTab'
import { roleLabel } from '../roles'
import Avatar from './Avatar'
import Icon from './Icon'
import { useFilters } from './FilterBar'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  projects: Project[]
  onClose: () => void
  embedded?: boolean // rendered inside the Talent hub (body only, no modal chrome)
}

type Row = Record<string, unknown>
const num = (v: unknown): number => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }
const avg = (ns: number[]): number => (ns.length ? Math.round((ns.reduce((s, n) => s + n, 0) / ns.length) * 10) / 10 : 0)
const CRITERIA = ['quality', 'timeliness', 'communication', 'ownership'] as const

export default function PerformanceModal({ projects, onClose, embedded }: Props) {
  // Escape should only dismiss this as a standalone modal — when embedded in the
  // Talent hub, TalentModal itself owns the overlay and its own Escape handler.
  useEscapeKey(embedded ? () => {} : onClose)
  const { currentMember, members, isLead } = useApp()
  const [feedback, setFeedback] = useState<Row[]>([])
  const [tasks, setTasks] = useState<Row[]>([])

  const load = useCallback(async () => {
    const fb: Row[] = []
    const tk: Row[] = []
    for (const p of projects) {
      const [fres, tres] = await Promise.all([
        window.api.items.getByProject(p.id, 'feedback'),
        window.api.items.getByProject(p.id, 'task')
      ])
      if (fres.ok) for (const r of fres.data as Row[]) fb.push({ ...r, projectName: p.name })
      if (tres.ok) for (const r of tres.data as Row[]) tk.push(r)
    }
    setFeedback(fb); setTasks(tk)
  }, [projects])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => members.filter((m) => {
    if (isLead) return true // Team Lead and above see everyone's performance
    return m.id === currentMember?.id
  }), [members, isLead, currentMember])

  const { filtered: shownRows, bar } = useFilters(visible as unknown as Record<string, unknown>[], {
    searchKeys: ['name'],
    searchPlaceholder: 'Search members…',
    selects: [{ key: 'discipline', label: 'Discipline' }]
  })
  const shown = shownRows as unknown as Member[]

  const stats = useMemo(() => {
    return shown.map((m) => {
      const fb = feedback.filter((f) => String(f.member_id) === String(m.id))
      const myTasks = tasks.filter((t) => String(t.assigned_member_id) === String(m.id))
      const doneTasks = myTasks.filter((t) => t.status === 'Done')
      const crit = Object.fromEntries(CRITERIA.map((c) => [c, avg(fb.map((f) => num(f[c])).filter((n) => n > 0))]))
      return {
        member: m,
        fbCount: fb.length,
        overall: avg(fb.map((f) => overallOf(f)).filter((n) => n > 0)),
        crit,
        taskTotal: myTasks.length,
        taskDone: doneTasks.length,
        donePct: myTasks.length ? Math.round((doneTasks.length / myTasks.length) * 100) : 0,
        comments: fb.filter((f) => String(f.comment ?? '').trim()).map((f) => ({ text: String(f.comment), project: String(f.projectName ?? '') }))
      }
    })
  }, [shown, feedback, tasks])

  const body = (
    <>
          <p className="login-sub" style={{ marginBottom: 12 }}>
            Ratings are averaged from per-project feedback. Task completion is across all visible projects.
          </p>
          {bar}
          <table className="mini-table">
            <thead>
              <tr>
                <th>Member</th><th>Reviews</th><th>Overall</th>
                <th>Quality</th><th>Timeliness</th><th>Comm.</th><th>Ownership</th><th>Tasks done</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.member.id}>
                  <td><span className="cell-user"><Avatar name={s.member.name} size={26} />{s.member.name}<span className="role-chip" style={{ marginLeft: 4 }}>{roleLabel(s.member.role)}</span></span></td>
                  <td>{s.fbCount}</td>
                  <td>{s.overall ? <strong style={{ color: 'var(--accent)' }}>{s.overall} ★</strong> : '—'}</td>
                  <td>{s.crit.quality || '—'}</td>
                  <td>{s.crit.timeliness || '—'}</td>
                  <td>{s.crit.communication || '—'}</td>
                  <td>{s.crit.ownership || '—'}</td>
                  <td>{s.taskTotal ? `${s.taskDone}/${s.taskTotal} · ${s.donePct}%` : '—'}</td>
                </tr>
              ))}
              {stats.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--text-dim)' }}>No members to show.</td></tr>}
            </tbody>
          </table>

          {stats.some((s) => s.comments.length > 0) && (
            <div className="perf-comments">
              <h4>Recent comments</h4>
              {stats.flatMap((s) => s.comments.map((c, i) => (
                <div className="perf-comment" key={`${s.member.id}-${i}`}>
                  <strong>{s.member.name}</strong> <span className="perf-proj">· {c.project}</span>
                  <div>{c.text}</div>
                </div>
              )))}
            </div>
          )}
    </>
  )

  if (embedded) return body

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 880 }}>
        <div className="modal-header">
          <h3><Icon name="barChart" size={18} /> Performance</h3>
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
