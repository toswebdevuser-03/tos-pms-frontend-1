import { useState, useMemo, useCallback } from 'react'
import { Project } from '../types'
import Icon, { DisciplineIcon } from './Icon'

type GroupBy = 'discipline' | 'client' | 'status' | 'none'

interface Props {
  projects: Project[]
  statusMap: Record<number, string>
  selectedId: number | null
  onSelect: (id: number) => void
  searching: boolean
  unseenByProject?: Map<number, number> // unseen-update count per project, for the badges
}

const UNSET = '— Unassigned'

function groupKey(p: Project, by: GroupBy, statusMap: Record<number, string>): string {
  if (by === 'none') return 'All Projects'
  if (by === 'discipline') return p.discipline || UNSET
  if (by === 'client') return p.client || '— No client'
  return statusMap[p.id] || '— No status'
}

export default function ProjectTree({ projects, statusMap, selectedId, onSelect, searching, unseenByProject }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>(() => (localStorage.getItem('groupBy') as GroupBy) || 'discipline')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('collapsedGroups') || '[]')) } catch { return new Set() }
  })

  const changeGroupBy = (g: GroupBy): void => {
    setGroupBy(g)
    localStorage.setItem('groupBy', g)
  }

  const toggle = useCallback((name: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      localStorage.setItem('collapsedGroups', JSON.stringify([...next]))
      return next
    })
  }, [])

  const groups = useMemo(() => {
    const m = new Map<string, Project[]>()
    for (const p of projects) {
      const k = groupKey(p, groupBy, statusMap)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(p)
    }
    // sort groups alphabetically, placeholders (— …) last
    return [...m.entries()].sort((a, b) => {
      const aPlace = a[0].startsWith('—'), bPlace = b[0].startsWith('—')
      if (aPlace !== bPlace) return aPlace ? 1 : -1
      return a[0].localeCompare(b[0])
    })
  }, [projects, groupBy, statusMap])

  return (
    <div className="tree">
      <div className="tree-controls">
        <span>Group by</span>
        <select value={groupBy} onChange={(e) => changeGroupBy(e.target.value as GroupBy)}>
          <option value="discipline">Discipline</option>
          <option value="client">Client</option>
          <option value="status">Status</option>
          <option value="none">None (flat)</option>
        </select>
      </div>

      <div className="tree-body">
        {groups.map(([name, projs]) => {
          const isOpen = searching || !collapsed.has(name)
          const groupUnseen = unseenByProject ? projs.reduce((sum, p) => sum + (unseenByProject.get(p.id) ?? 0), 0) : 0
          return (
            <div className="tree-group" key={name}>
              <div className="tree-group-head" onClick={() => toggle(name)}>
                <span className={`tree-chevron${isOpen ? ' open' : ''}`}><Icon name="chevronRight" size={12} /></span>
                {groupBy === 'discipline' && name !== UNSET && <span className="proj-icon"><DisciplineIcon discipline={name} size={15} /></span>}
                {groupBy !== 'discipline' && <span className="proj-icon"><Icon name="folder" size={15} /></span>}
                <span className="tree-group-name" title={name}>{name}</span>
                <span className="tree-group-count">{projs.length}</span>
                {groupUnseen > 0 && <span className="reminder-pill" title={`${groupUnseen} unseen update${groupUnseen === 1 ? '' : 's'}`}>{groupUnseen}</span>}
              </div>
              {isOpen && (
                <div className="tree-children">
                  {projs.map((p) => {
                    const unseenN = unseenByProject?.get(p.id) ?? 0
                    return (
                      <div
                        key={p.id}
                        className={`project-item${selectedId === p.id ? ' active' : ''}`}
                        onClick={() => onSelect(p.id)}
                      >
                        <div className="proj-name">
                          <span className="proj-icon" title={p.discipline}><DisciplineIcon discipline={p.discipline} size={14} /></span>
                          <span className="proj-name-text">{p.name}</span>
                          {unseenN > 0 && <span className="reminder-pill" title={`${unseenN} unseen update${unseenN === 1 ? '' : 's'}`}>{unseenN}</span>}
                        </div>
                        <div className="proj-meta">
                          {[statusMap[p.id], p.client, p.location].filter(Boolean).join(' · ') || 'No details'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
