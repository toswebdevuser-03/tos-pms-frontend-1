import { useState } from 'react'
import { useApp } from './context/AppContext'
import Icon from './components/Icon'

/**
 * Sign-in screen (remote/multi-user mode only). Handles first-login password
 * reset: if the server says mustReset, the user must set a new password before
 * entering the app.
 */
export default function Login() {
  const { login, changePassword, refreshAuth } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // reset step
  const [resetMode, setResetMode] = useState(false)
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')

  const submitLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(''); setBusy(true)
    const res = await login(email.trim(), password)
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Login failed'); return }
    // Password reset on first login is now hidden - users go directly to app
    // if (res.mustReset) { setResetMode(true); return }
    await refreshAuth()
  }

  const submitReset = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    if (newPass.length < 6) { setError('New password must be at least 6 characters'); return }
    if (newPass !== confirmPass) { setError('Passwords do not match'); return }
    setBusy(true)
    const res = await changePassword(password, newPass)
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Could not change password'); return }
    await refreshAuth()
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand"><Icon name="grid" size={18} className="brand-mark" /> TOS Tracker</div>

        {!resetMode ? (
          <form onSubmit={submitLogin}>
            <h2>Sign in</h2>
            <p className="login-sub">Use your work email and password.</p>
            <label>Email</label>
            <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@teslaoutsourcingservices.com" required />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <div className="login-error">{error}</div>}
            <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitReset}>
            <h2>Set a new password</h2>
            <p className="login-sub">This is your first sign-in. Choose a new password to continue.</p>
            <label>New password</label>
            <input type="password" autoFocus value={newPass} onChange={(e) => setNewPass(e.target.value)} required />
            <label>Confirm new password</label>
            <input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} required />
            {error && <div className="login-error">{error}</div>}
            <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Set password & continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
