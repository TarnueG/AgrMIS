import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { logAuditEvent, clientInfo } from '../lib/audit';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'view' as const : req.method === 'POST' ? 'create' as const : req.method === 'DELETE' ? 'delete' as const : 'edit' as const;
  return requirePermission('procurement', action)(req, res, next);
});

function mapPO(po: any) {
  return {
    id: po.id,
    created_at: po.created_at,
    supplier_id: po.supplier_id,
    po_number: po.po_number,
    order_date: po.order_date,
    expected_delivery: po.expected_delivery ?? null,
    status: po.status,
    payment_status: po.payment_status,
    total_amount: po.total_amount,
    commodity: po.commodity ?? null,
    quantity: po.quantity ?? null,
    notes: po.notes ?? '',
    suppliers: po.suppliers ? {
      name: po.suppliers.name,
      payment_method: po.suppliers.payment_method ?? null,
      account_number: po.suppliers.account_number ?? null,
    } : null,
  };
}

// ── Suppliers ────────────────────────────────────────────────────

const supplierSchema = z.object({
  name: z.string().min(1),
  supplierType: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  country: z.string().optional(),
  paymentMethod: z.enum(['bank', 'mobile_money']).optional(),
  accountNumber: z.string().optional(),
  commodity: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/suppliers', async (req, res) => {
  const { search } = req.query as Record<string, string>;
  try {
    const suppliers = await prisma.suppliers.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        deleted_at: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { contact_person: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
    });
    res.json(suppliers);
  } catch {
    res.status(500).json({ error: 'Failed to fetch suppliers', code: 'DB_ERROR' });
  }
});

router.post('/suppliers', async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const supplier = await prisma.suppliers.create({
      data: {
        farm_id: req.user!.farmId,
        name: d.name,
        supplier_type: d.supplierType,
        phone: d.phone,
        email: d.email || undefined,
        address: d.address,
        country: d.country,
        payment_method: d.paymentMethod ?? null,
        account_number: d.accountNumber ?? null,
        commodity: d.commodity ?? null,
        notes: d.notes,
      } as any,
    });
    res.status(201).json(supplier);
  } catch {
    res.status(500).json({ error: 'Failed to create supplier', code: 'DB_ERROR' });
  }
});

router.delete('/suppliers/:id', async (req, res) => {
  try {
    await prisma.suppliers.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete supplier', code: 'DB_ERROR' });
  }
});

// ── Purchase Orders ───────────────────────────────────────────────

const poSchema = z.object({
  supplierId: z.string().uuid(),
  totalAmount: z.number().min(0).default(0),
  expectedDelivery: z.string().optional(),
  commodity: z.string().optional(),
  quantity: z.number().positive().optional(),
  notes: z.string().optional(),
  // Optional link to the Asset Management department request this PO fulfills.
  // The asset only materializes when this PO is Paid (see finance pay handler).
  requestId: z.string().uuid().optional(),
  requestType: z.enum(['equipment', 'parcel', 'supply']).optional(),
});

