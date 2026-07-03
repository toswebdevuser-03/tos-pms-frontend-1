import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { Skill, Member } from '../types'
import { roleLabel } from '../roles'
import Avatar from './Avatar'
import Icon from './Icon'
import { useFilters } from './FilterBar'
import { useEscapeKey } from '../lib/useEscapeKey'

const CATEGORIES = ['Software', 'Discipline', 'Documentation', 'Coordination', 'Management', 'Other']
const LEVELS: { value: number; label: string }[] = [
  { value: 1, label: '1 · Beginner' },
  { value: 2, label: '2 · Basic' },
  { value: 3, label: '3 · Intermediate' },
  { value: 4, label: '4 · Advanced' },
  { value: 5, label: '5 · Expert' }
]

interface Props {
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
  embedded?: boolean // rendered inside the Talent hub (body only, no modal chrome)
}

function levelDots(level: number): string {
  return '●'.repeat(Math.max(0, Math.min(5, level))) + '○'.repeat(5 - Math.max(0, Math.min(5, level)))
}

export default function SkillsModal({ onClose, onToast, embedded }: Props) {
  // Escape should only dismiss this as a standalone modal — when embedded in the
  // Talent hub, TalentModal itself owns the overlay and its own Escape handler.
  useEscapeKey(embedded ? () => {} : onClose)
  const { currentMember, members, isManager, refreshMembers } = useApp()
  const [tab, setTab] = useState<'my' | 'directory'>(currentMember ? 'my' : 'directory')
  const [rows, setRows] = useState<Skill[]>(() => (currentMember?.skills ?? []).map((s) => ({ ...s })))
  const [saving, setSaving] = useState(false)

  const update = (i: number, patch: Partial<Skill>): void =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  const addRow = (): void => setRows((r) => [...r, { skill: '', category: 'Software', level: 3, years: 0 }])
  const removeRow = (i: number): void => setRows((r) => r.filter((_, idx) => idx !== i))

  const save = async (): Promise<void> => {
    if (!currentMember) return
    const clean = rows.filter((r) => r.skill.trim()).map((r) => ({
      skill: r.skill.trim(), category: r.category || 'Other', level: Number(r.level) || 1, years: Number(r.years) || 0
    }))
    setSaving(true)
    const res = await window.api.members.updateSkills(currentMember.id, clean)
    setSaving(false)
    if (res.ok) { onToast('Skills saved'); refreshMembers() } else onToast(res.error ?? 'Could not save', 'error')
  }

  // Team Directory: one row per member, searchable over name / discipline / skill names.
  // A member can hold many skill categories, which FilterBar's exact-match selects can't
  // express ("any"), so the directory uses search only; category filtering lives on the
  // My Skills tab where each row has exactly one category.
  const dirRows = useMemo(() => members.map((m) => {
    const skills = (m.skills ?? []) as Skill[]
    return {
      m,
      skills,
      name: m.name,
      discipline: m.discipline ?? '',
      _skills: skills.map((s) => s.skill).join(' ')
    }
  }), [members])

  const { filtered: directory, bar: dirBar } = useFilters(dirRows as unknown as Record<string, unknown>[], {
    searchKeys: ['name', 'discipline', '_skills'],
    searchPlaceholder: 'Search people or skills…'
  })

  // My Skills: search + category over the editable rows the user is building.
  const myRowsWithIdx = rows.map((row, i) => ({ ...row, _idx: i })) as unknown as Record<string, unknown>[]
  const { filtered: myFiltered, bar: myBar } = useFilters(myRowsWithIdx, {
    searchKeys: ['skill'],
    searchPlaceholder: 'Search your skills…',
    selects: [{ key: 'category', label: 'Category', options: CATEGORIES }]
  })

  const body = (
    <>
          <div className="mytasks-tabs">
            <button className={`tab-btn${tab === 'my' ? ' active' : ''}`} onClick={() => setTab('my')}>My Skills</button>
            {isManager && <button className={`tab-btn${tab === 'directory' ? ' active' : ''}`} onClick={() => setTab('directory')}>Team Directory</button>}
          </div>

          {tab === 'my' ? (
            !currentMember ? (
              <div className="attach-hint">Select who you are with the “Acting as” selector (or sign in) to edit your skills.</div>
            ) : (
              <>
                <p className="login-sub" style={{ marginBottom: 12 }}>Tag your skills and proficiency so managers can staff the right projects.</p>
                {rows.length === 0 && <div className="attach-empty">No skills added yet. Click “+ Add skill”.</div>}
                {rows.length > 0 && myBar}
                {myFiltered.map((row) => {
                  const i = row._idx as number
                  return (
                    <div className="skill-row" key={i}>
                      <input placeholder="Skill (e.g. Revit)" value={row.skill as string} onChange={(e) => update(i, { skill: e.target.value })} />
                      <select value={row.category as string} onChange={(e) => update(i, { category: e.target.value })}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select value={row.level as number} onChange={(e) => update(i, { level: Number(e.target.value) })}>
                        {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                      <input type="number" min={0} step={0.5} placeholder="yrs" value={(row.years as number) ?? 0} onChange={(e) => update(i, { years: Number(e.target.value) })} style={{ width: 64 }} />
                      <button className="btn-icon danger" title="Remove" onClick={() => removeRow(i)}><Icon name="trash" size={16} /></button>
                    </div>
                  )
                })}
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add skill</button>
                  <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save skills'}</button>
                </div>
              </>
            )
          ) : (
            <>
              {dirBar}
              {(directory as unknown as { m: Member; skills: Skill[] }[]).map(({ m, skills }) => (
                <div className="skill-dir-card" key={m.id}>
                  <div className="skill-dir-head">
                    <Avatar name={m.name} size={28} />
                    <strong>{m.name}</strong>
                    <span className="role-chip">{roleLabel(m.role)}</span>
                    {m.discipline && <span className="org-tag org-tag-ho">{m.discipline}</span>}
                  </div>
                  {skills.length === 0 ? (
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>No skills listed.</span>
                  ) : (
                    <div className="skill-chips">
                      {skills.map((s, i) => (
                        <span className="skill-chip" key={i} title={`${s.category ?? ''} · ${s.years ?? 0} yrs`}>
                          {s.skill} <span className="skill-dots">{levelDots(s.level)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
    </>
  )

  if (embedded) return body

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 760 }}>
        <div className="modal-header">
          <h3><Icon name="brain" size={18} /> Skills</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">{body}</div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
