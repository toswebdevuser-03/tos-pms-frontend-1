/**
 * Query Key Factory — Single source of truth for all TanStack Query cache keys.
 *
 * Per CODING_STANDARDS.md: "Query keys come from QueryKeyFactory".
 * Every hook and the WebSocket invalidator must import from here.
 * Never hardcode ['projects'], ['members'], etc. directly.
 */

export const queryKeyFactory = {
  projects: {
    all: () => ['projects'] as const,
    detail: (id: number) => ['projects', id] as const,
    counts: (id: number) => ['projects', id, 'counts'] as const,
  },
  projectCounts: {
    detail: (id: number) => ['projects', id, 'counts'] as const,
  },
  statuses: {
    all: () => ['statuses'] as const,
  },
  members: {
    all: () => ['members'] as const,
    detail: (id: number) => ['members', id] as const,
  },
  projectMembers: {
    all: () => ['projectMembers'] as const,
    byProject: (projectId: number) => ['projectMembers', projectId] as const,
  },
  reminders: {
    all: () => ['reminders'] as const,
  },
  tasks: {
    all: () => ['tasks'] as const,
  },
  timesheets: {
    all: () => ['timesheets'] as const,
  },
  qc: {
    all: () => ['qc'] as const,
  },
  rfis: {
    all: () => ['rfis'] as const,
  },
  quotes: {
    all: () => ['quotes'] as const,
  },
  clients: {
    all: () => ['clients'] as const,
  },
  items: {
    all: () => ['items'] as const,
    byType: (type: string) => ['items', type] as const,
    byProject: (type: string, projectId: number) => ['items', type, projectId] as const,
  },
}
