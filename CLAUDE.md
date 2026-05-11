# CLAUDE.md — AMIS Development Guide

<!-- Master guide for Claude Code. Read this file at the start of every session.
     All section headers are load-bearing — do not rename or remove them. -->

## Project References

<!-- These five documents are the single source of truth for the project.
     Read them before making any architectural or feature decision. -->

| Document | Purpose |
|---|---|
| [docs/project_spec.md](docs/project_spec.md) | Functional requirements, subsystem specs, test plan — defines WHAT the system must do |
| [docs/system_archiet.md](docs/system_archiet.md) | 5-layer system architecture, data flow, security design — defines HOW it is structured |
| [docs/amis_schema.sql](docs/amis_schema.sql) | Production-ready PostgreSQL 18 schema — 42 tables, 3 materialized views, 21 triggers, 8 functions, RLS |
| [docs/project_status.md](docs/project_status.md) | **Update after every session** — current phase, what's done, what's next |
| [docs/change_log.md](docs/change_log.md) | **Append on every meaningful change** — date, phase, what changed and why |

> Before starting any session, read `docs/project_status.md` to restore context.
> After any session that advances the project, update both `project_status.md` and `change_log.md`.

---

## Tech Stack

### Frontend (existing — do not replace)

<!-- All packages below are already installed. Do not swap or remove any of them.
     The visual design and component library are approved — build on top, not around. -->

| Concern | Technology | Key files |
|---|---|---|
| Framework | React 18 + TypeScript | `src/main.tsx`, `src/App.tsx` |
| Build | Vite 5 | `vite.config.ts` |
| Styling | Tailwind CSS 3 + shadcn-ui (Radix primitives) | `tailwind.config.ts`, `src/index.css`, `src/components/ui/` |
| Routing | React Router v6 | Route definitions in `src/App.tsx` |
| Data fetching | TanStack React Query v5 | Wrap queries in `src/hooks/` — never use `useState` for server data |
| Forms | React Hook Form + Zod | Schemas defined alongside their forms; Zod schema is the source of truth |
| Charts | Recharts | Used in `src/pages/Dashboard.tsx` and `src/pages/Finance.tsx` |
| Icons | Lucide React | Import individually: `import { IconName } from 'lucide-react'` |
| Component path alias | `@/*` → `src/*` | Configured in `tsconfig.app.json` and `vite.config.ts` |

### Backend (to be built — Phase 1)

<!-- This backend does not exist yet. Create it as backend/ in the repo root.
     It runs on a separate port (e.g. 3001) and the Vite dev server proxies /api to it. -->

| Concern | Technology | Notes |
|---|---|---|
| Runtime | Node.js 20+ with TypeScript | Use `tsconfig.json` with `"module": "commonjs"` inside `backend/` |
| Framework | Express.js | Minimal, no magic — matches the team's skill level |
| ORM | Prisma (introspect from amis_schema.sql) | Run `prisma db pull` against `AMIS_DB` to generate `schema.prisma` |
| Auth | JWT (access + refresh tokens) + bcrypt | `jsonwebtoken` + `bcryptjs`; store refresh token hash in `sessions` table |
| Validation | Zod | Validate every request body before it touches Prisma |
| API style | REST `/api/v1/...` | Version prefix protects against breaking changes in future |

### Database

<!-- The schema is already applied to AMIS_DB. Do not re-run amis_schema.sql unless
     rebuilding from scratch — it will fail on duplicate objects. -->

| Item | Detail |
|---|---|
| Engine | PostgreSQL 18 (local, already installed) |
| Schema file | `docs/amis_schema.sql` — source of truth for all tables, triggers, and functions |
| Database name | `AMIS_DB` |
| Multi-tenancy | Row-Level Security via `set_current_farm()` — call this before every query |
| Soft deletes | `deleted_at` pattern — never `DELETE`; always `UPDATE … SET deleted_at = NOW()` |
| Materialized views | `dashboard_stock_summary`, `dashboard_revenue_summary`, `dashboard_workforce_summary` — refresh every 15 min via node-cron in Phase 7 |

