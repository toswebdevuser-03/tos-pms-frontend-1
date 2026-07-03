import { useState, useEffect, useMemo } from 'react'
import CrudTab from '../components/CrudTab'
import { Column } from '../components/DataTable'
import { FieldDef } from '../components/FormModal'
import { Member } from '../types'
import { useApp } from '../context/AppContext'
import { roleRank } from '../roles'
import { num } from '../lib/hours'
import { memberNameMap } from '../lib/people'

interface Props {
  projectId: number
  projectName: string
  onToast: (msg: string, type?: 'success' | 'error') => void
}

const RATING = [
  { label: '5 · Excellent', value: '5' }, { label: '4 · Good', value: '4' },
  { label: '3 · Average', value: '3' }, { label: '2 · Below par', value: '2' }, { label: '1 · Poor', value: '1' }
]
const CRITERIA = ['quality', 'timeliness', 'communication', 'ownership'] as const
export function overallOf(r: Record<string, unknown>): number {
  const vals = CRITERIA.map((c) => num(r[c])).filter((n) => n > 0)
  return vals.length ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10 : 0
}

export default function FeedbackTab({ projectId, projectName, onToast }: Props) {
  const { isAdmin, currentMember, members: allMembers } = useApp()
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    window.api.projectMembers.get(projectId).then((res) => { if (res.ok) setMembers(res.data as Member[]) })
  }, [projectId])

  const nameById = useMemo(() => memberNameMap(allMembers), [allMembers])
  // Higher roles give feedback ABOUT lower roles, and can only SEE feedback about
  // lower roles. Rank of a member id (from the global directory).
  const myRank = roleRank(currentMember?.role)
  const rankOfMember = (id: unknown): number => roleRank(allMembers.find((m) => String(m.id) === String(id))?.role)
  const lowerMembers = useMemo(() => members.filter((m) => roleRank(m.role) < myRank), [members, myRank])

  const ratingCell = (v: unknown): React.ReactNode => {
    const n = num(v)
    return n ? <span className="rating-val">{n}</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>
  }

  const columns: Column[] = [
    { key: 'member_id', label: 'Team Member', width: '150px', render: (v) => (v ? nameById.get(String(v)) || '—' : '—') },
    { key: 'overall', label: 'Overall', width: '80px', render: (_v, r) => { const o = overallOf(r); return o ? <strong style={{ color: 'var(--accent)' }}>{o} ★</strong> : '—' } },
    { key: 'quality', label: 'Quality', width: '70px', render: ratingCell },
    { key: 'timeliness', label: 'Timeliness', width: '85px', render: ratingCell },
    { key: 'communication', label: 'Comm.', width: '70px', render: ratingCell },
    { key: 'ownership', label: 'Ownership', width: '85px', render: ratingCell },
    { key: 'comment', label: 'Comment' },
    { key: 'rater_id', label: 'By', width: '120px', render: (v) => (v ? nameById.get(String(v)) || '—' : '—') }
  ]

  const fields: FieldDef[] = [
    { key: 'member_id', label: 'Team Member (lower role)', type: 'select', required: true, optionValues: lowerMembers.map((m) => ({ label: m.name, value: String(m.id) })) },
    { key: 'quality', label: 'Quality of work', type: 'select', optionValues: RATING },
    { key: 'timeliness', label: 'Timeliness', type: 'select', optionValues: RATING },
    { key: 'communication', label: 'Communication', type: 'select', optionValues: RATING },
    { key: 'ownership', label: 'Ownership', type: 'select', optionValues: RATING },
    { key: 'comment', label: 'Comment', type: 'textarea' }
  ]

  return (
    <CrudTab
      type="feedback" singular="Feedback" projectId={projectId} projectName={projectName}
      columns={columns} fields={fields} onToast={onToast}
      addAllowed={lowerMembers.length > 0}
      computeExtra={() => ({ rater_id: currentMember?.id ?? '' })}
      // Visibility: only feedback ABOUT members ranked below the viewer.
      rowFilter={(r) => rankOfMember(r.member_id) < myRank}
      canEditRow={(r) => isAdmin && rankOfMember(r.member_id) < myRank}
      canDeleteRow={(r) => isAdmin && rankOfMember(r.member_id) < myRank}
      emptyHint="No feedback visible. You can give and see feedback only for members in roles below yours."
    />
  )
}
