import { useState, useMemo } from 'react'
import { Project, Skill } from '../types'
import { useApp } from '../context/AppContext'
import { overallOf } from '../tabs/FeedbackTab'
import { roleLabel } from '../roles'
import Icon from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'
import { useData } from '../context/DataContext'
import { useItemsByProjects } from '../hooks/useItems'

interface Props {
  projects: Project[]
  onClose: () => void
}

type Row = Record<string, unknown>
const avg = (ns: number[]): number => (ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : 0)

interface Ranked {
  id: number; name: string; role: string; discipline: string
  semantic: number; overall: number; reviews: number; open: number
  final: number; skills: Skill[]
}

export default function BestFitModal({ projects, onClose }: Props) {
  useEscapeKey(onClose)
  const { members } = useApp()
  const { tasks: allTasks } = useData()
  const [required, setRequired] = useState('')
  const [loading, setLoading] = useState(false)
  const [ranked, setRanked] = useState<Ranked[] | null>(null)
  const [method, setMethod] = useState<'ruflo' | 'lexical' | null>(null)
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects])
  const projectIdSet = useMemo(() => new Set(projectIds), [projectIds])
  const { data: feedbackMap = {} } = useItemsByProjects('feedback', projectIds)
  const feedback = useMemo(() => projectIds.flatMap((id) => feedbackMap[id] ?? []), [feedbackMap, projectIds])
  const tasks = useMemo(() => allTasks.filter((t) => projectIdSet.has(Number(t.project_id))), [allTasks, projectIdSet])

  const perf = useMemo(() => {
    const m = new Map<string, { overall: number; reviews: number }>()
    members.forEach((mb) => {
      const fb = feedback.filter((f) => String(f.member_id) === String(mb.id))
      m.set(String(mb.id), { overall: Math.round(avg(fb.map(overallOf).filter((n) => n > 0)) * 10) / 10, reviews: fb.length })
    })
    return m
  }, [members, feedback])

  const openByMember = useMemo(() => {
    const m = new Map<string, number>()
    tasks.forEach((t) => { if (t.status !== 'Done' && t.assigned_member_id) { const k = String(t.assigned_member_id); m.set(k, (m.get(k) ?? 0) + 1) } })
    return m
  }, [tasks])

  const run = async (): Promise<void> => {
    if (!required.trim()) return
    setLoading(true); setRanked(null)
    const candidates = members.map((m) => ({
      id: m.id,
      text: (m.skills ?? []).map((s) => `${s.skill} ${s.category ?? ''} level${s.level}`).join(', ')
    }))
    const res = await window.api.ai.skillFit(required.trim(), candidates)
    if (!res.ok || !res.data) { setLoading(false); return }
    setMethod(res.data.method)
    const simById = new Map(res.data.results.map((r) => [r.id, r.score]))
    const rows: Ranked[] = members.map((m) => {
      const semantic = simById.get(m.id) ?? 0
      const p = perf.get(String(m.id)) ?? { overall: 0, reviews: 0 }
      const open = openByMember.get(String(m.id)) ?? 0
      const perfNorm = p.reviews > 0 ? p.overall / 5 : 0.5 // neutral if unrated
      const availability = 1 - Math.min(open / 5, 1)
      // Weighting: 40% skills match · 40% past project record · 20% availability.
      const final = 0.4 * semantic + 0.4 * perfNorm + 0.2 * availability
      return { id: m.id, name: m.name, role: m.role, discipline: m.discipline ?? '', semantic, overall: p.overall, reviews: p.reviews, open, final, skills: m.skills ?? [] }
    }).sort((a, b) => b.final - a.final)
    setRanked(rows)
    setLoading(false)
  }

  const explain = (r: Ranked): string => {
    const perfNorm = r.reviews > 0 ? r.overall / 5 : 0.5
    const availability = 1 - Math.min(r.open / 5, 1)
    const parts = [
      `Skills 40% → ${Math.round(r.semantic * 100)}%`,
      `Record 40% → ${r.reviews > 0 ? `${r.overall}★` : 'unrated'} (${Math.round(perfNorm * 100)}%)`,
      `Availability 20% → ${Math.round(availability * 100)}% (${r.open} open)`
    ]
    return parts.join(' · ')
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 760 }}>
        <div className="modal-header">
          <h3><Icon name="target" size={18} /> Best-Fit Staffing</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="login-sub" style={{ marginBottom: 10 }}>
            Describe the skills the upcoming project needs. Ranking blends AI skill match (40%), past project record (40%) and current availability (20%).
          </p>
          <label className="bf-label">Required skills / project brief</label>
          <textarea className="bf-input" rows={3} value={required} onChange={(e) => setRequired(e.target.value)}
            placeholder="e.g. Revit, structural detailing, BIM coordination, fast-track high-rise" />
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={run} disabled={loading || !required.trim()}>
              {loading ? 'Analyzing…' : <><Icon name="target" size={15} /> Find best fit</>}
            </button>
            {method && <span className="bf-method">{method === 'ruflo' ? 'AI · ruflo embeddings (local)' : 'lexical match (ruflo unavailable)'}</span>}
          </div>

          {ranked && (
            <div className="bf-results">
              {ranked.map((r, i) => (
                <div className={`bf-card${i === 0 ? ' bf-top' : ''}`} key={r.id}>
                  <div className="bf-rank">{i + 1}</div>
                  <div className="bf-main">
                    <div className="bf-head">
                      <strong>{r.name}</strong>
                      <span className="role-chip">{roleLabel(r.role)}</span>
                      {r.discipline && <span className="org-tag org-tag-ho">{r.discipline}</span>}
                      <span className="bf-score">{Math.round(r.final * 100)}</span>
                    </div>
                    <div className="bf-bar"><div className="bf-fill" style={{ width: `${Math.round(r.final * 100)}%` }} /></div>
                    <div className="bf-explain">{explain(r)}</div>
                    {r.skills.length > 0 && (
                      <div className="skill-chips" style={{ marginTop: 6 }}>
                        {r.skills.slice(0, 8).map((s, j) => <span className="skill-chip" key={j}>{s.skill}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
