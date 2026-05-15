# AMIS Project Status

## Current Phase: MVP Complete — Paused after Phase 5

**Last updated:** 2026-05-13

**Next session:** Resume at Phase 6 — Finance & Quality Control

---

## Phase 0 — Complete
- [x] React 18 + TypeScript + Vite frontend scaffolded
- [x] Tailwind CSS + shadcn-ui component library integrated
- [x] 15 page stubs created
- [x] PostgreSQL 18 database (`AMIS_DB`) created locally
- [x] Full production schema applied (`docs/amis_schema.sql`)
- [x] `CLAUDE.md` created with phased development plan

---

## Phase 1 — Complete ✓
- [x] `backend/` Express + TypeScript + Prisma project created
- [x] `backend/prisma/schema.prisma` — all 42 tables introspected from AMIS_DB via `prisma db pull`
- [x] `backend/prisma/seed.ts` — seeds default farm + admin user
- [x] `POST /api/v1/auth/login` → returns JWT access token (15 min) + refresh token (7 days)
- [x] `POST /api/v1/auth/refresh` → renews access token from valid session
- [x] `POST /api/v1/auth/logout` → deletes session row
- [x] `POST /api/v1/auth/register` → creates field_staff user
- [x] Auth middleware: JWT validation + requireRole()
- [x] Farm middleware: RLS context setter (`set_current_farm()`)
- [x] `src/lib/api.ts` — fetch-based HTTP client with auto-refresh on 401
- [x] `src/types/auth.ts` — AuthUser, LoginResponse, RefreshResponse
- [x] `src/hooks/useAuth.tsx` — rewritten, no Supabase dependency
- [x] `vite.config.ts` — /api proxy to port 3001
- [x] `.env.example` — all vars documented
- [x] Verified: bad password returns 401 ✓
- [x] Verified: login returns JWT + user + farmId ✓

**Test credentials:**
- Email: `admin@agritech.local`
- Password: `Admin@1234`

---

## Phase 2 — Complete ✓
**Goal:** First fully functional module — Inventory Management.

- [x] `backend/src/routes/inventory.ts` — CRUD for stock_items, item_categories, units_of_measure, stock_transactions, reorder_alerts
- [x] `backend/src/index.ts` — inventory router registered at `/api/v1/inventory`
- [x] `src/lib/api.ts` — 204 no-content response handled
- [x] `src/pages/Inventory.tsx` — data layer swapped from Supabase to api.ts (JSX unchanged)
- [x] `src/components/dashboard/InventoryAlerts.tsx` — wired to real reorder_alerts data
- [x] `src/components/layout/AppSidebar.tsx` — reorder alert count badge on Inventory link

---

## Phase 3 — Complete ✓
**Goal:** Record all farm production activity across the three sectors.

- [x] `backend/src/routes/production.ts` — work orders (Production page) + livestock records (Livestock page)
- [x] `backend/src/index.ts` — production router registered at `/api/v1/production`
- [x] `src/pages/Production.tsx` — data layer swapped; maps work_orders ↔ production_batches shape
- [x] `src/pages/Livestock.tsx` — data layer swapped; maps livestock_records ↔ livestock shape

---

## Phase 4 — Complete ✓
**Goal:** HR & Labor Management with Asset Management sub-module.

- [x] `backend/src/routes/hr.ts` — employees CRUD, attendance logging, task assignments, HR stats
- [x] `backend/src/routes/assets.ts` — assets CRUD + maintenance logs
- [x] `backend/src/index.ts` — both routers registered
- [x] `src/pages/Employees.tsx` — full build: KPI cards + 3-tab layout (Field Workers / Daily Log / Assign Task / Kanban task board)
- [x] `src/pages/Machinery.tsx` — data layer swapped; assets DB types/statuses aligned

---

## Phase 5 — Complete ✓
**Goal:** Sales, Distribution & Procurement — **MVP complete**

- [x] `backend/src/routes/sales.ts` — customers CRUD + sales orders CRUD with UI↔DB status translation
- [x] `backend/src/routes/procurement.ts` — suppliers CRUD + purchase orders CRUD
- [x] `backend/src/index.ts` — both routers registered at `/api/v1/sales` and `/api/v1/procurement`
- [x] `src/pages/Customers.tsx` — data layer swapped from Supabase to api.ts
- [x] `src/pages/Orders.tsx` — data layer swapped; DB status (confirmed/packed/delivered) translated to UI (in_production/quality_check/completed)
- [x] `src/pages/Procurement.tsx` — full build from blank stub: KPI cards + Purchase Orders tab + Suppliers tab
- [x] `src/components/dashboard/RecentOrders.tsx` — data layer swapped to api.ts

