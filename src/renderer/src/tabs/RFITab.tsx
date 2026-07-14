import { useState, useEffect, useMemo } from 'react'
import Icon from '../components/Icon'
import ConfirmDialog from '../components/ConfirmDialog'
import { Attachment } from '../types'
import { DISCIPLINES } from '../disciplines'
import { useFilters } from '../components/FilterBar'
import { useItems } from '../hooks/useItems'
import { useData } from '../context/DataContext'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeyFactory } from '../hooks/queryKeyFactory'

interface Props {
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
}

type Row = Record<string, unknown>
interface Point { id: string; text: string; image?: string; response?: string }
type Kind = 'RFI' | 'Query'

const DISC_CODE: Record<string, string> = { Architecture: 'ARC', Structural: 'STR', MEP: 'MEP' }
const MAX_IMG = 1024 * 1024 // 1 MB per point image
const today = (): string => new Date().toISOString().slice(0, 10)
const pid = (): string => `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const isLegacy = (r: Row): boolean => !Array.isArray(r.points)
const pointsOf = (r: Row): Point[] => (Array.isArray(r.points) ? (r.points as Point[]) : [])
const answered = (p: Point): boolean => !!String(p.response ?? '').trim()
const statusOf = (r: Row): 'Open' | 'Closed' => {
  if (isLegacy(r)) {
    const s = String(r.status ?? 'Open')
    return s === 'Closed' || s === 'Resolved' ? 'Closed' : 'Open'
  }
  const pts = pointsOf(r)
  return pts.length > 0 && pts.every(answered) ? 'Closed' : 'Open'
}

// Next number per project, per type, per discipline: e.g. RFI-ARC-001 / QRY-STR-003.
function nextNumber(rows: Row[], kind: Kind, disc: string): string {
  const prefix = kind === 'Query' ? 'QRY' : 'RFI'
  const code = DISC_CODE[disc] ?? 'GEN'
  const re = new RegExp(`^${prefix}-${code}-(\\d+)$`, 'i')
  let max = 0
  for (const r of rows) {
    const m = String(r.rfi_number ?? '').match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${code}-${String(max + 1).padStart(3, '0')}`
}

interface Draft { id?: number; kind: Kind; discipline: string; submitted_date: string; rfi_number?: string; points: Point[] }