### Responsive / PWA target

<!-- Every page component must be tested at these three widths before marking done:
     375px (iPhone SE), 768px (iPad), 1280px (laptop).
     Use Tailwind's sm: md: lg: prefixes — no custom media queries. -->

The app must work on desktop, tablet, and mobile. All layouts use Tailwind responsive
prefixes (`sm:`, `md:`, `lg:`). Phase 8 adds the PWA manifest and service worker.

---

## Frontend Page Rule — NEVER rewrite pages

<!-- This is the single most important rule for all frontend work. Violation means rework. -->

> **Do NOT rewrite any page or component from scratch.**
> Every page in `src/pages/` already has its final design, layout, and UI structure.
> The only permitted change is swapping the data layer — replace Supabase calls with `src/lib/api.ts` calls and React Query hooks, leaving every JSX element, className, and component import untouched.

### What is allowed
- Replace `import { supabase } from '@/integrations/supabase/client'` with `import api from '@/lib/api'`
- Replace `supabase.from('table').select(...)` with `useQuery({ queryFn: () => api.get(...) })`
- Replace `supabase.from('table').insert(...)` with `useMutation({ mutationFn: (data) => api.post(...) })`
- Map the API response field names to what the JSX already expects (e.g. rename `name` → `item_name` in the response map if the JSX uses `item.item_name`)
- Add a `useQuery` for new data that a widget needs (e.g. alert counts for the sidebar badge)

### What is forbidden
- Deleting or restructuring JSX elements
- Changing Tailwind class names
- Replacing shadcn-ui components with different ones
- Adding new UI sections, tabs, or dialogs that weren't in the original page
- Changing the page layout, column order in tables, or form field layout

---

## Codebase Conventions

<!-- These rules apply to every file in src/ and backend/. No exceptions. -->

- **No comments** unless the WHY is non-obvious (hidden constraint, workaround, subtle invariant).
- **No unused variables, imports, or dead code.** Delete rather than comment out.
- **Zod schemas** are the single source of truth for both form validation and API payloads.
  ```ts
  // Define once, use in both the form and the API call:
  // const schema = z.object({ name: z.string().min(1) })
  // type FormData = z.infer<typeof schema>
  ```
- **React Query** handles all server state. No `useState` for remote data.
  ```ts
  // Correct:
  // const { data } = useQuery({ queryKey: ['stock'], queryFn: fetchStock })
  // Wrong:
  // const [stock, setStock] = useState([])
  ```
- **Soft deletes only** — always filter `WHERE deleted_at IS NULL` in Prisma queries.
  ```ts
  // prisma.stockItems.findMany({ where: { deletedAt: null } })
  ```
- **RLS** — every API handler must call `SELECT set_current_farm($farmId)` before any query.
  ```ts
  // await prisma.$executeRaw`SELECT set_current_farm(${farmId}::uuid)`
  ```
- **API errors** follow `{ error: string, code: string }` shape.
  ```ts
  // res.status(400).json({ error: 'Insufficient stock', code: 'STOCK_LOW' })
  ```
- **Environment** — secrets live in `.env`; never hardcode credentials.
  ```
  // All required vars are documented in .env.example (created in Phase 1)
  ```

---

## Global UI Rules

<!-- These rules apply to EVERY page and component in src/. No exceptions, no overrides. -->

### 1 — Dropdowns
All dropdowns must use a **native `<select>` element** styled identically to the status dropdown in `src/pages/Procurement.tsx`:
```tsx
<select
  value={value}
  onChange={(e) => onChange(e.target.value)}
  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
>
  <option value="x">Label</option>
</select>
```
Never use shadcn `<Select>` / Radix `SelectTrigger` for form or status dropdowns — Radix SelectValue does not render correctly on the dark theme used in this project.

