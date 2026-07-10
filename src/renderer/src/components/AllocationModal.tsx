import { useState, useCallback, useMemo } from 'react'
import { Project, Member } from '../types'
import { roleRank } from '../roles'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { splitDisciplines } from '../disciplines'
import { memberMap, activeMembers } from '../lib/people'
import { useFilters } from './FilterBar'
import EmptyState from './EmptyState'
import Icon from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'
import { useItemsByProjects } from '../hooks/useItems'

interface Props {
  projects: Project[]
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
  embedded?: boolean // inside the Allocation hub — the hub provides the ← Back
}
type Row = Record<string, unknown>

const COLS = ['Manager', 'Team Lead', 'Project Lead', 'Employee'] as const
type Col = (typeof COLS)[number]
const colFromRank = (r: number): Col => (r >= 4 ? 'Manager' : r === 3 ? 'Team Lead' : r === 2 ? 'Project Lead' : 'Employee')
const iso = (d: Date): string => d.toISOString().slice(0, 10)
const fmtDate = (ds: string): string => new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

// Full-page DAILY work allocation. Members are placed in the column matching their
// role by default; a Team Lead+ can DRAG a person into another role column to override
// it for that one project/day (stored as `role` on the allocation entry). Team Lead+
// add/remove people per day; each is a dated allocation entry.
export default function AllocationModal({ projects, onClose, onToast, embedded }: Props) {
  const { members, isLead } = useApp()
  const { refreshProjectMembers } = useData()
  const [date, setDate] = useState(() => iso(new Date()))
  const [adding, setAdding] = useState<Project | null>(null)
  const [pickQuery, setPickQuery] = useState('')
  const [drag, setDrag] = useState<{ projectId: number; memberId: string } | null>(null)
  const [overCell, setOverCell] = useState<string | null>(null)
  useEscapeKey(useCallback(() => setAdding(null), []))

  const projectIds = useMemo(() => projects.map((p) => p.id), [projects])
  const { data: allocationMap = {}, refetch: refetchAllocations } = useItemsByProjects('allocation', projectIds)
  const rowsByProject = useMemo<Record<number, Row[]>>(() => {
    const map: Record<number, Row[]> = {}
    for (const p of projects) {
      map[p.id] = (allocationMap[p.id] ?? []).filter((a) => String(a.date ?? '').slice(0, 10) === date && a.member_id != null && String(a.member_id) !== '')
    }
    return map
  }, [projects, allocationMap, date])

  const memberById = useMemo(() => memberMap(members), [members])

  const membersOn = useCallback((projectId: number): Member[] => {
    const seen = new Set<string>()
    const out: Member[] = []
    for (const a of rowsByProject[projectId] ?? []) {
      const id = String(a.member_id)
      if (seen.has(id)) continue
      seen.add(id)
      const mb = memberById.get(id)
      if (mb) out.push(mb)
    }
    return out
  }, [rowsByProject, memberById])

  // Role override (from any of the member's allocation rows on this project/day), else role.
  const overrideOf = useCallback((projectId: number, memberId: string): Col | null => {
    const row = (rowsByProject[projectId] ?? []).find((r) => String(r.member_id) === memberId && COLS.includes(String(r.role) as Col))
    return row ? (String(row.role) as Col) : null
  }, [rowsByProject])
  const effCol = useCallback((projectId: number, m: Member): Col => overrideOf(projectId, String(m.id)) ?? colFromRank(roleRank(m.role)), [overrideOf])
  const cellMembers = (projectId: number, col: Col): Member[] => membersOn(projectId).filter((m) => effCol(projectId, m) === col)

  const loadByMember = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of projects) {
      const seen = new Set<string>()
      for (const a of rowsByProject[p.id] ?? []) {
        const id = String(a.member_id)
        if (seen.has(id)) continue
        seen.add(id); m.set(id, (m.get(id) ?? 0) + 1)
      }
    }
    return m
  }, [projects, rowsByProject])

  const removeMember = async (projectId: number, memberId: string): Promise<void> => {
    const ids = (rowsByProject[projectId] ?? []).filter((a) => String(a.member_id) === memberId).map((a) => Number(a.id))
    for (const id of ids) await window.api.items.delete('allocation', id)
    onToast('Removed from this day'); await refetchAllocations()
  }

  const addMember = async (projectId: number, memberId: number): Promise<void> => {
    const res = await window.api.items.create('allocation', { project_id: projectId, member_id: memberId, date, hours: '', note: '' })
    if (!res.ok) { onToast(res.error ?? 'Failed', 'error'); return }
    // Allocating someone to a project also grants them access to it (project member),
    // so they see the project and appear in Task allocation. Idempotent if already on.
    try { await window.api.projectMembers.assign(projectId, memberId) } catch { /* already a member */ }
    void refreshProjectMembers() // so Task allocation & the member's access reflect it now
    onToast('Allocated for ' + fmtDate(date) + ' · added to project')
    await refetchAllocations()
  }

  // Move a member to a different role column for THIS project/day only.
  const setRoleOverride = async (projectId: number, memberId: string, col: Col): Promise<void> => {
    const rows = (rowsByProject[projectId] ?? []).filter((r) => String(r.member_id) === memberId)
    for (const r of rows) {
      await window.api.items.update('allocation', {
        id: Number(r.id), project_id: projectId, member_id: r.member_id, date: r.date ?? date,
        hours: r.hours ?? '', note: r.note ?? '', task_id: r.task_id ?? '', role: col
      })
    }
    onToast(`Moved to ${col} for this project`); await refetchAllocations()
  }

  const shiftDate = (delta: number): void => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + delta); setDate(iso(d)) }

  const roleCell = (p: Project, col: Col): React.ReactNode => {
    const ms = cellMembers(p.id, col)
    const key = `${p.id}:${col}`
    return (
      <td
        key={col}
        className={`alloc-rolecell${overCell === key ? ' drop-over' : ''}`}
        onDragOver={(e) => { if (drag && drag.projectId === p.id) { e.preventDefault(); setOverCell(key) } }}
        onDragLeave={() => setOverCell((c) => (c === key ? null : c))}
        onDrop={(e) => { e.preventDefault(); const d = drag; setOverCell(null); setDrag(null); if (d && d.projectId === p.id) setRoleOverride(p.id, d.memberId, col) }}
      >
        {ms.length === 0 ? <span style={{ color: 'var(--text-dim)' }}>—</span> : (
          <div className="alloc-chips">
            {ms.map((m) => (
              <span
                key={m.id}
                className={`alloc-rolechip${isLead ? ' draggable' : ''}`}
                draggable={isLead}
                onDragStart={() => setDrag({ projectId: p.id, memberId: String(m.id) })}
                onDragEnd={() => { setDrag(null); setOverCell(null) }}
                title={isLead ? 'Drag to another role column (this project only)' : undefined}
              >
                {m.name}
                {isLead && <button className="alloc-x" title="Remove from this day" onClick={() => removeMember(p.id, String(m.id))}><Icon name="close" size={10} /></button>}
              </span>
            ))}
          </div>
        )}
      </td>
    )
  }

  const exportCsv = async (): Promise<void> => {
    const nm = (pid: number, col: Col): string => cellMembers(pid, col).map((m) => m.name).join(', ')
    const rows = projects.map((p) => ({
      date, project: p.name, quoted_hours: p.quoted_hours ?? '',
      manager: nm(p.id, 'Manager'), team_lead: nm(p.id, 'Team Lead'), project_lead: nm(p.id, 'Project Lead'), employee: nm(p.id, 'Employee')
    }))
    const res = await window.api.csv.export('work_allocation', `work_allocation_${date}`, rows)
    if (res.ok && res.data?.filePath) onToast('Work allocation exported')
  }

  const candidates = useMemo(() => {
    if (!adding) return []
    const already = new Set(membersOn(adding.id).map((m) => String(m.id)))
    const projDisc = splitDisciplines(adding.discipline ?? '')
    const fitOf = (m: Member): boolean => projDisc.length > 0 && splitDisciplines(m.discipline ?? '').some((d) => projDisc.includes(d))
    const q = pickQuery.trim().toLowerCase()
    return activeMembers(members)
      .filter((m) => !already.has(String(m.id)))
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({ m, fit: fitOf(m), load: loadByMember.get(String(m.id)) ?? 0 }))
      .sort((a, b) => (b.fit ? 1 : 0) - (a.fit ? 1 : 0) || a.load - b.load || a.m.name.localeCompare(b.m.name))
  }, [adding, members, membersOn, loadByMember, pickQuery])

  // Filter which project rows show in the grid (by name/client and discipline).
  const { filtered, bar } = useFilters(projects as unknown as Row[], {
    searchKeys: ['name', 'client', 'discipline'],
    searchPlaceholder: 'Search projects…',
    selects: [{ key: 'discipline', label: 'Discipline' }]
  })
  const shownProjects = filtered as unknown as Project[]

  return (
    <div className="tab-content work-alloc-page">
      <div className="tab-toolbar">
        <div className="tab-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!embedded && <button className="btn btn-secondary btn-sm" onClick={onClose}><Icon name="arrowLeft" size={14} /> Back</button>}
          <span className="toolbar-progress" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="calendar" size={16} /> Work Allocation</span>
        </div>
        <div className="tab-toolbar-right">
          <button className="btn btn-secondary btn-sm" onClick={() => shiftDate(-1)}><Icon name="chevronLeft" size={14} /> Prev</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setDate(iso(new Date()))}>Today</button>
          <button className="btn btn-secondary btn-sm" onClick={() => shiftDate(1)}>Next <Icon name="chevronRight" size={14} /></button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 150 }} />
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Icon name="download" size={14} /> CSV</button>
        </div>
      </div>
      <div className="wa-datehead"><strong>{fmtDate(date)}</strong> — {isLead ? 'add/remove people, or drag a name into another role column (this project only)' : 'allocation for this day'}</div>

      {projects.length > 0 && bar}
      {projects.length === 0 ? (
        <EmptyState icon="folder" title="No projects yet" hint="Create projects, then allocate people to them per day here." />
      ) : (
        <div className="table-wrap" style={{ padding: 0 }}>
          <table className="alloc-grid">
            <thead>
              <tr>
                <th className="alloc-name">Project</th>
                <th style={{ width: 80 }}>Quoted hrs</th>
                {COLS.map((c) => <th key={c}>{c}</th>)}
                {isLead && <th style={{ width: 84 }}>Assign</th>}
              </tr>
            </thead>
            <tbody>
              {shownProjects.length === 0 ? (
                <tr><td colSpan={COLS.length + (isLead ? 3 : 2)} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 18 }}>No projects match the filters.</td></tr>
              ) : shownProjects.map((p) => (
                <tr key={p.id}>
                  <td className="alloc-name">
                    <strong>{p.name}</strong>
                    {p.type ? <span className="badge badge-design" style={{ marginLeft: 6 }}>{p.type}</span> : null}
                    {p.client ? <span className="alloc-disc"> · {p.client}</span> : null}
                  </td>
                  <td>{p.quoted_hours || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  {COLS.map((c) => roleCell(p, c))}
                  {isLead && <td><button className="btn btn-secondary btn-xs" onClick={() => { setAdding(p); setPickQuery('') }}><Icon name="userPlus" size={13} /> Add</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="attach-hint">People sit in their role’s column by default. {isLead ? 'Drag a name into another column to override their role for that one project/day; click ✕ to remove. Allocation is per day.' : 'Staffing is managed by Team Leads and Managers.'}</p>

      {adding && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setAdding(null)}>
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-header">
              <h3>Allocate to “{adding.name}” · {fmtDate(date)}</h3>
              <button className="btn-icon" onClick={() => setAdding(null)}><Icon name="close" size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="search-box" style={{ marginBottom: 10 }}>
                <Icon name="search" size={15} />
                <input type="text" autoFocus placeholder="Search members…" value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} />
              </div>
              <p className="attach-hint" style={{ marginTop: 0 }}>Ranked by best fit (discipline match), then who’s least allocated today.</p>
              <div className="assign-list">
                {candidates.length === 0 ? <div className="attach-empty">No more members to add.</div> : candidates.map(({ m, fit, load: ld }) => (
                  <button key={m.id} className="assign-row" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => { addMember(adding.id, m.id); setAdding(null) }}>
                    <span className="assign-name">{m.name}</span>
                    <span className="badge badge-not-started">{m.role}</span>
                    {fit && <span className="badge badge-on-going" title="Discipline matches this project">fit</span>}
                    <span className={`workload-pill${ld === 0 ? ' free' : ''}`} title="projects allocated today">{ld} today</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setAdding(null)}>Done</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
