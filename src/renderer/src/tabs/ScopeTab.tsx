import { useState, useMemo } from 'react'
import CrudTab from '../components/CrudTab'
import { Column } from '../components/DataTable'
import { FieldDef } from '../components/FormModal'
import Icon from '../components/Icon'
import { useApp } from '../context/AppContext'

interface Props {
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
}

type Row = Record<string, unknown>

// Every approved quote linked to this project (the base quote, plus any additional
// quotes — each tagged quote_field='__doc', one per quote_id) gets its own readable
// document card; any other scope items stay as an editable path list below.
export default function ScopeTab({ projectId, projectName, onToast }: Props) {
  const { isLead, isAdmin } = useApp()
  const [rows, setRows] = useState<Row[]>([])

  const docs = useMemo(
    () => rows.filter((r) => r.quote_field === '__doc').sort((a, b) => Number(a.quote_id ?? 0) - Number(b.quote_id ?? 0)),
    [rows]
  )

  const copyPath = async (p: string): Promise<void> => {
    try { await navigator.clipboard.writeText(p); onToast('Path copied — paste it into Explorer') } catch { onToast('Could not copy path', 'error') }
  }

  const columns: Column[] = [
    { key: 'title', label: 'Title' },
    {
      key: 'path', label: 'Path',
      render: (v) => v ? (
        <div className="path-cell"><span className="path-text" title={String(v)}>{String(v)}</span>
          <button className="btn-icon" title="Copy path" onClick={(e) => { e.stopPropagation(); copyPath(String(v)) }}><Icon name="clipboard" size={15} /></button>
        </div>
      ) : <span style={{ color: 'var(--text-dim)' }}>No path set</span>
    },
    { key: 'notes', label: 'Notes', width: '260px' }
  ]
  const fields: FieldDef[] = [
    { key: 'title', label: 'Title', required: true },
    { key: 'path', label: 'File / Folder Path', type: 'path' },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]

  // Pull a few headline fields into a summary strip; the rest render as details.
  const SUMMARY_KEYS = ['Client', 'Project', 'Project Hours', 'QC Hours']
  // Quoted hours (Project/QC totals + per-discipline "X hrs" lines) are visible only
  // to Project Lead and above — employees must not see them here, like the Timesheet.
  const isHoursLine = (label: string): boolean =>
    label === 'Project Hours' || label === 'QC Hours' || / hrs$/i.test(label.trim())

  const docCard = (doc: Row): React.JSX.Element => {
    const body = String(doc.notes ?? '')
    const docLines = body.split('\n').filter(Boolean).map((line) => {
      const i = line.indexOf(': ')
      return i > 0 ? { label: line.slice(0, i), value: line.slice(i + 2) } : { label: '', value: line }
    })
    const pick = (label: string): string => docLines.find((l) => l.label.toLowerCase() === label.toLowerCase())?.value ?? ''
    const summary = SUMMARY_KEYS.filter((k) => isAdmin || !isHoursLine(k)).map((k) => ({ k, v: pick(k) })).filter((x) => x.v)
    const details = docLines.filter((l) => !SUMMARY_KEYS.includes(l.label) && (isAdmin || !isHoursLine(l.label)))
    return (
      <div className="scope-doc" key={String(doc.id)}>
        <div className="scope-doc-head">
          <Icon name="file" size={18} />
          <div>
            <div className="scope-doc-title">{String(doc.title ?? 'Scope of Work')}</div>
            <div className="scope-doc-caption">Generated from the approved quotation</div>
          </div>
        </div>
        {summary.length > 0 && (
          <div className="scope-doc-summary">
            {summary.map((s) => (
              <div className="scope-stat" key={s.k}>
                <span className="scope-stat-val">{s.v}</span>
                <span className="scope-stat-lbl">{s.k}</span>
              </div>
            ))}
          </div>
        )}
        {details.length > 0 && (
          <table className="scope-doc-table"><tbody>
            {details.map((l, i) => (
              <tr key={i}>{l.label ? <><th>{l.label}</th><td>{l.value}</td></> : <td colSpan={2}>{l.value}</td>}</tr>
            ))}
          </tbody></table>
        )}
      </div>
    )
  }

  return (
    <CrudTab
      type="scope" singular="Scope Item" projectId={projectId} projectName={projectName}
      columns={columns} fields={fields} onToast={onToast}
      onData={setRows}
      addAllowed={isLead} canEditRow={() => isLead} canDeleteRow={() => isLead}
      headerExtra={docs.length > 0 ? <>{docs.map(docCard)}</> : null}
      rowFilter={(r) => r.quote_field !== '__doc'}
      emptyHint="No extra scope items. The scope document(s) from the approved quotation(s) appear above; add file/folder paths here if needed."
    />
  )
}
