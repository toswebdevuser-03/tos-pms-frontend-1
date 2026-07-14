import { useState } from 'react'
import CrudTab from '../components/CrudTab'
import { Column } from '../components/DataTable'
import { FieldDef } from '../components/FormModal'
import Icon from '../components/Icon'
import { useApp } from '../context/AppContext'

const CATEGORIES = ['Drawing / CAD', 'Documentation', 'Naming Convention', 'Layer / Style', 'QA / QC', 'Delivery', 'Other']

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Standard Title', required: true },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
  { key: 'description', label: 'Description / Details', type: 'textarea' },
  { key: 'reference', label: 'Reference (doc name or code)' },
  { key: 'path', label: 'File / Folder Path', type: 'path' },
  { key: 'version', label: 'Version' },
  { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Draft', 'Deprecated'] }
]

interface Props {
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
}

export default function StandardsTab({ projectId, projectName, onToast }: Props) {
  const { isLead } = useApp() // project-setup section: Team Lead+ only
  const [reloadSignal, setReloadSignal] = useState(0)

  const openPath = async (p: string): Promise<void> => {
    const res = await window.api.paths.open(p)
    if (!res.ok) onToast(res.error ?? 'Could not open path', 'error')
  }
  // Browsers can't launch Explorer to a local/UNC path, so we copy it instead —
  // the user pastes it into File Explorer's address bar. (Same pattern as PathTab.tsx)
  const reveal = async (p: string): Promise<void> => {
    try { await navigator.clipboard.writeText(p); onToast('Path copied — paste it into Explorer') }
    catch { onToast('Could not copy path', 'error') }
  }

  const columns: Column[] = [
    { key: 'title', label: 'Standard' },

    { key: 'category', label: 'Category', width: '150px' },
    {
      key: 'path', label: 'Path', width: '220px',
      render: (v) =>
        v ? (
          <div className="path-cell">
            <span className="path-text" title={String(v)}>{String(v)}</span>
            <button className="btn-icon" title="Open" onClick={(e) => { e.stopPropagation(); openPath(String(v)) }}><Icon name="externalLink" size={15} /></button>
            <button className="btn-icon" title="Copy path" onClick={(e) => { e.stopPropagation(); reveal(String(v)) }}><Icon name="clipboard" size={15} /></button>

          </div>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>—</span>
        )
    },
    { key: 'version', label: 'Version', width: '80px' },
    { key: 'status', label: 'Status', width: '100px' }
  ]

  const handleImport = async (): Promise<void> => {
    const res = await window.api.csv.import('standard')
    if (!res.ok) { onToast(res.error ?? 'Import failed', 'error'); return }
    const rows = res.data?.rows ?? []
    if (!rows.length) { onToast('No standards found in file'); return }
    for (const r of rows) {
      await window.api.items.create('standard', { project_id: projectId, ...r })
    }
    onToast(`Imported ${rows.length} standard(s)`)
    setReloadSignal((x) => x + 1)
  }

  const importBtn = isLead ? (
    <button className="btn btn-secondary btn-sm" onClick={handleImport} title="Import standards from a CSV file">
      <Icon name="upload" size={14} /> Import standards
    </button>
  ) : null

  return (
    <CrudTab
      type="standard" singular="Standard" projectId={projectId} projectName={projectName}
      columns={columns} fields={FIELDS} attachments onToast={onToast}
      addAllowed={isLead} canEditRow={() => isLead} canDeleteRow={() => isLead}
      toolbarExtra={importBtn}
      reloadSignal={reloadSignal}
      emptyHint="No standards documented yet. Team Leads and Managers add them here (with a file/folder path) or import a CSV."
    />
  )
}
