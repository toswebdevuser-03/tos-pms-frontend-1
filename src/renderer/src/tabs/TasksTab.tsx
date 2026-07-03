import { useState, useEffect, useMemo, useCallback } from 'react'
import DataTable, { Column } from '../components/DataTable'
import FormModal, { FieldDef } from '../components/FormModal'
import Icon from '../components/Icon'
import { Member } from '../types'
import { useApp } from '../context/AppContext'
import { roleRank, RANK_LEAD } from '../roles'

interface Props {
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
}

type Row = Record<string, unknown>

export default function TasksTab({ projectId, projectName, onToast }: Props) {
  const { isAdmin, isManager, currentMember } = useApp()
  const [members, setMembers] = useState<Member[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; row?: Row } | null>(null)
  const [view, setView] = useState<'list' | 'board'>('list')
  const [dragId, setDragId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await window.api.items.getByProject(projectId, 'task')
    if (res.ok) setRows(res.data as Row[])
  }, [projectId])

  useEffect(() => {
    window.api.projectMembers.get(projectId).then((res) => { if (res.ok) setMembers(res.data as Member[]) })
  }, [projectId])
  useEffect(() => { load() }, [load])

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    members.forEach((mb) => m.set(String(mb.id), mb.name))
    return m
  }, [members])

  // Open-task workload per member (this project).
  const openByMember = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r) => {
      if (r.status !== 'Done' && r.assigned_member_id) {
        const k = String(r.assigned_member_id)
        m.set(k, (m.get(k) ?? 0) + 1)
      }
    })
    return m
  }, [rows])

  // Who the current actor may assign to (role-tier rules):
  // Manager/Company Admin → anyone; Team Lead → Employees only; Employee → no one.
  const assignable = useMemo(() => {
    return members.filter((mb) => {
      if (isManager) return true
      if (isAdmin) return roleRank(mb.role) < RANK_LEAD
      return false
    })
  }, [members, isManager, isAdmin])

  const assignOptions = useMemo(
    () => [
      { label: '— Unassigned', value: '' },
      ...assignable.map((mb) => ({ label: `${mb.name} · ${openByMember.get(String(mb.id)) ?? 0} open`, value: String(mb.id) }))
    ],
    [assignable, openByMember]
  )

  const fields: FieldDef[] = [
    { key: 'name', label: 'Task Name', required: true, adminOnly: true },
    { key: 'assigned_member_id', label: 'Assign / delegate to', type: 'select', adminOnly: true, optionValues: assignOptions },
    { key: 'deadline', label: 'Deadline', type: 'date', adminOnly: true },
    { key: 'status', label: 'Completion Status', type: 'select', options: ['Not Started', 'In Progress', 'Done'] }
  ]

  // Full payload on every write — remote store replaces the JSON blob, so we must
  // resend all fields and preserve acceptance/assigned_by unless re-delegated.
  // Returns the saved task's id (needed for allocation linking).
  const writeTask = async (base: Row, patch: Row): Promise<number | undefined> => {
    const payload: Row = {
      project_id: projectId,
      name: base.name ?? '',
      assigned_member_id: base.assigned_member_id ?? '',
      deadline: base.deadline ?? '',
      status: base.status ?? 'Not Started',
      acceptance: base.acceptance ?? '',
      assigned_by: base.assigned_by ?? '',
      ...patch
    }
    if (base.id != null) {
      await window.api.items.update('task', { id: base.id, ...payload })
      return base.id as number
    } else {
      const res = await window.api.items.create('task', payload)
      return res.ok ? (res.data as { id: number } | undefined)?.id : undefined
    }
  }

  const handleSubmit = async (data: Record<string, string>): Promise<void> => {
    const isNew = modal?.mode === 'add'
    const prev = modal?.row
    const prevAssignee = String(prev?.assigned_member_id ?? '')
    const newAssignee = String(data.assigned_member_id ?? '')
    const reDelegated = isNew || newAssignee !== prevAssignee

    const acceptance = reDelegated ? (newAssignee ? 'Pending' : '') : (prev?.acceptance ?? '')
    const assigned_by = reDelegated ? (currentMember?.id ?? '') : (prev?.assigned_by ?? '')

    const savedId = await writeTask(prev ?? {}, { ...data, acceptance, assigned_by })

    // Mirror task assignment into Daily Work Allocation so the two stay in sync.
    if (reDelegated && newAssignee && savedId != null) {
      const allocDate = data.deadline || new Date().toISOString().slice(0, 10)
      await window.api.items.create('allocation', {
        project_id: projectId,
        member_id: Number(newAssignee),
        task_id: savedId,
        date: allocDate,
        hours: '',
        note: ''
      })
    }

    onToast(isNew ? 'Task added' : 'Task updated')
    setModal(null)
    load()
  }

  const setAcceptance = async (row: Row, val: 'Accepted' | 'Declined'): Promise<void> => {
    await writeTask(row, { acceptance: val })
    onToast(val === 'Accepted' ? 'Task accepted' : 'Task declined')
    load()
  }

  const handleDelete = async (row: Row): Promise<void> => {
    if (!confirm('Delete this task?')) return
    await window.api.items.delete('task', row.id as number)
    onToast('Task deleted')
    load()
  }

  const handleExport = async (): Promise<void> => {
    if (!rows.length) { onToast('No data to export', 'error'); return }
    const res = await window.api.excel.export('task', projectName, rows)
    if (res.ok && res.data?.filePath) onToast(`Exported to ${res.data.filePath}`)
    else if (res.ok) onToast('Export cancelled')
  }

  const acceptanceCell = (val: unknown, row: Row): React.ReactNode => {
    const v = String(val ?? '')
    const mine = !!currentMember && String(row.assigned_member_id) === String(currentMember.id)
    if (v === 'Pending' && mine) {
      return (
        <span className="accept-actions">
          <button className="btn btn-primary btn-xs" onClick={() => setAcceptance(row, 'Accepted')}>Accept</button>
          <button className="btn btn-secondary btn-xs" onClick={() => setAcceptance(row, 'Declined')}>Decline</button>
        </span>
      )
    }
    if (!v || !row.assigned_member_id) return <span style={{ color: 'var(--text-dim)' }}>—</span>
    const key = v.toLowerCase()
    return <span className={`badge badge-${key}`}>{v}</span>
  }

  const columns: Column[] = [
    { key: 'name', label: 'Task' },
    {
      key: 'assigned_member_id', label: 'Assigned', width: '170px',
      render: (v) => {
        if (!v) return <span style={{ color: 'var(--text-dim)' }}>—</span>
        const open = openByMember.get(String(v)) ?? 0
        return <span>{nameById.get(String(v)) || '—'}<span className="workload-pill" title="Open tasks">{open}</span></span>
      }
    },
    { key: 'acceptance', label: 'Handoff', width: '150px', render: acceptanceCell },
    { key: 'deadline', label: 'Deadline', width: '120px' },
    { key: 'status', label: 'Status', width: '130px' }
  ]

  // Admins (Team Lead+) edit any task; an assignee may edit (their status) their own task.
  const canEditRow = (row: Row): boolean =>
    isAdmin || (!!currentMember && String(row.assigned_member_id) === String(currentMember.id))

  const STAGES = ['Not Started', 'In Progress', 'Done'] as const
  const dropTo = async (status: string): Promise<void> => {
    setOverCol(null)
    const row = rows.find((r) => r.id === dragId)
    setDragId(null)
    if (!row || row.status === status) return
    if (!canEditRow(row)) { onToast('You can only move tasks assigned to you', 'error'); return }
    await writeTask(row, { status })
    onToast(`Moved to ${status}`)
    load()
  }

  const done = rows.filter((r) => r.status === 'Done').length
  const progress = rows.length ? Math.round((done / rows.length) * 100) : 0

  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="tab-toolbar-left">
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: 'add' })}>+ Add Task</button>}
          {rows.length > 0 && <span className="toolbar-progress">{done}/{rows.length} done · {progress}%</span>}
        </div>
        <div className="tab-toolbar-right">
          <div className="view-toggle">
            <button className={`view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')} title="List view">☰ List</button>
            <button className={`view-btn${view === 'board' ? ' active' : ''}`} onClick={() => setView('board')} title="Board view">▥ Board</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}><Icon name="download" size={15} /> Export Excel</button>
        </div>
      </div>

      {isAdmin && (
        <div className="wip-banner" style={{ marginBottom: 12 }}>
          {isManager
            ? 'As a Manager you can assign tasks to Team Leads or directly to Employees. Leads then re-delegate to their team.'
            : 'As a Team Lead you can assign tasks to your Employees. Assignees Accept or Decline the handoff.'}
        </div>
      )}

      {view === 'list' ? (
        <DataTable
          columns={columns}
          rows={rows}
          onEdit={(r) => setModal({ mode: 'edit', row: r })}
          onDelete={handleDelete}
          canEdit={canEditRow}
          canDelete={() => isAdmin}
          editLabel={isAdmin ? 'Edit' : 'Update status'}
          emptyHint="No tasks yet. Managers and Team Leads break work into tasks and assign them down the hierarchy."
        />
      ) : (
        <div className="kanban">
          {STAGES.map((stage) => {
            const col = rows.filter((r) => (r.status ?? 'Not Started') === stage)
            return (
              <div
                key={stage}
                className={`kanban-col${overCol === stage ? ' over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOverCol(stage) }}
                onDragLeave={() => setOverCol((c) => (c === stage ? null : c))}
                onDrop={() => dropTo(stage)}
              >
                <div className="kanban-col-head"><span className={`kanban-dot s-${stage.toLowerCase().replace(/\s+/g, '-')}`} />{stage}<span className="kanban-count">{col.length}</span></div>
                <div className="kanban-cards">
                  {col.map((t) => (
                    <div
                      key={t.id as number}
                      className={`kanban-card${dragId === t.id ? ' dragging' : ''}${canEditRow(t) ? '' : ' locked'}`}
                      draggable={canEditRow(t)}
                      onDragStart={() => setDragId(t.id as number)}
                      onDragEnd={() => { setDragId(null); setOverCol(null) }}
                      onClick={() => setModal({ mode: 'edit', row: t })}
                    >
                      <div className="kanban-card-title">{String(t.name ?? '')}</div>
                      <div className="kanban-card-meta">
                        {t.assigned_member_id ? <span className="kanban-assignee">{nameById.get(String(t.assigned_member_id)) || '—'}</span> : <span style={{ color: 'var(--text-dim)' }}>Unassigned</span>}
                        {t.deadline ? <span className="kanban-deadline"><Icon name="calendar" size={12} /> {String(t.deadline)}</span> : null}
                      </div>
                      {t.acceptance === 'Pending' && <span className="badge badge-pending" style={{ marginTop: 6 }}>Awaiting accept</span>}
                    </div>
                  ))}
                  {col.length === 0 && <div className="kanban-empty">—</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <FormModal
          title={modal.mode === 'add' ? 'Add Task' : 'Edit Task'}
          fields={fields}
          initial={modal.row}
          isAdmin={isAdmin}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
          onToast={onToast}
        />
      )}
    </div>
  )
}
