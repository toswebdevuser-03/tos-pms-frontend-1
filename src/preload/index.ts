import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

contextBridge.exposeInMainWorld('electron', electronAPI)

contextBridge.exposeInMainWorld('api', {
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    statuses: () => ipcRenderer.invoke('projects:statuses'),
    create: (data: { name: string; client: string; location: string; discipline: string; quoted_hours: string; start_date?: string; end_date?: string }) =>
      ipcRenderer.invoke('projects:create', data),
    update: (data: { id: number; name: string; client: string; location: string; discipline: string; quoted_hours: string; start_date?: string; end_date?: string }) =>
      ipcRenderer.invoke('projects:update', data),
    delete: (id: number) => ipcRenderer.invoke('projects:delete', { id }),
    setArchived: (id: number, archived: boolean) => ipcRenderer.invoke('projects:setArchived', { id, archived })
  },
  items: {
    getByProject: (projectId: number, type: string) =>
      ipcRenderer.invoke('items:getByProject', { projectId, type }),
    create: (type: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('items:create', { type, ...data }),
    update: (type: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('items:update', { type, ...data }),
    delete: (type: string, id: number) => ipcRenderer.invoke('items:delete', { type, id })
  },
  members: {
    getAll: () => ipcRenderer.invoke('members:getAll'),
    create: (data: { name: string; email: string; role: string; discipline?: string; engagement?: string }) => ipcRenderer.invoke('members:create', data),
    update: (data: { id: number; name: string; email: string; role: string; discipline?: string; engagement?: string }) => ipcRenderer.invoke('members:update', data),
    updateSkills: (id: number, skills: unknown[]) => ipcRenderer.invoke('members:updateSkills', { id, skills }),
    setActive: (id: number, active: boolean) => ipcRenderer.invoke('members:setActive', { id, active }),
    delete: (id: number) => ipcRenderer.invoke('members:delete', { id })
  },
  projectMembers: {
    get: (projectId: number) => ipcRenderer.invoke('projectMembers:get', { projectId }),
    all: () => ipcRenderer.invoke('projectMembers:all'),
    assign: (projectId: number, memberId: number) => ipcRenderer.invoke('projectMembers:assign', { projectId, memberId }),
    unassign: (projectId: number, memberId: number) => ipcRenderer.invoke('projectMembers:unassign', { projectId, memberId })
  },
  overtime: {
    list: () => ipcRenderer.invoke('overtime:list'),
    request: (d: { date: string; hours: number; reason?: string }) => ipcRenderer.invoke('overtime:request', d),
    decide: (id: number, status: string) => ipcRenderer.invoke('overtime:decide', { id, status })
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:update', patch)
  },
  attachments: {
    get: (entityType: string, entityId: number) => ipcRenderer.invoke('attachments:get', { entityType, entityId }),
    add: (entityType: string, entityId: number, multi = true) => ipcRenderer.invoke('attachments:add', { entityType, entityId, multi }),
    read: (storedPath: string) => ipcRenderer.invoke('attachments:read', { storedPath }),
    open: (storedPath: string) => ipcRenderer.invoke('attachments:open', { storedPath }),
    updateDescription: (id: number, description: string) => ipcRenderer.invoke('attachments:updateDescription', { id, description }),
    update: (id: number, patch: Record<string, unknown>) => ipcRenderer.invoke('attachments:update', { id, patch }),
    getMany: (entityType: string, ids: number[]) => ipcRenderer.invoke('attachments:getMany', { entityType, ids }),
    delete: (id: number) => ipcRenderer.invoke('attachments:delete', { id })
  },
  email: {
    test: () => ipcRenderer.invoke('email:test'),
    send: (data: { to: string; subject: string; html: string }) => ipcRenderer.invoke('email:send', data)
  },
  reminders: {
    get: () => ipcRenderer.invoke('reminders:get'),
    notifyDesktop: () => ipcRenderer.invoke('reminders:notifyDesktop')
  },
  powerbi: {
    export: () => ipcRenderer.invoke('powerbi:export')
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore')
  },
  report: {
    pdf: (html: string, fileName: string) => ipcRenderer.invoke('report:pdf', { html, fileName })
  },
  csv: {
    export: (type: string, projectName: string, rows: Record<string, unknown>[]) =>
      ipcRenderer.invoke('csv:export', { type, projectName, rows }),
    import: (type: string) => ipcRenderer.invoke('csv:import', { type })
  },
  excel: {
    export: (type: string, projectName: string, rows: Record<string, unknown>[]) =>
      ipcRenderer.invoke('excel:export', { type, projectName, rows })
  },
  paths: {
    pick: (mode: 'file' | 'folder') => ipcRenderer.invoke('paths:pick', { mode }),
    open: (path: string) => ipcRenderer.invoke('paths:open', { path }),
    reveal: (path: string) => ipcRenderer.invoke('paths:reveal', { path })
  },
  auth: {
    state: () => ipcRenderer.invoke('auth:state'),
    login: (email: string, password: string) => ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    changePassword: (currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', { currentPassword, newPassword })
  },
  ai: {
    skillFit: (requiredText: string, candidates: { id: number; text: string }[]) =>
      ipcRenderer.invoke('ai:skillFit', { requiredText, candidates })
  },
  realtime: {
    // Subscribe to live change events; returns an unsubscribe function.
    subscribe: (cb: (event: unknown) => void) => {
      const listener = (_e: unknown, event: unknown): void => cb(event)
      ipcRenderer.on('realtime', listener)
      return () => ipcRenderer.removeListener('realtime', listener)
    }
  }
})
