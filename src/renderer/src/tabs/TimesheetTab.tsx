import { useState, useMemo, useCallback } from 'react'
import CrudTab from '../components/CrudTab'
import { Column } from '../components/DataTable'
import { Member } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { num, productiveHours, totalHours } from '../lib/hours'
import { memberNameMap } from '../lib/people'
import Icon from '../components/Icon'
import ConfirmDialog from '../components/ConfirmDialog'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
  quotedHours?: number
}

type Row = Record<string, unknown>
// Productive hours (execution + overtime) and Total (all categories) come from lib/hours.
const productiveOf = productiveHours
const totalOf = totalHours
const today = (): string => new Date().toISOString().slice(0, 10)
const isPending = (r: Row): boolean => !!r.pending

// Manual (non-timer) hour categories. Execution = "missed task time" — a catch-up
// entry against an assigned task the member forgot to run the timer for.
const CATEGORIES = [
  { bucket: 'it_issue_hrs', label: 'IT issue hours', task: 'IT issue' },
  { bucket: 'discussion_hrs', label: 'Discussion hours', task: 'Discussion' },
  { bucket: 'execution_hrs', label: 'Missed task time (forgot the timer)', task: '' }
] as const

export default function TimesheetTab({ projectId, projectName, onToast, quotedHours = 0 }: Props) {
  const { currentMember, isAdmin, isLead, isManager, members: allMembers } = useApp()
  const { tasksByProject } = useData()
  const [rows, setRows] = useState<Row[]>([])
  const [filterMember, setFilterMember] = useState<string>('')
  const [reload, setReload] = useState(0)
  const bump = (): void => setReload((n) => n + 1)

  // Manual "Log time" entry form (timesheets are otherwise filled by the task timer).
  const [logOpen, setLogOpen] = useState(false)
  const [form, setForm] = useState({ date: today(), bucket: 'it_issue_hrs', taskId: '', hours: '' })
  useEscapeKey(useCallback(() => setLogOpen(false), []))
  const [confirmReject, setConfirmReject] = useState<Row | null>(null)

  // Resolve names from the GLOBAL member directory so time logged via any flow shows
  // the member even if they aren't formally on the project.
  const nameById = useMemo(() => memberNameMap(allMembers), [allMembers])

  // My open tasks on this project — used for the "missed task time" catch-up entry.
  const myTasks = useMemo(() => {
    if (!currentMember) return [] as Row[]
    return (tasksByProject(projectId) as Row[]).filter((t) => String(t.assigned_member_id) === String(currentMember.id))
  }, [tasksByProject, projectId, currentMember])

  // Only APPROVED (non-pending) entries reflect in totals. Pending manual entries
  // are visible in the table but excluded from every sum until a Team Lead approves.
  const reflected = useMemo(() => rows.filter((r) => !isPending(r)), [rows])
  const pendingRows = useMemo(() => rows.filter(isPending), [rows])

  // Show ONLY members who have actually logged (approved) time — no 0/0 rows.
  const summaryMembers = useMemo(() => {
    const ids = new Set<string>()
    reflected.forEach((r) => { const id = String(r.member_id ?? ''); if (id) ids.add(id) })
    return [...ids]
      .map((id) => allMembers.find((m) => String(m.id) === id))
      .filter((m): m is Member => !!m)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [reflected, allMembers])

  // per-member totals across all APPROVED entries
  const summary = useMemo(() => {
    const byMember = new Map<string, { productive: number; total: number; ot: number; corr: number; entries: number }>()
    for (const r of reflected) {
      const key = String(r.member_id ?? '')
      const cur = byMember.get(key) ?? { productive: 0, total: 0, ot: 0, corr: 0, entries: 0 }
      cur.productive += productiveOf(r)
      cur.total += totalOf(r)
      cur.ot += num(r.overtime_hrs)
      cur.corr += num(r.correction_hrs)
      cur.entries += 1
      byMember.set(key, cur)
    }
    return byMember
  }, [reflected])

  const grand = useMemo(() => {
    let productive = 0, total = 0, ot = 0, corr = 0
    summary.forEach((v) => { productive += v.productive; total += v.total; ot += v.ot; corr += v.corr })
    return { productive, total, ot, corr }
  }, [summary])

  // Each timesheet entry's discipline is taken from the task it was logged against
  // (entries with no task — e.g. IT issue / Discussion — fall under "General").
  const taskDiscById = useMemo(() => {
    const m = new Map<string, string>()
    ;(tasksByProject(projectId) as Row[]).forEach((t) => { if (t.id != null) m.set(String(t.id), String(t.discipline ?? '').trim()) })
    return m
  }, [tasksByProject, projectId])
  const r1 = (n: number): number => Math.round(n * 10) / 10
  const discSummary = useMemo(() => {
    const m = new Map<string, { productive: number; total: number; entries: number }>()
    for (const r of reflected) {
      const key = taskDiscById.get(String(r.task_id ?? '')) || 'General'
      const cur = m.get(key) ?? { productive: 0, total: 0, entries: 0 }
      cur.productive += productiveOf(r); cur.total += totalOf(r); cur.entries += 1
      m.set(key, cur)
    }
    return [...m.entries()].map(([d, v]) => ({ d, ...v })).sort((a, b) => b.total - a.total)
  }, [reflected, taskDiscById])

  // Two-stage approval (mirrors overtime): pending_lead → pending_manager → approved.
  // `pending` stays true until fully approved, so every app-wide `!pending` filter
  // keeps excluding the entry from totals until both sign-offs are in.
  const stageOf = (r: Row): 'pending_lead' | 'pending_manager' | 'approved' => {
    if (!r.pending) return 'approved'
    return String(r.approval ?? 'pending_lead') === 'pending_manager' ? 'pending_manager' : 'pending_lead'
  }
  const canAct = (r: Row): boolean => { const s = stageOf(r); return s === 'pending_lead' ? isLead : s === 'pending_manager' ? isManager : false }

  const approveEntry = async (row: Row): Promise<void> => {
    const st = stageOf(row)
    let patch: Row
    if (st === 'pending_lead') {
      if (!isLead) return
      patch = { ...row, project_id: projectId, approval: 'pending_manager', pending: true, lead_by: currentMember?.name ?? 'Lead' }
    } else if (st === 'pending_manager') {
      if (!isManager) return
      patch = { ...row, project_id: projectId, approval: 'approved', pending: false, approved_by: currentMember?.name ?? 'Manager' }
    } else return
    const res = await window.api.items.update('timesheet', patch)
    if (res.ok) { onToast(st === 'pending_lead' ? 'Approved by Team Lead — awaiting Manager' : 'Timesheet entry approved'); bump() }
    else onToast(res.error ?? 'Approve failed', 'error')
  }
  const rejectEntry = async (row: Row): Promise<void> => {
    const res = await window.api.items.delete('timesheet', Number(row.id))
    if (res.ok) { onToast('Entry rejected'); bump() } else onToast(res.error ?? 'Reject failed', 'error')
  }

  // Only "Missed task time" (catch-up execution against the quote) needs sign-off;
  // IT issue and Discussion hours are logged directly and count immediately.
  const needsApproval = (bucket: string): boolean => bucket === 'execution_hrs'

  const submitLog = async (): Promise<void> => {
    const hrs = num(form.hours)
    if (!hrs || hrs <= 0) { onToast('Enter hours greater than 0', 'error'); return }
    if (!currentMember) { onToast('Select who you are first (top bar)', 'error'); return }
    const cat = CATEGORIES.find((c) => c.bucket === form.bucket)!
    const approve = needsApproval(form.bucket)
    const base: Row = {
      project_id: projectId, member_id: currentMember.id, date: form.date,
      pending: approve, approval: approve ? 'pending_lead' : 'approved', source: 'manual',
      execution_hrs: '', discussion_hrs: '', qc_hrs: '', it_issue_hrs: '', overtime_hrs: '', correction_hrs: ''
    }
    if (form.bucket === 'execution_hrs') {
      const t = myTasks.find((x) => String(x.id) === form.taskId)
      if (!t) { onToast('Pick the task you worked on', 'error'); return }
      base.task = String(t.name ?? ''); base.task_id = t.id
    } else {
      base.task = cat.task
    }
    base[form.bucket] = hrs
    base.productive_hrs = productiveHours(base)
    base.total_hrs = totalHours(base)
    const res = await window.api.items.create('timesheet', base)
    if (res.ok) {
      onToast(approve ? 'Logged — pending Team Lead then Manager approval' : `${cat.task} hours logged`)
      setLogOpen(false); setForm({ date: today(), bucket: 'it_issue_hrs', taskId: '', hours: '' }); bump()
    } else onToast(res.error ?? 'Could not log time', 'error')
  }

  const columns: Column[] = [
    { key: 'date', label: 'Date', width: '105px' },
    { key: 'member_id', label: 'Member', width: '130px', render: (v) => (v ? nameById.get(String(v)) || '—' : '—') },
    { key: 'task', label: 'Task' },
    { key: 'execution_hrs', label: 'Exec', width: '55px' },
    { key: 'discussion_hrs', label: 'Disc', width: '55px' },
    { key: 'qc_hrs', label: 'QC', width: '50px' },
    { key: 'it_issue_hrs', label: 'IT', width: '50px' },
    { key: 'overtime_hrs', label: 'OT', width: '50px' },
    { key: 'productive_hrs', label: 'Productive', width: '85px', render: (_v, row) => <strong>{productiveOf(row)}</strong> },
    { key: 'total_hrs', label: 'Total', width: '70px', render: (_v, row) => <strong style={{ color: 'var(--accent)' }}>{totalOf(row)}</strong> },
    {
      key: '__status', label: 'Status', width: '200px', render: (_v, row) => {
        const st = stageOf(row)
        if (st === 'approved') return row.approved_by ? <span className="badge badge-resolved" title={`Approved by ${row.approved_by}`}>Approved</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>
        return (
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {st === 'pending_lead'
              ? <span className="badge badge-pending">Awaiting lead</span>
              : <span className="badge badge-on-going" title="Team Lead approved — awaiting Manager">Lead ✓ · awaiting Mgr</span>}
            {canAct(row) ? (
              <>
                <button className="btn btn-primary btn-xs" onClick={() => approveEntry(row)}>{st === 'pending_lead' ? 'Approve (lead)' : 'Approve (mgr)'}</button>
                <button className="btn btn-secondary btn-xs" onClick={() => setConfirmReject(row)}>Reject</button>
              </>
            ) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{st === 'pending_lead' ? 'needs a Lead' : 'needs a Manager'}</span>}
          </span>
        )
      }
    }
  ]

  const loggedTotal = grand.total
  // Time left on the project is driven by Productive hours (execution + overtime) against the quote.
  const remaining = quotedHours - grand.productive
  const usedPct = quotedHours ? Math.round((grand.productive / quotedHours) * 100) : 0

  // Quoted hrs (and anything derived from it: remaining, % used) are visible only to
  // Project Lead and above. Employees see just what's been used/logged ("exhausted").
  const quotaBanner = (
    <div className="ts-summary">
      <div className="quota-banner">
        {isAdmin && <div className="quota-stat"><span className="quota-val">{quotedHours || '—'}</span><span className="quota-lbl">Quoted hrs</span></div>}
        <div className="quota-stat"><span className="quota-val">{grand.productive}</span><span className="quota-lbl">Productive hrs</span></div>
        <div className="quota-stat"><span className="quota-val">{loggedTotal}</span><span className="quota-lbl">Total logged</span></div>
        {isAdmin && <div className="quota-stat"><span className="quota-val" style={{ color: remaining < 0 ? 'var(--danger)' : 'var(--success)' }}>{quotedHours ? remaining : '—'}</span><span className="quota-lbl">Remaining (Quoted − Productive)</span></div>}
        {isAdmin && quotedHours > 0 && (
          <div className="quota-bar-wrap">
            <div className="quota-bar"><div className="quota-fill" style={{ width: `${Math.min(usedPct, 100)}%`, background: usedPct > 100 ? 'var(--danger)' : usedPct > 85 ? 'var(--warning)' : 'var(--accent)' }} /></div>
            <span className="quota-pct">{usedPct}% of quoted (productive)</span>
          </div>
        )}
      </div>
    </div>
  )

  const pendingBanner = pendingRows.length > 0 && (
    <div className="attach-hint" style={{ marginBottom: 8 }}>
      <Icon name="clock" size={14} style={{ verticalAlign: '-2px' }} /> {pendingRows.length} manual entr{pendingRows.length === 1 ? 'y is' : 'ies are'} awaiting approval (Team Lead → then Manager){(isLead || isManager) ? ' — act in the Status column.' : ' before they count.'}
    </div>
  )

  const disciplineSummary = (
    <div className="ts-summary">
      <div className="inbox-section">Hours by discipline</div>
      <table className="mini-table">
        <thead><tr><th>Discipline</th><th>Entries</th><th>Productive</th><th>Total</th></tr></thead>
        <tbody>
          {discSummary.length === 0 ? (
            <tr><td colSpan={4} style={{ color: 'var(--text-dim)' }}>No time logged yet.</td></tr>
          ) : discSummary.map((g) => (
            <tr key={g.d}>
              <td><strong>{g.d}</strong></td>
              <td>{g.entries}</td>
              <td><strong>{r1(g.productive)}</strong></td>
              <td><strong style={{ color: 'var(--accent)' }}>{r1(g.total)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const memberSummary = (
    <div className="ts-summary">
      <div className="inbox-section">Hours by member</div>
      <table className="mini-table">
        <thead>
          <tr><th>Team Member</th><th>Entries</th><th>Productive</th><th>Total</th><th>Overtime</th><th>Correction</th></tr>
        </thead>
        <tbody>
          {summaryMembers.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--text-dim)' }}>No time logged yet.</td></tr>}
          {summaryMembers.map((m) => {
            const s = summary.get(String(m.id))
            return (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{s?.entries ?? 0}</td>
                <td><strong>{s?.productive ?? 0}</strong></td>
                <td><strong style={{ color: 'var(--accent)' }}>{s?.total ?? 0}</strong></td>
                <td>{s?.ot ?? 0}</td>
                <td>{s?.corr ?? 0}</td>
              </tr>
            )
          })}
          <tr className="ts-grand">
            <td>All members</td>
            <td>{reflected.length}</td>
            <td><strong>{grand.productive}</strong></td>
            <td><strong style={{ color: 'var(--accent)' }}>{grand.total}</strong></td>
            <td>{grand.ot}</td>
            <td>{grand.corr}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  const toolbar = (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setLogOpen(true)} title="Log IT issue / Discussion hours (count immediately) or catch-up task time (needs approval)"><Icon name="plus" size={14} /> Log time</button>
      <select className="filter-select" aria-label="Filter by member" value={filterMember} onChange={(e) => setFilterMember(e.target.value)}>
        <option value="">All members</option>
        {summaryMembers.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
      </select>
    </>
  )

  return (
    <>
      <CrudTab
        type="timesheet" singular="Timesheet Entry" projectId={projectId} projectName={projectName}
        columns={columns} fields={[]} onToast={onToast}
        addAllowed={false}
        reloadSignal={reload}
        onData={setRows}
        toolbarExtra={toolbar}
        headerExtra={<>{quotaBanner}{pendingBanner}{disciplineSummary}{memberSummary}</>}
        rowFilter={(r) => !filterMember || String(r.member_id) === filterMember}
        canEditRow={() => false}
        canDeleteRow={(r) => isLead || (!!currentMember && String(r.member_id) === String(currentMember.id))}
        emptyHint="No time logged yet. Execution hours come from the task timer; use “Log time” for IT/Discussion or catch-up task hours."
      />

      {logOpen && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setLogOpen(false)}>
          <div className="modal" style={{ width: 460, maxWidth: '95vw' }}>
            <div className="modal-header">
              <h3><Icon name="clock" size={18} /> Log time</h3>
              <button className="btn-icon" onClick={() => setLogOpen(false)}><Icon name="close" size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="attach-hint">Execution time is normally captured by the <strong>task timer</strong>. <strong>IT issue</strong> and <strong>Discussion</strong> hours are logged directly and count immediately. <strong>Missed task time</strong> (catch-up against an assigned task) stays <strong>pending</strong> until a <strong>Team Lead</strong> and then a <strong>Manager</strong> approve it.</p>
              <label className="quote-field"><span>Date</span>
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </label>
              <label className="quote-field"><span>Category</span>
                <select value={form.bucket} onChange={(e) => setForm((f) => ({ ...f, bucket: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c.bucket} value={c.bucket}>{c.label}</option>)}
                </select>
              </label>
              {form.bucket === 'execution_hrs' && (
                <label className="quote-field"><span>Task worked on</span>
                  <select value={form.taskId} onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))}>
                    <option value="">{myTasks.length ? '— Pick a task assigned to you' : 'No tasks assigned to you on this project'}</option>
                    {myTasks.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name ?? 'Task')}</option>)}
                  </select>
                </label>
              )}
              <label className="quote-field"><span>Hours</span>
                <input type="number" min="0" step="0.25" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} placeholder="e.g. 1.5" />
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setLogOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitLog}>{needsApproval(form.bucket) ? 'Submit for approval' : 'Log time'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmReject && (
        <ConfirmDialog
          title="Reject entry"
          message="Reject and remove this pending entry?"
          confirmLabel="Reject"
          onConfirm={() => { const row = confirmReject; setConfirmReject(null); rejectEntry(row) }}
          onCancel={() => setConfirmReject(null)}
        />
      )}
    </>
  )
}
