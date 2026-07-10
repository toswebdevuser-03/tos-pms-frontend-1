/**
 * useAllTasks — TanStack Query hook for all tasks across all projects.
 *
 * Used by DataContext to serve `tasksByProject()`. The DataContext public
 * API is unchanged — consumers call `useData().tasksByProject(id)` as before.
 * Cache invalidated by WebsocketQueryInvalidator on 'item' (task) WS events.
 */
import { useQuery } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'

type ApiResp<T> = { ok: boolean; data: T; error?: string }
type Row = Record<string, unknown>

function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error((res as any).error ?? 'API request failed')
  return res.data
}

export function useAllTasks() {
  return useQuery<Row[]>({
    queryKey: queryKeyFactory.tasks.all(),
    queryFn: async () => {
      const res = await window.api.all.tasks()
      return unwrap(res as any) as Row[]
    },
    staleTime: 2 * 60 * 1000,  // 2 min — tasks more volatile than members
    gcTime: 10 * 60 * 1000,
  })
}
