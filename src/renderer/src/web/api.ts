// /**
//  * Browser implementation of `window.api`.
//  *
//  * On the desktop build the Electron preload injects `window.api` (IPC → main).
//  * In the web build there is no preload, so we install an HTTP-backed shim that
//  * talks to the TOS Tracker server using the SAME REST contract the desktop's
//  * remote mode already uses (see src/main/remoteClient.ts + server/src/routes.ts).
//  *
//  * The backend base URL comes from VITE_API_BASE_URL at build time. Until a
//  * backend is chosen it can be left empty — the app loads and shows the sign-in
//  * screen, and any data call returns a clear "backend not configured" message.
//  */

// type Res<T> = Promise<{ ok: boolean; data?: T; error?: string }>
// type Row = Record<string, unknown>

// // Empty API_BASE = same-origin: the app calls /auth and /api on its own origin
// // and Vercel rewrites proxy those to the backend server-side (see vercel.json).
// // This avoids cross-origin CORS entirely (and the ngrok free-tier interstitial,
// // which strips CORS headers from fresh browsers' preflights).
// const API_BASE = (((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) || '').replace(/\/$/, '')
// const TOKEN_KEY = 'tos_token'

// const getToken = (): string => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
// const setToken = (t: string): void => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } }
// const authHeader = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }

// // Core request → returns the server's {ok,data,error} envelope (matches IPC).
// async function call<T>(method: string, path: string, body?: unknown): Res<T> {
//   try {
//     const res = await fetch(API_BASE + path, {
//       method,
//       headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', ...authHeader() },
//       body: body !== undefined ? JSON.stringify(body) : undefined
//     })
//     const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: string } | null
//     if (!json) return { ok: false, error: `Server returned ${res.status} ${res.statusText}` }
//     if (res.status === 401) setToken('')
//     return json
//   } catch (e) {
//     return { ok: false, error: e instanceof Error ? e.message : String(e) }
//   }
// }

// const q = (v: unknown): string => encodeURIComponent(String(v))

// // ── File helpers (browser) ────────────────────────────────────────────────
// function download(filename: string, content: BlobPart, mime: string): void {
//   const url = URL.createObjectURL(new Blob([content], { type: mime }))
//   const a = document.createElement('a')
//   a.href = url; a.download = filename
//   document.body.appendChild(a); a.click(); a.remove()
//   setTimeout(() => URL.revokeObjectURL(url), 4000)
// }
// function keysOf(rows: Row[]): string[] {
//   const s = new Set<string>()
//   rows.forEach((r) => Object.keys(r).forEach((k) => s.add(k)))
//   return Array.from(s)
// }
// function toCSV(rows: Row[]): string {
//   if (!rows.length) return ''
//   const keys = keysOf(rows)
//   const esc = (v: unknown): string => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
//   return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\r\n')
// }
// function parseCSV(text: string): Row[] {
//   const rows: string[][] = []; let row: string[] = []; let cur = ''; let inQ = false
//   for (let i = 0; i < text.length; i++) {
//     const c = text[i]
//     if (inQ) {
//       if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
//       else cur += c
//     } else if (c === '"') inQ = true
//     else if (c === ',') { row.push(cur); cur = '' }
//     else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
//     else if (c !== '\r') cur += c
//   }
//   if (cur.length || row.length) { row.push(cur); rows.push(row) }
//   const clean = rows.filter((r) => r.some((c) => c.trim() !== ''))
//   if (clean.length < 1) return []
//   const header = clean[0]
//   return clean.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
// }
// function pickFile(accept: string, multiple: boolean): Promise<File[]> {
//   return new Promise((resolve) => {
//     const input = document.createElement('input')
//     input.type = 'file'; input.accept = accept; input.multiple = multiple
//     input.onchange = () => resolve(Array.from(input.files || []))
//     input.oncancel = () => resolve([])
//     input.click()
//   })
// }

// // ── Attachments (raw bytes via authed fetch) ──────────────────────────────
// async function rawBlob(storedPath: string): Promise<Blob | null> {
//   const res = await fetch(`${API_BASE}/api/attachments/raw?path=${q(storedPath)}`, { headers: { 'ngrok-skip-browser-warning': 'true', ...authHeader() } })
//   if (!res.ok) return null
//   return res.blob()
// }
// async function uploadOne(entityType: string, entityId: number, file: File): Promise<Row | null> {
//   const form = new FormData()
//   form.append('entityType', entityType); form.append('entityId', String(entityId)); form.append('file', file, file.name)
//   const res = await fetch(`${API_BASE}/api/attachments/upload`, { method: 'POST', headers: { 'ngrok-skip-browser-warning': 'true', ...authHeader() }, body: form })
//   const j = (await res.json().catch(() => null)) as { ok: boolean; data?: Row } | null
//   return j?.ok ? (j.data ?? null) : null
// }

