# TOS Tracker — System Documentation

> **TOS Tracker** is a project-management application for Tesla Outsourcing Services.
> It tracks architectural/BIM projects end-to-end — from a client **quotation**, through
> **RFIs, queries, dispatches, WIP, QC, tasks, timesheets** and team allocation, to
> **executive dashboards, risk/forecast analytics and weekly digests**.

- **Version:** 1.0.0
- **Owner:** Tesla Outsourcing Services
- **Live web app:** https://tos-tracker-pi.vercel.app
- **Audience:** internal staff (≈ 80+ users) across Architecture, Structural and MEP disciplines.

For the technical/architecture view (topology, data model, request lifecycle, security),
see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. What the system is

TOS Tracker is a single-page web application backed by a Node/PostgreSQL service. It
began life as an Electron desktop app and was migrated to a browser-delivered SPA; the
desktop build still exists in the repo but the **web build is the deployed product**.

It gives every role a tailored view of the project portfolio:

- **Employees** log their time (mostly via a task timer), see their tasks and weekly plan.
- **Project / Team Leads** quote new work, manage project data, approve timesheets and overtime, and plan allocation.
- **Managers / Company Admins** get portfolio-wide dashboards, risk & budget forecasts, discipline roll-ups and email digests.

---

## 2. Roles & permissions

Roles form a strict hierarchy (high → low). Each higher role inherits everything below it.

| Role | Rank | Can do (in addition to lower roles) |
|------|:----:|-------------------------------------|
| **Company Admin** | 5 | Everything: settings, member logins, permanent (purge) delete, all projects |
| **Manager** | 4 | Stage-2 overtime approval; portfolio dashboards; projects in their discipline + assigned |
| **Team Lead** | 3 | Create quotations, approve timesheets, stage-1 overtime approval, assign projects, exec overview, discipline roll-up |
| **Project Lead** | 2 | Project-admin powers (edit/delete project data), restore from recycle bin |
| **Employee** | 1 | Log time, view own tasks / week / allocation |

Legacy role names are still recognized: **`Admin` = Team Lead**, **`Member` = Employee**.

> **Authorization is enforced on the server** from the signed-in user's JWT. The role is
> re-read from the database on every request, so a role change takes effect on the user's
> next page load — no re-login required.

The UI exposes four convenience flags derived from rank: `isAdmin` (≥ Project Lead),
`isLead` (≥ Team Lead), `isManager` (≥ Manager), `isCompanyAdmin` (= Company Admin).

---

## 3. Disciplines

Every project and member carries any combination of the three core disciplines, stored
as a comma-separated string (e.g. `"Architecture, Structural"`):

- **Architecture**
- **Structural**
- **MEP** (Mechanical / Electrical / Plumbing)

Managers are scoped to **their own discipline(s)** for visibility; Company Admins see all.
Disciplines roll up into the **Discipline roll-up** dashboard.

---

## 4. The workspace at a glance

### Top bar
- **Home** — returns to the main dashboard.
- **Workspace** (☰) — the feature menu (see §5).
- **Search** (`Ctrl+K`) — command palette across projects, members and items.
- **My Week**, **My Tasks**, **Inbox** (reminders) — personal views.
- Account: signed-in identity, role chip, **Change Password**, **Logout**.

### Sidebar
- **New quotation** (Team Lead+) — opens the Quotations feature (projects are created **only** by approving a quote — see §6).
- Project search + the **project tree** (grouped, with status), plus a **Show archived** toggle.

### Main area
- The **Dashboard** (default) or a docked **feature window** or an open **project**.
- Feature windows dock into the main area with a **← Back** control; only one is open at a time.

### Keyboard shortcuts
| Key | Action |
|-----|--------|
| `Ctrl/⌘ + K` | Command palette |
| `/` | Focus project search |
| `n` | New quotation (Team Lead+) |
| `Esc` | Close the current overlay / feature |

---

## 5. Workspace features (menu)

The Workspace drawer groups features into collapsible sections:

**My Workspace**
- **My allocation** — your day-by-day scheduled tasks (8.5h/day capacity + approved overtime).

**People & Organization**
- **Organization tree** — org chart of members by role.
- **Members** — directory; create/edit members (Company Admin manages logins).
- **Skills** — self-reported skill sets per member.
- **Performance** — per-member output & feedback rollup.

**Projects & Planning** (Project Lead+)
- **Work allocation** — plan who works on which project/task each day.
- **Task allocation** — assign tasks to members across projects.
- **Approvals** (Team Lead+) — one place for everything awaiting sign-off, with tabs: **Overtime** (two-stage OT approval, see §8) and **Timesheet** (manual missed-task entries, Team Lead → Manager).
- **Assign projects** (Team Lead+) — attach members to projects.
- **Overall Health** (Team Lead+) — one feature with a prominent toggle for two sub-views: **Executive Overview** (risk, utilization, budget forecast, email digest) and **Discipline Roll-up** (projects/tasks/hours/team per discipline, drill-in, CSV).

