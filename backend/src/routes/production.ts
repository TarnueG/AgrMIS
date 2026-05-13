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

export default router;
