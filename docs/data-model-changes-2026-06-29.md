# Data Model Changes — Monday 2026-06-29 → 2026-07-01

New entities, tables, and column additions introduced in this week's work batch.

> **How this was scoped.** The last git commit is `a37c79c` (2026-06-23); everything
> since is uncommitted in the working tree. This document covers files whose
> modification time falls on/after **Mon 2026-06-29**, cross-checked against the
> Prisma schema (`server/prisma/schema.prisma`), the REST routes
> (`server/src/routes.ts`), and the item JSON shapes in the renderer tabs.
> Authoritative source for tables = the Prisma schema.

---

## 1. New database tables (3)

| Table | Prisma model | Purpose | API surface | Access |
|-------|--------------|---------|-------------|--------|
| `clients` | `Client` | Client registry — one record per client, reused across all their projects to avoid duplicate client info. | `GET/POST/PUT/DELETE /api/clients` | Read: any authed user (pick a client). Manage: Team Lead+ (`Admin`). |
| `quotes` | `Quote` | Standalone project quotation created before a project exists (for prospects). Fixed BIM scope-and-hours template; all fields in `data` JSON. Deliberately **not** linked to a Project. | `GET/POST/PUT/DELETE /api/quotes` | Team Lead+ (`Admin`) only. |
| `overtime_requests` | `OvertimeRequest` | Per-member, per-day overtime request. Approved hours extend that day's 8.5h task-allocation capacity; pending/rejected do not count. | `GET/POST /api/overtime`, `PUT /api/overtime/:id/decide` | Members see own; Team Lead+ see all. Two-stage decide (Lead → Manager). |

### 1a. `clients` — columns

| Column (DB) | Field (Prisma) | Type | Notes |
|-------------|----------------|------|-------|
| `id` | `id` | Int PK | autoincrement |
| `code` | `code` | String **unique** | human-readable id, `CL-0001` |
| `name` | `name` | String **unique** | client name (denormalized onto `projects.client`) |
| `company` | `company` | String | |
| `contact` | `contact` | String | legacy (no longer edited in UI) |
| `email` | `email` | String | legacy |
| `phone` | `phone` | String | legacy |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | DateTime | audit |
| `created_by` / `updated_by` | `createdBy` / `updatedBy` | String | audit |
| `version` | `version` | Int | optimistic-concurrency stamp |

Relation: `Client.projects → Project[]` (a client owns many projects).

### 1b. `quotes` — columns

| Column (DB) | Field (Prisma) | Type | Notes |
|-------------|----------------|------|-------|
| `id` | `id` | Int PK | autoincrement |
| `data` | `data` | Json | full template: `quote_no`, `date`, `client_name`, `project_name`, `project_hours`, `qc_hours` + detailed scope of work |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | DateTime | audit |
| `created_by` / `updated_by` | `createdBy` / `updatedBy` | String | audit |
| `version` | `version` | Int | |

No FK to `projects` (standalone by design).

### 1c. `overtime_requests` — columns

| Column (DB) | Field (Prisma) | Type | Notes |
|-------------|----------------|------|-------|
| `id` | `id` | Int PK | autoincrement |
| `member_id` | `memberId` | Int FK → `members.id` | `onDelete: Cascade`, indexed |
| `date` | `date` | String | `YYYY-MM-DD` |
| `hours` | `hours` | Float | default 0 |
| `status` | `status` | String | `pending` \| `approved` \| `rejected` |
| `reason` | `reason` | String | |
| `requested_at` | `requestedAt` | DateTime | |
| `decided_by` | `decidedBy` | String | who approved/rejected |

Relation: `OvertimeRequest.member → Member` (and `Member.overtimeRequests → OvertimeRequest[]`).

---

## 2. New columns on existing tables

