import { useState } from 'react'
import { OrgNode, ORG_TREE, avatarColor } from '../orgData'
import Icon from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'

function countPeople(node: OrgNode): number {
  const self = node.group ? 0 : 1
  return self + (node.children?.reduce((s, c) => s + countPeople(c), 0) ?? 0)
}

function TreeNode({ node, depth }: { node: OrgNode; depth: number }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const kids = node.children ?? []
  const hasKids = kids.length > 0

  return (
    <li className="org-li">
      <div className={`org-node${node.group ? ' org-group' : ''}`}>
        {hasKids ? (
          <button className="org-toggle" onClick={() => setOpen((o) => !o)} title={open ? 'Collapse' : 'Expand'}>
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
          </button>
        ) : (
          <span className="org-toggle org-toggle-leaf">•</span>
        )}

        {node.group ? (
          <span className="org-dept">
            {node.name}
            {node.role && <span className="org-dept-sub">{node.role}</span>}
          </span>
        ) : (
          <span className="org-person">
            <span className="org-avatar" style={{ background: avatarColor(node.initials || node.name) }}>
              {node.initials || node.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="org-person-text">
              <span className="org-name">{node.name}</span>
              {node.role && <span className="org-role">{node.role}</span>}
            </span>
          </span>
        )}

        <span className="org-tags">
          {node.location && (
            <span className={`org-tag ${node.location === 'WFH' ? 'org-tag-wfh' : 'org-tag-ho'}`}>{node.location}</span>
          )}
          {typeof node.team === 'number' && <span className="org-tag org-tag-team" title="Team size"><Icon name="users" size={12} /> {node.team}</span>}
        </span>
      </div>

      {hasKids && open && (
        <ul className="org-ul">
          {kids.map((c, i) => (
            <TreeNode key={`${c.name}-${i}`} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function OrgChartModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  useEscapeKey(onClose)
  const total = countPeople(ORG_TREE)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal org-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Icon name="building" size={18} /> Organization</h3>
          <button className="btn-icon" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="org-subhead">
          Tesla Outsourcing Services — {total} people · Ahmedabad, Gujarat (H.O)
        </div>
        <div className="org-body">
          <ul className="org-ul org-root">
            <TreeNode node={ORG_TREE} depth={0} />
          </ul>
        </div>
      </div>
    </div>
  )
}
