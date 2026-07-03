import { useState, useEffect, useCallback, useMemo } from 'react'
import { Project, Client } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { assessRisk, RiskResult, RISK_COLOR } from '../risk'
import { num, productiveHours, totalHours } from '../lib/hours'
import { nameById } from '../lib/people'
import Icon, { IconName, DisciplineIcon } from './Icon'
import Donut from './charts/Donut'
import ConfirmDialog from './ConfirmDialog'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  mode: 'data' | 'dashboard'
  projects: Project[]
  onClose: () => void
  onSelect: (id: number) => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}

type Row = Record<string, unknown>
const C = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444', blue: '#4c8dff', purple: '#a78bfa', slate: '#94a3b8' }
const round1 = (n: number): number => Math.round(n * 10) / 10
function stage(s: string): 'On-going' | 'On-hold' | 'Completed' {
  if (s === 'Completed' || s === 'Closed') return 'Completed'
  if (s === 'On-hold' || s === 'On Hold') return 'On-hold'
  return 'On-going'
}

interface PRow {
  p: Project; st: 'On-going' | 'On-hold' | 'Completed'; risk: RiskResult
  quoted: number; logged: number; taskDone: number; taskTotal: number; members: number
}
interface Group { key: string; client?: Client; name: string; rows: PRow[] }

function Kpi({ icon, label, value, sub, accent }: { icon: IconName; label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon" style={{ background: `${accent}22`, color: accent }}><Icon name={icon} size={22} /></div>
      <div className="kpi-body"><div className="kpi-value">{value}</div><div className="kpi-label">{label}</div>{sub && <div className="kpi-sub">{sub}</div>}</div>
    </div>
  )
}

