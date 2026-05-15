# AMIS Change Log

---

## 2026-05-15 — Card-Level Access Control, Admin Session Fix, Dead Code Removal

### Problem 1: Admin UI leakage (session cache race condition)
- `src/hooks/useAuth.tsx` — `queryClient.clear()` on `signIn` (before API call) and `signOut` (after state clear); prevents previous user's cache from leaking into new session
- `src/components/layout/DashboardLayout.tsx` + `AppSidebar.tsx` — profile query key scoped to `user?.id`
- `src/components/layout/AppSidebar.tsx` — `itemVisible` guard inverted: `!permsLoading && canView(subsystem)` (was `permsLoading || canView`); removes admin nav flash for non-admin users
- `src/pages/Dashboard.tsx` — explicit if/else branches for loading/admin/role/fallback; no longer falls through to AdminDashboard for non-admin users

### Problem 2: Card-level access control (11 subsystems, 66 total cards)
- New `card_permissions` DB table; unique on `(farm_id, role_id, card_id)`; 172 grants migrated from existing `subsystem_permissions` (view=true → all cards for that subsystem)
- Backend: `getCardPermissions()` in `permissions.ts`; `GET /auth/card-permissions`; admin-only `GET/PUT /access-control/cards`
- Frontend: `canViewCard(cardId)` in `usePermissions`; all 11 stat-card pages filter their card arrays by `canViewCard`
- Settings AccessControl panel: new "Card-Level Visibility" section — hierarchical checkbox tree (subsystem master checkbox with indeterminate state; cascading select/deselect; Save Card Access button); only visible when a role is selected in the filter

### Problem 3: Dead code removal
- `useAuth.tsx` — `signUp` removed (exported but never called from any page)
- `Settings.tsx` — `useNavigate` import removed (imported but never called)
- `backend/src/seeds/cleanup_customers.ts` + `migrate_deactivation.ts` — one-shot scripts deleted after confirmed ran successfully

---

## 2026-05-13 — Permission Enforcement + CRM Cleanup + Bidirectional Sync

### DB Cleanup
- Soft-deleted "G Tarnue Gayflor" customer record (test data removed)
- Cleared all deactivated customer records

### CRM (Customers.tsx)
- Removed Deactivated 4th card; removed deactivate toggle from CRM tables
- CRM is now 3 cards only (Total / Business / Individual)
- Add Customer button and Delete action column gated by canCreate/canDelete('crm')

### Backend: requirePermission middleware
- `backend/src/middleware/auth.ts` — `requirePermission(subsystem, action)` middleware added; admin bypasses; others checked via `getPermissions` cache
- Applied to all 9 mutating routers via global `router.use(...)` mapping HTTP method → view/create/edit/delete

### Backend: bidirectional User ↔ CRM/HC sync
- `backend/src/lib/userStatus.ts` — `deactivateUser()` now syncs linked customer to `is_active=false` AND linked employee to `status=inactive` (skips terminated); `reactivateUser()` restores both

### Frontend: view-only enforcement across all 12 pages
- Every page now imports `usePermissions`; all create/edit/delete buttons gated; status dropdowns swapped to read-only Badge for view-only users; action table columns conditionally rendered

---

## 2026-05-13 — View-Only Permission Enforcement: all 12 frontend pages gated

