import { useState } from 'react'
import { Project } from '../types'
import Icon from './Icon'
import SkillsModal from './SkillsModal'
import PerformanceModal from './PerformanceModal'
import { useEscapeKey } from '../lib/useEscapeKey'

interface Props {
  projects: Project[]
  onClose: () => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}
type Tab = 'skills' | 'performance'

// Team capability in one place: Skills (self + directory) and Performance
// (feedback-based ratings), switched by a prominent toggle.
export default function TalentModal({ projects, onClose, onToast }: Props) {
  useEscapeKey(onClose)
  const [tab, setTab] = useState<Tab>('skills')
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 900, maxWidth: '96vw' }}>
        <div className="modal-header">
          <h3><Icon name="brain" size={18} /> Talent</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="exec-tabs">
            <button className={`exec-tab${tab === 'skills' ? ' active' : ''}`} onClick={() => setTab('skills')}><Icon name="brain" size={16} /> Skills</button>
            <button className={`exec-tab${tab === 'performance' ? ' active' : ''}`} onClick={() => setTab('performance')}><Icon name="barChart" size={16} /> Performance</button>
          </div>
          {tab === 'skills'
            ? <SkillsModal embedded onClose={onClose} onToast={onToast} />
            : <PerformanceModal embedded projects={projects} onClose={onClose} />}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