---

## Business Logic Sprint — Complete ✓
**Date:** 2026-04-20
- [x] Dashboard StatCards clickable → navigate to subsystems; data from api.ts (no Supabase)
- [x] Machinery: 8-card layout with click-highlight; Request Equipment workflow; Assign Machinery (operational only); Add for Maintenance; Report Lost; Retire; restore flows
- [x] Land Parcels: migrated to api.ts; Request Parcel → Procurement approval flow; Inactive card
- [x] Procurement: Requested Orders + Declined Orders cards; department request inbox with Accept/Cancel actions

## Livestock & Land Parcel Module Sprint — Complete ✓
**Date:** 2026-05-02
- [x] SQL migration: 6 new tables (pigs, cattle, birds, fish_ponds, fish_stock, mortality_records)
- [x] `backend/src/routes/livestock.ts` — full CRUD for all 6 sub-modules; 24h immutability; transactional mortality migration; fish capacity auto-tracking
- [x] `backend/src/routes/landParcels.ts` — POST /assign endpoint; status-revert auto-clears crop_type; ?status= filter
- [x] `backend/src/routes/parcelRequests.ts` — PATCH /:id edit-pending-only endpoint; approved status creates inactive parcel
- [x] `src/pages/Livestock.tsx` — full rewrite: 6-card Machinery-style layout (Pigs/Fish Ponds/Health/Mortality/Birds/Cattle); all CRUD with 24h rule; auto-mortality migration on status=dead
- [x] `src/pages/LandParcels.tsx` — full rewrite: 4-card layout (Requested/Active/Inactive/Total); Assign Parcel modal; edit-pending-only for requests; status-driven reversion

## Marketing & Restructure Sprint — Complete ✓
**Date:** 2026-05-03
- [x] SQL migration: 3 new tables (prices, cart_items, marketing_orders)
- [x] `backend/src/routes/marketing.ts` — prices CRUD, cart CRUD, checkout, marketing orders CRUD, available-items endpoint
- [x] Inventory deduction on order status → 'processing'
- [x] `src/pages/Marketing.tsx` — 4-card Machinery-style layout (Shopping Cart, Prices, In Process, Completed); Add to Cart flow; Set Price dialog; payment modal (MasterCard/Visa/MTN)
- [x] `src/pages/SalesOrderPoints.tsx` — 4-card layout (Pending/Processing/En Route/Purchase Order); shared cart display; manual Delivered status; item name filter
- [x] `src/components/layout/AppSidebar.tsx` — Livestock removed from Asset Management; Marketing group added (Marketing Dashboard + Sales & Order Points); Production converted to group (Production + Livestock Dashboard)
- [x] `src/App.tsx` — /marketing and /sales-order-points routes registered
- [x] `src/pages/Finance.tsx` — Marketing Total Income card added (click-to-expand orders table with item filter; shows Processing/Sold based on delivery status)

## HC/Marketing/Dashboard Feature Sprint — Complete ✓
**Date:** 2026-05-11
- [x] DB migration: employees +`days_worked`, `total_days_worked`
- [x] `POST /hr/daily-log` — submit daily attendance for checked personnel; prevents duplicates; increments both day counters
- [x] `POST /hr/reset-days` — resets current-period `days_worked` (never touches `total_days_worked`)
- [x] `GET /hr/attendance-summary` — returns stored `days_worked` + `total_days_worked`; "Total Number of Days" column in UI
- [x] Attendance rate formula: employees-with-days / total instead of present-today / total
- [x] `Employees.tsx` — "Calendar" → "Daily Log" with active-only list, checkboxes, Submit button; global search in header; "Type" → "Employee Type"
- [x] `Marketing.tsx` + `SalesOrderPoints.tsx` — cart "Item" → "Item Name"; item-name search filter on cart
- [x] `Dashboard.tsx` — "Pigs" count, "In-Stock" count, removed "Active Orders", "Production Batches" count, real Finance chart data

