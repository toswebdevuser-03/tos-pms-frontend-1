import { useState } from 'react'
import { useApp } from './context/AppContext'
import Icon from './components/Icon'

/**
 * Sign-in screen (remote/multi-user mode only). Handles first-login password
 * reset: if the server says mustReset, the user must set a new password before
 * entering the app.
 */
export default function Login() {
  const { login, refreshAuth } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand"><Icon name="grid" size={18} className="brand-mark" /> TOS Tracker</div>

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
      </div>
    </div>
  )
}
