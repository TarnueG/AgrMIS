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
  assetType: z.string().min(1),
  model: z.string().optional(),
  notes: z.string().optional(),
});

const addToInventorySchema = z.object({
  license: z.string().min(1),
});

router.get('/', async (req, res) => {
  try {
    const requests = await (prisma as any).equipment_requests.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { created_at: 'desc' },
    });
    res.json(requests);
  } catch {
    res.status(500).json({ error: 'Failed to fetch equipment requests', code: 'DB_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const request = await (prisma as any).equipment_requests.create({
      data: {
        farm_id: req.user!.farmId,
        name: d.name,
        asset_type: d.assetType,
        model: d.model ?? null,
        notes: d.notes ?? null,
        status: 'pending',
      },
    });
    res.status(201).json(request);
  } catch {
    res.status(500).json({ error: 'Failed to create equipment request', code: 'DB_ERROR' });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'approved', 'disapproved', 'delivered'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' });
  try {
    const request = await (prisma as any).equipment_requests.update({
      where: { id: req.params.id },
      data: { status, updated_at: new Date() },
    });
    res.json(request);
  } catch {
    res.status(500).json({ error: 'Failed to update request status', code: 'DB_ERROR' });
  }
});

router.patch('/:id/add-to-inventory', async (req, res) => {
  const parsed = addToInventorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  try {
    const request = await (prisma as any).equipment_requests.findUnique({ where: { id: req.params.id } });
    if (!request || request.status !== 'delivered') {
      return res.status(400).json({ error: 'Request must be delivered before adding to inventory', code: 'VALIDATION_ERROR' });
    }
    const asset = await prisma.assets.create({
      data: {
        farm_id: req.user!.farmId,
        name: request.name,
        asset_type: request.asset_type,
        model: request.model,
        serial_number: parsed.data.license,
        status: 'active',
        notes: request.notes,
      },
    });
    await (prisma as any).equipment_requests.update({
      where: { id: req.params.id },
      data: { license: parsed.data.license, added_to_inventory: true, updated_at: new Date() },
    });
    res.json(asset);
  } catch {
    res.status(500).json({ error: 'Failed to add to inventory', code: 'DB_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const request = await (prisma as any).equipment_requests.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be deleted', code: 'IMMUTABLE' });
    await (prisma as any).equipment_requests.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete request', code: 'DB_ERROR' });
  }
});

export default router;
