import { useState } from 'react'
import { Project } from '../types'
import { useApp } from '../context/AppContext'
import Icon from './Icon'
import AllocationModal from './AllocationModal'
import TaskAllocationModal from './TaskAllocationModal'
import AssignmentsModal from './AssignmentsModal'

interface Props {
  projects: Project[]
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
  onChanged: () => void
}
type Tab = 'work' | 'task' | 'assign'

// One full-page screen for the three allocation tools, switched by a prominent
// toggle (like Approvals / Overall Health). The sub-tools render in `embedded`
// mode so the hub owns the ← Back and the tab bar.
export default function AllocationHub({ projects, onClose, onToast, onChanged }: Props) {
  const { isLead } = useApp()
  // Work allocation & Assign projects are Team Lead+; Project Leads get Task only.
  const [tab, setTab] = useState<Tab>(isLead ? 'work' : 'task')

  return (
    <>
      <div className="tab-toolbar" style={{ flexShrink: 0 }}>
        <div className="tab-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}><Icon name="arrowLeft" size={14} /> Back</button>
          <div className="exec-tabs" style={{ margin: 0 }}>
            {isLead && <button className={`exec-tab${tab === 'work' ? ' active' : ''}`} onClick={() => setTab('work')}><Icon name="calendar" size={16} /> Work allocation</button>}
            <button className={`exec-tab${tab === 'task' ? ' active' : ''}`} onClick={() => setTab('task')}><Icon name="checkSquare" size={16} /> Task allocation</button>
            {isLead && <button className={`exec-tab${tab === 'assign' ? ' active' : ''}`} onClick={() => setTab('assign')}><Icon name="pin" size={16} /> Include </button>}
          </div>
        </div>
      </div>
      {tab === 'work' && isLead && <AllocationModal projects={projects} onClose={onClose} onToast={onToast} embedded />}
      {tab === 'task' && <TaskAllocationModal projects={projects} onClose={onClose} onToast={onToast} embedded />}
      {tab === 'assign' && isLead && <AssignmentsModal projects={projects} onClose={onClose} onToast={onToast} onChanged={onChanged} embedded />}
    </>
  )
}
