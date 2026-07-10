/**
 * AppContext — Global auth state, role derivation, and identity management.
 *
 * Phase 3: Members are now fetched via TanStack Query (`useMembers` hook)
 * instead of useState+useCallback+useEffect. This means:
 * - Members are served from the shared query cache (no duplicate fetches)
 * - Cache is automatically invalidated by WebsocketQueryInvalidator on member WS events
 * - `refreshMembers` now delegates to queryClient.invalidateQueries
 *
 * Auth state (authMode, authUser, authChecked) remains as useState since it
 * is not data-fetching — it is session state managed by the auth flow.
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Member, Settings, AuthUser } from '../types'
import { roleRank, RANK_COMPANY_ADMIN, RANK_MANAGER, RANK_LEAD, RANK_PROJECT_LEAD } from '../roles'
import { useMembers } from '../hooks/useMembers'
import { queryKeyFactory } from '../hooks/queryKeyFactory'

interface AppContextValue {
  members: Member[]
  settings: Settings | null
  currentMember: Member | null
  isAdmin: boolean
  isLead: boolean
  isManager: boolean
  isCompanyAdmin: boolean
  refreshMembers: () => Promise<void>
  refreshSettings: () => Promise<void>
  setCurrentMember: (id: number | null) => Promise<void>
  // Auth (remote mode)
  authMode: 'local' | 'remote' | null
  authUser: AuthUser | null
  authChecked: boolean
  needsLogin: boolean
  refreshAuth: () => Promise<void>
  login: (email: string, password: string) => Promise<{ ok: boolean; mustReset?: boolean; error?: string }>
  changePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // ── Auth state (not data-fetching — stays as useState) ──────────────────────
  const [settings, setSettings] = useState<Settings | null>(null)
  const [authMode, setAuthMode] = useState<'local' | 'remote' | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  // ── Members from TanStack Query cache ────────────────────────────────────────
  // The query is gated by authMode: we only enable it once auth state is known.
  // This prevents 401s on startup in remote mode.
  const { data: members = [] } = useMembers()

  const refreshSettings = useCallback(async () => {
    const res = await window.api.settings.get()
    if (res.ok) setSettings(res.data as Settings)
  }, [])

  const refreshAuth = useCallback(async () => {
    const res = await window.api.auth.state()
    if (res.ok && res.data) {
      setAuthMode(res.data.mode)
      setAuthUser(res.data.user)
    }
    setAuthChecked(true)
  }, [])

  // Invalidate the members cache — TanStack Query will refetch automatically.
  const refreshMembers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeyFactory.members.all() })
  }, [queryClient])

  const login = useCallback(async (email: string, password: string) => {
    const res = await window.api.auth.login(email, password)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, mustReset: res.data?.mustReset }
  }, [])

  const changePassword = useCallback(async (current: string, next: string) => {
    const res = await window.api.auth.changePassword(current, next)
    return res.ok ? { ok: true } : { ok: false, error: res.error }
  }, [])

  const logout = useCallback(async () => {
    await window.api.auth.logout()
    setAuthUser(null)
  }, [])

  // Initial load: check if user is already authenticated (via stored token).
  // We set authMode to null until `refreshAuth` completes to avoid assuming
  // `local` and making protected API calls that cause 401s on startup.
  useEffect(() => { refreshAuth() }, [refreshAuth])

  // Fetch protected data only after authentication is complete.
  // For local mode: fetch immediately (no auth required).
  // For remote mode: only fetch after authChecked=true AND user is logged in.
  useEffect(() => {
    if (authMode === null) return // Still unknown — wait for refreshAuth

    if (authMode === 'local') {
      refreshSettings()
      return
    }

    // Remote mode: gate on both authChecked and authUser
    if (!authChecked) return
    if (!authUser) return

    // Auth is valid and user is logged in, fetch protected data
    refreshSettings()
  }, [authMode, authChecked, authUser, refreshSettings])

  const setCurrentMember = useCallback(async (id: number | null) => {
    const res = await window.api.settings.update({ current_member_id: id })
    if (res.ok) setSettings(res.data as Settings)
  }, [])

  const isRemote = authMode === 'remote'

  // Identity differs by mode: remote = the logged-in user; local = "Acting as".
  const currentMember = isRemote
    ? members.find((m) => m.id === authUser?.mid) ??
      members.find((m) => m.email.trim().toLowerCase() === (authUser?.email ?? '').trim().toLowerCase()) ??
      null
    : members.find((m) => m.id === settings?.current_member_id) ?? null

  // Role tiers (high→low): Company Admin > Manager > Team Lead > Employee.
  const role = isRemote ? authUser?.role : currentMember?.role
  const rank = roleRank(role)
  const setupMode = !isRemote && !currentMember // local "no member selected" = full access
  const isCompanyAdmin = setupMode || rank >= RANK_COMPANY_ADMIN
  const isManager = isCompanyAdmin || rank >= RANK_MANAGER
  const isLead = isCompanyAdmin || rank >= RANK_LEAD // Team Lead or above = admin-lite (assign + full visibility)
  const isAdmin = isCompanyAdmin || rank >= RANK_PROJECT_LEAD // Project Lead or above = project-admin powers

  const needsLogin = isRemote && authChecked && !authUser

  return (
    <AppContext.Provider
      value={{
        members, settings, currentMember, isAdmin, isLead, isManager, isCompanyAdmin,
        refreshMembers, refreshSettings, setCurrentMember,
        authMode, authUser, authChecked, needsLogin, refreshAuth, login, changePassword, logout
      }}
    >
      {children}
    </AppContext.Provider>
  )
}