### 2 — Confirmations before destructive actions
Every delete, status change that is irreversible, or other critical action **must** show an in-app confirmation dialog before proceeding. Use `window.confirm()` inline:
```tsx
onClick={() => { if (confirm('Delete this record?')) deleteMutation.mutate(id); }}
```
Never fire a destructive mutation directly on button click without a preceding `confirm()`.

### 3 — Search bar text color and auto-refresh
All `<Input>` elements used as search bars must:
- Have white text: add `text-white placeholder:text-white/50` to the `className`.
- Auto-clear and re-fetch when they become inactive (blur): attach an `onBlur` handler that resets the search value to `''` so the list refreshes automatically.
```tsx
<Input
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  onBlur={() => setSearch('')}
  className="pl-9 text-white placeholder:text-white/50"
  placeholder="Search..."
/>
```

### 4 — Button styles (exactly two variants)
Every button in the app must follow one of two styles — no mixing, no third variants:

| Variant | When to use | Required classes |
|---|---|---|
| **Dark** | Default actions, navigation, outlines | `border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground` (matches shadcn `variant="outline"`) |
| **Green / primary** | Confirm, submit, create, save | `gradient-primary text-black font-medium` |

- Dark buttons: **always white text**, hover effect matches the "Assign Machinery" button style (`variant="outline"`).
- Green buttons: **always black text** — override any default that would render white text on green.
- `variant="destructive"` is permitted only for irreversible destructive actions (hard delete, retire, mark lost). All other actions use the two variants above.
- Never use `variant="ghost"` for visible action buttons; reserve it for icon-only utility buttons (trash icons, close icons).

---

## Directory Map

<!-- Describes every top-level directory and key file so Claude can navigate without guessing. -->

