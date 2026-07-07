export interface Project {
  id: number
  name: string
  client: string
  location: string
  discipline: string
  type?: string
  quoted_hours: number
  start_date?: string
  end_date?: string
  archived?: boolean
  deleted_at?: string // set while in the recycle bin
  client_id?: number | null // link to the Client registry
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
}

import type { MemberRole } from './roles'
export type { MemberRole } from './roles'

export interface Skill {
  skill: string
  category?: string
  level: number // 1-5 proficiency
  years?: number
}

export interface Member {
  id: number
  name: string
  email: string
  role: MemberRole
  discipline?: string
  engagement?: string
  skills?: Skill[]
  status?: 'active' | 'left'
  left_date?: string
  created_at: string
}

export interface ProjectStatus {
  id: number
  project_id: number
  overall: string
  notes: string
  last_updated: string
}

export interface Attachment {
  id: number
  entity_type: string
  entity_id: number
  filename: string
  stored_path: string
  description: string
  response: string
  importance: 'High' | 'Medium' | 'Low'
  created_at: string
}

export interface Reminder {
  key: string
  projectId: number
  projectName: string
  kind: 'wip' | 'dispatch' | 'task'
  title: string
  date: string
  severity: 'due' | 'overdue' | 'upcoming'
  assignee: string
  assigneeEmail: string
}

