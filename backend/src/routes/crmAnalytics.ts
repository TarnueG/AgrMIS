import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use(requirePermission('crm', 'view'));

const summaryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  period: z.enum(['month', 'quarter', 'year']).optional(),
  window: z.enum(['12m']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const SEGMENT_LABELS: Record<string, string> = {
  business: 'Business',
  individual: 'Individual',
  exporter: 'Business',
  retailer: 'Business',
  restaurant: 'Business',
};

const PRODUCT_COLORS = ['#6E74E0', '#EF8B4E', '#34B788', '#2B2F48', '#E2574C'];

function monthsBack(count: number) {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - count, 1);
  return { start, end };
}

function previousWindow(count: number) {
  const end = new Date();
  const currentStart = new Date(end.getFullYear(), end.getMonth() - count, 1);
  const previousStart = new Date(end.getFullYear(), end.getMonth() - count * 2, 1);
  return { previousStart, currentStart };
}

function pctChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function formatMonthLabel(date: Date) {
  return date.toLocaleString('en-US', { month: 'short' });
}

function maskEmail(email: string | null | undefined) {
  if (!email || !email.includes('@')) return 'hidden';
  const [local, domain] = email.split('@');
  const safeLocal = `${local[0] ?? '*'}${'*'.repeat(Math.max(4, local.length - 1))}`;
  return `${safeLocal}@${domain}`;
}

function getCustomerScope(farmId: string | null) {
  return { farm_id: farmId ?? undefined, deleted_at: null };
}

function getSalesScope(farmId: string | null, start?: Date, end?: Date) {
  return {
    farm_id: farmId ?? undefined,
    ...(start || end ? { created_at: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
  };
}

async function getSegmentBreakdown(farmId: string | null) {
  const customers = await prisma.customers.findMany({
    where: getCustomerScope(farmId),
    select: { customer_type: true },
  });

  const buckets = new Map<string, number>([
    ['Business', 0],
    ['Individual', 0],
  ]);

  for (const customer of customers) {
    const key = SEGMENT_LABELS[customer.customer_type] ?? 'Individual';
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const total = customers.length;
  const segments = Array.from(buckets.entries()).map(([type, count]) => ({
    type,
    count,
    pct: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
  }));

  return { total, segments };
}

async function getTopCustomers(farmId: string | null, limit: number) {
  const rows = await prisma.sales_orders.groupBy({
    by: ['customer_id'],
    where: getSalesScope(farmId),
    _sum: { total_amount: true },
    _count: { _all: true },
    orderBy: { _sum: { total_amount: 'desc' } },
    take: limit,
  });

  const customerIds = rows.map((row) => row.customer_id);
  const [customers, yearOrders] = await Promise.all([
    prisma.customers.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.sales_orders.findMany({
      where: {
        customer_id: { in: customerIds },
        ...getSalesScope(farmId, new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1)),
      },
      select: { customer_id: true, created_at: true, total_amount: true },
      orderBy: { created_at: 'asc' },
    }),
  ]);

  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(new Date().getFullYear(), new Date().getMonth() - (5 - index), 1);
    return `${date.getFullYear()}-${date.getMonth()}`;
  });

  return rows.map((row) => {
    const customer = customerMap.get(row.customer_id);
    const trendMap = new Map(monthBuckets.map((bucket) => [bucket, 0]));

    for (const order of yearOrders) {
      if (order.customer_id !== row.customer_id) continue;
      const bucket = `${order.created_at.getFullYear()}-${order.created_at.getMonth()}`;
      trendMap.set(bucket, (trendMap.get(bucket) ?? 0) + Number(order.total_amount));
    }

    return {
      id: row.customer_id,
      name: customer?.name ?? 'Unknown customer',
      emailMasked: maskEmail(customer?.email),
      totalPurchase: Number(row._sum.total_amount ?? 0),
      orderCount: row._count._all,
      trend: monthBuckets.map((bucket) => Number((trendMap.get(bucket) ?? 0).toFixed(2))),
    };
  });
}