// // ── Reminders (ported from src/main/handlers/reminders.ts) ────────────────
// type Sev = 'due' | 'overdue' | 'upcoming'
// const todayStr = (): string => new Date().toISOString().slice(0, 10)
// const daysBetween = (a: string, b: string): number => Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)
// function severityFor(date: string): Sev | null {
//   if (!date) return null
//   const diff = daysBetween(date, todayStr())
//   if (diff < 0) return 'overdue'
//   if (diff === 0) return 'due'
//   if (diff <= 3) return 'upcoming'
//   return null
// }
// async function buildReminders(): Promise<Row[]> {
//   const [wip, disp, task, proj, mem, ts] = await Promise.all([
//     call<Row[]>('GET', '/api/all/wip'), call<Row[]>('GET', '/api/all/dispatches'), call<Row[]>('GET', '/api/all/tasks'),
//     call<Row[]>('GET', '/api/projects'), call<Row[]>('GET', '/api/members'), call<Row[]>('GET', '/api/all/timesheets')
//   ])
//   const pName = new Map<number, string>()
//   ;(proj.data ?? []).forEach((p) => pName.set(Number(p.id), String(p.name ?? `Project ${p.id}`)))
//   const mById = new Map<number, Row>()
//   ;(mem.data ?? []).forEach((m) => mById.set(Number(m.id), m))
//   const who = (id: unknown): { name: string; email: string } => {
//     if (!id) return { name: '', email: '' }
//     const m = mById.get(Number(id)); return { name: String(m?.name ?? ''), email: String(m?.email ?? '') }
//   }
//   const out: Row[] = []
//   const DONE_WIP = new Set(['Achieved', 'Done', 'Hold'])
//   for (const w of wip.data ?? []) {
//     if (DONE_WIP.has(String(w.status))) continue
//     const date = String(w.planned_date || w.due_date || ''); const sev = severityFor(date); if (!sev) continue
//     const a = who(w.assigned_member_id ?? w.assigned_to)
//     out.push({ key: `wip-${w.id}`, projectId: w.project_id, projectName: pName.get(Number(w.project_id)) ?? '', kind: 'wip', title: String(w.task_name || 'WIP item'), date, severity: sev, assignee: a.name || String(w.assigned_to || ''), assigneeEmail: a.email })
//   }
//   for (const d of disp.data ?? []) {
//     if (String(d.status) === 'Acknowledged' || String(d.status) === 'Dispatched') continue
//     const date = String(d.dispatch_date || ''); const sev = severityFor(date); if (!sev) continue
//     const a = who(d.assigned_member_id)
//     const label = String(d.description || d.dispatch_number || 'Dispatch')
//     out.push({ key: `dispatch-${d.id}`, projectId: d.project_id, projectName: pName.get(Number(d.project_id)) ?? '', kind: 'dispatch', title: (d.dispatch_number ? `${d.dispatch_number} — ` : '') + label.slice(0, 80), date, severity: sev, assignee: a.name || String(d.recipient || ''), assigneeEmail: a.email })
//   }
//   for (const t of task.data ?? []) {
//     if (String(t.status) === 'Done') continue
//     const date = String(t.deadline || ''); const sev = severityFor(date); if (!sev) continue
//     const a = who(t.assigned_member_id)
//     out.push({ key: `task-${t.id}`, projectId: t.project_id, projectName: pName.get(Number(t.project_id)) ?? '', kind: 'task', title: String(t.name || 'Task'), date, severity: sev, assignee: a.name, assigneeEmail: a.email })
//   }
//   // Budget: warn when a project's logged productive hours reach 80% of quoted.
//   const numv = (v: unknown): number => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }
//   const loggedByProject = new Map<number, number>()
//   ;(ts.data ?? []).forEach((r) => {
//     if (r.pending) return // pending manual entries don't count until approved
//     const pid = Number(r.project_id)
//     loggedByProject.set(pid, (loggedByProject.get(pid) ?? 0) + numv(r.execution_hrs) + numv(r.overtime_hrs))
//   })
//   ;(proj.data ?? []).forEach((p) => {
//     const quoted = numv(p.quoted_hours)
//     if (quoted <= 0) return
//     const logged = Math.round((loggedByProject.get(Number(p.id)) ?? 0) * 10) / 10
//     const pct = Math.round((logged / quoted) * 100)
//     if (pct < 80) return
//     out.push({
//       key: `budget-${p.id}`, projectId: p.id, projectName: String(p.name ?? `Project ${p.id}`),
//       kind: 'budget',
//       title: pct >= 100
//         ? `Over budget — ${logged} / ${quoted} hrs used (${pct}%)`
//         : `${pct}% of quoted hours used — ${logged} / ${quoted} hrs`,
//       date: '', severity: pct >= 100 ? 'overdue' : 'due', assignee: '', assigneeEmail: ''
//     })
//   })

//   const rank: Record<Sev, number> = { overdue: 0, due: 1, upcoming: 2 }
//   out.sort((a, b) => rank[a.severity as Sev] - rank[b.severity as Sev] || String(a.date).localeCompare(String(b.date)))
//   return out
// }

// // ── AI skill-fit: lexical fallback (ported from handlers/ai.ts) ───────────
// function lexical(a: string, b: string): number {
//   const tok = (s: string): Set<string> => new Set(s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1))
//   const A = tok(a), B = tok(b)
//   if (!A.size || !B.size) return 0
//   let inter = 0; for (const w of A) if (B.has(w)) inter++
//   return inter / Math.sqrt(A.size * B.size)
// }

// // ── Realtime: WebSocket to the backend's /ws ──────────────────────────────
// function subscribeRealtime(cb: (event: unknown) => void): () => void {
//   if (!API_BASE) return () => { /* no backend */ }
//   let socket: WebSocket | null = null
//   let closed = false
//   let timer: ReturnType<typeof setTimeout> | null = null
//   const wsBase = API_BASE.replace(/^http/, 'ws')
//   const connect = (): void => {
//     const token = getToken(); if (!token) { timer = setTimeout(connect, 4000); return }
//     try {
//       socket = new WebSocket(`${wsBase}/ws?token=${q(token)}`)
//       socket.onmessage = (e) => { try { cb(JSON.parse(e.data)) } catch { /* ignore */ } }
//       socket.onclose = () => { if (!closed) timer = setTimeout(connect, 4000) }
//       socket.onerror = () => { try { socket?.close() } catch { /* ignore */ } }
//     } catch { if (!closed) timer = setTimeout(connect, 4000) }
//   }
//   connect()
//   return () => { closed = true; if (timer) clearTimeout(timer); try { socket?.close() } catch { /* ignore */ } }
// }

