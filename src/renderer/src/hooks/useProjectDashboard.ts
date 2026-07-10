import { useQuery } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'

type Row = Record<string, unknown>
type DashboardData = Record<string, Row[]>
type ApiResp<T> = { ok: boolean; data: T; error?: string }
const unwrap = <T,>(r: ApiResp<T>): T => {
  if (!r.ok) throw new Error(r.error ?? 'API request failed')
  return r.data
}

// One request for everything DashboardTab needs, replacing 10x useItems() calls.
export function useProjectDashboard(projectId: number) {
  return useQuery<DashboardData>({
    queryKey: queryKeyFactory.projectDashboard.detail(projectId),
    queryFn: async () => {
      const res = await window.api.projects.dashboard(projectId) as ApiResp<DashboardData>
      return unwrap(res)
    },
    enabled: !!projectId,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  })
}