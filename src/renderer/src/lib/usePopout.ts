import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Open a separate OS-level window and render React into it (via createPortal on
 * the returned `container`). Prefers the Document Picture-in-Picture API — an
 * always-on-top window that does NOT minimize with the main app window — and
 * falls back to a plain popup (window.open) where PiP isn't available.
 * App stylesheets are copied in so the portaled UI is styled.
 */
interface PopoutApi {
  container: HTMLElement | null
  isOpen: boolean
  open: () => Promise<void>
  close: () => void
}

interface DocumentPiP {
  requestWindow: (opts: { width: number; height: number }) => Promise<Window>
}

function copyStyles(target: Document): void {
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    target.head.appendChild(node.cloneNode(true))
  })
  target.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') ?? 'dark')
}

export function usePopout(opts: { title?: string; width?: number; height?: number; onClose?: () => void } = {}): PopoutApi {
  const { title = 'TOS Tracker', width = 320, height = 250, onClose } = opts
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const winRef = useRef<Window | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const close = useCallback(() => {
    if (winRef.current && !winRef.current.closed) winRef.current.close()
    winRef.current = null
    setContainer(null)
  }, [])

  const open = useCallback(async () => {
    if (winRef.current && !winRef.current.closed) { winRef.current.focus(); return }
    let win: Window | null = null
    const dpip = (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture
    try {
      if (dpip?.requestWindow) win = await dpip.requestWindow({ width, height })
    } catch { win = null }
    if (!win) win = window.open('', 'tos_popout', `width=${width},height=${height},popup=yes`)
    if (!win) return
    try { win.document.title = title } catch { /* ignore */ }
    copyStyles(win.document)
    win.document.body.style.margin = '0'
    win.document.body.style.background = 'var(--bg, #0b0f1a)'
    const el = win.document.createElement('div')
    win.document.body.appendChild(el)
    winRef.current = win
    setContainer(el)
    const handleClose = (): void => { winRef.current = null; setContainer(null); onCloseRef.current?.() }
    win.addEventListener('pagehide', handleClose)
    win.addEventListener('unload', handleClose)
  }, [title, width, height])

  // Close the popout if the main window/component goes away.
  useEffect(() => () => { if (winRef.current && !winRef.current.closed) winRef.current.close() }, [])

  return { container, isOpen: !!container, open, close }
}
