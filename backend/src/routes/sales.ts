import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { isAdminRole } from '../lib/permissions';
import { logAuditEvent, clientInfo } from '../lib/audit';
import { deactivateUser, reactivateUser, findLinkedUserId } from '../lib/userStatus';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const subsystem = req.path.startsWith('/orders') ? 'sales_order_points' : 'crm';
  const action = req.method === 'GET' ? 'view' as const : req.method === 'POST' ? 'create' as const : req.method === 'DELETE' ? 'delete' as const : 'edit' as const;
  return requirePermission(subsystem, action)(req, res, next);
});

// UI ↔ DB status translation
const UI_TO_DB: Record<string, string> = {
  pending: 'pending',
  in_production: 'confirmed',
  quality_check: 'packed',
  completed: 'delivered',
  rejected: 'cancelled',
};

const DB_TO_UI: Record<string, string> = {
  pending: 'pending',
  confirmed: 'in_production',
  packed: 'quality_check',
  dispatched: 'quality_check',
  delivered: 'completed',
  invoiced: 'completed',
  cancelled: 'rejected',
};

function mapOrder(o: any) {
  return {
    id: o.id,
    created_at: o.created_at,
    customer_id: o.customer_id,
    order_number: o.order_number,
    order_date: o.order_date,
    delivery_date: o.delivery_date ?? null,
    status: DB_TO_UI[o.status] ?? o.status,
    payment_status: o.payment_status,
    total_amount: o.total_amount,
    notes: o.notes ?? '',
    order_type: 'sale',
    customers: o.customers ? { name: o.customers.name } : null,
  };
}

// ── Customers ───────────────────────────────────────────────────

const customerSchema = z.object({
  name: z.string().min(1),
  customerType: z.enum(['individual', 'business', 'exporter', 'retailer', 'restaurant']).default('individual'),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/customers', async (req, res) => {
  const { search } = req.query as Record<string, string>;
  try {
    const customers = await prisma.customers.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        deleted_at: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { created_at: 'asc' },
    });
    const result = customers.map((c: any, i: number) => ({
      ...c,
      is_active: c.is_active ?? true,
      display_id: `CUST-${String(i + 1).padStart(3, '0')}`,
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch customers', code: 'DB_ERROR' });
  }
});

router.post('/customers', async (req, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const customer = await prisma.customers.create({
      data: {
        farm_id: req.user!.farmId,
        name: d.name,
        customer_type: d.customerType,
        contact_person: d.contactPerson,
        phone: d.phone,
        email: d.email || undefined,
        address: d.address,
        country: d.country,
        notes: d.notes,
      },
    });
    res.status(201).json(customer);
  } catch {
    res.status(500).json({ error: 'Failed to create customer', code: 'DB_ERROR' });
  }
});

router.patch('/customers/:id', async (req, res) => {
  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const customer = await prisma.customers.update({
      where: { id: req.params.id },
      data: {
        ...(d.name && { name: d.name }),
        ...(d.customerType && { customer_type: d.customerType }),
        ...(d.phone !== undefined && { phone: d.phone }),
        ...(d.email !== undefined && { email: d.email }),
        ...(d.address !== undefined && { address: d.address }),
        ...(d.notes !== undefined && { notes: d.notes }),
      },
    });
    res.json(customer);
  } catch {
    res.status(500).json({ error: 'Failed to update customer', code: 'DB_ERROR' });
  }
});

