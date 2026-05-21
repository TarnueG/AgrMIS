# QA Functional Wiring Report

## 1. Summary

- Scope checked: sidebar/navigation, route wiring, dashboard quick actions and alert links, inventory, procurement, sales/orders, CRM, production, finance, reports, settings/access control, audit log, and cross-page API naming consistency.
- Pages reviewed: Dashboard, Inventory Management, Procurement, Sales & Orders, Sales & Order Points, Marketing, Customers / CRM, Production, Livestock / Farm Ops, HR / Labor Management, Machinery, Land Parcels, Finance / Accounting, Reports / Analytics, Settings, Access Control, Audit Logs.
- Verification method: code-path review across frontend pages and backend routes, route/API consistency checks, frontend production build, backend TypeScript build.
- Build status:
  - Frontend `npm run build`: successful.
  - Backend `npm run build`: successful.
  - `npx prisma generate`: not successful in this environment due Windows file-lock `EPERM` on Prisma engine rename, not a schema/type error.

## 2. Fixed Issues

| Page | Issue | Fix Made | Files Changed |
| --- | --- | --- | --- |
| Dashboard | Maintenance quick action routed to dead path `/machinery` | Updated route to `/assets/machinery` | `src/pages/Dashboard.tsx` |
| Dashboard | Backend-generated overdue maintenance alert linked to dead path `/machinery` | Updated alert link to `/assets/machinery` | `backend/src/routes/dashboard.ts` |
| Customers / CRM | Search field cleared itself on blur, making filtering appear broken | Removed blur-reset from both CRM search inputs | `src/pages/Customers.tsx` |
| Inventory | “Add Supplier” from Inventory sent the wrong payload shape, so contact person was not persisted correctly | Sent `contactPerson` explicitly and kept notes separate | `src/pages/Inventory.tsx` |
| Inventory | Inventory mutation buttons were visible to view-only roles | Added permission gating for add item, record movement, add supplier, and delete actions | `src/pages/Inventory.tsx` |
| Inventory | Delete action executed immediately with no confirmation | Added explicit confirmation before delete | `src/pages/Inventory.tsx` |
| Production | Create/update mutation controls were exposed to view-only roles | Added permission gating for create batch, add daily log, consume input, quality check, and status update | `src/pages/Production.tsx` |
| Sales & Orders | Order mutation controls were exposed to view-only roles | Added permission gating for new order, dispatch/complete, cancel, and dispatch submit | `src/pages/Orders.tsx` |

## 3. Buttons Checked

| Page | Button/Action | Status | Notes |
| --- | --- | --- | --- |
| Dashboard | Create Sales Order | Working | Routes to `/orders`. |
| Dashboard | Add Purchase Request | Working | Routes to `/procurement`. |
| Dashboard | Receive Stock | Working | Routes to `/inventory`. |
| Dashboard | Create Production Batch | Working | Routes to `/production`. |
| Dashboard | Assign Labor Task | Working | Routes to `/employees`. |
| Dashboard | Record Maintenance | Fixed | Dead route corrected to `/assets/machinery`. |
| Inventory | Add Supplier | Fixed | Payload contract corrected and button respects procurement create permission. |
| Inventory | Record Movement | Fixed | Button now respects inventory edit permission. |
| Inventory | Add Item | Fixed | Button now respects inventory create permission. |
| Inventory | Delete Item | Fixed | Confirmation added and button respects inventory delete permission. |
| Procurement | Add Supplier | Working | Already permission-gated and matched backend route. |
| Procurement | Add Purchase Request | Working | Already permission-gated and matched backend route. |
| Procurement | Approve / Reject / Receive Stock | Working | Existing backend and permission wiring matched current UI. |
| Sales & Orders | New Order | Fixed | Now hidden/disabled for users without create permission. |
| Sales & Orders | Dispatch / Complete | Fixed | Now hidden/disabled for users without edit permission. |
| Sales & Orders | Cancel | Fixed | Existing cancel flow was valid; UI now respects edit permission. |
| Customers / CRM | Add Customer | Working | Existing permission gate and backend route were correct. |
| Production | Add Daily Log | Fixed | Now respects create permission. |
| Production | Create Batch | Fixed | Now respects create permission. |
| Production | Consume Input | Fixed | Now respects create permission. |
| Production | Quality Check | Fixed | Now respects create permission. |
| Finance | Add Income | Working | Existing permission gate and refresh flow were correct. |
| Finance | Add Expense | Working | Existing permission gate and refresh flow were correct. |
| Finance | Export CSV tiles | Working | Existing backend export route matched UI. |
| Reports | Export CSV | Working | Existing route and token handling matched backend. |
| Reports | Export PDF | Disabled | Correctly disabled because no implemented PDF backend. |
| Access Control | Create Role / Save Permissions | Working | Uses current component routes under `/access-control/roles/...`. |
| Audit Logs | Export CSV | Working | Existing route and token handling matched backend. |

## 4. Dropdowns / Filters Checked