## Human Capital, Procurement & Machinery Sprint — Complete ✓
**Date:** 2026-05-10
- [x] SQL migration: employees extended (personnel_id, DOB, suspension fields, terminated_at, etc.), contractors table, contractor_payments, personnel_wages, suppliers (payment_method, account_number, commodity), purchase_orders (commodity, quantity), equipment_requests (delivered status)
- [x] `backend/src/routes/hr.ts` — full rewrite: 9 new routes (terminate/unterminate/suspend/cancel-suspension/contractors CRUD/contractor-payments/attendance-summary/salary/wages), auto-restore suspended, net profit check on payments
- [x] `backend/src/routes/procurement.ts` — supplier accepts payment_method + account_number + commodity; PO accepts commodity + quantity; mapPO returns both
- [x] `src/pages/Employees.tsx` — 9-card layout: Contractor/Suspension/Active/Inactive/Employee/Daily/Salary/Attendance Rate/Calendar; all CRUD flows; 48h terminate window; suspension with reason + expiry; contractor module; send-for-payment salary flow
- [x] `src/pages/Finance.tsx` — Contractor Payment and Personnel Wages cards with real Make Payment buttons; net profit check enforced; expenses from actual paid amounts
- [x] `src/pages/Procurement.tsx` — Add Supplier form + table: Payment Method, Account Number, Commodity; PO form + all 3 table views: Commodity, Quantity columns
- [x] `src/pages/Machinery.tsx` — Mark Delivered button for approved requests; Add Equipment dialog shows read-only request data + License Number input

## Settings, Profiles & Access Control Sprint — Complete ✓
**Date:** 2026-05-11
- [x] DB migration: users +`username`, `profile_picture_url`; new `subsystem_permissions` table
- [x] `backend/src/routes/profile.ts` — GET profile (pulls HR employee data), PATCH username, POST picture upload (multer, 5MB, image-only)
- [x] `backend/src/routes/accessControl.ts` — GET/PUT subsystem permissions (admin only); GET/PATCH users with role management (admin only)
- [x] `backend/src/index.ts` — profile + accessControl routers registered; `/uploads` static served
- [x] `vite.config.ts` — `/uploads` proxy added
- [x] `src/lib/api.ts` — FormData-aware: skips JSON Content-Type and JSON.stringify for file uploads
- [x] `src/hooks/useTheme.tsx` — ThemeProvider with localStorage persistence; applies `dark`/`light` class to `document.documentElement`
- [x] `src/App.tsx` — wrapped with ThemeProvider
- [x] `src/components/layout/DashboardLayout.tsx` — profile avatar in top-right header (shows picture or initials); dynamic theme class; navigates to /settings on click
- [x] `src/pages/Settings.tsx` — full User Profile page: avatar, username, HR-sourced job info, Edit Profile dialog, theme toggle (dark/light cards), Sign Out button
- [x] `src/pages/Settings.tsx` AccessControl export — per-subsystem permission cards (14 subsystems × all roles, 4 permissions each); user role management table with Change Role dialog

## Role Registry & API Architecture Fix Sprint — Complete ✓
**Date:** 2026-05-13
- [x] `backend/src/seeds/permissionSeed.ts` — renamed `accounting` → `accountant`; added `VALID_ROLE_NAMES` export (8 canonical roles); DB cleanup block reassigns orphaned users and deletes stale roles; fixed unique constraint key from `uq_subsystem_perm` → `farm_id_role_id_subsystem`
- [x] `backend/src/lib/permissions.ts` — removed admin role aliases; exported `VALID_ROLE_NAMES`
- [x] `backend/src/routes/auth.ts` — role validation at login blocks unrecognized roles; `username` added to token payload
- [x] `backend/src/routes/hr.ts` — `normalizeEmpType()` maps `'employee'` → `'permanent'`; `normalizeSector()` maps `'crops'` → `'crop'`, `'administration'` → `'admin'`; `employeeCount` stats filter updated to include `'permanent'` and `'contract'`
- [x] `backend/src/routes/production.ts` — added `GET /production/daily-logs` and `POST /production/daily-logs` endpoints (queries `daily_production_logs` table)
- [x] `src/pages/Dashboard.tsx` — `accountant` key in `ROLE_DASHBOARD` map (was `accounting`)
- [x] `src/hooks/usePermissions.ts` — removed admin role aliases
- [x] API audit completed: all frontend-called endpoints verified; only `/production/daily-logs` was missing (now fixed)

