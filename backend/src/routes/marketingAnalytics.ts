import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use(requirePermission('marketing', 'view'));

const rangeSchema = z.enum(['monthly', 'weekly', 'daily']);
const salesRangeSchema = z.enum(['month', 'weekly', 'daily']);
const statusSchema = z.enum(['pending', 'in_process', 'completed']);

const CHANNELS = [
  { key: 'paid_ads', label: 'Paid Ads', color: '#E2592A' },
  { key: 'organic', label: 'Organic', color: '#1F7A5E' },
  { key: 'email', label: 'Email', color: '#C99A1E' },
  { key: 'referral', label: 'Referral', color: '#5C4B8C' },
] as const;

const PRODUCT_COLORS = ['#E2592A', '#1F7A5E', '#C99A1E', '#5C4B8C', '#C0445A'];

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatMoney(value: number) {
  return Number(value.toFixed(2));
}

function pctChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function relativeTime(date: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function inferChannel(order: { payment_status?: string | null; payment_intent_id?: string | null; amount: number; status?: string | null; order_id: string }) {
  const hash = Array.from(order.order_id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  if ((order.payment_status ?? '') === 'paid' && (order.amount ?? 0) >= 500) return CHANNELS[0];
  if ((order.status ?? '') === 'completed') return CHANNELS[1];
  if ((order.payment_intent_id ?? '').startsWith('pi_')) return CHANNELS[2];
  return CHANNELS[hash % CHANNELS.length];
}

function getIncomeBuckets(range: z.infer<typeof rangeSchema>) {
  const now = new Date();
  if (range === 'daily') {
    const start = addDays(startOfDay(now), -13);
    return Array.from({ length: 14 }, (_, index) => {
      const bucketStart = addDays(start, index);
      const bucketEnd = addDays(bucketStart, 1);
      return {
        key: `${bucketStart.getFullYear()}-${bucketStart.getMonth()}-${bucketStart.getDate()}`,
        label: bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start: bucketStart,
        end: bucketEnd,
      };
    });
  }

  if (range === 'weekly') {
    const base = addDays(startOfDay(now), -7 * 11);
    return Array.from({ length: 12 }, (_, index) => {
      const bucketStart = addDays(base, index * 7);
      const bucketEnd = addDays(bucketStart, 7);
      return {
        key: `${bucketStart.getFullYear()}-${bucketStart.getMonth()}-${bucketStart.getDate()}`,
        label: `W${index + 1}`,
        start: bucketStart,
        end: bucketEnd,
      };
    });
  }

  const start = monthStart(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  return Array.from({ length: 12 }, (_, index) => {
    const bucketStart = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const bucketEnd = new Date(start.getFullYear(), start.getMonth() + index + 1, 1);
    return {
      key: `${bucketStart.getFullYear()}-${bucketStart.getMonth()}`,
      label: bucketStart.toLocaleDateString('en-US', { month: 'short' }),
      start: bucketStart,
      end: bucketEnd,
    };
  });
}

function getSalesBuckets(range: z.infer<typeof salesRangeSchema>) {
  return getIncomeBuckets(range === 'month' ? 'monthly' : range);
}

function isInBucket(dateValue: Date | null | undefined, start: Date, end: Date) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  return date >= start && date < end;
}

async function getMarketingOrders(farmId: string | null) {
  return (prisma as any).marketing_orders.findMany({
    where: { farm_id: farmId ?? undefined },
    orderBy: { date: 'asc' },
  });
}

async function getTopProductsData(farmId: string | null) {
  const orders = await getMarketingOrders(farmId);
  const totals = new Map<string, number>();
  for (const order of orders) {
    totals.set(order.item_name, (totals.get(order.item_name) ?? 0) + Number(order.amount ?? 0));
  }

  const ranked = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value], index) => ({
      rank: index + 1,
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      value: formatMoney(value),
      color: PRODUCT_COLORS[index % PRODUCT_COLORS.length],
    }));

  const max = ranked[0]?.value ?? 1;
  return ranked.map((item) => ({ ...item, pct: Number(((item.value / max) * 100).toFixed(1)) }));
}

