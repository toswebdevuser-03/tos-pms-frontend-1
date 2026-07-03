import { useState, useEffect, useCallback } from 'react'
import Donut from '../components/charts/Donut'
import Bars from '../components/charts/Bars'
import BurnUp from '../components/charts/BurnUp'
import CountUp from '../components/CountUp'
import Icon, { IconName } from '../components/Icon'
import SimilarProjects from '../components/SimilarProjects'
import { DashboardSkeleton } from '../components/Skeleton'
import { Member, Project } from '../types'
import { useApp } from '../context/AppContext'
import { assessRisk } from '../risk'
import { buildBurnUp, forecast, VERDICT_LABEL, VERDICT_COLOR, relativeDate } from '../forecast'
import { buildProjectReportHtml } from '../report'
import { num, productiveHours as productiveOfRow } from '../lib/hours'
import { useEscapeKey } from '../lib/useEscapeKey'

type DashWidgetKey = 'kpis' | 'forecast' | 'charts'
const DASH_WIDGET_LABELS: Record<DashWidgetKey, string> = { kpis: 'KPI cards', forecast: 'Budget burn-up & forecast', charts: 'Charts' }
const DASH_WIDGET_KEYS = Object.keys(DASH_WIDGET_LABELS) as DashWidgetKey[]
const DASH_WIDGETS_LS_KEY = 'tos_projdash_widgets'
function loadDashWidgetPrefs(): Record<DashWidgetKey, boolean> {
  const all: Record<DashWidgetKey, boolean> = { kpis: true, forecast: true, charts: true }
  try { return { ...all, ...JSON.parse(localStorage.getItem(DASH_WIDGETS_LS_KEY) || '{}') } } catch { return all }
}

interface Props {
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
  quotedHours?: number
  onNavigate?: (tab: string) => void
  project?: Project
  overall?: string
}

type Row = Record<string, unknown>
const COLORS = { blue: '#3b82f6', green: '#22c55e', amber: '#f59e0b', red: '#ef4444', purple: '#a78bfa', slate: '#94a3b8' }

function StatCard({ icon, label, value, sub, accent, onClick }: { icon: IconName; label: string; value: string | number; sub?: string; accent: string; onClick?: () => void }) {
  return (
    <div className={`kpi-card${onClick ? ' kpi-click' : ''}`} onClick={onClick} title={onClick ? `Open ${label}` : undefined}>
      <div className="kpi-icon" style={{ background: `${accent}22`, color: accent }}><Icon name={icon} size={22} /></div>
      <div className="kpi-body">
        <div className="kpi-value"><CountUp value={value} /></div>
        <div className="kpi-label">{label}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
      {onClick && <span className="kpi-go" aria-hidden>→</span>}
    </div>
  )
}