### Frontend
- `src/pages/Livestock.tsx` — fish stock table and mortality table action buttons gated; all 6 dialogs (pig/cattle/bird/pond/fish/mortality) wrapped with canCreate/canEdit guards
- `src/pages/Machinery.tsx` — import + hook added; 5 header buttons gated (Assign, Add Maintenance, Report Lost, Retire, Pending Request); status dropdown replaced with Badge when canEdit is false; Cancel Maintenance button gated; table delete button gated; request table Mark Delivered / Add Equipment / delete gated; 6 dialogs wrapped
- `src/pages/Finance.tsx` — import + hook added; Make Payment buttons in both Contractor Payment and Personnel Wages panels gated with canEdit('finance'); unpermissioned view shows null (no button shown)
- `src/pages/Procurement.tsx` — import + hook added; New PO button gated; Add Supplier button + inline dialog gated; PO status dropdowns replaced with Badge in all 3 table views when canEdit is false; PO delete buttons gated; request table Accept/Cancel gated; supplier delete gated; header columns for Action/Delete conditionally rendered
- `src/pages/Marketing.tsx` — import + hook added; Set Price / Add to Cart header buttons gated; Edit button in prices table gated; Remove from Cart button gated; Pay button gated; order status dropdown replaced with span Badge when canEdit is false; Set Price / Add to Cart / Payment Method / Payment Form dialogs wrapped
- `src/pages/SalesOrderPoints.tsx` — import + hook added; Add to Cart header button gated; Remove from Cart button gated; en_route status dropdown replaced with Badge span when canEdit is false; Add to Cart dialog wrapped
- `src/pages/LandParcels.tsx` — import + hook added; Request Parcel / Assign Parcel header buttons gated; requested table Edit + Delete buttons gated; active parcels status dropdown replaced with Badge + delete gated; inactive parcels status dropdown replaced with Badge + Edit button gated; all 4 dialogs wrapped
- `src/pages/Orders.tsx` — import + hook added; New Order Dialog + DialogTrigger wrapped with canCreate guard; status dropdown replaced with Badge when canEdit is false; delete button gated

---

## 2026-05-13 — CRM Deactivation, User Sync, Settings & Permission Fix Sprint

### DB Migration
- `users`: added `is_active BOOLEAN DEFAULT true`, `deactivated_at TIMESTAMPTZ`, `linked_customer_id UUID`
- `customers`: added `is_active BOOLEAN DEFAULT true`, `deactivated_at TIMESTAMPTZ`

### Backend
- `backend/src/lib/userStatus.ts` — new utility: `deactivateUser()` (marks inactive + deletes sessions + clears permission cache), `reactivateUser()`, `findLinkedUserId()`; 30s in-memory cache prevents per-request DB hit for deactivation checks
- `backend/src/middleware/auth.ts` — `requireAuth` made async; checks `is_active` on every token validation via cache; deactivated users get 401 immediately without waiting for token expiry
- `backend/src/lib/audit.ts` — added `user_deactivated`, `user_activated`, `customer_deactivated`, `customer_activated` event types
- `backend/src/routes/accessControl.ts` — **critical bug fix**: permission save was using wrong Prisma unique constraint key (`uq_subsystem_perm` → `farm_id_role_id_subsystem`); permissions now actually persist on click; `invalidateCache()` called after save; added `PATCH /users/:id/deactivate` and `PATCH /users/:id/activate`; eligibility filter now filters personnel by 7 allowed job titles and customers by `is_active=true`; `linked_customer_id` set on user creation from customer
- `backend/src/routes/sales.ts` — added `PATCH /customers/:id/deactivate` and `PATCH /customers/:id/activate`; both auto-sync linked user via `findLinkedUserId`; `is_active` returned in customer list
- `backend/src/routes/hr.ts` — terminate/unterminate/suspend/cancel-suspension all auto-sync linked user account (deactivate on terminate/suspend, reactivate on unterminate/cancel-suspension)

### Frontend
- `src/components/layout/AppSidebar.tsx` — Administration group removed (Settings was its only item); Settings added as standalone `SidebarMenuButton` directly above Sign Out in SidebarFooter
- `src/pages/Customers.tsx` — 4th card "Deactivated" added (counts `is_active=false`); Action column replaced with Deactivate toggle switch in all customer tables; deactivated customers excluded from Total/Business/Individual counts; toggle fires confirmation dialog
- `src/pages/Settings.tsx` — "Active" toggle column added to Users table immediately right of Role; self-deactivation blocked at UI level; confirmation dialog before toggling; `toggleActive` mutation calls new deactivate/activate endpoints

---

## 2026-05-13 — Role Registry & API Architecture Fix Sprint

