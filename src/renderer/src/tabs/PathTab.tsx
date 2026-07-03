import CrudTab from '../components/CrudTab'
import { Column } from '../components/DataTable'
import { FieldDef } from '../components/FormModal'
import Icon from '../components/Icon'
import { useApp } from '../context/AppContext'

interface Props {
  type: string
  singular: string
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
  withDate?: boolean
  hint?: string
  // The first column/field defaults to a free-text "Title". Override it (e.g. the
  // Input tab uses a Date instead) with these props.
  primaryKey?: string
  primaryLabel?: string
  primaryType?: FieldDef['type']
}

export default function PathTab({ type, singular, projectId, projectName, onToast, withDate, hint, primaryKey = 'title', primaryLabel = 'Title', primaryType }: Props) {
  const { isLead } = useApp() // project-setup sections: Team Lead+ may add/edit/delete; employees view only
  const isUrl = (p: string): boolean => /^https?:\/\//i.test(p)
  const openPath = async (p: string): Promise<void> => {
    const res = await window.api.paths.open(p)
    if (!res.ok) onToast(res.error ?? 'Could not open path', 'error')
  }
  // Browsers can't launch Explorer to a local/UNC path, so we copy it instead —
  // the user pastes it into File Explorer's address bar.
  const copyPath = async (p: string): Promise<void> => {
    try { await navigator.clipboard.writeText(p); onToast('Path copied — paste it into Explorer') }
    catch { onToast('Could not copy path', 'error') }
  }

  const pathColumn: Column = {
    key: 'path',
    label: 'Path',
    render: (v) =>
      v ? (
        <div className="path-cell">
          <span className="path-text" title={String(v)}>{String(v)}</span>
          {isUrl(String(v)) && <button className="btn-icon" title="Open link" onClick={(e) => { e.stopPropagation(); openPath(String(v)) }}><Icon name="externalLink" size={15} /></button>}
          <button className="btn-icon" title="Copy path" onClick={(e) => { e.stopPropagation(); copyPath(String(v)) }}><Icon name="clipboard" size={15} /></button>
        </div>
      ) : (
        <span style={{ color: 'var(--text-dim)' }}>No path set</span>
      )
  }

  const columns: Column[] = [
    { key: primaryKey, label: primaryLabel, ...(primaryType === 'date' ? { width: '120px' } : {}) },
    ...(withDate ? [{ key: 'date', label: 'Date', width: '120px' } as Column] : []),
    pathColumn,
    { key: 'notes', label: 'Notes', width: '220px' }
  ]

  const fields: FieldDef[] = [
    { key: primaryKey, label: primaryLabel, required: true, ...(primaryType ? { type: primaryType } : {}) },
    ...(withDate ? [{ key: 'date', label: 'Date', type: 'date' } as FieldDef] : []),
    { key: 'path', label: 'File / Folder Path', type: 'path' },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]

  return (
    <CrudTab
      type={type} singular={singular} projectId={projectId} projectName={projectName}
      columns={columns} fields={fields} onToast={onToast}
      addAllowed={isLead} canEditRow={() => isLead} canDeleteRow={() => isLead}
      emptyHint={hint}
    />
  )
}