export default function DashboardTab({ projectId, projectName, onToast, quotedHours = 0, onNavigate, project, overall }: Props) {
  const { isAdmin } = useApp() // Project Lead+ may see quoted/budget; Employees see only logged (exhausted) hrs
  const [data, setData] = useState<Record<string, Row[]>>({})
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [widgets, setWidgets] = useState<Record<DashWidgetKey, boolean>>(loadDashWidgetPrefs)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  useEscapeKey(() => setCustomizeOpen(false))
  const toggleWidget = (k: DashWidgetKey): void => setWidgets((w) => {
    const next = { ...w, [k]: !w[k] }
    localStorage.setItem(DASH_WIDGETS_LS_KEY, JSON.stringify(next))
    return next
  })

  const load = useCallback(async () => {
    const types = ['rfi', 'query', 'dispatch', 'wip', 'qc', 'task', 'timesheet', 'standard', 'scope', 'input']
    const out: Record<string, Row[]> = {}
    await Promise.all(types.map(async (t) => {
      const res = await window.api.items.getByProject(projectId, t)
      if (res.ok) out[t] = res.data as Row[]
    }))
    setData(out)
    const mres = await window.api.projectMembers.get(projectId)
    if (mres.ok) setMembers(mres.data as Member[])
    setLoading(false)
  }, [projectId])

  useEffect(() => { setLoading(true); load() }, [load])

  const rfi = data.rfi ?? [], query = data.query ?? [], dispatch = data.dispatch ?? []
  // Pending manual timesheet entries don't count until a Team Lead approves them.
  const wip = data.wip ?? [], qc = data.qc ?? [], task = data.task ?? [], ts = (data.timesheet ?? []).filter((t: Record<string, unknown>) => !t.pending)
  const standard = data.standard ?? [], scope = data.scope ?? [], input = data.input ?? []
  const go = (tab: string) => onNavigate ? (() => onNavigate(tab)) : undefined

  const count = (rows: Row[], k: string, v: string): number => rows.filter((r) => r[k] === v).length

  // task completion donut + %
  const taskDone = count(task, 'status', 'Done')
  const taskProg = count(task, 'status', 'In Progress')
  const taskTodo = count(task, 'status', 'Not Started')
  const totalWeight = task.reduce((s, t) => s + (num(t.weight) || 1), 0)
  const earned = task.reduce((s, t) => s + (num(t.weight) || 1) * (t.status === 'Done' ? 1 : t.status === 'In Progress' ? 0.5 : 0), 0)
  const pct = totalWeight ? Math.round((earned / totalWeight) * 100) : 0

  // hours by category
  const hourCats = [
    { label: 'Execution', value: ts.reduce((s, t) => s + num(t.execution_hrs), 0), color: COLORS.blue },
    { label: 'Discussion', value: ts.reduce((s, t) => s + num(t.discussion_hrs), 0), color: COLORS.purple },
    { label: 'QC', value: ts.reduce((s, t) => s + num(t.qc_hrs), 0), color: COLORS.green },
    { label: 'IT issue', value: ts.reduce((s, t) => s + num(t.it_issue_hrs), 0), color: COLORS.amber },
    { label: 'Correction', value: ts.reduce((s, t) => s + num(t.correction_hrs), 0), color: COLORS.red },
    { label: 'Overtime', value: ts.reduce((s, t) => s + num(t.overtime_hrs), 0), color: COLORS.slate }
  ]
  const totalHours = ts.reduce((s, t) => s + num(t.total_hrs), 0)
  // Budget is measured in PRODUCTIVE hours (execution + overtime), matching the
  // Timesheet tab's rule and the forecast/risk engines.
  const productiveHours = Math.round(ts.reduce((s, t) => s + productiveOfRow(t), 0) * 10) / 10
  const productivePct = quotedHours ? Math.round((productiveHours / quotedHours) * 100) : 0

  // Forward-looking budget analytics (productive hrs vs quote — see forecast.ts).
  const burn = buildBurnUp(ts)
  const fc = forecast({ timesheets: ts, quoted: quotedHours, endDate: project?.end_date, taskPct: pct })

  // hours by member
  const byMember = members.map((m) => ({
    label: m.name,
    value: ts.filter((t) => String(t.member_id) === String(m.id)).reduce((s, t) => s + num(t.total_hrs), 0),
    color: COLORS.blue
  })).filter((b) => b.value > 0)

  // RFI / Query status bars (combined)
  const rq = [...rfi, ...query]
  const rfiBars = [
    { label: 'Open', value: count(rq, 'status', 'Open'), color: COLORS.blue },
    { label: 'Pending', value: count(rq, 'status', 'Pending'), color: COLORS.amber },
    { label: 'Closed', value: count(rq, 'status', 'Closed'), color: COLORS.green },
    { label: 'Resolved', value: count(rq, 'status', 'Resolved'), color: COLORS.purple }
  ]
  const qcPass = count(qc, 'result', 'Pass'), qcFail = count(qc, 'result', 'Fail'), qcPend = count(qc, 'result', 'Pending')

  // Dispatch status breakdown (the card caption must reflect real statuses, not a fixed "sent").
  const dispSent = count(dispatch, 'status', 'Sent')
  const dispAck = count(dispatch, 'status', 'Acknowledged')
  const dispDraft = count(dispatch, 'status', 'Draft')
  const dispSub = dispatch.length === 0 ? 'none yet'
    : [dispDraft ? `${dispDraft} draft` : '', dispSent ? `${dispSent} sent` : '', dispAck ? `${dispAck} ack'd` : ''].filter(Boolean).join(' · ')

  const exportPowerBI = async () => {
    const res = await window.api.powerbi.export()
    if (res.ok && res.data?.dir) onToast(`Power BI data exported to ${res.data.dir}`)
    else if (res.ok) onToast('Export cancelled')
    else onToast(res.error ?? 'Export failed', 'error')
  }

  const statusPdf = async () => {
    const logged = productiveHours
    const risk = assessRisk({
      stage: overall ?? 'On-going', endDate: project?.end_date, quotedHours: quotedHours, loggedHours: logged,
      tasks: task as { status?: unknown; deadline?: unknown; updated_at?: unknown }[],
      timesheets: ts as { date?: unknown }[], openItems: count(rfi, 'status', 'Open') + count(rfi, 'status', 'Pending') + count(query, 'status', 'Open') + count(query, 'status', 'Pending')
    })
    const html = buildProjectReportHtml({
      name: projectName, client: project?.client ?? '', location: project?.location ?? '', discipline: project?.discipline ?? '',
      stage: overall ?? 'On-going', startDate: project?.start_date, endDate: project?.end_date,
      quoted: quotedHours, logged, taskDone, taskTotal: task.length, taskPct: pct,
      rfiTotal: rfi.length, rfiOpen: count(rfi, 'status', 'Open') + count(rfi, 'status', 'Pending'),
      queryTotal: query.length, queryOpen: count(query, 'status', 'Open') + count(query, 'status', 'Pending'),
      dispatch: dispatch.length, wip: wip.length, qcPass, qcFail, qcPend, standards: standard.length, members: members.length, risk,
      forecast: fc
    })
    const res = await window.api.report.pdf(html, `${projectName}_status`)
    if (res.ok && res.data?.filePath) onToast('Status report saved')
    else if (res.ok) onToast('Export cancelled')
    else onToast(res.error ?? 'Report failed', 'error')
  }

  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="tab-toolbar-left"><span className="toolbar-progress">Overview · {projectName}</span></div>
        <div className="tab-toolbar-right">
          <div className="widget-picker-wrap">
            <button className="btn btn-secondary btn-sm" onClick={() => setCustomizeOpen((v) => !v)}><Icon name="grid" size={15} /> Customize</button>
            {customizeOpen && (
              <>
                <div className="widget-picker-backdrop" onClick={() => setCustomizeOpen(false)} />
                <div className="widget-picker" role="dialog" aria-label="Customize dashboard">
                  <div className="widget-picker-head">Show on this dashboard</div>
                  {DASH_WIDGET_KEYS.map((wk) => (
                    <label key={wk} className="widget-picker-row">
                      <input type="checkbox" checked={widgets[wk]} onChange={() => toggleWidget(wk)} />
                      {DASH_WIDGET_LABELS[wk]}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={statusPdf}><Icon name="file" size={15} /> Status PDF</button>
          <button className="btn btn-secondary btn-sm" onClick={exportPowerBI}><Icon name="download" size={15} /> Export for Power BI</button>
          <button className="btn btn-secondary btn-sm" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>
        </div>
      </div>

      {loading ? <DashboardSkeleton /> : (
      <div className="dashboard">
        {widgets.kpis && (
        <div className="kpi-grid">
          <StatCard icon="folder" label="Scope" value={scope.length} sub="items" accent={COLORS.blue} onClick={go('Scope')} />
          <StatCard icon="download" label="Input" value={input.length} sub="received" accent={COLORS.purple} onClick={go('Input')} />
          <StatCard icon="send" label="RFIs/Queries" value={rfi.length + query.length} sub={`${count(rfi, 'status', 'Open') + count(query, 'status', 'Open')} open`} accent={COLORS.blue} onClick={go('RFI/Queries')} />
          <StatCard icon="upload" label="Dispatches" value={dispatch.length} sub={dispSub} accent={COLORS.green} onClick={go('Dispatch')} />
          <StatCard icon="clipboard" label="WIP Items" value={wip.length} sub={`${count(wip, 'status', 'Achieved')} achieved`} accent={COLORS.amber} onClick={go('WIP')} />
          <StatCard icon="checkSquare" label="Tasks" value={`${taskDone}/${task.length}`} sub={`${pct}% complete`} accent={COLORS.blue} onClick={go('Tasks')} />
          <StatCard icon="checkCircle" label="QA/QC" value={qc.length} sub={`${qcPass} pass · ${qcFail} fail`} accent={qcFail ? COLORS.red : COLORS.green} onClick={go('QC')} />
          <StatCard icon="clock" label={isAdmin ? 'Productive Hrs' : 'Hrs Used'} value={productiveHours} sub={isAdmin && quotedHours ? `of ${quotedHours} quoted · ${productivePct}%` : `${Math.round(totalHours * 10) / 10} total logged`} accent={COLORS.slate} onClick={go('Timesheet')} />
          {isAdmin && (
            <StatCard icon="hourglass" label="Remaining Hrs" value={quotedHours ? Math.round((quotedHours - productiveHours) * 10) / 10 : '—'} sub={quotedHours ? `${productivePct}% used (productive)` : 'set quoted hrs'} accent={quotedHours && productiveHours > quotedHours ? COLORS.red : COLORS.green} onClick={go('Timesheet')} />
          )}
          <StatCard icon="ruler" label="Standards" value={standard.length} sub="documented" accent={COLORS.purple} onClick={go('Standards')} />
        </div>
        )}

        {widgets.forecast && isAdmin && burn.points.length > 0 && (
          <div className="forecast-card">
            <div className="forecast-head">
              <h4><Icon name="trendingUp" size={16} /> Budget Burn-up &amp; Forecast</h4>
              <span className="forecast-verdict" style={{ color: VERDICT_COLOR[fc.verdict], background: `${VERDICT_COLOR[fc.verdict]}1f` }}>
                <span className="risk-dot" style={{ background: VERDICT_COLOR[fc.verdict] }} />{VERDICT_LABEL[fc.verdict]}
              </span>
            </div>
            <div className="forecast-body">
              <div className="forecast-chart"><BurnUp points={burn.points} forecast={fc} /></div>
              <div className="forecast-stats">
                <div className="fc-stat">
                  <span className="fc-lbl">Productive logged</span>
                  <span className="fc-val">{fc.loggedProductive}h{quotedHours ? ` / ${quotedHours}` : ''}</span>
                  <span className="fc-sub">{fc.usedPct != null ? `${fc.usedPct}% of quote` : 'no quote set'}</span>
                </div>
                <div className="fc-stat">
                  <span className="fc-lbl">Recent pace</span>
                  <span className="fc-val">{fc.dailyRate}<span className="fc-unit">h/day</span></span>
                  <span className="fc-sub">last {fc.windowDays} days</span>
                </div>
                {fc.projectedFinal != null && (
                  <div className="fc-stat">
                    <span className="fc-lbl">Projected at finish</span>
                    <span className="fc-val" style={{ color: fc.verdict === 'over' ? VERDICT_COLOR.over : undefined }}>~{fc.projectedFinal}h</span>
                    <span className="fc-sub">{fc.projectedFinalPct != null ? `${fc.projectedFinalPct}% of quote` : ''}{fc.overBy ? ` · +${fc.overBy}h over` : ''}</span>
                  </div>
                )}
                {quotedHours > 0 && (
                  <div className="fc-stat">
                    <span className="fc-lbl">Budget runs out</span>
                    <span className="fc-val" style={{ color: fc.verdict === 'over' ? VERDICT_COLOR.over : undefined }}>
                      {fc.remaining != null && fc.remaining <= 0 ? 'Exceeded' : fc.daysToExhaust != null ? `~${fc.daysToExhaust}d` : 'Beyond pace'}
                    </span>
                    <span className="fc-sub">{fc.remaining != null && fc.remaining <= 0 ? `${Math.abs(fc.remaining)}h over` : relativeDate(fc.exhaustDate)}</span>
                  </div>
                )}
                {fc.endDate && fc.projectedAtDeadline != null && (
                  <div className="fc-stat">
                    <span className="fc-lbl">At target end date</span>
                    <span className="fc-val">~{fc.projectedAtDeadline}h</span>
                    <span className="fc-sub">{fc.projectedPctAtDeadline != null ? `${fc.projectedPctAtDeadline}% of quote` : ''}</span>
                  </div>
                )}
              </div>
            </div>
            {quotedHours <= 0 && <div className="forecast-hint"><Icon name="help" size={13} /> Set the project's quoted hours (edit the project) to unlock budget forecasting.</div>}
          </div>
        )}

        {widgets.charts && (
        <div className="chart-grid">
          <div className="chart-card">
            <h4>Task Completion</h4>
            <div className="chart-center">
              <Donut
                segments={[
                  { label: 'Done', value: taskDone, color: COLORS.green },
                  { label: 'In Progress', value: taskProg, color: COLORS.amber },
                  { label: 'Not Started', value: taskTodo, color: COLORS.slate }
                ]}
                centerLabel={`${pct}%`}
                centerSub={`${taskDone}/${task.length} done`}
              />
            </div>
            <div className="legend">
              <span><i style={{ background: COLORS.green }} />Done {taskDone}</span>
              <span><i style={{ background: COLORS.amber }} />In progress {taskProg}</span>
              <span><i style={{ background: COLORS.slate }} />Not started {taskTodo}</span>
            </div>
          </div>

          <div className="chart-card">
            <h4>Hours by Category</h4>
            <Bars data={hourCats} unit="h" />
          </div>

          <div className="chart-card">
            <h4>Hours by Member</h4>
            <Bars data={byMember} unit="h" />
          </div>

          <div className="chart-card">
            <h4>RFI / Query Status</h4>
            <Bars data={rfiBars} />
          </div>

          <div className="chart-card">
            <h4>QA/QC Results</h4>
            <Bars data={[
              { label: 'Pass', value: qcPass, color: COLORS.green },
              { label: 'Fail', value: qcFail, color: COLORS.red },
              { label: 'Pending', value: qcPend, color: COLORS.amber }
            ]} />
          </div>

          <SimilarProjects projectId={projectId} />
        </div>
        )}
      </div>
      )}
    </div>
  )
}
