import { ipcMain } from 'electron'
import { config } from '../config'
import * as remote from '../remoteClient'
import { restartRealtime, stopRealtime } from '../realtime'

/**
 * Auth IPC. Only meaningful in remote mode — in local (single-user JSON) mode
 * there is no login and the renderer keeps using the "Acting as" selector.
 * The JWT lives in the main process (config.authToken), never in the renderer.
 */
export function registerAuthHandlers(): void {
  // Current auth state: which mode we're in, and the signed-in user (if any).
  ipcMain.handle('auth:state', async () => {
    if (config.storageMode !== 'remote') return { ok: true, data: { mode: 'local', user: null } }
    if (!config.authToken) return { ok: true, data: { mode: 'remote', user: null } }
    try {
      const { user } = await remote.me()
      return { ok: true, data: { mode: 'remote', user } }
    } catch {
      config.authToken = '' // token expired / invalid — force re-login
      return { ok: true, data: { mode: 'remote', user: null } }
    }
  })

  ipcMain.handle('auth:login', async (_e, { email, password }) => {
    try {
      const { token, user, mustReset } = await remote.login(email, password)
      config.authToken = token
      restartRealtime() // open the live connection now that we have a token
      return { ok: true, data: { user, mustReset } }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    config.authToken = ''
    stopRealtime()
    return { ok: true, data: {} }
  })

  ipcMain.handle('auth:changePassword', async (_e, { currentPassword, newPassword }) => {
    try {
      await remote.changePassword(currentPassword, newPassword)
      return { ok: true, data: {} }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