```
Agr MIS/
├── CLAUDE.md                  ← this file — read first every session
├── docs/
│   ├── project_spec.md        ← functional requirements (read-only reference)
│   ├── system_archiet.md      ← architecture document (read-only reference)
│   ├── amis_schema.sql        ← PostgreSQL 18 schema — already applied to AMIS_DB
│   ├── project_status.md      ← update after every session
│   └── change_log.md          ← append after every session
├── src/
│   ├── App.tsx                ← root component + all React Router route definitions
│   ├── main.tsx               ← Vite entry point; mounts <App /> into index.html
│   ├── index.css              ← Tailwind base directives + global CSS variables
│   ├── components/
│   │   ├── ui/                ← shadcn-ui primitives (Button, Card, Dialog, etc.) — do not edit
│   │   ├── layout/
│   │   │   ├── AppSidebar.tsx     ← left navigation sidebar with module links
│   │   │   └── DashboardLayout.tsx ← shell wrapping all authenticated pages
│   │   ├── dashboard/
│   │   │   ├── StatCard.tsx       ← KPI tile (icon + number + label)
│   │   │   ├── InventoryAlerts.tsx ← reorder alert list widget
│   │   │   ├── RecentOrders.tsx   ← last 5 orders widget
│   │   │   └── QuickActions.tsx   ← shortcut buttons (New Sale, New PO, etc.)
│   │   └── NavLink.tsx            ← styled sidebar link with active state
│   ├── hooks/
│   │   ├── useAuth.tsx        ← auth state + login/logout — rewrite in Phase 1
│   │   ├── use-mobile.tsx     ← returns true when viewport < 768px
│   │   └── use-toast.ts       ← sonner-based toast helper
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts      ← Supabase SDK client — REPLACE entirely in Phase 1
│   │       └── types.ts       ← auto-generated Supabase types — DELETE in Phase 1
│   ├── lib/
│   │   └── utils.ts           ← cn() helper (clsx + tailwind-merge)
│   └── pages/                 ← one file per route; all are visual shells in Phase 0
│       ├── Auth.tsx           ← login page — connect to backend in Phase 1
│       ├── Dashboard.tsx      ← main dashboard — wire to real data in Phase 7
│       ├── Inventory.tsx      ← stock management — Phase 2
│       ├── Production.tsx     ← crop/livestock/aquaculture — Phase 3
│       ├── Livestock.tsx      ← livestock health logs — Phase 3
│       ├── Employees.tsx      ← HR management — Phase 4
│       ├── Machinery.tsx      ← asset registry — Phase 4
│       ├── Customers.tsx      ← customer profiles — Phase 5
│       ├── Orders.tsx         ← sales order lifecycle — Phase 5
│       ├── Procurement.tsx    ← purchase orders — Phase 5
│       ├── Finance.tsx        ← double-entry journal — Phase 6
│       ├── Reports.tsx        ← report builder + export — Phase 7
│       ├── LandParcels.tsx    ← farm parcel map — post-MVP
│       ├── Settings.tsx       ← farm config + user management — post-MVP
│       └── NotFound.tsx       ← 404 fallback
├── backend/                   ← does not exist yet — create in Phase 1
│   ├── src/
│   │   ├── index.ts           ← Express app entry point
│   │   ├── routes/            ← one router file per module (auth, inventory, etc.)
│   │   ├── middleware/
│   │   │   ├── auth.ts        ← JWT validation + role check
│   │   │   └── farm.ts        ← sets RLS farm context per request
│   │   └── lib/
│   │       └── prisma.ts      ← singleton Prisma client
│   ├── prisma/
│   │   └── schema.prisma      ← generated by `prisma db pull` from AMIS_DB
│   ├── package.json
│   └── tsconfig.json
├── public/
│   ├── manifest.json          ← PWA manifest — created in Phase 8
│   └── favicon.ico
├── .env                       ← local secrets — never commit
├── .env.example               ← documented var names with no values — created in Phase 1
├── vite.config.ts             ← add /api proxy to backend in Phase 1
├── tailwind.config.ts         ← Tailwind + shadcn theme tokens
├── tsconfig.app.json          ← frontend TS config; `@/*` path alias defined here
└── docker-compose.yml         ← created in Phase 9
```

---

## Development Phases

### Phase 0 — Current State (baseline)
**Status:** Frontend scaffold complete, no real data.

<!-- Phase 0 is already done. This section is a reference for what was inherited. -->

What exists:
- 15 page components (`src/pages/`) — visual shells only, no API calls
- shadcn-ui component library (`src/components/ui/`) — 60+ pre-built accessible components
- Dashboard layout with sidebar (`src/components/layout/AppSidebar.tsx`, `DashboardLayout.tsx`)
- Supabase client wired in `src/integrations/supabase/client.ts` — placeholder, do not use
- PostgreSQL 18 schema fully applied to `AMIS_DB` (`docs/amis_schema.sql`)

---

### Phase 1 — Backend Foundation & Auth
**Goal:** Replace Supabase with a custom API; working login gated by RBAC.

<!-- Start here. All subsequent phases depend on the auth layer being in place. -->

Deliverables:
- [ ] `backend/` directory: Express + TypeScript + Prisma project
  <!-- Run: mkdir backend && cd backend && npm init -y && npm i express prisma @prisma/client zod jsonwebtoken bcryptjs -->
- [ ] Prisma schema introspected from `AMIS_DB`
  <!-- Run inside backend/: npx prisma db pull — generates backend/prisma/schema.prisma from AMIS_DB -->
- [ ] `POST /api/v1/auth/login` → JWT (access 15 min + refresh 7 days)
  <!-- Checks users table; hashes password with bcrypt; signs JWT; stores refresh token hash in sessions table -->
- [ ] `POST /api/v1/auth/refresh` and `POST /api/v1/auth/logout`
  <!-- /refresh validates sessions.token_hash and issues new access token; /logout deletes the session row -->
- [ ] Auth middleware: JWT validation + role check
  <!-- backend/src/middleware/auth.ts — verifies token, attaches req.user = { id, roleId, farmId } -->
- [ ] Replace `src/integrations/supabase/` with `src/lib/api.ts`
  <!-- Axios instance with baseURL=/api/v1; request interceptor attaches Bearer token; response interceptor auto-refreshes on 401 -->
- [ ] `useAuth` hook rewritten to call own backend
  <!-- src/hooks/useAuth.tsx — stores access token in memory (not localStorage); refresh token in httpOnly cookie -->
- [ ] `src/pages/Auth.tsx` connected to real login endpoint
  <!-- Form uses react-hook-form + zod; on success stores token via useAuth and navigates to /dashboard -->
- [ ] `.env` documented with required vars
  <!-- DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, PORT — mirror into .env.example without values -->

**Done when:** A user can log in, receive a JWT, and be redirected to the dashboard. A bad password returns 401.

---

### Phase 2 — Inventory Management System (IMS)
**Goal:** First fully functional module; foundation for all others.

<!-- IMS is the dependency hub — every other module (Production, Sales, Procurement)
     reads from and writes to the stock_items table. Build it robustly. -->

Deliverables:
- [ ] API routes: `stock_items`, `item_categories`, `units_of_measure`, `stock_transactions`, `reorder_alerts`, `batches`
  <!-- backend/src/routes/inventory.ts — GET/POST/PATCH (soft-delete via deletedAt) for each table -->
- [ ] `src/pages/Inventory.tsx` connected to real data
  <!-- Replace placeholder JSX with React Query hooks; use shadcn DataTable (src/components/ui/table.tsx) -->
- [ ] Create / edit / soft-delete stock items
  <!-- Dialog form using src/components/ui/dialog.tsx + react-hook-form; PATCH sets deletedAt on delete -->
- [ ] Stock transaction ledger view
  <!-- Read-only table of stock_transactions rows for a selected stock_item; shows before/after quantities -->
- [ ] Reorder alert badge on sidebar when open alerts exist
  <!-- src/components/layout/AppSidebar.tsx — query reorder_alerts WHERE status='open'; show count badge -->
- [ ] `src/components/dashboard/InventoryAlerts.tsx` dashboard widget shows live data
  <!-- List of top 5 open reorder alerts; links to the Inventory page filtered by that item -->

**Done when:** Admin can add a stock item, record usage (which decrements quantity), and see a reorder alert fire when stock drops below threshold.

---

### Phase 3 — Production Management
**Goal:** Record all farm production activity across the three sectors.

<!-- Harvest entries written here automatically increase stock_items.current_quantity
     via the DB trigger trg_stock_reorder already defined in amis_schema.sql. -->

Deliverables:
- [ ] API routes: `crop_production_records`, `livestock_records`, `livestock_health_logs`, `aquaculture_records`, `fish_harvest_records`, `daily_production_logs`, `work_orders`
  <!-- backend/src/routes/production.ts — sector-specific CRUD; harvest endpoints must set stock_item_id -->
- [ ] `src/pages/Production.tsx` → tabbed view: Crops / Livestock / Aquaculture / Work Orders
  <!-- Use shadcn Tabs (src/components/ui/tabs.tsx); each tab is its own sub-component -->
- [ ] `src/pages/Livestock.tsx` connected (health log timeline per animal)
  <!-- Timeline of livestock_health_logs per livestock_records.id; log types: health_check, treatment, vaccination, weight_check, mortality -->
- [ ] Harvest entry triggers IMS stock update (via backend trigger — already in schema)
  <!-- trg_stock_reorder fires on UPDATE of stock_items — verify after POST to fish_harvest_records or crop_production_records -->
- [ ] Work orders assignable to employees (links to Phase 4)
  <!-- work_orders.created_by → users.id; employees linked via task_assignments in Phase 4 -->

**Done when:** A harvest entry is saved and the corresponding stock_item quantity increases automatically.

---

### Phase 4 — HR & Asset Management
**Goal:** Manage people and equipment.

Deliverables:
- [ ] API routes: `employees`, `attendance_logs`, `task_assignments`, `assets`, `asset_maintenance_logs`, `asset_usage_logs`
  <!-- backend/src/routes/hr.ts and backend/src/routes/assets.ts -->
- [ ] `src/pages/Employees.tsx` — CRUD with role + sector filters
  <!-- Filter by employment_type (permanent/contract/seasonal/daily) and sector (crop/livestock/aquaculture/admin) -->
- [ ] Attendance log entry form (daily check-in/out)
  <!-- attendance_logs has a UNIQUE(employee_id, log_date) constraint — one entry per employee per day -->
- [ ] Task assignment board (kanban-style using existing shadcn Card components)
  <!-- Columns: pending / in_progress / completed — drag or use status dropdown; uses src/components/ui/card.tsx -->
- [ ] `src/pages/Machinery.tsx` — asset registry with maintenance history
  <!-- assets table + asset_maintenance_logs timeline per asset; next_service_date shown as a warning if past due -->
- [ ] Dashboard workforce summary widget (from `dashboard_workforce_summary` materialized view)
  <!-- Query the materialized view directly: SELECT * FROM dashboard_workforce_summary WHERE farm_id = $1 -->

**Done when:** Supervisor can add an employee, assign a task, and log attendance for the day.

---

### Phase 5 — Sales, Distribution & Procurement ← **MVP complete**
**Goal:** End-to-end order-to-cash and purchase-to-receive flows.

<!-- Two DB triggers in amis_schema.sql do the heavy lifting automatically:
     trg_reserve_stock_on_confirm — reserves stock when order status → 'confirmed'
     trg_deduct_stock_on_sale     — deducts stock when order status → 'dispatched'
     trg_receive_stock_on_purchase — increases stock when PO status → 'received'
     The API only needs to PATCH the status field; the DB handles inventory. -->

Deliverables:
- [ ] API routes: `customers`, `sales_orders`, `sales_order_items`, `distribution_logs`, `contracts`, `suppliers`, `purchase_orders`, `purchase_order_items`
  <!-- backend/src/routes/sales.ts and backend/src/routes/procurement.ts -->
- [ ] `src/pages/Customers.tsx` — customer profiles with order history
  <!-- Customer detail view lists all sales_orders for that customer_id with status + total_amount -->
- [ ] `src/pages/Orders.tsx` — create order → confirm → dispatch → invoiced
  <!-- Status stepper UI; PATCH /api/v1/sales-orders/:id { status: 'confirmed' } triggers stock reservation via DB trigger -->
- [ ] `src/pages/Procurement.tsx` — purchase order lifecycle, receiving triggers stock increase
  <!-- PATCH status → 'received' triggers trg_receive_stock_on_purchase; shows received vs. ordered quantities -->
- [ ] `src/components/dashboard/RecentOrders.tsx` dashboard widget shows live data
  <!-- Top 5 most recent sales_orders ordered by order_date DESC; shows order_number, customer name, total, status -->
- [ ] `src/components/dashboard/QuickActions.tsx` — New Sale and New PO shortcuts
  <!-- Buttons navigate to /orders?new=true and /procurement?new=true; page opens create dialog on that param -->

**Done when:** Admin creates a sales order, confirms it (stock reserved), marks dispatched (stock deducted), and sees revenue in dashboard.

---

### Phase 6 — Finance & Quality Control
**Goal:** Double-entry accounting and quality checks linked to operational records.

<!-- The DB trigger trg_auto_post_sales_journal (amis_schema.sql §14f) auto-creates a
     balanced journal entry when a sales order status → 'invoiced'.
     The Finance page only needs to READ journal_entries — not create them manually. -->

Deliverables:
- [ ] API routes: `financial_accounts`, `journal_entries`, `journal_entry_lines`, `quality_checks`
  <!-- backend/src/routes/finance.ts — journal entries are mostly read-only; POST for manual adjustments only -->
- [ ] `src/pages/Finance.tsx` — chart of accounts, journal entry list, trial balance view
  <!-- Three tabs: Chart of Accounts | Journal Entries | Trial Balance (sum debit/credit per account) -->
- [ ] Auto-posted journal entries already handled by DB trigger (verify in UI)
  <!-- After invoicing a sales order in Phase 5, confirm journal_entries row appears with total_debit = total_credit -->
- [ ] Quality check forms accessible from Inventory, Production, and Orders pages
  <!-- quality_checks has a CHECK constraint: exactly one of stock_item_id, harvest_id, production_id, sales_order_id must be set -->
- [ ] Finance dashboard widget: revenue vs. expenses bar chart (Recharts)
  <!-- Query dashboard_revenue_summary materialized view; BarChart with two bars per month: collected vs. outstanding -->

**Done when:** Invoicing a sales order auto-creates a balanced journal entry visible in Finance.

---

### Phase 7 — Reporting & Decision Support ← **Full feature set complete**
**Goal:** Transform all operational data into actionable dashboards and exportable reports.

<!-- Three materialized views in amis_schema.sql power the dashboard:
     dashboard_stock_summary    — stock levels and alert counts per item
     dashboard_revenue_summary  — monthly revenue totals per farm
     dashboard_workforce_summary — employee counts and attendance per sector
     Refresh all three every 15 min using node-cron in backend/src/index.ts. -->

Deliverables:
- [ ] API routes: `report_definitions`, `report_runs`, `dashboard_snapshots`
  <!-- backend/src/routes/reports.ts — POST /report-runs triggers async PDF/Excel generation -->
- [ ] Scheduled `REFRESH MATERIALIZED VIEW CONCURRENTLY` via node-cron (every 15 min)
  <!-- In backend/src/index.ts: cron.schedule('*/15 * * * *', () => prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_stock_summary`) -->
