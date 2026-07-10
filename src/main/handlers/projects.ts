import { ipcMain } from 'electron'
import {
  projectsGetAll,
  projectCreate,
  projectUpdate,
  projectDelete,
  projectSetArchived,
  statusesGetAll,
  itemsGetByProject,
  // NOTE: this file intentionally only uses item reads for counts.
} from '../dataLayer'

export function registerProjectHandlers(): void {
  ipcMain.handle('projects:getAll', async () => {
    try { return { ok: true, data: await projectsGetAll() } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('projects:statuses', async () => {
    try { return { ok: true, data: await statusesGetAll() } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  // Project tab badge counts (used by ProjectDetail).
  // Currently returns only task count placeholder to avoid wider schema changes.
  ipcMain.handle('projects:counts', async (_e, { projectId }: { projectId: number }) => {
    try {
      // Minimal counts payload to support ProjectDetail tab badges.
      const tasks = await itemsGetByProject(projectId, 'task')
      const qc = await itemsGetByProject(projectId, 'qc')
      const rfi = await itemsGetByProject(projectId, 'rfi')
      const dispatch = await itemsGetByProject(projectId, 'dispatch')
      const status = await itemsGetByProject(projectId, 'status')
      const out: Record<string, number> = {
        task: Array.isArray(tasks) ? tasks.length : 0,
        qc: Array.isArray(qc) ? qc.length : 0,
        rfi: Array.isArray(rfi) ? rfi.length : 0,
        dispatch: Array.isArray(dispatch) ? dispatch.length : 0,
        status: Array.isArray(status) ? status.length : 0,
      }
      return { ok: true, data: out }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })


  ipcMain.handle('projects:create', async (_e, { name, client, location, discipline, quoted_hours, start_date, end_date }) => {
    try { return { ok: true, data: { id: await projectCreate(name, client, location, discipline, quoted_hours, start_date, end_date) } } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('projects:update', async (_e, { id, name, client, location, discipline, quoted_hours, start_date, end_date }) => {
    try { await projectUpdate(id, name, client, location, discipline, quoted_hours, start_date, end_date); return { ok: true, data: { id } } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('projects:delete', async (_e, { id }) => {
    try { await projectDelete(id); return { ok: true, data: { id } } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('projects:setArchived', async (_e, { id, archived }) => {
    try { await projectSetArchived(id, archived); return { ok: true, data: { id } } }
    catch (e) { return { ok: false, error: String(e) } }
  })
}

