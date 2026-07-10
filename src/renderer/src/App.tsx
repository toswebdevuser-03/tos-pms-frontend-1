import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Project, ProjectStatus, ToastAction, Member } from './types'
import ProjectDetail from './components/ProjectDetail'
import Toast from './components/Toast'
import MembersModal from './components/MembersModal'
import SettingsModal from './components/SettingsModal'
import RemindersPanel from './components/RemindersPanel'
import AssignmentsModal from './components/AssignmentsModal'
import OrgChartModal from './components/OrgChartModal'
import MyTasksModal from './components/MyTasksModal'
import MyWeekModal from './components/MyWeekModal'
import TalentModal from './components/TalentModal'
import BestFitModal from './components/BestFitModal'
import AllocationModal from './components/AllocationModal'
import TaskAllocationModal from './components/TaskAllocationModal'
import AllocationHub from './components/AllocationHub'
import MyAllocationModal from './components/MyAllocationModal'
import ApprovalsModal from './components/ApprovalsModal'
import TaskTimer from './components/TaskTimer'
import StaffingModal from './components/StaffingModal'
import EmployeeDashboard from './components/EmployeeDashboard'
import ChangePasswordModal from './components/ChangePasswordModal'
import QuoteModal from './components/QuoteModal'
import ClientsModal from './components/ClientsModal'
import RecycleBinModal from './components/RecycleBinModal'
import CommandPalette, { PaletteTarget } from './components/CommandPalette'
import ExecDashboard from './components/ExecDashboard'
import Icon from './components/Icon'
import HomeDashboard from './components/HomeDashboard'
import Topbar from './components/Topbar'
import ProjectSidebar from './components/ProjectSidebar'
import { AppProvider, useApp } from './context/AppContext'
import { DataProvider, useData } from './context/DataContext'
import { splitDisciplines, DISCIPLINES } from './disciplines'
import FormModal, { FieldDef } from './components/FormModal'
import { loadUpdates, unseen, getLastSeen, pushDesktopNotifications, requestNotifyPermission, ProjectUpdate } from './lib/projectUpdates'
import { initAnalytics, track } from './lib/analytics'
import Login from './Login'
// Phase 3: TanStack Query hooks replace useState+useEffect data loading
import { useProjects, useStatuses } from './hooks/useApiQuery'
import { useProjectMembers } from './hooks/useProjectMembers'
import { useReminderCount } from './hooks/useReminders'
import { queryKeyFactory } from './hooks/queryKeyFactory'

interface ToastState { message: string; type: 'success' | 'error'; key: number; action?: ToastAction }

// Every "feature window" (Members, Skills, allocations, dashboards, …) lives in a
// single slot. Selecting a new one auto-closes the current — no stacking, one ← Back.
export type Feature =
  | 'members' | 'settings' | 'assign' | 'org' | 'myTasks' | 'myWeek'
  | 'talent' | 'bestFit' | 'disc' | 'workAlloc' | 'taskAlloc' | 'alloc'
  | 'myAlloc' | 'approvals' | 'staffing' | 'empDash' | 'exec' | 'quote' | 'clientData' | 'clientDash' | 'recycleBin'

// Direct project creation (Man-Month / Time-Sheet based) — no quote required. The
// project `type` is fixed by which button was clicked, so it's not in the form.
const CREATE_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Project Name', required: true },
  { key: 'client', label: 'Client' },
  { key: 'location', label: 'Location' },
  { key: 'discipline', label: 'Discipline', type: 'multiselect', options: DISCIPLINES },
  { key: 'quoted_hours', label: 'Budget hours (optional)', type: 'number' },
  { key: 'start_date', label: 'Start Date', type: 'date' },
  { key: 'end_date', label: 'Target End Date', type: 'date' }
]