// // ── The window.api surface ────────────────────────────────────────────────
// function buildApi(): unknown {
//   return {
//     projects: {
//       getAll: () => call('GET', '/api/projects'),
//       statuses: () => call('GET', '/api/statuses'),
//       create: (d: Row) => call('POST', '/api/projects', d),
//       update: (d: Row) => call('PUT', `/api/projects/${q(d.id)}`, d),
//       delete: (id: number) => call('DELETE', `/api/projects/${q(id)}`),
//       setArchived: (id: number, archived: boolean) => call('PUT', `/api/projects/${q(id)}/archived`, { archived }),
//       deleted: () => call('GET', '/api/projects/deleted'),
//       restore: (id: number) => call('POST', `/api/projects/${q(id)}/restore`),
//       purge: (id: number) => call('DELETE', `/api/projects/${q(id)}/purge`)
//     },
//     items: {
//       getByProject: (projectId: number, type: string) => call('GET', `/api/items/${q(type)}?projectId=${q(projectId)}`),
//       create: (type: string, data: Row) => call('POST', `/api/items/${q(type)}`, data),
//       update: (type: string, data: Row) => call('PUT', `/api/items/${q(type)}/${q(data.id)}`, data),
//       delete: (type: string, id: number) => call('DELETE', `/api/items/${q(type)}/${q(id)}`)
//     },
//     members: {
//       getAll: () => call('GET', '/api/members'),
//       create: (d: Row) => call('POST', '/api/members', d),
//       update: (d: Row) => call('PUT', `/api/members/${q(d.id)}`, d),
//       updateSkills: (id: number, skills: unknown[]) => call('PUT', `/api/members/${q(id)}/skills`, { skills }),
//       setActive: (id: number, active: boolean) => call('PUT', `/api/members/${q(id)}/active`, { active }),
//       delete: (id: number) => call('DELETE', `/api/members/${q(id)}`)
//     },
//     projectMembers: {
//       get: (projectId: number) => call('GET', `/api/project-members/${q(projectId)}`),
//       all: () => call('GET', '/api/project-members'),
//       assign: (projectId: number, memberId: number) => call('POST', '/api/project-members', { projectId, memberId }),
//       unassign: (projectId: number, memberId: number) => call('DELETE', '/api/project-members', { projectId, memberId })
//     },
//     overtime: {
//       list: () => call('GET', '/api/overtime'),
//       request: (d: Row) => call('POST', '/api/overtime', d),
//       decide: (id: number, decision: 'approve' | 'reject') => call('PUT', `/api/overtime/${q(id)}/decide`, { decision })
//     },
//     all: {
//       tasks: () => call('GET', '/api/all/tasks'),
//       timesheets: () => call('GET', '/api/all/timesheets'),
//       wip: () => call('GET', '/api/all/wip'),
//       dispatches: () => call('GET', '/api/all/dispatches'),
//       qc: () => call('GET', '/api/all/qc'),
//       rfi: () => call('GET', '/api/all/rfi')
//     },
//     quotes: {
//       list: () => call('GET', '/api/quotes'),
//       create: (d: Row) => call('POST', '/api/quotes', d),
//       update: (id: number, d: Row) => call('PUT', `/api/quotes/${q(id)}`, d),
//       delete: (id: number) => call('DELETE', `/api/quotes/${q(id)}`)
//     },
//     clients: {
//       list: () => call('GET', '/api/clients'),
//       create: (d: Row) => call('POST', '/api/clients', d),
//       update: (id: number, d: Row) => call('PUT', `/api/clients/${q(id)}`, d),
//       delete: (id: number) => call('DELETE', `/api/clients/${q(id)}`)
//     },
//     settings: {
//       get: () => call('GET', '/api/settings'),
//       update: (patch: Row) => call('PUT', '/api/settings', patch)
//     },
//     attachments: {
//       get: (entityType: string, entityId: number) => call('GET', `/api/attachments?entityType=${q(entityType)}&entityId=${q(entityId)}`),
//       getMany: (entityType: string, ids: number[]) => call('GET', `/api/attachments/many?entityType=${q(entityType)}&ids=${q(ids.join(','))}`),
//       add: async (entityType: string, entityId: number, multi = true) => {
//         const files = await pickFile('*/*', multi)
//         if (!files.length) return { ok: true, data: [] }
//         const out: Row[] = []
//         for (const f of files) { const rec = await uploadOne(entityType, entityId, f); if (rec) out.push(rec) }
//         return { ok: true, data: out }
//       },
//       read: async (storedPath: string) => {
//         const blob = await rawBlob(storedPath)
//         if (!blob) return { ok: false, error: 'Could not load file' }
//         const dataUrl = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(blob) })
//         return { ok: true, data: { dataUrl } }
//       },
//       open: async (storedPath: string) => {
//         const blob = await rawBlob(storedPath)
//         if (!blob) return { ok: false, error: 'Could not open file' }
//         const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000)
//         return { ok: true, data: null }
//       },
//       updateDescription: (id: number, description: string) => call('PUT', `/api/attachments/${q(id)}/description`, { description }),
//       update: (id: number, patch: Row) => call('PUT', `/api/attachments/${q(id)}`, { patch }),
//       delete: (id: number) => call('DELETE', `/api/attachments/${q(id)}`)
//     },
//     email: {
//       test: () => call('POST', '/api/email/test'),
//       send: (msg: { to: string; subject: string; html: string }) => call('POST', '/api/email/send', msg)
//     },
//     reminders: {
//       get: async () => { try { return { ok: true, data: await buildReminders() } } catch (e) { return { ok: false, error: String(e) } } },
//       notifyDesktop: async () => {
//         try {
//           const list = (await buildReminders()).filter((r) => r.severity !== 'upcoming')
//           if (!('Notification' in window)) return { ok: true, data: { shown: 0, total: list.length } }
//           let perm = Notification.permission
//           if (perm === 'default') perm = await Notification.requestPermission()
//           if (perm !== 'granted') return { ok: true, data: { shown: 0, total: list.length } }
//           const top = list.slice(0, 5)
//           top.forEach((r) => new Notification(`${r.severity === 'overdue' ? '⚠ Overdue' : 'Due today'}: ${r.projectName}`, { body: `${String(r.kind).toUpperCase()} — ${r.title} (${r.date})${r.assignee ? ' · ' + r.assignee : ''}` }))
//           return { ok: true, data: { shown: top.length, total: list.length } }
//         } catch (e) { return { ok: false, error: String(e) } }
//       }
//     },
//     powerbi: { export: async () => ({ ok: false, error: 'Bulk Power BI export will run on the backend (coming once the backend is live).' }) },
//     backup: {
//       create: async () => ({ ok: false, error: 'Backups run on the backend.' }),
//       restore: async () => ({ ok: false, error: 'Backups run on the backend.' })
//     },
//     report: {
//       pdf: async (html: string, fileName: string) => {
//         const w = window.open('', '_blank')
//         if (!w) return { ok: false, error: 'Pop-up blocked — allow pop-ups, then use the print dialog → Save as PDF.' }
//         w.document.open(); w.document.write(html); w.document.close(); w.focus()
//         setTimeout(() => { try { w.print() } catch { /* ignore */ } }, 350)
//         return { ok: true, data: { filePath: fileName } }
//       }
//     },
//     csv: {
//       export: async (type: string, projectName: string, rows: Row[]) => {
//         download(`${type}_${projectName}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8')
//         return { ok: true, data: { filePath: `${type}_${projectName}.csv` } }
//       },
//       import: async (_type: string) => {
//         const files = await pickFile('.csv,text/csv', false)
//         if (!files.length) return { ok: true, data: { rows: [] } }
//         const text = await files[0].text()
//         return { ok: true, data: { rows: parseCSV(text) } }
//       }
//     },
//     excel: {
//       export: async (type: string, projectName: string, rows: Row[], fileName?: string) => {
//         // exceljs is CJS; grab whichever interop shape Vite produces.
//         // eslint-disable-next-line @typescript-eslint/no-explicit-any
//         const mod: any = await import('exceljs')
//         const ExcelJS = mod.default ?? mod
//         const wb = new ExcelJS.Workbook()
//         const ws = wb.addWorksheet('Data')
//         const fileBase = (fileName || (type === 'rfi' || type === 'query' ? `${projectName}_RFI-Query` : `${type}_${projectName}`)).replace(/[^a-z0-9_-]+/gi, '_')

