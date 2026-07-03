/**
 * In-app "recent updates" feed: key events across the member's projects, shown in
 * the Inbox. Notifies each project member when the project changes. Derived from
 * the cross-project /all/* reads + statuses (no events table); "new since last
 * seen" is tracked per-browser in localStorage.
 */
type Row = Record<string, unknown>

export interface ProjectUpdate {
  key: string
  projectId: number
  projectName: string
  kind: 'task' | 'rfi' | 'dispatch' | 'status'
  title: string
  at: string // 'YYYY-MM-DD HH:MM:SS' (UTC) — matches server fmtDate, so string compare is chronological
}

const SEEN_KEY = 'tos_notif_seen'
const PUSHED_KEY = 'tos_notif_pushed' // newest update already shown as a desktop notification
const READ_KEY = 'tos_notif_read'     // per-item read keys (in addition to the seen watermark)
// Same shape as server fmtDate so comparisons against item updated_at line up.
const stamp = (): string => new Date().toISOString().replace('T', ' ').substring(0, 19)
export const getLastSeen = (): string => localStorage.getItem(SEEN_KEY) ?? ''
export const markSeen = (): void => localStorage.setItem(SEEN_KEY, stamp())

// Per-item "read" set: individual updates the user dismissed (kept ~500, newest wins).
export const getReadKeys = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]') as string[]) } catch { return new Set() }
}
export const markKeysRead = (keys: string[]): void => {
  const s = getReadKeys()
  keys.forEach((k) => s.add(k))
  localStorage.setItem(READ_KEY, JSON.stringify([...s].slice(-500)))
}
// Unseen = newer than the "seen" watermark AND not individually marked read.
export const unseen = (ups: ProjectUpdate[], seen: string): ProjectUpdate[] => {
  const read = getReadKeys()
  return ups.filter((u) => u.at > seen && !read.has(u.key))
}

// ── Desktop (OS) notifications via the Web Notifications API ───────────────────
const notifySupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window
export const notifyPermission = (): NotificationPermission | 'unsupported' => (notifySupported() ? Notification.permission : 'unsupported')
// Ask for permission (must be triggered by a user gesture, e.g. opening the Inbox).
export async function requestNotifyPermission(): Promise<void> {
  try { if (notifySupported() && Notification.permission === 'default') await Notification.requestPermission() } catch { /* ignore */ }
}

const KIND_ICON: Record<ProjectUpdate['kind'], string> = { task: '📋', rfi: '📨', dispatch: '📤', status: '🚦' }

// Fire a desktop notification for genuinely-new updates (newer than the last one we
// pushed). First run just sets a baseline so we don't replay history. Collapses a
// burst into a single summary notification. No-op unless the user granted permission.
export function pushDesktopNotifications(ups: ProjectUpdate[]): void {
  if (!notifySupported() || Notification.permission !== 'granted' || !ups.length) return
  const newest = ups[0].at // loadUpdates returns newest-first
  const last = localStorage.getItem(PUSHED_KEY)
  if (!last) { localStorage.setItem(PUSHED_KEY, newest); return } // baseline, no spam
  const fresh = ups.filter((u) => u.at > last)
  if (!fresh.length) return
  localStorage.setItem(PUSHED_KEY, newest)
  try {
    if (fresh.length === 1) {
      const u = fresh[0]
      new Notification(`${KIND_ICON[u.kind]} ${u.projectName}`, { body: u.title, tag: u.key })
    } else {
      const projects = [...new Set(fresh.map((u) => u.projectName))].slice(0, 3).join(', ')
      new Notification('TOS Tracker — new updates', { body: `${fresh.length} updates across ${projects}${fresh.length > 3 ? '…' : ''}`, tag: 'tos-updates' })
    }
  } catch { /* ignore */ }
}

const atOf = (x: Row): string => String(x.updated_at || x.created_at || '')

// Fetch + assemble key-event updates for the given projects (already role-scoped).
// `opts.me` (+ `opts.members`) enables assigner-targeted updates: whoever assigned a
// task is notified when it's finished, even if they aren't on that project.
export async function loadUpdates(
  projects: { id: number; name: string }[],
  opts: { me?: number | string | null; members?: { id: number; name: string }[] } = {}
): Promise<ProjectUpdate[]> {
  const ids = new Set(projects.map((p) => p.id))
  const name = new Map(projects.map((p) => [p.id, p.name]))
  const me = opts.me != null ? String(opts.me) : ''
  const memberName = new Map((opts.members ?? []).map((m) => [String(m.id), m.name]))
  if (!ids.size && !me) return []
  const [t, d, r, s] = await Promise.all([
    window.api.all.tasks(), window.api.all.dispatches(), window.api.all.rfi(), window.api.projects.statuses()
  ])
  const out: ProjectUpdate[] = []
  for (const x of (t.ok ? t.data : []) as Row[]) {
    const pid = Number(x.project_id)
    const at = atOf(x); if (!at) continue
    // Assigner-completion: notify the person who ASSIGNED this task when it's Done,
    // regardless of whether they can see the project. Takes precedence (no dup row).
    if (me && String(x.assigned_by) === me && String(x.status) === 'Done') {
      const who = memberName.get(String(x.assigned_member_id)) || 'Someone'
      out.push({ key: `taskdone-${x.id}`, projectId: pid, projectName: name.get(pid) ?? '', kind: 'task', title: `✅ ${who} finished “${String(x.name ?? 'task')}”`, at })
      continue
    }
    if (!ids.has(pid)) continue
    out.push({ key: `task-${x.id}`, projectId: pid, projectName: name.get(pid) ?? '', kind: 'task', title: `Task: ${String(x.name ?? 'Task')} — ${String(x.status ?? '')}`, at })
  }
  for (const x of (r.ok ? r.data : []) as Row[]) {
    const pid = Number(x.project_id); if (!ids.has(pid)) continue
    const at = atOf(x); if (!at) continue
    out.push({ key: `rfi-${x.id}`, projectId: pid, projectName: name.get(pid) ?? '', kind: 'rfi', title: `${String(x.kind ?? 'RFI')} ${String(x.rfi_number ?? '')} — ${String(x.status ?? 'Open')}`, at })
  }
  for (const x of (d.ok ? d.data : []) as Row[]) {
    const pid = Number(x.project_id); if (!ids.has(pid)) continue
    const at = atOf(x); if (!at) continue
    out.push({ key: `dispatch-${x.id}`, projectId: pid, projectName: name.get(pid) ?? '', kind: 'dispatch', title: `Dispatch: ${String(x.description || x.dispatch_number || '')} — ${String(x.status ?? '')}`, at })
  }
  for (const x of (s.ok ? s.data : []) as unknown as Row[]) {
    const pid = Number(x.project_id); if (!ids.has(pid)) continue
    const at = String(x.last_updated || ''); if (!at) continue
    out.push({ key: `status-${pid}`, projectId: pid, projectName: name.get(pid) ?? '', kind: 'status', title: `Status set to ${String(x.overall ?? '')}`, at })
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 60)
}
