import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const subsystem = req.path.startsWith('/livestock') ? 'livestock' : 'production';
  const action = req.method === 'GET' ? 'view' as const : req.method === 'POST' ? 'create' as const : req.method === 'DELETE' ? 'delete' as const : 'edit' as const;
  return requirePermission(subsystem, action)(req, res, next);
});

// ── Status translation helpers ──────────────────────────────────

// Production.tsx uses: pending | in_progress | quality_check | passed | failed | rework
// work_orders DB allows: planned | in_progress | completed | cancelled
function toDbStatus(uiStatus: string): string {
  const map: Record<string, string> = {
    pending: 'planned',
    in_progress: 'in_progress',
    quality_check: 'in_progress',
    passed: 'completed',
    failed: 'cancelled',
    rework: 'planned',
  };
  return map[uiStatus] ?? 'planned';
}

function toUiStatus(dbStatus: string): string {
  const map: Record<string, string> = {
    planned: 'pending',
    in_progress: 'in_progress',
    completed: 'passed',
    cancelled: 'failed',
  };
  return map[dbStatus] ?? 'pending';
}

function mapWorkOrder(wo: any) {
  return {
    id: wo.id,
    product_name: wo.title,
    quantity: 0,
    orders: wo.description ? { customers: { name: wo.description } } : null,
    status: toUiStatus(wo.status),
    quality_result: null,
    created_at: wo.created_at,
  };
}

// ── Work Orders (Production page) ───────────────────────────────

const createWorkOrderSchema = z.object({
  product_name: z.string().min(1),
  quantity: z.number().min(0).default(0),
  order_id: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/work-orders', async (req, res) => {
  try {
    const rows = await prisma.work_orders.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        status: { not: 'cancelled' },
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(rows.map(mapWorkOrder));
  } catch {
    res.status(500).json({ error: 'Failed to fetch work orders', code: 'DB_ERROR' });
  }
});

