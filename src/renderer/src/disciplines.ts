// The three core disciplines. A project or member may have any combination of
// these (stored as a comma-separated string, e.g. "Architecture, Structural").
export const DISCIPLINES = [
  'Architecture',
  'Structural',
  'MEP'
]

/** Split a stored discipline value into its individual disciplines. */
export function splitDisciplines(value?: string | null): string[] {
  return String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

// Discipline icons now live in components/Icon.tsx (DisciplineIcon / disciplineIconName).