async function buildSnapshot(farmId: string | null) {
  const [orders, paymentTransactions, prices, topProducts] = await Promise.all([
    getMarketingOrders(farmId),
    (prisma as any).payment_transactions.findMany({ where: { farm_id: farmId ?? undefined }, orderBy: { created_at: 'asc' } }),
    (prisma as any).prices.findMany({ where: { farm_id: farmId ?? undefined }, orderBy: { updated_at: 'asc' } }),
    getTopProductsData(farmId),
  ]);

  const totalIncome = orders.reduce((sum: number, order: any) => sum + Number(order.amount ?? 0), 0);
  const completedOrders = orders.filter((order: any) => ['completed', 'delivered'].includes(order.status ?? ''));
  const pendingOrders = orders.filter((order: any) => order.status === 'pending');
  const inProcessOrders = orders.filter((order: any) => ['processing', 'in_process', 'confirmed', 'en_route'].includes(order.status ?? ''));

  const salesVsPurchaseMonths = getIncomeBuckets('monthly');
  const salesVsPurchase = salesVsPurchaseMonths.map((bucket) => {
    const sales = orders
      .filter((order: any) => isInBucket(order.date, bucket.start, bucket.end))
      .reduce((sum: number, order: any) => sum + Number(order.amount ?? 0), 0);
    const purchase = prices
      .filter((price: any) => isInBucket(price.updated_at, bucket.start, bucket.end))
      .reduce((sum: number, price: any) => sum + Number(price.price_per_unit ?? 0), 0);
    return { label: bucket.label, sales: formatMoney(sales), purchase: formatMoney(purchase) };
  });

  const channelTotals = new Map<string, number>(CHANNELS.map((channel) => [channel.key, 0]));
  for (const order of orders) {
    const channel = inferChannel(order);
    channelTotals.set(channel.key, (channelTotals.get(channel.key) ?? 0) + Number(order.amount ?? 0));
  }
  const channelSum = Array.from(channelTotals.values()).reduce((sum, value) => sum + value, 0);
  const revenueBreakdown = CHANNELS.map((channel) => {
    const value = channelTotals.get(channel.key) ?? 0;
    return {
      key: channel.key,
      label: channel.label,
      value: formatMoney(value),
      pct: channelSum > 0 ? Number(((value / channelSum) * 100).toFixed(1)) : 0,
      color: channel.color,
    };
  });

  const lastUpdatedSource = [
    ...orders.map((order: any) => new Date(order.updated_at ?? order.date ?? Date.now()).getTime()),
    ...paymentTransactions.map((tx: any) => new Date(tx.updated_at ?? tx.created_at ?? Date.now()).getTime()),
  ];
  const lastUpdated = new Date(lastUpdatedSource.length ? Math.max(...lastUpdatedSource) : Date.now());

  return {
    summary: {
      totalIncome: formatMoney(totalIncome),
      totalRevenue: formatMoney(channelSum),
      pendingOrders: pendingOrders.length,
      inProcessOrders: inProcessOrders.length,
      completedOrders: completedOrders.length,
      monthlyTarget: 840000,
      targetProgress: totalIncome > 0 ? Number(Math.min(100, (totalIncome / 840000) * 100).toFixed(1)) : 0,
      currentMonthIncome: formatMoney(
        orders
          .filter((order: any) => isInBucket(order.date, monthStart(new Date()), new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)))
          .reduce((sum: number, order: any) => sum + Number(order.amount ?? 0), 0),
      ),
      updatedAt: lastUpdated.toISOString(),
      updatedRelative: relativeTime(lastUpdated),
    },
    revenueBreakdown,
    topProducts,
    salesVsPurchase,
  };
}

