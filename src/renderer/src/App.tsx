import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  const { members, currentMember, setCurrentMember, isCompanyAdmin, isManager, isLead, isAdmin, authMode, authUser, logout, settings } = useApp()
  const { refreshAll: refreshData } = useData()
  const [projects, setProjects] = useState<Project[]>([])
  // Restore the last view across refreshes: a feature window takes priority,
  // otherwise the open project (they're persisted in localStorage below).
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (localStorage.getItem('tos_feature')) return null
    const s = Number(localStorage.getItem('tos_selected')); return s > 0 ? s : null
  })
  const [toast, setToast] = useState<ToastState | null>(null)
  const [search, setSearch] = useState('')
  const [showReminders, setShowReminders] = useState(false)
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
    await Promise.all([loadProjects(), loadAssignments()]); void refreshData()
    setSelectedId(pid)
    showToast(`Project “${data.name}” created`)
  }
  const [showMenu, setShowMenu] = useState(false)
  // Project navigation is opened on demand (Workspace → Projects) rather than
  // living in a permanently-docked sidebar.
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [gotoTab, setGotoTab] = useState<{ tab: string; n: number }>({ tab: 'Dashboard', n: 0 })
  const [myAssignments, setMyAssignments] = useState<Set<number>>(new Set())
  const [reminderCount, setReminderCount] = useState(0)
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

  const [statusMap, setStatusMap] = useState<Record<number, string>>({})

  const loadProjects = useCallback(async () => {
    const res = await window.api.projects.getAll()
    if (res.ok) setProjects(res.data as Project[])
  }, [])

  const loadStatuses = useCallback(async () => {
    const res = await window.api.projects.statuses()
    if (res.ok) {
      const m: Record<number, string> = {}
      ;(res.data as ProjectStatus[]).forEach((s) => { if (s.overall) m[s.project_id] = s.overall })
      setStatusMap(m)
    }
  }, [])

  const loadReminderCount = useCallback(async () => {
    const res = await window.api.reminders.get()
    if (res.ok) setReminderCount((res.data as unknown[]).filter((r) => (r as { severity: string }).severity !== 'upcoming').length)
  }, [])

  // Which projects the current member is assigned to (for visibility).
  const loadAssignments = useCallback(async () => {
    const res = await window.api.projectMembers.all()
    if (!res.ok) return
    const cid = currentMember?.id
    if (!cid) { setMyAssignments(new Set()); return }
    const ids = (res.data as { project_id: number; member_id: number }[])
      .filter((r) => r.member_id === cid).map((r) => r.project_id)
    setMyAssignments(new Set(ids))
  }, [currentMember])

  useEffect(() => { loadProjects(); loadStatuses(); loadReminderCount() }, [loadProjects, loadStatuses, loadReminderCount])
  useEffect(() => { loadAssignments() }, [loadAssignments])
  // Opening a project closes any feature window so the project shows through.
  useEffect(() => { if (selectedId != null) setFeature(null) }, [selectedId])
  // Persist the current view so a browser refresh restores it (not the dashboard).
  useEffect(() => { localStorage.setItem('tos_feature', feature ?? '') }, [feature])
  useEffect(() => { localStorage.setItem('tos_selected', selectedId != null ? String(selectedId) : '') }, [selectedId])
  // If the restored/open project no longer exists, fall back to the dashboard.
  useEffect(() => {
    if (selectedId != null && projects.length > 0 && !projects.some((p) => p.id === selectedId)) setSelectedId(null)
  }, [projects, selectedId])
  // Full-screen popup preference → body class (CSS expands every modal).
  useEffect(() => { document.body.classList.toggle('fs-modals', fsModals); localStorage.setItem('tos_fullscreen', fsModals ? 'on' : 'off') }, [fsModals])

  // Real-time updates (remote mode): refresh the affected view when another
  // user changes data. detailRefresh bumps re-mount the open project's tab.
  const [detailRefresh, setDetailRefresh] = useState(0)
  const selectedIdRef = useRef<number | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => {
    const unsub = window.api.realtime.subscribe((evt) => {
      if (['project', 'member', 'projectMember', 'status'].includes(evt.entity)) {
        loadProjects(); loadStatuses(); loadAssignments(); loadReminderCount()
      }
      if (evt.projectId != null && evt.projectId === selectedIdRef.current) {
        setDetailRefresh((n) => n + 1)
      }
    })
    return unsub
  }, [loadProjects, loadStatuses, loadAssignments, loadReminderCount])

  // Near-real-time refresh WITHOUT interrupting data entry. The WebSocket can't
  // traverse the Vercel→ngrok proxy, so we poll on an interval + on tab focus —
  // but we SKIP any tick while the user is actively working (a modal/form is open
  // or an editable field is focused), so a refresh never closes a form mid-edit.
  // The next tick (after they finish) catches them up.
  useEffect(() => {
    const isBusy = (): boolean => {
      if (document.querySelector('.modal-overlay')) return true // a form / feature window is open
      const el = document.activeElement as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    }
    const refreshNow = (): void => {
      if (isBusy()) return // don't interrupt active data entry
      loadProjects(); loadStatuses(); loadAssignments(); loadReminderCount(); refreshData()
      setDetailRefresh((n) => n + 1)
    }
    const onVisible = (): void => { if (!document.hidden) refreshNow() }
    const id = window.setInterval(() => { if (!document.hidden) refreshNow() }, 30000)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(id); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible) }
  }, [loadProjects, loadStatuses, loadAssignments, loadReminderCount, refreshData])

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
  const myDiscipline = currentMember?.discipline || ''
  const myName = authUser?.name || currentMember?.name || ''
  const scopedProjects = useMemo(() => {
    if (isCompanyAdmin) return projects
    if (isManager) {
      const mine = splitDisciplines(myDiscipline)
      return projects.filter((p) => myAssignments.has(p.id) || (mine.length > 0 && splitDisciplines(p.discipline as string).some((d) => mine.includes(d))))
    }
    if (isLead) { // Team Lead (Manager handled above) → created or assigned
      return projects.filter((p) => myAssignments.has(p.id) || (!!myName && p.created_by === myName))
    }
    return projects.filter((p) => myAssignments.has(p.id))
  }, [projects, isCompanyAdmin, isManager, isLead, myAssignments, myDiscipline, myName])

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
  const [unseenUpdates, setUnseenUpdates] = useState<ProjectUpdate[]>([])
  useEffect(() => {
    let alive = true
    const run = (): void => { void loadUpdates(visibleProjects.map((p) => ({ id: p.id, name: p.name })), { me: currentMember?.id, members }).then((u) => { if (!alive) return; setUnseenUpdates(unseen(u, getLastSeen())); pushDesktopNotifications(u) }) }
    run()
    const id = window.setInterval(run, 60000)
    return () => { alive = false; window.clearInterval(id) }
  }, [visibleProjects, currentMember, members])
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
            <AllocationHub projects={visibleProjects} onClose={closeFeature} onToast={showToast} onChanged={loadAssignments} />
          ) : feature === 'workAlloc' ? (
            <AllocationModal projects={visibleProjects} onClose={closeFeature} onToast={showToast} />
          ) : feature === 'taskAlloc' ? (
            <TaskAllocationModal projects={visibleProjects} onClose={closeFeature} onToast={showToast} />
          ) : selected ? (
            <ProjectDetail
              key={selected.id}
              project={selected}
              refreshKey={detailRefresh}
              onUpdate={() => { loadProjects(); loadStatuses() }}
              onDelete={() => { setSelectedId(null); loadProjects(); loadStatuses() }}
              onBack={() => setSelectedId(null)}
              gotoTab={gotoTab}
              onOpenRecycleBin={() => setFeature('recycleBin')}
              onToast={(m, t) => { showToast(m, t); loadReminderCount(); loadStatuses() }}
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
                {isLead ? (
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
          {feature === 'assign' && <AssignmentsModal projects={projects} onClose={closeFeature} onToast={showToast} onChanged={loadAssignments} />}
          {feature === 'talent' && <TalentModal projects={visibleProjects} onClose={closeFeature} onToast={showToast} />}
          {feature === 'bestFit' && <BestFitModal projects={visibleProjects} onClose={closeFeature} />}
          {feature === 'myAlloc' && <MyAllocationModal projects={visibleProjects} onClose={closeFeature} onToast={showToast} />}
          {feature === 'approvals' && <ApprovalsModal onClose={closeFeature} onToast={showToast} />}
          {feature === 'staffing' && <StaffingModal projects={visibleProjects} onClose={() => { closeFeature(); loadAssignments() }} onToast={showToast} />}
          {(feature === 'exec' || feature === 'disc') && <ExecDashboard key={feature} projects={visibleProjects} initialView={feature === 'disc' ? 'discipline' : 'portfolio'} onClose={closeFeature} onSelect={setSelectedId} onToast={showToast} />}
          {feature === 'quote' && <QuoteModal onClose={closeFeature} onToast={showToast} onOpenProject={async (id) => { await Promise.all([loadProjects(), loadAssignments()]); setSelectedId(id) }} />}
          {(feature === 'clientData' || feature === 'clientDash') && (
            <ClientsModal mode={feature === 'clientData' ? 'data' : 'dashboard'} projects={visibleProjects} onClose={closeFeature} onToast={showToast} onSelect={setSelectedId} />
          )}
          {feature === 'recycleBin' && <RecycleBinModal onClose={closeFeature} onToast={showToast} onChanged={() => { loadProjects(); loadAssignments() }} />}
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
      {showReminders && <RemindersPanel projects={visibleProjects} onClose={() => { setShowReminders(false); loadReminderCount(); setUnseenUpdates([]) }} onToast={showToast} onNavigate={goToProjectTab} onCleared={() => setUnseenUpdates([])} />}
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
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  )
}