//         if (type === 'rfi' || type === 'query') {
//           // One row per point (new multi-point shape) or per legacy attachment.
//           // Columns: S. No. · Points · Image · Response (only these, per request).
//           ws.columns = [
//             { header: 'S. No.', key: 'sno', width: 7 },
//             { header: 'Points', key: 'point', width: 52 },
//             { header: 'Image', key: 'image', width: 26 },
//             { header: 'Response', key: 'response', width: 44 }
//           ]
//           // Embed a base64 data-URL image into the 'Image' column (index 2) of a row.
//           const embedDataUrl = (dataUrl: string, rowNumber: number): boolean => {
//             const m = dataUrl.match(/^data:image\/(png|jpe?g|gif);base64,(.+)$/i)
//             if (!m) return false
//             const ex = /jpe?g/i.test(m[1]) ? 'jpeg' : /gif/i.test(m[1]) ? 'gif' : 'png'
//             const imgId = wb.addImage({ base64: m[2], extension: ex as 'png' | 'jpeg' | 'gif' })
//             ws.addImage(imgId, { tl: { col: 2, row: rowNumber - 1 }, ext: { width: 150, height: 100 }, editAs: 'oneCell' })
//             return true
//           }
//           // Legacy attachment images (entries with no points).
//           const legacyIds = rows.filter((r) => !Array.isArray(r.points)).map((r) => Number(r.id)).filter(Boolean)
//           const attRes = legacyIds.length
//             ? await call<Row[]>('GET', `/api/attachments/many?entityType=${q(type)}&ids=${q(legacyIds.join(','))}`)
//             : { ok: true, data: [] as Row[] }
//           const atts = (attRes.ok ? attRes.data ?? [] : []) as Array<Record<string, unknown>>
//           const byEntity = new Map<number, Array<Record<string, unknown>>>()
//           atts.forEach((a) => { const k = Number(a.entity_id); (byEntity.get(k) ?? byEntity.set(k, []).get(k)!).push(a) })

//           let sno = 1
//           for (const row of rows) {
//             if (Array.isArray(row.points)) {
//               const pts = row.points as Array<Record<string, unknown>>
//               if (!pts.length) { ws.addRow({ sno: sno++, point: '', image: '', response: '' }); continue }
//               for (const p of pts) {
//                 const xr = ws.addRow({ sno: sno++, point: String(p.text ?? ''), image: '', response: String(p.response ?? '') })
//                 if (p.image && embedDataUrl(String(p.image), xr.number)) xr.height = 78
//               }
//             } else {
//               const list = byEntity.get(Number(row.id)) ?? []
//               if (!list.length) { ws.addRow({ sno: sno++, point: String(row.subject ?? row.description ?? ''), image: '', response: String(row.response ?? '') }); continue }
//               for (const a of list) {
//                 const xr = ws.addRow({ sno: sno++, point: String(row.subject ?? a.description ?? ''), image: '', response: String(a.response ?? '') })
//                 const ext = String(a.filename ?? '').split('.').pop()?.toLowerCase()
//                 const exExt = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'png' ? 'png' : ext === 'gif' ? 'gif' : ''
//                 const blob = exExt ? await rawBlob(String(a.stored_path)) : null
//                 if (blob && exExt) {
//                   const buffer = await blob.arrayBuffer()
//                   const imgId = wb.addImage({ buffer, extension: exExt as 'png' | 'jpeg' | 'gif' })
//                   ws.addImage(imgId, { tl: { col: 2, row: xr.number - 1 }, ext: { width: 150, height: 100 }, editAs: 'oneCell' })
//                   xr.height = 78
//                 } else {
//                   xr.getCell('image').value = String(a.filename ?? '')
//                 }
//               }
//             }
//           }
//         } else {
//           // Generic: one column per field.
//           const keys = keysOf(rows)
//           ws.columns = keys.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(12, k.length + 4)) }))
//           rows.forEach((r) => ws.addRow(r))
//         }

//         // Bold, highlighted, frozen header row; wrap body cells.
//         ws.eachRow({ includeEmpty: false }, (r) => r.eachCell((c) => { c.alignment = { wrapText: true, vertical: 'top' } }))
//         const head = ws.getRow(1)
//         head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
//         head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
//         head.alignment = { vertical: 'middle' }
//         head.height = 20
//         ws.views = [{ state: 'frozen', ySplit: 1 }]

//         const buf = await wb.xlsx.writeBuffer()
//         download(`${fileBase}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
//         return { ok: true, data: { filePath: `${fileBase}.xlsx` } }
//       }
//     },
//     paths: {
//       pick: async () => ({ ok: true, data: { path: null } }),
//       open: async (path: string) => {
//         if (/^https?:\/\//i.test(path)) { window.open(path, '_blank'); return { ok: true, data: null } }
//         return { ok: false, error: 'Opening local file paths is only available in the desktop app.' }
//       },
//       reveal: async () => ({ ok: false, error: 'Reveal in folder is only available in the desktop app.' })
//     },
//     auth: {
//       state: async () => {
//         if (!getToken()) return { ok: true, data: { mode: 'remote', user: null } }
//         const me = await call<{ user: unknown }>('GET', '/auth/me')
//         // call() already clears token on 401; don't wipe a valid token for transient network errors
//         if (!me.ok || !me.data) { return { ok: true, data: { mode: 'remote', user: null } } }
//         return { ok: true, data: { mode: 'remote', user: me.data.user } }
//       },
//       login: async (email: string, password: string) => {
//         const r = await call<{ token: string; user: unknown; mustReset: boolean }>('POST', '/auth/login', { email, password })
//         if (!r.ok || !r.data) return { ok: false, error: r.error || 'Login failed' }
//         setToken(r.data.token)
//         return { ok: true, data: { user: r.data.user, mustReset: r.data.mustReset } }
//       },
//       logout: async () => { setToken(''); return { ok: true, data: null } },
//       changePassword: (currentPassword: string, newPassword: string) => call('POST', '/auth/change-password', { currentPassword, newPassword })
//     },
//     ai: {
//       skillFit: async (requiredText: string, candidates: { id: number; text: string }[]) => {
//         const results = candidates.map((c) => ({ id: c.id, score: c.text.trim() ? Math.max(0, Math.min(1, lexical(requiredText, c.text))) : 0 }))
//         return { ok: true, data: { results, method: 'lexical' as const } }
//       }
//     },
//     realtime: { subscribe: subscribeRealtime }
//   }
// }