router.get('/summary', async (req, res) => {
  try {
    const snapshot = await buildSnapshot(req.user!.farmId);
    const previousMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    const currentMonthStart = monthStart(new Date());
    const previousMonth = await (prisma as any).marketing_orders.aggregate({
      where: { farm_id: req.user!.farmId ?? undefined, date: { gte: previousMonthStart, lt: currentMonthStart } },
      _sum: { amount: true },
    });
    res.json({
      ...snapshot.summary,
      totalRevenueSummary: formatMoney(snapshot.revenueBreakdown.reduce((sum: number, entry: any) => sum + entry.value, 0)),
      revenueDeltaPct: pctChange(snapshot.summary.currentMonthIncome, Number(previousMonth._sum?.amount ?? 0)),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch marketing summary', code: 'DB_ERROR' });
  }
});

router.get('/income', async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query.range);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid range', code: 'VALIDATION_ERROR' });

  try {
    const orders = await getMarketingOrders(req.user!.farmId);
    const buckets = getIncomeBuckets(parsed.data);
    const series = buckets.map((bucket, index) => {
      const income = orders
        .filter((order: any) => isInBucket(order.date, bucket.start, bucket.end))
        .reduce((sum: number, order: any) => sum + Number(order.amount ?? 0), 0);
      const previousValues = buckets.slice(Math.max(0, index - 2), index).map((priorBucket) =>
        orders
          .filter((order: any) => isInBucket(order.date, priorBucket.start, priorBucket.end))
          .reduce((sum: number, order: any) => sum + Number(order.amount ?? 0), 0),
      );
      const forecast = previousValues.length
        ? previousValues.reduce((sum, value) => sum + value, 0) / previousValues.length
        : income;
      return {
        label: bucket.label,
        income: formatMoney(income),
        forecast: formatMoney(forecast),
      };
    });

    const total = series.reduce((sum, point) => sum + point.income, 0);
    const latest = series.at(-1)?.income ?? 0;
    const prior = series.at(-2)?.income ?? 0;
    res.json({
      range: parsed.data,
      total: formatMoney(total),
      growthPct: pctChange(latest, prior),
      subtitle: 'across the last 12 months',
      series,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch income analytics', code: 'DB_ERROR' });
  }
});

router.get('/sales', async (req, res) => {
  const parsed = salesRangeSchema.safeParse(req.query.range);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid range', code: 'VALIDATION_ERROR' });

  try {
    const orders = await getMarketingOrders(req.user!.farmId);
    const buckets = getSalesBuckets(parsed.data);
    const series = buckets.map((bucket) => ({
      label: bucket.label,
      value: formatMoney(
        orders
          .filter((order: any) => ['completed', 'delivered', 'confirmed'].includes(order.status ?? '') && isInBucket(order.date, bucket.start, bucket.end))
          .reduce((sum: number, order: any) => sum + Number(order.quantity ?? 0), 0),
      ),
    }));
    res.json({ range: parsed.data, series });
  } catch {
    res.status(500).json({ error: 'Failed to fetch sales analytics', code: 'DB_ERROR' });
  }
});

router.get('/orders/summary', async (req, res) => {
  try {
    const orders = await getMarketingOrders(req.user!.farmId);
    const buckets = getIncomeBuckets('monthly');
    const series = buckets.map((bucket) => ({
      label: bucket.label,
      received: orders.filter((order: any) => isInBucket(order.date, bucket.start, bucket.end)).length,
      fulfilled: orders.filter((order: any) => ['completed', 'delivered'].includes(order.status ?? '') && isInBucket(order.date, bucket.start, bucket.end)).length,
    }));
    res.json({ series });
  } catch {
    res.status(500).json({ error: 'Failed to fetch order summary', code: 'DB_ERROR' });
  }
});

router.get('/orders/counts', async (req, res) => {
  try {
    const now = new Date();
    const currentStart = monthStart(now);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const orders = await getMarketingOrders(req.user!.farmId);

    const buildCount = (matcher: (order: any) => boolean) => {
      const current = orders.filter((order: any) => matcher(order) && isInBucket(order.date, currentStart, new Date(now.getFullYear(), now.getMonth() + 1, 1))).length;
      const previous = orders.filter((order: any) => matcher(order) && isInBucket(order.date, previousStart, currentStart)).length;
      return { value: current, trendPct: pctChange(current, previous) };
    };

    res.json({
      pending: buildCount((order) => order.status === 'pending'),
      inProcess: buildCount((order) => ['processing', 'in_process', 'confirmed', 'en_route'].includes(order.status ?? '')),
      completed: buildCount((order) => ['completed', 'delivered'].includes(order.status ?? '')),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch order counts', code: 'DB_ERROR' });
  }
});

router.get('/sales-vs-purchase', async (req, res) => {
  try {
    const snapshot = await buildSnapshot(req.user!.farmId);
    res.json({ series: snapshot.salesVsPurchase });
  } catch {
    res.status(500).json({ error: 'Failed to fetch sales vs purchase analytics', code: 'DB_ERROR' });
  }
});

router.get('/revenue-breakdown', async (req, res) => {
  try {
    const snapshot = await buildSnapshot(req.user!.farmId);
    res.json({
      total: formatMoney(snapshot.revenueBreakdown.reduce((sum: number, entry: any) => sum + entry.value, 0)),
      items: snapshot.revenueBreakdown,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch revenue breakdown', code: 'DB_ERROR' });
  }
});

router.get('/top-products', async (req, res) => {
  try {
    res.json({ items: await getTopProductsData(req.user!.farmId) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch top products', code: 'DB_ERROR' });
  }
});

router.get('/orders', async (req, res) => {
  const parsedStatus = statusSchema.safeParse(req.query.status);
  if (!parsedStatus.success) return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' });
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  try {
    const dbStatus =
      parsedStatus.data === 'pending'
        ? ['pending']
        : parsedStatus.data === 'in_process'
          ? ['processing', 'in_process', 'confirmed', 'en_route']
          : ['completed', 'delivered'];

    const [total, rows] = await Promise.all([
      (prisma as any).marketing_orders.count({
        where: { farm_id: req.user!.farmId ?? undefined, status: { in: dbStatus } },
      }),
      (prisma as any).marketing_orders.findMany({
        where: { farm_id: req.user!.farmId ?? undefined, status: { in: dbStatus } },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      items: rows.map((order: any) => ({
        id: order.id,
        orderId: order.order_id,
        vendor: order.item_name,
        channel: inferChannel(order).label,
        date: order.date,
        amount: formatMoney(Number(order.amount ?? 0)),
        status: order.status,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch marketing order details', code: 'DB_ERROR' });
  }
});

router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = async () => {
    const snapshot = await buildSnapshot(req.user!.farmId);
    res.write('event: snapshot\n');
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    res.write('event: heartbeat\n');
    res.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  }, 15000);

  const timer = setInterval(() => {
    send().catch(() => {
      res.write('event: error\n');
      res.write(`data: ${JSON.stringify({ message: 'stream_update_failed' })}\n\n`);
    });
  }, 30000);

  send().catch(() => {
    res.write('event: error\n');
    res.write(`data: ${JSON.stringify({ message: 'stream_boot_failed' })}\n\n`);
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(timer);
    res.end();
  });
});

export default router;
