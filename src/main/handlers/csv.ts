import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'

export const CSV_COLUMNS: Record<string, string[]> = {
  rfi: ['rfi_number', 'subject', 'description', 'status', 'submitted_date', 'response', 'response_date'],
  query: ['query_number', 'subject', 'description', 'status', 'raised_date', 'response', 'resolved_date'],
  dispatch: ['dispatch_number', 'description', 'dispatch_date', 'recipient', 'status'],
  status: ['overall', 'notes', 'last_updated'],
  wip: ['task_name', 'instructions', 'assigned_member_id', 'planned_date', 'status'],
  qc: ['inspection_date', 'checklist_item', 'result', 'description', 'inspector'],
  timesheet: ['date', 'member_id', 'task', 'execution_hrs', 'discussion_hrs', 'qc_hrs', 'it_issue_hrs', 'overtime_hrs', 'productive_hrs', 'correction_hrs', 'total_hrs'],
  task: ['name', 'assigned_member_id', 'deadline', 'status'],
  standard: ['title', 'category', 'version', 'status', 'reference', 'path', 'description'],
  scope: ['title', 'path', 'notes'],
  meeting: ['title', 'date', 'path', 'notes'],
  input: ['title', 'path', 'notes']
}

export const COLUMN_LABELS: Record<string, string> = {
  rfi_number: 'RFI #', query_number: 'Query #', dispatch_number: 'Dispatch #',
  submitted_date: 'Submitted', response_date: 'Response Date', raised_date: 'Raised',
  resolved_date: 'Resolved', dispatch_date: 'Dispatch Date', planned_date: 'Planned Date',
  inspection_date: 'QA/QC Date', checklist_item: 'Title / Area', assigned_member_id: 'Assigned (id)',
  member_id: 'Member (id)', task_name: 'WIP Task', execution_hrs: 'Exec hrs', discussion_hrs: 'Disc hrs',
  qc_hrs: 'QC hrs', it_issue_hrs: 'IT hrs', correction_hrs: 'Correction hrs', overtime_hrs: 'OT hrs',
  total_hrs: 'Total hrs', productive_hrs: 'Productive hrs', last_updated: 'Last Updated', path: 'Path'
}

export function columnLabel(key: string): string {
  return COLUMN_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// minimal CSV parser: handles quoted fields, "" escapes, and \r\n / \n rows
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''))
  if (nonEmpty.length < 2) return []
  const headers = nonEmpty[0].map((h) => h.trim())
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim() })
    return obj
  })
}

function toCSV(rows: Record<string, unknown>[], cols: string[]): string {
  const header = cols.join(',')
  const lines = rows.map((row) =>
    cols
      .map((col) => {
        const val = String(row[col] ?? '')
        return `"${val.replace(/"/g, '""')}"`
      })
      .join(',')
  )
  return [header, ...lines].join('\r\n')
}

export function registerCsvHandler(): void {
  ipcMain.handle(
    'csv:export',
    async (_e, { type, projectName, rows }: { type: string; projectName: string; rows: Record<string, unknown>[] }) => {
      try {
        const win = BrowserWindow.getFocusedWindow()
        const cols = CSV_COLUMNS[type] || Object.keys(rows[0] || {})
        const csv = toCSV(rows, cols)

        const safeName = projectName.replace(/[^a-z0-9_\- ]/gi, '_')
        const { canceled, filePath } = await dialog.showSaveDialog(win!, {
          defaultPath: `${safeName}_${type}.csv`,
          filters: [{ name: 'CSV Files', extensions: ['csv'] }]
        })

        if (canceled || !filePath) return { ok: true, data: { filePath: null } }
        fs.writeFileSync(filePath, csv, 'utf8')
        return { ok: true, data: { filePath } }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    }
  )

  // Import: pick a CSV file, parse it, return rows for the renderer to create.
  ipcMain.handle('csv:import', async (_e, { type }: { type: string }) => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const res = await dialog.showOpenDialog(win!, {
        title: 'Select a CSV file to import',
        properties: ['openFile'],
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
      })
      if (res.canceled || !res.filePaths.length) return { ok: true, data: { rows: [] } }

      const text = fs.readFileSync(res.filePaths[0], 'utf8')
      const parsed = parseCSV(text)
      const allowed = CSV_COLUMNS[type]
      // keep only known columns for this type (drop id/created_at/etc.)
      const rows = parsed.map((r) => {
        const out: Record<string, string> = {}
        for (const k of allowed) if (r[k] !== undefined) out[k] = r[k]
        return out
      }).filter((r) => Object.values(r).some((v) => v !== ''))

      return { ok: true, data: { rows } }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
}
