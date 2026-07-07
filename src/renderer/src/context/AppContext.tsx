import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Member, Settings, AuthUser } from '../types'
import { roleRank, RANK_COMPANY_ADMIN, RANK_MANAGER, RANK_LEAD, RANK_PROJECT_LEAD } from '../roles'

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
  authMode: 'local' | 'remote'
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
  const [members, setMembers] = useState<Member[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [authMode, setAuthMode] = useState<'local' | 'remote'>('local')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const refreshMembers = useCallback(async () => {
    const res = await window.api.members.getAll()
    if (res.ok) setMembers(res.data as Member[])
  }, [])

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

  // Initial load. In remote mode we still load members/settings once authed.
  useEffect(() => { refreshAuth() }, [refreshAuth])
  useEffect(() => {
    if (authMode === 'local' || authUser) { refreshMembers(); refreshSettings() }
  }, [authMode, authUser, refreshMembers, refreshSettings])

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