export default function RFITab({ projectId, projectName, onToast }: Props) {
  const queryClient = useQueryClient()
  const { refreshRfis } = useData()
  const { data: rows = [] } = useItems('rfi', projectId)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [legacy, setLegacy] = useState<Row | null>(null)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null)
  const [confirmRemovePoint, setConfirmRemovePoint] = useState<number | null>(null)

  const toggleSel = (id: number): void => setSelected((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const refreshRows = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.items.byProject('rfi', projectId) }),
      refreshRfis()
    ])
    setSelected(new Set())
  }

  const withMeta = useMemo(() => rows.map((r) => ({
    ...r,
    _status: statusOf(r),
    _kind: String(r.kind ?? 'RFI'),
    _disc: String(r.discipline ?? ''),
    _subject: String(r.subject ?? '')
  })), [rows])

  const { filtered, bar } = useFilters(withMeta, {
    searchKeys: ['rfi_number', '_disc', '_subject'],
    searchPlaceholder: 'Search RFIs / queries…',
    selects: [
      { key: '_kind', label: 'Type', options: ['RFI', 'Query'] },
      { key: '_disc', label: 'Discipline', options: DISCIPLINES },
      { key: '_status', label: 'Status', options: ['Open', 'Closed'] }
    ],
    sorts: [
      { key: 'rfi_number', label: 'No.' },
      { key: '_kind', label: 'Type' },
      { key: '_disc', label: 'Discipline' },
      { key: '_status', label: 'Status' },
      { key: 'submitted_date', label: 'Date' }
    ],
    defaultSort: { key: 'submitted_date', dir: 'desc' }
  })

  const agg = useMemo(() => {
    let total = 0
    let ans = 0
    for (const r of rows) {
      const pts = pointsOf(r)
      total += pts.length
      ans += pts.filter(answered).length
    }
    return { total, ans }
  }, [rows])

  const startNew = (): void => setDraft({
    kind: 'RFI',
    discipline: '',
    submitted_date: today(),
    points: [{ id: pid(), text: '', response: '' }]
  })

  const startEdit = (r: Row): void => {
    if (isLegacy(r)) { setLegacy(r); return }
    setDraft({
      id: r.id as number,
      kind: (String(r.kind ?? 'RFI') as Kind),
      discipline: String(r.discipline ?? ''),
      submitted_date: String(r.submitted_date ?? today()),
      rfi_number: String(r.rfi_number ?? ''),
      points: pointsOf(r).map((p) => ({ ...p }))
    })
  }

  const setPoint = (i: number, patch: Partial<Point>): void =>
    setDraft((d) => (d
      ? { ...d, points: d.points.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) }
      : d
    ))

  const addPoint = (): void =>
    setDraft((d) => (d
      ? { ...d, points: [...d.points, { id: pid(), text: '', response: '' }] }
      : d
    ))

  const removePoint = (i: number): void =>
    setDraft((d) => (d
      ? { ...d, points: d.points.filter((_, idx) => idx !== i) }
      : d
    ))

  const onPointImage = (i: number, file: File | undefined): void => {
    if (!file) return
    if (file.size > MAX_IMG) {
      onToast('Image must be under 1 MB — please compress it first', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPoint(i, { image: String(reader.result) })
    reader.onerror = () => onToast('Could not read that image', 'error')
    reader.readAsDataURL(file)
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    if (!draft.discipline) {
      onToast('Pick a discipline', 'error')
      return
    }
    const points = draft.points.filter((p) =>
      String(p.text ?? '').trim() || p.image || String(p.response ?? '').trim()
    )
    if (points.length === 0) {
      onToast('Add at least one point', 'error')
      return
    }

    const status = points.every(answered) ? 'Closed' : 'Open'
    setSaving(true)
    try {
      if (draft.id) {
        await window.api.items.update('rfi', {
          id: draft.id,
          project_id: projectId,
          kind: draft.kind,
          discipline: draft.discipline,
          submitted_date: draft.submitted_date,
          rfi_number: draft.rfi_number,
          points,
          status
        })
        onToast('RFI/Query updated')
      } else {
        const number = nextNumber(rows, draft.kind, draft.discipline)
        await window.api.items.create('rfi', {
          project_id: projectId,
          kind: draft.kind,
          discipline: draft.discipline,
          submitted_date: draft.submitted_date,
          rfi_number: number,
          points,
          status
        })
        onToast(`${draft.kind} ${number} created`)
      }
      setDraft(null)
      await refreshRows()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: Row): Promise<void> => {
    await window.api.items.delete('rfi', r.id as number)
    onToast('Deleted')
    setLegacy(null)
    await refreshRows()
  }

  // Export helpers
  const exportFmt = async (fmt: 'excel' | 'word' | 'ppt'): Promise<void> => {
    const data = selected.size ? rows.filter((r) => selected.has(r.id as number)) : rows
    if (!data.length) {
      onToast('No data to export', 'error')
      return
    }

    const fileName = data.length === 1
      ? `${String(data[0].rfi_number ?? 'RFI')}_${projectName}`
      : `${projectName}_RFI-Query`

    if (fmt === 'word') {
      const { exportRfiWord } = await import('../lib/rfiExport')
      exportRfiWord(data, projectName, fileName)
      onToast(`Exported ${data.length} item(s) to Word`)
      return
    }

    if (fmt === 'ppt') {
      onToast('Preparing PowerPoint…')
      const { exportRfiPpt } = await import('../lib/rfiExport')
      await exportRfiPpt(data, projectName, fileName)
      onToast(`Exported ${data.length} item(s) to PowerPoint`)
      return
    }

    const res = await window.api.excel.export('rfi', projectName, data, fileName)
    if (res.ok && res.data?.filePath) onToast(`Exported ${data.length} row(s): ${res.data.filePath}`)
    else if (res.ok) onToast('Export cancelled')
    else onToast(res.error ?? 'Export failed', 'error')
  }

  const exportOne = async (row: Row): Promise<void> => {
    const fileName = `${String(row.rfi_number ?? 'RFI')}_${projectName}`
    const res = await window.api.excel.export('rfi', projectName, [row], fileName)
    if (res.ok && res.data?.filePath) onToast(`Exported ${res.data.filePath}`)
    else if (res.ok) onToast('Export cancelled')
    else onToast(res.error ?? 'Export failed', 'error')
  }

  // Editor
  if (draft) {
    const numberPreview = draft.rfi_number || (
      draft.discipline
        ? nextNumber(rows, draft.kind, draft.discipline)
        : `${draft.kind === 'Query' ? 'QRY' : 'RFI'}-…`
    )

    return (
      <div className="tab-content">
        <div className="tab-toolbar">
          <div className="tab-toolbar-left">
            <button className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>
              <Icon name="arrowLeft" size={14} /> Back to list
            </button>
          </div>
          <div className="tab-toolbar-right">
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>

        <div className="rfi-editor">
          <div className="rfi-head">
            <label>
              <span>Type</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}>
                <option value="RFI">RFI</option>
                <option value="Query">Query</option>
              </select>
            </label>

            <label>
              <span>Discipline</span>
              <select value={draft.discipline} onChange={(e) => setDraft({ ...draft, discipline: e.target.value })}>
                <option value="">— Select</option>
                {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={draft.submitted_date}
                onChange={(e) => setDraft({ ...draft, submitted_date: e.target.value })}
              />
            </label>

            <div className="rfi-number">No. <strong>{numberPreview}</strong></div>
          </div>

          <div className="rfi-points">
            {draft.points.map((p, i) => (
              <div className="rfi-point" key={p.id}>
                <div className="rfi-point-no">{i + 1}</div>
                <div className="rfi-point-body">
                  <textarea
                    rows={2}
                    placeholder="Point / question…"
                    value={p.text}
                    onChange={(e) => setPoint(i, { text: e.target.value })}
                  />

                  <div className="rfi-point-img">
                    <input type="file" accept="image/*" onChange={(e) => onPointImage(i, e.target.files?.[0])} />
                    <span className="attach-hint"><Icon name="alertTriangle" size={13} /> image under 1 MB only</span>

                    {p.image && (
                      <div className="rfi-thumb">
                        <img src={p.image} alt="" />
                        <button
                          className="btn btn-secondary btn-xs"
                          type="button"
                          onClick={() => setPoint(i, { image: undefined })}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  <textarea
                    rows={2}
                    className={answered(p) ? 'rfi-answered' : ''}
                    placeholder="Response (leave blank = Open)…"
                    value={p.response ?? ''}
                    onChange={(e) => setPoint(i, { response: e.target.value })}
                  />
                </div>

                <button className="btn-icon danger" title="Remove point" onClick={() => setConfirmRemovePoint(i)}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>

          <button className="btn btn-secondary btn-sm" onClick={addPoint}>
            <Icon name="plus" size={14} /> Add point
          </button>
        </div>

        {confirmRemovePoint !== null && (
          <ConfirmDialog
            title="Remove point"
            message={`Remove point ${confirmRemovePoint + 1}? This cannot be undone.`}
            onConfirm={() => { const i = confirmRemovePoint; setConfirmRemovePoint(null); removePoint(i) }}
            onCancel={() => setConfirmRemovePoint(null)}
          />
        )}
      </div>
    )
  }

  // Legacy read-only detail
  if (legacy) {
    return (
      <>
        <LegacyDetail row={legacy} onBack={() => setLegacy(null)} onDelete={() => setConfirmDelete(legacy)} />
        {confirmDelete && (
          <ConfirmDialog
            title="Delete RFI/Query"
            message={`Delete ${String(confirmDelete.rfi_number || confirmDelete.subject || 'this entry')}? This cannot be undone.`}
            onConfirm={() => { const r = confirmDelete; setConfirmDelete(null); remove(r) }}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </>
    )
  }

  // List
  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="tab-toolbar-left">
          <button className="btn btn-primary btn-sm" onClick={startNew}>+ New RFI / Query</button>
        </div>

        <div className="tab-toolbar-right">
          <span className="attach-hint" style={{ marginRight: 8 }}>{agg.ans}/{agg.total} points answered</span>
          <span className="attach-hint">Export {selected.size ? `${selected.size} selected` : 'all'}:</span>
          <button className="btn btn-secondary btn-sm" onClick={() => exportFmt('excel')}><Icon name="download" size={15} /> Excel</button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportFmt('word')}><Icon name="file" size={15} /> Word</button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportFmt('ppt')}><Icon name="barChart" size={15} /> PPT</button>
        </div>
      </div>

      {rows.length > 0 ? bar : null}

      {rows.length === 0 ? (
        <div className="empty-table">
          <p>No RFIs or queries yet. Click <strong>New RFI / Query</strong> to raise one with point-by-point questions, images and responses.</p>
        </div>
      ) : (
        (() => {
          const fRows = filtered as Row[]
          const allSel = fRows.length > 0 && fRows.every((r) => selected.has(r.id as number))
          const toggleAll = (): void => setSelected((s) => {
            const n = new Set(s)
            fRows.forEach((r) => (allSel ? n.delete(r.id as number) : n.add(r.id as number)))
            return n
          })

          return (
            <div className="table-wrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input type="checkbox" title="Select all" checked={allSel} onChange={toggleAll} />
                    </th>
                    <th style={{ width: 130 }}>No.</th>
                    <th style={{ width: 80 }}>Type</th>
                    <th style={{ width: 110 }}>Discipline</th>
                    <th>Summary</th>
                    <th style={{ width: 110 }}>Points</th>
                    <th style={{ width: 90 }}>Status</th>
                    <th style={{ width: 100 }}>Date</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>

                <tbody>
                  {fRows.map((r) => {
                    const pts = pointsOf(r)
                    const ans = pts.filter(answered).length
                    const st = statusOf(r)
                    const lg = isLegacy(r)

                    return (
                      <tr
                        key={r.id as number}
                        className="home-row"
                        onClick={() => startEdit(r)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(r.id as number)}
                            onChange={() => toggleSel(r.id as number)}
                          />
                        </td>

                        <td>
                          <strong>{String(r.rfi_number || '—')}</strong>
                          {lg && <span className="badge badge-archived" style={{ marginLeft: 4 }}>legacy</span>}
                        </td>

                        <td><span className="badge badge-design">{String(r.kind || 'RFI')}</span></td>
                        <td>{String(r.discipline || (lg ? '—' : '—'))}</td>

                        <td>
                          {lg
                            ? String(r.subject || '—')
                            : (pts[0]?.text
                              ? `${pts[0].text.slice(0, 60)}${pts[0].text.length > 60 ? '…' : ''}`
                              : '—')}
                        </td>

                        <td>{lg ? '—' : `${ans}/${pts.length} answered`}</td>

                        <td><span className={`badge ${st === 'Closed' ? 'badge-resolved' : 'badge-pending'}`}>{st}</span></td>
                        <td>{String(r.submitted_date || '—')}</td>

                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            className="btn-icon"
                            title={`Export this ${String(r.kind || 'RFI')} (Excel) — ${String(r.rfi_number || '')}_${projectName}`}
                            onClick={() => exportOne(r)}
                          >
                            <Icon name="download" size={16} />
                          </button>

                          <button className="btn-icon" title={lg ? 'View' : 'Edit'} onClick={() => startEdit(r)}>
                            <Icon name="edit" size={16} />
                          </button>

                          <button className="btn-icon danger" title="Delete" onClick={() => setConfirmDelete(r)}>
                            <Icon name="trash" size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete RFI/Query"
          message={`Delete ${String(confirmDelete.rfi_number || confirmDelete.subject || 'this entry')}? This cannot be undone.`}
          onConfirm={() => { const r = confirmDelete; setConfirmDelete(null); remove(r) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// Legacy entries (old single subject/description/response shape) are shown read-only
// with their attachment images, per the "leave legacy as-is" decision.
function LegacyDetail({ row, onBack, onDelete }: { row: Row; onBack: () => void; onDelete: () => void }): React.JSX.Element {
  const [imgs, setImgs] = useState<{ a: Attachment; url: string }[]>([])

  useEffect(() => {
    let alive = true
    void window.api.attachments.get('rfi', row.id as number).then(async (res) => {
      if (!res.ok) return
      const out: { a: Attachment; url: string }[] = []
      for (const a of res.data as Attachment[]) {
        const r = await window.api.attachments.read(a.stored_path)
        if (r.ok && r.data) out.push({ a, url: r.data.dataUrl })
      }
      if (alive) setImgs(out)
    })
    return () => { alive = false }
  }, [row.id])

  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="tab-toolbar-left">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>
            <Icon name="arrowLeft" size={14} /> Back to list
          </button>
        </div>

        <div className="tab-toolbar-right">
          <button className="btn-icon danger" title="Delete" onClick={onDelete}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>

      <div className="rfi-legacy">
        <p className="attach-hint">Legacy entry (old format) — shown read-only.</p>
        <h3>{String(row.rfi_number || '')} · {String(row.subject || '')}</h3>

        <p>
          <strong>Type:</strong> {String(row.kind || 'RFI')} &nbsp;
          <strong>Status:</strong> {String(row.status || '—')} &nbsp;
          <strong>Date:</strong> {String(row.submitted_date || '—')}
        </p>

        {!!row.description && (
          <p><strong>Description:</strong><br />{String(row.description)}</p>
        )}

        {!!row.response && (
          <p><strong>Response:</strong><br />{String(row.response)}</p>
        )}

        {imgs.length > 0 && (
          <div className="rfi-legacy-imgs">
            {imgs.map(({ a, url }) => (
              <img
                key={a.id}
                src={url}
                alt={a.filename}
                onClick={() => window.api.attachments.open(a.stored_path)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
