import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { Quote, Client, ToastFn } from '../types'
import Icon from './Icon'
import ConfirmDialog from './ConfirmDialog'
import { useFilters } from './FilterBar'
import { useApp } from '../context/AppContext'
import { useData } from '../context/DataContext'
import { DISCIPLINES, splitDisciplines } from '../disciplines'
import { useEscapeKey } from '../lib/useEscapeKey'
import { roleRank, RANK_MANAGER } from '../roles'
import {
  Draft, Status, today, niceDate, statusOf, dhOf, computeHours, QUOTE_CSS, quoteBody, wordHtml, fullHtml, esc, syncScope
} from '../lib/quoteDoc'

interface Props {
  onClose: () => void
  onToast: ToastFn
  onOpenProject?: (projectId: number) => void
}

const STATUSES: Status[] = ['Draft', 'Sent', 'Approved']

// BIM Level of Development options for the LOD value picker.
const LOD_OPTIONS = ['LOD 100', 'LOD 200', 'LOD 300', 'LOD 350', 'LOD 400', 'LOD 500']
const MAX_IMG = 1024 * 1024 // 1 MB

const BLANK: Draft = {
  quote_no: '', date: '', client_name: '', project_name: '', project_hours: '', qc_hours: '',
  type_of_building: '', disciplines: '', lod: '', lod_type: 'LOD', tolerance: '', type_of_project: '',
  area: '', units: '', software: '', inputs_received: '', output_deliverable: '',
  inputs_required: '', exclusions: '', note: '', description: '', status: 'Draft', disc_hours: {}
}

// Plain scope-of-work fields rendered as single-line / textarea inputs.
// NB: 'type_of_building' is rendered explicitly in the editor (and the doc) — do not
// list it here or it shows twice.
const TEXT_FIELDS: { key: keyof Quote; label: string; area?: boolean; optional?: boolean }[] = [
  { key: 'tolerance', label: 'Tolerance', optional: true },
  { key: 'type_of_project', label: 'Type of Project' },
  { key: 'area', label: 'Area of the building overall' },
  { key: 'units', label: 'Units of measurement' },
  { key: 'software', label: 'Software to be used' },
  { key: 'description', label: 'Description', area: true },
  { key: 'inputs_received', label: 'Inputs Received', area: true },
  { key: 'output_deliverable', label: 'Output Deliverable', area: true },
  { key: 'inputs_required', label: 'Inputs Required', area: true },
  { key: 'exclusions', label: 'Exclusions', area: true },
  { key: 'note', label: 'Note', area: true }
]

