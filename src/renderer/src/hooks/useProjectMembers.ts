/**
 * useProjectMembers — TanStack Query hook for all project<->member assignments.
 *
 * Used by App.tsx to derive `myAssignments` (which projects the current user
 * is assigned to, for project visibility scoping).
 * Cache invalidated by WebsocketQueryInvalidator on 'projectMember' WS events.
 */
import { useQuery } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'

type ApiResp<T> = { ok: boolean; data: T; error?: string }

function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error((res as any).error ?? 'API request failed')
  return res.data
}

export interface ProjectMemberLink {
  id: number
  project_id: number
  member_id: number
}

export function useProjectMembers() {
  return useQuery<ProjectMemberLink[]>({
    queryKey: queryKeyFactory.projectMembers.all(),
    queryFn: async () => {
      const res = await window.api.projectMembers.all()
      return unwrap(res as any) as ProjectMemberLink[]
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

// Project-scoped assignments: avoids extra uncached fetches.
export function useProjectMembersByProject(projectId: number) {
  return useQuery<ProjectMemberLink[]>({
    queryKey: queryKeyFactory.projectMembers.byProject(projectId),
    queryFn: async () => {
      const res = await window.api.projectMembers.get(projectId)
      return unwrap(res as any) as ProjectMemberLink[]
    },
    enabled: !!projectId,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
}

