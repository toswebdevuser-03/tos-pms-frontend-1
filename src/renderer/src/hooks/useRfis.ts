import { useQuery } from '@tanstack/react-query'
import { queryKeyFactory } from './queryKeyFactory'

type ApiResp<T> = { ok: boolean; data: T; error?: string }
type Row = Record<string, unknown>

function unwrap<T>(res: ApiResp<T>): T {
  if (!res.ok) throw new Error((res as any).error ?? 'API request failed')
  return res.data
}

export function useAllRfis() {
  return useQuery<Row[]>({
    queryKey: queryKeyFactory.rfis.all(),
    queryFn: async () => {
      const res = await window.api.all.rfi()
      return unwrap(res as any) as Row[]
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