router.get('/purchase-orders', async (req, res) => {
  const { status } = req.query as Record<string, string>;
  try {
    const pos = await prisma.purchase_orders.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        ...(status && status !== 'all' ? { status } : {}),
      },
      include: { suppliers: { select: { name: true, payment_method: true, account_number: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(pos.map(mapPO));
  } catch {
    res.status(500).json({ error: 'Failed to fetch purchase orders', code: 'DB_ERROR' });
  }
});

router.post('/purchase-orders', async (req, res) => {
  const parsed = poSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const poNumber = `PO-${Date.now()}`;
    const po = await prisma.purchase_orders.create({
      data: {
        farm_id: req.user!.farmId,
        supplier_id: d.supplierId,
        created_by: req.user!.userId,
        po_number: poNumber,
        total_amount: d.totalAmount,
        expected_delivery: d.expectedDelivery ? new Date(d.expectedDelivery) : undefined,
        commodity: d.commodity ?? null,
        quantity: d.quantity ?? null,
        notes: d.notes,
        source_request_id: d.requestId ?? null,
        source_request_type: d.requestType ?? null,
      } as any,
      include: { suppliers: { select: { name: true } } },
    });
    // Creating the PO consumes the source request from Requested Orders (the order
    // step is now "completed"); the asset itself only materializes when the PO is Paid.
    if (d.requestId && d.requestType === 'equipment') {
      await (prisma as any).equipment_requests.update({ where: { id: d.requestId }, data: { status: 'approved', updated_at: new Date() } }).catch(() => null);
    } else if (d.requestId && d.requestType === 'parcel') {
      await (prisma as any).parcel_requests.update({ where: { id: d.requestId }, data: { status: 'approved', updated_at: new Date() } }).catch(() => null);
    } else if (d.requestId && d.requestType === 'supply') {
      await (prisma as any).inventory_procurement_requests.update({ where: { id: d.requestId }, data: { status: 'approved', updated_at: new Date() } }).catch(() => null);
    }
    if (d.requestId) {
      const { ip, userAgent } = clientInfo(req);
      logAuditEvent({ actorUserId: req.user!.userId, eventType: 'order_status_changed', subsystem: 'procurement', description: `Order completed → Pending (PO ${po.po_number} created)`, metadata: { requestId: d.requestId, requestType: d.requestType, poId: po.id, from: 'Awaiting Acceptance', to: 'Pending' }, ipAddress: ip, userAgent });
    }
    res.status(201).json(mapPO(po));
  } catch {
    res.status(500).json({ error: 'Failed to create purchase order', code: 'DB_ERROR' });
  }
});

router.patch('/purchase-orders/:id', async (req, res) => {
  const { status, notes, expectedDelivery } = req.body;
  const allowed = ['draft', 'submitted', 'paid', 'cancelled'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' });
  }
  try {
    const po = await prisma.purchase_orders.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(expectedDelivery && { expected_delivery: new Date(expectedDelivery) }),
      },
      include: { suppliers: { select: { name: true } } },
    });
    res.json(mapPO(po));
  } catch {
    res.status(500).json({ error: 'Failed to update purchase order', code: 'DB_ERROR' });
  }
});

router.delete('/purchase-orders/:id', async (req, res) => {
  try {
    const po = await prisma.purchase_orders.findUnique({
      where: { id: req.params.id },
      select: { payment_status: true },
    });
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found', code: 'NOT_FOUND' });
    }
    if (po.payment_status === 'paid') {
      return res.status(409).json({ error: 'Paid orders cannot be deleted', code: 'PAID_ORDER' });
    }
    await prisma.purchase_orders.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete purchase order', code: 'DB_ERROR' });
  }
});

// ── Department Requests (cross-module inbox) ──────────────────────