router.post('/work-orders', async (req, res) => {
  const parsed = createWorkOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const { product_name, notes } = parsed.data;
  const woNumber = `WO-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];
  try {
    const wo = await prisma.work_orders.create({
      data: {
        work_order_number: woNumber,
        title: product_name,
        description: notes ?? null,
        planned_start_date: new Date(today),
        status: 'planned',
        farm_id: req.user!.farmId,
        created_by: req.user!.userId,
      },
    });
    res.status(201).json(mapWorkOrder(wo));
  } catch {
    res.status(500).json({ error: 'Failed to create work order', code: 'DB_ERROR' });
  }
});

router.patch('/work-orders/:id', async (req, res) => {
  const { status, quality_result } = req.body;
  try {
    const wo = await prisma.work_orders.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status: toDbStatus(status) }),
        updated_at: new Date(),
      },
    });
    res.json(mapWorkOrder(wo));
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Work order not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update work order', code: 'DB_ERROR' });
  }
});

router.delete('/work-orders/:id', async (req, res) => {
  try {
    await prisma.work_orders.update({
      where: { id: req.params.id },
      data: { status: 'cancelled', updated_at: new Date() },
    });
    res.status(204).end();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Work order not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete work order', code: 'DB_ERROR' });
  }
});

// ── Livestock (Livestock page) ───────────────────────────────────

// Livestock.tsx uses: healthy | sick | recovering | quarantine
// livestock_records DB allows: active | sold | deceased | transferred
function toDbHealthStatus(_uiStatus: string): string {
  return 'active';
}

function toUiHealthStatus(dbStatus: string): string {
  const map: Record<string, string> = {
    active: 'healthy',
    sold: 'healthy',
    deceased: 'sick',
    transferred: 'recovering',
  };
  return map[dbStatus] ?? 'healthy';
}

function mapLivestock(l: any) {
  return {
    id: l.id,
    animal_type: l.animal_type,
    breed: l.breed ?? '',
    quantity: l.current_count,
    health_status: toUiHealthStatus(l.status),
    location: l.notes ?? '',
    notes: l.notes ?? '',
  };
}

const createLivestockSchema = z.object({
  animal_type: z.string().min(1),
  breed: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  health_status: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/livestock', async (req, res) => {
  try {
    const rows = await prisma.livestock_records.findMany({
      where: { farm_id: req.user!.farmId ?? undefined, deleted_at: null },
      orderBy: { animal_type: 'asc' },
    });
    res.json(rows.map(mapLivestock));
  } catch {
    res.status(500).json({ error: 'Failed to fetch livestock', code: 'DB_ERROR' });
  }
});

router.post('/livestock', async (req, res) => {
  const parsed = createLivestockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const { animal_type, breed, quantity, location, notes } = parsed.data;
  try {
    const record = await prisma.livestock_records.create({
      data: {
        animal_type,
        breed: breed ?? null,
        current_count: quantity,
        status: 'active',
        notes: location ? `${location}${notes ? ' | ' + notes : ''}` : (notes ?? null),
        farm_id: req.user!.farmId,
        recorded_by: req.user!.userId,
      },
    });
    res.status(201).json(mapLivestock(record));
  } catch {
    res.status(500).json({ error: 'Failed to create livestock record', code: 'DB_ERROR' });
  }
});

router.delete('/livestock/:id', async (req, res) => {
  try {
    await prisma.livestock_records.update({
      where: { id: req.params.id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    res.status(204).end();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete livestock record', code: 'DB_ERROR' });
  }
});

// ── Daily Production Logs ────────────────────────────────────────

const dailyLogSchema = z.object({
  sector: z.string().min(1),
  activity: z.string().min(1),
  quantity: z.number().positive().optional(),
  unit: z.string().optional(),
  stockItemId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

router.get('/daily-logs', async (req, res) => {
  try {
    const logs = await prisma.daily_production_logs.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { log_date: 'desc' },
      take: 100,
    });
    res.json(logs);
  } catch {
    res.status(500).json({ error: 'Failed to fetch daily logs', code: 'DB_ERROR' });
  }
});

router.post('/daily-logs', async (req, res) => {
  const parsed = dailyLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  try {
    const log = await prisma.daily_production_logs.create({
      data: {
        farm_id: req.user!.farmId,
        logged_by: req.user!.userId,
        sector: d.sector,
        activity: d.activity,
        quantity: d.quantity ?? null,
        unit: d.unit ?? null,
        stock_item_id: d.stockItemId ?? null,
        notes: d.notes ?? null,
      },
    });
    res.status(201).json(log);
  } catch {
    res.status(500).json({ error: 'Failed to create daily log', code: 'DB_ERROR' });
  }
});

// ─── Production Analytics ─────────────────────────────────────────────────────

const PMONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
type PB = { label: string; start: Date; end: Date };
function perfBuckets(range: string): PB[] {
  const now = new Date();
  if (range === 'weekly') {
    return Array.from({ length: 8 }, (_, i) => {
      const start = new Date(now); start.setDate(now.getDate() - (7 - i) * 7); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
      return { label: `W${start.getDate()}/${start.getMonth() + 1}`, start, end };
    });
  }
  if (range === 'monthly') {
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1);
      return { label: PMONTHS[d.getMonth()], start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) };
    });
  }
  // daily — last 7 days
  return Array.from({ length: 7 }, (_, i) => {
    const start = new Date(now); start.setDate(now.getDate() - (6 - i)); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    return { label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][start.getDay()], start, end };
  });
}
const inP = (d: Date, b: PB) => d >= b.start && d <= b.end;
const stageProgress: Record<string, number> = { pending: 15, in_process: 50, quality_check: 80, passed: 100, rework: 40 };

router.get('/analytics/overview', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const range = ['daily', 'weekly', 'monthly'].includes(String(req.query.range)) ? String(req.query.range) : 'daily';
  try {
    const [batches, requests, chem] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT b.id, b.batch_number, r.product_name AS product_name, b.quantity, b.status, b.created_at, b.updated_at, r.location
        FROM inventory_production_batches b LEFT JOIN inventory_production_requests r ON r.id = b.request_id
        WHERE b.farm_id = ${farmId}::uuid ORDER BY b.updated_at DESC`,
      prisma.$queryRaw<any[]>`SELECT product_name, quantity, status, created_at FROM inventory_production_requests WHERE farm_id = ${farmId}::uuid`,
      prisma.$queryRaw<any[]>`
        SELECT si.name, st.quantity, st.transacted_at AS created_at FROM stock_transactions st
        JOIN stock_items si ON si.id = st.stock_item_id
        WHERE si.farm_id = ${farmId}::uuid AND st.source_module = 'production' AND st.transaction_type = 'usage'`,
    ]);

    const passed = batches.filter(b => b.status === 'passed');
    const rework = batches.filter(b => b.status === 'rework');
    const inCheck = batches.filter(b => b.status === 'quality_check');
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const declined = requests.filter(r => r.status === 'cancelled');

    const spark6 = perfBuckets('daily');
    const sparkOf = (rows: any[], field = 'created_at') => spark6.map(b => rows.filter(r => inP(new Date(r[field]), b)).length);
    const passRate = (passed.length + rework.length) ? Math.round((passed.length / (passed.length + rework.length)) * 1000) / 10 : 0;
    const trend = (rows: any[]) => { const s = sparkOf(rows); const c = s[s.length - 1] ?? 0, p = s[s.length - 2] ?? 0; return p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : (c > 0 ? 100 : 0); };

    const kpis = {
      totalProduced: { value: passed.length, trend: trend(passed), spark: sparkOf(passed) },
      unitsToday: { value: Math.round(batches.filter(b => new Date(b.updated_at) >= dayStart).reduce((s, b) => s + Number(b.quantity ?? 0), 0)), trend: trend(batches.filter(b => new Date(b.created_at) >= dayStart)), spark: spark6.map(b => batches.filter(x => inP(new Date(x.created_at), b)).reduce((s, x) => s + Number(x.quantity ?? 0), 0)) },
      declined: { value: declined.length, trend: trend(declined), spark: sparkOf(declined) },
      passRate: { value: passRate, trend: 0, spark: spark6.map(b => { const bp = passed.filter(x => inP(new Date(x.created_at), b)).length; const br = rework.filter(x => inP(new Date(x.created_at), b)).length; return (bp + br) ? Math.round((bp / (bp + br)) * 100) : 0; }) },
    };

    // Output timeseries — 8 × 3h buckets today, top products
    const outBuckets: PB[] = Array.from({ length: 8 }, (_, i) => { const start = new Date(dayStart); start.setHours(i * 3, 0, 0, 0); const end = new Date(start); end.setHours(start.getHours() + 2, 59, 59, 999); return { label: `${String(i * 3).padStart(2, '0')}:00`, start, end }; });
    const prodTotals: Record<string, number> = {};
    for (const b of batches) prodTotals[b.product_name] = (prodTotals[b.product_name] || 0) + Number(b.quantity ?? 0);
    const topProducts = Object.entries(prodTotals).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
    const output = {
      labels: outBuckets.map(b => b.label),
      products: topProducts.map(name => ({ name, series: outBuckets.map(b => batches.filter(x => x.product_name === name && inP(new Date(x.created_at), b)).reduce((s, x) => s + Number(x.quantity ?? 0), 0)) })),
    };

    const quality = { passed: passed.length, rework: rework.length, passRate };

    const pbk = perfBuckets(range);
    const performance = pbk.map(b => ({
      bucket: b.label,
      pending: batches.filter(x => x.status === 'pending' && inP(new Date(x.created_at), b)).length,
      inCheck: batches.filter(x => x.status === 'quality_check' && inP(new Date(x.created_at), b)).length,
      passed: batches.filter(x => x.status === 'passed' && inP(new Date(x.created_at), b)).length,
    }));

    const chemAgg: Record<string, number> = {};
    for (const c of chem) chemAgg[c.name] = (chemAgg[c.name] || 0) + Number(c.quantity ?? 0);
    const resources = Object.entries(chemAgg).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, quantity]) => ({ name, quantity: Math.round(quantity * 100) / 100 }));

    const rel = (d: Date) => { const m = Math.floor((now.getTime() - new Date(d).getTime()) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; };
    const activities = batches.slice(0, 20).map(b => ({ id: b.id, product: b.product_name, batch: b.batch_number, line: b.location ?? '-', qty: Number(b.quantity ?? 0), progress: stageProgress[b.status] ?? 0, stage: b.status, updated: rel(b.updated_at) }));

    res.json({ generatedAt: new Date().toISOString(), range, kpis, output, quality, performance, resources, activities, inCheck: inCheck.length });
  } catch (err) {
    console.error('[Production/Analytics/Overview]', err);
    res.status(500).json({ error: 'Failed to fetch analytics', code: 'DB_ERROR' });
  }
});