### Backend
- `backend/src/seeds/permissionSeed.ts` — renamed `accounting` → `accountant` role; added `VALID_ROLE_NAMES` export (8 canonical roles); DB cleanup block reassigns orphaned users and deletes stale roles; fixed unique constraint key from `uq_subsystem_perm` → `farm_id_role_id_subsystem`
- `backend/src/lib/permissions.ts` — removed admin role aliases; exported `VALID_ROLE_NAMES`
- `backend/src/routes/auth.ts` — role validation at login blocks unrecognized roles; `username` added to token payload
- `backend/src/routes/hr.ts` — added `normalizeEmpType()` mapping `'employee'` → `'permanent'`; added `normalizeSector()` mapping `'crops'` → `'crop'` and `'administration'` → `'admin'`; fixed `employeeCount` stats filter to include both `'permanent'` and `'contract'` types after normalization
- `backend/src/routes/production.ts` — added `GET /production/daily-logs` and `POST /production/daily-logs` endpoints (queries/inserts into `daily_production_logs` table); this was the only missing route found in the full API audit

### Frontend
- `src/pages/Dashboard.tsx` — fixed `accountant` key in `ROLE_DASHBOARD` map (was `accounting`)
- `src/hooks/usePermissions.ts` — removed admin role aliases to match backend canonical roles

### API Audit
- Full audit of all frontend-called endpoints against backend route definitions completed; no additional enum mismatches or missing routes found beyond the above fixes

---

## 2026-05-11 — Settings v2 & Audit Log Sprint

### DB Migration
- Created `audit_events` table: id, occurred_at (timestamptz, indexed DESC), actor_user_id, event_type, subsystem, card, action, target_user_id, description, ip_address, user_agent, metadata (jsonb). Append-only design.

### Backend
- `backend/src/lib/audit.ts` — `logAuditEvent()` fire-and-forget helper; `clientInfo()` extracts IP and User-Agent from request
- `backend/src/routes/auth.ts` — logs `login_success`, `login_failed`, `logout` events
- `backend/src/routes/profile.ts` — logs `profile_updated`, `profile_picture_updated` events
- `backend/src/routes/accessControl.ts` — logs `permission_changed`, `role_changed` events with before/after metadata
- `backend/src/routes/auditLog.ts` — admin-only GET; filters: eventType, subsystem, dateRange (last7/last30/last90); paginated JSON or CSV export via `format=csv`
- `backend/src/index.ts` — registered `/api/v1/audit-log`

### Frontend
- `src/pages/Settings.tsx` — restructured from single-page to two-pane layout (220px left sidebar + scrollable right panel)
- Settings left sidebar: General (User Profile, Theme), Users (List Users, Access Control → /access-control), Security (Audit Log), Sign Out pinned at bottom
- New panel: **List Users** — searchable table (name/email/username/role), right detail card with HR info + "View Audit Log" button that pre-navigates to audit log panel
- New panel: **Audit Log** — filter bar (event type, subsystem, date range selects), paginated table (timestamp/actor/event badge/description/subsystem tag/IP+browser), Export CSV button, result count + retention notice
- Existing User Profile and Theme panels preserved within new layout

---

## 2026-05-11 — Settings, Profiles & Access Control Sprint

### DB Migration
- `users`: added `username VARCHAR(50)` (unique sparse index), `profile_picture_url TEXT`
- Created `subsystem_permissions` table: `(farm_id, role_id, subsystem)` unique; 4 boolean permission columns (view/create/edit/delete)

### Backend
- `backend/src/routes/profile.ts`: GET profile (includes HR employee info), PATCH username, POST /picture (multer 5MB image upload, auto-deletes old file)
- `backend/src/routes/accessControl.ts`: admin-only CRUD for subsystem permissions (14 subsystems) + user role assignment
- `backend/src/index.ts`: registered `/api/v1/profile` and `/api/v1/access-control`; `/uploads` served as static files
- `backend/prisma/schema.prisma`: added `username`/`profile_picture_url` to users model; added `subsystem_permissions` model with farm/role relations

### Frontend
- `src/lib/api.ts`: FormData detection — skips Content-Type header and JSON.stringify for file uploads
- `vite.config.ts`: added `/uploads` proxy to backend
- `src/hooks/useTheme.tsx`: ThemeProvider + useTheme hook; theme stored in localStorage; applies class to `document.documentElement`
- `src/App.tsx`: wrapped with ThemeProvider
- `src/components/layout/DashboardLayout.tsx`: profile avatar button top-right (shows picture or initials); navigates to /settings; theme class applied dynamically
- `src/pages/Settings.tsx`: User Profile page with avatar, username, HR-sourced job/dept/personnel info, Edit username dialog, theme toggle cards, logout button
- `src/pages/Settings.tsx` AccessControl: 14 subsystem permission cards with per-role checkboxes; user role management table with dialog