async function getTopProducts(farmId: string | null, limit: number) {
  const start = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
  const orders = await (prisma as any).marketing_orders.findMany({
    where: {
      farm_id: farmId ?? undefined,
      date: { gte: start },
    },
    select: { id: true, item_name: true, quantity: true, date: true },
    orderBy: { date: 'asc' },
  });

  const totals = new Map<string, number>();
  const seriesMap = new Map<string, number[]>();

  for (const order of orders) {
    const name = order.item_name;
    totals.set(name, (totals.get(name) ?? 0) + Number(order.quantity ?? 0));
    if (!seriesMap.has(name)) seriesMap.set(name, Array.from({ length: 12 }, () => 0));
    const orderDate = new Date(order.date);
    const monthIndex = (orderDate.getFullYear() - start.getFullYear()) * 12 + (orderDate.getMonth() - start.getMonth());
    if (monthIndex >= 0 && monthIndex < 12) {
      seriesMap.get(name)![monthIndex] += Number(order.quantity ?? 0);
    }
  }

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name], index) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      color: PRODUCT_COLORS[index % PRODUCT_COLORS.length],
      totalVolume: Number((totals.get(name) ?? 0).toFixed(2)),
      series: (seriesMap.get(name) ?? Array.from({ length: 12 }, () => 0)).map((value) => Number(value.toFixed(2))),
      months: Array.from({ length: 12 }, (_, monthIndex) => formatMonthLabel(new Date(start.getFullYear(), start.getMonth() + monthIndex, 1))),
    }));
}

router.get('/customers/summary', async (req, res) => {
  const farmId = req.user!.farmId;
  const { currentStart, previousStart } = previousWindow(1);

  try {
    const [total, currentActive, previousActive] = await Promise.all([
      prisma.customers.count({ where: { ...getCustomerScope(farmId), is_active: true } }),
      prisma.customers.count({ where: { ...getCustomerScope(farmId), created_at: { gte: currentStart } } }),
      prisma.customers.count({ where: { ...getCustomerScope(farmId), created_at: { gte: previousStart, lt: currentStart } } }),
    ]);

    res.json({ total, deltaPct: pctChange(currentActive, previousActive), period: 'last month' });
  } catch {
    res.status(500).json({ error: 'Failed to fetch customer summary', code: 'DB_ERROR' });
  }
});

router.get('/purchases/summary', async (req, res) => {
  const farmId = req.user!.farmId;
  const { currentStart, previousStart } = previousWindow(1);

  try {
    const [current, previous] = await Promise.all([
      prisma.sales_orders.aggregate({
        where: { ...getSalesScope(farmId, currentStart), payment_status: 'paid' },
        _sum: { total_amount: true },
        _count: { _all: true },
      }),
      prisma.sales_orders.aggregate({
        where: { ...getSalesScope(farmId, previousStart, currentStart), payment_status: 'paid' },
        _sum: { total_amount: true },
        _count: { _all: true },
      }),
    ]);

    res.json({
      totalValue: Number(current._sum.total_amount ?? 0),
      ordersSettled: current._count._all,
      deltaPct: pctChange(Number(current._sum.total_amount ?? 0), Number(previous._sum.total_amount ?? 0)),
      period: 'last period',
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch purchase summary', code: 'DB_ERROR' });
  }
});

router.get('/carts/abandoned', async (req, res) => {
  const farmId = req.user!.farmId;
  const { currentStart, previousStart } = previousWindow(1);

  try {
    const [current, previous] = await Promise.all([
      (prisma as any).cart_items.aggregate({
        where: { farm_id: farmId ?? undefined, created_at: { gte: currentStart } },
        _sum: { quantity: true, total_amount: true },
        _count: { _all: true },
      }),
      (prisma as any).cart_items.aggregate({
        where: { farm_id: farmId ?? undefined, created_at: { gte: previousStart, lt: currentStart } },
        _sum: { quantity: true, total_amount: true },
        _count: { _all: true },
      }),
    ]);

    res.json({
      itemCount: Number(current._sum.quantity ?? 0),
      potentialValue: Number(current._sum.total_amount ?? 0),
      openCarts: current._count._all,
      deltaPct: pctChange(Number(current._sum.total_amount ?? 0), Number(previous._sum.total_amount ?? 0)),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch cart summary', code: 'DB_ERROR' });
  }
});

router.get('/customers/segments', async (req, res) => {
  try {
    res.json(await getSegmentBreakdown(req.user!.farmId));
  } catch {
    res.status(500).json({ error: 'Failed to fetch customer segments', code: 'DB_ERROR' });
  }
});

router.get('/customers/top', async (req, res) => {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });

  try {
    res.json(await getTopCustomers(req.user!.farmId, parsed.data.limit ?? 10));
  } catch {
    res.status(500).json({ error: 'Failed to fetch top customers', code: 'DB_ERROR' });
  }
});

router.get('/products/top', async (req, res) => {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });

  try {
    res.json(await getTopProducts(req.user!.farmId, parsed.data.limit ?? 5));
  } catch {
    res.status(500).json({ error: 'Failed to fetch top products', code: 'DB_ERROR' });
  }
});

