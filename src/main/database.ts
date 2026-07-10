import fs from 'fs'
import { config, currentUser } from './config'

export type Row = Record<string, unknown>

export interface Settings {
  current_member_id: number | null
  smtp: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    from: string
  }
}

interface Store {
  _seq: Record<string, number>
  settings: Settings
  members: Row[]
  project_members: Row[]
  projects: Row[]
  rfis: Row[]
  queries: Row[]
  dispatches: Row[]
  project_status: Row[]
  wip_tasks: Row[]
  qc_items: Row[]
  timesheets: Row[]
  tasks: Row[]
  standards: Row[]
  scopes: Row[]
  meetings: Row[]
  inputs: Row[]
  project_feedback: Row[]
  allocations: Row[]
  attachments: Row[]
}

const DEFAULT_SETTINGS: Settings = {
  current_member_id: null,
  smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' }
}

function emptyStore(): Store {
  return {
    _seq: {},
    settings: { ...DEFAULT_SETTINGS },
    members: [],
    project_members: [],
    projects: [],
    rfis: [],
    queries: [],
    dispatches: [],
    project_status: [],
    wip_tasks: [],
    qc_items: [],
    timesheets: [],
    tasks: [],
    standards: [],
    scopes: [],
    meetings: [],
    inputs: [],
    project_feedback: [],
    allocations: [],
    attachments: []
  }
}

let store: Store | null = null

function load(): Store {
  if (store) return store
  const p = config.dataFilePath()
  if (fs.existsSync(p)) {
    try { store = JSON.parse(fs.readFileSync(p, 'utf8')) } catch { store = null }
  }
  if (!store) store = emptyStore()
  // backfill any missing collections (forward-compat with older data files)
  const base = emptyStore()
  const storeRec = store as unknown as Record<string, unknown>
  for (const k of Object.keys(base)) {
    if (storeRec[k] === undefined) storeRec[k] = (base as unknown as Record<string, unknown>)[k]
  }
  if (!store.settings.smtp) store.settings.smtp = { ...DEFAULT_SETTINGS.smtp }
  return store
}

function save(): void {
  fs.writeFileSync(config.dataFilePath(), JSON.stringify(store, null, 2), 'utf8')
}

// Drop the in-memory cache so the next read re-loads from disk (used after a restore).
export function invalidateCache(): void {
  store = null
}

function nextId(table: string): number {
  const s = load()
  s._seq[table] = (s._seq[table] ?? 0) + 1
  return s._seq[table]
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19)
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  return load().settings
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = load()
  s.settings = { ...s.settings, ...patch, smtp: { ...s.settings.smtp, ...(patch.smtp || {}) } }
  save()
  return s.settings
}

// ── Members ──────────────────────────────────────────────────────────────────

export async function membersGetAll(): Promise<Row[]> {
  return load().members
}

export async function memberCreate(name: string, email: string, role: string, discipline = ''): Promise<number> {
  const s = load()
  const id = nextId('members')
  s.members.push({ id, name, email: email || '', role: role || 'Member', discipline: discipline || '', status: 'active', left_date: '', created_at: now() })
  save()
  return id
}

export async function memberSetActive(id: number, active: boolean): Promise<void> {
  const s = load()
  const m = s.members.find((r) => r.id === id)
  if (m) { m.status = active ? 'active' : 'left'; m.left_date = active ? '' : now().slice(0, 10) }
  save()
}

export async function memberUpdate(id: number, name: string, email: string, role: string, discipline = ''): Promise<void> {
  const s = load()
  const m = s.members.find((r) => r.id === id)
  if (m) { m.name = name; m.email = email || ''; m.role = role || 'Member'; m.discipline = discipline || '' }
  save()
}

export async function memberUpdateSkills(id: number, skills: Row[]): Promise<void> {
  const s = load()
  const m = s.members.find((r) => r.id === id)
  if (m) m.skills = Array.isArray(skills) ? skills : []
  save()
}