router.get('/department-requests', async (req, res) => {
  try {
    const [equipReqs, parcelReqs, supplyReqs] = await Promise.all([
      (prisma as any).equipment_requests.findMany({
        where: { farm_id: req.user!.farmId ?? undefined },
        orderBy: { created_at: 'desc' },
      }),
      (prisma as any).parcel_requests.findMany({
        where: { farm_id: req.user!.farmId ?? undefined },
        orderBy: { created_at: 'desc' },
      }),
      // Chemicals & Feed requests route here too (spec 4.2), like equipment/parcel.
      (prisma as any).inventory_procurement_requests.findMany({
        where: { farm_id: req.user!.farmId ?? undefined, in_stock: false },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    const combined = [
      ...equipReqs.map((r: any) => ({ ...r, department: 'Machinery', item_type: 'equipment' })),
      ...parcelReqs.map((r: any) => ({ ...r, department: 'Land Parcels', item_type: 'parcel', name: r.name })),
      ...supplyReqs.map((r: any) => ({ ...r, department: 'Inventory', item_type: 'supply', name: r.item_name })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(combined);
  } catch {
    res.status(500).json({ error: 'Failed to fetch department requests', code: 'DB_ERROR' });
  }
});

router.patch('/department-requests/:id/accept', async (req, res) => {
  const { itemType } = req.body;
  try {
    if (itemType === 'equipment') {
      const updated = await (prisma as any).equipment_requests.update({
        where: { id: req.params.id },
        data: { status: 'approved', updated_at: new Date() },
      });
      return res.json(updated);
    } else if (itemType === 'parcel') {
      // Asset materialization is deferred to the PO "Paid" event (spec 2.1); no
      // land_parcels row is created here.
      const updated = await (prisma as any).parcel_requests.update({
        where: { id: req.params.id },
        data: { status: 'approved', updated_at: new Date() },
      });
      return res.json(updated);
    }
    res.status(400).json({ error: 'Unknown item type', code: 'VALIDATION_ERROR' });
  } catch {
    res.status(500).json({ error: 'Failed to accept request', code: 'DB_ERROR' });
  }
});

router.patch('/department-requests/:id/decline', async (req, res) => {
  const { itemType } = req.body;
  const table = itemType === 'equipment' ? 'equipment_requests' : itemType === 'parcel' ? 'parcel_requests' : itemType === 'supply' ? 'inventory_procurement_requests' : null;
  if (!table) return res.status(400).json({ error: 'Unknown item type', code: 'VALIDATION_ERROR' });
  try {
    // Cancel → Disapprove, moves to Decline Orders (spec 1.3).
    const updated = await (prisma as any)[table].update({
      where: { id: req.params.id },
      data: { status: 'disapproved', updated_at: new Date() },
    });
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, eventType: 'order_status_changed', subsystem: 'procurement', description: `Order declined → Disapprove`, metadata: { requestId: req.params.id, requestType: itemType, from: 'Awaiting Acceptance', to: 'Disapprove' }, ipAddress: ip, userAgent });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to decline request', code: 'DB_ERROR' });
  }
});

// ── Analytics ─────────────────────────────────────────────────────

type Bucket = { label: string; start: Date; end: Date };

function getAnalyticsRange(range: string): { from: Date; to: Date } {
  const to = new Date();
  switch (range) {
    case 'today': {
      const from = new Date(to); from.setHours(0, 0, 0, 0); return { from, to };
    }
    case 'week':
      return { from: new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000), to };
    case 'quarter':
      return { from: new Date(to.getFullYear(), to.getMonth() - 3, to.getDate()), to };
    case 'year':
      return { from: new Date(to.getFullYear() - 1, to.getMonth(), to.getDate()), to };
    default:
      return { from: new Date(to.getFullYear(), to.getMonth() - 1, to.getDate()), to };
  }
}

function buildAnalyticsBuckets(range: string, from: Date): Bucket[] {
  const months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  if (range === 'today') {
    return Array.from({ length: 24 }, (_, h) => {
      const start = new Date(from); start.setHours(h, 0, 0, 0);
      const end   = new Date(from); end.setHours(h, 59, 59, 999);
      return { label: `${String(h).padStart(2, '0')}:00`, start, end };
    });
  }
  if (range === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const start = new Date(from.getTime() + i * 86_400_000); start.setHours(0, 0, 0, 0);
      const end   = new Date(start); end.setHours(23, 59, 59, 999);
      return { label: days[start.getDay()], start, end };
    });
  }
  if (range === 'month') {
    return Array.from({ length: 4 }, (_, i) => {
      const start = new Date(from.getTime() + i * 7 * 86_400_000); start.setHours(0, 0, 0, 0);
      const end   = new Date(start.getTime() + 7 * 86_400_000 - 1);
      return { label: `Week ${i + 1}`, start, end };
    });
  }
  const n = range === 'quarter' ? 3 : 12;
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const end   = new Date(from.getFullYear(), from.getMonth() + i + 1, 0, 23, 59, 59, 999);
    return { label: months[start.getMonth()], start, end };
  });
}

