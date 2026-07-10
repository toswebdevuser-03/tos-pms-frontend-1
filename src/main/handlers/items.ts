import { ipcMain } from 'electron'
import {
  itemsGetByProject,
  itemCreate,
  itemUpdate,
  itemDelete,
  allTasks,
  allTimesheets,
  allQc,
  allRfis,
  allOpenWip,
  allDispatches,
  Row
} from '../dataLayer'

export function registerItemHandlers(): void {
  ipcMain.handle('items:getByProject', async (_e, { projectId, type }) => {
    try { return { ok: true, data: await itemsGetByProject(projectId, type) } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('all:tasks', async () => {
    try { return { ok: true, data: await allTasks() } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('all:timesheets', async () => {
    try { return { ok: true, data: await allTimesheets() } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('all:qc', async () => {
    try { return { ok: true, data: await allQc() } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('all:rfi', async () => {
    try { return { ok: true, data: await allRfis() } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('all:wip', async () => {
    try { return { ok: true, data: await allOpenWip() } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('all:dispatches', async () => {
    try { return { ok: true, data: await allDispatches() } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('items:create', async (_e, { type, ...fields }: { type: string } & Row) => {
    try { return { ok: true, data: { id: await itemCreate(type, fields) } } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('items:update', async (_e, { type, id, ...fields }: { type: string; id: number } & Row) => {
    try { await itemUpdate(type, id, fields); return { ok: true, data: { id } } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('items:delete', async (_e, { type, id }) => {
    try { await itemDelete(type, id); return { ok: true, data: { id } } }
    catch (e) { return { ok: false, error: String(e) } }
  })
}
