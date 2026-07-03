import React from 'react'

/**
 * Lightweight stroke-based icon set (24px grid, currentColor) replacing emoji
 * used as structural/navigation icons. Consistent 2px stroke, round joins.
 */
export type IconName =
  | 'menu' | 'search' | 'bell' | 'settings' | 'sun' | 'moon' | 'plus' | 'logout'
  | 'close' | 'arrowLeft' | 'download' | 'upload' | 'archive' | 'restore' | 'trash'
  | 'edit' | 'refresh' | 'clock' | 'calendar' | 'inbox' | 'users' | 'user' | 'userPlus'
  | 'checkSquare' | 'checkCircle' | 'target' | 'sparkles' | 'grid' | 'folder' | 'folderIn'
  | 'barChart' | 'pin' | 'brain' | 'clipboard' | 'play' | 'pause' | 'hourglass' | 'send'
  | 'help' | 'ruler' | 'wrench' | 'building' | 'hardHat' | 'cog' | 'road' | 'sofa' | 'tree' | 'map'
  | 'file' | 'bellRing' | 'party' | 'trendingUp' | 'home' | 'quote' | 'chevronDown' | 'externalLink' | 'sort'
  | 'chevronLeft' | 'chevronRight' | 'alertTriangle'

const P: Record<IconName, React.ReactNode> = {
  menu: <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>,
  search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  settings: <><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /><circle cx="9" cy="7" r="2" fill="var(--panel)" /><circle cx="15" cy="12" r="2" fill="var(--panel)" /><circle cx="8" cy="17" r="2" fill="var(--panel)" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" /><line x1="5" y1="5" x2="6.5" y2="6.5" /><line x1="17.5" y1="17.5" x2="19" y2="19" /><line x1="19" y1="5" x2="17.5" y2="6.5" /><line x1="6.5" y1="17.5" x2="5" y2="19" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
  close: <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>,
  arrowLeft: <><line x1="20" y1="12" x2="5" y2="12" /><polyline points="11 18 5 12 11 6" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><line x1="10" y1="13" x2="14" y2="13" /></>,
  restore: <><polyline points="3 4 3 10 9 10" /><path d="M3.5 14a9 9 0 1 0 2.1-9.4L3 7" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  refresh: <><polyline points="21 3 21 9 15 9" /><path d="M20 13a8 8 0 1 1-2-6.7L21 9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2.5" x2="8" y2="6" /><line x1="16" y1="2.5" x2="16" y2="6" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5 6l-3 6v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3-6a2 2 0 0 0-1.8-1.2H6.8A2 2 0 0 0 5 6z" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  userPlus: <><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" /></>,
  checkSquare: <><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><polyline points="8.5 12 11 14.5 16 9" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
  sparkles: <><path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  folderIn: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 13 12 16 12 10" transform="rotate(90 12 13)" /></>,
  barChart: <><line x1="4" y1="20" x2="20" y2="20" /><rect x="6" y="11" width="3" height="7" /><rect x="11" y="7" width="3" height="11" /><rect x="16" y="13" width="3" height="5" /></>,
  pin: <><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></>,
  brain: <><path d="M9 4a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 4 9c0 1 .5 1.8 1.2 2.3A2.6 2.6 0 0 0 4.5 13 2.5 2.5 0 0 0 7 15.5V18a2 2 0 0 0 2 2V4z" /><path d="M15 4a2.5 2.5 0 0 1 2.5 2.5A2.5 2.5 0 0 1 20 9c0 1-.5 1.8-1.2 2.3.5.5.7 1.1.7 1.7A2.5 2.5 0 0 1 17 15.5V18a2 2 0 0 1-2 2V4z" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><rect x="9" y="2.5" width="6" height="3.5" rx="1" /><line x1="8.5" y1="11" x2="15.5" y2="11" /><line x1="8.5" y1="15" x2="13.5" y2="15" /></>,
  play: <polygon points="7 5 19 12 7 19" fill="currentColor" stroke="none" />,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /></>,
  hourglass: <><path d="M6 3h12M6 21h12" /><path d="M7 3c0 4 5 5 5 9s-5 5-5 9" /><path d="M17 3c0 4-5 5-5 9s5 5 5 9" /></>,
  send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3.2" /><line x1="12" y1="17" x2="12" y2="17" /></>,
  ruler: <><path d="M16 2l6 6L8 22l-6-6z" /><path d="M7 9l2 2M10 6l2 2M13 12l2 2M16 9l2 2" /></>,
  wrench: <path d="M14.5 4.5a4 4 0 0 0-5 5L3 16v5h5l6.5-6.5a4 4 0 0 0 5-5l-3 3-2-2z" />,
  building: <><rect x="5" y="3" width="14" height="18" rx="1" /><line x1="9" y1="7" x2="9" y2="7" /><line x1="9" y1="11" x2="9" y2="11" /><line x1="15" y1="7" x2="15" y2="7" /><line x1="15" y1="11" x2="15" y2="11" /><path d="M10 21v-4h4v4" /></>,
  hardHat: <><path d="M3 16a9 9 0 0 1 18 0" /><rect x="2" y="16" width="20" height="3" rx="1" /><path d="M10 7a2 2 0 0 1 4 0v2" /></>,
  cog: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></>,
  road: <><path d="M5 21L8 3M19 21L16 3" /><line x1="12" y1="5" x2="12" y2="8" /><line x1="12" y1="11" x2="12" y2="14" /><line x1="12" y1="17" x2="12" y2="20" /></>,
  sofa: <><path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" /><path d="M2 14a2 2 0 0 1 2-2 2 2 0 0 1 2 2v3h12v-3a2 2 0 0 1 4 0v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" /></>,
  tree: <><path d="M12 2L7 9h3l-4 6h5v5h2v-5h5l-4-6h3z" /></>,
  map: <><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><polyline points="14 3 14 8 19 8" /></>,
  bellRing: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /><path d="M3.5 6a6 6 0 0 1 2-3M20.5 6a6 6 0 0 0-2-3" /></>,
  party: <><path d="M4 20l5-13 8 8z" /><path d="M14 6c1-1 3-1 4 0M16 3c0 1 0 2 1 3M20 9c-1 0-2 0-3 1" /></>,
  trendingUp: <><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></>,
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" /><path d="M9 21v-6h6v6" /></>,
  chevronDown: <polyline points="6 9 12 15 18 9" />,
  externalLink: <><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
  quote: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 7.5v9" /><path d="M14.4 9.3c-.5-.7-1.4-1.1-2.4-1.1-1.4 0-2.4.8-2.4 1.9 0 1.2 1 1.6 2.4 1.9s2.4.7 2.4 1.9c0 1.1-1 1.9-2.4 1.9-1 0-1.9-.4-2.4-1.1" /></>,
  sort: <><path d="M8 4v16" /><polyline points="4 8 8 4 12 8" /><path d="M16 20V4" /><polyline points="12 16 16 20 20 16" /></>,
  chevronLeft: <polyline points="15 18 9 12 15 6" />,
  chevronRight: <polyline points="9 18 15 12 9 6" />,
  alertTriangle: <><path d="M12 3.5 2 20.5h20z" /><line x1="12" y1="9.5" x2="12" y2="14" /><line x1="12" y1="17.2" x2="12" y2="17.2" /></>
}

interface Props {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
  style?: React.CSSProperties
}

export default function Icon({ name, size = 18, className, strokeWidth = 2, style }: Props): React.JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  )
}

// Discipline → icon mapping (used app-wide for project category glyphs).
const DISC: Record<string, IconName> = {
  Architecture: 'building',
  Structural: 'hardHat',
  MEP: 'cog',
  Civil: 'road',
  Interior: 'sofa',
  Landscape: 'tree',
  'Urban Planning': 'map',
  Other: 'folder'
}

export function disciplineIconName(discipline?: string): IconName {
  return (discipline && DISC[discipline]) || 'grid'
}

export function DisciplineIcon({ discipline, size = 18, className, style }: { discipline?: string; size?: number; className?: string; style?: React.CSSProperties }): React.JSX.Element {
  return <Icon name={disciplineIconName(discipline)} size={size} className={className} style={style} />
}
