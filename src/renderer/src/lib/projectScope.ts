import { Project } from '../types'
import { roleRank, RANK_COMPANY_ADMIN, RANK_MANAGER, RANK_LEAD } from '../roles'
import { splitDisciplines } from '../disciplines'

export interface ScopeWho {
  role?: string | null
  discipline?: string | null
  name?: string | null
}

// Which projects a given member can see — mirrors App.tsx's `scopedProjects`:
//   Company Admin → every project
//   Manager       → projects in their discipline(s), plus any assigned to them
//   Team Lead     → projects they created or are assigned to
//   others        → projects assigned to them
// Used both for the signed-in user and for the "view a lower employee's dashboard"
// feature, so a manager sees exactly what that employee would see.
export function scopeProjectsFor(who: ScopeWho, projects: Project[], assignedIds: Set<number>): Project[] {
  const rank = roleRank(who.role)
  if (rank >= RANK_COMPANY_ADMIN) return projects
  if (rank >= RANK_MANAGER) {
    const mine = splitDisciplines(who.discipline || '')
    return projects.filter(
      (p) => assignedIds.has(p.id) || (mine.length > 0 && splitDisciplines(p.discipline || '').some((d) => mine.includes(d)))
    )
  }
  if (rank >= RANK_LEAD) {
    return projects.filter((p) => assignedIds.has(p.id) || (!!who.name && p.created_by === who.name))
  }
  return projects.filter((p) => assignedIds.has(p.id))
}