router.get('/analytics', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const range  = typeof req.query.range === 'string' ? req.query.range : 'month';
  const { from, to } = getAnalyticsRange(range);

  try {
    const [pos, equipReqs, parcelReqs, supplyReqs, supplierCount] = await Promise.all([
      prisma.purchase_orders.findMany({
        where: { farm_id: farmId, created_at: { gte: from, lte: to } },
        select: { id: true, status: true, payment_status: true, created_at: true },
      }),
      // Request-status counts mirror the (un-ranged) Requested/Decline Orders cards on the
      // overview page — all three request types, no date filter (spec: declined reads from Decline Orders).
      (prisma as any).equipment_requests.findMany({
        where: { farm_id: farmId },
        select: { id: true, status: true, created_at: true },
      }),
      (prisma as any).parcel_requests.findMany({
        where: { farm_id: farmId },
        select: { id: true, status: true, created_at: true },
      }),
      (prisma as any).inventory_procurement_requests.findMany({
        where: { farm_id: farmId, in_stock: false },
        select: { id: true, status: true, created_at: true },
      }),
      prisma.suppliers.count({ where: { farm_id: farmId, deleted_at: null } }),
    ]);

    const allReqs   = [...equipReqs, ...parcelReqs, ...supplyReqs];
    const total     = allReqs.length;
    const accepted  = allReqs.filter((r: any) => r.status === 'approved').length;
    const declined  = allReqs.filter((r: any) => r.status === 'disapproved').length;
    const pending   = allReqs.filter((r: any) => r.status === 'pending').length;

    const active    = pos.filter(p => p.status !== 'cancelled');
    const paid      = pos.filter(p => p.payment_status === 'paid');
    const submitted = pos.filter(p => p.status === 'submitted');
    const cancelled = pos.filter(p => p.status === 'cancelled');

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;
    const inB  = (d: Date, b: Bucket) => d >= b.start && d <= b.end;
    const buckets = buildAnalyticsBuckets(range, from);

    res.json({
      range,
      generatedAt: new Date().toISOString(),
      kpis: {
        requestedOrdersReceived:     { value: total,             pct: 100 },
        purchaseOrders:              { value: active.length,     activeSuppliers: supplierCount },
        paidOrders:                  { value: paid.length,       pct: pct(paid.length, active.length) },
        requestsAccepted:            { value: accepted,          pct: pct(accepted, total) },
        requestsDeclined:            { value: declined,          pct: pct(declined, total) },
        requestsSubmittedForPayment: { value: submitted.length,  pct: pct(submitted.length, active.length) },
      },
      orderRequestStatus: [
        { status: 'Received', count: total },
        { status: 'Accepted', count: accepted },
        { status: 'Declined', count: declined },
        { status: 'Pending',  count: pending },
      ],
      finishedOrders: [
        { label: 'Paid',      count: paid.length },
        { label: 'Cancelled', count: cancelled.length },
      ],
      requestsAcceptedSeries: buckets.map(b => ({
        bucket: b.label,
        count: allReqs.filter((r: any) => r.status === 'approved' && inB(new Date(r.created_at), b)).length,
      })),
      orderVolumeTrends: buckets.map(b => {
        const bp = pos.filter(p => inB(new Date(p.created_at), b));
        return {
          bucket:         b.label,
          purchaseOrders: bp.filter(p => p.status !== 'cancelled').length,
          paidOrders:     bp.filter(p => p.payment_status === 'paid').length,
          unpaidOrders:   bp.filter(p => p.payment_status !== 'paid' && p.status !== 'cancelled').length,
        };
      }),
    });
  } catch (err) {
    console.error('[Procurement/Analytics]', err);
    res.status(500).json({ error: 'Failed to fetch analytics', code: 'DB_ERROR' });
  }
});

// ── Analytics — Metric Item Lists ────────────────────────────────

const VALID_METRICS = new Set([
  'purchase-orders', 'paid-orders', 'payment-requests',
  'requested-orders', 'accepted-requests', 'declined-requests',
  'suppliers',
]);

