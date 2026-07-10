import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'
import { Quote } from '../types'

type ApiResp<T> = { ok: boolean; data: T; error?: string }
function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error((res as any).error ?? 'API request failed')
  return res.data
}

const DEFAULT_STALE = 5 * 60 * 1000
const DEFAULT_GC = 30 * 60 * 1000

export function useQuotes() {
  return useQuery<Quote[]>({
    queryKey: queryKeyFactory.quotes.all(),
    queryFn: async () => {
      const res = await window.api.quotes.list() as ApiResp<Quote[]>
      return unwrap(res)
    },
    staleTime: DEFAULT_STALE,
    gcTime: DEFAULT_GC,
    placeholderData: (prev) => prev,
  })
}

export function useCreateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: Record<string, unknown>) => window.api.quotes.create(d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeyFactory.quotes.all() })
    },
  })
}

export function useUpdateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: number; data: Record<string, unknown> }) =>
      window.api.quotes.update(payload.id, payload.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeyFactory.quotes.all() })
    },
  })
}

export function useDeleteQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => window.api.quotes.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeyFactory.quotes.all() })
    },
  })
}

