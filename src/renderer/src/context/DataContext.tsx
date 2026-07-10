/**
 * DataContext — Shared cross-project data layer.
 *
 * Phase 3: Internally backed by TanStack Query hooks. The public API
 * (`useData()` and `DataProvider`) is UNCHANGED — all 22+ consumers continue
 * to call `useData().tasksByProject(id)`, `useData().timesheetsByProject(id)`, etc.
 *
 * What changed internally:
 * - `useState` + `useCallback` fetch pattern → TanStack Query hooks
 * - WS subscription for data invalidation REMOVED (centralized in WebsocketQueryInvalidator)
 * - Individual `refresh*` methods now delegate to `queryClient.invalidateQueries`
 * - `loading` reflects the loading state of the underlying TanStack Query hooks
 *
 * Cache deduplication: projects and statuses fetched in DataContext share the same
 * TanStack Query cache keys as App.tsx — only ONE network request per key, served
 * from cache to all consumers.
 */
import { createContext, useContext, useMemo, useCallback, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Project, ProjectStatus } from '../types'
import { useProjects, useStatuses } from '../hooks/useApiQuery'
import { useAllTasks } from '../hooks/useTasks'
import { useAllTimesheets } from '../hooks/useTimesheets'
import { useAllQc } from '../hooks/useQc'
import { useAllRfis } from '../hooks/useRfis'
import { useProjectMembers } from '../hooks/useProjectMembers'
import { queryKeyFactory } from '../hooks/queryKeyFactory'

type Row = Record<string, unknown>
interface ProjectMemberLink { id: number; project_id: number; member_id: number }

interface DataValue {
  projects: Project[]
  statuses: ProjectStatus[]
  statusMap: Record<number, string>
  tasks: Row[]
  timesheets: Row[]
  qc: Row[]
  rfis: Row[]
  projectMembers: ProjectMemberLink[]
  loading: boolean
  refreshProjects: () => Promise<void>
  refreshStatuses: () => Promise<void>
  refreshTasks: () => Promise<void>
  refreshTimesheets: () => Promise<void>
  refreshQc: () => Promise<void>
  refreshRfis: () => Promise<void>
  refreshProjectMembers: () => Promise<void>
  refreshAll: () => Promise<void>
  tasksByProject: (projectId: number) => Row[]
  timesheetsByProject: (projectId: number) => Row[]
  qcByProject: (projectId: number) => Row[]
  rfisByProject: (projectId: number) => Row[]
  memberIdsForProject: (projectId: number) => number[]
}

const DataContext = createContext<DataValue | null>(null)

export function useData(): DataValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}

export function DataProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // ── TanStack Query hooks (shared cache with App.tsx — no duplicate fetches) ──
  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const { data: statusesRaw = [], isLoading: statusesLoading } = useStatuses()
  const { data: tasks = [], isLoading: tasksLoading } = useAllTasks()
  const { data: timesheets = [], isLoading: timesheetsLoading } = useAllTimesheets()
  const { data: qc = [], isLoading: qcLoading } = useAllQc()
  const { data: rfis = [], isLoading: rfisLoading } = useAllRfis()
  const { data: projectMembers = [], isLoading: pmLoading } = useProjectMembers()

  const loading = projectsLoading || statusesLoading || tasksLoading || timesheetsLoading || qcLoading || rfisLoading || pmLoading

  // ── Cache invalidation helpers (public API compatibility) ────────────────────
  const refreshProjects = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeyFactory.projects.all() })
  }, [queryClient])

  const refreshStatuses = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeyFactory.statuses.all() })
  }, [queryClient])

  const refreshTasks = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeyFactory.tasks.all() })
  }, [queryClient])

  const refreshTimesheets = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeyFactory.timesheets.all() })
  }, [queryClient])

  const refreshQc = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeyFactory.qc.all() })
  }, [queryClient])

  const refreshRfis = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeyFactory.rfis.all() })
  }, [queryClient])

  const refreshProjectMembers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeyFactory.projectMembers.all() })
  }, [queryClient])

  const refreshAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.projects.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.statuses.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.tasks.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.timesheets.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.qc.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.rfis.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.projectMembers.all() }),
    ])
  }, [queryClient])

  // ── Derived maps (unchanged from original) ──────────────────────────────────
  const statuses = statusesRaw as ProjectStatus[]

  const statusMap = useMemo(() => {
    const m: Record<number, string> = {}
    statuses.forEach((s) => { if (s.overall) m[s.project_id] = s.overall })
    return m
  }, [statuses])

  const tasksMap = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const t of tasks) {
      const pid = Number(t.project_id)
      const arr = m.get(pid)
      if (arr) arr.push(t); else m.set(pid, [t])
    }
    return m
  }, [tasks])

  const timesheetsMap = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const t of timesheets) {
      const pid = Number(t.project_id)
      const arr = m.get(pid)
      if (arr) arr.push(t); else m.set(pid, [t])
    }
    return m
  }, [timesheets])

  const qcMap = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const q of qc) {
      const pid = Number(q.project_id)
      const arr = m.get(pid)
      if (arr) arr.push(q); else m.set(pid, [q])
    }
    return m
  }, [qc])

  const rfisMap = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (const r of rfis) {
      const pid = Number(r.project_id)
      const arr = m.get(pid)
      if (arr) arr.push(r); else m.set(pid, [r])
    }
    return m
  }, [rfis])

  const memberIdsMap = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const l of projectMembers) {
      const arr = m.get(l.project_id)
      if (arr) arr.push(l.member_id); else m.set(l.project_id, [l.member_id])
    }
    return m
  }, [projectMembers])

  const tasksByProject = useCallback((pid: number) => tasksMap.get(pid) ?? [], [tasksMap])
  const timesheetsByProject = useCallback((pid: number) => timesheetsMap.get(pid) ?? [], [timesheetsMap])
  const qcByProject = useCallback((pid: number) => qcMap.get(pid) ?? [], [qcMap])
  const rfisByProject = useCallback((pid: number) => rfisMap.get(pid) ?? [], [rfisMap])
  const memberIdsForProject = useCallback((pid: number) => memberIdsMap.get(pid) ?? [], [memberIdsMap])

  const value: DataValue = useMemo(() => ({
    projects: projects as Project[],
    statuses,
    statusMap,
    tasks,
    timesheets,
    qc,
    rfis,
    projectMembers,
    loading,
    refreshProjects,
    refreshStatuses,
    refreshTasks,
    refreshTimesheets,
    refreshQc,
    refreshRfis,
    refreshProjectMembers,
    refreshAll,
    tasksByProject,
    timesheetsByProject,
    qcByProject,
    rfisByProject,
    memberIdsForProject
  }), [
    projects,
    statuses,
    statusMap,
    tasks,
    timesheets,
    qc,
    rfis,
    projectMembers,
    loading,
    refreshProjects,
    refreshStatuses,
    refreshTasks,
    refreshTimesheets,
    refreshQc,
    refreshRfis,
    refreshProjectMembers,
    refreshAll,
    tasksByProject,
    timesheetsByProject,
    qcByProject,
    rfisByProject,
    memberIdsForProject
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