### `members`
| Column (DB) | Field | Type | Purpose |
|-------------|-------|------|---------|
| `engagement` | `engagement` | String (`""` \| `Man-month` \| `Miscellaneous`) | member engagement type |
| — | `overtimeRequests` | relation | reverse side of `overtime_requests` FK |

### `projects`
| Column (DB) | Field | Type | Purpose |
|-------------|-------|------|---------|
| `type` | `type` | String (`""` standard \| `Man-month` \| `Miscellaneous`) | project engagement type |
| `deleted_at` | `deletedAt` | DateTime? (nullable) | **soft delete** → recycle bin; auto-purged 15 days later |
| `client_id` | `clientId` | Int? FK → `clients.id` | link to the Client registry (`onDelete: SetNull`); `client` name kept denormalized |
| — | `clientRef` | relation | resolved `Client` record |

**Recycle bin** (built on `projects.deleted_at`, no new table):
- `POST /api/projects/:id/restore` — restore within 15 days (project guard).
- `DELETE /api/projects/:id/purge` — hard delete, **Company Admin only**.
- Delete route now sets `deleted_at` instead of removing the row.

---

## 3. Changed entity shapes (JSON `data`, no new table)

These reuse existing item tables (`rfis`, `queries`, `qc_items`, `timesheets`,
`dispatches`, `project_feedback`) but the stored JSON shape changed this week.

| Entity (table) | What changed | Key `data` fields |
|----------------|--------------|-------------------|
| RFI / Query (`rfis`, `queries`) | Rewritten to **multi-point containers** (each point = text + image + response). Auto-numbered `RFI-ARC-001` / `QRY-STR-001`. `Discipline` replaces `Subject`. | `points[]`, `discipline`, per-point `response_image` |
| QC item (`qc_items`) | Path-based + **multi-assignee**; timed via Task Timer → correction hours. | `checklist_item`, `path`, `assigned_member_ids` (comma list; legacy `assigned_member_id`), `inspection_date`, `result` (Pending/In Progress/Pass/Fail) |
| Timesheet (`timesheets`) | Manual entries now use **two-stage approval** (Lead → Manager); overtime mirrors it. | `approval` (`pending_lead` → `pending_manager` → approved), `pending`, `correction_hrs`, `overtime_hrs` |
| Dispatch (`dispatches`) | Absorbed the old **WIP** feature (one scheduled tab). `wip_tasks` table retained for legacy/migrated rows. | dispatch schedule fields |
| Project status (`project_status`) | Status set changed: `Yet to start` / `On-going` / `On-hold` / `Dispatched` / `Closed` (was `Completed`). Dashboards/risk treat `Closed` as done. Cannot set `Closed` until every assigned member (below Manager rank) has feedback. | `overall`, `notes` |
| Feedback (`project_feedback`) | Rank-gated: feedback is about a lower-ranked `member_id` by `rater_id`; visible only to higher ranks. | `member_id`, `rater_id`, ratings |

---

## 4. Entity-relationship summary (new/changed edges)

```
Client (clients) ──< Project (projects)          [projects.client_id → clients.id, SetNull]
Member (members) ──< OvertimeRequest             [overtime_requests.member_id → members.id, Cascade]
Quote  (quotes)  ── (standalone, no FK)
Project.deleted_at ── soft-delete / recycle-bin state (no new table)
```

---

## 5. At-a-glance

- **New tables:** `clients`, `quotes`, `overtime_requests` (3).
- **New columns:** `members.engagement`; `projects.type`, `projects.deleted_at`, `projects.client_id` (+ `clientRef`, `overtimeRequests` relations).
- **New/changed relations:** `Client → Project[]`, `Member → OvertimeRequest[]`.
- **New feature state without a table:** recycle bin (`projects.deleted_at` + restore/purge routes).
- **Reshaped JSON entities:** RFI/Query (multi-point), QC (multi-assignee + path), Timesheet (two-stage approval), Dispatch (absorbed WIP), Status (new set + close gate), Feedback (rank-gated).
