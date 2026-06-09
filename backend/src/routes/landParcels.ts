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
  return requirePermission('land_parcels', action)(req, res, next);
});

const parcelSchema = z.object({
  name: z.string().min(1),
  sizeHectares: z.number().default(0),
  cropType: z.string().optional(),
  soilType: z.string().default('loamy'),
  location: z.string().optional(),
  status: z.string().default('inactive'),
  notes: z.string().optional(),
});

const REVERT_STATUSES = ['inactive', 'preparation', 'fallow'];

router.get('/', async (req, res) => {
  const status = req.query.status as string | undefined;
  try {
    const parcels = await (prisma as any).land_parcels.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        deleted_at: null,
        ...(status ? { status } : {}),
      },
      orderBy: { name: 'asc' },
    });
    res.json(parcels);
  } catch {
    res.status(500).json({ error: 'Failed to fetch land parcels', code: 'DB_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const parsed = parcelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const parcel = await (prisma as any).land_parcels.create({
      data: {
        farm_id: req.user!.farmId,
        name: d.name,
        size_hectares: d.sizeHectares,
        crop_type: d.cropType ?? null,
        soil_type: d.soilType,
        location: d.location ?? null,
        status: d.status,
        notes: d.notes ?? null,
      },
    });
    res.status(201).json(parcel);
  } catch {
    res.status(500).json({ error: 'Failed to create land parcel', code: 'DB_ERROR' });
  }
});

router.post('/assign', async (req, res) => {
  const { parcelId, cropName, status } = req.body;
  if (!parcelId) return res.status(400).json({ error: 'parcelId is required', code: 'VALIDATION_ERROR' });
  if (!cropName && status === 'active') return res.status(400).json({ error: 'cropName is required when activating', code: 'VALIDATION_ERROR' });
  try {
    const parcel = await (prisma as any).land_parcels.update({
      where: { id: parcelId },
      data: { crop_type: cropName || null, status: status || 'active', updated_at: new Date() },
    });
    res.json(parcel);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Parcel not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to assign parcel', code: 'DB_ERROR' });
  }
});

router.patch('/:id', async (req, res) => {
  const parsed = parcelSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const current = await (prisma as any).land_parcels.findUnique({ where: { id: req.params.id } });
    // Harvest rule (spec 2.2): reaching "harvested" reverts the parcel to Inactive and frees the crop.
    const harvested = d.status === 'harvested';
    const effectiveStatus = harvested ? 'inactive' : d.status;
    const isReverted = effectiveStatus && REVERT_STATUSES.includes(effectiveStatus) && current?.status === 'active';
    const parcel = await (prisma as any).land_parcels.update({
      where: { id: req.params.id },
      data: {
        ...(d.name && { name: d.name }),
        ...(d.sizeHectares !== undefined && { size_hectares: d.sizeHectares }),
        ...(d.cropType !== undefined && { crop_type: d.cropType }),
        ...(d.soilType && { soil_type: d.soilType }),
        ...(d.location !== undefined && { location: d.location }),
        ...(effectiveStatus && { status: effectiveStatus }),
        ...(d.notes !== undefined && { notes: d.notes }),
        ...((isReverted || harvested) && { crop_type: null }),
        updated_at: new Date(),
      },
    });
    if (harvested) {
      const { ip, userAgent } = clientInfo(req);
      await logAuditEvent({
        actorUserId: req.user!.userId,
        eventType: 'settings_changed',
        subsystem: 'land_parcels',
        description: `Parcel "${parcel.name}" harvested — reverted to Inactive`,
        metadata: { parcelId: parcel.id, from: current?.status, to: 'inactive' },
        ipAddress: ip,
        userAgent,
      });
    }
    res.json(parcel);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Parcel not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update land parcel', code: 'DB_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await (prisma as any).land_parcels.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete land parcel', code: 'DB_ERROR' });
  }
});

export default router;