| Page | Dropdown/Filter | Status | Notes |
| --- | --- | --- | --- |
| Inventory | Category filter | Working | Filters current table rows. |
| Inventory | Location filter | Working | Filters current table rows. |
| Inventory | Status filter | Working | Filters current table rows. |
| Procurement | Category filter | Working | Existing query/UI filtering matched dataset. |
| Procurement | Status filter | Working | Existing query/UI filtering matched dataset. |
| Procurement | Supplier filter | Working | Existing query/UI filtering matched dataset. |
| Orders | Status filter | Working | Existing query/UI filtering matched dataset. |
| Orders | Payment filter | Working | Existing query/UI filtering matched dataset. |
| Orders | Customer filter | Working | Existing query/UI filtering matched dataset. |
| Production | Sector filter | Working | Existing query/UI filtering matched dataset. |
| Production | Status filter | Working | Existing query/UI filtering matched dataset. |
| Finance | Payment status selectors | Working | Existing PATCH endpoints matched backend. |
| Reports | Date range filter | Working | Existing query-string wiring matched backend. |
| Reports | Sector / category / department / report type filters | Working | Existing query-string wiring matched backend. |
| Access Control | Role selector | Working | Uses live role data and warns before discarding unsaved changes. |
| Audit Logs | Event type / subsystem / actor / severity / role / date filters | Working | Existing `/audit/events` query wiring matched backend. |
| Customers / CRM | Search input | Fixed | Search no longer clears itself on blur. |

## 5. Forms / Modals Checked

| Page | Form/Modal | Status | Notes |
| --- | --- | --- | --- |
| Inventory | Add Supplier | Fixed | Correct payload shape and permission gating. |
| Inventory | Record Movement | Fixed | Permission gating added. |
| Inventory | Add Inventory Item | Fixed | Permission gating added. |
| Procurement | Add Supplier | Working | Existing payload matched backend schema. |
| Procurement | Add Purchase Request | Working | Existing payload matched backend schema. |
| Orders | Create New Order | Fixed | Permission gating added; existing API route valid. |
| Orders | Dispatch / Complete Order | Fixed | Permission gating added; existing API route valid. |
| Customers / CRM | Add Customer | Working | Existing API route valid. |
| Production | Add Daily Log | Fixed | Permission gating added. |
| Production | Create Production Batch | Fixed | Permission gating added. |
| Production | Consume Inventory Input | Fixed | Permission gating added. |
| Production | Record Quality Check | Fixed | Permission gating added. |
| Finance | Record Income | Working | Existing mutation invalidates finance summaries/ledgers. |
| Finance | Record Expense | Working | Existing mutation invalidates finance summaries/ledgers. |
| Access Control | Role editor / user role assignment | Working | Uses current live access-control routes. |
| Audit Logs | Event detail drawer | Working | Existing detail fetch route matched frontend. |

## 6. API / Backend Issues

| Endpoint/Route | Issue | Fix Made | Notes |
| --- | --- | --- | --- |
| `GET /api/v1/dashboard/overview` generated alert link | Returned `/machinery` dead link for maintenance alerts | Updated to `/assets/machinery` | Fixed in backend route composer. |
| Dashboard quick action route | Frontend routed maintenance action to `/machinery` | Updated to `/assets/machinery` | Frontend and backend now consistent. |
| `POST /api/v1/procurement/suppliers` from Inventory page | Inventory page sent supplier payload in the wrong shape | Updated frontend payload to include `contactPerson` | Backend schema already correct. |
| Inventory mutation controls vs permission system | UI exposed create/edit/delete actions to view-only roles | Added frontend permission gating | Backend already enforced permissions; UI now matches it. |
| Production mutation controls vs permission system | UI exposed create/edit actions to view-only roles | Added frontend permission gating | Backend already enforced permissions; UI now matches it. |
| Sales mutation controls vs permission system | UI exposed create/edit actions to view-only roles | Added frontend permission gating | Backend already enforced permissions; UI now matches it. |

## 7. Remaining Changes Needed

- `npx prisma generate` is still blocked by a Windows file-lock on `query_engine-windows.dll.node`; this needs the locking process released before Prisma client regeneration can complete.
- Reports PDF export remains intentionally disabled because there is no implemented PDF export backend.
- CRM currently exposes add/delete/detail flows, but not a visible edit/archive UI. Backend support exists for update/activate/deactivate, but the current page does not surface those controls.
- Inventory currently exposes add, movement, delete, and filter flows, but not a visible edit form for stock records.
- The broader app still needs browser-driven end-to-end QA for every remaining modal/action on pages not changed in this pass, especially Livestock, Machinery, HR, Marketing, Land Parcels, and Sales & Order Points.
- Audit coverage depends on each module action calling audit services. The central audit UI is wired, but some module actions may still have partial audit coverage and should be verified separately.

## 8. Demo Readiness Notes

- Safe to demo: dashboard navigation, dashboard quick actions, inventory add/move/delete flows, procurement request/approve/receive flows, sales order create/dispatch/cancel flows, production batch/log/consume/quality flows, finance add/export flows, reports CSV export, access control, and audit log browsing/export.
- Avoid claiming Prisma regeneration is clean until the Windows file-lock issue is cleared and `npx prisma generate` is rerun successfully.
- Do not click PDF export in Reports during a demo; it is intentionally disabled.
- Do not present CRM edit/archive as implemented UI behavior yet; only add/delete/detail are visibly wired on the current page.
