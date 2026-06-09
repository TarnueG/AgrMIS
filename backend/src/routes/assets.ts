import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'view' as const : req.method === 'POST' ? 'create' as const : req.method === 'DELETE' ? 'delete' as const : 'edit' as const;
  return requirePermission('machinery', action)(req, res, next);
});

const createAssetSchema = z.object({
  name: z.string().min(1),
  assetType: z.enum(['equipment', 'vehicle', 'tool', 'infrastructure', 'other']),
  category: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.number().positive().optional(),
  location: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
  status: z.enum(['operational', 'active', 'under_maintenance', 'decommissioned', 'retired', 'lost', 'sold']).default('operational'),
  nextServiceDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateAssetSchema = createAssetSchema.partial();

router.get('/', async (req, res) => {
  try {
    const assets = await prisma.assets.findMany({
      where: { farm_id: req.user!.farmId ?? undefined, deleted_at: null },
      include: {
        employees: { select: { id: true, full_name: true } },
        asset_maintenance_logs: {
          orderBy: { maintenance_date: 'desc' },
          take: 1,
          select: { maintenance_date: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(
      assets.map(a => ({
        ...a,
        last_maintenance: a.asset_maintenance_logs[0]?.maintenance_date ?? null,
        asset_maintenance_logs: undefined,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to fetch assets', code: 'DB_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const parsed = createAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  try {
    const asset = await prisma.assets.create({
      data: {
        name: d.name,
        asset_type: d.assetType,
        category: d.category ?? null,
        manufacturer: d.manufacturer ?? null,
        model: d.model ?? null,
        serial_number: d.serialNumber ?? null,
        purchase_date: d.purchaseDate ? new Date(d.purchaseDate) : null,
        purchase_cost: d.purchaseCost ?? null,
        location: d.location ?? null,
        assigned_to: d.assignedTo ?? null,
        status: d.status,
        next_service_date: d.nextServiceDate ? new Date(d.nextServiceDate) : null,
        notes: d.notes ?? null,
        farm_id: req.user!.farmId,
      },
    });
    res.status(201).json(asset);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Serial number already exists', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to create asset', code: 'DB_ERROR' });
  }
});

router.patch('/:id', async (req, res) => {
  const parsed = updateAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  try {
    const asset = await prisma.assets.update({
      where: { id: req.params.id, deleted_at: null },
      data: {
        ...(d.name && { name: d.name }),
        ...(d.assetType && { asset_type: d.assetType }),
        ...(d.status && { status: d.status }),
        ...(d.serialNumber !== undefined && { serial_number: d.serialNumber }),
        ...(d.location !== undefined && { location: d.location }),
        ...(d.assignedTo !== undefined && { assigned_to: d.assignedTo }),
        ...(d.nextServiceDate !== undefined && { next_service_date: d.nextServiceDate ? new Date(d.nextServiceDate) : null }),
        ...(d.notes !== undefined && { notes: d.notes }),
        updated_at: new Date(),
      },
    });
    res.json(asset);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update asset', code: 'DB_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.assets.update({
      where: { id: req.params.id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    res.status(204).end();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete asset', code: 'DB_ERROR' });
  }
});

// ── Maintenance Logs ────────────────────────────────────────────

const maintenanceSchema = z.object({
  maintenanceType: z.enum(['scheduled', 'corrective', 'emergency', 'inspection']),
  description: z.string().min(1),
  cost: z.number().positive().optional(),
  serviceProvider: z.string().optional(),
  maintenanceDate: z.string().optional(),
  nextServiceDate: z.string().optional(),
  downtimeHours: z.number().min(0).optional(),
  outcome: z.string().optional(),
});

router.get('/:id/maintenance', async (req, res) => {
  try {
    const logs = await prisma.asset_maintenance_logs.findMany({
      where: { asset_id: req.params.id },
      include: { users: { select: { full_name: true } } },
      orderBy: { maintenance_date: 'desc' },
    });
    res.json(logs);
  } catch {
    res.status(500).json({ error: 'Failed to fetch maintenance logs', code: 'DB_ERROR' });
  }
});

router.post('/:id/maintenance', async (req, res) => {
  const parsed = maintenanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  const today = new Date().toISOString().split('T')[0];
  try {
    const [log] = await prisma.$transaction([
      prisma.asset_maintenance_logs.create({
        data: {
          asset_id: req.params.id,
          performed_by: req.user!.userId,
          maintenance_type: d.maintenanceType,
          description: d.description,
          cost: d.cost ?? null,
          service_provider: d.serviceProvider ?? null,
          maintenance_date: d.maintenanceDate ? new Date(d.maintenanceDate) : new Date(today),
          next_service_date: d.nextServiceDate ? new Date(d.nextServiceDate) : null,
          downtime_hours: d.downtimeHours ?? null,
          outcome: d.outcome ?? null,
        },
      }),
      prisma.assets.update({
        where: { id: req.params.id },
        data: {
          ...(d.nextServiceDate && { next_service_date: new Date(d.nextServiceDate) }),
          updated_at: new Date(),
        },
      }),
    ]);
    res.status(201).json(log);
  } catch {
    res.status(500).json({ error: 'Failed to log maintenance', code: 'DB_ERROR' });
  }
});

// ─── Asset Management Analytics ──────────────────────────────────────────────

const condOf = (status: string) => {
  if (status === 'under_maintenance') return 40;
  if (status === 'lost' || status === 'decommissioned' || status === 'retired') return 10;
  if (status === 'operational') return 95;
  return 75;
};
const condOfParcel = (status?: string | null) => {
  if (status === 'active') return 90;
  if (status === 'preparation') return 70;
  if (status === 'fallow') return 50;
  return 40;
};
// Completed two-quarter (6-month) periods since a date: floor(monthsSincePurchase / 6).
function monthsSince(d: Date | string): number {
  const a = new Date(d);
  const now = new Date();
  let m = (now.getFullYear() - a.getFullYear()) * 12 + (now.getMonth() - a.getMonth());
  if (now.getDate() < a.getDate()) m -= 1; // not a full month yet
  return Math.max(0, m);
}
const twoQuarterPeriods = (d?: Date | string | null) => d ? Math.floor(monthsSince(d) / 6) : 0;
// Machinery depreciates 5% per two-quarter period (floored at 0); parcels appreciate 5%.
const machineValue = (a: any) => {
  const base = Number(a.purchase_cost ?? a.current_value ?? 0);
  return Math.max(0, base * (1 - 0.05 * twoQuarterPeriods(a.purchase_date ?? a.created_at)));
};
const parcelValue = (p: any) => {
  const base = Number(p.purchase_cost ?? 0);
  return base * (1 + 0.05 * twoQuarterPeriods(p.created_at));
};
const assetVal = machineValue;

router.get('/analytics/overview', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const [assets, parcels, crops, usage, maint, taskEquip] = await Promise.all([
      prisma.assets.findMany({ where: { farm_id: farmId, deleted_at: null }, include: { asset_maintenance_logs: { orderBy: { maintenance_date: 'desc' }, take: 1, select: { maintenance_date: true } } } }),
      prisma.land_parcels.findMany({ where: { farm_id: farmId, deleted_at: null } }),
      (prisma as any).crop_production_records.findMany({ where: { farm_id: farmId } }),
      prisma.asset_usage_logs.findMany({ select: { asset_id: true, hours_used: true } }),
      prisma.asset_maintenance_logs.findMany({ select: { asset_id: true, maintenance_type: true, maintenance_date: true, downtime_hours: true } }),
      // Task assignments per equipment (from the task↔equipment junction).
      prisma.$queryRaw<any[]>`SELECT fte.asset_id AS equipment_id, COUNT(*)::int AS tasks FROM farm_task_equipment fte JOIN farm_tasks t ON t.id = fte.task_id WHERE t.farm_id = ${farmId ?? null}::uuid AND t.status <> 'cancelled' GROUP BY fte.asset_id`,
    ]);
    const taskCountBy: Record<string, number> = {};
    for (const t of taskEquip) taskCountBy[t.equipment_id] = Number(t.tasks);

    const totalArea = parcels.reduce((s, p) => s + Number(p.size_hectares ?? 0), 0);
    // Total asset value = depreciating machinery + appreciating parcels (spec 2.3).
    const totalValue = assets.reduce((s, a) => s + machineValue(a), 0) + parcels.reduce((s, p) => s + parcelValue(p), 0);
    const unscheduled = maint.filter(m => m.maintenance_type === 'corrective' || m.maintenance_type === 'emergency').length;
    const repairRate = maint.length ? Math.round((unscheduled / maint.length) * 1000) / 10 : 0;
    const now = new Date();
    const dueThisWeek = assets.filter(a => a.next_service_date && new Date(a.next_service_date) <= new Date(now.getTime() + 7 * 86400000) && new Date(a.next_service_date) >= now).length;

    // KPI trends — month over month by created_at where available
    const mo = (d?: Date | null) => d ? new Date(d).getTime() : 0;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const trendCount = (rows: any[], field = 'created_at') => {
      const cur = rows.filter(r => mo(r[field]) >= monthStart).length;
      const prev = rows.filter(r => mo(r[field]) >= prevStart && mo(r[field]) < monthStart).length;
      return prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);
    };

    // Soil distribution
    const soil: Record<string, number> = {};
    for (const p of parcels) { const k = (p.soil_type ?? 'unknown'); soil[k] = (soil[k] || 0) + Number(p.size_hectares ?? 0); }
    const soilTotal = Object.values(soil).reduce((s, v) => s + v, 0);
    const soilDistribution = Object.entries(soil).sort((a, b) => b[1] - a[1]).map(([label, ha]) => ({ label, hectares: Math.round(ha * 100) / 100, pct: soilTotal > 0 ? Math.round((ha / soilTotal) * 100) : 0 }));

    // Largest crops — crops planted on ACTIVE parcels only, ranked by parcel size (spec 2.4).
    const largestCrops = parcels
      .filter(p => p.status === 'active' && p.crop_type)
      .sort((a, b) => Number(b.size_hectares ?? 0) - Number(a.size_hectares ?? 0))
      .slice(0, 6)
      .map(p => ({ crop: p.crop_type as string, hectares: Math.round(Number(p.size_hectares ?? 0) * 100) / 100, parcel: p.name }));

    // Most used equipment — ranked by number of tasks/assignments (spec 2.5).
    const usageBy: Record<string, number> = {};
    for (const u of usage) usageBy[u.asset_id] = (usageBy[u.asset_id] || 0) + Number(u.hours_used ?? 0);
    const mostUsedEquipment = assets.map(a => ({ id: a.id, name: a.name, type: a.asset_type, tasks: taskCountBy[a.id] || 0 }))
      .filter(e => e.tasks > 0).sort((a, b) => b.tasks - a.tasks).slice(0, 6);

    // Most used parcel (spotlight) — largest active parcel as the focus
    const spotlightP = [...parcels].sort((a, b) => Number(b.size_hectares ?? 0) - Number(a.size_hectares ?? 0))[0];
    const totalMachineHours = Object.values(usageBy).reduce((s, v) => s + v, 0);
    const mostUsedParcel = spotlightP ? {
      name: spotlightP.name, soil: spotlightP.soil_type ?? '-', area: Number(spotlightP.size_hectares ?? 0),
      crop: spotlightP.crop_type ?? '—', location: spotlightP.location ?? '-',
      machineHours: Math.round(totalMachineHours * 10) / 10, operations: maint.length,
      utilization: totalArea > 0 ? Math.min(100, Math.round((Number(spotlightP.size_hectares ?? 0) / totalArea) * 100)) : 0,
    } : null;

    // Maintenance breakdown
    const scheduled = maint.filter(m => m.maintenance_type === 'scheduled' || m.maintenance_type === 'inspection').length;
    const avgDowntime = maint.length ? Math.round((maint.reduce((s, m) => s + Number(m.downtime_hours ?? 0), 0) / maint.length) * 10) / 10 : 0;
    const maintenance = { repairRate, scheduled, unscheduled, workOrders: maint.length, avgDowntime, dueThisWeek };

    // Assets table
    const assetsTable = [...assets].sort((a, b) => assetVal(b) - assetVal(a)).slice(0, 8).map(a => ({
      id: a.id, name: a.name, type: a.asset_type, location: a.location ?? '-', condition: condOf(a.status),
      lastService: a.asset_maintenance_logs[0]?.maintenance_date ?? null, value: Math.round(assetVal(a)), status: a.status,
      amount: Math.round(Number(a.purchase_cost ?? a.current_value ?? 0)),
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      kpis: {
        totalArea: Math.round(totalArea * 100) / 100, areaTrend: trendCount(parcels),
        totalEquipment: assets.length, equipmentTrend: trendCount(assets),
        totalValue: Math.round(totalValue), valueTrend: trendCount(assets),
        repairRate, repairTrend: 0,
      },
      soilDistribution, largestCrops, mostUsedEquipment, mostUsedParcel, maintenance, assetsTable,
    });
  } catch (err) {
    console.error('[Assets/Analytics/Overview]', err);
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
    if (metric === 'total-asset-value') {
      // Combined list of both asset types (spec 2.3): Asset Name | Type | Condition | Value | Status.
      const [assets, parcels] = await Promise.all([
        prisma.assets.findMany({ where: { farm_id: farmId, deleted_at: null } }),
        prisma.land_parcels.findMany({ where: { farm_id: farmId, deleted_at: null } }),
      ]);
      const rows = [
        ...assets.map(a => ({ id: a.id, name: a.name, type: 'machine', condition: condOf(a.status), value: Math.round(machineValue(a)), status: a.status, amount: Math.round(Number(a.purchase_cost ?? a.current_value ?? 0)) })),
        ...parcels.map(p => ({ id: p.id, name: p.name, type: 'parcel', condition: condOfParcel(p.status), value: Math.round(parcelValue(p)), status: p.status ?? '-', amount: Math.round(Number((p as any).purchase_cost ?? 0)) })),
      ].sort((x, y) => y.value - x.value);
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (metric === 'total-equipment' || metric === 'assets') {
      const assets = await prisma.assets.findMany({ where: { farm_id: farmId, deleted_at: null }, include: { asset_maintenance_logs: { orderBy: { maintenance_date: 'desc' }, take: 1, select: { maintenance_date: true } } } });
      const rows = assets.map(a => ({ id: a.id, name: a.name, type: a.asset_type, location: a.location ?? '-', condition: condOf(a.status), lastService: a.asset_maintenance_logs[0]?.maintenance_date ?? null, value: Math.round(machineValue(a)), status: a.status })).sort((x, y) => y.value - x.value);
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (metric === 'total-parcel-area' || metric === 'parcels' || metric === 'soil-distribution' || metric === 'most-used-parcel') {
      const parcels = await prisma.land_parcels.findMany({ where: { farm_id: farmId, deleted_at: null }, orderBy: { size_hectares: 'desc' } });
      const rows = parcels.map(p => ({ id: p.id, name: p.name, soil: p.soil_type ?? '-', area: Number(p.size_hectares ?? 0), crop: p.crop_type ?? '-', location: p.location ?? '-', status: p.status ?? '-' }));
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (metric === 'largest-crops' || metric === 'crops') {
      // Crops on active parcels only, ranked by parcel size (spec 2.4).
      const parcels = await prisma.land_parcels.findMany({ where: { farm_id: farmId, deleted_at: null, status: 'active' } as any, orderBy: { size_hectares: 'desc' } });
      const rows = parcels.filter(p => p.crop_type).map(p => ({ id: p.id, crop: p.crop_type, parcel: p.name, hectares: Math.round(Number(p.size_hectares ?? 0) * 100) / 100, soil: p.soil_type ?? '-', location: p.location ?? '-' }));
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (metric === 'most-used-equipment') {
      const [assets, taskEquip] = await Promise.all([
        prisma.assets.findMany({ where: { farm_id: farmId, deleted_at: null }, select: { id: true, name: true, asset_type: true, status: true } }),
        prisma.$queryRaw<any[]>`SELECT fte.asset_id AS equipment_id, COUNT(*)::int AS tasks FROM farm_task_equipment fte JOIN farm_tasks t ON t.id = fte.task_id WHERE t.farm_id = ${farmId ?? null}::uuid AND t.status <> 'cancelled' GROUP BY fte.asset_id`,
      ]);
      const by: Record<string, number> = {};
      for (const t of taskEquip) by[t.equipment_id] = Number(t.tasks);
      const rows = assets.map(a => ({ id: a.id, name: a.name, type: a.asset_type, status: a.status, tasks: by[a.id] || 0 })).sort((x, y) => y.tasks - x.tasks);
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (metric === 'maintenance' || metric === 'maintenance-repair-rate') {
      const logs = await prisma.asset_maintenance_logs.findMany({ orderBy: { maintenance_date: 'desc' }, include: { assets: { select: { name: true } } } });
      const rows = logs.map(l => ({ id: l.id, asset: (l as any).assets?.name ?? '-', type: l.maintenance_type, cost: Number(l.cost ?? 0), downtime: Number(l.downtime_hours ?? 0), date: l.maintenance_date }));
      return res.json({ total: rows.length, items: pg(rows) });
    }
    res.status(400).json({ error: 'Unknown metric', code: 'VALIDATION_ERROR' });
  } catch (err) {
    console.error('[Assets/Analytics/Details]', err);
    res.status(500).json({ error: 'Failed to fetch details', code: 'DB_ERROR' });
  }
});

export default router;