- [ ] `src/pages/Dashboard.tsx` — all stat cards and charts driven by real materialized view data
  <!-- Replace hardcoded numbers in StatCard components with React Query hooks hitting /api/v1/dashboard -->
- [ ] `src/pages/Reports.tsx` — report builder: select module + date range → run → download
  <!-- Dropdown selects a report_definition; date pickers set parameters; POST creates a report_run; poll for completion -->
- [ ] PDF export via `puppeteer` (backend renders HTML → PDF)
  <!-- backend generates HTML from a template, runs puppeteer headless, returns PDF as file download -->
- [ ] Excel export via `xlsx` npm package
  <!-- backend serializes query results to workbook via xlsx.utils.json_to_sheet(); streams file to client -->
- [ ] KPI cards: total revenue, stock value, active employees, open alerts
  <!-- src/components/dashboard/StatCard.tsx — four instances on Dashboard.tsx with real numbers -->

**Done when:** Dashboard loads real numbers; a manager can export a monthly sales report as PDF.

---

### Phase 8 — PWA, Mobile Polish & Notifications ← **Final phase**
**Goal:** Fully responsive, installable, and resilient to poor connectivity.

<!-- This phase adds installability and offline capability.
     Target users are farm staff on Android phones with unreliable connectivity. -->

Deliverables:
- [ ] `public/manifest.json` (name, icons, theme color, display: standalone)
  <!-- name: "AMIS", short_name: "AMIS", theme_color: matches Tailwind primary color, display: "standalone" -->
