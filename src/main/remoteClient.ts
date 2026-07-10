/**
 * Remote data layer: same async signatures as database.ts, implemented as HTTP
 * calls to the Project Tracker server. Selected by config.storageMode === 'remote'
 * via dataLayer.ts, so IPC handlers and the renderer are unchanged.
 */
import { config, currentUser } from './config'
import type { Settings } from './database'

export type Row = Record<string, unknown>

function base(): string {
  return config.remoteBaseUrl.replace(/\/$/, '') + '/api'
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base() + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-actor': currentUser(), ...authHeader() },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  let json: { ok: boolean; data?: unknown; error?: string }
  try {
    json = (await res.json()) as typeof json
  } catch {
    throw new Error(`Server returned ${res.status} ${res.statusText}`)
  }
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data as T
}

// Auth token attached to every /api request.
function authHeader(): Record<string, string> {
  return config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}
}

const q = (v: unknown): string => encodeURIComponent(String(v))

// ── Auth (endpoints live under /auth, not /api) ───────────────────────────────
export interface AuthUser {
  uid: number
  mid: number | null
  role: string
  name: string
  email: string
}

function authBase(): string {
  return config.remoteBaseUrl.replace(/\/$/, '') + '/auth'
}
async function authReq<T>(method: string, path: string, body?: unknown, withAuth = false): Promise<T> {
  const res = await fetch(authBase() + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(withAuth ? authHeader() : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  let json: { ok: boolean; data?: unknown; error?: string }
  try {
    json = (await res.json()) as typeof json
  } catch {
    throw new Error(`Server returned ${res.status} ${res.statusText}`)
  }
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data as T
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser; mustReset: boolean }> {
  return authReq('POST', '/login', { email, password })
}
export async function me(): Promise<{ user: AuthUser }> {
  return authReq('GET', '/me', undefined, true)
}
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await authReq('POST', '/change-password', { currentPassword, newPassword }, true)
}

// ── Settings ──────────────────────────────────────────────────────────────────
export async function getSettings(): Promise<Settings> {
  return req('GET', '/settings')
}
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return req('PUT', '/settings', patch)
}

// ── Members ───────────────────────────────────────────────────────────────────
export async function membersGetAll(): Promise<Row[]> {
  return req('GET', '/members')
}
export async function memberCreate(name: string, email: string, role: string, discipline = ''): Promise<number> {
  return (await req<{ id: number }>('POST', '/members', { name, email, role, discipline })).id
}
export async function memberUpdate(id: number, name: string, email: string, role: string, discipline = ''): Promise<void> {
  await req('PUT', `/members/${id}`, { name, email, role, discipline })
}
export async function memberUpdateSkills(id: number, skills: Row[]): Promise<void> {
  await req('PUT', `/members/${id}/skills`, { skills })
}
export async function memberSetActive(id: number, active: boolean): Promise<void> {
  await req('PUT', `/members/${id}/active`, { active })
}
export async function memberDelete(id: number): Promise<void> {
  await req('DELETE', `/members/${id}`)
}
export async function memberById(id: number): Promise<Row | undefined> {
  return (await req<Row | null>('GET', `/members/${id}`)) ?? undefined
}

// ── Project ↔ member ──────────────────────────────────────────────────────────
export async function projectMembersGet(projectId: number): Promise<Row[]> {
  return req('GET', `/project-members/${projectId}`)
}
export async function projectMembersAll(): Promise<Row[]> {
  return req('GET', '/project-members')
}
export async function projectMemberAssign(projectId: number, memberId: number): Promise<void> {
  await req('POST', '/project-members', { projectId, memberId })
}
export async function projectMemberUnassign(projectId: number, memberId: number): Promise<void> {
  await req('DELETE', '/project-members', { projectId, memberId })
}

// ── Projects ──────────────────────────────────────────────────────────────────
export async function projectsGetAll(): Promise<Row[]> {
  return req('GET', '/projects')
}
export async function projectById(id: number): Promise<Row | undefined> {
  return (await req<Row | null>('GET', `/projects/${id}`)) ?? undefined
}
export async function projectCreate(name: string, client: string, location: string, discipline: string, quotedHours: string, startDate = '', endDate = ''): Promise<number> {
  return (await req<{ id: number }>('POST', '/projects', { name, client, location, discipline, quoted_hours: quotedHours, start_date: startDate, end_date: endDate })).id
}
export async function projectUpdate(id: number, name: string, client: string, location: string, discipline: string, quotedHours: string, startDate = '', endDate = ''): Promise<void> {
  await req('PUT', `/projects/${id}`, { name, client, location, discipline, quoted_hours: quotedHours, start_date: startDate, end_date: endDate })
}
export async function projectDelete(id: number): Promise<void> {
  await req('DELETE', `/projects/${id}`)
}
export async function projectSetArchived(id: number, archived: boolean): Promise<void> {
  await req('PUT', `/projects/${id}/archived`, { archived })
}
// No local cache in remote mode; kept for parity with the local store interface.
export function invalidateCache(): void { /* no-op */ }

