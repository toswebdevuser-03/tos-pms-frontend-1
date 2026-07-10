import { useState, useEffect, useCallback } from 'react'
import { Reminder, Project } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import Icon, { IconName } from './Icon'
import { loadUpdates, getLastSeen, markSeen, getReadKeys, markKeysRead, ProjectUpdate } from '../lib/projectUpdates'
import { useEscapeKey } from '../lib/useEscapeKey'

const UPDATE_ICON: Record<string, IconName> = { task: 'checkSquare', rfi: 'inbox', dispatch: 'upload', status: 'barChart' }
const fmtAgo = (at: string): string => {
  const d = new Date(at.replace(' ', 'T') + 'Z'); const ms = Date.now() - d.getTime()
  if (isNaN(ms)) return at
  const h = Math.floor(ms / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface Props {
  projects: Project[]
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
  onNavigate?: (projectId: number, tab: string) => void
  onCleared?: () => void // clear the topbar unseen-updates badge without closing
}

const SEV_LABEL: Record<string, string> = { overdue: 'Overdue', due: 'Due today', upcoming: 'Upcoming' }
const KIND_ICON: Record<string, IconName> = { wip: 'clipboard', dispatch: 'upload', task: 'checkSquare', budget: 'barChart' }

interface TaskRow extends Record<string, unknown> { id: number; project_id: number; projectName: string }

export default function RemindersPanel({ projects, onClose, onToast, onNavigate, onCleared }: Props) {
  useEscapeKey(onClose)
  const { currentMember, members } = useApp()
  const { tasks, refreshTasks } = useData()
  const [list, setList] = useState<Reminder[]>([])
  const [updates, setUpdates] = useState<ProjectUpdate[]>([])
  const [seenAt, setSeenAt] = useState<string>(() => getLastSeen()) // NEW badges compare against this
  const [readKeys, setReadKeys] = useState<Set<string>>(() => getReadKeys())
  const [selectedUpd, setSelectedUpd] = useState<Set<string>>(new Set()) // ticked recent-update keys
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.api.reminders.get()
    if (res.ok) setList(res.data as Reminder[])
    setUpdates(await loadUpdates(projects.map((p) => ({ id: p.id, name: p.name })), { me: currentMember?.id, members }))
    setLoading(false)
  }, [projects, currentMember, members])

  // Clear the notifications: mark everything seen (removes NEW badges + topbar count)
  // and empty the recent-updates list from view.
  const clearAll = (): void => {
    markSeen(); setSeenAt(getLastSeen()); setUpdates([]); onCleared?.()
    onToast('Inbox cleared')
  }

  // Per-item read: tick specific recent updates, then mark just those as read.
  const toggleUpd = (k: string): void => setSelectedUpd((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const markSelectedRead = (): void => {
    if (!selectedUpd.size) return
    markKeysRead([...selectedUpd]); setReadKeys(getReadKeys())
    onToast(`Marked ${selectedUpd.size} as read`); setSelectedUpd(new Set())
  }

  useEffect(() => { load() }, [load])
  // Opening the Inbox marks current updates as seen (clears the topbar badge next poll).
  useEffect(() => { markSeen() }, [])

  const writeTask = async (t: TaskRow, patch: Record<string, unknown>): Promise<void> => {
    await window.api.items.update('task', {
      id: t.id, project_id: t.project_id, name: t.name ?? '', assigned_member_id: t.assigned_member_id ?? '',
      deadline: t.deadline ?? '', status: t.status ?? 'Not Started', acceptance: t.acceptance ?? '', assigned_by: t.assigned_by ?? '', ...patch
    })
    await refreshTasks()
    load()
  }

  const notify = async () => {
    const res = await window.api.reminders.notifyDesktop()
    if (res.ok) onToast(`Showed ${res.data?.shown ?? 0} desktop notification(s)`)
    else onToast(res.error ?? 'Failed', 'error')
  }

  const emailOne = async (r: Reminder) => {
    if (!r.assigneeEmail) { onToast('No email on file for this member', 'error'); return }
    const res = await window.api.email.send({
      to: r.assigneeEmail,
      subject: `[${r.projectName}] ${SEV_LABEL[r.severity]}: ${r.title}`,
      html: `<p>Hi ${r.assignee || ''},</p><p>This is a reminder that <b>${r.title}</b> (${r.kind.toUpperCase()}) on project <b>${r.projectName}</b> is <b>${SEV_LABEL[r.severity].toLowerCase()}</b> (date: ${r.date}).</p><p>Please update its status in TOS Tracker.</p>`
    })
    if (res.ok) onToast(`Emailed ${r.assignee}`)
    else onToast(res.error ?? 'Email failed', 'error')
  }

  const projectNameById = new Map(projects.map((p) => [Number(p.id), p.name]))
  const pending = currentMember
    ? tasks
      .filter((t) => String(t.assigned_member_id) === String(currentMember.id) && t.acceptance === 'Pending')
      .map((t) => ({ ...(t as TaskRow), project_id: Number(t.project_id), projectName: projectNameById.get(Number(t.project_id)) ?? '' }))
    : []
  const overdue = list.filter((r) => r.severity === 'overdue').length
  const go = (t: TaskRow): void => { if (onNavigate) { onNavigate(t.project_id, 'Tasks'); onClose() } }

  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-header">
          <div>
            <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Icon name="inbox" size={18} /> Inbox</h3>
            <span className="drawer-sub">{pending.length} to respond · {overdue} overdue · {list.length} reminders</span>
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="drawer-toolbar">
          <button className="btn btn-secondary btn-sm" onClick={notify}><Icon name="bellRing" size={15} /> Desktop notify</button>
          <button className="btn btn-secondary btn-sm" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>
          <button className="btn btn-secondary btn-sm" onClick={clearAll} title="Mark everything as read and clear recent updates"><Icon name="checkCircle" size={15} /> Mark all read</button>
        </div>
        <div className="drawer-body">
          {loading ? (
            <div className="attach-empty">Loading…</div>
          ) : (
            <>
              {pending.length > 0 && (
                <>
                  <div className="inbox-section">Needs your response</div>
                  {pending.map((t) => (
                    <div key={`t${t.id}`} className="reminder-card sev-overdue">
                      <div className="reminder-icon"><Icon name="inbox" size={18} /></div>
                      <div className="reminder-main">
                        <div className="reminder-title" onClick={() => go(t)} style={{ cursor: onNavigate ? 'pointer' : 'default' }}>{String(t.name ?? 'Task')}</div>
                        <div className="reminder-meta">
                          <span className="badge sev-badge-overdue">Delegated to you</span>
                          <span>{t.projectName}</span>
                          {t.deadline ? <span>· due {String(t.deadline)}</span> : null}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-xs" onClick={() => writeTask(t, { acceptance: 'Accepted' }).then(() => onToast('Task accepted'))}>Accept</button>
                        <button className="btn btn-secondary btn-xs" onClick={() => writeTask(t, { acceptance: 'Declined' }).then(() => onToast('Task declined'))}>Decline</button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="inbox-section">Deadlines &amp; reminders</div>
              {list.length === 0 ? (
                <div className="attach-empty"><Icon name="checkCircle" size={14} style={{ verticalAlign: '-2px', color: 'var(--success)' }} /> Nothing due. You’re all caught up.</div>
              ) : (
                list.map((r) => (
                  <div key={r.key} className={`reminder-card sev-${r.severity}`}>
                    <div className="reminder-icon"><Icon name={KIND_ICON[r.kind] ?? 'bell'} size={18} /></div>
                    <div className="reminder-main">
                      <div className="reminder-title">{r.title}</div>
                      <div className="reminder-meta">
                        <span className={`badge sev-badge-${r.severity}`}>{SEV_LABEL[r.severity]}</span>
                        <span>{r.projectName}</span>
                        <span>· {r.kind.toUpperCase()}</span>
                        <span>· {r.date}</span>
                        {r.assignee && <span>· {r.assignee}</span>}
                      </div>
                    </div>
                    {r.assigneeEmail && (
                      <button className="btn btn-secondary btn-sm" onClick={() => emailOne(r)}><Icon name="send" size={14} /> Email</button>
                    )}
                  </div>
                ))
              )}

              <div className="inbox-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>Recent updates</span>
                {selectedUpd.size > 0 && <button className="btn btn-secondary btn-xs" onClick={markSelectedRead}><Icon name="checkCircle" size={13} /> Mark {selectedUpd.size} read</button>}
              </div>
              {updates.length === 0 ? (
                <div className="attach-empty">No recent project activity.</div>
              ) : (
                updates.map((u) => {
                  const isNew = u.at > seenAt && !readKeys.has(u.key)
                  const tab = u.kind === 'task' ? 'Tasks' : u.kind === 'rfi' ? 'RFI/Queries' : u.kind === 'dispatch' ? 'Dispatch' : 'Status'
                  return (
                    <div key={u.key} className="reminder-card">
                      <input type="checkbox" checked={selectedUpd.has(u.key)} onChange={() => toggleUpd(u.key)} title="Select to mark read" style={{ margin: '2px 4px 0 0' }} />
                      <div className="reminder-icon"><Icon name={UPDATE_ICON[u.kind] ?? 'bell'} size={18} /></div>
                      <div className="reminder-main">
                        <div className="reminder-title" onClick={() => { if (onNavigate) { onNavigate(u.projectId, tab); onClose() } }} style={{ cursor: onNavigate ? 'pointer' : 'default' }}>
                          {u.title}{isNew && <span className="badge badge-resolved" style={{ marginLeft: 6 }}>NEW</span>}
                        </div>
                        <div className="reminder-meta"><span>{u.projectName}</span><span>· {fmtAgo(u.at)}</span></div>
                      </div>
                    </div>
                  )
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