// GET /api/v1/sales/customers/:id/orders
router.get('/customers/:id/orders', async (req, res) => {
  try {
    const orders = await prisma.sales_orders.findMany({
      where: {
        customer_id: req.params.id,
        farm_id: req.user!.farmId ?? undefined,
      },
      include: { customers: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(orders.map(mapOrder));
  } catch {
    res.status(500).json({ error: 'Failed to fetch customer orders', code: 'DB_ERROR' });
  }
});

router.delete('/customers/:id', async (req, res) => {
  try {
    await prisma.customers.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete customer', code: 'DB_ERROR' });
  }
});

router.patch('/customers/:id/deactivate', async (req, res) => {
  try {
    await prisma.customers.update({
      where: { id: req.params.id },
      data: { is_active: false, deactivated_at: new Date(), updated_at: new Date() },
    });
    const linkedUserId = await findLinkedUserId('customer', req.params.id);
    if (linkedUserId) await deactivateUser(linkedUserId);
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, eventType: 'customer_deactivated', subsystem: 'crm', description: `Customer ${req.params.id} deactivated`, ipAddress: ip, userAgent });
    res.json({ message: 'Customer deactivated' });
  } catch {
    res.status(500).json({ error: 'Failed to deactivate customer', code: 'DB_ERROR' });
  }
});

router.patch('/customers/:id/activate', async (req, res) => {
  try {
    await prisma.customers.update({
      where: { id: req.params.id },
      data: { is_active: true, deactivated_at: null, updated_at: new Date() },
    });
    const linkedUserId = await findLinkedUserId('customer', req.params.id);
    if (linkedUserId) await reactivateUser(linkedUserId);
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, eventType: 'customer_activated', subsystem: 'crm', description: `Customer ${req.params.id} activated`, ipAddress: ip, userAgent });
    res.json({ message: 'Customer activated' });
  } catch {
    res.status(500).json({ error: 'Failed to activate customer', code: 'DB_ERROR' });
  }
});

// ── Sales Orders ─────────────────────────────────────────────────

const orderSchema = z.object({
  customerId: z.string().uuid(),
  totalAmount: z.number().min(0).default(0),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/orders', async (req, res) => {
  const { status, search } = req.query as Record<string, string>;
  const dbStatus = status && UI_TO_DB[status] ? UI_TO_DB[status] : undefined;
  const roleName = req.user!.roleName;

  // ABAC: customers only see orders linked to their own customer record
  let customerIdFilter: string | undefined;
  if (roleName === 'customer') {
    const linked = await prisma.customers.findFirst({
      where: { email: { equals: req.user!.email, mode: 'insensitive' }, deleted_at: null },
      select: { id: true },
    });
    customerIdFilter = linked?.id ?? '__none__';
  }

  try {
    const orders = await prisma.sales_orders.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        ...(dbStatus && { status: dbStatus }),
        ...(customerIdFilter && { customer_id: customerIdFilter }),
      },
      include: { customers: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(orders.map(mapOrder));
  } catch {
    res.status(500).json({ error: 'Failed to fetch orders', code: 'DB_ERROR' });
  }
});

router.post('/orders', async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const orderNumber = `SO-${Date.now()}`;
    const order = await prisma.sales_orders.create({
      data: {
        farm_id: req.user!.farmId,
        customer_id: d.customerId,
        created_by: req.user!.userId,
        order_number: orderNumber,
        total_amount: d.totalAmount,
        delivery_date: d.deliveryDate ? new Date(d.deliveryDate) : undefined,
        notes: d.notes,
      },
      include: { customers: { select: { name: true } } },
    });
    res.status(201).json(mapOrder(order));
  } catch {
    res.status(500).json({ error: 'Failed to create order', code: 'DB_ERROR' });
  }
});

router.patch('/orders/:id', async (req, res) => {
  const { status, notes, deliveryDate, paymentStatus } = req.body;
  try {
    const order = await prisma.sales_orders.update({
      where: { id: req.params.id },
      data: {
        updated_by: req.user!.userId,
        ...(status && { status: UI_TO_DB[status] ?? status }),
        ...(notes !== undefined && { notes }),
        ...(deliveryDate && { delivery_date: new Date(deliveryDate) }),
        ...(paymentStatus && { payment_status: paymentStatus }),
      },
      include: { customers: { select: { name: true } } },
    });
    res.json(mapOrder(order));
  } catch {
    res.status(500).json({ error: 'Failed to update order', code: 'DB_ERROR' });
  }
});

