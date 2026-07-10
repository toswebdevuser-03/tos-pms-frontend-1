/**
 * useReminderCount — TanStack Query hook for pending reminder count.
 *
 * Fetches all reminders, filters out 'upcoming' ones (not yet due), and
 * returns just the count of active/overdue reminders shown in the topbar badge.
 * Cache invalidated by WebsocketQueryInvalidator on 'project' or 'item' WS events
 * (reminders are derived from item dates, not a separate entity).
 */
import { useQuery } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'

type ApiResp<T> = { ok: boolean; data: T; error?: string }

function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error((res as any).error ?? 'API request failed')
  return res.data
}

export function useReminderCount() {
  return useQuery<number>({
    queryKey: queryKeyFactory.reminders.all(),
    queryFn: async () => {
      const res = await window.api.reminders.get()
      const data = unwrap(res as any) as { severity: string }[]
      return data.filter((r) => r.severity !== 'upcoming').length
    },
    staleTime: 60 * 1000,      // 1 min — more volatile than projects
    gcTime: 5 * 60 * 1000,
  })
}
