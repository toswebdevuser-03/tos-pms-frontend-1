import { useEffect } from 'react'

/**
 * Calls `onClose` when the user presses Escape, for as long as the calling
 * component is mounted. Used by modal overlays so keyboard users have a
 * consistent way to dismiss (mirrors the click-outside-to-close behavior).
 */
export function useEscapeKey(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