// Unified Clients screen: the registry (left rail, with add/edit/delete) IS the
// navigation for the per-client dashboard (right). Both features in one interface.
export default function ClientsModal({ mode, projects, onClose, onSelect, onToast }: Props) {
  useEscapeKey(onClose)
  const { isLead, isAdmin, members } = useApp() // isLead: manage registry; isAdmin: see quoted hrs
  const canManage = mode === 'data' && isLead
  const { tasksByProject, timesheetsByProject, memberIdsForProject, statusMap } = useData()
  const [clients, setClients] = useState<Client[]>([])
  const [openByProject, setOpenByProject] = useState<Record<number, number>>({})
  const [selKey, setSelKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Registry add/edit form (null = closed).
  const [editing, setEditing] = useState<{ id?: number; name: string; company: string } | null>(null)
  const [saving, setSaving] = useState(false)
  // Date-range timesheet download for the selected client.
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<Client | null>(null)

  const loadClients = useCallback(async () => {
    const res = await window.api.clients.list()
    if (res.ok) setClients(res.data as Client[])
    else onToast(res.error ?? 'Could not load clients', 'error')
  }, [onToast])
  useEffect(() => { loadClients() }, [loadClients])

  // Open RFI/Query counts per project (one factor in the risk score).
  useEffect(() => {
    let alive = true
    ;(async () => {
      const open: Record<number, number> = {}
      await Promise.all(projects.map(async (p) => {
        const [r, q] = await Promise.all([
          window.api.items.getByProject(p.id, 'rfi'),
          window.api.items.getByProject(p.id, 'query')
        ])
        const o1 = r.ok ? (r.data as Row[]).filter((x) => x.status === 'Open' || x.status === 'Pending').length : 0
        const o2 = q.ok ? (q.data as Row[]).filter((x) => x.status === 'Open' || x.status === 'Pending').length : 0
        open[p.id] = o1 + o2
      }))
      if (alive) setOpenByProject(open)
    })()
    return () => { alive = false }
  }, [projects])

  const rowOf = useCallback((p: Project): PRow => {
    const tks = tasksByProject(p.id)
    const ts = timesheetsByProject(p.id)
    const logged = round1(ts.reduce((s, r) => s + productiveHours(r), 0))
    const st = stage(statusMap[p.id] ?? 'On-going')
    return {
      p, st, quoted: num(p.quoted_hours), logged, members: memberIdsForProject(p.id).length,
      taskDone: tks.filter((t) => t.status === 'Done').length, taskTotal: tks.length,
      risk: assessRisk({
        stage: statusMap[p.id] ?? 'On-going', endDate: p.end_date, quotedHours: num(p.quoted_hours), loggedHours: logged,
        tasks: tks as { status?: unknown; deadline?: unknown; updated_at?: unknown }[],
        timesheets: ts as { date?: unknown }[], openItems: openByProject[p.id] ?? 0
      })
    }
  }, [tasksByProject, timesheetsByProject, memberIdsForProject, statusMap, openByProject])

  // Resolve a project to a registry client (by id, else by name), else an
  // unregistered bucket keyed on the raw client name.
  const groups = useMemo<Group[]>(() => {
    const byId = new Map(clients.map((c) => [c.id, c]))
    const byName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c]))
    const m = new Map<string, Group>()
    for (const c of clients) m.set(`c#${c.id}`, { key: `c#${c.id}`, client: c, name: c.name, rows: [] })
    for (const p of projects) {
      let g: Group | undefined
      if (p.client_id && byId.has(p.client_id)) { const c = byId.get(p.client_id)!; g = m.get(`c#${c.id}`) }
      else {
        const nm = (p.client ?? '').trim()
        const c = nm ? byName.get(nm.toLowerCase()) : undefined
        if (c) g = m.get(`c#${c.id}`)
        else { const key = nm ? `n#${nm.toLowerCase()}` : 'none'; if (!m.has(key)) m.set(key, { key, name: nm || 'No client', rows: [] }); g = m.get(key) }
      }
      g?.rows.push(rowOf(p))
    }
    return [...m.values()].sort((a, b) => {
      if (a.name === 'No client') return 1
      if (b.name === 'No client') return -1
      return a.name.localeCompare(b.name)
    })
  }, [clients, projects, rowOf])

  const shownGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q) || (g.client?.code ?? '').toLowerCase().includes(q) || (g.client?.company ?? '').toLowerCase().includes(q))
  }, [groups, search])

  // Default selection: first client that has projects, else the first group.
  useEffect(() => {
    if (selKey && groups.some((g) => g.key === selKey)) return
    const first = groups.find((g) => g.rows.length > 0) ?? groups[0]
    if (first) setSelKey(first.key)
  }, [groups, selKey])

  const sel = groups.find((g) => g.key === selKey) ?? null
  const rows = sel?.rows ?? []

  const k = useMemo(() => {
    const ongoing = rows.filter((r) => r.st === 'On-going').length
    const onhold = rows.filter((r) => r.st === 'On-hold').length
    const completed = rows.filter((r) => r.st === 'Completed').length
    const atRisk = rows.filter((r) => r.risk.level === 'At-risk').length
    const watch = rows.filter((r) => r.risk.level === 'Watch').length
    const taskDone = rows.reduce((s, r) => s + r.taskDone, 0)
    const taskTotal = rows.reduce((s, r) => s + r.taskTotal, 0)
    const logged = round1(rows.reduce((s, r) => s + r.logged, 0))
    const quoted = rows.reduce((s, r) => s + r.quoted, 0)
    return {
      count: rows.length, ongoing, onhold, completed, atRisk, watch, taskDone, taskTotal,
      taskPct: taskTotal ? Math.round((taskDone / taskTotal) * 100) : 0,
      logged, quoted, util: quoted ? Math.round((logged / quoted) * 100) : 0
    }
  }, [rows])

  const saveClient = async (): Promise<void> => {
    if (!editing || !editing.name.trim()) { onToast('Client name is required', 'error'); return }
    setSaving(true)
    try {
      const res = editing.id
        ? await window.api.clients.update(editing.id, { name: editing.name, company: editing.company })
        : await window.api.clients.create({ name: editing.name, company: editing.company })
      if (!res.ok) { onToast(res.error ?? 'Save failed — name may already exist', 'error'); return }
      onToast(editing.id ? 'Client updated' : 'Client added')
      if (!editing.id && (res.data as { id?: number })?.id) setSelKey(`c#${(res.data as { id: number }).id}`)
      setEditing(null); loadClients()
    } finally { setSaving(false) }
  }
  const removeClient = async (c: Client): Promise<void> => {
    const res = await window.api.clients.delete(c.id)
    if (res.ok) { onToast('Client deleted'); setEditing(null); loadClients() }
    else onToast(res.error ?? 'Delete failed', 'error')
  }
  const open = (id: number): void => { onSelect(id); onClose() }

  // Download every (approved) timesheet entry across the selected client's projects
  // within [from, to] — blank date = no limit. Excel via the client-side exporter.
  const downloadTimesheet = async (): Promise<void> => {
    if (!sel) return
    if (fromDate && toDate && fromDate > toDate) { onToast('From date is after To date', 'error'); return }
    setDownloading(true)
    try {
      const all: Array<Row & { __project: string }> = []
      rows.forEach((r) => timesheetsByProject(r.p.id).forEach((t) => all.push({ ...t, __project: r.p.name })))
      const inRange = all.filter((t) => {
        const d = String(t.date ?? '').slice(0, 10)
        if (!d) return false
        if (fromDate && d < fromDate) return false
        if (toDate && d > toDate) return false
        return true
      }).sort((a, b) => String(a.date).localeCompare(String(b.date)))
      if (!inRange.length) { onToast('No timesheet entries in that date range', 'error'); return }
      const out: Row[] = inRange.map((t) => ({
        Date: String(t.date ?? ''),
        Member: nameById(members, t.member_id, '—'),
        Project: t.__project,
        Task: String(t.task ?? ''),
        Execution: num(t.execution_hrs), Discussion: num(t.discussion_hrs), QC: num(t.qc_hrs),
        'IT issue': num(t.it_issue_hrs), Overtime: num(t.overtime_hrs), Correction: num(t.correction_hrs),
        Productive: productiveHours(t), Total: totalHours(t)
      }))
      const label = `${sel.name}_${fromDate || 'start'}_to_${toDate || 'today'}`
      const res = await window.api.excel.export('client_timesheet', label, out)
      if (res.ok) onToast(`Downloaded ${inRange.length} timesheet entr${inRange.length === 1 ? 'y' : 'ies'}`)
      else onToast(res.error ?? 'Download failed', 'error')
    } finally { setDownloading(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 1060, maxWidth: '96vw' }}>
        <div className="modal-header">
          <h3><Icon name="building" size={18} /> {mode === 'data' ? 'Client Data' : 'Client Dashboard'}</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="client-dash-layout">
            <div className="client-list">
              <div className="staff-col-head">
                <span>Clients ({groups.length})</span>
                {canManage && <button className="btn-icon" title="New client" onClick={() => setEditing({ name: '', company: '' })}><Icon name="plus" size={16} /></button>}
              </div>
              <div className="filter-search" style={{ margin: '4px 0 8px' }}>
                <Icon name="search" size={14} />
                <input value={search} placeholder="Search clients…" onChange={(e) => setSearch(e.target.value)} />
              </div>
              {shownGroups.map((g) => {
                const risky = g.rows.filter((r) => r.risk.level === 'At-risk').length
                return (
                  <button key={g.key} className={`client-item${selKey === g.key ? ' active' : ''}`} onClick={() => setSelKey(g.key)}>
                    <span className="client-item-name">
                      {g.client && <span className="badge badge-design" style={{ marginRight: 6 }}>{g.client.code}</span>}
                      {g.name}
                    </span>
                    <span className="client-item-meta">
                      {risky > 0 && <span className="risk-dot" style={{ background: RISK_COLOR['At-risk'] }} title={`${risky} at-risk`} />}
                      <span className="client-item-count">{g.rows.length}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="client-detail">
              {editing && (
                <div className="member-form" style={{ marginBottom: 12 }}>
                  <input autoFocus placeholder="Client name *" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  <input placeholder="Company name (optional)" value={editing.company} onChange={(e) => setEditing({ ...editing, company: e.target.value })} />
                  <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveClient}>{editing.id ? 'Update' : 'Add'}</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              )}

              {!sel ? (
                <div className="attach-empty">No clients yet.{canManage ? ' Use “New client” to add one.' : ''}</div>
              ) : (
                <>
                  <div className="client-detail-head">
                    <div>
                      <h3 style={{ margin: 0 }}>{sel.client ? <><span className="badge badge-design" style={{ marginRight: 8 }}>{sel.client.code}</span>{sel.client.name}</> : sel.name}</h3>
                      {sel.client?.company && <div className="attach-hint" style={{ margin: '2px 0 0' }}>{sel.client.company}</div>}
                      {!sel.client && sel.name !== 'No client' && <div className="attach-hint" style={{ margin: '2px 0 0' }}>Not in the registry yet</div>}
                    </div>
                    {canManage && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {sel.client ? (
                          <>
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: sel.client!.id, name: sel.client!.name, company: sel.client!.company || '' })}><Icon name="edit" size={14} /> Edit</button>
                            <button className="btn-icon danger" title="Delete client" onClick={() => setConfirmRemove(sel.client!)}><Icon name="trash" size={16} /></button>
                          </>
                        ) : sel.name !== 'No client' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ name: sel.name, company: '' })}><Icon name="plus" size={14} /> Register client</button>
                        )}
                      </div>
                    )}
                  </div>

                  {mode === 'dashboard' && (
                    <>
                      <div className="ct-download" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none', marginBottom: 12 }}>
                        <div className="ct-download-head"><Icon name="download" size={15} /> Download {sel.name === 'No client' ? 'timesheet' : `${sel.name}’s timesheet`}</div>
                        <p className="attach-hint" style={{ margin: '2px 0 8px' }}>All timesheet entries across {sel.name === 'No client' ? 'these' : `${sel.name}’s`} projects within the date range (leave a date blank for no limit).</p>
                        <div className="ct-download-row">
                          <div className="field"><label>From</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
                          <div className="field"><label>To</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
                          <button className="btn btn-secondary" onClick={downloadTimesheet} disabled={downloading || rows.length === 0}>
                            <Icon name="download" size={15} /> {downloading ? 'Preparing…' : 'Download Excel'}
                          </button>
                        </div>
                      </div>

                      <div className="kpi-grid">
                        <Kpi icon="folder" label="Projects" value={k.count} sub={`${k.ongoing} on-going · ${k.completed} done`} accent={C.blue} />
                        <Kpi icon="bellRing" label="At-risk" value={k.atRisk} sub={`${k.watch} watch`} accent={k.atRisk ? C.red : C.green} />
                        <Kpi icon="checkSquare" label="Tasks" value={`${k.taskDone}/${k.taskTotal}`} sub={`${k.taskPct}% complete`} accent={C.purple} />
                        <Kpi icon="clock" label={isAdmin ? 'Productive Hrs' : 'Hrs Used'} value={k.logged} sub={isAdmin && k.quoted ? `of ${k.quoted} quoted · ${k.util}%` : 'logged'} accent={C.amber} />
                      </div>

                      {k.count > 0 && (
                        <div className="home-charts" style={{ marginTop: 4 }}>
                          <div className="chart-card">
                            <h4>Project Status</h4>
                            <div className="chart-center">
                              <Donut segments={[
                                { label: 'On-going', value: k.ongoing, color: C.green },
                                { label: 'On-hold', value: k.onhold, color: C.amber },
                                { label: 'Completed', value: k.completed, color: C.purple }
                              ]} centerLabel={`${k.count}`} centerSub="projects" />
                            </div>
                            <div className="legend">
                              <span><i style={{ background: C.green }} />On-going {k.ongoing}</span>
                              <span><i style={{ background: C.amber }} />On-hold {k.onhold}</span>
                              <span><i style={{ background: C.purple }} />Completed {k.completed}</span>
                            </div>
                          </div>
                          <div className="chart-card">
                            <h4>Task Completion</h4>
                            <div className="chart-center">
                              <Donut segments={[
                                { label: 'Done', value: k.taskDone, color: C.green },
                                { label: 'Remaining', value: Math.max(k.taskTotal - k.taskDone, 0), color: C.slate }
                              ]} centerLabel={`${k.taskPct}%`} centerSub={`${k.taskDone}/${k.taskTotal}`} />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="home-panel" style={{ marginTop: 12 }}>
                    <div className="home-panel-head"><h3>{sel.name} — projects</h3></div>
                    {rows.length === 0 ? (
                      <div className="empty-table"><p>No projects for this client yet.</p></div>
                    ) : (
                      <div className="table-wrap" style={{ padding: 0 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Project</th><th style={{ width: 110 }}>Type</th><th style={{ width: 100 }}>Health</th>
                              <th style={{ width: 100 }}>Status</th><th style={{ width: 190 }}>Task progress</th>
                              <th style={{ width: 150 }}>{isAdmin ? 'Hrs (used / quoted)' : 'Hrs used'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => {
                              const pct = r.taskTotal ? Math.round((r.taskDone / r.taskTotal) * 100) : 0
                              const used = r.quoted ? Math.round((r.logged / r.quoted) * 100) : 0
                              return (
                                <tr key={r.p.id} className="home-row" onClick={() => open(r.p.id)}>
                                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><DisciplineIcon discipline={r.p.discipline} size={15} /> <strong>{r.p.name}</strong></span></td>
                                  <td>{r.p.type ? <span className="badge badge-design">{r.p.type}</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                                  <td><span className="risk-badge" style={{ color: RISK_COLOR[r.risk.level], background: `${RISK_COLOR[r.risk.level]}1f` }} title={r.risk.reasons.join(' · ') || 'No issues'}><span className="risk-dot" style={{ background: RISK_COLOR[r.risk.level] }} />{r.risk.level}</span></td>
                                  <td><span className={`badge badge-${r.st.toLowerCase()}`}>{r.st}</span></td>
                                  <td>
                                    <div className="home-prog">
                                      <div className="home-prog-bar"><div className="home-prog-fill" style={{ width: `${pct}%` }} /></div>
                                      <span className="home-prog-txt">{r.taskDone}/{r.taskTotal} · {pct}%</span>
                                    </div>
                                  </td>
                                  <td>{isAdmin ? <>{r.logged} / {r.quoted || '—'}{r.quoted ? ` · ${used}%` : ''}</> : r.logged}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {mode === 'data' && !isLead && <span className="attach-hint" style={{ marginRight: 'auto' }}>Only Team Leads and above can add or edit clients.</span>}
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
      {confirmRemove && (
        <ConfirmDialog
          title="Delete client"
          message={`Delete client "${confirmRemove.name}" (${confirmRemove.code})? Projects keep their client name but lose the link. This cannot be undone.`}
          onConfirm={() => { const c = confirmRemove; setConfirmRemove(null); removeClient(c) }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  )
}