router.get('/analytics/details/:metric', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const metric = req.params.metric;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const pg = <T,>(arr: T[]) => arr.slice((page - 1) * pageSize, page * pageSize);
  try {
    const batchStatus: Record<string, string[]> = {
      'total-produced': ['passed'], 'units-today': ['pending', 'in_process', 'quality_check', 'passed', 'rework'],
      'quality-rate': ['passed', 'rework'], 'performance': ['pending', 'quality_check', 'passed'],
    };
    if (batchStatus[metric]) {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT b.id, b.batch_number, r.product_name AS product_name, b.quantity, b.status, b.updated_at, r.location
        FROM inventory_production_batches b LEFT JOIN inventory_production_requests r ON r.id = b.request_id
        WHERE b.farm_id = ${farmId}::uuid ORDER BY b.updated_at DESC`;
      const filtered = rows.filter(r => batchStatus[metric].includes(r.status)).map(r => ({ id: r.id, batch: r.batch_number, product: r.product_name, line: r.location ?? '-', quantity: Number(r.quantity ?? 0), status: r.status }));
      return res.json({ total: filtered.length, items: pg(filtered) });
    }
    if (metric === 'declined') {
      const rows = await prisma.$queryRaw<any[]>`SELECT id, product_name, quantity, location, status, created_at FROM inventory_production_requests WHERE farm_id = ${farmId}::uuid AND status = 'cancelled' ORDER BY created_at DESC`;
      return res.json({ total: rows.length, items: pg(rows.map(r => ({ id: r.id, product: r.product_name, quantity: Number(r.quantity ?? 0), location: r.location ?? '-', status: r.status, date: r.created_at }))) });
    }
    if (metric === 'resources') {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT si.name, st.quantity, st.transacted_at AS created_at, st.notes FROM stock_transactions st JOIN stock_items si ON si.id = st.stock_item_id
        WHERE si.farm_id = ${farmId}::uuid AND st.source_module = 'production' AND st.transaction_type = 'usage' ORDER BY st.transacted_at DESC`;
      return res.json({ total: rows.length, items: pg(rows.map((r, i) => ({ id: i, name: r.name, quantity: Number(r.quantity ?? 0), notes: r.notes ?? '-', date: r.created_at }))) });
    }
    res.status(400).json({ error: 'Unknown metric', code: 'VALIDATION_ERROR' });
  } catch (err) {
    console.error('[Production/Analytics/Details]', err);
    res.status(500).json({ error: 'Failed to fetch details', code: 'DB_ERROR' });
  }
});

export default router;
