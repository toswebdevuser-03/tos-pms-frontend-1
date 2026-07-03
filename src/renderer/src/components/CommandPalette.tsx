import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Project, Member } from '../types'
import { useData } from '../context/DataContext'
import Icon, { IconName, disciplineIconName } from './Icon'

export type PaletteTarget =
  | { kind: 'project'; projectId: number }
  | { kind: 'item'; projectId: number; tab: string }
  | { kind: 'member' }

interface Props {
  projects: Project[]
  members: Member[]
  onClose: () => void
  onNavigate: (t: PaletteTarget) => void
}

interface Hit {
  key: string
  icon: IconName
  title: string
  sub: string
  group: string
  target: PaletteTarget
}

type Row = Record<string, unknown>
const s = (v: unknown): string => String(v ?? '')

export default function CommandPalette({ projects, members, onClose, onNavigate }: Props) {
  // Tasks come from the shared cross-project data layer (one cached load) instead of
  // a per-project fetch; RFIs/Queries still fetch per project (not in the data layer).
  const { tasksByProject } = useData()
  const [q, setQ] = useState('')
  const [items, setItems] = useState<{ rfis: Row[]; queries: Row[] }>({ rfis: [], queries: [] })
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const projName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])

  // Tasks across the currently-visible projects (scoped exactly like the per-project loop).
  const tasks = useMemo<Row[]>(() => projects.flatMap((p) => tasksByProject(p.id)), [projects, tasksByProject])

  useEffect(() => { inputRef.current?.focus() }, [])

  // Load cross-project RFIs/Queries once on open.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const rfis: Row[] = [], queries: Row[] = []
      await Promise.all(projects.map(async (p) => {
        const [r, qq] = await Promise.all([
          window.api.items.getByProject(p.id, 'rfi'),
          window.api.items.getByProject(p.id, 'query')
        ])
        if (r.ok) (r.data as Row[]).forEach((x) => rfis.push({ ...x, project_id: p.id }))
        if (qq.ok) (qq.data as Row[]).forEach((x) => queries.push({ ...x, project_id: p.id }))
      }))
      if (alive) setItems({ rfis, queries })
    })()
    return () => { alive = false }
  }, [projects])

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase()
    const match = (...vals: unknown[]): boolean => !term || vals.some((v) => s(v).toLowerCase().includes(term))
    const out: Hit[] = []

    for (const p of projects) {
      if (match(p.name, p.client, p.location, p.discipline)) {
        out.push({ key: `p${p.id}`, icon: disciplineIconName(p.discipline), title: p.name, sub: [p.client, p.discipline].filter(Boolean).join(' · ') || 'Project', group: 'Projects', target: { kind: 'project', projectId: p.id } })
      }
    }
    for (const m of members) {
      if (match(m.name, m.email, m.role, m.discipline)) {
        out.push({ key: `m${m.id}`, icon: 'user', title: m.name, sub: [m.role, m.discipline].filter(Boolean).join(' · '), group: 'People', target: { kind: 'member' } })
      }
    }
    for (const t of tasks) {
      if (match(t.name)) out.push({ key: `t${t.id}`, icon: 'checkSquare', title: s(t.name), sub: `Task · ${projName.get(Number(t.project_id)) ?? ''}`, group: 'Tasks', target: { kind: 'item', projectId: Number(t.project_id), tab: 'Tasks' } })
    }
    for (const r of items.rfis) {
      if (match(r.subject, r.rfi_number, r.description)) out.push({ key: `r${r.id}`, icon: 'send', title: s(r.subject) || `RFI ${s(r.rfi_number)}`, sub: `RFI · ${projName.get(Number(r.project_id)) ?? ''}`, group: 'RFIs', target: { kind: 'item', projectId: Number(r.project_id), tab: 'RFI/Queries' } })
    }
    for (const r of items.queries) {
      if (match(r.subject, r.query_number, r.description)) out.push({ key: `q${r.id}`, icon: 'help', title: s(r.subject) || `Query ${s(r.query_number)}`, sub: `Query · ${projName.get(Number(r.project_id)) ?? ''}`, group: 'Queries', target: { kind: 'item', projectId: Number(r.project_id), tab: 'RFI/Queries' } })
    }
    return out.slice(0, 40)
  }, [q, projects, members, items, tasks, projName])

  useEffect(() => { setActive(0) }, [q])

  const choose = useCallback((h: Hit | undefined) => { if (h) { onNavigate(h.target); onClose() } }, [onNavigate, onClose])

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(hits[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  // Group hits while preserving a flat index for keyboard nav.
  let idx = -1
  const groups = ['Projects', 'People', 'Tasks', 'RFIs', 'Queries'].map((g) => ({ g, rows: hits.filter((h) => h.group === g) })).filter((x) => x.rows.length)

  return (
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" onKeyDown={onKey}>
        <div className="palette-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input ref={inputRef} placeholder="Search projects, people, tasks, RFIs, queries…" value={q} onChange={(e) => setQ(e.target.value)} />
          <kbd>esc</kbd>
        </div>
        <div className="palette-results">
          {hits.length === 0 ? (
            <div className="palette-empty">{q ? 'No matches.' : 'Type to search across everything.'}</div>
          ) : groups.map(({ g, rows }) => (
            <div key={g} className="palette-group">
              <div className="palette-group-head">{g}</div>
              {rows.map((h) => {
                idx++
                const i = idx
                return (
                  <button key={h.key} className={`palette-row${i === active ? ' active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(h)}>
                    <span className="palette-icon"><Icon name={h.icon} size={16} /></span>
                    <span className="palette-text"><span className="palette-title">{h.title}</span><span className="palette-sub">{h.sub}</span></span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="palette-foot"><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close</div>
      </div>
    </div>
  )
}