// /** Install the HTTP shim onto window.api when running outside Electron. */
// export function ensureWebApi(): void {
//   const w = window as unknown as { api?: unknown }
//   if (!w.api) w.api = buildApi() as unknown
// }
/**
 * Browser implementation of `window.api`.
 *
 * On the desktop build the Electron preload injects `window.api` (IPC → main).
 * In the web build there is no preload, so we install an HTTP-backed shim that
 * talks to the TOS Tracker server using the SAME REST contract the desktop's
 * remote mode already uses (see src/main/remoteClient.ts + server/src/routes.ts).
 *
 * The backend base URL comes from VITE_API_BASE_URL at build time. Until a
 * backend is chosen it can be left empty — the app loads and shows the sign-in
 * screen, and any data call returns a clear "backend not configured" message.
 */

type Res<T> = Promise<{ ok: boolean; data?: T; error?: string }>
type Row = Record<string, unknown>

// Empty API_BASE = same-origin: the app calls /auth and /api on its own origin
// and Vercel rewrites proxy those to the backend server-side (see vercel.json).
// This avoids cross-origin CORS entirely (and the ngrok free-tier interstitial,
// which strips CORS headers from fresh browsers' preflights).
const API_BASE = (((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) || '').replace(/\/$/, '')
const TOKEN_KEY = 'tos_token'

const getToken = (): string => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
const setToken = (t: string): void => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } }
const authHeader = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }

// Core request → returns the server's {ok,data,error} envelope (matches IPC).
async function call<T>(method: string, path: string, body?: unknown): Res<T> {
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', ...authHeader() },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: string } | null
    if (!json) return { ok: false, error: `Server returned ${res.status} ${res.statusText}` }
    if (res.status === 401) setToken('')
    return json
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const q = (v: unknown): string => encodeURIComponent(String(v))

// ── File helpers (browser) ────────────────────────────────────────────────
function download(filename: string, content: BlobPart, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
function keysOf(rows: Row[]): string[] {
  const s = new Set<string>()
  rows.forEach((r) => Object.keys(r).forEach((k) => s.add(k)))
  return Array.from(s)
}
function toCSV(rows: Row[]): string {
  if (!rows.length) return ''
  const keys = keysOf(rows)
  const esc = (v: unknown): string => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\r\n')
}
function parseCSV(text: string): Row[] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ''))
  if (clean.length < 1) return []
  const header = clean[0]
  return clean.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}