**Sales & Clients**
- **Quote a project** (Team Lead+) — create/approve quotations (see §6).
- **Clients & dashboard** — one screen: the client registry (add/edit/delete, Team Lead+) as the left rail, the selected client's dashboard (KPIs, charts, projects) on the right, plus a date-range **Download timesheet** (Excel) across that client's projects.

**Data & Settings**
- **Export all data (CSV)** — dump every table for Power BI / Excel.
- **Recycle bin** (Project Lead+) — restore/purge soft-deleted projects (see §7).
- **Settings** (Company Admin) — SMTP & weekly-digest configuration.
- **Full-page windows** toggle, **theme** (light/dark) toggle.

---

## 6. Quotations → Projects

Projects are **not created manually**. The flow is:

1. A **Team Lead+** opens **Quote a project** and clicks **New quotation**.
2. They fill the company's fixed BIM template — header (Date, Quotation No., Client,
   Project, Project Hours, QC Hours) plus a detailed **Scope of Work** (Type of Building,
   **Disciplines** multiselect, **LOD** 100–500, Tolerance, Type of Project, Area, Units,
   Software, Inputs Received, Output Deliverable, Inputs Required, Exclusions, Note).
3. The quotation can be **printed/exported to PDF or Word (.doc)** on the company letterhead,
   and marked **Sent** to the client (toggle + “Sent” badge).
4. Clicking **Approve & create project**:
   - creates the **project once** (name/client/discipline; quoted hours = Project + QC hours),
   - **auto-assigns the approver** so it's always visible to them,
   - writes a single consolidated **Scope of Work document** into the project's Scope tab,
   - and opens the new project.
5. **Re-saving an approved quote** keeps the linked project in sync (name/client/discipline/quoted
   hours) and refreshes its scope document.

Quote numbers auto-suggest as `TOS-Q-YYYY-NNN`. A quote shows **Draft / Approved** and
**Sent** badges in the list.

---

## 7. Projects & the project workspace

Opening a project shows tabbed sections:

| Tab | Purpose |
|-----|---------|
| **Dashboard** | KPIs, hour breakdown, task completion, **burn-up & budget forecast**, risk |
| **RFI** | Requests for information (with attachments, response tracking) |
| **Query** | Project queries |
| **Dispatch** | Outgoing deliveries/dispatches |
| **WIP** | Work-in-progress items |
| **QC** | Quality-control checks |
| **Tasks** | Task list with assignee, deadline, status |
| **Timesheet** | Logged hours (see §8) |
| **Standards / Scope / Inputs / Meetings / Feedback** | Reference & collaboration records |
| **Status** | Overall status (On-going / On-hold / Completed) + notes |
| **Members** | Team assigned to the project |

Most tabs share a common **CRUD table** with filtering, Excel export, attachments and
inline add/edit/delete (gated by role).

### Deleting a project — Recycle Bin
Deleting a project **soft-deletes** it into a **15-day recycle bin** (it does not vanish):
- **Restore** (Project Lead+) returns it to active.
- **Purge** (Company Admin) permanently removes it.
- Items older than 15 days are **auto-purged** hourly.
- Deleting a project also **unlinks/unapproves its source quotation** (the quote's
  “Approve & create project” becomes available again).

---

## 8. Time tracking, timesheets & overtime

### Timesheets are timer-first
- **Execution hours** are captured by the **Task Timer** — a floating, draggable stopwatch
  that can **pop out into its own always-on-top window**. Pick an assigned task, start/stop,
  and it logs the elapsed time as execution hours and updates the task status.
- The generic “add a row” form on the Timesheet tab is **removed**. Other hours are added
  via a constrained **Log time** dialog:
  - **IT issue hours**
  - **Discussion hours**
  - **Missed task time** (catch-up against an assigned task you forgot to time)

### Manual entries need approval
Every manually logged entry is created **Pending** and **does not count anywhere**
(project totals, dashboards, exec overview, discipline roll-up, client dashboard, budget
reminders) until a **Team Lead** approves it (Approve/Reject in the Timesheet **Status**
column). Timer entries count immediately.

Productive hours = **execution + overtime**. The Timesheet tab also shows quoted vs.
productive vs. remaining hours and a per-member summary (approved entries only).

### Overtime — two-stage approval
Overtime is requested per member/day from **My allocation** ("Apply OT"). Approval is a
**hierarchy**:

1. **Project Lead / Team Lead** approves first → status `lead_approved`.
2. A **Manager+** then approves → status `approved`.