---

## 2026-05-11 — HC/Marketing/Dashboard Feature Sprint

### DB Migration
- `employees`: added `total_days_worked INTEGER DEFAULT 0` (cumulative, never reset) and `days_worked INTEGER DEFAULT 0` (current period, resettable)

### Backend (`backend/src/routes/hr.ts`)
- `POST /hr/daily-log`: accepts `{ employeeIds[] }`, creates attendance_log per employee (UNIQUE constraint prevents duplicate-per-day), increments both `days_worked` and `total_days_worked`
- `POST /hr/reset-days`: resets `days_worked` to 0 for given `employmentType` (employee/daily/all); never touches `total_days_worked`
- `GET /hr/attendance-summary`: now returns stored `days_worked` and `total_days_worked` from DB columns (removed attendance_logs join)
- `GET /hr/salary`: now uses stored `days_worked` column (removed attendance_logs join)
- `POST /hr/wages/send-for-payment`: same
- `GET /hr/stats`: attendance rate formula changed to (employees with total_days_worked > 0) / total

### Frontend (`src/pages/Employees.tsx`)
- "Calendar" card renamed → "Daily Log"; view key `calendar` → `daily_log`
- Daily Log view: shows active personnel only, checkbox per row (Action column), Submit Daily Log button center-bottom
- Attendance Rate view: "Number of Days" and "Total Number of Days" columns; "Type" → "Employee Type"
- Personnel table header "Type" → "Employee Type"
- Global search moved to header — searches Full Name + Personnel ID across all employee views; filters contractor names in contractor view
- Per-view search bar removed

### Frontend (`src/pages/Marketing.tsx`, `src/pages/SalesOrderPoints.tsx`)
- Shopping Cart table header: "Item" → "Item Name"
- Shopping Cart view: added item name search filter

### Frontend (`src/pages/Dashboard.tsx`)
- "Total Livestock" → "Pigs" (queries `/livestock/pigs`)
- "Inventory Items" → "In-Stock" (count items with current_quantity > 0)
- "Active Orders" card removed
- "Production Output" → "Production Batches" (queries `/production/work-orders`)
- Revenue vs Expenses chart: now uses real Finance data — income from completed/delivered marketing orders, expenses from paid wages + contractor payments, grouped by last 6 months

---

## 2026-05-10 — Human Capital, Procurement & Machinery Overhaul

### DB Migration (run against AMIS_DB)
- `employees`: added `personnel_id` (unique), `date_of_birth`, `place_of_birth`, `email`, `address`, `bank_id`, `status` CHECK ('active','inactive','suspended'), `suspension_reason`, `suspension_expires_at`, `terminated_at`
- `contractors`: new table (contractor_id auto-generated CON-XXXXXXXX, name, phone, email, job_title, contract_start, contract_end, payment_amount, status, farm_id)
- `contractor_payments`: new table (contractor_id FK, amount, status pending/paid, paid_at, farm_id)
- `personnel_wages`: new table (employee_id FK, amount, pay_period, status pending/paid, paid_at, immutable, farm_id)
- `suppliers`: added `payment_method` (bank/mobile_money), `account_number`, `commodity`
- `purchase_orders`: added `commodity`, `quantity`
- `equipment_requests`: CHECK constraint updated to include 'delivered' status

### Backend — hr.ts (full rewrite)
- `generatePersonnelId()` / `generateContractorId()` helpers
- `autoRestoreSuspended()` — auto-restores suspended employees whose expiry has passed on every GET
- Extended `GET /hr/stats`: contractorCount, activeCount, inactiveCount, suspendedCount, employeeCount, dailyCount, attendanceRate
- `PATCH /:id/terminate` — sets status=inactive + terminated_at
- `PATCH /:id/unterminate` — only within 48h window
- `PATCH /:id/suspend` — sets status=suspended + suspension_reason + suspension_expires_at
- `PATCH /:id/cancel-suspension` — sets status=active, clears suspension fields
- `GET/POST /hr/contractors`, `PATCH /hr/contractors/:id/finish`
- `GET /hr/contractor-payments`, `PATCH /hr/contractor-payments/:id/pay`
- `GET /hr/attendance-summary` — days worked per employee
- `GET /hr/salary` — qualified/review logic per employment type
- `POST /hr/wages/send-for-payment`, `GET /hr/wages`, `PATCH /hr/wages/:id/pay`
- Net profit check on wage/contractor payments

