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

export default router;
