import { useState, useEffect, useCallback, useMemo } from 'react'
import { OvertimeRequest } from '../types'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { nameById } from '../lib/people'
import { num } from '../lib/hours'
import Icon from './Icon'
import ConfirmDialog from './ConfirmDialog'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}
type Row = Record<string, unknown>

const fmtDay = (ds: string): string => (ds ? new Date(String(ds).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—')

// One place for everything awaiting sign-off: Overtime requests and manual
// (missed-task) timesheet entries — both two-stage (Project/Team Lead → Manager).
export default function ApprovalsModal({ onClose, onToast }: Props) {
  useEscapeKey(onClose)
  const { members, isAdmin, isLead, isManager, currentMember } = useApp()
  const { projects } = useData()
  const [tab, setTab] = useState<'overtime' | 'timesheet'>('overtime')
  const [ot, setOt] = useState<OvertimeRequest[]>([])
  const [ts, setTs] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmReject, setConfirmReject] = useState<Row | null>(null)

  const projName = useMemo(() => { const m = new Map<number, string>(); projects.forEach((p) => m.set(p.id, p.name)); return m }, [projects])
  const nameOf = (id: unknown): string => nameById(members, id)

  const load = useCallback(async () => {
    setLoading(true)
    const [o, t] = await Promise.all([window.api.overtime.list(), window.api.all.timesheets()])
    if (o.ok) setOt(o.data as OvertimeRequest[])
    if (t.ok) setTs((t.data as Row[]).filter((x) => x.pending)) // only entries awaiting approval
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // ── Overtime (two-stage: pending → lead_approved → approved) ──────────────────
  const otPending = useMemo(() => ot.filter((o) => o.status === 'pending' || o.status === 'lead_approved'), [ot])
  const otDecided = useMemo(() => ot.filter((o) => o.status === 'approved' || o.status === 'rejected').sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20), [ot])
  const otCanAct = (o: OvertimeRequest): boolean => (o.status === 'pending' ? isAdmin : o.status === 'lead_approved' ? isManager : false)
  const otDecide = async (o: OvertimeRequest, decision: 'approve' | 'reject'): Promise<void> => {
    const res = await window.api.overtime.decide(o.id, decision)
    if (res.ok) { onToast(decision === 'approve' ? 'Overtime approved' : 'Overtime rejected'); load() }
    else onToast(res.error ?? 'Failed', 'error')
  }

  // ── Manual timesheet entries (two-stage: pending_lead → pending_manager) ───────
  const stageOf = (r: Row): 'pending_lead' | 'pending_manager' | 'approved' => {
    if (!r.pending) return 'approved'
    return String(r.approval ?? 'pending_lead') === 'pending_manager' ? 'pending_manager' : 'pending_lead'
  }
  const tsCanAct = (r: Row): boolean => { const s = stageOf(r); return s === 'pending_lead' ? isLead : s === 'pending_manager' ? isManager : false }
  const tsApprove = async (r: Row): Promise<void> => {
    const s = stageOf(r)
    let patch: Row
    if (s === 'pending_lead') { if (!isLead) return; patch = { ...r, approval: 'pending_manager', pending: true, lead_by: currentMember?.name ?? 'Lead' } }
    else if (s === 'pending_manager') { if (!isManager) return; patch = { ...r, approval: 'approved', pending: false, approved_by: currentMember?.name ?? 'Manager' } }
    else return
    const res = await window.api.items.update('timesheet', patch)
    if (res.ok) { onToast(s === 'pending_lead' ? 'Approved by Team Lead — awaiting Manager' : 'Timesheet entry approved'); load() }
    else onToast(res.error ?? 'Approve failed', 'error')
  }
  const tsReject = async (r: Row): Promise<void> => {
    const res = await window.api.items.delete('timesheet', Number(r.id))
    if (res.ok) { onToast('Entry rejected'); load() } else onToast(res.error ?? 'Reject failed', 'error')
  }
  const tsHours = (r: Row): number => num(r.total_hrs) || num(r.execution_hrs) + num(r.discussion_hrs) + num(r.it_issue_hrs) + num(r.overtime_hrs) + num(r.correction_hrs)

  const stageBadge = (lead: boolean): React.JSX.Element => lead
    ? <span className="badge badge-pending">Awaiting lead</span>
    : <span className="badge badge-on-going" title="Lead approved — awaiting Manager">Lead ✓ · awaiting Mgr</span>

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 760, maxWidth: '96vw' }}>
        <div className="modal-header">
          <h3><Icon name="checkCircle" size={18} /> Approvals</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="exec-tabs">
            <button className={`exec-tab${tab === 'overtime' ? ' active' : ''}`} onClick={() => setTab('overtime')}><Icon name="clock" size={17} /> Overtime{otPending.length > 0 ? ` (${otPending.length})` : ''}</button>
            <button className={`exec-tab${tab === 'timesheet' ? ' active' : ''}`} onClick={() => setTab('timesheet')}><Icon name="hourglass" size={17} /> Timesheet{ts.length > 0 ? ` (${ts.length})` : ''}</button>
          </div>

          {loading ? <div className="attach-empty">Loading…</div> : tab === 'overtime' ? (
            <>
              <p className="attach-hint">Overtime is approved in two stages — a <strong>Project/Team Lead</strong> signs off first, then a <strong>Manager</strong>. Hours raise the person’s daily allocation capacity only once <strong>both</strong> approve.</p>
              <div className="inbox-section">Pending ({otPending.length})</div>
              {otPending.length === 0 ? (
                <div className="attach-empty"><Icon name="checkCircle" size={14} style={{ verticalAlign: '-2px', color: 'var(--success)' }} /> No overtime requests waiting.</div>
              ) : (
                <table className="mini-table">
                  <thead><tr><th>Member</th><th>Date</th><th>Hours</th><th>Stage</th><th>Reason</th><th></th></tr></thead>
                  <tbody>
                    {otPending.map((o) => (
                      <tr key={o.id}>
                        <td>{nameOf(o.member_id)}</td>
                        <td>{fmtDay(o.date)}</td>
                        <td><strong>{o.hours}h</strong></td>
                        <td>{stageBadge(o.status === 'pending')}</td>
                        <td>{o.reason || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {otCanAct(o) ? (
                            <>
                              <button className="btn btn-primary btn-xs" onClick={() => otDecide(o, 'approve')}>{o.status === 'pending' ? 'Approve (lead)' : 'Approve (mgr)'}</button>{' '}
                              <button className="btn btn-secondary btn-xs" onClick={() => otDecide(o, 'reject')}>Reject</button>
                            </>
                          ) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{o.status === 'pending' ? 'Needs a Lead' : 'Needs a Manager'}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {otDecided.length > 0 && (
                <>
                  <div className="inbox-section" style={{ marginTop: 16 }}>Recent decisions</div>
                  <table className="mini-table">
                    <thead><tr><th>Member</th><th>Date</th><th>Hours</th><th>Status</th><th>By</th></tr></thead>
                    <tbody>
                      {otDecided.map((o) => (
                        <tr key={o.id}>
                          <td>{nameOf(o.member_id)}</td><td>{fmtDay(o.date)}</td><td>{o.hours}h</td>
                          <td><span className={`badge badge-${o.status === 'approved' ? 'on-going' : 'overdue'}`}>{o.status}</span></td>
                          <td>{o.decided_by || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : (
            <>
              <p className="attach-hint">Manual <strong>“missed task time”</strong> timesheet entries need a <strong>Team Lead</strong> then a <strong>Manager</strong> before they count. (IT-issue and Discussion hours count immediately and don’t appear here.)</p>
              <div className="inbox-section">Pending ({ts.length})</div>
              {ts.length === 0 ? (
                <div className="attach-empty"><Icon name="checkCircle" size={14} style={{ verticalAlign: '-2px', color: 'var(--success)' }} /> No timesheet entries waiting.</div>
              ) : (
                <table className="mini-table">
                  <thead><tr><th>Date</th><th>Member</th><th>Project</th><th>Task</th><th>Hours</th><th>Stage</th><th></th></tr></thead>
                  <tbody>
                    {ts.map((r) => (
                      <tr key={String(r.id)}>
                        <td>{fmtDay(String(r.date ?? ''))}</td>
                        <td>{nameOf(r.member_id)}</td>
                        <td>{projName.get(Number(r.project_id)) ?? '—'}</td>
                        <td>{String(r.task ?? '—')}</td>
                        <td><strong>{tsHours(r)}h</strong></td>
                        <td>{stageBadge(stageOf(r) === 'pending_lead')}</td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {tsCanAct(r) ? (
                            <>
                              <button className="btn btn-primary btn-xs" onClick={() => tsApprove(r)}>{stageOf(r) === 'pending_lead' ? 'Approve (lead)' : 'Approve (mgr)'}</button>{' '}
                              <button className="btn btn-secondary btn-xs" onClick={() => setConfirmReject(r)}>Reject</button>
                            </>
                          ) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{stageOf(r) === 'pending_lead' ? 'Needs a Lead' : 'Needs a Manager'}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
      {confirmReject && (
        <ConfirmDialog
          title="Reject entry"
          message="Reject and remove this pending entry?"
          confirmLabel="Reject"
          onConfirm={() => { const r = confirmReject; setConfirmReject(null); tsReject(r) }}
          onCancel={() => setConfirmReject(null)}
        />
      )}
    </div>
  )
}
