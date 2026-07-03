import { RefObject } from 'react'
import { Project } from '../types'
import Icon from './Icon'
import ProjectTree from './ProjectTree'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  show: boolean
  onClose: () => void
  isLead: boolean
  onQuote: () => void
  onCreateType: (t: string) => void
  visibleProjects: Project[]
  searchRef: RefObject<HTMLInputElement | null>
  search: string
  setSearch: (v: string) => void
  isManager: boolean
  filtered: Project[]
  statusMap: Record<number, string>
  selectedId: number | null
  onSelect: (id: number | null) => void
  unseenByProject: Map<number, number>
  archivedCount: number
  showArchived: boolean
  setShowArchived: (fn: (v: boolean) => boolean) => void
}

// Project navigation, opened on demand from Workspace → Projects (no longer a
// permanently-docked sidebar): new-project shortcuts, search, the project
// tree, and the archived-projects footer toggle. Picking a project closes it.
export default function ProjectSidebar({
  show, onClose, isLead, onQuote, onCreateType, visibleProjects, searchRef, search, setSearch, isManager,
  filtered, statusMap, selectedId, onSelect, unseenByProject, archivedCount, showArchived, setShowArchived
}: Props) {
  useEscapeKey(onClose)
  if (!show) return null
  const pick = (id: number | null): void => { onSelect(id); onClose() }
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="workspace-drawer project-drawer" role="dialog" aria-label="Projects">
      <div className="drawer-head">
        <h3>Projects</h3>
        <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <div className="sidebar-header">
        {isLead && (
          <div className="new-proj-group">
            <button className="btn btn-primary btn-full" onClick={onQuote} title="Quote & create a Miscellaneous project"><Icon name="quote" size={16} /> Miscellaneous</button>
            <div className="new-proj-row">
              <button className="btn btn-secondary btn-sm" onClick={() => onCreateType('Man-month')} title="Create a Man-month project (no quote)"><Icon name="calendar" size={14} /> Man-Month</button>
              <button className="btn btn-secondary btn-sm" onClick={() => onCreateType('Time-Sheet based')} title="Create a Time-Sheet based project (no quote)"><Icon name="clock" size={14} /> Time-Sheet</button>
            </div>
          </div>
        )}
        {visibleProjects.length > 0 && (
          <div className="search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input ref={searchRef} placeholder="Search projects…  ( / )" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </div>
      <div className="project-list">
        {visibleProjects.length === 0 ? (
          <div className="empty-sidebar">
            {isManager
              ? <>No projects yet.<br />Create one to get started.</>
              : <>No projects assigned to you yet.<br />A Manager or Company Admin assigns your projects.</>}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-sidebar">No matches for “{search}”.</div>
        ) : (
          <ProjectTree
            projects={filtered}
            statusMap={statusMap}
            selectedId={selectedId}
            onSelect={pick}
            searching={!!search.trim()}
            unseenByProject={unseenByProject}
          />
        )}
      </div>
      {(visibleProjects.length > 0 || archivedCount > 0) && (
        <div className="sidebar-footer">
          <span>{visibleProjects.length} project{visibleProjects.length !== 1 ? 's' : ''}</span>
          {archivedCount > 0 && (
            <button className="archive-toggle" onClick={() => setShowArchived((v) => !v)}>
              {showArchived && <Icon name="checkCircle" size={13} />} Show archived ({archivedCount})
            </button>
          )}
        </div>
      )}
      </aside>
    </>
  )
}
