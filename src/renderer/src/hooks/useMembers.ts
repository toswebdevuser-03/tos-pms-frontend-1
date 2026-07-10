/**
 * useMembers — TanStack Query hook for all members.
 *
 * Used by AppContext (for role/identity) and any component that needs
 * the members list. Single network request; served from cache on re-renders.
 * Cache invalidated by WebsocketQueryInvalidator on 'member' WS events.
 */
import { useQuery } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'
import { Member } from '../types'

type ApiResp<T> = { ok: boolean; data: T; error?: string }

function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error((res as any).error ?? 'API request failed')
  return res.data
}

export function useMembers() {
  return useQuery<Member[]>({
    queryKey: queryKeyFactory.members.all(),
    queryFn: async () => {
      const res = await window.api.members.getAll()
      return unwrap(res as any) as Member[]
    },
    staleTime: 5 * 60 * 1000,  // 5 min
    gcTime: 10 * 60 * 1000,    // 10 min
  })
}
