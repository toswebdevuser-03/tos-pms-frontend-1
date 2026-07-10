import { useEffect, useMemo, useState, ReactNode } from 'react'

import DataTable, { Column } from './DataTable'
import FormModal, { FieldDef } from './FormModal'
import ConfirmDialog from './ConfirmDialog'
import Icon from './Icon'
import { useApp } from '../context/AppContext'
import { ToastFn } from '../types'
import { useFilters, FilterConfig, SelectFilter } from './FilterBar'
import { useCreateItem, useDeleteItem, useItems, useUpdateItem } from '../hooks/useItems'


interface Props {
  type: string
  singular: string
  projectId: number
  projectName: string
  columns: Column[]
  fields: FieldDef[]
  attachments?: boolean
  adminOnlyAdd?: boolean
  addAllowed?: boolean // explicit override for who may Add (e.g. Team Lead+); takes precedence over adminOnlyAdd
  emptyHint?: string
  computeExtra?: (values: Record<string, string>) => Record<string, unknown>
  onToast: ToastFn
  onData?: (rows: Record<string, unknown>[]) => void
  toolbarExtra?: ReactNode
  headerExtra?: ReactNode
  rowFilter?: (row: Record<string, unknown>) => boolean
  canEditRow?: (row: Record<string, unknown>) => boolean
  canDeleteRow?: (row: Record<string, unknown>) => boolean
  editLabel?: string
}

export default function CrudTab({
  type, singular, projectId, projectName, columns, fields, attachments,
  adminOnlyAdd, addAllowed, emptyHint, computeExtra, onToast, onData, toolbarExtra, headerExtra, rowFilter,
  canEditRow, canDeleteRow, editLabel
}: Props) {
  const { isAdmin } = useApp()

  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; row?: Record<string, unknown> } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Record<string, unknown> | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const toggleSelect = (id: number): void => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = (ids: number[], select: boolean): void => setSelected((s) => { const n = new Set(s); ids.forEach((id) => (select ? n.add(id) : n.delete(id))); return n })

  const { data: rows = [] } = useItems(type, projectId)
  const createItem = useCreateItem(type, projectId)
  const updateItem = useUpdateItem(type, projectId)
  const deleteItem = useDeleteItem(type, projectId)

  useEffect(() => {
    onData?.(rows)
    setSelected(new Set())
  }, [rows, onData])


  const handleSubmit = async (data: Record<string, string>) => {
    const extra = computeExtra ? computeExtra(data) : {}
    if (modal?.mode === 'edit' && modal.row) {
      await updateItem.mutateAsync({ id: modal.row.id, project_id: projectId, ...data, ...extra })
      onToast(`${singular} updated`)
    } else {
      await createItem.mutateAsync({ project_id: projectId, ...data, ...extra })
      onToast(`${singular} added`)
    }
    setModal(null)
  }


  const handleDelete = async (row: Record<string, unknown>) => {
    await deleteItem.mutateAsync(row.id as number)

    // Capture the row (minus server-managed fields) so the delete can be undone.

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, created_by, updated_by, version, ...payload } = row
    onToast(`${singular} deleted`, 'success', {
      label: 'Undo',
      onClick: async () => {
        await createItem.mutateAsync({ project_id: projectId, ...payload })
        onToast(`${singular} restored`)
      }
    })
  }


  const handleExport = async (selectedOnly = false) => {
    const data = selectedOnly ? rows.filter((r) => selected.has(r.id as number)) : rows
    if (!data.length) { onToast(selectedOnly ? 'Select some rows first' : 'No data to export', 'error'); return }
    const res = await window.api.excel.export(type, projectName, data)
    if (res.ok && res.data?.filePath) onToast(`Exported ${data.length} row(s) to ${res.data.filePath}`)
    else if (res.ok) onToast('Export cancelled')
    else onToast(res.error ?? 'Export failed', 'error')
  }

  const canAdd = addAllowed ?? (adminOnlyAdd ? isAdmin : true)


  // Derive filters from the tab's own definitions: a dropdown for every select
  // field, a from/to range over the first date field, and free-text over columns.
  const filterConfig = useMemo<FilterConfig>(() => {
    const selects: SelectFilter[] = fields
      .filter((f) => f.type === 'select')
      .map((f) => ({
        key: f.key,
        label: f.label.replace(/\s*\(.*\)\s*$/, ''),
        options: f.optionValues ? f.optionValues.map((o) => o.value).filter(Boolean) : f.options
      }))
    const dateField = fields.find((f) => f.type === 'date')
    return {
      searchKeys: columns.map((c) => c.key),
      selects,
      dateKey: dateField?.key,
      dateLabel: dateField?.label,
      // Offer every visible column as a sort field (uses the column's own label).
      sorts: columns.map((c) => ({ key: c.key, label: c.label })),
      searchPlaceholder: `Search ${singular.toLowerCase()}…`
    }
  }, [fields, columns, singular])

  const baseRows = rowFilter ? rows.filter(rowFilter) : rows

  const { filtered: displayRows, bar, sortKey, sortDir, onHeaderSort } = useFilters(baseRows, filterConfig)

  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="tab-toolbar-left">
          {canAdd ? (
            <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: 'add' })}>+ Add {singular}</button>
          ) : null}
          {toolbarExtra}
        </div>
        <div className="tab-toolbar-right">
          {selected.size > 0 ? <button className="btn btn-secondary btn-sm" onClick={() => handleExport(true)}><Icon name="download" size={15} /> Export selected ({selected.size})</button> : null}
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport(false)}><Icon name="download" size={15} /> Export all</button>
        </div>
      </div>
      {headerExtra}
      {bar}
      <DataTable
        columns={columns}
        rows={displayRows}
        emptyHint={emptyHint}
        onEdit={(r) => setModal({ mode: 'edit', row: r })}
        onDelete={(r) => setConfirmDelete(r)}
        canEdit={canEditRow}
        canDelete={canDeleteRow}
        editLabel={editLabel}
        selectable
        selectedIds={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        sortKey={sortKey}
        sortDir={sortDir}
        onHeaderSort={onHeaderSort}
      />
      {modal && (
        <FormModal
          title={modal.mode === 'add' ? `Add ${singular}` : `Edit ${singular}`}
          fields={fields}
          initial={modal.row}
          isAdmin={isAdmin}
          attachmentsEntity={attachments ? { type, id: (modal.row?.id as number) ?? null } : undefined}
          onSubmit={handleSubmit}
          onClose={() => { setModal(null) }}

          onToast={onToast}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${singular}`}
          message={`Delete this ${singular.toLowerCase()}?`}
          onConfirm={() => { const row = confirmDelete; setConfirmDelete(null); handleDelete(row) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
