# AMIS Project Status

## Current Phase: MVP Complete — Paused after Phase 5

**Last updated:** 2026-04-18

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
