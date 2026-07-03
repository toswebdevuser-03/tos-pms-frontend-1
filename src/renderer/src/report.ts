// Builds a self-contained, print-ready HTML status report for a single project.
// Rendered to PDF by the main process (handlers/report.ts).

import { RiskResult } from './risk'
import { Forecast, VERDICT_LABEL, relativeDate } from './forecast'

export interface ReportData {
  name: string
  client: string
  location: string
  discipline: string
  stage: string
  startDate?: string
  endDate?: string
  quoted: number
  logged: number
  taskDone: number
  taskTotal: number
  taskPct: number
  rfiTotal: number
  rfiOpen: number
  queryTotal: number
  queryOpen: number
  dispatch: number
  wip: number
  qcPass: number
  qcFail: number
  qcPend: number
  standards: number
  members: number
  risk: RiskResult
  forecast?: Forecast
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c))
const RISK_HEX: Record<string, string> = { Healthy: '#16a34a', Watch: '#d97706', 'At-risk': '#dc2626' }
const FC_HEX: Record<string, string> = { over: '#dc2626', tight: '#d97706', under: '#16a34a', unknown: '#64748b' }

function kpi(label: string, value: string | number, sub = ''): string {
  return `<div class="kpi"><div class="kpi-v">${esc(value)}</div><div class="kpi-l">${esc(label)}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}</div>`
}