export async function memberDelete(id: number): Promise<void> {
  const s = load()
  s.members = s.members.filter((r) => r.id !== id)
  s.project_members = s.project_members.filter((r) => r.member_id !== id)
  if (s.settings.current_member_id === id) s.settings.current_member_id = null
  save()
}

// ── Project ↔ Member assignment ──────────────────────────────────────────────

export async function projectMembersGet(projectId: number): Promise<Row[]> {
  const s = load()
  const ids = s.project_members.filter((r) => r.project_id === projectId).map((r) => r.member_id)
  return s.members.filter((m) => ids.includes(m.id))
}

export async function projectMembersAll(): Promise<Row[]> {
  return load().project_members
}

export async function projectMemberAssign(projectId: number, memberId: number): Promise<void> {
  const s = load()
  const exists = s.project_members.some((r) => r.project_id === projectId && r.member_id === memberId)
  if (!exists) {
    s.project_members.push({ id: nextId('project_members'), project_id: projectId, member_id: memberId })
    save()
  }
}

export async function projectMemberUnassign(projectId: number, memberId: number): Promise<void> {
  const s = load()
  s.project_members = s.project_members.filter(
    (r) => !(r.project_id === projectId && r.member_id === memberId)
  )
  save()
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function projectsGetAll(): Promise<Row[]> {
  return [...load().projects].reverse()
}

export async function projectCreate(name: string, client: string, location: string, discipline: string, quotedHours: string, startDate = '', endDate = ''): Promise<number> {
  const s = load()
  const id = nextId('projects')
  const user = currentUser()
  s.projects.push({
    id, name, client, location, discipline: discipline || '', quoted_hours: parseFloat(quotedHours) || 0,
    start_date: startDate || '', end_date: endDate || '', archived: false,
    created_at: now(), updated_at: now(), created_by: user, updated_by: user
  })
  save()
  return id
}

export async function projectSetArchived(id: number, archived: boolean): Promise<void> {
  const s = load()
  const p = s.projects.find((r) => r.id === id)
  if (p) { p.archived = archived; p.updated_at = now(); p.updated_by = currentUser() }
  save()
}

export async function projectUpdate(id: number, name: string, client: string, location: string, discipline: string, quotedHours: string, startDate = '', endDate = ''): Promise<void> {
  const s = load()
  const p = s.projects.find((r) => r.id === id)
  if (p) {
    p.name = name; p.client = client; p.location = location; p.discipline = discipline || ''
    p.quoted_hours = parseFloat(quotedHours) || 0
    p.start_date = startDate || ''; p.end_date = endDate || ''
    p.updated_at = now(); p.updated_by = currentUser()
  }
  save()
}

export async function projectDelete(id: number): Promise<void> {
  const s = load()
  s.projects = s.projects.filter((r) => r.id !== id)
  for (const t of ['rfis', 'queries', 'dispatches', 'project_status', 'wip_tasks', 'qc_items', 'timesheets', 'tasks', 'standards', 'scopes', 'meetings', 'inputs', 'project_feedback', 'allocations', 'project_members'] as const) {
    s[t] = (s[t] as Row[]).filter((r) => r.project_id !== id)
  }
  save()
}

// ── Generic items (RFI/Query/Dispatch/Status/WIP/QC/Timesheet/Task) ───────────

type TableKey =
  | 'rfis' | 'queries' | 'dispatches' | 'project_status'
  | 'wip_tasks' | 'qc_items' | 'timesheets' | 'tasks' | 'standards'
  | 'scopes' | 'meetings' | 'inputs' | 'project_feedback' | 'allocations'

const TYPE_TABLE: Record<string, TableKey> = {
  rfi: 'rfis', query: 'queries', dispatch: 'dispatches', status: 'project_status',
  wip: 'wip_tasks', qc: 'qc_items', timesheet: 'timesheets', task: 'tasks', standard: 'standards',
  scope: 'scopes', meeting: 'meetings', input: 'inputs', feedback: 'project_feedback', allocation: 'allocations'
}

export async function itemsGetByProject(projectId: number, type: string): Promise<Row[]> {
  const s = load()
  return (s[TYPE_TABLE[type]] as Row[]).filter((r) => r.project_id === projectId)
}

export async function itemCreate(type: string, fields: Row): Promise<number> {
  const s = load()
  const table = TYPE_TABLE[type]
  const id = nextId(table)
  const user = currentUser()

  if (type === 'status') {
    const existing = (s[table] as Row[]).find((r) => r.project_id === fields.project_id)
    if (existing) {
      existing.overall = fields.overall
      existing.notes = fields.notes
      existing.last_updated = now()
      existing.updated_by = user
      save()
      return existing.id as number
    }
    s[table].push({ id, ...fields, last_updated: now(), created_by: user, updated_by: user })
  } else {
    s[table].push({ id, ...fields, created_at: now(), created_by: user, updated_by: user })
  }
  save()
  return id
}

export async function itemUpdate(type: string, id: number, fields: Row): Promise<void> {
  const s = load()
  const row = (s[TYPE_TABLE[type]] as Row[]).find((r) => r.id === id)
  if (row) {
    Object.assign(row, fields)
    row.updated_by = currentUser()
    if (type === 'status') row.last_updated = now()
  }
  save()
}

export async function itemDelete(type: string, id: number): Promise<void> {
  const s = load()
  const table = TYPE_TABLE[type]
  s[table] = (s[table] as Row[]).filter((r) => r.id !== id)
  // remove attachments tied to this item
  s.attachments = s.attachments.filter((a) => !(a.entity_type === type && a.entity_id === id))
  save()
}

// ── Attachments (records only; file copy handled in csv/attachment handler) ────

export async function attachmentsGet(entityType: string, entityId: number): Promise<Row[]> {
  const s = load()
  return s.attachments.filter((a) => a.entity_type === entityType && a.entity_id === entityId)
}

export async function attachmentAdd(entityType: string, entityId: number, filename: string, storedPath: string): Promise<Row> {
  const s = load()
  const id = nextId('attachments')
  const rec = {
    id, entity_type: entityType, entity_id: entityId, filename, stored_path: storedPath,
    description: '', response: '', importance: 'Medium', created_at: now()
  }
  s.attachments.push(rec)
  save()
  return rec
}

export async function attachmentUpdateDescription(id: number, description: string): Promise<void> {
  const s = load()
  const rec = s.attachments.find((a) => a.id === id)
  if (rec) { rec.description = description; save() }
}

export async function attachmentUpdate(id: number, patch: Row): Promise<void> {
  const s = load()
  const rec = s.attachments.find((a) => a.id === id)
  if (rec) { Object.assign(rec, patch); save() }
}

export async function attachmentsGetMany(entityType: string, ids: number[]): Promise<Row[]> {
  const s = load()
  return s.attachments.filter((a) => a.entity_type === entityType && ids.includes(a.entity_id as number))
}

export async function attachmentGet(id: number): Promise<Row | undefined> {
  return load().attachments.find((a) => a.id === id)
}

export async function attachmentDelete(id: number): Promise<Row | undefined> {
  const s = load()
  const rec = s.attachments.find((a) => a.id === id)
  s.attachments = s.attachments.filter((a) => a.id !== id)
  save()
  return rec
}

// ── Cross-cutting reads used by the reminders engine ──────────────────────────

export async function allOpenWip(): Promise<Row[]> {
  return load().wip_tasks
}
export async function allDispatches(): Promise<Row[]> {
  return load().dispatches
}
export async function allTasks(): Promise<Row[]> {
  return load().tasks
}
export async function allTimesheets(): Promise<Row[]> {
  return load().timesheets
}
export async function allQc(): Promise<Row[]> {
  return load().qc_items
}
export async function allRfis(): Promise<Row[]> {
  return load().rfis
}
export async function projectById(id: number): Promise<Row | undefined> {
  return load().projects.find((p) => p.id === id)
}
export async function statusesGetAll(): Promise<Row[]> {
  return load().project_status
}
export async function memberById(id: number): Promise<Row | undefined> {
  return load().members.find((m) => m.id === id)
}
