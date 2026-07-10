/**
 * useAllTimesheets — TanStack Query hook for all timesheets across all projects.
 *
 * Filters out pending (unapproved) entries — matches the existing DataContext
 * behavior where pending timesheets are excluded from shared state.
 * Cache invalidated by WebsocketQueryInvalidator on 'item' (timesheet) WS events.
 */
import { useQuery } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'

type ApiResp<T> = { ok: boolean; data: T; error?: string }
type Row = Record<string, unknown>

function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error((res as any).error ?? 'API request failed')
  return res.data
}

export function useAllTimesheets() {
  return useQuery<Row[]>({
    queryKey: queryKeyFactory.timesheets.all(),
    queryFn: async () => {
      const res = await window.api.all.timesheets()
      const data = unwrap(res as any) as Row[]
      // Exclude pending manual entries (IT/Discussion/catch-up awaiting approval)
      // — they must not reflect anywhere until approved.
      return data.filter((t) => !t.pending)
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