// ── Items ─────────────────────────────────────────────────────────────────────
export async function itemsGetByProject(projectId: number, type: string): Promise<Row[]> {
  return req('GET', `/items/${q(type)}?projectId=${q(projectId)}`)
}
export async function itemCreate(type: string, fields: Row): Promise<number> {
  return (await req<{ id: number }>('POST', `/items/${q(type)}`, fields)).id
}
export async function itemUpdate(type: string, id: number, fields: Row): Promise<void> {
  await req('PUT', `/items/${q(type)}/${id}`, fields)
}
export async function itemDelete(type: string, id: number): Promise<void> {
  await req('DELETE', `/items/${q(type)}/${id}`)
}
export async function statusesGetAll(): Promise<Row[]> {
  return req('GET', '/statuses')
}

// ── Cross-cutting (reminders) ─────────────────────────────────────────────────
export async function allOpenWip(): Promise<Row[]> {
  return req('GET', '/all/wip')
}
export async function allDispatches(): Promise<Row[]> {
  return req('GET', '/all/dispatches')
}
export async function allTasks(): Promise<Row[]> {
  return req('GET', '/all/tasks')
}
export async function allTimesheets(): Promise<Row[]> {
  return req('GET', '/all/timesheets')
}
export async function allQc(): Promise<Row[]> {
  return req('GET', '/all/qc')
}
export async function allRfis(): Promise<Row[]> {
  return req('GET', '/all/rfi')
}

// ── Attachments (records; file bytes handled in Phase 5) ──────────────────────
export async function attachmentsGet(entityType: string, entityId: number): Promise<Row[]> {
  return req('GET', `/attachments?entityType=${q(entityType)}&entityId=${q(entityId)}`)
}
export async function attachmentsGetMany(entityType: string, ids: number[]): Promise<Row[]> {
  return req('GET', `/attachments/many?entityType=${q(entityType)}&ids=${q(ids.join(','))}`)
}
export async function attachmentGet(id: number): Promise<Row | undefined> {
  return (await req<Row | null>('GET', `/attachments/${id}`)) ?? undefined
}
export async function attachmentAdd(entityType: string, entityId: number, filename: string, storedPath: string): Promise<Row> {
  return req('POST', '/attachments', { entityType, entityId, filename, storedPath })
}
export async function attachmentUpdateDescription(id: number, description: string): Promise<void> {
  await req('PUT', `/attachments/${id}/description`, { description })
}
export async function attachmentUpdate(id: number, patch: Row): Promise<void> {
  await req('PUT', `/attachments/${id}`, { patch })
}
export async function attachmentDelete(id: number): Promise<Row | undefined> {
  return (await req<Row | null>('DELETE', `/attachments/${id}`)) ?? undefined
}

// Upload raw file bytes to the server store; returns the created attachment record.
export async function attachmentUpload(entityType: string, entityId: number, filename: string, buffer: Buffer): Promise<Row> {
  const form = new FormData()
  form.append('entityType', entityType)
  form.append('entityId', String(entityId))
  form.append('file', new Blob([new Uint8Array(buffer)]), filename)
  const res = await fetch(base() + '/attachments/upload', { method: 'POST', headers: authHeader(), body: form })
  let json: { ok: boolean; data?: unknown; error?: string }
  try {
    json = (await res.json()) as typeof json
  } catch {
    throw new Error(`Server returned ${res.status} ${res.statusText}`)
  }
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data as Row
}

// Fetch raw file bytes by stored_path (for previews / open / Excel embedding).
export async function attachmentRaw(storedPath: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(base() + `/attachments/raw?path=${q(storedPath)}`, { headers: authHeader() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ab = await res.arrayBuffer()
  return { buffer: Buffer.from(ab), contentType: res.headers.get('content-type') || 'application/octet-stream' }
}

