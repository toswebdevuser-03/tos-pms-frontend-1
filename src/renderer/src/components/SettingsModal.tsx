import { useState } from 'react'
import { useApp } from '../context/AppContext'
import Icon from './Icon'
import ConfirmDialog from './ConfirmDialog'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}

export default function SettingsModal({ onClose, onToast }: Props) {
  useEscapeKey(onClose)
  const { settings, refreshSettings } = useApp()
  const smtp = settings?.smtp
  const [host, setHost] = useState(smtp?.host ?? '')
  const [port, setPort] = useState(String(smtp?.port ?? 587))
  const [secure, setSecure] = useState(smtp?.secure ?? false)
  const [user, setUser] = useState(smtp?.user ?? '')
  const [pass, setPass] = useState(smtp?.pass ?? '')
  const [from, setFrom] = useState(smtp?.from ?? '')
  const [testing, setTesting] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)

  // Automatic digest config
  const dg = (settings as { digest?: { enabled?: boolean; frequency?: string; dayOfWeek?: number; hour?: number; recipients?: string[] } } | undefined)?.digest
  const [digestEnabled, setDigestEnabled] = useState(dg?.enabled ?? false)
  const [frequency, setFrequency] = useState<string>(dg?.frequency ?? 'weekly')
  const [dayOfWeek, setDayOfWeek] = useState(dg?.dayOfWeek ?? 1)
  const [hour, setHour] = useState(dg?.hour ?? 8)
  const [recipients, setRecipients] = useState((dg?.recipients ?? []).join(', '))

  // Product analytics (Amplitude) — optional; blank disables tracking entirely.
  const [amplitudeKey, setAmplitudeKey] = useState(settings?.analytics?.amplitude_key ?? '')

  const save = async () => {
    const recipientList = recipients.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    await window.api.settings.update({
      smtp: { host, port: parseInt(port) || 587, secure, user, pass, from },
      digest: { enabled: digestEnabled, frequency, dayOfWeek, hour, recipients: recipientList },
      analytics: { amplitude_key: amplitudeKey.trim() }
    })
    await refreshSettings()
    onToast('Settings saved')
  }

  const test = async () => {
    setTesting(true)
    await save()
    const res = await window.api.email.test()
    setTesting(false)
    if (res.ok) onToast('SMTP connection verified ✓')
    else onToast(res.error ?? 'SMTP test failed', 'error')
  }

  const backupNow = async () => {
    const res = await window.api.backup.create()
    if (res.ok && res.data?.filePath) onToast('Backup saved ✓')
    else if (res.ok) onToast('Backup cancelled')
    else onToast(res.error ?? 'Backup failed', 'error')
  }
  const restore = async () => {
    const res = await window.api.backup.restore()
    if (res.ok && res.data?.restored) onToast('Restored — reloading…')
    else if (res.ok) onToast('Restore cancelled')
    else onToast(res.error ?? 'Restore failed', 'error')
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3><Icon name="settings" size={18} /> Settings</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="attach-hint">
            Used to email reminders &amp; digests to members. <b>Outlook / Microsoft&nbsp;365:</b> host
            <code> smtp.office365.com</code>, port <code>587</code>, Secure <b>No</b> (STARTTLS), username = your
            mailbox, password = an <b>app password</b> (your IT admin must have SMTP AUTH enabled).
            <b> Gmail:</b> host <code>smtp.gmail.com</code> port <code>465</code> (secure) with an App Password.
          </p>
          <div className="field"><label>SMTP Host</label>
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" /></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ flex: 1 }}><label>Port</label>
              <input value={port} onChange={(e) => setPort(e.target.value)} /></div>
            <div className="field" style={{ flex: 1, justifyContent: 'flex-end' }}>
              <label>Secure (SSL)</label>
              <select value={secure ? 'yes' : 'no'} onChange={(e) => setSecure(e.target.value === 'yes')}>
                <option value="no">No (STARTTLS / 587)</option>
                <option value="yes">Yes (SSL / 465)</option>
              </select>
            </div>
          </div>
          <div className="field"><label>Username</label>
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="you@company.com" /></div>
          <div className="field"><label>Password / App Password</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder={(smtp as { hasPass?: boolean } | undefined)?.hasPass ? '•••••••• (leave blank to keep current)' : 'app password'}
            /></div>
          <div className="field"><label>From Address</label>
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="TOS Tracker <you@company.com>" /></div>

          <div className="settings-section">
            <h4>Automatic digest</h4>
            <p className="attach-hint">Emails the weekly project digest (portfolio status + at-risk projects) on a schedule. Needs the SMTP settings above to be working.</p>
            <label className="ms-option" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={digestEnabled} onChange={(e) => setDigestEnabled(e.target.checked)} /> Send automatically
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Frequency</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                </select></div>
              {frequency === 'weekly' && (
                <div className="field" style={{ flex: 1 }}><label>Day</label>
                  <select value={dayOfWeek} onChange={(e) => setDayOfWeek(parseInt(e.target.value))}>
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select></div>
              )}
              <div className="field" style={{ flex: 1 }}><label>Hour (0–23)</label>
                <input type="number" min="0" max="23" value={hour} onChange={(e) => setHour(parseInt(e.target.value) || 0)} /></div>
            </div>
            <div className="field"><label>Recipients (comma or line separated)</label>
              <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="manager@company.com, lead@company.com" rows={2} /></div>
          </div>

          <div className="settings-section">
            <h4>Product analytics (Amplitude)</h4>
            <p className="attach-hint">
              Optional. Tracks anonymous usage (sign-ins, feature opens, project opens, time logging — member id + role only,
              no names/emails) to an Amplitude project. Get the API key from Amplitude → Settings → Projects → your project.
              Leave blank to disable.
            </p>
            <div className="field"><label>Amplitude API Key</label>
              <input value={amplitudeKey} onChange={(e) => setAmplitudeKey(e.target.value)} placeholder="blank = analytics off" /></div>
          </div>

          <div className="settings-section">
            <h4>Data &amp; Backup</h4>
            <p className="attach-hint">Save a full snapshot of all data to a file, or restore from one. Restore replaces current data (a safety copy is kept automatically).</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={backupNow}><Icon name="download" size={15} /> Backup now</button>
              <button className="btn btn-secondary" onClick={() => setConfirmRestore(true)}><Icon name="restore" size={15} /> Restore from backup…</button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-secondary" onClick={test} disabled={testing}>{testing ? 'Testing…' : 'Save & Test'}</button>
          <button className="btn btn-primary" onClick={async () => { await save(); onClose() }}>Save</button>
        </div>
      </div>
      {confirmRestore && (
        <ConfirmDialog
          title="Restore from backup"
          message="Restore will REPLACE all current data with the contents of the backup file. A safety copy of the current data is kept. Continue?"
          confirmLabel="Restore"
          onConfirm={() => { setConfirmRestore(false); restore() }}
          onCancel={() => setConfirmRestore(false)}
        />
      )}
    </div>
  )
}