- [ ] Vite PWA plugin (`vite-plugin-pwa`) with service worker
  <!-- cache-first for static assets (JS/CSS/images); network-first for /api calls -->
  <!-- npm i -D vite-plugin-pwa — configure in vite.config.ts -->
- [ ] Offline fallback page
  <!-- public/offline.html — shown by service worker when network fails and page isn't cached -->
- [ ] All pages tested on 375px (mobile), 768px (tablet), 1280px (desktop)
  <!-- Use browser devtools device toolbar to verify each page at all three widths -->
- [ ] Sidebar collapses to bottom nav on mobile
  <!-- src/components/layout/DashboardLayout.tsx — use use-mobile.tsx hook; render bottom tabs when isMobile -->
- [ ] Push notifications via Web Push API: reorder alerts, task assignments, overdue orders
  <!-- backend generates VAPID keys; browser subscribes; backend pushes via web-push npm package -->
- [ ] Final accessibility pass (focus rings, ARIA labels on icon-only buttons)
  <!-- All icon-only buttons need aria-label; check focus-visible rings are visible on keyboard navigation -->
- [ ] Lighthouse PWA score ≥ 90
  <!-- Run in Chrome DevTools → Lighthouse → PWA; fix any failing audits before closing phase -->

**Done when:** App installs on Android/iOS, works offline for read operations, and a push notification arrives when stock drops below threshold.