## Settings v2 & Audit Log Sprint — Complete ✓
**Date:** 2026-05-11
- [x] DB migration: new `audit_events` table (id, occurred_at, actor/target user, event_type, subsystem, description, ip, user_agent, metadata)
- [x] `backend/src/lib/audit.ts` — `logAuditEvent()` helper + `clientInfo()` extractor; fire-and-forget (never breaks main request)
- [x] `backend/src/routes/auth.ts` — audit logging on login success, login failure, logout
- [x] `backend/src/routes/profile.ts` — audit logging on username change, profile picture upload
- [x] `backend/src/routes/accessControl.ts` — audit logging on permission change, role change
- [x] `backend/src/routes/auditLog.ts` — admin-only GET with eventType/subsystem/dateRange filters, pagination, CSV export
- [x] `backend/src/index.ts` — audit log router registered at `/api/v1/audit-log`
- [x] `src/pages/Settings.tsx` — full restructure to two-pane layout: left sidebar nav (General/Users/Security/Sign Out) + right content panel
- [x] Settings panels: User Profile, Theme, List Users (searchable + detail card + "View Audit Log" link), Audit Log (filters, table, CSV export, pagination)
- [x] Settings sidebar links to Access Control at `/access-control` (separate route, unchanged)

## CRM Deactivation, User Sync, Settings & Permission Fix Sprint — Complete ✓
**Date:** 2026-05-13
- [x] DB migration: `users` +`is_active`, `deactivated_at`, `linked_customer_id`; `customers` +`is_active`, `deactivated_at`
- [x] `backend/src/lib/userStatus.ts` — `deactivateUser()`, `reactivateUser()`, `findLinkedUserId()`; 30-second in-memory deactivated-user cache
- [x] `backend/src/middleware/auth.ts` — `requireAuth` now async; deactivated users blocked immediately on every request
- [x] `backend/src/lib/audit.ts` — new event types for deactivation/activation
- [x] `backend/src/routes/accessControl.ts` — **fixed permission save bug** (wrong upsert key); cache invalidated after save; user deactivate/activate endpoints; eligibility filter enforces 7 job titles; `linked_customer_id` set on account creation
- [x] `backend/src/routes/sales.ts` — customer deactivate/activate endpoints; linked user auto-synced; `is_active` in response
- [x] `backend/src/routes/hr.ts` — terminate/unterminate/suspend/cancel-suspension each sync linked user account
- [x] `src/components/layout/AppSidebar.tsx` — Settings moved above Sign Out as standalone item; Administration group removed
- [x] `src/pages/Customers.tsx` — Deactivated card (4th); Deactivate toggle replaces Action column; deactivated excluded from active counts
- [x] `src/pages/Settings.tsx` — Deactivate toggle in Users table (right of Role); self-deactivation blocked; confirm dialog on toggle

## View-Only Permission Enforcement Sprint — Complete ✓
**Date:** 2026-05-13
- [x] `src/pages/Livestock.tsx` — all tables (pigs, cattle, birds, fish stock, mortality) gated; all 6 dialogs wrapped with canCreate/canEdit checks
- [x] `src/pages/Machinery.tsx` — added import + hook; all 5 header buttons gated; status dropdown replaced with Badge for view-only; Cancel Maintenance gated; table delete gated; request table action buttons gated; all 6 dialogs wrapped
- [x] `src/pages/Finance.tsx` — added import + hook; Make Payment buttons in Contractor and Personnel Wages panels gated with canEdit('finance')
- [x] `src/pages/Procurement.tsx` — added import + hook; New PO gated; Add Supplier button + dialog gated; PO status dropdowns replaced with Badge for view-only in all 3 views; delete buttons gated; Accept/Cancel request buttons gated; supplier delete gated
- [x] `src/pages/Marketing.tsx` — added import + hook; Set Price / Add to Cart header buttons gated; Edit price button gated; Remove from Cart button gated; Pay button gated; order status dropdown replaced with Badge for view-only; all 4 dialogs wrapped
- [x] `src/pages/SalesOrderPoints.tsx` — added import + hook; Add to Cart header button gated; Remove from Cart gated; en_route status dropdown replaced with Badge for view-only; Add to Cart dialog wrapped
- [x] `src/pages/LandParcels.tsx` — added import + hook; Request Parcel / Assign Parcel header buttons gated; requested table Edit/Delete gated; active parcel status dropdown + delete gated; inactive parcel status dropdown + Edit gated; all 4 dialogs wrapped
- [x] `src/pages/Orders.tsx` — added import + hook; New Order dialog + trigger gated with canCreate; status dropdown replaced with Badge for view-only; delete button gated

