import { useState, useEffect, useCallback, useMemo } from 'react'
import { Project, ProjectStatus, Member } from '../types'
import { assessRisk, RiskResult, RISK_COLOR } from '../risk'
import { forecast, productiveOf, Forecast, VERDICT_COLOR, relativeDate } from '../forecast'
import { buildDigestHtml, DigestRow } from '../report'
import { useApp } from '../context/AppContext'
import { splitDisciplines } from '../disciplines'
import Donut from './charts/Donut'
import Bars from './charts/Bars'
import Icon, { DisciplineIcon } from './Icon'
import { useFilters } from './FilterBar'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  projects: Project[]
  onClose: () => void
  onSelect: (id: number) => void
  onToast?: (msg: string, type?: 'success' | 'error') => void
  initialView?: 'portfolio' | 'discipline'
}

type Row = Record<string, unknown>
const num = (v: unknown): number => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }
const C = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444', blue: '#4c8dff', purple: '#a78bfa', slate: '#94a3b8' }
function stage(s: string): 'On-going' | 'On-hold' | 'Completed' {
  if (s === 'Completed' || s === 'Closed') return 'Completed' // 'Closed' is the new "done"
  if (s === 'On-hold' || s === 'On Hold') return 'On-hold'
  return 'On-going' // 'Yet to start' & 'Dispatched' count as active here
}

interface PRow { p: Project; risk: RiskResult; st: 'On-going' | 'On-hold' | 'Completed'; quoted: number; logged: number; members: number }