### Backend — procurement.ts
- Supplier create accepts `paymentMethod`, `accountNumber`, `commodity`
- Purchase order create accepts `commodity`, `quantity`
- `mapPO` returns `commodity` and `quantity` fields

### Frontend — Employees.tsx (full rewrite)
- 9-card Machinery-style layout: Contractor, Suspension, Active, Inactive, Employee, Daily Workers, Salary, Attendance Rate, Calendar
- Dynamic top button: Add Personnel / Add Contract / Send For Payment based on active view
- Extended Add Personnel form (DOB, place of birth, email, address, bank ID, job title, salary, etc.)
- Terminate with 48h un-terminate window + immutable badge after 48h
- Suspension: reason (max 50 words) + expiry date + Cancel Suspension button
- Contractor module: separate table + Finish Contract button (sends to Finance)
- Attendance view: days worked per employee
- Salary view: qualified/review logic + Send For Payment

### Frontend — Finance.tsx (updated)
- `Contractor Payment` card replaces placeholder — real table with Make Payment button
- `Personnel Wages` card (renamed from Employee Wages) — real table with Make Payment button
- Expenses calculation uses actual paid wages + paid contractor amounts
- Empty state: "No personnel wages pending. Use 'Send For Payment' in Human Capital."

### Frontend — Procurement.tsx (updated)
- Add Supplier form: added Payment Method dropdown (Bank/Mobile Money), Account Number, Commodity
- Supplier table: shows Payment Method, Account Number, Commodity columns
- Create PO form: added Commodity dropdown + Quantity field
- All 3 PO table views: Commodity and Quantity columns added (per spec column order)

### Frontend — Machinery.tsx (updated)
- Requests table: "Mark Delivered" button for approved requests (calls PATCH /:id/status)
- "Add Machinery" button renamed to "Add Equipment" for delivered requests
- Add Equipment dialog: shows request data (Name, Type, Model, Notes) as read-only before License Number input

---

## 2026-05-03 — Marketing Module & Subsystem Restructure

### New DB Tables
- `prices` — farm_id, item_name (unique per farm), price_per_unit, quantity_unit; UNIQUE INDEX on (farm_id, item_name)
- `cart_items` — per-farm shopping cart; item_name, quantity, unit_price, total_amount
- `marketing_orders` — order_id (unique, auto-generated ORD-XXXXXXXX), payment_id, item_name, quantity, status (pending/processing/en_route/delivered), amount

### Backend
- `backend/src/routes/marketing.ts` (new) — 10 endpoints: prices GET/POST/PATCH; cart GET/POST/DELETE (item + clear all); checkout POST (generates orders, clears cart); orders GET/PATCH; available-items GET
- Inventory deduction: PATCH /orders/:id to status='processing' → reduces stock_items.current_quantity by order quantity (floor 0)
- `backend/src/index.ts` — registered /api/v1/marketing router

### Frontend
- `src/pages/Marketing.tsx` (new) — 4-card layout: Shopping Cart / Prices / In Process / Completed; button toggles Add to Cart ↔ Set Price based on selected card; payment modal: method select (MasterCard/Visa/MTN) → form (name, card/phone, CVV, expiry, readonly total) → success screen
- `src/pages/SalesOrderPoints.tsx` (new) — 4-card layout: Pending / Processing / En Route / Purchase Order; shows live shopping cart; orders table filtered by status with item-name search; Delivered status set manually here, syncs Marketing automatically
- `src/components/layout/AppSidebar.tsx` — Livestock removed from Asset Management; Sales & Orders → Marketing (collapsible: Marketing Dashboard + Sales & Order Points); Production converted to collapsible group (Production + Livestock Dashboard)
- `src/App.tsx` — /marketing and /sales-order-points routes added
- `src/pages/Finance.tsx` — Marketing Total Income card added above existing cards; click-to-expand table showing marketing_orders with item-name filter; status badge shows Processing/Sold based on order.status=delivered

