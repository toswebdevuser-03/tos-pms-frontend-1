import { useQuery } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'

type ApiResp<T> = { ok: boolean; data: T; error?: string }

type ProjectCounts = Record<string, number>

function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error(res.error ?? 'API request failed')
  return res.data
}

export function useProjectCounts(projectId: number) {
  return useQuery<ProjectCounts>({
    queryKey: queryKeyFactory.projectCounts.detail(projectId),
    queryFn: async () => {
      const res = await (window.api.projects as any).counts(projectId)

      return unwrap(res as any) as ProjectCounts
    },
    enabled: !!projectId,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  })
}

