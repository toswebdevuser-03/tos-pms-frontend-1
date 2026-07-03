import { useState, useMemo, ReactNode } from 'react'
import Icon from './Icon'

/**
 * Reusable filter bar + state hook used across every feature that shows a list.
 *
 * Usage:
 *   const { filtered, bar } = useFilters(rows, {
 *     searchKeys: ['name', 'email'],
 *     selects: [{ key: 'role', label: 'Role' }, { key: 'status', label: 'Status', options: ['active','left'] }],
 *     dateKey: 'date'
 *   })
 *   return <>{bar}{filtered.map(...)}</>
 *
 * Select options are taken from `options` when given, otherwise derived from the
 * distinct values present in `rows` (so a dropdown always reflects real data).
 */
type Row = Record<string, unknown>

export interface SelectFilter {
  key: string
  label: string
  options?: string[]
}
export interface SortOption {
  key: string
  label: string
}
export interface FilterConfig {
  searchKeys?: string[] // keys included in the text search (default: every key on each row)
  searchPlaceholder?: string
  selects?: SelectFilter[]
  dateKey?: string // enable a from/to range over this YYYY-MM-DD key
  dateLabel?: string
  sorts?: SortOption[] // fields offered in the "Sort by" dropdown (defaults derived from selects + date)
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  right?: ReactNode // extra controls pinned to the right of the bar
}

const s = (v: unknown): string => String(v ?? '')

