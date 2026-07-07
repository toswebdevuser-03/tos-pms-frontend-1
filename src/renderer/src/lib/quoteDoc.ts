import { Quote } from '../types'
import { splitDisciplines } from '../disciplines'
import { num } from './hours'
import { TOS_LOGO } from '../assets/quoteLogo'

export type Draft = Partial<Quote>

export const esc = (s?: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const ml = (s?: string): string => esc(s).replace(/\n/g, '<br/>')
export const today = (): string => new Date().toISOString().slice(0, 10)
export const niceDate = (d?: string): string => {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return isNaN(+dt) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

// Status of a (possibly legacy) quote → one of Draft/Sent/Approved.
export type Status = 'Draft' | 'Sent' | 'Approved'
export const statusOf = (q: Partial<Quote>): Status =>
  (q.status as Status) ?? (q.approved ? 'Approved' : q.sent ? 'Sent' : 'Draft')

// Per-discipline hours helpers.
export const dhOf = (d: Draft, disc: string): { work: string; qc: string } => (d.disc_hours?.[disc]) ?? { work: '', qc: '' }
export function computeHours(d: Draft): { project: number; qc: number; any: boolean } {
  const sel = splitDisciplines(String(d.disciplines ?? ''))
  let work = 0, qc = 0, any = false
  for (const disc of sel) {
    const e = d.disc_hours?.[disc]
    if (e) { work += num(e.work); qc += num(e.qc); if (num(e.work) || num(e.qc)) any = true }
  }
  return any ? { project: work, qc, any } : { project: num(d.project_hours), qc: num(d.qc_hours), any }
}

// ALL quote details → one consolidated Scope-of-Work document on the project.
export async function syncScope(projectId: number, q: Draft): Promise<void> {
  const res = await window.api.items.getByProject(projectId, 'scope')
  const rows = (res.ok ? res.data : []) as Record<string, unknown>[]
  const sel = splitDisciplines(String(q.disciplines ?? ''))
  const { project, qc } = computeHours(q)
  const lines: string[] = []
  const add = (label: string, v?: string): void => { const s = String(v ?? '').trim(); if (s) lines.push(`${label}: ${s}`) }
  add('Client', q.client_name)
  add('Project', q.project_name)
  add('Description', q.description)
  add('Project Hours', String(project || ''))
  add('QC Hours', String(qc || ''))
  add('Type of Building', q.type_of_building)
  add('Disciplines', q.disciplines)
  for (const disc of sel) { const e = q.disc_hours?.[disc] ?? { work: '', qc: '' }; if (num(e.work) || num(e.qc)) add(`${disc} hrs`, `${e.work || 0} work / ${e.qc || 0} QC`) }
  add(q.lod_type || 'LOD', q.lod)
  add('Tolerance', q.tolerance)
  add('Type of Project', q.type_of_project)
  add('Area', q.area); add('Units', q.units); add('Software', q.software)
  add('Inputs Received', q.inputs_received); add('Output Deliverable', q.output_deliverable)
  add('Inputs Required', q.inputs_required); add('Exclusions', q.exclusions); add('Note', q.note)
  const body = lines.join('\n')
  const title = q.parent_quote_id
    ? `Additional Quote — ${String(q.quote_no ?? '').trim() || 'Addendum'}`
    : `Scope of Work — ${String(q.project_name ?? '').trim() || String(q.quote_no ?? '').trim() || 'Quote'}`
  for (const r of rows) {
    if (Number(r.quote_id) === Number(q.id) && r.quote_field && r.quote_field !== '__doc') await window.api.items.delete('scope', Number(r.id))
  }
  const doc = rows.find((r) => Number(r.quote_id) === Number(q.id) && r.quote_field === '__doc')
  if (doc) await window.api.items.update('scope', { id: doc.id, project_id: projectId, title, path: (doc.path as string) ?? '', notes: body, quote_id: q.id, quote_field: '__doc' })
  else await window.api.items.create('scope', { project_id: projectId, title, path: '', notes: body, quote_id: q.id, quote_field: '__doc' })
}

export const QUOTE_CSS = `
.q-doc{box-sizing:border-box;width:210mm;max-width:100%;margin:0 auto;padding:15mm 15mm 18mm;background:#fff;color:#1a1a1a;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:12.5px;line-height:1.5;box-shadow:0 2px 16px rgba(0,0,0,.18)}
.q-doc *{box-sizing:border-box}
.q-doc .q-head{text-align:center;border-bottom:2px solid #c0392b;padding-bottom:12px;margin-bottom:16px}
.q-doc .q-logo{height:54px;width:auto;display:block;margin:0 auto 10px}
.q-doc .q-addr{text-align:left;font-size:11.5px;line-height:1.5;color:#333}
.q-doc .q-addr strong{font-size:13px;color:#111}
.q-doc table{width:100%;border-collapse:collapse;margin-bottom:14px}
.q-doc th,.q-doc td{border:1px solid #cfcfcf;padding:7px 10px;vertical-align:top;text-align:left}
.q-doc th{background:#f4f5f7;font-weight:600}
.q-doc .q-meta th{width:24%;white-space:nowrap}
.q-doc .q-scope-title{font-weight:700;font-size:13.5px;margin:18px 0 8px;color:#111}
.q-doc .q-line{margin:3px 0 6px;line-height:1.5}
.q-doc .q-line .q-lbl{font-weight:700}
.q-doc .q-list{margin:2px 0 10px 22px;padding:0}
.q-doc .q-list li{margin:1px 0}
.q-doc .q-subhead{font-weight:700;margin:6px 0 2px}
.q-doc .q-img{max-width:100%;max-height:90mm;display:block;margin:6px 0 14px;border:1px solid #cfcfcf}
`

export function quoteBody(q: Draft): string {
  // Mirrors the user's Quote Template.docx exactly: centered logo + address, a
  // meta table (Date/Quotation No./Client/Project/Hours), then "Detailed Scope of
  // work:" as bold-label PARAGRAPHS (not a table). Only filled fields render.
  const row = (label: string, val: string): string => (String(val ?? '').trim() ? `<tr><th>${label}</th><td>${val}</td></tr>` : '')
  // A scope paragraph: "<b>Label:</b> value" (value may be multi-line). Empty → nothing.
  const line = (label: string, val?: string, multiline = false): string => {
    const v = String(val ?? '').trim()
    return v ? `<p class="q-line"><span class="q-lbl">${label}:</span> ${multiline ? ml(v) : esc(v)}</p>` : ''
  }
  // Does a line begin with a bullet/number the user typed?
  const MARKER_RE = /^\s*(?:[•●○◦▪▫‣·⁃∙]|[-*–—]\s|\d+[.)]\s)/
  // Strip that marker so the <li> bullet isn't doubled (loops to catch "•- item").
  const stripMarker = (s: string): string => {
    let out = s, prev = ''
    while (out !== prev) {
      prev = out
      out = out.replace(/^\s*(?:[•●○◦▪▫‣·⁃∙]\s*|[-*–—]\s+|\d+[.)]\s+)/, '')
    }
    return out.trim()
  }
  // Render a scope field. It drops to a bulleted block (label on its OWN line, items
  // below) when the user typed a bullet, or — for `listy` template fields (Inputs
  // Received / Output Deliverable / Inputs Required) — when there's more than one
  // line. Otherwise it stays inline ("Label: value"). A line ending in ":" becomes a
  // sub-header (no bullet); typed markers are stripped so bullets are never doubled.
  const field = (label: string, val?: string, listy = false): string => {
    const raw = String(val ?? '').trim()
    if (!raw) return ''
    const rawLines = raw.split('\n').map((s) => s.trim()).filter(Boolean)
    const hasMarker = rawLines.some((l) => MARKER_RE.test(l))
    const asBlock = hasMarker || (listy && rawLines.length > 1)
    if (!asBlock) return `<p class="q-line"><span class="q-lbl">${label}:</span> ${ml(raw)}</p>`
    const lines = rawLines.map(stripMarker).filter(Boolean)
    let html = `<p class="q-line"><span class="q-lbl">${label}:</span></p>`
    let open = false
    const closeUl = (): void => { if (open) { html += '</ul>'; open = false } }
    for (const ln of lines) {
      if (ln.length > 1 && ln.endsWith(':')) { closeUl(); html += `<p class="q-subhead">${esc(ln)}</p>` }
      else { if (!open) { html += '<ul class="q-list">'; open = true } html += `<li>${esc(ln)}</li>` }
    }
    closeUl()
    return html
  }
  const imgBlock = (src?: string): string => (src ? `<img class="q-img" src="${src}" alt=""/>` : '')
  const wordImgBlock = (src?: string): string => {
    if (!src) return ''
    // Word-compatible image embedding: use inline data URI with style constraints
    return `<div style="margin:6px 0 14px 0;"><img src="${src}" style="max-width:100%;max-height:90mm;border:1px solid #cfcfcf;display:block;" alt=""/></div>`
  }
  const { project, qc } = computeHours(q)

  const head = [
    row('Date', esc(niceDate(q.date))),
    row('Quotation No.', esc(q.quote_no)),
    row('Client Name', esc(q.client_name)),
    row('Project Name', esc(q.project_name)),
    row('Project Hours', project ? String(project) : ''),
    row('QC Hours', qc ? String(qc) : '')
  ].join('')

  const scope = [
    line('Type of Building', q.type_of_building),
    line('Disciplines', q.disciplines),
    line(q.lod_type || 'LOD', q.lod),
    line('Tolerance', q.tolerance),
    line('Type of Project', q.type_of_project),
    line('Area of the building overall', q.area),
    line('Units of measurement', q.units),
    line('Software to be used', q.software),
    line('Description', q.description, true),
    imgBlock(q.description_image),
    field('Inputs Received', q.inputs_received, true),
    field('Output Deliverable', q.output_deliverable, true),
    field('Inputs Required', q.inputs_required, true),
    field('Exclusions', q.exclusions),
    field('Note', q.note),
    imgBlock(q.note_image)
  ].join('')

  const scopeSection = scope ? `<div class="q-scope-title">Detailed Scope of work:</div>${scope}` : ''
  const refImg = q.image ? `<div class="q-scope-title">Reference Image:</div><img class="q-img" src="${q.image}" alt="reference"/>` : ''
  const addendumTag = q.parent_quote_id ? `<p class="q-line"><span class="q-lbl">Additional Quote for Project:</span> ${esc(q.project_name)}</p>` : ''

  return `<div class="q-doc">
    <div class="q-head">
      <img class="q-logo" src="${TOS_LOGO}" alt="Tesla Outsourcing Services"/>
      <div class="q-addr"><strong>Tesla Outsourcing Services</strong><br/>10th Floor Salister Bldg<br/>Rajpath Rangoli Road<br/>Behind Rajpath Club<br/>Ahmedabad &ndash; Gujarat | India</div>
    </div>
    <table class="q-meta"><tbody>${head}</tbody></table>
    ${addendumTag}
    ${scopeSection}
    ${refImg}
  </div>`
}