### Decisions
- Payment CVV is never stored (form state only, discarded on close)
- Order IDs auto-generated as ORD-[8 alphanumeric chars] with collision retry
- Cart is persistent (per farm_id in DB) until checkout clears it
- Inventory deduction only fires once (checks order.status !== 'processing' before deducting)

---

## 2026-05-02 — Livestock & Land Parcel Module Sprint

### New DB Tables (docs/livestock_migration.sql applied to AMIS_DB)
- `pigs` — pig_id, breed, gender, status, pen_number, date_recorded; UNIQUE(farm_id, pig_id)
- `cattle` — cattle_id, type (goat/sheep/cow), status, location; UNIQUE(farm_id, cattle_id)
- `birds` — type (chicken/duck), batch_number, total/female/male counts
- `fish_ponds` — pond_id, capacity, current_fish_count, status (available/full)
- `fish_stock` — species, number_of_fish, pond_id FK
- `mortality_records` — consolidated dead livestock from all source tables; source_table + source_id fields

### Backend
- `backend/src/routes/livestock.ts` (new) — 6 sub-module routers; 24h immutability (403 IMMUTABLE); transactional mortality migration via prisma.$transaction; fish capacity auto-sets status='full' at ≥ pond.capacity; uses prisma.$queryRaw + $executeRaw (bypasses Prisma generate lock)
- `backend/src/routes/landParcels.ts` — POST /assign endpoint; REVERT_STATUSES auto-clears crop_type on status change; ?status= query param filter
- `backend/src/routes/parcelRequests.ts` — PATCH /:id edit-while-pending; approved → creates land_parcels row with status='inactive'
- `backend/src/index.ts` — registered /api/v1/livestock router

### Frontend
- `src/pages/Livestock.tsx` — rewritten: 6-card Machinery-style layout; each card click-expands its own table; Pigs/Cattle/Birds/Fish/Mortality all have CRUD dialogs; 24h rule disables edit/delete; inline status dropdown auto-migrates to mortality_records on status='dead'
- `src/pages/LandParcels.tsx` — rewritten: 4 clickable cards (Requested/Active/Inactive/Total); Requested shows all requests with edit/delete for pending-only; Active/Inactive share Assign Parcel modal (picks inactive parcel, sets crop + status); Total shows all with status filter; status dropdown on Active/Inactive triggers confirm + PATCH (backend auto-clears crop on revert)

### Decisions
- 24h immutability enforced both frontend (disabled buttons) and backend (403 on PATCH/DELETE after 24h)
- Mortality migration is atomic: INSERT into mortality_records + soft-delete source row in single transaction
- Fish ponds track current_fish_count live; status auto-flips to 'full' when count ≥ capacity

---

## 2026-04-20 — Business Logic Sprint: Machinery, Land Parcels, Procurement & Dashboard

### New DB Tables
- `equipment_requests` — tracks machinery requests from Machinery dept to Procurement (pending/approved/disapproved/delivered)
- `parcel_requests` — tracks land parcel requests to Procurement
- `land_parcels` — new table (was Supabase-only, now in AMIS_DB)

### Backend (new routes)
- `backend/src/routes/equipmentRequests.ts` — CRUD + `/add-to-inventory` endpoint, delete only when pending
- `backend/src/routes/parcelRequests.ts` — CRUD, approved → auto-creates land_parcels row
- `backend/src/routes/landParcels.ts` — full CRUD for land parcels (replaced Supabase client)
- `backend/src/routes/procurement.ts` — added 3 department-request endpoints: GET all, PATCH accept, PATCH decline
- `backend/src/routes/assets.ts` — extended status enum to include 'active' and 'retired'
- `backend/src/index.ts` — registered 3 new routers

