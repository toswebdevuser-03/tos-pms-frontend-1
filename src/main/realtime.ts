/**
 * Real-time client (remote mode). Connects to the server's /ws endpoint with the
 * auth token and forwards every change event to all renderer windows via
 * webContents.send('realtime', event). Auto-reconnects on drop. The token stays
 * in the main process — the renderer only receives the forwarded events.
 */
import WebSocket from 'ws'
import { BrowserWindow } from 'electron'
import { config } from './config'

let sock: WebSocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let stopped = false
let connectedOnce = false

function wsUrl(): string {
  const base = config.remoteBaseUrl.replace(/^http/, 'ws').replace(/\/$/, '')
  return `${base}/ws?token=${encodeURIComponent(config.authToken)}`
}

function broadcastToRenderers(event: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('realtime', event)
  }
}

function connect(): void {
  if (config.storageMode !== 'remote' || !config.authToken) return
  try {
    sock = new WebSocket(wsUrl())
  } catch {
    scheduleReconnect()
    return
  }
  sock.on('open', () => {
    if (connectedOnce) broadcastToRenderers({ entity: 'catchup', action: 'update' })
    connectedOnce = true
  })
  sock.on('message', (data) => {
    try {
      broadcastToRenderers(JSON.parse(data.toString()))
    } catch {
      /* ignore malformed */
    }
  })
  sock.on('close', () => { sock = null; if (!stopped) scheduleReconnect() })
  sock.on('error', () => { /* 'close' will follow and trigger reconnect */ })
}

function scheduleReconnect(): void {
  if (reconnectTimer || stopped) return
  reconnectTimer = setTimeout(() => { reconnectTimer = null; if (!stopped) connect() }, 3000)
}

export function startRealtime(): void {
  stopped = false
  if (!sock) connect()
}

export function stopRealtime(): void {
  stopped = true
  connectedOnce = false
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (sock) { try { sock.close() } catch { /* noop */ } sock = null }
}

// Call after login/logout (token changed).
export function restartRealtime(): void {
  stopRealtime()
  startRealtime()
}
