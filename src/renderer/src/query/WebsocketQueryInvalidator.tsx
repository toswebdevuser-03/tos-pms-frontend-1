/**
 * WebsocketQueryInvalidator — Centralized WebSocket → TanStack Query cache invalidation.
 *
 * Subscribes to all real-time WebSocket events and invalidates the correct query
 * cache keys so components automatically re-fetch fresh data.
 *
 * This is the ONLY place WS events should trigger cache invalidation.
 * DataContext and App.tsx no longer subscribe to WS for data-refreshing — they
 * rely on TanStack Query's cache being invalidated here.
 *
 * Invalidation mapping (per CODING_STANDARDS.md Cache Invalidation Rules):
 *   project       → projects, statuses, reminders (project changes affect reminder count)
 *   status        → statuses
 *   member        → members
 *   projectMember → projectMembers
 *   item (task)         → tasks, reminders
 *   item (timesheet)    → timesheets
 *   item (qc)           → qc
 *   item (wip/dispatch) → tasks, reminders (affect reminder calculations)
 *   item (other)        → tasks
 *   reminder      → reminders
 *   quote         → quotes
 *   client        → clients
 *   attachment    → (no global cache — attachments are loaded per-entity)
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApp } from '../context/AppContext'
import { queryKeyFactory } from '../hooks/queryKeyFactory'

export function useWebsocketQueryInvalidator() {
  const qc = useQueryClient()
  const { authMode } = useApp()

  // Belt-and-suspenders: if the tab was backgrounded/suspended long enough
  // that the OS froze timers (so even our WS reconnect logic didn't run),
  // resync everything as soon as the tab is visible/focused again.
  useEffect(() => {
    if (authMode !== 'remote' && authMode !== 'local') return
    const onVisible = (): void => { if (document.visibilityState === 'visible') qc.invalidateQueries() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [qc, authMode])

  useEffect(() => {
    if (authMode !== 'remote' && authMode !== 'local') return

    const unsub = window.api.realtime.subscribe((evt: any) => {
      if (!evt?.entity) return

      switch (evt.entity) {
        case 'catchup':
          qc.invalidateQueries()
          break

        case 'project':
          qc.invalidateQueries({ queryKey: queryKeyFactory.projects.all() })
          qc.invalidateQueries({ queryKey: queryKeyFactory.statuses.all() })
          // Project changes can affect reminder scope
          qc.invalidateQueries({ queryKey: queryKeyFactory.reminders.all() })
          break

        case 'status':
          qc.invalidateQueries({ queryKey: queryKeyFactory.statuses.all() })
          break

        case 'member':
          qc.invalidateQueries({ queryKey: queryKeyFactory.members.all() })
          break

        case 'projectMember':
          qc.invalidateQueries({ queryKey: queryKeyFactory.projectMembers.all() })
          // Project visibility depends on BOTH projects and projectMembers caches.
          // When assignments are created/updated, ensure projects is also refreshed.
          qc.invalidateQueries({ queryKey: queryKeyFactory.projects.all() })
          break

        case 'item': {
          const type = evt.type as string | undefined

          // Primary invalidation path: match what useItems(type, projectId) actually reads.
          if (evt.projectId != null && type) {
            qc.invalidateQueries({ queryKey: queryKeyFactory.items.byProject(type, evt.projectId) })
          }

          // Secondary invalidation for features driven by task-like entities.
          if (type === 'task') {
            qc.invalidateQueries({ queryKey: queryKeyFactory.tasks.all() })
            qc.invalidateQueries({ queryKey: queryKeyFactory.reminders.all() })
          } else if (type === 'timesheet') {
            qc.invalidateQueries({ queryKey: queryKeyFactory.timesheets.all() })
          } else if (type === 'qc') {
            qc.invalidateQueries({ queryKey: queryKeyFactory.qc.all() })
          } else if (type === 'rfi') {
            qc.invalidateQueries({ queryKey: queryKeyFactory.rfis.all() })
          } else if (type === 'wip' || type === 'dispatch') {
            // Wip/dispatch items have dates that drive reminder calculations
            qc.invalidateQueries({ queryKey: queryKeyFactory.tasks.all() })
            qc.invalidateQueries({ queryKey: queryKeyFactory.reminders.all() })
          }


          break
        }

        case 'reminder':
          qc.invalidateQueries({ queryKey: queryKeyFactory.reminders.all() })
          break

        case 'quote':
          qc.invalidateQueries({ queryKey: queryKeyFactory.quotes.all() })
          break

        case 'client':
          qc.invalidateQueries({ queryKey: queryKeyFactory.clients.all() })
          break

        case 'attachment':
          // Attachments are fetched per-entity (no global query key to invalidate).
          // Individual components that show attachments handle their own refetch.
          break

        default:
          break
      }
    })

    return unsub
  }, [qc, authMode])
}