---

### Phase 9 — Deployment & Production Hardening
**Goal:** Runnable in any environment via Docker; CI validates every PR.

Deliverables:
- [ ] `docker-compose.yml`: frontend (Nginx), backend (Node), PostgreSQL 18, Redis (future cache)
  <!-- Three services: frontend (nginx:alpine serves dist/), backend (node:20-alpine), db (postgres:18) -->
- [ ] `backend/Dockerfile` and root `Dockerfile` for frontend static build
  <!-- Root Dockerfile: node build stage → nginx serve stage (multi-stage for small image) -->
- [ ] `.github/workflows/ci.yml`: lint → type-check → build on every push
  <!-- Three jobs: eslint, tsc --noEmit, vite build — all must pass before merge -->
- [ ] Environment variable documentation in `.env.example`
  <!-- List every var used in backend/ and vite.config.ts with a description comment per line -->
- [ ] Production checklist from `docs/amis_schema.sql`
  <!-- Refresh materialized views on schedule; partition stock_transactions and audit_logs by month for >1M rows/year; run VACUUM ANALYZE after bulk loads -->
- [ ] README updated with local dev and Docker setup instructions
  <!-- Sections: Prerequisites, Local dev (npm install + psql setup), Docker (docker compose up), Env vars reference -->

**Done when:** `docker compose up` starts the full stack; CI passes on GitHub.