### Frontend (pages updated)
- `src/pages/Machinery.tsx` — complete overhaul: 8 cards (Total/Active/Operational/Maintenance/Lost/Retired/Sold/Requests), all with click-to-select highlight; Request Equipment form; Assign Machinery (operational only → sets Active); Add for Maintenance form; Report Lost Equipment (lookup by name+license); Retire Equipment; Restore from Lost/Retired; Cancel Maintenance; Add Machinery button on Delivered requests
- `src/pages/LandParcels.tsx` — migrated from Supabase to api.ts; "Add Parcel" → "Request Parcel" flow; Inactive Parcel card added; parcel request status table
- `src/pages/Procurement.tsx` — 2 new cards (Requested Orders, Declined Orders); cards are clickable; department request panel with Accept/Cancel actions; department filter; triggers New PO dialog on accept
- `src/pages/Dashboard.tsx` — migrated from Supabase to api.ts; all 8 StatCards now clickable and navigate to their subsystem

---

## 2026-04-18 — Phase 5: Sales, Distribution & Procurement complete

### Backend (new)
- `backend/src/routes/sales.ts` — 8 endpoints: customers (GET/POST/PATCH/DELETE), sales orders (GET/POST/PATCH/DELETE)
- `backend/src/routes/procurement.ts` — 7 endpoints: suppliers (GET/POST/DELETE), purchase orders (GET/POST/PATCH/DELETE)
- `backend/src/index.ts` — both routers registered at `/api/v1/sales` and `/api/v1/procurement`

### Frontend
- `src/pages/Customers.tsx` — Supabase swapped for `api.ts`; maps customerType camelCase to snake_case on POST
- `src/pages/Orders.tsx` — Supabase swapped for `api.ts`; UI statuses (in_production/quality_check/completed/rejected) translated to DB statuses (confirmed/packed/delivered/cancelled) in route layer — no JSX changes
- `src/pages/Procurement.tsx` — full production build from blank stub; KPI cards (total POs, pending, received); Tabs: Purchase Orders table with status dropdown, Suppliers table with CRUD
- `src/components/dashboard/RecentOrders.tsx` — Supabase swapped for `api.ts`; uses `select` transform to slice top 5

### Architecture decisions
- `sales_orders` has no `order_type` column; backend returns `order_type: 'sale'` as a constant so JSX badge renders without changes
- `sales_orders` soft-delete = set `status='cancelled'` (no deleted_at column)
- `purchase_orders` soft-delete = set `status='cancelled'` (no deleted_at column)

---

## 2026-04-18 — Phase 4: HR & Labor Management + Asset Management complete

### Backend (new)
- `backend/src/routes/hr.ts` — 10 endpoints: HR stats, employees (CRUD), attendance (GET/POST/PATCH), tasks (GET/POST/PATCH/DELETE)
- `backend/src/routes/assets.ts` — 7 endpoints: assets (CRUD), maintenance logs (GET/POST)
- `backend/src/index.ts` — both routers registered at `/api/v1/hr` and `/api/v1/assets`

### Frontend
- `src/pages/Employees.tsx` — full production build from blank stub; KPI cards (total workers, present today, attendance rate, pending tasks); Tabs: Field Workers table with sector filter, Daily Log with clock-in/out form, Assign Task with Kanban board (pending/in_progress/completed columns)
- `src/pages/Machinery.tsx` — Supabase swapped for `api.ts`; type array updated to DB constraint values (equipment/vehicle/tool/infrastructure/other); status array updated (operational/under_maintenance/decommissioned)

### Architecture decisions
- `attendance_logs` has UNIQUE(employee_id, log_date) — API returns 409 on duplicate, surfaced as toast
- `task_assignments` uses status='cancelled' as soft-delete (no deleted_at column)
- Assets `last_maintenance` derived from most recent `asset_maintenance_logs` row, computed in the GET / handler

---

## 2026-04-18 — Phase 3: Production Management complete

### Backend (new)
- `backend/src/routes/production.ts` — work orders (GET/POST/PATCH/DELETE) + livestock records (GET/POST/DELETE)
- `backend/src/index.ts` — production router registered at `/api/v1/production`

### Frontend (data layer only — no JSX changes)
- `src/pages/Production.tsx` — Supabase replaced with `api.ts`; `work_orders` response mapped to `production_batches` shape (product_name, status, quality_result)
- `src/pages/Livestock.tsx` — Supabase replaced with `api.ts`; `livestock_records` response mapped to old livestock shape (animal_type, breed, quantity, health_status, location)

