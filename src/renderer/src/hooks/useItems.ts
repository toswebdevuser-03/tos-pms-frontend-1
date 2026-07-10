import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'

type Row = Record<string, unknown>
type ApiResp<T> = { ok: boolean; data: T; error?: string }
const unwrap = <T,>(r: ApiResp<T>): T => {
  if (!r.ok) throw new Error(r.error ?? 'API request failed')
  return r.data
}

export function useItems(type: string, projectId: number) {
  return useQuery<Row[]>({
    queryKey: queryKeyFactory.items.byProject(type, projectId),
    queryFn: async () => {
      const res = await window.api.items.getByProject(projectId, type) as ApiResp<Row[]>
      return unwrap(res)
    },
    enabled: !!projectId,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
}

export function useItemsByProjects(type: string, projectIds: number[]) {
  const stableIds = [...new Set(projectIds.map(Number).filter(Boolean))].sort((a, b) => a - b)
  return useQuery<Record<number, Row[]>>({
    queryKey: [...queryKeyFactory.items.byType(type), stableIds.join(',')],
    queryFn: async () => {
      const entries = await Promise.all(stableIds.map(async (projectId) => {
        const res = await window.api.items.getByProject(projectId, type) as ApiResp<Row[]>
        return [projectId, unwrap(res)] as const
      }))
      return Object.fromEntries(entries)
    },
    enabled: stableIds.length > 0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
}

export function useCreateItem(type: string, projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Row) => window.api.items.create(type, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyFactory.items.byProject(type, projectId) })
    },
  })
}

export function useUpdateItem(type: string, projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Row) => window.api.items.update(type, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyFactory.items.byProject(type, projectId) })
    },
  })
}

export function useDeleteItem(type: string, projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => window.api.items.delete(type, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyFactory.items.byProject(type, projectId) })
    },
  })
}