function pickFile(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = accept; input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files || []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

// ── Attachments (raw bytes via authed fetch) ──────────────────────────────
async function rawBlob(storedPath: string): Promise<Blob | null> {
  const res = await fetch(`${API_BASE}/api/attachments/raw?path=${q(storedPath)}`, { headers: { 'ngrok-skip-browser-warning': 'true', ...authHeader() } })
  if (!res.ok) return null
  return res.blob()
}
async function uploadOne(entityType: string, entityId: number, file: File): Promise<Row | null> {
  const form = new FormData()
  form.append('entityType', entityType); form.append('entityId', String(entityId)); form.append('file', file, file.name)
  const res = await fetch(`${API_BASE}/api/attachments/upload`, { method: 'POST', headers: { 'ngrok-skip-browser-warning': 'true', ...authHeader() }, body: form })
  const j = (await res.json().catch(() => null)) as { ok: boolean; data?: Row } | null
  return j?.ok ? (j.data ?? null) : null
}

// ── Reminders (ported from src/main/handlers/reminders.ts) ────────────────
type Sev = 'due' | 'overdue' | 'upcoming'
const todayStr = (): string => new Date().toISOString().slice(0, 10)
const daysBetween = (a: string, b: string): number => Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)
function severityFor(date: string): Sev | null {
  if (!date) return null
  const diff = daysBetween(date, todayStr())
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'due'
  if (diff <= 3) return 'upcoming'
  return null
}
async function buildReminders(): Promise<Row[]> {
  const raw = await call<{ wip: Row[]; dispatches: Row[]; tasks: Row[]; projects: Row[]; members: Row[]; timesheets: Row[] }>('GET', '/api/reminders/raw')
  const wipData = raw.data?.wip ?? []
  const dispData = raw.data?.dispatches ?? []
  const taskData = raw.data?.tasks ?? []
  const projects = raw.data?.projects ?? []
  const members = raw.data?.members ?? []
  const timesheets = raw.data?.timesheets ?? []

  // Keep the original code below unchanged: it expects { data: Row[] } wrappers.
  const proj = { data: projects } as { data: Row[] }
  const mem = { data: members } as { data: Row[] }
  const ts = { data: timesheets } as { data: Row[] }

  const wip = { data: wipData } as { data: Row[] }
  const disp = { data: dispData } as { data: Row[] }
  const task = { data: taskData } as { data: Row[] }


  const pName = new Map<number, string>()
  ;(proj.data ?? []).forEach((p) => pName.set(Number(p.id), String(p.name ?? `Project ${p.id}`)))
  const mById = new Map<number, Row>()
  ;(mem.data ?? []).forEach((m) => mById.set(Number(m.id), m))
  const who = (id: unknown): { name: string; email: string } => {

    if (!id) return { name: '', email: '' }
    const m = mById.get(Number(id)); return { name: String(m?.name ?? ''), email: String(m?.email ?? '') }
  }
  const out: Row[] = []
  const DONE_WIP = new Set(['Achieved', 'Done', 'Hold'])
  for (const w of wip.data ?? []) {
    if (DONE_WIP.has(String(w.status))) continue
    const date = String(w.planned_date || w.due_date || ''); const sev = severityFor(date); if (!sev) continue
    const a = who(w.assigned_member_id ?? w.assigned_to)
    out.push({ key: `wip-${w.id}`, projectId: w.project_id, projectName: pName.get(Number(w.project_id)) ?? '', kind: 'wip', title: String(w.task_name || 'WIP item'), date, severity: sev, assignee: a.name || String(w.assigned_to || ''), assigneeEmail: a.email })
  }
  for (const d of disp.data ?? []) {
    if (String(d.status) === 'Acknowledged' || String(d.status) === 'Dispatched') continue
    const date = String(d.dispatch_date || ''); const sev = severityFor(date); if (!sev) continue
    const a = who(d.assigned_member_id)
    const label = String(d.description || d.dispatch_number || 'Dispatch')
    out.push({ key: `dispatch-${d.id}`, projectId: d.project_id, projectName: pName.get(Number(d.project_id)) ?? '', kind: 'dispatch', title: (d.dispatch_number ? `${d.dispatch_number} — ` : '') + label.slice(0, 80), date, severity: sev, assignee: a.name || String(d.recipient || ''), assigneeEmail: a.email })
  }
  for (const t of task.data ?? []) {
    if (String(t.status) === 'Done') continue
    const date = String(t.deadline || ''); const sev = severityFor(date); if (!sev) continue
    const a = who(t.assigned_member_id)
    out.push({ key: `task-${t.id}`, projectId: t.project_id, projectName: pName.get(Number(t.project_id)) ?? '', kind: 'task', title: String(t.name || 'Task'), date, severity: sev, assignee: a.name, assigneeEmail: a.email })
  }
  // Budget: warn when a project's logged productive hours reach 80% of quoted.
  const numv = (v: unknown): number => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }
  const loggedByProject = new Map<number, number>()
  ;(ts.data ?? []).forEach((r) => {
    if (r.pending) return // pending manual entries don't count until approved
    const pid = Number(r.project_id)
    loggedByProject.set(pid, (loggedByProject.get(pid) ?? 0) + numv(r.execution_hrs) + numv(r.overtime_hrs))
  })
  ;(proj.data ?? []).forEach((p) => {
    const quoted = numv(p.quoted_hours)
    if (quoted <= 0) return
    const logged = Math.round((loggedByProject.get(Number(p.id)) ?? 0) * 10) / 10
    const pct = Math.round((logged / quoted) * 100)
    if (pct < 80) return
    out.push({
      key: `budget-${p.id}`, projectId: p.id, projectName: String(p.name ?? `Project ${p.id}`),
      kind: 'budget',
      title: pct >= 100
        ? `Over budget — ${logged} / ${quoted} hrs used (${pct}%)`
        : `${pct}% of quoted hours used — ${logged} / ${quoted} hrs`,
      date: '', severity: pct >= 100 ? 'overdue' : 'due', assignee: '', assigneeEmail: ''
    })
  })

  const rank: Record<Sev, number> = { overdue: 0, due: 1, upcoming: 2 }
  out.sort((a, b) => rank[a.severity as Sev] - rank[b.severity as Sev] || String(a.date).localeCompare(String(b.date)))
  return out
}

// ── AI skill-fit: lexical fallback (ported from handlers/ai.ts) ───────────
function lexical(a: string, b: string): number {
  const tok = (s: string): Set<string> => new Set(s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1))
  const A = tok(a), B = tok(b)
  if (!A.size || !B.size) return 0
  let inter = 0; for (const w of A) if (B.has(w)) inter++
  return inter / Math.sqrt(A.size * B.size)
}

// ── Realtime: WebSocket to the backend's /ws ──────────────────────────────
function subscribeRealtime(cb: (event: unknown) => void): () => void {
  if (!API_BASE) return () => { /* no backend */ }
  let socket: WebSocket | null = null
  let closed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const wsBase = API_BASE.replace(/^http/, 'ws')
  const connect = (): void => {
    const token = getToken(); if (!token) { timer = setTimeout(connect, 4000); return }
    try {
      socket = new WebSocket(`${wsBase}/ws?token=${q(token)}`)
      socket.onmessage = (e) => { try { cb(JSON.parse(e.data)) } catch { /* ignore */ } }
      socket.onclose = () => { if (!closed) timer = setTimeout(connect, 4000) }
      socket.onerror = () => { try { socket?.close() } catch { /* ignore */ } }
    } catch { if (!closed) timer = setTimeout(connect, 4000) }
  }
  connect()
  return () => { closed = true; if (timer) clearTimeout(timer); try { socket?.close() } catch { /* ignore */ } }
}