export function buildProjectReportHtml(d: ReportData): string {
  const usedPct = d.quoted ? Math.round((d.logged / d.quoted) * 100) : 0
  const riskHex = RISK_HEX[d.risk.level] ?? '#64748b'
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const dates = [d.startDate, d.endDate].filter(Boolean).join('  →  ') || '—'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(d.name)} — Status</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px 36px; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 14px; margin-bottom: 20px; }
  .brand { font-size: 12px; letter-spacing: .5px; text-transform: uppercase; color: #64748b; font-weight: 700; }
  h1 { font-size: 23px; margin: 4px 0 6px; }
  .meta { color: #475569; font-size: 12.5px; }
  .gen { text-align: right; font-size: 11px; color: #94a3b8; }
  .badges { margin: 4px 0; }
  .badge { display: inline-block; padding: 3px 11px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-right: 6px; }
  .risk-banner { display: flex; align-items: center; gap: 12px; border: 1px solid ${riskHex}55; background: ${riskHex}14; border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; }
  .risk-dot { width: 12px; height: 12px; border-radius: 50%; background: ${riskHex}; flex-shrink: 0; }
  .risk-lvl { font-weight: 800; color: ${riskHex}; font-size: 15px; }
  .risk-reasons { color: #475569; font-size: 12.5px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
  .kpi-v { font-size: 22px; font-weight: 800; }
  .kpi-l { font-size: 11.5px; color: #64748b; margin-top: 2px; }
  .kpi-s { font-size: 10.5px; color: #94a3b8; margin-top: 2px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .5px; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 22px 0 12px; }
  .bar { height: 8px; background: #eef2f8; border-radius: 5px; overflow: hidden; margin: 6px 0; }
  .bar > div { height: 100%; background: #2563eb; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  td, th { text-align: left; padding: 7px 10px; border-bottom: 1px solid #eef2f8; }
  th { color: #64748b; font-size: 11px; text-transform: uppercase; }
  .foot { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10.5px; color: #94a3b8; text-align: center; }
</style></head><body>
  <div class="head">
    <div>
      <div class="brand">Tesla Outsourcing Services · Project Status Report</div>
      <h1>${esc(d.name)}</h1>
      <div class="meta">${esc([d.client, d.location].filter(Boolean).join(' · ') || 'No client / location')}</div>
      <div class="badges">
        ${d.discipline ? `<span class="badge" style="background:#dbeafe;color:#1d4ed8">${esc(d.discipline)}</span>` : ''}
        <span class="badge" style="background:#e2e8f0;color:#334155">${esc(d.stage || 'On-going')}</span>
      </div>
      <div class="meta">Timeline: ${esc(dates)}</div>
    </div>
    <div class="gen">Generated<br>${esc(generated)}</div>
  </div>

  <div class="risk-banner">
    <span class="risk-dot"></span>
    <div>
      <div class="risk-lvl">${esc(d.risk.level)}</div>
      <div class="risk-reasons">${d.risk.reasons.length ? esc(d.risk.reasons.join(' · ')) : 'No issues detected'}</div>
    </div>
  </div>

  <div class="kpis">
    ${kpi('Task progress', `${d.taskPct}%`, `${d.taskDone}/${d.taskTotal} done`)}
    ${kpi('Productive hrs', Math.round(d.logged * 10) / 10, d.quoted ? `of ${d.quoted} quoted · ${usedPct}%` : 'no quote set')}
    ${kpi('Open RFIs', d.rfiOpen, `of ${d.rfiTotal} total`)}
    ${kpi('Open queries', d.queryOpen, `of ${d.queryTotal} total`)}
    ${kpi('QA/QC', `${d.qcPass}✓ / ${d.qcFail}✗`, `${d.qcPend} pending`)}
    ${kpi('Dispatches', d.dispatch)}
    ${kpi('WIP items', d.wip)}
    ${kpi('Team', d.members, 'members')}
  </div>

  <h2>Task completion</h2>
  <div class="bar"><div style="width:${d.taskPct}%"></div></div>
  <div class="meta">${d.taskDone} of ${d.taskTotal} tasks complete (${d.taskPct}%).</div>

  ${d.quoted ? `<h2>Productive hours vs quoted</h2>
  <div class="bar"><div style="width:${Math.min(usedPct, 100)}%;background:${usedPct > 100 ? '#dc2626' : '#2563eb'}"></div></div>
  <div class="meta">${Math.round(d.logged * 10) / 10} productive hours of ${d.quoted} quoted used (${usedPct}%). Productive = execution + overtime.</div>` : ''}

  ${d.forecast && d.forecast.hasData && d.forecast.verdict !== 'unknown' ? `<h2>Budget forecast</h2>
  <div class="risk-banner" style="border-color:${FC_HEX[d.forecast.verdict]}55;background:${FC_HEX[d.forecast.verdict]}14">
    <span class="risk-dot" style="background:${FC_HEX[d.forecast.verdict]}"></span>
    <div>
      <div class="risk-lvl" style="color:${FC_HEX[d.forecast.verdict]}">${esc(VERDICT_LABEL[d.forecast.verdict])}</div>
      <div class="risk-reasons">${d.forecast.projectedFinal != null
        ? `Projected ~${d.forecast.projectedFinal}h at finish${d.forecast.projectedFinalPct != null ? ` (${d.forecast.projectedFinalPct}% of quote)` : ''}${d.forecast.overBy ? ` · ${d.forecast.overBy}h over budget` : ''}.`
        : 'Insufficient history for a projection.'} Recent pace ${d.forecast.dailyRate}h/day (productive).${d.forecast.exhaustDate && d.forecast.verdict !== 'under' ? ` At this pace the quoted budget is exhausted ${esc(relativeDate(d.forecast.exhaustDate))}.` : ''}</div>
    </div>
  </div>` : ''}

  <h2>Summary</h2>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>RFIs (open / total)</td><td>${d.rfiOpen} / ${d.rfiTotal}</td></tr>
    <tr><td>Queries (open / total)</td><td>${d.queryOpen} / ${d.queryTotal}</td></tr>
    <tr><td>Dispatches</td><td>${d.dispatch}</td></tr>
    <tr><td>WIP items</td><td>${d.wip}</td></tr>
    <tr><td>QA/QC (pass / fail / pending)</td><td>${d.qcPass} / ${d.qcFail} / ${d.qcPend}</td></tr>
    <tr><td>Standards documented</td><td>${d.standards}</td></tr>
    <tr><td>Team members</td><td>${d.members}</td></tr>
  </table>

  <div class="foot">TOS Tracker · Tesla Outsourcing Services — generated ${esc(generated)}</div>
</body></html>`
}

export interface DigestRow {
  name: string
  discipline: string
  stage: string
  level: 'Healthy' | 'Watch' | 'At-risk'
  reasons: string[]
  taskPct: number
  logged: number
  quoted: number
}

// Compact HTML email summarising portfolio status + risks (weekly digest).
export function buildDigestHtml(rows: DigestRow[]): string {
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
  const atRisk = rows.filter((r) => r.level === 'At-risk')
  const watch = rows.filter((r) => r.level === 'Watch')
  const healthy = rows.filter((r) => r.level === 'Healthy').length
  const row = (r: DigestRow): string => {
    const hex = RISK_HEX[r.level] ?? '#64748b'
    const used = r.quoted ? `${Math.round((r.logged / r.quoted) * 100)}% hrs` : ''
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8"><strong>${esc(r.name)}</strong>${r.discipline ? `<span style="color:#94a3b8"> · ${esc(r.discipline)}</span>` : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8"><span style="color:${hex};font-weight:700">${esc(r.level)}</span></td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8;color:#475569;font-size:12px">${esc(r.reasons.join(' · ') || '—')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8;color:#475569">${r.taskPct}%${used ? ` · ${used}` : ''}</td>
    </tr>`
  }
  const section = (title: string, list: DigestRow[], color: string): string => list.length
    ? `<h3 style="margin:18px 0 6px;color:${color};font-size:14px">${esc(title)} (${list.length})</h3>
       <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${list.map(row).join('')}</tbody></table>`
    : ''

  return `<div style="font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#0f172a;max-width:680px;margin:0 auto">
    <div style="border-bottom:3px solid #2563eb;padding-bottom:10px;margin-bottom:8px">
      <div style="font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#64748b;font-weight:700">Tesla Outsourcing Services</div>
      <h2 style="margin:4px 0 2px;font-size:20px">Weekly Project Digest</h2>
      <div style="color:#94a3b8;font-size:12px">${esc(generated)}</div>
    </div>
    <p style="color:#475569">${rows.length} projects · <strong style="color:#dc2626">${atRisk.length} at-risk</strong> · <strong style="color:#d97706">${watch.length} watch</strong> · <span style="color:#16a34a">${healthy} healthy</span></p>
    ${section('At-risk', atRisk, '#dc2626')}
    ${section('Needs watching', watch, '#d97706')}
    ${atRisk.length === 0 && watch.length === 0 ? '<p style="color:#16a34a;font-weight:600">All projects are healthy. 👍</p>' : ''}
    <p style="margin-top:24px;color:#94a3b8;font-size:11px">Sent from TOS Tracker · Tesla Outsourcing Services</p>
  </div>`
}