export interface SmtpSettings {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

export interface DigestSettings {
  enabled: boolean
  frequency: string
  dayOfWeek: number
  hour: number
  recipients: string[]
}

export interface Settings {
  current_member_id: number | null
  smtp: SmtpSettings
  digest?: DigestSettings
  analytics?: { amplitude_key?: string }
}

export interface OvertimeRequest {
  id: number
  member_id: number
  date: string
  hours: number
  // Two-stage approval: pending → lead_approved (Project/Team Lead signed off) →
  // approved (Manager signed off too). Hours only reflect once 'approved'.
  status: 'pending' | 'lead_approved' | 'approved' | 'rejected'
  reason: string
  requested_at: string
  decided_by: string
}

// Standalone project quotation (company's fixed BIM scope template).
export interface Quote {
  id: number
  quote_no: string
  date: string
  client_name: string
  project_name: string
  project_hours: string
  qc_hours: string
  // Detailed scope of work
  type_of_building: string
  disciplines: string
  lod: string
  lod_type?: 'LOD' | 'LOA'  // which standard the `lod` value refers to
  tolerance: string
  type_of_project: string
  area: string
  units: string
  software: string
  inputs_received: string
  output_deliverable: string
  inputs_required: string
  exclusions: string
  note: string
  description?: string      // free-text description of the quotation
  image?: string            // optional embedded image (base64 data URL, < 1MB)
  description_image?: string // optional image shown under Description (base64, < 1MB)
  note_image?: string        // optional image shown under Note (base64, < 1MB)
  // Per-discipline hours { Architecture: { work, qc }, … }; Project hrs = Σ work, QC hrs = Σ qc.
  disc_hours?: Record<string, { work: string; qc: string }>
  // Set when this quote is an "additional quote" for a project that already has one —
  // a full, independently editable quote (same editor, same fields) linked back to the
  // original. The linked project's quoted hours are the sum across all of its quotes.
  parent_quote_id?: number
  status?: 'Draft' | 'Sent' | 'Approved' // single status; Approved auto-creates the project
  client_id?: number        // link to the Client registry
  approved?: boolean        // legacy mirror of status === 'Approved' (kept in sync)
  sent?: boolean            // legacy mirror of status sent/approved (kept in sync)
  project_id?: number       // the project created from this quote (set once on approval)
  created_at?: string
  updated_at?: string
  created_by?: string
  updated_by?: string
}

// Client registry record — reused across all the client's projects (unique by name).
export interface Client {
  id: number
  code: string        // human-readable unique id, e.g. CL-0001
  name: string        // client name (required, unique)
  company?: string    // company name (optional)
  created_at?: string
  updated_at?: string
  created_by?: string
  updated_by?: string
}

export interface ToastAction { label: string; onClick: () => void }
export type ToastFn = (msg: string, type?: 'success' | 'error', action?: ToastAction) => void

export interface AuthUser {
  uid: number
  mid: number | null
  role: MemberRole
  name: string
  email: string
  discipline?: string
}

export type AuthState = { mode: 'local' | 'remote'; user: AuthUser | null }

export interface ChangeEvent {
  entity: 'project' | 'status' | 'item' | 'member' | 'projectMember' | 'attachment'
  action: 'create' | 'update' | 'delete'
  type?: string
  projectId?: number
}

export type ItemType =
  | 'rfi' | 'query' | 'dispatch' | 'status' | 'wip' | 'qc' | 'timesheet' | 'task'
  | 'standard' | 'scope' | 'meeting' | 'input' | 'feedback' | 'allocation'

export interface IpcResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

type R<T> = Promise<IpcResponse<T>>

declare global {
  interface Window {
    api: {
      projects: {
        getAll: () => R<Project[]>
        statuses: () => R<ProjectStatus[]>
        create: (d: { name: string; client: string; location: string; discipline: string; quoted_hours: string; type?: string; start_date?: string; end_date?: string; client_id?: number | null }) => R<{ id: number }>
        update: (d: { id: number; name: string; client: string; location: string; discipline: string; quoted_hours: string; type?: string; start_date?: string; end_date?: string; client_id?: number | null }) => R<{ id: number }>
        delete: (id: number) => R<{ id: number }>
        setArchived: (id: number, archived: boolean) => R<{ id: number }>
        deleted: () => R<Project[]>
        restore: (id: number) => R<{ id: number }>
        purge: (id: number) => R<{ id: number }>
      }
      items: {
        getByProject: (projectId: number, type: string) => R<unknown[]>
        create: (type: string, data: Record<string, unknown>) => R<{ id: number }>
        update: (type: string, data: Record<string, unknown>) => R<{ id: number }>
        delete: (type: string, id: number) => R<{ id: number }>
      }
      members: {
        getAll: () => R<Member[]>
        create: (d: { name: string; email: string; role: string; discipline?: string; engagement?: string }) => R<{ id: number }>
        update: (d: { id: number; name: string; email: string; role: string; discipline?: string; engagement?: string }) => R<{ id: number }>
        updateSkills: (id: number, skills: Skill[]) => R<{ id: number }>
        setActive: (id: number, active: boolean) => R<{ id: number }>
        delete: (id: number) => R<{ id: number }>
      }
      projectMembers: {
        get: (projectId: number) => R<Member[]>
        all: () => R<{ id: number; project_id: number; member_id: number }[]>
        assign: (projectId: number, memberId: number) => R<unknown>
        unassign: (projectId: number, memberId: number) => R<unknown>
      }
      overtime: {
        list: () => R<OvertimeRequest[]>
        request: (d: { date: string; hours: number; reason?: string }) => R<{ id: number }>
        // Advances the request one approval stage (lead, then manager) or rejects it.
        decide: (id: number, decision: 'approve' | 'reject') => R<{ id: number }>
      }
      all: {
        tasks: () => R<Record<string, unknown>[]>
        timesheets: () => R<Record<string, unknown>[]>
        wip: () => R<Record<string, unknown>[]>
        dispatches: () => R<Record<string, unknown>[]>
        qc: () => R<Record<string, unknown>[]>
        rfi: () => R<Record<string, unknown>[]>
      }
      quotes: {
        list: () => R<Quote[]>
        create: (d: Partial<Quote>) => R<{ id: number }>
        update: (id: number, d: Partial<Quote>) => R<{ id: number }>
        delete: (id: number) => R<{ id: number }>
      }
      clients: {
        list: () => R<Client[]>
        create: (d: { name: string; company?: string }) => R<{ id: number }>
        update: (id: number, d: { name: string; company?: string }) => R<{ id: number }>
        delete: (id: number) => R<{ id: number }>
      }
      settings: {
        get: () => R<Settings>
        update: (patch: Partial<Settings>) => R<Settings>
      }
      attachments: {
        get: (entityType: string, entityId: number) => R<Attachment[]>
        add: (entityType: string, entityId: number, multi?: boolean) => R<Attachment[]>
        read: (storedPath: string) => R<{ dataUrl: string }>
        open: (storedPath: string) => R<unknown>
        updateDescription: (id: number, description: string) => R<{ id: number }>
        update: (id: number, patch: Record<string, unknown>) => R<{ id: number }>
        getMany: (entityType: string, ids: number[]) => R<Attachment[]>
        delete: (id: number) => R<{ id: number }>
      }
      email: {
        test: () => R<{ verified: boolean }>
        send: (d: { to: string; subject: string; html: string }) => R<{ messageId: string }>
      }
      reminders: {
        get: () => R<Reminder[]>
        notifyDesktop: () => R<{ shown: number; total?: number }>
      }
      powerbi: {
        export: () => R<{ dir: string | null; files?: number }>
      }
      backup: {
        create: () => R<{ filePath: string | null }>
        restore: () => R<{ restored: boolean }>
      }
      report: {
        pdf: (html: string, fileName: string) => R<{ filePath: string | null }>
      }
      csv: {
        export: (type: string, projectName: string, rows: Record<string, unknown>[]) => R<{ filePath: string | null }>
        import: (type: string) => R<{ rows: Record<string, string>[] }>
      }
      excel: {
        export: (type: string, projectName: string, rows: Record<string, unknown>[], fileName?: string) => R<{ filePath: string | null }>
      }
      paths: {
        pick: (mode: 'file' | 'folder') => R<{ path: string | null }>
        open: (path: string) => R<unknown>
        reveal: (path: string) => R<unknown>
      }
      auth: {
        state: () => R<AuthState>
        login: (email: string, password: string) => R<{ user: AuthUser; mustReset: boolean }>
        logout: () => R<unknown>
        changePassword: (currentPassword: string, newPassword: string) => R<unknown>
      }
      ai: {
        skillFit: (requiredText: string, candidates: { id: number; text: string }[]) =>
          R<{ results: { id: number; score: number }[]; method: 'ruflo' | 'lexical' }>
      }
      realtime: {
        subscribe: (cb: (event: ChangeEvent) => void) => () => void
      }
    }
  }
}
