import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { Project, Member } from '../types'
import Icon, { IconName, DisciplineIcon } from './Icon'
import { assessRisk, RiskResult, RISK_COLOR } from '../risk'
import { num, productiveHours } from '../lib/hours'
import { useData } from '../context/DataContext'
import Donut from './charts/Donut'
import Bars from './charts/Bars'
import GanttTimeline from './GanttTimeline'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  projects: Project[]
  statusMap: Record<number, string>
  members: Member[]
  isManager: boolean
  canQuote: boolean
  onSelect: (id: number) => void
  onQuote: () => void
  // When set, the cross-project aggregates (task KPIs, workload, heatmap) are
  // limited to these project ids — used by the "view a lower employee's dashboard"
  // feature so the numbers reflect only that employee's projects.
  scopeIds?: number[]
}

type Row = Record<string, unknown>
const C = { blue: '#3b82f6', green: '#22c55e', amber: '#f59e0b', red: '#ef4444', purple: '#a78bfa', slate: '#94a3b8', cyan: '#06b6d4' }

// Per-user (per-browser) Home Dashboard widget visibility — matches every other
// display preference in this app (theme, groupBy, fullscreen modals: localStorage,
// not a DB setting), so it's simple and instantly available with no backend change.
type WidgetKey = 'kpis' | 'statusChart' | 'taskChart' | 'workloadChart' | 'attention' | 'projectsTable' | 'gantt' | 'heatmap'
const WIDGET_LABELS: Record<WidgetKey, string> = {
  kpis: 'KPI cards', statusChart: 'Project Status chart', taskChart: 'Task Completion chart',
  workloadChart: 'Workload chart', attention: 'Attention needed', projectsTable: 'Active Projects list',
  gantt: 'Timeline (Gantt)', heatmap: 'Team Workload heatmap'
}
const WIDGET_KEYS = Object.keys(WIDGET_LABELS) as WidgetKey[]
const DEFAULT_WIDGETS: Record<WidgetKey, boolean> = Object.fromEntries(WIDGET_KEYS.map((k) => [k, true])) as Record<WidgetKey, boolean>
const WIDGETS_LS_KEY = 'tos_home_widgets'

function loadWidgetPrefs(): Record<WidgetKey, boolean> {
  try { return { ...DEFAULT_WIDGETS, ...JSON.parse(localStorage.getItem(WIDGETS_LS_KEY) || '{}') } } catch { return DEFAULT_WIDGETS }
}

function stage(s: string): 'On-going' | 'On-hold' | 'Completed' {
  if (s === 'Completed' || s === 'Closed') return 'Completed' // 'Closed' is the new "done"
  if (s === 'On-hold' || s === 'On Hold') return 'On-hold'
  return 'On-going' // 'Yet to start' & 'Dispatched' count as active here
}