router.get('/customers', async (req, res) => {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const page = parsed.data.page ?? 1;
  const pageSize = parsed.data.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  try {
    const [total, customers] = await Promise.all([
      prisma.customers.count({ where: getCustomerScope(req.user!.farmId) }),
      prisma.customers.findMany({
        where: getCustomerScope(req.user!.farmId),
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
        select: { id: true, name: true, customer_type: true, email: true, is_active: true, created_at: true },
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      items: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        type: SEGMENT_LABELS[customer.customer_type] ?? customer.customer_type,
        emailMasked: maskEmail(customer.email),
        isActive: customer.is_active,
        createdAt: customer.created_at,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch customers detail', code: 'DB_ERROR' });
  }
});

router.get('/purchases', async (req, res) => {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const page = parsed.data.page ?? 1;
  const pageSize = parsed.data.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  try {
    const [total, orders] = await Promise.all([
      prisma.sales_orders.count({ where: getSalesScope(req.user!.farmId) }),
      prisma.sales_orders.findMany({
        where: getSalesScope(req.user!.farmId),
        include: { customers: { select: { name: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      items: orders.map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        customerName: order.customers.name,
        totalAmount: Number(order.total_amount),
        status: order.status,
        paymentStatus: order.payment_status,
        createdAt: order.created_at,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch purchases detail', code: 'DB_ERROR' });
  }
});

router.get('/carts', async (req, res) => {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const page = parsed.data.page ?? 1;
  const pageSize = parsed.data.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  try {
    const [total, items] = await Promise.all([
      (prisma as any).cart_items.count({ where: { farm_id: req.user!.farmId ?? undefined } }),
      (prisma as any).cart_items.findMany({
        where: { farm_id: req.user!.farmId ?? undefined },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      items: items.map((item: any) => ({
        id: item.id,
        itemName: item.item_name,
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unit_price ?? 0),
        totalAmount: Number(item.total_amount ?? 0),
        createdAt: item.created_at,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch carts detail', code: 'DB_ERROR' });
  }
});

router.get('/segments', async (req, res) => {
  try {
    const detail = await getSegmentBreakdown(req.user!.farmId);
    res.json(detail);
  } catch {
    res.status(500).json({ error: 'Failed to fetch segments detail', code: 'DB_ERROR' });
  }
});

router.get('/products', async (req, res) => {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });

  try {
    res.json({ items: await getTopProducts(req.user!.farmId, parsed.data.limit ?? 20) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch products detail', code: 'DB_ERROR' });
  }
});

router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = async () => {
    const [customers, purchases, carts, segments, topCustomers, topProducts] = await Promise.all([
      prisma.customers.count({ where: { ...getCustomerScope(req.user!.farmId), is_active: true } }).then((total) => ({ total })),
      prisma.sales_orders.aggregate({ where: { ...getSalesScope(req.user!.farmId), payment_status: 'paid' }, _sum: { total_amount: true }, _count: { _all: true } }).then((data) => ({
        totalValue: Number(data._sum.total_amount ?? 0),
        ordersSettled: data._count._all,
      })),
      (prisma as any).cart_items.aggregate({ where: { farm_id: req.user!.farmId ?? undefined }, _sum: { quantity: true, total_amount: true }, _count: { _all: true } }).then((data: any) => ({
        itemCount: Number(data._sum.quantity ?? 0),
        potentialValue: Number(data._sum.total_amount ?? 0),
        openCarts: data._count._all,
      })),
      getSegmentBreakdown(req.user!.farmId),
      getTopCustomers(req.user!.farmId, 10),
      getTopProducts(req.user!.farmId, 5),
    ]);

    res.write(`event: snapshot\n`);
    res.write(`data: ${JSON.stringify({ customers, purchases, carts, segments, topCustomers, topProducts })}\n\n`);
  };

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\n`);
    res.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  }, 15_000);

  const snapshotTimer = setInterval(() => {
    send().catch(() => {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: 'stream_update_failed' })}\n\n`);
    });
  }, 30_000);

  send().catch(() => {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: 'stream_boot_failed' })}\n\n`);
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(snapshotTimer);
    res.end();
  });
});

export default router;
