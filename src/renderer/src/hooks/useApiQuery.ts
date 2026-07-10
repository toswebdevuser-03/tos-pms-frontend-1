/**
 * useApiQuery — Core TanStack Query hooks for projects and statuses.
 *
 * Phase 3: Uses queryKeyFactory for all query keys (single source of truth).
 * Additional domain hooks live in their own files (useMembers, useProjectMembers, etc.)
 */
import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'

type ApiResp<T> = { ok: boolean; data: T; error?: string }

function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error((res as any).error ?? 'API request failed')
  return res.data
}

export function useProjects(options?: Partial<UseQueryOptions<any[], unknown, any[], readonly unknown[]>>) {
  return useQuery<any[], unknown, any[], readonly unknown[]>({
    queryKey: queryKeyFactory.projects.all(),
    queryFn: async () => {
      const res = await window.api.projects.getAll()
      return unwrap(res as any) as any[]
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...(options ?? {}),
  })
}

export function useStatuses(options?: Partial<UseQueryOptions<any[], unknown, any[], readonly unknown[]>>) {
  return useQuery<any[], unknown, any[], readonly unknown[]>({
    queryKey: queryKeyFactory.statuses.all(),
    queryFn: async () => {
      const res = await window.api.projects.statuses()
      return unwrap(res as any) as any[]
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...(options ?? {}),
  })
}