// Eased count-up animation for KPI numbers.
function useCountUp(target: number, ms = 650): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (t: number): void => {
      const p = Math.min(1, (t - start) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return n
}

function Kpi({ icon, label, value, sub, accent, onClick, active }: {
  icon: IconName; label: string; value: number; sub?: string; accent: string; onClick?: () => void; active?: boolean
}): React.JSX.Element {
  const display = useCountUp(value)
  return (
    <div className={`kpi-card${onClick ? ' kpi-click' : ''}${active ? ' kpi-active' : ''}`} onClick={onClick}>
      <div className="kpi-icon" style={{ background: `${accent}22`, color: accent }}><Icon name={icon} size={22} /></div>
      <div className="kpi-body">
        <div className="kpi-value">{display}</div>
        <div className="kpi-label">{label}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </div>
  )
}

type Filter = 'all' | 'NotStarted' | 'On-going' | 'On-hold' | 'Completed'

export default function HomeDashboard({ projects, statusMap, members, canQuote, onSelect, onQuote, scopeIds }: Props) {
  const { tasks: allTasksRaw, timesheets: allTimesheetsRaw, tasksByProject: tasksFor, timesheetsByProject: tsFor, rfisByProject, memberIdsForProject } = useData()
  // Optionally limit the global aggregates to a project subset (view-as-employee).
  const scopeSet = useMemo(() => (scopeIds ? new Set(scopeIds) : null), [scopeIds])
  const tasks = useMemo(() => (scopeSet ? allTasksRaw.filter((t) => scopeSet.has(Number(t.project_id))) : allTasksRaw), [allTasksRaw, scopeSet])
  const timesheets = useMemo(() => (scopeSet ? allTimesheetsRaw.filter((t) => scopeSet.has(Number(t.project_id))) : allTimesheetsRaw), [allTimesheetsRaw, scopeSet])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'Man-month' | 'Miscellaneous'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const openByProject = useMemo(() => {
    const open: Record<number, number> = {}
    for (const p of projects) {
      open[p.id] = rfisByProject(p.id).filter((x) => x.status === 'Open' || x.status === 'Pending').length
    }
    return open
  }, [projects, rfisByProject])

  const riskOf = useCallback((p: Project): RiskResult => assessRisk({
    stage: statusMap[p.id] ?? 'On-going',
    endDate: p.end_date,
    quotedHours: num(p.quoted_hours),
    loggedHours: tsFor(p.id).reduce((s, r) => s + productiveHours(r), 0),
    tasks: tasksFor(p.id) as { status?: unknown; deadline?: unknown; updated_at?: unknown }[],
    timesheets: tsFor(p.id) as { date?: unknown }[],
    openItems: openByProject[p.id] ?? 0
  }), [statusMap, tsFor, tasksFor, openByProject])

  const allTasks = useMemo(() => tasks, [tasks])

  // Team workload heatmap: member × last 14 days, coloured by hours logged.
  const heat = useMemo(() => {
    const days: { key: string; label: string }[] = []
    const today = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      days.push({ key, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })
    }
    const byMember = new Map<string, Map<string, number>>()
    for (const t of timesheets) {
      const mid = String(t.member_id ?? '')
      const date = String(t.date ?? '').slice(0, 10)
      if (!mid || !date) continue
      const hrs = num(t.total_hrs)
      if (!byMember.has(mid)) byMember.set(mid, new Map())
      const m = byMember.get(mid)!
      m.set(date, (m.get(date) ?? 0) + hrs)
    }
    const rows = members
      .map((mb) => ({ member: mb, cells: days.map((d) => byMember.get(String(mb.id))?.get(d.key) ?? 0) }))
      .filter((r) => r.cells.some((c) => c > 0))
    return { days, rows }
  }, [timesheets, members])

  const heatColor = (h: number): string => {
    if (h <= 0) return 'var(--card)'
    if (h <= 2) return 'rgba(34,197,94,0.25)'
    if (h <= 4) return 'rgba(34,197,94,0.45)'
    if (h <= 6) return 'rgba(34,197,94,0.65)'
    return 'rgba(34,197,94,0.9)'
  }

  // A project is "yet to start" when it's active (On-going) but no productive
  // hours have been logged against it yet — i.e. approved/created, work not begun.
  const notStartedOf = useCallback((p: Project, st: string): boolean =>
    st === 'On-going' && tsFor(p.id).reduce((s, r) => s + productiveHours(r), 0) === 0, [tsFor])

  const k = useMemo(() => {
    let ongoing = 0, onhold = 0, completed = 0, notStarted = 0
    for (const p of projects) {
      const st = stage(statusMap[p.id] ?? 'On-going')
      if (st === 'Completed') completed++
      else if (st === 'On-hold') onhold++
      else { ongoing++; if (notStartedOf(p, st)) notStarted++ }
    }
    const done = allTasks.filter((t) => t.status === 'Done').length
    const prog = allTasks.filter((t) => t.status === 'In Progress').length
    const todo = allTasks.filter((t) => t.status === 'Not Started').length
    return { ongoing, onhold, completed, notStarted, taskTotal: allTasks.length, done, prog, todo, pct: allTasks.length ? Math.round((done / allTasks.length) * 100) : 0 }
  }, [projects, statusMap, allTasks, notStartedOf])

  // Workload: tasks assigned per member (top 6).
  const workload = useMemo(() => {
    const m = new Map<string, number>()
    allTasks.forEach((t) => { if (t.assigned_member_id) { const id = String(t.assigned_member_id); m.set(id, (m.get(id) ?? 0) + 1) } })
    return members
      .map((mb) => ({ label: mb.name.split(' ')[0], value: m.get(String(mb.id)) ?? 0, color: C.blue }))
      .filter((b) => b.value > 0).sort((a, b) => b.value - a.value).slice(0, 6)
  }, [allTasks, members])

  const toggle = (f: Filter): void => setFilter((cur) => (cur === f ? 'all' : f))

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects
      .map((p) => {
        const tks = tasksFor(p.id)
        const done = tks.filter((t) => t.status === 'Done').length
        const st = stage(statusMap[p.id] ?? 'On-going')
        return { p, total: tks.length, done, pct: tks.length ? Math.round((done / tks.length) * 100) : 0, members: memberIdsForProject(p.id).length, st, notStarted: notStartedOf(p, st), risk: riskOf(p) }
      })
      .filter((r) => filter === 'all' ? true : filter === 'NotStarted' ? r.notStarted : r.st === filter)
      .filter((r) => typeFilter === 'all' || (r.p.type ?? '') === typeFilter)
      .filter((r) => {
        // Date range: keep projects whose start–end span overlaps [from, to].
        if (!dateFrom && !dateTo) return true
        const s = String(r.p.start_date || r.p.end_date || '').slice(0, 10)
        const e = String(r.p.end_date || r.p.start_date || '').slice(0, 10)
        if (!s && !e) return false
        if (dateFrom && e && e < dateFrom) return false
        if (dateTo && s && s > dateTo) return false
        return true
      })
      .filter((r) => !q || r.p.name.toLowerCase().includes(q) || (r.p.client ?? '').toLowerCase().includes(q) || (r.p.discipline ?? '').toLowerCase().includes(q))
  }, [projects, search, filter, typeFilter, dateFrom, dateTo, tasksFor, memberIdsForProject, statusMap, riskOf, notStartedOf])

  // Group the visible project rows by client name (A→Z; "No client" last).
  const groupedRows = useMemo(() => {
    const m = new Map<string, typeof rows>()
    for (const r of rows) {
      const c = (r.p.client ?? '').trim() || 'No client'
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(r)
    }
    return [...m.entries()].sort((a, b) => {
      if (a[0] === 'No client') return 1
      if (b[0] === 'No client') return -1
      return a[0].localeCompare(b[0])
    })
  }, [rows])

  // Projects needing attention (Watch / At-risk), worst first.
  const attention = useMemo(() => projects
    .map((p) => ({ p, risk: riskOf(p) }))
    .filter((r) => r.risk.level !== 'Healthy')
    .sort((a, b) => b.risk.score - a.risk.score), [projects, riskOf])

  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('pt_onboarded') === '1')
  const dismissOnboard = (): void => { localStorage.setItem('pt_onboarded', '1'); setOnboarded(true) }

  // Which dashboard widgets this user wants to see — persisted per-browser.
  const [widgets, setWidgets] = useState<Record<WidgetKey, boolean>>(loadWidgetPrefs)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  useEscapeKey(() => setCustomizeOpen(false))
  const toggleWidget = (k: WidgetKey): void => setWidgets((w) => {
    const next = { ...w, [k]: !w[k] }
    localStorage.setItem(WIDGETS_LS_KEY, JSON.stringify(next))
    return next
  })

  return (
    <div className="home-dash">
      {!onboarded && (
        <div className="onboard-hint">
          <span className="onboard-icon"><Icon name="sparkles" size={20} /></span>
          <span className="onboard-text">
            Welcome! Press <kbd>Ctrl</kbd>+<kbd>K</kbd> to search anything, <kbd>n</kbd> for a new quotation, and open <strong>☰ Workspace</strong> (top-left) for members, allocation &amp; data export. Projects are created by approving a quotation. Click any KPI card to filter.
          </span>
          <button className="btn-icon onboard-x" onClick={dismissOnboard} title="Dismiss"><Icon name="close" size={16} /></button>
        </div>
      )}
      <div className="home-head">
        <div>
          <h1>Dashboard</h1>
          <p className="home-sub">Overview of all your projects, tasks and team.</p>
        </div>
        <div className="home-head-actions">
          <div className="widget-picker-wrap">
            <button className="btn btn-secondary" onClick={() => setCustomizeOpen((v) => !v)}><Icon name="grid" size={16} /> Customize</button>
            {customizeOpen && (
              <>
                <div className="widget-picker-backdrop" onClick={() => setCustomizeOpen(false)} />
                <div className="widget-picker" role="dialog" aria-label="Customize dashboard">
                  <div className="widget-picker-head">Show on this dashboard</div>
                  {WIDGET_KEYS.map((wk) => (
                    <label key={wk} className="widget-picker-row">
                      <input type="checkbox" checked={widgets[wk]} onChange={() => toggleWidget(wk)} />
                      {WIDGET_LABELS[wk]}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          {canQuote && <button className="btn btn-primary" onClick={onQuote}><Icon name="quote" size={16} /> Miscellaneous (quote)</button>}
        </div>
      </div>

      {widgets.kpis && (
        <div className="kpi-grid">
          <Kpi icon="clock" label="Yet to start" value={k.notStarted} sub="approved · not begun" accent={C.cyan} onClick={() => toggle('NotStarted')} active={filter === 'NotStarted'} />
          <Kpi icon="play" label="On-going" value={k.ongoing} sub="filter" accent={C.green} onClick={() => toggle('On-going')} active={filter === 'On-going'} />
          <Kpi icon="pause" label="On-hold" value={k.onhold} sub="filter" accent={C.amber} onClick={() => toggle('On-hold')} active={filter === 'On-hold'} />
          <Kpi icon="checkCircle" label="Completed" value={k.completed} sub="filter" accent={C.purple} onClick={() => toggle('Completed')} active={filter === 'Completed'} />
          <Kpi icon="folder" label="Total Projects" value={projects.length} sub="click to clear filter" accent={C.blue} onClick={() => setFilter('all')} active={filter === 'all'} />
        </div>
      )}

      {(widgets.statusChart || widgets.taskChart || widgets.workloadChart) && (
        <div className="home-charts">
          {widgets.statusChart && (
            <div className="chart-card">
              <h4>Project Status</h4>
              <div className="chart-center">
                <Donut
                  segments={[
                    { label: 'On-going', value: k.ongoing, color: C.green },
                    { label: 'On-hold', value: k.onhold, color: C.amber },
                    { label: 'Completed', value: k.completed, color: C.purple }
                  ]}
                  centerLabel={`${projects.length}`}
                  centerSub="projects"
                />
              </div>
              <div className="legend">
                <span><i style={{ background: C.green }} />On-going {k.ongoing}</span>
                <span><i style={{ background: C.amber }} />On-hold {k.onhold}</span>
                <span><i style={{ background: C.purple }} />Completed {k.completed}</span>
              </div>
            </div>
          )}

          {widgets.taskChart && (
            <div className="chart-card">
              <h4>Task Completion</h4>
              <div className="chart-center">
                <Donut
                  segments={[
                    { label: 'Done', value: k.done, color: C.green },
                    { label: 'In Progress', value: k.prog, color: C.amber },
                    { label: 'Not Started', value: k.todo, color: C.slate }
                  ]}
                  centerLabel={`${k.pct}%`}
                  centerSub={`${k.done}/${k.taskTotal} done`}
                />
              </div>
              <div className="legend">
                <span><i style={{ background: C.green }} />Done {k.done}</span>
                <span><i style={{ background: C.amber }} />In progress {k.prog}</span>
                <span><i style={{ background: C.slate }} />Not started {k.todo}</span>
              </div>
            </div>
          )}

          {widgets.workloadChart && (
            <div className="chart-card">
              <h4>Workload · tasks per member</h4>
              <Bars data={workload} />
            </div>
          )}
        </div>
      )}

      {widgets.attention && attention.length > 0 && (
        <div className="home-panel attention-panel">
          <div className="home-panel-head">
            <h3><Icon name="bellRing" size={16} /> Attention needed <span className="attention-count">{attention.length}</span></h3>
          </div>
          <div className="attention-list">
            {attention.slice(0, 6).map(({ p, risk }) => (
              <div key={p.id} className="attention-row" onClick={() => onSelect(p.id)}>
                <span className="risk-dot" style={{ background: RISK_COLOR[risk.level] }} />
                <span className="attention-name"><DisciplineIcon discipline={p.discipline} size={14} /> {p.name}</span>
                <span className="attention-reasons">{risk.reasons.join(' · ')}</span>
                <span className="risk-badge" style={{ color: RISK_COLOR[risk.level], background: `${RISK_COLOR[risk.level]}1f` }}>{risk.level}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {widgets.projectsTable && (
      <div className="home-panel">
        <div className="home-panel-head">
          <h3>Active Projects</h3>
          <div className="home-panel-tools">
            <div className="chip-bar">
              {(['all', 'NotStarted', 'On-going', 'On-hold', 'Completed'] as Filter[]).map((f) => (
                <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'NotStarted' ? 'Yet to start' : f}</button>
              ))}
            </div>
            <div className="chip-bar">
              {(['all', 'Man-month', 'Miscellaneous'] as const).map((t) => (
                <button key={t} className={`chip${typeFilter === t ? ' active' : ''}`} onClick={() => setTypeFilter(t)}>{t === 'all' ? 'All types' : t}</button>
              ))}
            </div>
            <div className="filter-dates" title="Show projects active between these dates">
              <Icon name="calendar" size={14} />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From" />
              <span>–</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To" />
              {(dateFrom || dateTo) && <button className="btn-icon" title="Clear dates" onClick={() => { setDateFrom(''); setDateTo('') }}><Icon name="close" size={14} /></button>}
            </div>
            <div className="search-box" style={{ marginTop: 0, maxWidth: 220 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="empty-table"><p>{projects.length === 0 ? 'No projects yet.' : 'No projects match this filter.'}</p></div>
        ) : (
          <div className="table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th>Project</th><th style={{ width: 110 }}>Health</th><th style={{ width: 120 }}>Discipline</th><th style={{ width: 100 }}>Status</th><th style={{ width: 210 }}>Task progress</th><th style={{ width: 70 }}>Team</th></tr>
              </thead>
              <tbody>
                {groupedRows.map(([client, grp]) => (
                  <Fragment key={client}>
                    <tr className="home-group-row">
                      <td colSpan={6}><span className="home-group-name"><Icon name="folder" size={13} /> {client}</span><span className="home-group-count">{grp.length}</span></td>
                    </tr>
                    {grp.map(({ p, total, done, pct, members: mc, st, risk }) => (
                      <tr key={p.id} className="home-row" onClick={() => onSelect(p.id)}>
                        <td>
                          <span className="home-proj">
                            <span className="home-proj-icon"><DisciplineIcon discipline={p.discipline} size={16} /></span>
                            <span><strong>{p.name}</strong></span>
                          </span>
                        </td>
                        <td><span className="risk-badge" style={{ color: RISK_COLOR[risk.level], background: `${RISK_COLOR[risk.level]}1f` }} title={risk.reasons.join(' · ') || 'No issues detected'}><span className="risk-dot" style={{ background: RISK_COLOR[risk.level] }} />{risk.level}</span></td>
                        <td>{p.discipline ? <span className="badge badge-design">{p.discipline}</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                        <td><span className={`badge badge-${st.toLowerCase()}`}>{st}</span></td>
                        <td>
                          <div className="home-prog">
                            <div className="home-prog-bar"><div className="home-prog-fill" style={{ width: `${pct}%` }} /></div>
                            <span className="home-prog-txt">{done}/{total} · {pct}%</span>
                          </div>
                        </td>
                        <td>{mc ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="users" size={13} /> {mc}</span> : '—'}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {widgets.gantt && <GanttTimeline projects={projects} statusMap={statusMap} onSelect={onSelect} />}

      {widgets.heatmap && heat.rows.length > 0 && (
        <div className="home-panel" style={{ marginTop: 16 }}>
          <div className="home-panel-head">
            <h3>Team Workload · last 14 days</h3>
            <span className="heat-legend">less <i style={{ background: heatColor(1) }} /><i style={{ background: heatColor(3) }} /><i style={{ background: heatColor(5) }} /><i style={{ background: heatColor(8) }} /> more (hrs)</span>
          </div>
          <div className="heatmap-wrap">
            <table className="heatmap">
              <thead>
                <tr><th className="heat-name"> </th>{heat.days.map((d) => <th key={d.key} className="heat-day">{d.label}</th>)}</tr>
              </thead>
              <tbody>
                {heat.rows.map(({ member, cells }) => (
                  <tr key={member.id}>
                    <td className="heat-name">{member.name}</td>
                    {cells.map((c, i) => (
                      <td key={i} className="heat-cell" title={`${member.name} · ${heat.days[i].label}: ${c}h`}>
                        <span style={{ background: heatColor(c) }}>{c > 0 ? c : ''}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
