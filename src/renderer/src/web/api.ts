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

const API_BASE = (((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) || '').replace(/\/$/, '')
const TOKEN_KEY = 'tos_token'

const getToken = (): string => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
const setToken = (t: string): void => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } }
const authHeader = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }
const NO_BACKEND = 'Backend not configured yet (set VITE_API_BASE_URL and redeploy).'

// Core request → returns the server's {ok,data,error} envelope (matches IPC).
async function call<T>(method: string, path: string, body?: unknown): Res<T> {
  if (!API_BASE) return { ok: false, error: NO_BACKEND }
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
const escHtml = (v: unknown): string => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c))
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
  if (!API_BASE) return null
  const res = await fetch(`${API_BASE}/api/attachments/raw?path=${q(storedPath)}`, { headers: authHeader() })
  if (!res.ok) return null
  return res.blob()
}
async function uploadOne(entityType: string, entityId: number, file: File): Promise<Row | null> {
  const form = new FormData()
  form.append('entityType', entityType); form.append('entityId', String(entityId)); form.append('file', file, file.name)
  const res = await fetch(`${API_BASE}/api/attachments/upload`, { method: 'POST', headers: authHeader(), body: form })
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
  const [wip, disp, task, proj, mem] = await Promise.all([
    call<Row[]>('GET', '/api/all/wip'), call<Row[]>('GET', '/api/all/dispatches'), call<Row[]>('GET', '/api/all/tasks'),
    call<Row[]>('GET', '/api/projects'), call<Row[]>('GET', '/api/members')
  ])
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
    if (String(d.status) === 'Acknowledged') continue
    const date = String(d.dispatch_date || ''); const sev = severityFor(date); if (!sev) continue
    out.push({ key: `dispatch-${d.id}`, projectId: d.project_id, projectName: pName.get(Number(d.project_id)) ?? '', kind: 'dispatch', title: String(d.dispatch_number || 'Dispatch') + (d.description ? ` — ${d.description}` : ''), date, severity: sev, assignee: String(d.recipient || ''), assigneeEmail: '' })
  }
  for (const t of task.data ?? []) {
    if (String(t.status) === 'Done') continue
    const date = String(t.deadline || ''); const sev = severityFor(date); if (!sev) continue
    const a = who(t.assigned_member_id)
    out.push({ key: `task-${t.id}`, projectId: t.project_id, projectName: pName.get(Number(t.project_id)) ?? '', kind: 'task', title: String(t.name || 'Task'), date, severity: sev, assignee: a.name, assigneeEmail: a.email })
  }
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
      setArchived: (id: number, archived: boolean) => call('PUT', `/api/projects/${q(id)}/archived`, { archived })
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
    settings: {
      get: () => call('GET', '/api/settings'),
      update: (patch: Row) => call('PUT', '/api/settings', patch)
    },
    attachments: {
      get: (entityType: string, entityId: number) => call('GET', `/api/attachments?entityType=${q(entityType)}&entityId=${q(entityId)}`),
      getMany: (entityType: string, ids: number[]) => call('GET', `/api/attachments/many?entityType=${q(entityType)}&ids=${q(ids.join(','))}`),
      add: async (entityType: string, entityId: number, multi = true) => {
        if (!API_BASE) return { ok: false, error: NO_BACKEND }
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
      test: async () => ({ ok: false, error: 'Email is sent by the backend — configure SMTP server-side once the backend is live.' }),
      send: async () => ({ ok: false, error: 'Email is sent by the backend — not available until the backend is configured.' })
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
      export: async (type: string, projectName: string, rows: Row[]) => {
        const keys = keysOf(rows)
        const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${keys.map((k) => `<th>${escHtml(k)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${keys.map((k) => `<td>${escHtml(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
        download(`${type}_${projectName}.xls`, '﻿' + html, 'application/vnd.ms-excel')
        return { ok: true, data: { filePath: `${type}_${projectName}.xls` } }
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
        if (!me.ok || !me.data) { setToken(''); return { ok: true, data: { mode: 'remote', user: null } } }
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
