import { ReactNode } from 'react'
import Icon from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  title: string
  message: string | ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

// Shared replacement for window.confirm(): styled like FormModal (modal-overlay +
// modal card) so destructive actions get a consistent, on-brand confirmation UI.
export default function ConfirmDialog({
  title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', onConfirm, onCancel
}: Props) {
  useEscapeKey(onCancel)

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onCancel}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
