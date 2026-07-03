import { useState } from 'react'
import AttachmentManager from './AttachmentManager'
import Icon from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'

export interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'date' | 'select' | 'textarea' | 'number' | 'path' | 'multiselect'
  options?: string[]
  required?: boolean
  adminOnly?: boolean
  optionValues?: { label: string; value: string }[]
}

interface Props {
  title: string
  fields: FieldDef[]
  initial?: Record<string, unknown>
  onSubmit: (data: Record<string, string>) => void
  onClose: () => void
  isAdmin?: boolean
  attachmentsEntity?: { type: string; id: number | null }
  onToast?: (msg: string, type?: 'success' | 'error') => void
}

export default function FormModal({
  title, fields, initial, onSubmit, onClose, isAdmin = true, attachmentsEntity, onToast
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    fields.forEach((f) => {
      const def = f.type === 'multiselect' ? '' : f.optionValues ? f.optionValues[0].value : f.options ? f.options[0] : ''
      init[f.key] = initial ? String(initial[f.key] ?? def) : def
    })
    return init
  })

  useEscapeKey(onClose)

  const set = (key: string, val: string) => setValues((v) => ({ ...v, [key]: val }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(values)
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {fields.map((f) => {
              const disabled = f.adminOnly && !isAdmin
              return (
                <div className="field" key={f.key}>
                  <label>
                    {f.label}{f.required && ' *'}
                    {f.adminOnly && <span className="admin-tag">admin</span>}
                  </label>
                  {f.type === 'path' ? (
                    <div className="path-field">
                      <input
                        type="text"
                        value={values[f.key]}
                        onChange={(e) => set(f.key, e.target.value)}
                        placeholder="Paste the full path, e.g. \\server\share\Project"
                        disabled={disabled}
                      />
                      <button
                        type="button" className="btn btn-secondary btn-sm"
                        disabled={disabled || !values[f.key]}
                        title="Copy this path to the clipboard"
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(values[f.key]); onToast?.('Path copied') }
                          catch { onToast?.('Could not copy', 'error') }
                        }}
                      ><Icon name="clipboard" size={14} /> Copy</button>
                    </div>
                  ) : f.type === 'select' ? (
                    <select value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} disabled={disabled}>
                      {f.optionValues
                        ? f.optionValues.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                        : f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'multiselect' ? (
                    <div className="multiselect">
                      {(() => {
                        // Support either plain string options or {label,value} pairs (stores values).
                        const opts = f.optionValues ?? (f.options ?? []).map((o) => ({ label: o, value: o }))
                        const allVals = opts.map((o) => o.value)
                        const sel = values[f.key] ? values[f.key].split(',').map((s) => s.trim()).filter(Boolean) : []
                        return opts.map((o) => (
                          <label key={o.value} className="ms-option">
                            <input
                              type="checkbox"
                              checked={sel.includes(o.value)}
                              disabled={disabled}
                              onChange={(e) => {
                                const next = e.target.checked ? [...sel, o.value] : sel.filter((x) => x !== o.value)
                                set(f.key, allVals.filter((x) => next.includes(x)).join(', '))
                              }}
                            />
                            {o.label}
                          </label>
                        ))
                      })()}
                    </div>
                  ) : f.type === 'textarea' ? (
                    <textarea value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} disabled={disabled} />
                  ) : (
                    <input
                      type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                      step={f.type === 'number' ? '0.5' : undefined}
                      min={f.type === 'number' ? '0' : undefined}
                      value={values[f.key]}
                      onChange={(e) => set(f.key, e.target.value)}
                      required={f.required}
                      disabled={disabled}
                    />
                  )}
                </div>
              )
            })}

            {attachmentsEntity && (
              <AttachmentManager
                entityType={attachmentsEntity.type}
                entityId={attachmentsEntity.id}
                onToast={onToast}
              />
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
