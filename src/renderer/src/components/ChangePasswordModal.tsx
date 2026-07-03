import { useState } from 'react'
import Icon from './Icon'
import { useApp } from '../context/AppContext'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}

export default function ChangePasswordModal({ onClose, onToast }: Props) {
  useEscapeKey(onClose)
  const { changePassword } = useApp()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    setError('')
    if (next.length < 6) { setError('New password must be at least 6 characters'); return }
    if (next !== confirm) { setError('Passwords do not match'); return }
    setSaving(true)
    const res = await changePassword(current, next)
    setSaving(false)
    if (!res.ok) { setError(res.error ?? 'Failed to change password'); return }
    onToast('Password changed successfully', 'success')
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3><Icon name="settings" size={18} /> Change Password</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-field">
            <label className="form-label">Current Password</label>
            <input type="password" className="form-input" value={current}
              onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </div>
          <div className="form-field">
            <label className="form-label">New Password</label>
            <input type="password" className="form-input" value={next}
              onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Confirm New Password</label>
            <input type="password" className="form-input" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          {error && <p style={{ color: 'var(--danger)', margin: 0, fontSize: 13 }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  )
}
