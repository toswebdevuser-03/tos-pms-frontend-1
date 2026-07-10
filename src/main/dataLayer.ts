/**
 * The single seam between the IPC handlers and the actual data store.
 * Picks the local JSON implementation or the remote HTTP client based on
 * config.storageMode. Both modules expose identical async signatures, so
 * handlers just import from here and never care which backend is live.
 *
 * (Mode is fixed for the session; changing it takes effect on next launch.)
 */
import { config } from './config'
import * as local from './database'
import * as remote from './remoteClient'

export type { Row } from './database'

const impl: typeof local = config.storageMode === 'remote' ? remote : local

export const {
  getSettings,
  updateSettings,
  membersGetAll,
  memberCreate,
  memberUpdate,
  memberUpdateSkills,
  memberSetActive,
  memberDelete,
  memberById,
  projectMembersGet,
  projectMembersAll,
  projectMemberAssign,
  projectMemberUnassign,
  projectsGetAll,
  projectById,
  projectCreate,
  projectUpdate,
  projectDelete,
  projectSetArchived,
  itemsGetByProject,
  itemCreate,
  itemUpdate,
  itemDelete,
  statusesGetAll,
  allOpenWip,
  allDispatches,
  allTasks,
  allTimesheets,
  allQc,
  allRfis,
  attachmentsGet,
  attachmentsGetMany,
  attachmentGet,
  attachmentAdd,
  attachmentUpdateDescription,
  attachmentUpdate,
  attachmentDelete
} = impl
