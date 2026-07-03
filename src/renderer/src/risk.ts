// Shared project-health / risk assessment. Used by the Home dashboard badges,
// the Executive dashboard, the PDF status report, and the weekly email digest.

export type RiskLevel = 'Healthy' | 'Watch' | 'At-risk'

export interface RiskInput {
  stage: string // overall: On-going | On-hold | Completed (or legacy)
  endDate?: string
  quotedHours: number
  loggedHours: number
  tasks: { status?: unknown; deadline?: unknown; updated_at?: unknown }[]
  timesheets: { date?: unknown }[]
  openItems: number // open RFIs + open/pending queries
  quietDays?: number // threshold; default 7
}

export interface RiskResult {
  level: RiskLevel
  score: number
  reasons: string[]
}

const QUIET_DEFAULT = 7
const today = (): Date => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const parse = (v: unknown): Date | null => {
  const s = String(v ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d
}
const daysBetween = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / 86400000)

function normStage(s: string): 'On-going' | 'On-hold' | 'Completed' {
  if (s === 'Completed' || s === 'Closed') return 'Completed' // 'Closed' is the new "done"
  if (s === 'On-hold' || s === 'On Hold') return 'On-hold'
  return 'On-going' // includes 'Yet to start' & 'Dispatched' (still active)
}

/**
 * Severe signals weigh 2, mild signals 1. score ≥3 → At-risk, 1–2 → Watch, 0 → Healthy.
 * Completed projects are always Healthy.
 */
export function assessRisk(i: RiskInput): RiskResult {
  const stage = normStage(i.stage)
  if (stage === 'Completed') return { level: 'Healthy', score: 0, reasons: [] }

  const now = today()
  const quietDays = i.quietDays ?? QUIET_DEFAULT
  let score = 0
  const reasons: string[] = []
  const add = (weight: number, reason: string): void => { score += weight; reasons.push(reason) }

  // 1. Deadline slipping — past target end date and not complete.
  const end = parse(i.endDate)
  if (end) {
    const overdueDays = daysBetween(now, end)
    if (overdueDays > 0) add(2, `${overdueDays}d past target end date`)
    else if (overdueDays >= -3) add(1, 'Target end date within 3 days')
  }

  // 2. Hours overrun vs quoted.
  if (i.quotedHours > 0) {
    const used = i.loggedHours / i.quotedHours
    if (used > 1) add(2, `Over quoted hours (${Math.round(used * 100)}%)`)
    else if (used >= 0.9) add(1, `Near quoted hours (${Math.round(used * 100)}%)`)
  }

  // 3. Gone quiet — only meaningful for On-going work.
  if (stage === 'On-going') {
    const dates: number[] = []
    for (const t of i.timesheets) { const d = parse(t.date); if (d) dates.push(d.getTime()) }
    for (const t of i.tasks) { const d = parse(t.updated_at); if (d) dates.push(d.getTime()) }
    if (dates.length) {
      const last = new Date(Math.max(...dates))
      const idle = daysBetween(now, last)
      if (idle >= quietDays * 2) add(2, `No activity for ${idle} days`)
      else if (idle >= quietDays) add(1, `No activity for ${idle} days`)
    }
  }

  // 4. Open RFIs/queries + overdue tasks.
  const overdueTasks = i.tasks.filter((t) => {
    const d = parse(t.deadline); return d && daysBetween(now, d) > 0 && t.status !== 'Done'
  }).length
  if (overdueTasks >= 3) add(2, `${overdueTasks} overdue tasks`)
  else if (overdueTasks >= 1) add(1, `${overdueTasks} overdue task${overdueTasks > 1 ? 's' : ''}`)
  if (i.openItems >= 5) add(1, `${i.openItems} open RFIs/queries`)

  const level: RiskLevel = score >= 3 ? 'At-risk' : score >= 1 ? 'Watch' : 'Healthy'
  return { level, score, reasons }
}

export const RISK_COLOR: Record<RiskLevel, string> = {
  Healthy: '#22c55e',
  Watch: '#f59e0b',
  'At-risk': '#ef4444'
}