router.delete('/orders/:id', async (req, res) => {
  try {
    await prisma.sales_orders.update({
      where: { id: req.params.id },
      data: { status: 'cancelled', updated_by: req.user!.userId },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete order', code: 'DB_ERROR' });
  }
});

// ─── CRM Analytics ───────────────────────────────────────────────────────────

const MONTHS_C = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monthBuckets(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { label: MONTHS_C[d.getMonth()], start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) };
  });
}
function maskEmail(email?: string | null): string {
  if (!email) return '—';
  const [user, domain] = email.split('@');
  if (!domain) return '—';
  const head = user.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(1, Math.min(4, user.length - 1)))}@${domain}`;
}
const settled = (s?: string | null) => s !== 'cancelled';

router.get('/analytics/customers/summary', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const customers = await prisma.customers.findMany({ where: { farm_id: farmId, deleted_at: null }, select: { is_active: true, created_at: true } });
    const total = customers.filter(c => c.is_active).length;
    const now = Date.now();
    const cur = customers.filter(c => new Date(c.created_at).getTime() >= now - 30 * 86400000).length;
    const prev = customers.filter(c => { const t = new Date(c.created_at).getTime(); return t >= now - 60 * 86400000 && t < now - 30 * 86400000; }).length;
    const deltaPct = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);
    res.json({ total, deltaPct, period: 'month', generatedAt: new Date().toISOString() });
  } catch { res.status(500).json({ error: 'Failed to fetch customer summary', code: 'DB_ERROR' }); }
});

router.get('/analytics/purchases/summary', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const orders = await prisma.sales_orders.findMany({ where: { farm_id: farmId }, select: { total_amount: true, status: true, order_date: true, created_at: true } });
    const valid = orders.filter(o => settled(o.status));
    const totalValue = valid.reduce((s, o) => s + Number(o.total_amount), 0);
    const dt = (o: any) => new Date(o.order_date ?? o.created_at).getTime();
    const now = Date.now();
    const cur = valid.filter(o => dt(o) >= now - 30 * 86400000).reduce((s, o) => s + Number(o.total_amount), 0);
    const prev = valid.filter(o => { const t = dt(o); return t >= now - 60 * 86400000 && t < now - 30 * 86400000; }).reduce((s, o) => s + Number(o.total_amount), 0);
    const deltaPct = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);
    res.json({ totalValue, ordersSettled: valid.length, deltaPct, period: 'month', generatedAt: new Date().toISOString() });
  } catch { res.status(500).json({ error: 'Failed to fetch purchases summary', code: 'DB_ERROR' }); }
});

router.get('/analytics/carts/abandoned', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const carts = await prisma.cart_items.findMany({ where: { farm_id: farmId } });
    const itemCount = carts.reduce((s, c) => s + Number(c.quantity), 0);
    const potentialValue = carts.reduce((s, c) => s + Number(c.total_amount), 0);
    res.json({ itemCount: Math.round(itemCount), potentialValue, openCarts: carts.length, deltaPct: 0, generatedAt: new Date().toISOString() });
  } catch { res.status(500).json({ error: 'Failed to fetch carts', code: 'DB_ERROR' }); }
});

router.get('/analytics/customers/segments', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const customers = await prisma.customers.findMany({ where: { farm_id: farmId, deleted_at: null }, select: { customer_type: true } });
    const total = customers.length;
    const counts: Record<string, number> = {};
    for (const c of customers) { const t = c.customer_type === 'business' ? 'Business' : 'Individual'; counts[t] = (counts[t] || 0) + 1; }
    const segments = ['Business', 'Individual'].map(type => ({ type, count: counts[type] || 0, pct: total > 0 ? Math.round(((counts[type] || 0) / total) * 100) : 0 }));
    res.json({ total, segments, generatedAt: new Date().toISOString() });
  } catch { res.status(500).json({ error: 'Failed to fetch segments', code: 'DB_ERROR' }); }
});

router.get('/analytics/customers/top', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  try {
    const customers = await prisma.customers.findMany({
      where: { farm_id: farmId, deleted_at: null },
      select: { id: true, name: true, email: true, sales_orders: { select: { total_amount: true, status: true, order_date: true, created_at: true } } },
    });
    const buckets = monthBuckets(6);
    const ranked = customers.map(c => {
      const valid = (c.sales_orders as any[]).filter(o => settled(o.status));
      const totalPurchase = valid.reduce((s, o) => s + Number(o.total_amount), 0);
      const trend = buckets.map(b => valid.filter(o => { const t = new Date(o.order_date ?? o.created_at); return t >= b.start && t <= b.end; }).reduce((s, o) => s + Number(o.total_amount), 0));
      return { id: c.id, name: c.name, emailMasked: maskEmail(c.email), totalPurchase, trend };
    }).filter(c => c.totalPurchase > 0).sort((a, b) => b.totalPurchase - a.totalPurchase).slice(0, limit);
    res.json(ranked);
  } catch { res.status(500).json({ error: 'Failed to fetch top customers', code: 'DB_ERROR' }); }
});

router.get('/analytics/products/top', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 5));
  try {
    const items = await prisma.sales_order_items.findMany({
      where: { sales_orders: { farm_id: farmId, status: { not: 'cancelled' } } },
      select: { quantity: true, line_total: true, stock_item_id: true, stock_items: { select: { name: true } }, sales_orders: { select: { order_date: true, created_at: true } } },
    });
    const buckets = monthBuckets(12);
    const byProduct: Record<string, { name: string; total: number; series: number[] }> = {};
    for (const it of items as any[]) {
      const key = it.stock_item_id;
      if (!byProduct[key]) byProduct[key] = { name: it.stock_items?.name ?? 'Unknown', total: 0, series: Array(12).fill(0) };
      byProduct[key].total += Number(it.line_total);
      const d = new Date(it.sales_orders?.order_date ?? it.sales_orders?.created_at);
      const bi = buckets.findIndex(b => d >= b.start && d <= b.end);
      if (bi >= 0) byProduct[key].series[bi] += Number(it.quantity);
    }
    const top = Object.entries(byProduct).sort((a, b) => b[1].total - a[1].total).slice(0, limit)
      .map(([id, v]) => ({ id, name: v.name, series: v.series }));
    res.json({ labels: buckets.map(b => b.label), products: top });
  } catch { res.status(500).json({ error: 'Failed to fetch top products', code: 'DB_ERROR' }); }
});

// Detail lists for drilldown pages
router.get('/analytics/customers/list', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  try {
    const where = { farm_id: farmId, deleted_at: null };
    const [total, rows] = await Promise.all([
      prisma.customers.count({ where }),
      prisma.customers.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, name: true, email: true, customer_type: true, country: true, is_active: true, sales_orders: { select: { total_amount: true, status: true } } } }),
    ]);
    res.json({ page, pageSize, total, items: rows.map(c => ({
      id: c.id, name: c.name, emailMasked: maskEmail(c.email), type: c.customer_type, country: c.country ?? '-', active: c.is_active,
      totalPurchase: (c.sales_orders as any[]).filter(o => settled(o.status)).reduce((s, o) => s + Number(o.total_amount), 0),
    })) });
  } catch { res.status(500).json({ error: 'Failed to fetch customers', code: 'DB_ERROR' }); }
});

router.get('/analytics/purchases/list', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  try {
    const where = { farm_id: farmId, status: { not: 'cancelled' } };
    const [total, rows] = await Promise.all([
      prisma.sales_orders.count({ where }),
      prisma.sales_orders.findMany({ where, orderBy: { order_date: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, order_number: true, total_amount: true, status: true, payment_status: true, order_date: true, customers: { select: { name: true } } } }),
    ]);
    res.json({ page, pageSize, total, items: rows.map((o: any) => ({
      id: o.id, order_number: o.order_number, customer: o.customers?.name ?? '-', amount: Number(o.total_amount), status: o.status, payment_status: o.payment_status, date: o.order_date,
    })) });
  } catch { res.status(500).json({ error: 'Failed to fetch purchases', code: 'DB_ERROR' }); }
});

router.get('/analytics/carts/list', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const carts = await prisma.cart_items.findMany({ where: { farm_id: farmId }, orderBy: { created_at: 'desc' } });
    res.json({ total: carts.length, items: carts.map(c => ({ id: c.id, item_name: c.item_name, quantity: Number(c.quantity), unit_price: Number(c.unit_price), total_amount: Number(c.total_amount), date: c.created_at })) });
  } catch { res.status(500).json({ error: 'Failed to fetch cart list', code: 'DB_ERROR' }); }
});

export default router;