### Decisions
- `work_orders.status` DB constraint (planned/in_progress/completed/cancelled) translated to/from UI values (pending/in_progress/passed/failed) in the route layer — no JSX changes required
- `livestock_records` has no location field; location stored in notes field
- `work_orders` has no deleted_at; soft-delete implemented by setting status='cancelled'

---

## 2026-04-18 — Phase 2: Inventory Management System complete

### Backend (new)
- `backend/src/routes/inventory.ts` — REST endpoints for categories, units, stock_items (CRUD + soft-delete), stock_transactions (ledger + record usage), reorder_alerts (list + acknowledge)
- `backend/src/index.ts` — registered inventory router at `/api/v1/inventory`
- POST /items accepts `initialQuantity` and auto-creates a `purchase` transaction atomically

### Frontend (data layer only — no JSX changes)
- `src/lib/api.ts` — added 204 no-content guard before `res.json()` (needed for soft-delete)
- `src/pages/Inventory.tsx` — replaced Supabase with `api.ts`; response mapped to existing field names (`item_name`, `category`, `quantity`, etc.) so JSX is untouched; category Select now loads from API
- `src/components/dashboard/InventoryAlerts.tsx` — replaced Supabase with `api.get('/inventory/alerts')`
- `src/components/layout/AppSidebar.tsx` — added open reorder-alert count badge on Inventory link (polls every 60 s)

### Decisions
- Page rule enforced: no JSX rewrites — only data layer swapped
- `initialQuantity` on item creation auto-posts a `purchase` transaction to maintain audit trail

---

## 2026-04-18 — Phase 1: Backend foundation complete and verified ✓

### Verified working
- `POST /api/v1/auth/login` → returns `{ accessToken, refreshToken, user }` with farmId resolved
- Bad password → 401 confirmed
- Frontend on port 8080 proxies `/api` to backend on port 3001

---

## 2026-04-18 — Phase 1: Backend foundation and auth layer built

### Backend (new — backend/)
- Created `backend/` Express + TypeScript + Prisma project
- `backend/prisma/schema.prisma` — auth tables (roles, users, sessions, farm_profiles, employees)
- `backend/prisma/seed.ts` — seeds default farm + admin user linked via employees table
- `backend/src/index.ts` — Express app, CORS, /api/v1/auth routes, /health endpoint
- `backend/src/lib/prisma.ts` — singleton PrismaClient
- `backend/src/middleware/auth.ts` — JWT verification, requireAuth(), requireRole()
- `backend/src/middleware/farm.ts` — sets PostgreSQL RLS context via set_current_farm()
- `backend/src/routes/auth.ts` — POST /login, /refresh, /logout, /register

### Frontend (changed)
- `src/lib/api.ts` — new fetch-based HTTP client; access token in memory, refresh token in localStorage; auto-retry on 401
- `src/types/auth.ts` — AuthUser, LoginResponse, RefreshResponse interfaces
- `src/hooks/useAuth.tsx` — fully rewritten; no longer depends on Supabase
- `vite.config.ts` — added `/api` proxy to backend port 3001
- `.env` — added comment explaining Supabase vars are temporary
- `.env.example` — created; documents all required vars for both frontend and backend

### Decisions made
- Access token: in-memory (not localStorage) to prevent XSS token theft
- Refresh token: localStorage for Phase 1 simplicity; migrate to httpOnly cookie in Phase 9
- Farm context: resolved via `employees.farm_id` on every login/refresh — no farm_id on users table
- Supabase client kept as transitional shim until all pages migrated in Phases 2–7
- Register endpoint creates `field_staff` role users; admin role assigned only via seed or admin panel

---

## 2026-04-18 — Phase 0: Project setup and CLAUDE.md created
- Created `CLAUDE.md` at repo root with full phased development plan (Phase 0–9)
- Initialized `docs/project_status.md` with Phase 0 baseline status
- Initialized this change log
- PostgreSQL 18 schema (`docs/amis_schema.sql`) confirmed complete: 42 tables, 3 materialized views, 21 triggers, 8 functions, RLS enabled
- Decision: backend will be Node.js + Express + TypeScript + Prisma (replacing Supabase)
- Decision: frontend design kept as-is; build on existing shadcn-ui components
