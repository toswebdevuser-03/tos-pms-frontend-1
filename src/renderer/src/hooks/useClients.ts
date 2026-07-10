import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'
import { Client } from '../types'

type ApiResp<T> = { ok: boolean; data: T; error?: string }
function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error((res as any).error ?? 'API request failed')
  return res.data
}

const DEFAULT_STALE = 5 * 60 * 1000
const DEFAULT_GC = 30 * 60 * 1000

export function useClients() {
  return useQuery<Client[]>({
    queryKey: queryKeyFactory.clients.all(),
    queryFn: async () => {
      const res = await window.api.clients.list() as ApiResp<Client[]>
      return unwrap(res)
    },
    staleTime: DEFAULT_STALE,
    gcTime: DEFAULT_GC,
    placeholderData: (prev) => prev,
  })
}

export function useCreateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { name: string; company?: string }) => window.api.clients.create(d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeyFactory.clients.all() })
    },
  })
}

export function useUpdateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { id: number; name: string; company?: string }) =>
      window.api.clients.update(d.id, { name: d.name, company: d.company }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeyFactory.clients.all() })
    },
  })
}

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => window.api.clients.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeyFactory.clients.all() })
    },
  })
}