export default function QuoteModal({ onClose, onToast, onOpenProject }: Props) {
  useEscapeKey(onClose)
  const { currentMember, isLead, members } = useApp()
  const { projects: allProjects, refreshAll: refreshData } = useData()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [addClient, setAddClient] = useState<{ name: string; company: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Quote | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [qr, cr] = await Promise.all([window.api.quotes.list(), window.api.clients.list()])
    if (qr.ok) setQuotes(qr.data as Quote[]); else onToast(qr.error ?? 'Could not load quotes', 'error')
    if (cr.ok) setClients(cr.data as Client[])
    setLoading(false)
  }, [onToast])
  useEffect(() => { load() }, [load])

  const nextQuoteNo = useMemo(() => {
    const yr = new Date().getFullYear()
    let max = 0
    for (const x of quotes) { const m = String(x.quote_no ?? '').match(/(\d+)\s*$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
    return `TOS-Q-${yr}-${String(max + 1).padStart(3, '0')}`
  }, [quotes])

  const { filtered: shownQuotes, bar } = useFilters(quotes as unknown as Record<string, unknown>[], {
    searchKeys: ['quote_no', 'client_name', 'project_name'],
    searchPlaceholder: 'Search quotations…',
    selects: [{ key: 'client_name', label: 'Client' }, { key: 'status', label: 'Status', options: STATUSES }],
    dateKey: 'date',
    dateLabel: 'Date'
  })

  const startNew = (): void => setDraft({ ...BLANK, date: today(), quote_no: nextQuoteNo, disc_hours: {} })
  const startEdit = (q: Quote): void => setDraft({ ...q, status: statusOf(q), lod_type: q.lod_type ?? 'LOD', disc_hours: q.disc_hours ?? {} })
  // "Add additional quote" — a full, independently editable quote (same editor, same
  // fields) linked to an already-approved parent via parent_quote_id. Pre-fills the
  // client/project link only; the scope-of-work fields start blank for the new scope.
  const startAddendum = (parent: Quote): void =>
    setDraft({
      ...BLANK, date: today(), quote_no: nextQuoteNo, disc_hours: {},
      client_id: parent.client_id, client_name: parent.client_name,
      project_name: parent.project_name, project_id: parent.project_id,
      parent_quote_id: parent.id
    })
  const parentOf = (q: Quote): Quote | undefined => quotes.find((x) => x.id === q.parent_quote_id)
  const setF = (k: keyof Quote, v: string): void => setDraft((d) => (d ? { ...d, [k]: v } : d))
  const setDH = (disc: string, field: 'work' | 'qc', v: string): void =>
    setDraft((d) => (d ? { ...d, disc_hours: { ...(d.disc_hours ?? {}), [disc]: { ...dhOf(d, disc), [field]: v } } } : d))

  const onImageFor = (key: keyof Quote, file: File | undefined): void => {
    if (!file) return
    if (file.size > MAX_IMG) { onToast('Image must be under 1 MB — please compress it first', 'error'); return }
    const reader = new FileReader()
    reader.onload = () => setF(key, String(reader.result))
    reader.onerror = () => onToast('Could not read that image', 'error')
    reader.readAsDataURL(file)
  }
  // Compact image upload + preview for a specific image field (Description / Note).
  const imgUpload = (key: 'description_image' | 'note_image'): React.JSX.Element => (
    <div className="quote-field">
      <span>↳ image (optional)</span>
      <div style={{ flex: 1 }}>
        <input type="file" accept="image/*" onChange={(e) => onImageFor(key, e.target.files?.[0])} />
        <div className="attach-hint" style={{ marginTop: 4 }}><Icon name="alertTriangle" size={13} /> import an image under 1 MB only.</div>
        {draft?.[key] && (
          <div style={{ marginTop: 6 }}>
            <img src={draft[key] as string} alt="" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 6, border: '1px solid var(--border)' }} />
            <button className="btn btn-secondary btn-xs" type="button" style={{ display: 'block', marginTop: 4 }} onClick={() => setF(key, '')}>Remove image</button>
          </div>
        )}
      </div>
    </div>
  )

  const createClientInline = async (): Promise<void> => {
    if (!addClient || !addClient.name.trim()) { onToast('Client name is required', 'error'); return }
    const res = await window.api.clients.create(addClient)
    if (!res.ok) { onToast(res.error ?? 'Could not create client (name may exist)', 'error'); return }
    const cr = await window.api.clients.list()
    if (cr.ok) setClients(cr.data as Client[])
    const newId = (res.data as { id: number }).id
    setDraft((d) => (d ? { ...d, client_id: newId, client_name: addClient.name.trim() } : d))
    setAddClient(null)
    onToast('Client added')
  }


  // Persist with the chosen status. 'Approved' creates/syncs the project (and links the
  // client). A project's quoted hours are the SUM of every quote linked to it (the base
  // quote plus any additional quotes), so approving/editing any one of them keeps the
  // project total correct without clobbering the others' contributions.
  const persist = async (d: Draft): Promise<void> => {
    if (!String(d.client_name ?? '').trim() || !String(d.project_name ?? '').trim()) {
      onToast('Client and Project Name are required', 'error'); return
    }
    const status = (d.status as Status) ?? 'Draft'
    const { project, qc } = computeHours(d)
    const payload: Draft = { ...d, project_hours: String(project), qc_hours: String(qc), status, approved: status === 'Approved', sent: status === 'Sent' || status === 'Approved' }
    setSaving(true)
    try {
      const res = d.id ? await window.api.quotes.update(d.id, payload) : await window.api.quotes.create(payload)
      if (!res.ok) { onToast(res.error ?? 'Save failed', 'error'); return }
      const quoteId = d.id ?? (res.data as { id: number }).id

      if (status !== 'Approved') { onToast(d.id ? 'Quotation updated' : 'Quotation saved'); setDraft(null); load(); return }

      let projectId = d.project_id
      const isNew = !projectId
      const projectTotalHours = (): number => {
        const others = quotes.filter((x) => x.project_id === projectId && x.id !== quoteId)
        return [...others, payload].reduce((sum, x) => { const h = computeHours(x); return sum + h.project + h.qc }, 0)
      }
      if (!projectId) {
        const pr = await window.api.projects.create({
          name: String(d.project_name ?? ''), client: String(d.client_name ?? ''), location: '',
          discipline: String(d.disciplines ?? ''), quoted_hours: String(project + qc), type: 'Miscellaneous', client_id: d.client_id ?? null
        })
        if (!pr.ok || !pr.data) { onToast(pr.error ?? 'Quote saved, but the project could not be created', 'error'); setDraft(null); load(); return }
        projectId = pr.data.id
        if (currentMember) { try { await window.api.projectMembers.assign(projectId, currentMember.id) } catch { /* non-fatal */ } }
        await window.api.quotes.update(quoteId, { ...payload, project_id: projectId })
      } else {
        const existing = allProjects.find((p) => p.id === projectId)
        await window.api.projects.update({
          id: projectId, name: String(d.project_name ?? ''), client: String(d.client_name ?? ''),
          location: existing?.location ?? '', discipline: String(d.disciplines ?? ''),
          quoted_hours: String(projectTotalHours()), start_date: existing?.start_date ?? '', end_date: existing?.end_date ?? '',
          client_id: d.client_id ?? null
        })
      }
      await syncScope(projectId, { ...payload, id: quoteId })
      void refreshData()

      // An additional quote (parent_quote_id set) notifies the Manager(s) directly on
      // approval — deliberately NOT routed through the general in-app updates feed
      // (projectUpdates.ts), per the "no other notification" rule.
      if (d.parent_quote_id) {
        const managers = members.filter((m) => roleRank(m.role) >= RANK_MANAGER && m.status !== 'left' && m.email)
        if (managers.length) {
          const subject = `Additional quote approved — ${d.quote_no} (${d.project_name})`
          const html = `<p><strong>${currentMember?.name ?? 'A Team Lead'}</strong> approved an additional quote <strong>${esc(d.quote_no)}</strong> linked to project <strong>${esc(d.project_name)}</strong>:</p>
            <ul><li>${esc(d.disciplines || 'Additional scope')}: +${project} work hrs / +${qc} QC hrs</li></ul>
            <p>Project quoted hours are now ${projectTotalHours()}.</p>`
          void window.api.email.send({ to: managers.map((m) => m.email).join(','), subject, html }).catch(() => { /* best-effort */ })
        }
      }

      onToast(isNew ? `Approved — project “${d.project_name}” created with scope` : d.parent_quote_id ? 'Additional quote approved — project & scope updated' : 'Quote, project details & scope updated')
      setDraft(null); load()
      if (isNew && projectId != null) onOpenProject?.(projectId)
    } finally { setSaving(false) }
  }
  const save = (): void => { if (draft) void persist(draft) }

  const remove = async (q: Quote): Promise<void> => {
    const res = await window.api.quotes.delete(q.id)
    if (res.ok) { onToast('Quotation deleted'); load() } else onToast(res.error ?? 'Delete failed', 'error')
  }

  const printQuote = (q: Draft): void => {
    const w = window.open('', '_blank', 'width=900,height=1100')
    if (!w) { onToast('Allow pop-ups to print the quotation', 'error'); return }
    w.document.write(fullHtml(q)); w.document.close(); w.focus()
    setTimeout(() => { try { w.print() } catch { /* manual */ } }, 350)
  }
  const downloadWord = (q: Draft): void => {
    const blob = new Blob(['﻿', wordHtml(q)], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${(q.quote_no || 'Quotation').replace(/[^\w.\-]+/g, '_')}.doc`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  const selDisc = draft ? splitDisciplines(String(draft.disciplines ?? '')) : []
  const totals = draft ? computeHours(draft) : { project: 0, qc: 0, any: false }
  const status = draft ? ((draft.status as Status) ?? 'Draft') : 'Draft'

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 1180 }}>
        <div className="modal-header">
          <h3><Icon name="quote" size={18} /> Quotations</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="quote-toolbar">
            {draft ? (
              <button className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}><Icon name="arrowLeft" size={14} /> Quotes list</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={startNew}><Icon name="plus" size={14} /> New quotation</button>
            )}
            {draft && (
              <div className="quote-toolbar-right">
                <label className="quote-status-pick" title="Quotation status">
                  <span>Status</span>
                  <select value={status} onChange={(e) => setF('status', e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : status === 'Approved' ? (draft.project_id ? 'Save & sync project' : 'Approve & create project') : 'Save'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => printQuote(draft)}><Icon name="file" size={14} /> Print / PDF</button>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadWord(draft)}><Icon name="download" size={14} /> Word (.doc)</button>
              </div>
            )}
          </div>

          {draft ? (
            <div className="quote-editor">
              <div className="quote-form">
                {draft.parent_quote_id && (
                  <p className="attach-hint">
                    This is an <strong>additional quote</strong> linked to project <strong>{draft.project_name}</strong> — fill in the new scope of work below. On approval, its hours add to the project's total and the Manager is notified.
                  </p>
                )}
                <div className="quote-form-section">Quotation details</div>
                <label className="quote-field"><span>Date</span>
                  <input type="date" value={draft.date ?? ''} onChange={(e) => setF('date', e.target.value)} />
                </label>
                <label className="quote-field"><span>Quotation No.</span>
                  <input value={draft.quote_no ?? ''} onChange={(e) => setF('quote_no', e.target.value)} />
                </label>
                <label className="quote-field"><span>Client *</span>
                  <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                    <select
                      style={{ flex: 1 }}
                      value={draft.client_id ?? ''}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : undefined
                        const c = clients.find((x) => x.id === id)
                        setDraft((d) => (d ? { ...d, client_id: id, client_name: c?.name ?? '' } : d))
                      }}
                    >
                      <option value="">— Select a client</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                    </select>
                    {isLead && <button className="btn btn-secondary btn-sm" type="button" onClick={() => setAddClient({ name: '', company: '' })} title="Add a new client">+ New</button>}
                  </div>
                </label>
                {addClient && (
                  <div className="quote-inline-client">
                    <input placeholder="Client name *" value={addClient.name} onChange={(e) => setAddClient({ ...addClient, name: e.target.value })} />
                    <input placeholder="Company (optional)" value={addClient.company} onChange={(e) => setAddClient({ ...addClient, company: e.target.value })} />
                    <button className="btn btn-primary btn-sm" type="button" onClick={createClientInline}>Add</button>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => setAddClient(null)}>Cancel</button>
                  </div>
                )}
                <label className="quote-field"><span>Project Name *</span>
                  <input value={draft.project_name ?? ''} onChange={(e) => setF('project_name', e.target.value)} />
                </label>

                <div className="quote-form-section">Detailed Scope of Work</div>
                <label className="quote-field"><span>Type of Building</span>
                  <input value={draft.type_of_building ?? ''} onChange={(e) => setF('type_of_building', e.target.value)} />
                </label>
                <label className="quote-field"><span>Disciplines</span>
                  <div className="quote-discs">
                    {DISCIPLINES.map((d) => {
                      const on = selDisc.includes(d)
                      return (
                        <label key={d} className={`quote-disc${on ? ' on' : ''}`}>
                          <input type="checkbox" checked={on} onChange={() => {
                            const next = on ? selDisc.filter((x) => x !== d) : [...selDisc, d]
                            setF('disciplines', DISCIPLINES.filter((x) => next.includes(x)).join(', '))
                          }} />
                          {d}
                        </label>
                      )
                    })}
                  </div>
                </label>

                {selDisc.length > 0 && (
                  <label className="quote-field"><span>Hours by discipline</span>
                    <div className="quote-dh">
                      <div className="quote-dh-row quote-dh-head"><span>Discipline</span><span>Work hrs</span><span>QC hrs</span></div>
                      {selDisc.map((d) => (
                        <div className="quote-dh-row" key={d}>
                          <span>{d}</span>
                          <input type="number" min="0" step="0.5" value={dhOf(draft, d).work} onChange={(e) => setDH(d, 'work', e.target.value)} />
                          <input type="number" min="0" step="0.5" value={dhOf(draft, d).qc} onChange={(e) => setDH(d, 'qc', e.target.value)} />
                        </div>
                      ))}
                      <div className="quote-dh-row quote-dh-total"><span>Total — Project {totals.project} / QC {totals.qc}</span><span>{totals.project}</span><span>{totals.qc}</span></div>
                    </div>
                  </label>
                )}

                <label className="quote-field"><span>LOD / LOA</span>
                  <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                    <select value={draft.lod_type ?? 'LOD'} onChange={(e) => setDraft((d) => (d ? { ...d, lod_type: e.target.value as 'LOD' | 'LOA', lod: '' } : d))} style={{ width: 90 }}>
                      <option value="LOD">LOD</option>
                      <option value="LOA">LOA</option>
                    </select>
                    {(draft.lod_type ?? 'LOD') === 'LOD' ? (
                      <select style={{ flex: 1 }} value={draft.lod ?? ''} onChange={(e) => setF('lod', e.target.value)}>
                        <option value="">— Select LOD</option>
                        {LOD_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input style={{ flex: 1 }} placeholder="LOA value (e.g. LOA 20)" value={draft.lod ?? ''} onChange={(e) => setF('lod', e.target.value)} />
                    )}
                  </div>
                </label>

                {TEXT_FIELDS.map((f) => (
                  <Fragment key={f.key}>
                    <label className="quote-field">
                      <span>{f.label}{f.optional ? ' (optional)' : ''}</span>
                      {f.area
                        ? <textarea rows={3} value={(draft[f.key] as string) ?? ''} onChange={(e) => setF(f.key, e.target.value)} />
                        : <input value={(draft[f.key] as string) ?? ''} onChange={(e) => setF(f.key, e.target.value)} />}
                    </label>
                    {f.key === 'description' && imgUpload('description_image')}
                    {f.key === 'note' && imgUpload('note_image')}
                  </Fragment>
                ))}

                <label className="quote-field"><span>Image</span>
                  <div style={{ flex: 1 }}>
                    <input type="file" accept="image/*" onChange={(e) => onImageFor('image', e.target.files?.[0])} />
                    <div className="attach-hint" style={{ marginTop: 4 }}><Icon name="alertTriangle" size={13} /> Please import an image under 1 MB only.</div>
                    {draft.image && (
                      <div style={{ marginTop: 6 }}>
                        <img src={draft.image} alt="reference" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 6, border: '1px solid var(--border)' }} />
                        <button className="btn btn-secondary btn-xs" type="button" style={{ display: 'block', marginTop: 4 }} onClick={() => setF('image', '')}>Remove image</button>
                      </div>
                    )}
                  </div>
                </label>
              </div>
              <div className="quote-preview">
                <style>{QUOTE_CSS}</style>
                <div dangerouslySetInnerHTML={{ __html: quoteBody(draft) }} />
              </div>
            </div>
          ) : loading ? (
            <div className="attach-empty">Loading quotations…</div>
          ) : quotes.length === 0 ? (
            <div className="attach-empty">No quotations yet. Click <strong>New quotation</strong> to create one from the company template.</div>
          ) : (
            <>
              {bar}
              <div className="table-wrap">
                <table className="quote-list">
                  <thead>
                    <tr><th>Quotation No.</th><th>Date</th><th>Client</th><th>Project</th><th>Project hrs</th><th>QC hrs</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {(shownQuotes as unknown as Quote[]).map((q) => {
                      const st = statusOf(q)
                      return (
                        <tr key={q.id}>
                          <td>
                            {q.quote_no || '—'}
                            {q.parent_quote_id && (
                              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>↳ additional to {parentOf(q)?.quote_no ?? `#${q.parent_quote_id}`}</div>
                            )}
                          </td>
                          <td>{niceDate(q.date) || '—'}</td>
                          <td>{q.client_name || '—'}</td>
                          <td>{q.project_name || '—'}</td>
                          <td>{q.project_hours || '—'}</td>
                          <td>{q.qc_hours || '—'}</td>
                          <td>
                            <span className={`badge ${st === 'Approved' ? 'badge-resolved' : st === 'Sent' ? 'badge-on-going' : 'badge-pending'}`} title={st === 'Approved' && q.project_id ? `Project #${q.project_id} created` : ''}>{st}</span>
                          </td>
                          <td className="quote-row-actions">
                            {st === 'Approved' && q.project_id && (
                              <button className="btn-icon" title="Add additional quote (a new, editable quote linked to this project)" onClick={() => startAddendum(q)}><Icon name="plus" size={16} /></button>
                            )}
                            <button className="btn-icon" title="Edit" onClick={() => startEdit(q)}><Icon name="edit" size={16} /></button>
                            <button className="btn-icon" title="Print / PDF" onClick={() => printQuote(q)}><Icon name="file" size={16} /></button>
                            <button className="btn-icon" title="Word (.doc)" onClick={() => downloadWord(q)}><Icon name="download" size={16} /></button>
                            <button className="btn-icon danger" title="Delete" onClick={() => setConfirmDelete(q)}><Icon name="trash" size={16} /></button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete quotation"
          message={`Delete quotation ${confirmDelete.quote_no || confirmDelete.project_name || ''}? This cannot be undone.`}
          onConfirm={() => { const q = confirmDelete; setConfirmDelete(null); remove(q) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