// ── The window.api surface ────────────────────────────────────────────────
function buildApi(): unknown {
  return {
    projects: {
      getAll: () => call('GET', '/api/projects'),
      statuses: () => call('GET', '/api/statuses'),
      create: (d: Row) => call('POST', '/api/projects', d),
      update: (d: Row) => call('PUT', `/api/projects/${q(d.id)}`, d),
      delete: (id: number) => call('DELETE', `/api/projects/${q(id)}`),
      setArchived: (id: number, archived: boolean) => call('PUT', `/api/projects/${q(id)}/archived`, { archived }),
      deleted: () => call('GET', '/api/projects/deleted'),
      restore: (id: number) => call('POST', `/api/projects/${q(id)}/restore`),
      purge: (id: number) => call('DELETE', `/api/projects/${q(id)}/purge`),
      counts: (id: number) => call('GET', `/api/projects/${q(id)}/counts`),
      dashboard: (id: number) => call('GET', `/api/projects/${q(id)}/dashboard`)
    },
    items: {
      getByProject: (projectId: number, type: string) => call('GET', `/api/items/${q(type)}?projectId=${q(projectId)}`),
      create: (type: string, data: Row) => call('POST', `/api/items/${q(type)}`, data),
      update: (type: string, data: Row) => call('PUT', `/api/items/${q(type)}/${q(data.id)}`, data),
      delete: (type: string, id: number) => call('DELETE', `/api/items/${q(type)}/${q(id)}`)
    },
    members: {
      getAll: () => call('GET', '/api/members'),
      create: (d: Row) => call('POST', '/api/members', d),
      update: (d: Row) => call('PUT', `/api/members/${q(d.id)}`, d),
      updateSkills: (id: number, skills: unknown[]) => call('PUT', `/api/members/${q(id)}/skills`, { skills }),
      setActive: (id: number, active: boolean) => call('PUT', `/api/members/${q(id)}/active`, { active }),
      delete: (id: number) => call('DELETE', `/api/members/${q(id)}`)
    },
    projectMembers: {
      get: (projectId: number) => call('GET', `/api/project-members/${q(projectId)}`),
      all: () => call('GET', '/api/project-members'),
      assign: (projectId: number, memberId: number) => call('POST', '/api/project-members', { projectId, memberId }),
      unassign: (projectId: number, memberId: number) => call('DELETE', '/api/project-members', { projectId, memberId })
    },
    overtime: {
      list: () => call('GET', '/api/overtime'),
      request: (d: Row) => call('POST', '/api/overtime', d),
      decide: (id: number, decision: 'approve' | 'reject') => call('PUT', `/api/overtime/${q(id)}/decide`, { decision })
    },
    all: {
      tasks: () => call('GET', '/api/all/tasks'),
      timesheets: () => call('GET', '/api/all/timesheets'),
      wip: () => call('GET', '/api/all/wip'),
      dispatches: () => call('GET', '/api/all/dispatches'),
      qc: () => call('GET', '/api/all/qc'),
      rfi: () => call('GET', '/api/all/rfi')
    },
    quotes: {
      list: () => call('GET', '/api/quotes'),
      create: (d: Row) => call('POST', '/api/quotes', d),
      update: (id: number, d: Row) => call('PUT', `/api/quotes/${q(id)}`, d),
      delete: (id: number) => call('DELETE', `/api/quotes/${q(id)}`)
    },
    clients: {
      list: () => call('GET', '/api/clients'),
      create: (d: Row) => call('POST', '/api/clients', d),
      update: (id: number, d: Row) => call('PUT', `/api/clients/${q(id)}`, d),
      delete: (id: number) => call('DELETE', `/api/clients/${q(id)}`)
    },
    settings: {
      get: () => call('GET', '/api/settings'),
      update: (patch: Row) => call('PUT', '/api/settings', patch)
    },
    attachments: {
      get: (entityType: string, entityId: number) => call('GET', `/api/attachments?entityType=${q(entityType)}&entityId=${q(entityId)}`),
      getMany: (entityType: string, ids: number[]) => call('GET', `/api/attachments/many?entityType=${q(entityType)}&ids=${q(ids.join(','))}`),
      add: async (entityType: string, entityId: number, multi = true) => {
        const files = await pickFile('*/*', multi)
        if (!files.length) return { ok: true, data: [] }
        const out: Row[] = []
        for (const f of files) { const rec = await uploadOne(entityType, entityId, f); if (rec) out.push(rec) }
        return { ok: true, data: out }
      },
      read: async (storedPath: string) => {
        const blob = await rawBlob(storedPath)
        if (!blob) return { ok: false, error: 'Could not load file' }
        const dataUrl = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(blob) })
        return { ok: true, data: { dataUrl } }
      },
      open: async (storedPath: string) => {
        const blob = await rawBlob(storedPath)
        if (!blob) return { ok: false, error: 'Could not open file' }
        const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000)
        return { ok: true, data: null }
      },
      updateDescription: (id: number, description: string) => call('PUT', `/api/attachments/${q(id)}/description`, { description }),
      update: (id: number, patch: Row) => call('PUT', `/api/attachments/${q(id)}`, { patch }),
      delete: (id: number) => call('DELETE', `/api/attachments/${q(id)}`)
    },
    email: {
      test: () => call('POST', '/api/email/test'),
      send: (msg: { to: string; subject: string; html: string }) => call('POST', '/api/email/send', msg)
    },
    reminders: {
      get: async () => { try { return { ok: true, data: await buildReminders() } } catch (e) { return { ok: false, error: String(e) } } },
      notifyDesktop: async () => {
        try {
          const list = (await buildReminders()).filter((r) => r.severity !== 'upcoming')
          if (!('Notification' in window)) return { ok: true, data: { shown: 0, total: list.length } }
          let perm = Notification.permission
          if (perm === 'default') perm = await Notification.requestPermission()
          if (perm !== 'granted') return { ok: true, data: { shown: 0, total: list.length } }
          const top = list.slice(0, 5)
          top.forEach((r) => new Notification(`${r.severity === 'overdue' ? '⚠ Overdue' : 'Due today'}: ${r.projectName}`, { body: `${String(r.kind).toUpperCase()} — ${r.title} (${r.date})${r.assignee ? ' · ' + r.assignee : ''}` }))
          return { ok: true, data: { shown: top.length, total: list.length } }
        } catch (e) { return { ok: false, error: String(e) } }
      }
    },
    powerbi: { export: async () => ({ ok: false, error: 'Bulk Power BI export will run on the backend (coming once the backend is live).' }) },
    backup: {
      create: async () => ({ ok: false, error: 'Backups run on the backend.' }),
      restore: async () => ({ ok: false, error: 'Backups run on the backend.' })
    },
    report: {
      pdf: async (html: string, fileName: string) => {
        const w = window.open('', '_blank')
        if (!w) return { ok: false, error: 'Pop-up blocked — allow pop-ups, then use the print dialog → Save as PDF.' }
        w.document.open(); w.document.write(html); w.document.close(); w.focus()
        setTimeout(() => { try { w.print() } catch { /* ignore */ } }, 350)
        return { ok: true, data: { filePath: fileName } }
      }
    },
    csv: {
      export: async (type: string, projectName: string, rows: Row[]) => {
        download(`${type}_${projectName}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8')
        return { ok: true, data: { filePath: `${type}_${projectName}.csv` } }
      },
      import: async (_type: string) => {
        const files = await pickFile('.csv,text/csv', false)
        if (!files.length) return { ok: true, data: { rows: [] } }
        const text = await files[0].text()
        return { ok: true, data: { rows: parseCSV(text) } }
      }
    },
    excel: {
      export: async (type: string, projectName: string, rows: Row[], fileName?: string) => {
        // exceljs is CJS; grab whichever interop shape Vite produces.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import('exceljs')
        const ExcelJS = mod.default ?? mod
        const wb = new ExcelJS.Workbook()
        const ws = wb.addWorksheet('Data')
        const fileBase = (fileName || (type === 'rfi' || type === 'query' ? `${projectName}_RFI-Query` : `${type}_${projectName}`)).replace(/[^a-z0-9_-]+/gi, '_')

        if (type === 'rfi' || type === 'query') {
          // One row per point (new multi-point shape) or per legacy attachment.
          // Columns: S. No. · Points · Image · Response (only these, per request).
          ws.columns = [
            { header: 'S. No.', key: 'sno', width: 7 },
            { header: 'Points', key: 'point', width: 52 },
            { header: 'Image', key: 'image', width: 26 },
            { header: 'Response', key: 'response', width: 44 }
          ]
          // Embed a base64 data-URL image into the 'Image' column (index 2) of a row.
          const embedDataUrl = (dataUrl: string, rowNumber: number): boolean => {
            const m = dataUrl.match(/^data:image\/(png|jpe?g|gif);base64,(.+)$/i)
            if (!m) return false
            const ex = /jpe?g/i.test(m[1]) ? 'jpeg' : /gif/i.test(m[1]) ? 'gif' : 'png'
            const imgId = wb.addImage({ base64: m[2], extension: ex as 'png' | 'jpeg' | 'gif' })
            ws.addImage(imgId, { tl: { col: 2, row: rowNumber - 1 }, ext: { width: 150, height: 100 }, editAs: 'oneCell' })
            return true
          }
          // Legacy attachment images (entries with no points).
          const legacyIds = rows.filter((r) => !Array.isArray(r.points)).map((r) => Number(r.id)).filter(Boolean)
          const attRes = legacyIds.length
            ? await call<Row[]>('GET', `/api/attachments/many?entityType=${q(type)}&ids=${q(legacyIds.join(','))}`)
            : { ok: true, data: [] as Row[] }
          const atts = (attRes.ok ? attRes.data ?? [] : []) as Array<Record<string, unknown>>
          const byEntity = new Map<number, Array<Record<string, unknown>>>()
          atts.forEach((a) => { const k = Number(a.entity_id); (byEntity.get(k) ?? byEntity.set(k, []).get(k)!).push(a) })

          let sno = 1
          for (const row of rows) {
            if (Array.isArray(row.points)) {
              const pts = row.points as Array<Record<string, unknown>>
              if (!pts.length) { ws.addRow({ sno: sno++, point: '', image: '', response: '' }); continue }
              for (const p of pts) {
                const xr = ws.addRow({ sno: sno++, point: String(p.text ?? ''), image: '', response: String(p.response ?? '') })
                if (p.image && embedDataUrl(String(p.image), xr.number)) xr.height = 78
              }
            } else {
              const list = byEntity.get(Number(row.id)) ?? []
              if (!list.length) { ws.addRow({ sno: sno++, point: String(row.subject ?? row.description ?? ''), image: '', response: String(row.response ?? '') }); continue }
              for (const a of list) {
                const xr = ws.addRow({ sno: sno++, point: String(row.subject ?? a.description ?? ''), image: '', response: String(a.response ?? '') })
                const ext = String(a.filename ?? '').split('.').pop()?.toLowerCase()
                const exExt = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'png' ? 'png' : ext === 'gif' ? 'gif' : ''
                const blob = exExt ? await rawBlob(String(a.stored_path)) : null
                if (blob && exExt) {
                  const buffer = await blob.arrayBuffer()
                  const imgId = wb.addImage({ buffer, extension: exExt as 'png' | 'jpeg' | 'gif' })
                  ws.addImage(imgId, { tl: { col: 2, row: xr.number - 1 }, ext: { width: 150, height: 100 }, editAs: 'oneCell' })
                  xr.height = 78
                } else {
                  xr.getCell('image').value = String(a.filename ?? '')
                }
              }
            }
          }
        } else {
          // Generic: one column per field.
          const keys = keysOf(rows)
          ws.columns = keys.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(12, k.length + 4)) }))
          rows.forEach((r) => ws.addRow(r))
        }

        // Bold, highlighted, frozen header row; wrap body cells.
        ws.eachRow({ includeEmpty: false }, (r) => r.eachCell((c) => { c.alignment = { wrapText: true, vertical: 'top' } }))
        const head = ws.getRow(1)
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
        head.alignment = { vertical: 'middle' }
        head.height = 20
        ws.views = [{ state: 'frozen', ySplit: 1 }]

        const buf = await wb.xlsx.writeBuffer()
        download(`${fileBase}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        return { ok: true, data: { filePath: `${fileBase}.xlsx` } }
      }
    },
    paths: {
      pick: async () => ({ ok: true, data: { path: null } }),
      open: async (path: string) => {
        if (/^https?:\/\//i.test(path)) { window.open(path, '_blank'); return { ok: true, data: null } }
        return { ok: false, error: 'Opening local file paths is only available in the desktop app.' }
      },
      reveal: async () => ({ ok: false, error: 'Reveal in folder is only available in the desktop app.' })
    },
    auth: {
      state: async () => {
        if (!getToken()) return { ok: true, data: { mode: 'remote', user: null } }
        const me = await call<{ user: unknown }>('GET', '/auth/me')
        // call() already clears token on 401; don't wipe a valid token for transient network errors
        if (!me.ok || !me.data) { return { ok: true, data: { mode: 'remote', user: null } } }
        return { ok: true, data: { mode: 'remote', user: me.data.user } }
      },
      login: async (email: string, password: string) => {
        const r = await call<{ token: string; user: unknown; mustReset: boolean }>('POST', '/auth/login', { email, password })
        if (!r.ok || !r.data) return { ok: false, error: r.error || 'Login failed' }
        setToken(r.data.token)
        return { ok: true, data: { user: r.data.user, mustReset: r.data.mustReset } }
      },
      logout: async () => { setToken(''); return { ok: true, data: null } },
      changePassword: (currentPassword: string, newPassword: string) => call('POST', '/auth/change-password', { currentPassword, newPassword })
    },
    ai: {
      skillFit: async (requiredText: string, candidates: { id: number; text: string }[]) => {
        const results = candidates.map((c) => ({ id: c.id, score: c.text.trim() ? Math.max(0, Math.min(1, lexical(requiredText, c.text))) : 0 }))
        return { ok: true, data: { results, method: 'lexical' as const } }
      }
    },
    realtime: { subscribe: subscribeRealtime }
  }
}

/** Install the HTTP shim onto window.api when running outside Electron. */
export function ensureWebApi(): void {
  const w = window as unknown as { api?: unknown }
  if (!w.api) w.api = buildApi() as unknown
}