Overtime hours **only reflect** (raise that day's allocation capacity) **once both** stages
approve. Either stage can reject. The **Overtime approvals** screen shows the current stage
and only offers the action button to whoever can act on it.

---

## 9. Dashboards & analytics

### Home Dashboard
KPI cards (in order): **Yet to start** (active projects with zero productive hours logged —
i.e. approved but not begun), **On-going**, **On-hold**, **Completed**, **Total Projects**.
Each card filters the project list. Below: project-status & task-completion donuts, a
workload bar chart, an **Attention needed** panel (risk engine), the **Active Projects**
table (grouped by client, filterable by status / type / date range / search), a **Gantt
timeline**, and a 14-day **team workload heatmap**.

### Executive Overview (Team Lead+)
Portfolio KPIs (projects, at-risk, on-track %, utilization, forecast-over count, team),
portfolio-health & by-stage donuts, by-discipline bars, an **attention** list, a **budget
forecast** table of projected overruns, discipline utilization, and a one-click **email
digest**.

### Risk & forecast
- **Risk engine** rates each project Healthy / Watch / At-risk from stage, deadline, hours
  burned vs. quote, stale tasks and open RFIs/queries.
- **Forecast** projects final hours and a budget-exhaustion date from the recent burn rate.

---

## 10. Notifications & email

- **Inbox / Reminders** surfaces due/overdue WIP, dispatches and tasks, plus
  **budget reminders** (a project's productive hours reaching 80% of quoted).
- **Email** (backend SMTP) powers reminder emails and the **weekly digest**. Configure host/
  port/credentials and the digest schedule in **Settings** (Company Admin). The backend runs
  the digest automatically on the configured schedule.

> Microsoft 365 note: sending from M365/Outlook requires **SMTP AUTH enabled** on the mailbox
> (tenant admin) and an **app password**; otherwise use a transactional provider (e.g. Brevo/
> SendGrid) whose SMTP settings drop into the same fields.

---

## 11. Configuration & operations

### Frontend (Vercel)
- Project: `tos-tracker` → https://tos-tracker-pi.vercel.app
- **`VITE_API_BASE_URL` must be empty** so the SPA calls its own origin; `vercel.json`
  rewrites `/api/*` and `/auth/*` to the backend tunnel (same-origin → no CORS/auth issues).
- Deploy:
  ```bash
  npx tsc --noEmit -p tsconfig.web.json          # type-check
  export VITE_API_BASE_URL="" \
    && vercel build --prod --yes \
    && vercel deploy --prod --prebuilt --yes
  ```
  Confirm the live bundle hash matches the build output.

### Backend (on-prem PC)
- Node/Express/Prisma on `http://localhost:4000`, PostgreSQL on `localhost:5433`
  (db `project_tracker`), exposed publicly via an **ngrok** static domain.
- A **watchdog** PowerShell script keeps the compiled `dist/index.js` and the tunnel alive.
- **Restart after a backend change** (no schema change):
  1. `taskkill /F /PID <watchdog>` then `taskkill /F /PID <node dist\index.js>`
     (do **not** kill the MCP node processes).
  2. `cd server && npm run build`
  3. relaunch the watchdog (it restarts node on :4000 within ~180s).
- **Schema change** additionally needs `npx prisma migrate dev --name <x>` between steps 1–2
  (Prisma client must regenerate; the running node locks the Prisma DLL, so node must be
  stopped first).

### Backups / export
- **Export all data (CSV)** from the Workspace produces a folder of per-table CSVs.

---

## 12. Local development

```bash
# Frontend (web SPA)
npm install
npm run dev            # Vite dev server (renderer)

# Backend
cd server
npm install
npx prisma generate
npx prisma migrate dev # apply schema to local Postgres
npm run dev            # tsx watch on :4000
```

Useful backend scripts: `seed:admin`, `add:member`, `gen-passwords`, `list-creds`,
`migrate:json` (import legacy JSON store), `migrate:attach`.

User logins follow the formula `TOS@<first5ofname><id>`.

---

## 13. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Data not updating without refresh | Real-time WS can't cross Vercel→tunnel; the app **polls every 45s** and refetches on window focus. A manual refresh keeps your current feature/project open. |
| "Session expired — sign in again" | JWT expired; log in again. |
| Login/API fails on web | Backend PC offline or tunnel down; check `:4000/health` and the ngrok domain. |
| Manual timesheet hours not counting | They're **Pending** — a Team Lead must approve them. |
| Overtime not raising capacity | Needs **both** Lead and Manager approval. |
| Email/digest fails | Check SMTP in Settings; M365 needs SMTP AUTH + app password. |
| Can't create a project | Intentional — create it by **approving a quotation**. |

---

## 14. Glossary

- **RFI** — Request For Information.
- **WIP** — Work In Progress.
- **QC** — Quality Control.
- **LOD** — (BIM) Level of Development (100–500).
- **Productive hours** — execution + overtime (the hours measured against the quote).
- **Quoted hours** — Project Hours + QC Hours from the approved quotation.
- **Yet to start** — an active project with zero productive hours logged.