function Shell() {
  const { members, currentMember, setCurrentMember, isCompanyAdmin, isManager, isLead, isAdmin, authMode, authUser, logout, settings, authChecked } = useApp()
  const { refreshAll: refreshData } = useData()
  const queryClient = useQueryClient()

  // ── Phase 3: TanStack Query — projects, statuses, assignments, reminders ─────
  // These replace the previous useState + useCallback + useEffect pattern.
  // Data is served from the TanStack Query cache; WS events invalidate it via
  // WebsocketQueryInvalidator (centralized in main.tsx → RootWithProviders).
  const { data: projects = [] } = useProjects()
  const { data: statusesRaw = [] } = useStatuses()
  const { data: allProjectMembers = [] } = useProjectMembers()
  const { data: reminderCount = 0 } = useReminderCount()

  // Derive statusMap from cached statuses
  const statusMap = useMemo(() => {
    const m: Record<number, string> = {}
    ;(statusesRaw as ProjectStatus[]).forEach((s) => { if (s.overall) m[s.project_id] = s.overall })
    return m
  }, [statusesRaw])

  // Derive myAssignments (Set of projectIds for current user) from project members
  const myAssignments = useMemo(() => {
    const memberIds = [currentMember?.id, authUser?.mid].filter((id): id is number => typeof id === 'number')
    if (memberIds.length === 0) return new Set<number>()
    const ids = (allProjectMembers as { project_id: number; member_id: number }[])
      .filter((r) => memberIds.includes(r.member_id)).map((r) => r.project_id)
    return new Set<number>(ids)
  }, [allProjectMembers, currentMember, authUser])

  // ── UI state (unchanged from original) ────────────────────────────────────
  // Restore the last view across refreshes: a feature window takes priority,
  // otherwise the open project (they're persisted in localStorage below).
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (localStorage.getItem('tos_feature')) return null
    const s = Number(localStorage.getItem('tos_selected')); return s > 0 ? s : null
  })
  const [toast, setToast] = useState<ToastState | null>(null)
  const [search, setSearch] = useState('')
  const [showReminders, setShowReminders] = useState(false)

  // (TS fix) ensure stable types when composing state elsewhere.
  // (No behavior change; satisfies strict typing.)
  // Single active feature window (see Feature type). Opening another swaps it in;
  // closeFeature()/← Back returns to the dashboard or the open project.
  const [feature, setFeature] = useState<Feature | null>(() => (localStorage.getItem('tos_feature') as Feature) || null)
  // The lower-ranked member whose dashboard a higher role is viewing (feature 'empDash').
  const [empDashMember, setEmpDashMember] = useState<Member | null>(null)
  const closeFeature = useCallback(() => { setFeature(null); setEmpDashMember(null) }, [])
  // Direct project creation without a quote (Man-Month / Time-Sheet based). The
  // string holds the project type; null = the create form is closed.
  const [createType, setCreateType] = useState<string | null>(null)
  const handleCreateProject = async (data: Record<string, string>): Promise<void> => {
    const res = await window.api.projects.create({
      name: data.name ?? '', client: data.client ?? '', location: data.location ?? '',
      discipline: data.discipline ?? '', quoted_hours: data.quoted_hours ?? '', type: createType ?? '',
      start_date: data.start_date ?? '', end_date: data.end_date ?? ''
    })
    if (!res.ok || !res.data) { showToast(res.error ?? 'Could not create project', 'error'); return }
    const pid = (res.data as { id: number }).id
    setCreateType(null)
    // Invalidate projects + project-members cache so new project appears immediately
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.projects.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeyFactory.projectMembers.all() }),
    ])
    void refreshData()
    setSelectedId(pid)
    showToast(`Project "${data.name}" created`)
  }
  const [showMenu, setShowMenu] = useState(false)
  // Project navigation is opened on demand (Workspace → Projects) rather than
  // living in a permanently-docked sidebar.
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [gotoTab, setGotoTab] = useState<{ tab: string; n: number }>({ tab: 'Dashboard', n: 0 })
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark')
  // Full-window popups (the Workspace menu toggle for this was removed; keeps
  // whatever was last persisted, defaulting on).
  const [fsModals] = useState(() => localStorage.getItem('tos_fullscreen') !== 'off')
  // Collapsible Workspace menu sections (default expanded; persisted).
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('tos_menu_sections') || '{}') } catch { return {} }
  })
  const sectionOpen = (k: string): boolean => openSections[k] !== false
  const toggleSection = useCallback((k: string) => setOpenSections((s) => {
    const n = { ...s, [k]: !(s[k] !== false) }
    localStorage.setItem('tos_menu_sections', JSON.stringify(n))
    return n
  }), [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // Opening a project closes any feature window so the project shows through.
  useEffect(() => { if (selectedId != null) setFeature(null) }, [selectedId])
  // Persist the current view so a browser refresh restores it (not the dashboard).
  useEffect(() => { localStorage.setItem('tos_feature', feature ?? '') }, [feature])
  useEffect(() => { localStorage.setItem('tos_selected', selectedId != null ? String(selectedId) : '') }, [selectedId])
  // If the restored/open project no longer exists, fall back to the dashboard.
  useEffect(() => {
    if (selectedId != null && projects.length > 0 && !projects.some((p) => (p as Project).id === selectedId)) setSelectedId(null)
  }, [projects, selectedId])
  // Full-screen popup preference → body class (CSS expands every modal).
  useEffect(() => { document.body.classList.toggle('fs-modals', fsModals); localStorage.setItem('tos_fullscreen', fsModals ? 'on' : 'off') }, [fsModals])

  // Real-time updates (remote mode): detailRefresh bumps re-mount the open project's tab.
  // NOTE: Projects/statuses/assignments/reminderCount are NO LONGER refreshed here.
  // The WebsocketQueryInvalidator (in main.tsx) handles all cache invalidation centrally.
  const [detailRefresh, setDetailRefresh] = useState(0)
  const selectedIdRef = useRef<number | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => {
    const unsub = window.api.realtime.subscribe((evt) => {
      // Only trigger a project detail re-mount for events affecting the open project.
      if (evt.projectId != null && evt.projectId === selectedIdRef.current) {
        setDetailRefresh((n) => n + 1)
      }
    })
    return unsub
  }, [])

  const showToast = (message: string, type: 'success' | 'error' = 'success', action?: ToastAction) => {
    setToast({ message, type, key: Date.now(), action })
  }

  // ── Keyboard shortcuts: n = new quotation, / = focus search, esc = close ──────
  const searchRef = useRef<HTMLInputElement>(null)
  const closeAllOverlays = useCallback(() => {
    setShowReminders(false); setShowMenu(false); setFeature(null)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v); return }
      if (e.key === 'Escape') { if (typing) (t as HTMLElement).blur(); setPaletteOpen(false); closeAllOverlays(); return }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key.toLowerCase() === 'n' && isLead) { e.preventDefault(); setFeature('quote') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isLead, closeAllOverlays])

  // Export every table (projects, members, all item types + derived models) as CSV.
  const exportAllData = async () => {
    showToast('Choose a folder to export all data…')
    const res = await window.api.powerbi.export()
    if (res.ok && res.data?.dir) showToast(`Exported all data (${res.data.files} files) to ${res.data.dir}`)
    else if (res.ok) showToast('Export cancelled')
    else showToast(res.error ?? 'Export failed', 'error')
  }

  const goToProjectTab = (projectId: number, tab: string): void => {
    setSelectedId(projectId)
    setGotoTab((g) => ({ tab, n: g.n + 1 }))
  }
  const handlePalette = (t: PaletteTarget): void => {
    if (t.kind === 'member') { setFeature('members'); return }
    if (t.kind === 'item') goToProjectTab(t.projectId, t.tab)
    else setSelectedId(t.projectId)
  }

  // Project visibility:
  //  Company Admin → every project
  //  Manager       → projects in their discipline(s), plus any assigned to them
  //  Team Lead     → projects they created or are assigned to
  //  others        → projects assigned to them
  const myDiscipline = currentMember?.discipline || authUser?.discipline || ''
  const myName = authUser?.name || currentMember?.name || ''
  const managerDisciplines = useMemo(() => splitDisciplines(myDiscipline), [myDiscipline])
  const scopedProjects = useMemo(() => {
    if (isCompanyAdmin) return projects as Project[]
    if (isManager) {
      return (projects as Project[]).filter((p) =>
        myAssignments.has(p.id) ||
        (!!myName && p.created_by === myName) ||
        (managerDisciplines.length > 0 && splitDisciplines(p.discipline as string).some((d) => managerDisciplines.includes(d)))
      )
    }
    if (isLead) { // Team Lead (Manager handled above) → created or assigned
      return (projects as Project[]).filter((p) => myAssignments.has(p.id) || (!!myName && p.created_by === myName))
    }
    return (projects as Project[]).filter((p) => myAssignments.has(p.id))
  }, [projects, isCompanyAdmin, isManager, isLead, myAssignments, managerDisciplines, myName])
  const managerScopeIssue = isManager && !isCompanyAdmin && projects.length > 0 && scopedProjects.length === 0
    ? managerDisciplines.length === 0
      ? 'Your Manager profile has no discipline in this backend. Add Architecture, Structural, MEP, or assign projects to this manager.'
      : `No local projects match your Manager discipline (${managerDisciplines.join(', ')}) and no projects are assigned to you.`
    : ''

  // Archived projects are hidden from active views unless "Show archived" is on.
  const archivedCount = useMemo(() => scopedProjects.filter((p) => p.archived).length, [scopedProjects])
  const visibleProjects = useMemo(
    () => (showArchived ? scopedProjects : scopedProjects.filter((p) => !p.archived)),
    [scopedProjects, showArchived]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return visibleProjects
    return visibleProjects.filter((p) =>
      p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q) || p.location.toLowerCase().includes(q))
  }, [visibleProjects, search])

  const selected = visibleProjects.find((p) => p.id === selectedId) ?? null

  // Unseen project updates (key events since last opened) — kept as the full list so
  // individual menus (My Tasks, each project, each project tab) can show their own
  // count instead of only a lump sum on the Workspace/Inbox buttons.
  // WebSocket-first: no polling interval.
  const [unseenUpdates, setUnseenUpdates] = useState<ProjectUpdate[]>([])
  const refreshUnseenUpdates = useCallback(async () => {
    const u = await loadUpdates(
      visibleProjects.map((p) => ({ id: p.id, name: p.name })),
      { me: currentMember?.id, members }
    )
    setUnseenUpdates(unseen(u, getLastSeen()))
    pushDesktopNotifications(u)
  }, [visibleProjects, currentMember, members])

  // Initial load and refresh when the project scope changes.
  useEffect(() => {
    void refreshUnseenUpdates()
  }, [refreshUnseenUpdates])

  // Refresh unseen updates on WebSocket events (inbox relevance only).
  // NOTE: This WS subscription is kept because `unseenUpdates` is UI-only state
  // (not a fetch) and cannot be managed by TanStack Query.
  useEffect(() => {
    const unsub = window.api.realtime.subscribe((evt) => {
      // Inbox/recent-updates are built from item + dispatch + rfi + status changes.
      const isInboxRelevant =
        evt.entity === 'status' ||
        (evt.entity === 'item' && ['rfi', 'task', 'dispatch', 'wip'].includes(evt.type ?? '')) ||
        evt.entity === 'project'
      if (!isInboxRelevant) return
      void refreshUnseenUpdates()
    })
    return unsub
  }, [refreshUnseenUpdates])

  const updateCount = unseenUpdates.length
  const taskUpdateCount = useMemo(() => unseenUpdates.filter((u) => u.kind === 'task').length, [unseenUpdates])
  const unseenByProject = useMemo(() => {
    const m = new Map<number, number>()
    for (const u of unseenUpdates) m.set(u.projectId, (m.get(u.projectId) ?? 0) + 1)
    return m
  }, [unseenUpdates])

  // Product analytics (Amplitude) — no-ops unless a key is set in Settings.
  const analyticsKey = settings?.analytics?.amplitude_key
  useEffect(() => {
    initAnalytics(analyticsKey, currentMember)
    if (analyticsKey && currentMember) track('session_start')
  }, [analyticsKey, currentMember])
  useEffect(() => { if (feature) track('feature_opened', { feature }) }, [feature])
  useEffect(() => { if (selectedId != null) track('project_opened', { project_id: selectedId }) }, [selectedId])

  return (
    <div className="app-shell">
      {/* Top bar */}
      <Topbar
        onGoHome={() => { setSelectedId(null); setFeature(null) }}
        updateCount={updateCount}
        showMenu={showMenu}
        onToggleMenu={() => setShowMenu((v) => !v)}
        onCloseMenu={() => setShowMenu(false)}
        onOpenProjects={() => setShowProjectPicker(true)}
        authMode={authMode}
        currentMember={currentMember}
        authUser={authUser}
        onLogout={logout}
        setCurrentMember={setCurrentMember}
        members={members}
        onOpenPalette={() => setPaletteOpen(true)}
        setFeature={setFeature}
        taskUpdateCount={taskUpdateCount}
        reminderCount={reminderCount}
        onOpenReminders={() => { setShowReminders(true); void requestNotifyPermission() }}
        sectionOpen={sectionOpen}
        toggleSection={toggleSection}
        isAdmin={isAdmin}
        isLead={isLead}
        isCompanyAdmin={isCompanyAdmin}
        exportAllData={exportAllData}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Project navigation: opened on demand from Workspace → Projects. */}
      <ProjectSidebar
        show={showProjectPicker}
        onClose={() => setShowProjectPicker(false)}
        isLead={isLead}
        onQuote={() => setFeature('quote')}
        onCreateType={setCreateType}
        visibleProjects={visibleProjects}
        searchRef={searchRef}
        search={search}
        setSearch={setSearch}
        isManager={isManager}
        filtered={filtered}
        statusMap={statusMap}
        selectedId={selectedId}
        onSelect={setSelectedId}
        unseenByProject={unseenByProject}
        archivedCount={archivedCount}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
      />

      <div className="app-layout">
        {/* Main */}
        <main className="main-area">
          {feature === 'empDash' && empDashMember ? (
            <EmployeeDashboard member={empDashMember} onSelect={setSelectedId} onBack={closeFeature} />
          ) : feature === 'alloc' ? (
            <AllocationHub projects={visibleProjects} onClose={closeFeature} onToast={showToast} onChanged={() => { queryClient.invalidateQueries({ queryKey: queryKeyFactory.projectMembers.all() }); refreshData() }} />
          ) : feature === 'workAlloc' ? (
            <AllocationModal projects={visibleProjects} onClose={closeFeature} onToast={showToast} />
          ) : feature === 'taskAlloc' ? (
            <TaskAllocationModal projects={visibleProjects} onClose={closeFeature} onToast={showToast} />
          ) : selected ? (
            <ProjectDetail
              key={selected.id}
              project={selected}
              refreshKey={detailRefresh}
              onUpdate={() => { queryClient.invalidateQueries({ queryKey: queryKeyFactory.projects.all() }); queryClient.invalidateQueries({ queryKey: queryKeyFactory.statuses.all() }) }}
              onDelete={() => { setSelectedId(null); queryClient.invalidateQueries({ queryKey: queryKeyFactory.projects.all() }); queryClient.invalidateQueries({ queryKey: queryKeyFactory.statuses.all() }) }}
              onBack={() => setSelectedId(null)}
              gotoTab={gotoTab}
              onOpenRecycleBin={() => setFeature('recycleBin')}
              onToast={(m, t) => { showToast(m, t); queryClient.invalidateQueries({ queryKey: queryKeyFactory.reminders.all() }); queryClient.invalidateQueries({ queryKey: queryKeyFactory.statuses.all() }) }}
              updates={unseenUpdates}
            />
          ) : visibleProjects.length === 0 ? (
            <div className="empty-main">
              <div className="welcome-card">
                <div className="welcome-icon">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                  </svg>
                </div>
                <h1>TOS Tracker</h1>
                <p>Track RFIs, queries, dispatches, tasks, WIP, QA/QC and timesheets for every project — with members, reminders and CSV export.</p>
                {managerScopeIssue ? (
                  <p className="welcome-hint">{managerScopeIssue}</p>
                ) : isLead ? (
                  <div className="new-proj-group new-proj-center">
                    <button className="btn btn-primary" onClick={() => setFeature('quote')} title="Quote & create a Miscellaneous project"><Icon name="quote" size={16} /> Miscellaneous (quote)</button>
                    <div className="new-proj-row">
                      <button className="btn btn-secondary" onClick={() => setCreateType('Man-month')} title="Create a Man-month project (no quote)"><Icon name="calendar" size={15} /> Man-Month</button>
                      <button className="btn btn-secondary" onClick={() => setCreateType('Time-Sheet based')} title="Create a Time-Sheet based project (no quote)"><Icon name="clock" size={15} /> Time-Sheet based</button>
                    </div>
                  </div>
                ) : (
                  <p className="welcome-hint">No projects assigned to you yet. A Manager or Company Admin assigns your projects.</p>
                )}
              </div>
            </div>
          ) : (
            <HomeDashboard
              projects={visibleProjects}
              statusMap={statusMap}
              members={members}
              isManager={isManager}
              canQuote={isLead}
              onSelect={setSelectedId}
              onQuote={() => setFeature('quote')}
            />
          )}

          {/* Feature windows dock into the main area (sidebar + topbar stay visible),
              matching the Work/Task Allocation footprint when full-page mode is on.
              One slot only: opening another swaps it in; ← Back returns here. */}
          {feature === 'assign' && <AssignmentsModal projects={projects as Project[]} onClose={closeFeature} onToast={showToast} onChanged={() => { queryClient.invalidateQueries({ queryKey: queryKeyFactory.projectMembers.all() }); refreshData() }} />}
          {feature === 'talent' && <TalentModal projects={visibleProjects} onClose={closeFeature} onToast={showToast} />}
          {feature === 'bestFit' && <BestFitModal projects={visibleProjects} onClose={closeFeature} />}
          {feature === 'myAlloc' && <MyAllocationModal projects={visibleProjects} onClose={closeFeature} onToast={showToast} />}
          {feature === 'approvals' && <ApprovalsModal onClose={closeFeature} onToast={showToast} />}
          {feature === 'staffing' && <StaffingModal projects={visibleProjects} onClose={() => { closeFeature(); queryClient.invalidateQueries({ queryKey: queryKeyFactory.projectMembers.all() }) }} onToast={showToast} />}
          {(feature === 'exec' || feature === 'disc') && <ExecDashboard key={feature} projects={visibleProjects} initialView={feature === 'disc' ? 'discipline' : 'portfolio'} onClose={closeFeature} onSelect={setSelectedId} onToast={showToast} />}
          {feature === 'quote' && <QuoteModal onClose={closeFeature} onToast={showToast} onOpenProject={async (id) => { await queryClient.invalidateQueries({ queryKey: queryKeyFactory.projects.all() }); await queryClient.invalidateQueries({ queryKey: queryKeyFactory.projectMembers.all() }); setSelectedId(id) }} />}
          {(feature === 'clientData' || feature === 'clientDash') && (
            <ClientsModal mode={feature === 'clientData' ? 'data' : 'dashboard'} projects={visibleProjects} onClose={closeFeature} onToast={showToast} onSelect={setSelectedId} />
          )}
          {feature === 'recycleBin' && <RecycleBinModal onClose={closeFeature} onToast={showToast} onChanged={() => { queryClient.invalidateQueries({ queryKey: queryKeyFactory.projects.all() }); queryClient.invalidateQueries({ queryKey: queryKeyFactory.projectMembers.all() }) }} />}
          {feature === 'org' && <OrgChartModal onClose={closeFeature} />}
          {feature === 'myTasks' && <MyTasksModal projects={visibleProjects} onClose={closeFeature} onToast={showToast} />}
          {feature === 'myWeek' && <MyWeekModal projects={visibleProjects} onClose={closeFeature} onNavigate={goToProjectTab} />}
          {feature === 'members' && <MembersModal onClose={closeFeature} onToast={showToast} onViewDashboard={(m) => { setEmpDashMember(m); setFeature('empDash') }} />}
          {feature === 'settings' && <SettingsModal onClose={closeFeature} onToast={showToast} />}
        </main>
      </div>

      {createType && (
        <FormModal
          title={`New ${createType === 'Man-month' ? 'Man-Month' : 'Time-Sheet based'} project`}
          fields={CREATE_FIELDS}
          isAdmin={isAdmin}
          onSubmit={handleCreateProject}
          onClose={() => setCreateType(null)}
          onToast={showToast}
        />
      )}
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} onToast={showToast} />}
      <TaskTimer projects={visibleProjects} onToast={showToast} />
      {paletteOpen && <CommandPalette projects={visibleProjects} members={members} onClose={() => setPaletteOpen(false)} onNavigate={handlePalette} />}
      {showReminders && <RemindersPanel projects={visibleProjects} onClose={() => { setShowReminders(false); queryClient.invalidateQueries({ queryKey: queryKeyFactory.reminders.all() }); setUnseenUpdates([]) }} onToast={showToast} onNavigate={goToProjectTab} onCleared={() => setUnseenUpdates([])} />}
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} action={toast.action} onClose={() => setToast(null)} />}
    </div>
  )
}

function Gate() {
  const { authChecked, needsLogin } = useApp()
  if (!authChecked) {
    return <div className="login-screen"><div className="login-card"><div className="login-brand"><Icon name="grid" size={18} className="brand-mark" /> TOS Tracker</div><p className="login-sub">Loading…</p></div></div>
  }
  if (needsLogin) return <Login />
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}

export default function App() {
  return <Gate />
}
