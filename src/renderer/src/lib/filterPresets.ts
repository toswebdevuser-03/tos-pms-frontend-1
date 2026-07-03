/**
 * Reusable filter presets — shared FilterConfig builders so features filter the
 * same entity identically (built on the useFilters hook / FilterBar). Features can
 * spread a preset and override, e.g. useFilters(rows, { ...taskFilters(), dateKey: 'due' }).
 */
import { FilterConfig } from '../components/FilterBar'

export const memberFilters = (): FilterConfig => ({
  searchKeys: ['name', 'email'],
  searchPlaceholder: 'Search members…',
  selects: [
    { key: 'role', label: 'Role' },
    { key: 'discipline', label: 'Discipline' },
    { key: 'status', label: 'Status', options: ['active', 'left'] }
  ]
})

export const taskFilters = (): FilterConfig => ({
  searchKeys: ['name', 'assignee'],
  searchPlaceholder: 'Search tasks…',
  selects: [
    { key: 'status', label: 'Status', options: ['Not Started', 'In Progress', 'Done'] },
    { key: 'assignee', label: 'Assignee' }
  ],
  dateKey: 'deadline', dateLabel: 'Deadline'
})

export const quoteFilters = (): FilterConfig => ({
  searchKeys: ['quote_no', 'client_name', 'project_name'],
  searchPlaceholder: 'Search quotations…',
  selects: [{ key: 'client_name', label: 'Client' }],
  dateKey: 'date', dateLabel: 'Date'
})

export const overtimeFilters = (): FilterConfig => ({
  searchKeys: ['memberName', 'reason'],
  searchPlaceholder: 'Search overtime…',
  selects: [
    { key: 'status', label: 'Status', options: ['pending', 'approved', 'rejected'] },
    { key: 'memberName', label: 'Member' }
  ],
  dateKey: 'date', dateLabel: 'Date'
})

// Project rows (discipline derives distinct so multi-discipline combos still appear).
export const projectFilters = (): FilterConfig => ({
  searchKeys: ['name', 'client', 'discipline'],
  searchPlaceholder: 'Search projects…',
  selects: [{ key: 'discipline', label: 'Discipline' }]
})
