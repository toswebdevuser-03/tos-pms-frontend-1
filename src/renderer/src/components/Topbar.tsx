import { Member, AuthUser } from '../types'
import { Feature } from '../App'
import Icon from './Icon'
import WorkspaceDrawer from './WorkspaceDrawer'

interface Props {
  onGoHome: () => void
  updateCount: number
  showMenu: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onOpenProjects: () => void
  authMode: string
  currentMember: Member | null
  authUser: AuthUser | null
  onLogout: () => void
  setCurrentMember: (id: number | null) => void
  members: Member[]
  onOpenPalette: () => void
  setFeature: (f: Feature | null) => void
  taskUpdateCount: number
  reminderCount: number
  onOpenReminders: () => void
  sectionOpen: (k: string) => boolean
  toggleSection: (k: string) => void
  isAdmin: boolean
  isLead: boolean
  isCompanyAdmin: boolean
  exportAllData: () => void
  theme: 'dark' | 'light'
  setTheme: (fn: (t: 'dark' | 'light') => 'dark' | 'light') => void
}

// Top bar: brand, Home/Workspace buttons, and the acting-as/action-button
// cluster (search, My Week, My Tasks, Inbox, Workspace drawer). Split out of
// App.tsx purely to keep that file under the size limit — markup/behavior
// unchanged from its previous inline form.
export default function Topbar({
  onGoHome, updateCount, showMenu, onToggleMenu, onCloseMenu, onOpenProjects, authMode, currentMember, authUser,
  onLogout, setCurrentMember, members, onOpenPalette, setFeature, taskUpdateCount,
  reminderCount, onOpenReminders, sectionOpen, toggleSection, isAdmin, isLead, isCompanyAdmin,
  exportAllData, theme, setTheme
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand"><Icon name="grid" size={18} className="brand-mark" /> TOS Tracker</div>
      <button className="btn btn-secondary topbar-workspace-btn" onClick={onGoHome} title="Home dashboard"><Icon name="home" size={16} /> Home</button>
      <button className="btn btn-secondary topbar-workspace-btn" onClick={onToggleMenu} title={updateCount > 0 ? `${updateCount} unseen update${updateCount === 1 ? '' : 's'}` : 'Workspace'}><Icon name="menu" size={16} /> {updateCount > 0 && <span className="reminder-pill">{updateCount}</span>}Workspace</button>
      <div className="topbar-actions">
        {authMode === 'remote' ? (
          <div className="acting-as signed-in">
            <span>Signed in as</span>
            <strong>{currentMember?.name ?? authUser?.name}</strong>
            <span className="role-chip">{authUser?.role}</span>
            <button className="btn btn-secondary btn-sm" disabled title="Not available during beta"><Icon name="settings" size={15} /> Change Password</button>
            <button className="btn btn-secondary btn-sm" onClick={onLogout} title="Sign out"><Icon name="logout" size={15} /> Logout</button>
          </div>
        ) : (
          <div className="acting-as">
            <span>Acting as</span>
            <select
              value={currentMember?.id ?? ''}
              onChange={(e) => setCurrentMember(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Select (admin mode)</option>
              {members.filter((m) => m.status !== 'left').map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
            </select>
          </div>
        )}
        <button className="btn btn-secondary btn-sm" onClick={onOpenPalette} title="Search (Ctrl+K)"><Icon name="search" size={15} /> Search <kbd className="kbd-hint">Ctrl K</kbd></button>
        <button className="btn btn-secondary btn-sm" onClick={() => setFeature('myWeek')}><Icon name="calendar" size={15} /> My Week</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setFeature('myTasks')} title={taskUpdateCount > 0 ? `${taskUpdateCount} unseen task update${taskUpdateCount === 1 ? '' : 's'}` : undefined}><Icon name="checkSquare" size={15} /> My Tasks{taskUpdateCount > 0 && <span className="reminder-pill">{taskUpdateCount}</span>}</button>
        <button className="btn btn-secondary btn-sm reminder-btn" onClick={onOpenReminders}>
          <Icon name="inbox" size={15} /> Inbox{(reminderCount + updateCount) > 0 && <span className="reminder-pill">{reminderCount + updateCount}</span>}
        </button>
        <div className="topbar-menu">
          <WorkspaceDrawer
            show={showMenu}
            onCloseMenu={onCloseMenu}
            onOpenProjects={onOpenProjects}
            sectionOpen={sectionOpen}
            toggleSection={toggleSection}
            isAdmin={isAdmin}
            isLead={isLead}
            isCompanyAdmin={isCompanyAdmin}
            setFeature={setFeature}
            exportAllData={exportAllData}
            theme={theme}
            setTheme={setTheme}
          />
        </div>
      </div>
    </header>
  )
}
