/**
 * Canonical timesheet hour math — shared by every feature that reads logged time
 * (Task Allocation, Timesheets, Dashboard, Client timesheet, Performance, Forecast).
 * Previously copy-pasted (HOUR_KEYS / totalOf / usedFor / fmtDur) in 7+ files.
 */
export type Row = Record<string, unknown>

// All hour buckets a timesheet entry can carry.
export const HOUR_KEYS = [
  'execution_hrs', 'discussion_hrs', 'qc_hrs', 'it_issue_hrs', 'overtime_hrs', 'correction_hrs'
] as const

// Hours that count as "productive" output (used by burn-up / utilization).
export const PRODUCTIVE_HOUR_KEYS = ['execution_hrs', 'overtime_hrs'] as const

export const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? ''))
  return isNaN(n) ? 0 : n
}

const sumKeys = (row: Row, keys: readonly string[]): number => keys.reduce((s, k) => s + num(row[k]), 0)

/** Total of every hour bucket on a timesheet row. */
export const totalHours = (row: Row): number => sumKeys(row, HOUR_KEYS)

/** Execution + overtime only (productive output). */
export const productiveHours = (row: Row): number => sumKeys(row, PRODUCTIVE_HOUR_KEYS)

/**
 * Hours logged against a specific task. Prefers the explicit task_id link set by
 * the task timer; falls back to matching the timesheet's `task` text by name.
 */
export function hoursForTask(timesheets: Row[], task: { id?: unknown; name?: unknown }): number {
  const name = String(task.name ?? '').trim().toLowerCase()
  const hrs = timesheets.reduce((s, ts) => {
    const tid = String(ts.task_id ?? '')
    const match = tid ? tid === String(task.id) : (!!name && String(ts.task ?? '').trim().toLowerCase() === name)
    return match ? s + totalHours(ts) : s
  }, 0)
  return Math.round(hrs * 100) / 100
}

/** "1h 30m" / "45m" — reads like the task timer, not decimal hours. */
export const fmtDuration = (h: number): string => {
  const mins = Math.round(h * 60)
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`
}
