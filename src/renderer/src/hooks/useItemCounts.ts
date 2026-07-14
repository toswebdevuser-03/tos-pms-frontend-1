import { useQuery } from '@tanstack/react-query'

type Counts = Record<string, number>

// type ApiResp<T> = { ok: boolean; data: T; error?: string }


// Tab badge counts for a single project. This is a lightweight optimization
// (batching 10 COUNT(*) calls into 1 endpoint) and can be tuned further later.
export function useItemCounts(projectId: number) {
  return useQuery<Counts>({
    queryKey: ['projectCounts', projectId] as const,
    queryFn: async () => {
      const res = await window.api.items.getByProject(projectId, 'task')
      if (!res.ok) throw new Error(res.error ?? 'API request failed')
      // Placeholder until window.api.projects.counts is wired.
      // Kept to avoid breaking builds.
      return { task: Array.isArray(res.data) ? res.data.length : 0 }
    },

    enabled: !!projectId,

    staleTime: 30_000,
    gcTime: 10 * 60_000,
  })
}