## Permission Enforcement + CRM Cleanup + Bidirectional Sync Sprint — Complete ✓
**Date:** 2026-05-13
- [x] CRM: removed "G Tarnue Gayflor" customer record (soft-deleted); removed Deactivated 4th card; removed deactivate toggle from CRM tables; CRM back to 3 cards (Total / Business / Individual)
- [x] `backend/src/middleware/auth.ts` — added `requirePermission(subsystem, action)` middleware; admin role bypasses all checks; others checked against `subsystem_permissions` via `getPermissions` cache
- [x] All 9 backend routers (sales, hr, inventory, production, livestock, procurement, marketing, assets, landParcels) — global router-level `router.use(...)` maps HTTP method → permission action; sales.ts path-based for crm vs sales_order_points
- [x] `backend/src/lib/userStatus.ts` — `deactivateUser()` now syncs linked customer (`is_active=false`) AND linked employee (`status=inactive`, skips terminated); `reactivateUser()` restores linked customer and employee (only if status=inactive)
- [x] All 12 frontend pages — `usePermissions` imported + hook called; all create/edit/delete buttons wrapped with `canCreate/canEdit/canDelete` guards; status dropdowns replaced with read-only Badge for view-only users; action table columns conditionally rendered

## Session Sprint — Card-Level Access Control + Dead Code Removal — Complete ✓
**Date:** 2026-05-15

- [x] Problem 1 (Admin UI leakage): `queryClient.clear()` on login/logout; user-scoped query keys; sidebar `permsLoading` guard inverted; Dashboard explicit if/else branches
- [x] Problem 2 — Card-level access control (P2-1 to P2-6):
  - `src/lib/cardRegistry.ts` + `backend/src/lib/cardRegistry.ts` — 11-subsystem card registry
  - `backend/src/seeds/migrate_card_permissions.ts` — `card_permissions` table created; 172 grants migrated
  - `backend/src/lib/permissions.ts` — `getCardPermissions()` + card cache + cache invalidation
  - `backend/src/routes/auth.ts` — `GET /auth/card-permissions` endpoint
  - `backend/src/routes/accessControl.ts` — `GET /access-control/cards` + `PUT /access-control/cards`
  - `src/hooks/usePermissions.ts` — `canViewCard(cardId)` added; second query for card permissions
  - All 11 page files (Inventory, Employees, Livestock, Machinery, LandParcels, Marketing, SalesOrderPoints, Finance, Procurement, Production, Customers) — `canViewCard` gating on all stat cards
  - `src/pages/Settings.tsx` — hierarchical card checkbox tree in AccessControl panel; subsystem master checkbox with indeterminate state; cascading select/deselect; Save Card Access button
- [x] Problem 3 — Dead code removal:
  - `src/hooks/useAuth.tsx` — `signUp` function + interface member + context value removed
  - `src/pages/Settings.tsx` — unused `useNavigate` import removed
  - `backend/src/seeds/cleanup_customers.ts` + `migrate_deactivation.ts` — one-shot scripts deleted

---

## Phase 6 — Not started
**Goal:** Finance & Quality Control

---

## Blockers / Decisions Pending
- Supabase client (`src/integrations/supabase/`) kept intact — pages not yet migrated still import it.
- Refresh token in `localStorage` for Phase 1; migrate to httpOnly cookie in Phase 9.

---

## Remaining Phases
- Phase 6 — Finance & Quality Control
- Phase 7 — Reporting & Decision Support
- Phase 8 — PWA, Mobile Polish & Notifications
- Phase 9 — Deployment & Production Hardening

---

## Running services
- Backend: `http://localhost:3001` (run: `cd backend && npm run dev`)
- Frontend: `http://localhost:8080` (run: `npm run dev` from root)