// Word-optimised HTML: MS Office namespaces + A4 section so the .doc opens cleanly
// in Microsoft Word (proper margins, no on-screen shadow/fixed width).
// Uses Word-compatible image embedding for proper rendering.
export function wordHtml(q: Draft): string {
  // Word-specific body rendering that handles images correctly
  const row = (label: string, val: string): string => (String(val ?? '').trim() ? `<tr><th>${label}</th><td>${val}</td></tr>` : '')
  const line = (label: string, val?: string, multiline = false): string => {
    const v = String(val ?? '').trim()
    return v ? `<p class="q-line"><span class="q-lbl">${label}:</span> ${multiline ? ml(v) : esc(v)}</p>` : ''
  }
  const MARKER_RE = /^\s*(?:[•●○◦▪▫‣·⁃∙]|[-*–—]\s|\d+[.)]\s)/
  const stripMarker = (s: string): string => {
    let out = s, prev = ''
    while (out !== prev) {
      prev = out
      out = out.replace(/^\s*(?:[•●○◦▪▫‣·⁃∙]\s*|[-*–—]\s+|\d+[.)]\s+)/, '')
    }
    return out.trim()
  }
  const field = (label: string, val?: string, listy = false): string => {
    const raw = String(val ?? '').trim()
    if (!raw) return ''
    const rawLines = raw.split('\n').map((s) => s.trim()).filter(Boolean)
    const hasMarker = rawLines.some((l) => MARKER_RE.test(l))
    const asBlock = hasMarker || (listy && rawLines.length > 1)
    if (!asBlock) return `<p class="q-line"><span class="q-lbl">${label}:</span> ${ml(raw)}</p>`
    const lines = rawLines.map(stripMarker).filter(Boolean)
    let html = `<p class="q-line"><span class="q-lbl">${label}:</span></p>`
    let open = false
    const closeUl = (): void => { if (open) { html += '</ul>'; open = false } }
    for (const ln of lines) {
      if (ln.length > 1 && ln.endsWith(':')) { closeUl(); html += `<p class="q-subhead">${esc(ln)}</p>` }
      else { if (!open) { html += '<ul class="q-list">'; open = true } html += `<li>${esc(ln)}</li>` }
    }
    closeUl()
    return html
  }
  // Word-specific image rendering with inline styles
  const wordImgBlock = (src?: string): string => {
    if (!src) return ''
    return `<div style="margin:6px 0 14px 0;"><img src="${src}" style="max-width:100%;max-height:90mm;border:1px solid #cfcfcf;display:block;" alt=""/></div>`
  }
  const { project, qc } = computeHours(q)

  const head = [
    row('Date', esc(niceDate(q.date))),
    row('Quotation No.', esc(q.quote_no)),
    row('Client Name', esc(q.client_name)),
    row('Project Name', esc(q.project_name)),
    row('Project Hours', project ? String(project) : ''),
    row('QC Hours', qc ? String(qc) : '')
  ].join('')

  const scope = [
    line('Type of Building', q.type_of_building),
    line('Disciplines', q.disciplines),
    line(q.lod_type || 'LOD', q.lod),
    line('Tolerance', q.tolerance),
    line('Type of Project', q.type_of_project),
    line('Area of the building overall', q.area),
    line('Units of measurement', q.units),
    line('Software to be used', q.software),
    line('Description', q.description, true),
    wordImgBlock(q.description_image),
    field('Inputs Received', q.inputs_received, true),
    field('Output Deliverable', q.output_deliverable, true),
    field('Inputs Required', q.inputs_required, true),
    field('Exclusions', q.exclusions),
    field('Note', q.note),
    wordImgBlock(q.note_image)
  ].join('')

  const scopeSection = scope ? `<div class="q-scope-title">Detailed Scope of work:</div>${scope}` : ''
  const refImg = q.image ? `<div class="q-scope-title">Reference Image:</div>${wordImgBlock(q.image)}` : ''
  const addendumTag = q.parent_quote_id ? `<p class="q-line"><span class="q-lbl">Additional Quote for Project:</span> ${esc(q.project_name)}</p>` : ''

  const body = `<div class="q-doc">
    <div class="q-head">
      <img class="q-logo" src="${TOS_LOGO}" alt="Tesla Outsourcing Services"/>
      <div class="q-addr"><strong>Tesla Outsourcing Services</strong><br/>10th Floor Salister Bldg<br/>Rajpath Rangoli Road<br/>Behind Rajpath Club<br/>Ahmedabad &ndash; Gujarat | India</div>
    </div>
    <table class="q-meta"><tbody>${head}</tbody></table>
    ${addendumTag}
    ${scopeSection}
    ${refImg}
  </div>`

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"/><title>Quotation ${esc(q.quote_no) || ''}</title>` +
    `<style>${QUOTE_CSS}\n@page Section1 { size: 210mm 297mm; margin: 14mm; }\ndiv.Section1 { page: Section1; }\n.q-doc{box-shadow:none;width:auto;padding:0;margin:0}\n.q-img{max-width:100%}\nimg{display:block}</style></head>` +
    `<body><div class="Section1">${body}</div></body></html>`
}

export function fullHtml(q: Draft): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Quotation ${esc(q.quote_no) || ''}</title>` +
    `<style>${QUOTE_CSS}\n@page{size:A4;margin:12mm}@media print{.q-doc{box-shadow:none;width:auto;padding:0}}</style></head>` +
    `<body>${quoteBody(q)}</body></html>`
}