export default function ExecDashboard({ projects, onClose, onSelect, onToast, initialView = 'portfolio' }: Props) {
  useEscapeKey(onClose)
  const { members, currentMember, authUser } = useApp()
  const [view, setView] = useState<'portfolio' | 'discipline'>(initialView)
  const [discSel, setDiscSel] = useState<string | null>(null)
  const [discSearch, setDiscSearch] = useState('')
  const [recipient, setRecipient] = useState('')
  const [sending, setSending] = useState(false)
  useEffect(() => { setRecipient(currentMember?.email || authUser?.email || '') }, [currentMember, authUser])
  const [statusMap, setStatusMap] = useState<Record<number, string>>({})
  const [data, setData] = useState<Record<number, { tasks: Row[]; ts: Row[]; open: number; members: number; memberList: Member[] }>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sres = await window.api.projects.statuses()
    const sm: Record<number, string> = {}
    if (sres.ok) (sres.data as ProjectStatus[]).forEach((s) => { if (s.overall) sm[s.project_id] = s.overall })
    const d: Record<number, { tasks: Row[]; ts: Row[]; open: number; members: number; memberList: Member[] }> = {}
    await Promise.all(projects.map(async (p) => {
      const [t, h, r, q, m] = await Promise.all([
        window.api.items.getByProject(p.id, 'task'),
        window.api.items.getByProject(p.id, 'timesheet'),
        window.api.items.getByProject(p.id, 'rfi'),
        window.api.items.getByProject(p.id, 'query'),
        window.api.projectMembers.get(p.id)
      ])
      const openRfi = r.ok ? (r.data as Row[]).filter((x) => x.status === 'Open' || x.status === 'Pending').length : 0
      const openQ = q.ok ? (q.data as Row[]).filter((x) => x.status === 'Open' || x.status === 'Pending').length : 0
      const ml = m.ok ? (m.data as Member[]) : []
      // Exclude pending manual timesheet entries — they don't count until approved.
      d[p.id] = { tasks: t.ok ? (t.data as Row[]) : [], ts: h.ok ? (h.data as Row[]).filter((x) => !x.pending) : [], open: openRfi + openQ, members: ml.length, memberList: ml }
    }))
    setStatusMap(sm); setData(d); setLoading(false)
  }, [projects])
  useEffect(() => { load() }, [load])

  const rows = useMemo<PRow[]>(() => projects.map((p) => {
    const d = data[p.id] ?? { tasks: [], ts: [], open: 0, members: 0 }
    const logged = d.ts.reduce((s, r) => s + productiveOf(r), 0)
    return {
      p, st: stage(statusMap[p.id] ?? 'On-going'), quoted: num(p.quoted_hours), logged, members: d.members,
      risk: assessRisk({
        stage: statusMap[p.id] ?? 'On-going', endDate: p.end_date, quotedHours: num(p.quoted_hours), loggedHours: logged,
        tasks: d.tasks as { status?: unknown; deadline?: unknown; updated_at?: unknown }[],
        timesheets: d.ts as { date?: unknown }[], openItems: d.open
      })
    }
  }), [projects, data, statusMap])

  // Filter bar over the project rows. Flatten the keys the bar searches/selects
  // on, then map the filtered result back to the original PRow objects.
  const filterRows = useMemo(
    () => rows.map((r) => ({ projectName: r.p.name, discipline: r.p.discipline || 'Unassigned', riskLevel: r.risk.level, _row: r })),
    [rows]
  )
  const { filtered: filteredFlat, bar } = useFilters(filterRows, {
    searchKeys: ['projectName'],
    searchPlaceholder: 'Search projects…',
    selects: [
      { key: 'discipline', label: 'Discipline' },
      { key: 'riskLevel', label: 'Risk', options: ['Healthy', 'Watch', 'At-risk'] }
    ]
  })
  const fRows = useMemo(() => filteredFlat.map((f) => f._row as PRow), [filteredFlat])

  const k = useMemo(() => {
    const active = rows.filter((r) => r.st !== 'Completed')
    const healthy = rows.filter((r) => r.risk.level === 'Healthy').length
    const watch = rows.filter((r) => r.risk.level === 'Watch').length
    const atRisk = rows.filter((r) => r.risk.level === 'At-risk').length
    const onTrack = active.length ? Math.round((active.filter((r) => r.risk.level === 'Healthy').length / active.length) * 100) : 100
    const quoted = rows.reduce((s, r) => s + r.quoted, 0)
    const logged = rows.reduce((s, r) => s + r.logged, 0)
    const util = quoted ? Math.round((logged / quoted) * 100) : 0
    return { total: rows.length, active: active.length, healthy, watch, atRisk, onTrack, quoted, logged, util,
      ongoing: rows.filter((r) => r.st === 'On-going').length, onhold: rows.filter((r) => r.st === 'On-hold').length, completed: rows.filter((r) => r.st === 'Completed').length }
  }, [rows])

  // Per-discipline aggregation (over the filtered rows).
  const byDiscipline = useMemo(() => {
    const m = new Map<string, { count: number; atRisk: number; quoted: number; logged: number }>()
    for (const r of fRows) {
      const key = r.p.discipline || 'Unassigned'
      const g = m.get(key) ?? { count: 0, atRisk: 0, quoted: 0, logged: 0 }
      g.count++; if (r.risk.level === 'At-risk') g.atRisk++; g.quoted += r.quoted; g.logged += r.logged
      m.set(key, g)
    }
    return Array.from(m.entries()).map(([d, g]) => ({ d, ...g })).sort((a, b) => b.count - a.count)
  }, [fRows])

  const attention = useMemo(() => fRows.filter((r) => r.risk.level !== 'Healthy').sort((a, b) => b.risk.score - a.risk.score), [fRows])

  // Forward-looking budget forecast per project (productive hrs vs quote).
  const taskPctOf = (tasks: Row[]): number => {
    const totalW = tasks.reduce((s, t) => s + (num(t.weight) || 1), 0)
    const earned = tasks.reduce((s, t) => s + (num(t.weight) || 1) * (t.status === 'Done' ? 1 : t.status === 'In Progress' ? 0.5 : 0), 0)
    return totalW ? Math.round((earned / totalW) * 100) : 0
  }
  const overruns = useMemo<{ p: Project; fc: Forecast }[]>(() => fRows.map((r) => {
    const d = data[r.p.id] ?? { tasks: [], ts: [], open: 0, members: 0 }
    return { p: r.p, st: r.st, fc: forecast({ timesheets: d.ts, quoted: r.quoted, endDate: r.p.end_date, taskPct: taskPctOf(d.tasks) }) }
  }).filter((x) => x.st !== 'Completed' && x.fc.verdict === 'over')
    .sort((a, b) => (b.fc.overBy ?? 0) - (a.fc.overBy ?? 0))
    .map(({ p, fc }) => ({ p, fc })), [fRows, data])

  // ── "By discipline" tab: full discipline roll-up (a project rolls into each of
  //    its disciplines), reusing the portfolio rows + loaded data. ────────────────
  const disciplinesOf = (p: Project): string[] => { const d = splitDisciplines(p.discipline); return d.length ? d : ['Unassigned'] }
  interface DGroup { discipline: string; projects: number; ongoing: number; onhold: number; completed: number; taskTotal: number; taskDone: number; quoted: number; logged: number; members: Set<string> }
  const discGroups = useMemo<DGroup[]>(() => {
    const map = new Map<string, DGroup>()
    for (const r of rows) {
      const d = data[r.p.id] ?? { tasks: [], ts: [], open: 0, members: 0, memberList: [] }
      for (const key of disciplinesOf(r.p)) {
        const g = map.get(key) ?? { discipline: key, projects: 0, ongoing: 0, onhold: 0, completed: 0, taskTotal: 0, taskDone: 0, quoted: 0, logged: 0, members: new Set<string>() }
        g.projects++
        if (r.st === 'Completed') g.completed++; else if (r.st === 'On-hold') g.onhold++; else g.ongoing++
        g.taskTotal += d.tasks.length
        g.taskDone += d.tasks.filter((t) => t.status === 'Done').length
        g.quoted += r.quoted; g.logged += r.logged
        d.memberList.forEach((m) => g.members.add(String(m.id)))
        map.set(key, g)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.projects - a.projects)
  }, [rows, data])
  const shownDisc = useMemo(() => {
    const q = discSearch.trim().toLowerCase()
    return q ? discGroups.filter((g) => g.discipline.toLowerCase().includes(q)) : discGroups
  }, [discGroups, discSearch])
  const discDetail = useMemo(() => {
    if (!discSel) return null
    const list = rows.filter((r) => disciplinesOf(r.p).includes(discSel))
    const mem = new Map<string, Member>()
    const dr = list.map((r) => {
      const d = data[r.p.id] ?? { tasks: [], ts: [], open: 0, members: 0, memberList: [] }
      const done = d.tasks.filter((t) => t.status === 'Done').length
      d.memberList.forEach((m) => mem.set(String(m.id), m))
      return { p: r.p, st: r.st, total: d.tasks.length, done, pct: d.tasks.length ? Math.round((done / d.tasks.length) * 100) : 0, quoted: r.quoted, logged: r.logged, members: d.memberList.length }
    }).sort((a, b) => a.st.localeCompare(b.st) || a.p.name.localeCompare(b.p.name))
    return { rows: dr, members: Array.from(mem.values()) }
  }, [discSel, rows, data])
  const exportDiscCsv = async (): Promise<void> => {
    const out = discGroups.map((g) => ({
      discipline: g.discipline, projects: g.projects, ongoing: g.ongoing, onhold: g.onhold, completed: g.completed,
      task_done: g.taskDone, task_total: g.taskTotal, logged_hours: Math.round(g.logged), quoted_hours: g.quoted, members: g.members.size
    }))
    if (!out.length) return
    await window.api.csv.export('discipline_rollup', 'discipline_rollup', out)
  }

  const open = (id: number): void => { onSelect(id); onClose() }

  const sendDigest = async (): Promise<void> => {
    if (!recipient.trim()) { onToast?.('Enter a recipient email', 'error'); return }
    setSending(true)
    const digestRows: DigestRow[] = rows.map((r) => {
      const tks = data[r.p.id]?.tasks ?? []
      const done = tks.filter((t) => t.status === 'Done').length
      return { name: r.p.name, discipline: r.p.discipline || '', stage: r.st, level: r.risk.level, reasons: r.risk.reasons, taskPct: tks.length ? Math.round((done / tks.length) * 100) : 0, logged: r.logged, quoted: r.quoted }
    })
    const html = buildDigestHtml(digestRows)
    const res = await window.api.email.send({ to: recipient.trim(), subject: `Weekly Project Digest — ${new Date().toLocaleDateString()}`, html })
    setSending(false)
    if (res.ok) onToast?.(`Digest emailed to ${recipient.trim()}`)
    else onToast?.(res.error ?? 'Email failed — check SMTP in Settings', 'error')
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 1040, maxWidth: '96vw' }}>
        <div className="modal-header">
          <h3><Icon name="target" size={18} /> Overall Health</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="exec-tabs">
            <button className={`exec-tab${view === 'portfolio' ? ' active' : ''}`} onClick={() => setView('portfolio')}><Icon name="barChart" size={17} /> Executive Overview</button>
            <button className={`exec-tab${view === 'discipline' ? ' active' : ''}`} onClick={() => { setView('discipline'); setDiscSel(null) }}><Icon name="grid" size={17} /> Discipline Roll-up</button>
          </div>
          {loading ? <div className="attach-empty">Loading…</div> : view === 'portfolio' ? (
            <>
              <div className="kpi-grid">
                <div className="kpi-card"><div className="kpi-icon" style={{ background: `${C.blue}22`, color: C.blue }}><Icon name="folder" size={22} /></div><div className="kpi-body"><div className="kpi-value">{k.total}</div><div className="kpi-label">Projects</div><div className="kpi-sub">{k.active} active</div></div></div>
                <div className="kpi-card"><div className="kpi-icon" style={{ background: `${C.red}22`, color: C.red }}><Icon name="bellRing" size={22} /></div><div className="kpi-body"><div className="kpi-value">{k.atRisk}</div><div className="kpi-label">At-risk</div><div className="kpi-sub">{k.watch} watch</div></div></div>
                <div className="kpi-card"><div className="kpi-icon" style={{ background: `${C.green}22`, color: C.green }}><Icon name="checkCircle" size={22} /></div><div className="kpi-body"><div className="kpi-value">{k.onTrack}%</div><div className="kpi-label">On-track</div><div className="kpi-sub">of active projects</div></div></div>
                <div className="kpi-card"><div className="kpi-icon" style={{ background: `${C.amber}22`, color: C.amber }}><Icon name="clock" size={22} /></div><div className="kpi-body"><div className="kpi-value">{k.util}%</div><div className="kpi-label">Utilization</div><div className="kpi-sub">{Math.round(k.logged)} / {k.quoted || '—'} hrs</div></div></div>
                <div className="kpi-card"><div className="kpi-icon" style={{ background: `${VERDICT_COLOR.over}22`, color: VERDICT_COLOR.over }}><Icon name="trendingUp" size={22} /></div><div className="kpi-body"><div className="kpi-value">{overruns.length}</div><div className="kpi-label">Forecast over</div><div className="kpi-sub">projected past budget</div></div></div>
                <div className="kpi-card"><div className="kpi-icon" style={{ background: `${C.slate}22`, color: C.slate }}><Icon name="users" size={22} /></div><div className="kpi-body"><div className="kpi-value">{members.filter((m: Member) => m.status !== 'left').length}</div><div className="kpi-label">Team</div><div className="kpi-sub">active</div></div></div>
              </div>

              <div className="home-charts">
                <div className="chart-card">
                  <h4>Portfolio Health</h4>
                  <div className="chart-center">
                    <Donut segments={[
                      { label: 'Healthy', value: k.healthy, color: C.green },
                      { label: 'Watch', value: k.watch, color: C.amber },
                      { label: 'At-risk', value: k.atRisk, color: C.red }
                    ]} centerLabel={`${k.total}`} centerSub="projects" />
                  </div>
                  <div className="legend">
                    <span><i style={{ background: C.green }} />Healthy {k.healthy}</span>
                    <span><i style={{ background: C.amber }} />Watch {k.watch}</span>
                    <span><i style={{ background: C.red }} />At-risk {k.atRisk}</span>
                  </div>
                </div>
                <div className="chart-card">
                  <h4>By Stage</h4>
                  <div className="chart-center">
                    <Donut segments={[
                      { label: 'On-going', value: k.ongoing, color: C.green },
                      { label: 'On-hold', value: k.onhold, color: C.amber },
                      { label: 'Completed', value: k.completed, color: C.purple }
                    ]} centerLabel={`${k.ongoing}`} centerSub="on-going" />
                  </div>
                  <div className="legend">
                    <span><i style={{ background: C.green }} />On-going {k.ongoing}</span>
                    <span><i style={{ background: C.amber }} />On-hold {k.onhold}</span>
                    <span><i style={{ background: C.purple }} />Completed {k.completed}</span>
                  </div>
                </div>
                <div className="chart-card">
                  <h4>Projects by Discipline</h4>
                  <Bars data={byDiscipline.map((g) => ({ label: g.d, value: g.count, color: g.atRisk > 0 ? C.amber : C.blue }))} />
                </div>
              </div>

              {rows.length > 0 && bar}

              <div className="home-panel" style={{ marginTop: 4 }}>
                <div className="home-panel-head"><h3><Icon name="bellRing" size={16} /> Needs attention <span className="attention-count">{attention.length}</span></h3></div>
                {attention.length === 0 ? (
                  <div className="attach-empty"><Icon name="checkCircle" size={14} style={{ verticalAlign: '-2px', color: 'var(--success)' }} /> Everything looks healthy.</div>
                ) : (
                  <div className="attention-list">
                    {attention.map(({ p, risk }) => (
                      <div key={p.id} className="attention-row" onClick={() => open(p.id)}>
                        <span className="risk-dot" style={{ background: RISK_COLOR[risk.level] }} />
                        <span className="attention-name"><DisciplineIcon discipline={p.discipline} size={14} /> {p.name}</span>
                        <span className="attention-reasons">{risk.reasons.join(' · ')}</span>
                        <span className="risk-badge" style={{ color: RISK_COLOR[risk.level], background: `${RISK_COLOR[risk.level]}1f` }}>{risk.level}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="home-panel" style={{ marginTop: 16 }}>
                <div className="home-panel-head"><h3><Icon name="trendingUp" size={16} /> Budget forecast — projected overruns {overruns.length > 0 && <span className="attention-count">{overruns.length}</span>}</h3></div>
                {overruns.length === 0 ? (
                  <div className="attach-empty"><Icon name="checkCircle" size={14} style={{ verticalAlign: '-2px', color: 'var(--success)' }} /> No active projects are forecast to exceed their quoted hours at the current pace.</div>
                ) : (
                  <div className="table-wrap" style={{ padding: 0 }}>
                    <table>
                      <thead><tr><th>Project</th><th style={{ width: 150 }}>Logged / Quoted</th><th style={{ width: 80 }}>Pace</th><th style={{ width: 140 }}>Projected finish</th><th style={{ width: 90 }}>Over by</th><th style={{ width: 150 }}>Budget runs out</th></tr></thead>
                      <tbody>
                        {overruns.map(({ p, fc }) => (
                          <tr key={p.id} className="home-row" style={{ cursor: 'pointer' }} onClick={() => open(p.id)}>
                            <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><DisciplineIcon discipline={p.discipline} size={15} /> {p.name}</span></td>
                            <td>{Math.round(fc.loggedProductive)} / {fc.quoted}{fc.usedPct != null ? ` · ${fc.usedPct}%` : ''}</td>
                            <td>{fc.dailyRate}h/d</td>
                            <td style={{ fontWeight: 700 }}>~{fc.projectedFinal}h{fc.projectedFinalPct != null ? ` · ${fc.projectedFinalPct}%` : ''}</td>
                            <td><span className="risk-badge" style={{ color: VERDICT_COLOR.over, background: `${VERDICT_COLOR.over}1f` }}>+{fc.overBy}h</span></td>
                            <td>{fc.remaining != null && fc.remaining <= 0 ? 'Exceeded' : relativeDate(fc.exhaustDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="home-panel" style={{ marginTop: 16 }}>
                <div className="home-panel-head"><h3>Discipline utilization</h3></div>
                <div className="table-wrap" style={{ padding: 0 }}>
                  <table>
                    <thead><tr><th>Discipline</th><th style={{ width: 90 }}>Projects</th><th style={{ width: 90 }}>At-risk</th><th style={{ width: 220 }}>Hours (logged / quoted)</th></tr></thead>
                    <tbody>
                      {byDiscipline.map((g) => {
                        const pct = g.quoted ? Math.round((g.logged / g.quoted) * 100) : 0
                        return (
                          <tr key={g.d}>
                            <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><DisciplineIcon discipline={g.d} size={15} /> {g.d}</span></td>
                            <td>{g.count}</td>
                            <td>{g.atRisk > 0 ? <span className="risk-badge" style={{ color: C.red, background: `${C.red}1f` }}>{g.atRisk}</span> : '—'}</td>
                            <td>
                              <div className="home-prog">
                                <div className="home-prog-bar"><div className="home-prog-fill" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? C.red : 'var(--accent)' }} /></div>
                                <span className="home-prog-txt">{Math.round(g.logged)} / {g.quoted || '—'}{g.quoted ? ` · ${pct}%` : ''}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <>
              {!discSel ? (
                <>
                  <div className="home-panel-head" style={{ marginBottom: 8 }}>
                    <h3><Icon name="grid" size={16} /> All disciplines</h3>
                    {discGroups.length > 0 && <button className="btn btn-secondary btn-sm" onClick={exportDiscCsv}><Icon name="download" size={14} /> CSV</button>}
                  </div>
                  <p className="login-sub" style={{ marginBottom: 12 }}>Projects, tasks and workload aggregated by discipline. Click a card to drill in.</p>
                  <div className="filter-search" style={{ maxWidth: 280, marginBottom: 12 }}>
                    <Icon name="search" size={14} />
                    <input value={discSearch} placeholder="Search disciplines…" onChange={(e) => setDiscSearch(e.target.value)} />
                  </div>
                  {discGroups.length === 0 ? <div className="attach-empty">No projects to roll up.</div> : (
                    <div className="disc-grid">
                      {shownDisc.map((g) => {
                        const donePct = g.taskTotal ? Math.round((g.taskDone / g.taskTotal) * 100) : 0
                        const usedPct = g.quoted ? Math.round((g.logged / g.quoted) * 100) : 0
                        return (
                          <div className="disc-card disc-click" key={g.discipline} onClick={() => setDiscSel(g.discipline)} title={`Open ${g.discipline}`}>
                            <div className="disc-head">
                              <span className="disc-icon"><DisciplineIcon discipline={g.discipline} size={18} /></span>
                              <strong>{g.discipline}</strong>
                              <span className="disc-count">{g.projects} project{g.projects !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="disc-stages">
                              <span className="badge badge-on-going">{g.ongoing} on-going</span>
                              <span className="badge badge-on-hold">{g.onhold} on-hold</span>
                              <span className="badge badge-completed">{g.completed} completed</span>
                            </div>
                            <div className="disc-metric">
                              <div className="disc-metric-label"><span>Tasks</span><span>{g.taskDone}/{g.taskTotal} · {donePct}%</span></div>
                              <div className="bf-bar"><div className="bf-fill" style={{ width: `${donePct}%` }} /></div>
                            </div>
                            <div className="disc-metric">
                              <div className="disc-metric-label"><span>Hours (logged / quoted)</span><span>{Math.round(g.logged)} / {g.quoted || '—'}{g.quoted ? ` · ${usedPct}%` : ''}</span></div>
                              {g.quoted > 0 && <div className="bf-bar"><div className="bf-fill" style={{ width: `${Math.min(usedPct, 100)}%`, background: usedPct > 100 ? 'var(--danger)' : 'var(--accent)' }} /></div>}
                            </div>
                            <div className="disc-foot"><Icon name="users" size={13} />&nbsp;{g.members.size}&nbsp;member{g.members.size !== 1 ? 's' : ''} <span className="disc-drill">Drill in →</span></div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : discDetail && (
                <>
                  <div className="home-panel-head" style={{ marginBottom: 8 }}>
                    <h3><button className="btn-link-back" onClick={() => setDiscSel(null)}>← Disciplines</button> <DisciplineIcon discipline={discSel} size={16} /> {discSel}</h3>
                  </div>
                  <p className="login-sub" style={{ marginBottom: 12 }}>{discDetail.rows.length} project{discDetail.rows.length !== 1 ? 's' : ''} · {discDetail.members.length} member{discDetail.members.length !== 1 ? 's' : ''} in this discipline. Click a project to open it.</p>
                  <div className="table-wrap" style={{ padding: 0 }}>
                    <table>
                      <thead><tr><th>Project</th><th style={{ width: 110 }}>Status</th><th style={{ width: 200 }}>Tasks</th><th style={{ width: 150 }}>Hours</th><th style={{ width: 70 }}>Team</th></tr></thead>
                      <tbody>
                        {discDetail.rows.map((r) => {
                          const usedPct = r.quoted ? Math.round((r.logged / r.quoted) * 100) : 0
                          return (
                            <tr key={r.p.id} className="home-row" onClick={() => open(r.p.id)}>
                              <td><strong>{r.p.name}</strong>{r.p.client && <span className="home-client"> · {r.p.client}</span>}</td>
                              <td><span className={`badge badge-${r.st.toLowerCase()}`}>{r.st}</span></td>
                              <td>
                                <div className="home-prog">
                                  <div className="home-prog-bar"><div className="home-prog-fill" style={{ width: `${r.pct}%` }} /></div>
                                  <span className="home-prog-txt">{r.done}/{r.total} · {r.pct}%</span>
                                </div>
                              </td>
                              <td>{Math.round(r.logged)} / {r.quoted || '—'}{r.quoted ? ` · ${usedPct}%` : ''}</td>
                              <td>{r.members ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="users" size={13} /> {r.members}</span> : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {discDetail.members.length > 0 && (
                    <div className="disc-members">
                      <h4 style={{ margin: '16px 0 8px' }}>Team in {discSel}</h4>
                      <div className="chip-bar" style={{ flexWrap: 'wrap' }}>
                        {discDetail.members.map((m) => <span key={m.id} className="chip" style={{ cursor: 'default' }}>{m.name}{m.role ? ` · ${m.role}` : ''}</span>)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="recipient@email" value={recipient} onChange={(e) => setRecipient(e.target.value)} style={{ width: 220 }} />
            <button className="btn btn-secondary" onClick={sendDigest} disabled={sending}><Icon name="send" size={15} /> {sending ? 'Sending…' : 'Email digest'}</button>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