router.get('/analytics/:metric/items', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const metric = req.params.metric;

  if (!VALID_METRICS.has(metric)) {
    return res.status(400).json({ error: 'Invalid metric', code: 'VALIDATION_ERROR' });
  }

  const range    = typeof req.query.range    === 'string' ? req.query.range : 'month';
  const page     = Math.max(1, Number(req.query.page)     || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const q        = typeof req.query.q    === 'string' ? req.query.q.trim() : '';
  const sortRaw  = typeof req.query.sort === 'string' ? req.query.sort     : 'date:desc';
  const [sortField, sortDirRaw] = sortRaw.split(':');
  const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc';
  const skip = (page - 1) * pageSize;
  const { from, to } = getAnalyticsRange(range);

  try {
    if (['purchase-orders', 'paid-orders', 'payment-requests'].includes(metric)) {
      const where: any = { farm_id: farmId, created_at: { gte: from, lte: to } };
      if (metric === 'purchase-orders')  where.status = { not: 'cancelled' };
      if (metric === 'paid-orders')      where.payment_status = 'paid';
      if (metric === 'payment-requests') where.status = 'submitted';
      if (q) {
        where.OR = [
          { po_number: { contains: q, mode: 'insensitive' } },
          { commodity:  { contains: q, mode: 'insensitive' } },
          { suppliers:  { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
      const orderBy = sortField === 'amount' ? { total_amount: sortDir } : { created_at: sortDir };
      const [total, rows] = await Promise.all([
        prisma.purchase_orders.count({ where }),
        prisma.purchase_orders.findMany({
          where,
          include: { suppliers: { select: { name: true } } },
          orderBy,
          skip,
          take: pageSize,
        }),
      ]);
      return res.json({
        metric, range, page, pageSize, total,
        items: rows.map(p => ({
          id: p.id,
          reference: p.po_number,
          supplier:  (p as any).suppliers?.name ?? '-',
          commodity: (p as any).commodity ?? '-',
          amount:    Number(p.total_amount),
          status:
            p.payment_status === 'paid' ? 'Paid'
            : p.status === 'submitted'  ? 'Submitted'
            : p.status.charAt(0).toUpperCase() + p.status.slice(1),
          date: p.created_at,
        })),
      });
    }

    if (metric === 'suppliers') {
      const sWhere: any = { farm_id: farmId, deleted_at: null };
      if (q) {
        sWhere.OR = [
          { name:      { contains: q, mode: 'insensitive' } },
          { commodity: { contains: q, mode: 'insensitive' } },
        ];
      }
      const sOrderBy = sortField === 'commodity' ? { commodity: sortDir } : { name: sortDir };
      const [total, rows] = await Promise.all([
        prisma.suppliers.count({ where: sWhere }),
        prisma.suppliers.findMany({ where: sWhere, orderBy: sOrderBy, skip, take: pageSize }),
      ]);
      return res.json({
        metric, range, page, pageSize, total,
        items: rows.map((s: any) => ({
          id:        s.id,
          reference: s.name,
          commodity: s.commodity ?? '-',
          itemType:  s.payment_method ? (s.payment_method as string).replace('_', ' ') : '-',
          status:    'Active',
          date:      s.created_at,
        })),
      });
    }

    // Request-based metrics — fetch both tables and merge in memory
    const [equipReqs, parcelReqs] = await Promise.all([
      (prisma as any).equipment_requests.findMany({
        where: { farm_id: farmId, created_at: { gte: from, lte: to } },
        select: { id: true, name: true, status: true, created_at: true },
      }),
      (prisma as any).parcel_requests.findMany({
        where: { farm_id: farmId, created_at: { gte: from, lte: to } },
        select: { id: true, name: true, status: true, created_at: true },
      }),
    ]);

    let combined: any[] = [
      ...equipReqs.map((r: any)  => ({ ...r, department: 'Machinery',    itemType: 'Equipment'   })),
      ...parcelReqs.map((r: any) => ({ ...r, department: 'Land Parcels', itemType: 'Land Parcel' })),
    ];

    if (metric === 'accepted-requests') combined = combined.filter(r => r.status === 'approved');
    if (metric === 'declined-requests') combined = combined.filter(r => r.status === 'disapproved');

    if (q) {
      const ql = q.toLowerCase();
      combined = combined.filter(r =>
        r.name?.toLowerCase().includes(ql) || r.department?.toLowerCase().includes(ql)
      );
    }

    combined.sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === 'desc' ? -diff : diff;
    });

    const total = combined.length;
    const paged = combined.slice(skip, skip + pageSize);

    return res.json({
      metric, range, page, pageSize, total,
      items: paged.map((r: any) => ({
        id:         r.id,
        reference:  r.name ?? '-',
        department: r.department,
        itemType:   r.itemType,
        status:
          r.status === 'approved'    ? 'Accepted'
          : r.status === 'disapproved' ? 'Declined'
          : 'Pending',
        date: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[Procurement/Analytics/Items]', err);
    res.status(500).json({ error: 'Failed to fetch items', code: 'DB_ERROR' });
  }
});

export default router;