---

## Update Protocol

<!-- Follow this exactly after every session that changes any code or doc. -->

### After every work session:

**Step 1** — Open `docs/project_status.md` and update:
- Current phase (header)
- Completed deliverables (check off `[ ]` → `[x]`)
- Any new blockers or decisions made
- The next concrete task to pick up next session

**Step 2** — Append to `docs/change_log.md` using this format:

```markdown
## YYYY-MM-DD — Phase N: <one-line summary of what changed>
- <specific file or feature changed>
- <why the change was made or decision reached>
```

<!-- Example entry:
## 2026-04-20 — Phase 1: Backend scaffolded with JWT auth
- Created backend/ with Express + Prisma; introspected AMIS_DB schema
- Replaced src/integrations/supabase/ with src/lib/api.ts (Axios instance)
- Decision: access token stored in memory (not localStorage) to prevent XSS
-->

---

## Testing Checkpoints

<!-- Run the relevant checkpoint test before marking a phase complete.
     These are acceptance tests, not unit tests. -->

| Phase | How to verify |
|---|---|
| 1 | `POST /api/v1/auth/login` with seeded admin user returns `{ accessToken, user }` |
| 2 | Add a stock item, record usage — confirm `current_quantity` decreased and a `reorder_alerts` row created |
| 3 | POST a fish harvest record — confirm a matching `stock_transactions` row appears with `transaction_type='harvest'` |
| 4 | Assign a task to an employee, mark complete — confirm `task_assignments.status = 'completed'` |
| 5 | Full order lifecycle: pending → confirmed → dispatched — verify `stock_items.reserved_quantity` and `current_quantity` change at each step |
| 6 | Set sales order status to `invoiced` — verify `journal_entries` row with `total_debit = total_credit` |
| 7 | Run a report, download PDF — verify materialized views refresh on the 15-min cron schedule |
| 8 | Install PWA on Android, disable Wi-Fi — confirm cached dashboard page still loads |
| 9 | `docker compose up` — all three services start healthy; GitHub Actions CI shows green |