// Turn a raw row key into a readable Sort-by label: drop leading underscores,
// split snake_case / camelCase, then title-case ("project_name" → "Project Name").
function humanizeKey(key: string): string {
  return key
    .replace(/^_+/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Type-aware comparison: pure numbers numerically, everything else as natural
// (numeric-aware, case-insensitive) text so "RFI-ARC-2" sorts before "RFI-ARC-10"
// and dates (YYYY-MM-DD) sort chronologically. Blanks always sink to the bottom.
const NUM_RE = /^-?[\d,]*\.?\d+$/
function compareValues(a: unknown, b: unknown): number {
  const sa = s(a).trim()
  const sb = s(b).trim()
  if (sa === sb) return 0
  if (sa === '') return 1
  if (sb === '') return -1
  if (NUM_RE.test(sa) && NUM_RE.test(sb)) return Number(sa.replace(/,/g, '')) - Number(sb.replace(/,/g, ''))
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' })
}

export interface FilterChip {
  key: string
  label: string
  onRemove: () => void
}

interface BarProps {
  search: string
  onSearch: (v: string) => void
  selects: SelectFilter[]
  options: Record<string, string[]>
  values: Record<string, string>
  onSelect: (key: string, value: string) => void
  dateKey?: string
  dateLabel?: string
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  sorts: SortOption[]
  sortKey: string
  sortDir: 'asc' | 'desc'
  onSort: (key: string) => void
  onToggleDir: () => void
  placeholder?: string
  activeCount: number
  onClear: () => void
  total: number
  shown: number
  right?: ReactNode
  chips: FilterChip[]
}

export function FilterBar(p: BarProps) {
  return (
    <div className="filter-bar-wrap">
      <div className="filter-bar">
        <div className="filter-search">
          <Icon name="search" size={15} />
          <input
            value={p.search}
            placeholder={p.placeholder ?? 'Search…'}
            onChange={(e) => p.onSearch(e.target.value)}
          />
        </div>
        {p.selects.map((sel) => (
          <select key={sel.key} className="filter-select" value={p.values[sel.key] ?? ''} onChange={(e) => p.onSelect(sel.key, e.target.value)}>
            <option value="">All {sel.label.toLowerCase()}</option>
            {(p.options[sel.key] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {p.dateKey && (
          <div className="filter-dates">
            <span>{p.dateLabel ?? 'Date'}</span>
            <input type="date" value={p.from} onChange={(e) => p.onFrom(e.target.value)} title="From" />
            <span>–</span>
            <input type="date" value={p.to} onChange={(e) => p.onTo(e.target.value)} title="To" />
          </div>
        )}
        {p.sorts.length > 0 && (
          <div className="filter-sort" title="Sort by">
            <Icon name="sort" size={14} />
            <select className="filter-select" value={p.sortKey} onChange={(e) => p.onSort(e.target.value)} aria-label="Sort by">
              <option value="">Sort by…</option>
              {p.sorts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button
              type="button"
              className="btn-icon sort-dir"
              disabled={!p.sortKey}
              title={p.sortKey ? (p.sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending') : 'Pick a field to sort'}
              onClick={p.onToggleDir}
            >
              <Icon name="chevronDown" size={14} style={p.sortDir === 'asc' ? { transform: 'rotate(180deg)' } : undefined} />
            </button>
          </div>
        )}
        <div className="filter-bar-right">
          {p.right}
          <span className="filter-count">{p.shown === p.total ? `${p.total}` : `${p.shown} / ${p.total}`}</span>
          {p.activeCount > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={p.onClear} title="Clear filters">
              <Icon name="close" size={13} /> Clear
            </button>
          )}
        </div>
      </div>
      {p.chips.length > 0 && (
        <div className="filter-chips">
          {p.chips.map((chip) => (
            <span key={chip.key} className="filter-chip">
              {chip.label}
              <button type="button" onClick={chip.onRemove} title={`Remove ${chip.label} filter`} aria-label={`Remove ${chip.label} filter`}>
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function useFilters(rows: Row[], config: FilterConfig = {}) {
  const [search, setSearch] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sortKey, setSortKey] = useState(config.defaultSort?.key ?? '')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(config.defaultSort?.dir ?? 'asc')

  const selects = config.selects ?? []
  const selectsKey = JSON.stringify(selects.map((x) => [x.key, x.options]))

  // Sort fields: explicit list if given, else derived so every list gets a
  // Sort-by menu — searchable columns first (primary identifier on top), then
  // each select, then the date field. Select/date labels win over humanized keys.
  const sorts: SortOption[] = useMemo(() => {
    if (config.sorts) return config.sorts
    const byKey = new Map<string, string>()
    for (const k of config.searchKeys ?? []) if (!byKey.has(k)) byKey.set(k, humanizeKey(k))
    for (const sel of selects) byKey.set(sel.key, sel.label)
    if (config.dateKey) byKey.set(config.dateKey, config.dateLabel ?? 'Date')
    return Array.from(byKey, ([key, label]) => ({ key, label }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config.sorts), JSON.stringify(config.searchKeys), selectsKey, config.dateKey, config.dateLabel])

  // Distinct option values for selects that don't supply explicit options.
  const options = useMemo(() => {
    const o: Record<string, string[]> = {}
    for (const sel of selects) {
      if (sel.options) { o[sel.key] = sel.options; continue }
      const set = new Set<string>()
      for (const r of rows) { const v = s(r[sel.key]).trim(); if (v) set.add(v) }
      o[sel.key] = Array.from(set).sort((a, b) => a.localeCompare(b))
    }
    return o
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selectsKey])

  const searchKeys = config.searchKeys
  const dateKey = config.dateKey
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (term) {
        const keys = searchKeys ?? Object.keys(r)
        if (!keys.some((k) => s(r[k]).toLowerCase().includes(term))) return false
      }
      for (const sel of selects) {
        const want = values[sel.key]
        if (want && s(r[sel.key]) !== want) return false
      }
      if (dateKey && (from || to)) {
        const d = s(r[dateKey]).slice(0, 10)
        if (!d) return false
        if (from && d < from) return false
        if (to && d > to) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, JSON.stringify(values), from, to, selectsKey, JSON.stringify(searchKeys), dateKey])

  // Apply the chosen sort on top of the filtered rows (no sort = original order).
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const copy = [...filtered]
    copy.sort((a, b) => {
      const r = compareValues(a[sortKey], b[sortKey])
      return sortDir === 'asc' ? r : -r
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const activeCount = (search.trim() ? 1 : 0) + Object.values(values).filter(Boolean).length + (from || to ? 1 : 0)
  const clear = (): void => { setSearch(''); setValues({}); setFrom(''); setTo('') }

  // One removable chip per currently-active filter, so each can be cleared
  // independently of the others (search, each select, and from/to separately).
  const chips: FilterChip[] = useMemo(() => {
    const list: FilterChip[] = []
    if (search.trim()) list.push({ key: '__search', label: `Search: "${search.trim()}"`, onRemove: () => setSearch('') })
    for (const sel of selects) {
      const v = values[sel.key]
      if (v) list.push({ key: sel.key, label: `${sel.label}: ${v}`, onRemove: () => setValues((cur) => { const next = { ...cur }; delete next[sel.key]; return next }) })
    }
    if (from) list.push({ key: '__from', label: `${config.dateLabel ?? 'Date'} from: ${from}`, onRemove: () => setFrom('') })
    if (to) list.push({ key: '__to', label: `${config.dateLabel ?? 'Date'} to: ${to}`, onRemove: () => setTo('') })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, JSON.stringify(values), from, to, selectsKey, config.dateLabel])

  const bar = (
    <FilterBar
      search={search} onSearch={setSearch}
      selects={selects} options={options} values={values}
      onSelect={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))}
      dateKey={dateKey} dateLabel={config.dateLabel}
      from={from} to={to} onFrom={setFrom} onTo={setTo}
      sorts={sorts} sortKey={sortKey} sortDir={sortDir}
      onSort={setSortKey} onToggleDir={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
      placeholder={config.searchPlaceholder}
      activeCount={activeCount} onClear={clear}
      total={rows.length} shown={sorted.length}
      right={config.right}
      chips={chips}
    />
  )
  // Header-click handler so a table's column headers can drive the same sort as
  // the Sort-by menu (click same key → toggle direction; new key → ascending).
  const onHeaderSort = (key: string): void => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  return { filtered: sorted, bar, search, values, from, to, clear, activeCount, sortKey, sortDir, onHeaderSort }
}
