import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);

const requestSchema = z.object({
  name: z.string().min(1),
  sizeHectares: z.number().optional(),
  soilType: z.string().optional(),
  description: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
});

router.get('/', async (req, res) => {
  try {
    const requests = await (prisma as any).parcel_requests.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { created_at: 'desc' },
    });
    res.json(requests);
  } catch {
    res.status(500).json({ error: 'Failed to fetch parcel requests', code: 'DB_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const request = await (prisma as any).parcel_requests.create({
      data: {
        farm_id: req.user!.farmId,
        name: d.name,
        size_hectares: d.sizeHectares ?? null,
        soil_type: d.soilType ?? null,
        description: d.description ?? null,
        location: d.location ?? null,
        status: 'pending',
      },
    });
    res.status(201).json(request);
  } catch {
    res.status(500).json({ error: 'Failed to create parcel request', code: 'DB_ERROR' });
  }
});

// Edit a pending request
router.patch('/:id', async (req, res) => {
  const parsed = requestSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const existing = await (prisma as any).parcel_requests.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    if (existing.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be edited', code: 'IMMUTABLE' });
    const updated = await (prisma as any).parcel_requests.update({
      where: { id: req.params.id },
      data: {
        ...(d.name && { name: d.name }),
        ...(d.soilType !== undefined && { soil_type: d.soilType }),
        ...(d.sizeHectares !== undefined && { size_hectares: d.sizeHectares }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.location !== undefined && { location: d.location }),
        updated_at: new Date(),
      },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update request', code: 'DB_ERROR' });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'approved', 'disapproved'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' });
  try {
    const request = await (prisma as any).parcel_requests.update({
      where: { id: req.params.id },
      data: { status, updated_at: new Date() },
    });
    if (status === 'approved') {
      await (prisma as any).land_parcels.create({
        data: {
          farm_id: req.user!.farmId,
          name: request.name,
          size_hectares: request.size_hectares ?? 0,
          soil_type: request.soil_type ?? 'loamy',
          notes: request.description,
          status: 'inactive',
        },
      }).catch(() => null);
    }
    res.json(request);
  } catch {
    res.status(500).json({ error: 'Failed to update request status', code: 'DB_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const request = await (prisma as any).parcel_requests.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be deleted', code: 'IMMUTABLE' });
    await (prisma as any).parcel_requests.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete request', code: 'DB_ERROR' });
  }
});

export default router;
