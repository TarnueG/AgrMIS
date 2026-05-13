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
  return requirePermission('procurement', action)(req, res, next);
});

function mapPO(po: any) {
  return {
    id: po.id,
    created_at: po.created_at,
    supplier_id: po.supplier_id,
    po_number: po.po_number,
    order_date: po.order_date,
    expected_delivery: po.expected_delivery ?? null,
    status: po.status,
    payment_status: po.payment_status,
    total_amount: po.total_amount,
    commodity: po.commodity ?? null,
    quantity: po.quantity ?? null,
    notes: po.notes ?? '',
    suppliers: po.suppliers ? { name: po.suppliers.name } : null,
  };
}

// ── Suppliers ────────────────────────────────────────────────────

const supplierSchema = z.object({
  name: z.string().min(1),
  supplierType: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  country: z.string().optional(),
  paymentMethod: z.enum(['bank', 'mobile_money']).optional(),
  accountNumber: z.string().optional(),
  commodity: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/suppliers', async (req, res) => {
  const { search } = req.query as Record<string, string>;
  try {
    const suppliers = await prisma.suppliers.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        deleted_at: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { contact_person: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
    });
    res.json(suppliers);
  } catch {
    res.status(500).json({ error: 'Failed to fetch suppliers', code: 'DB_ERROR' });
  }
});

router.post('/suppliers', async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const supplier = await prisma.suppliers.create({
      data: {
        farm_id: req.user!.farmId,
        name: d.name,
        supplier_type: d.supplierType,
        phone: d.phone,
        email: d.email || undefined,
        address: d.address,
        country: d.country,
        payment_method: d.paymentMethod ?? null,
        account_number: d.accountNumber ?? null,
        commodity: d.commodity ?? null,
        notes: d.notes,
      } as any,
    });
    res.status(201).json(supplier);
  } catch {
    res.status(500).json({ error: 'Failed to create supplier', code: 'DB_ERROR' });
  }
});

router.delete('/suppliers/:id', async (req, res) => {
  try {
    await prisma.suppliers.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete supplier', code: 'DB_ERROR' });
  }
});

// ── Purchase Orders ───────────────────────────────────────────────

const poSchema = z.object({
  supplierId: z.string().uuid(),
  totalAmount: z.number().min(0).default(0),
  expectedDelivery: z.string().optional(),
  commodity: z.string().optional(),
  quantity: z.number().positive().optional(),
  notes: z.string().optional(),
});

router.get('/purchase-orders', async (req, res) => {
  const { status } = req.query as Record<string, string>;
  try {
    const pos = await prisma.purchase_orders.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        status: status ? { not: 'cancelled' } : { not: 'cancelled' },
        ...(status && status !== 'all' && { status }),
      },
      include: { suppliers: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(pos.map(mapPO));
  } catch {
    res.status(500).json({ error: 'Failed to fetch purchase orders', code: 'DB_ERROR' });
  }
});

router.post('/purchase-orders', async (req, res) => {
  const parsed = poSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const poNumber = `PO-${Date.now()}`;
    const po = await prisma.purchase_orders.create({
      data: {
        farm_id: req.user!.farmId,
        supplier_id: d.supplierId,
        created_by: req.user!.userId,
        po_number: poNumber,
        total_amount: d.totalAmount,
        expected_delivery: d.expectedDelivery ? new Date(d.expectedDelivery) : undefined,
        commodity: d.commodity ?? null,
        quantity: d.quantity ?? null,
        notes: d.notes,
      } as any,
      include: { suppliers: { select: { name: true } } },
    });
    res.status(201).json(mapPO(po));
  } catch {
    res.status(500).json({ error: 'Failed to create purchase order', code: 'DB_ERROR' });
  }
});

router.patch('/purchase-orders/:id', async (req, res) => {
  const { status, notes, expectedDelivery } = req.body;
  const allowed = ['draft', 'submitted', 'approved', 'received', 'partially_received', 'cancelled'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' });
  }
  try {
    const po = await prisma.purchase_orders.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(expectedDelivery && { expected_delivery: new Date(expectedDelivery) }),
      },
      include: { suppliers: { select: { name: true } } },
    });
    res.json(mapPO(po));
  } catch {
    res.status(500).json({ error: 'Failed to update purchase order', code: 'DB_ERROR' });
  }
});

router.delete('/purchase-orders/:id', async (req, res) => {
  try {
    await prisma.purchase_orders.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete purchase order', code: 'DB_ERROR' });
  }
});

// ── Department Requests (cross-module inbox) ──────────────────────

router.get('/department-requests', async (req, res) => {
  try {
    const [equipReqs, parcelReqs] = await Promise.all([
      (prisma as any).equipment_requests.findMany({
        where: { farm_id: req.user!.farmId ?? undefined },
        orderBy: { created_at: 'desc' },
      }),
      (prisma as any).parcel_requests.findMany({
        where: { farm_id: req.user!.farmId ?? undefined },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    const combined = [
      ...equipReqs.map((r: any) => ({ ...r, department: 'Machinery', item_type: 'equipment' })),
      ...parcelReqs.map((r: any) => ({ ...r, department: 'Land Parcels', item_type: 'parcel', name: r.name })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(combined);
  } catch {
    res.status(500).json({ error: 'Failed to fetch department requests', code: 'DB_ERROR' });
  }
});

router.patch('/department-requests/:id/accept', async (req, res) => {
  const { itemType } = req.body;
  try {
    if (itemType === 'equipment') {
      const updated = await (prisma as any).equipment_requests.update({
        where: { id: req.params.id },
        data: { status: 'approved', updated_at: new Date() },
      });
      return res.json(updated);
    } else if (itemType === 'parcel') {
      const updated = await (prisma as any).parcel_requests.update({
        where: { id: req.params.id },
        data: { status: 'approved', updated_at: new Date() },
      });
      await (prisma as any).land_parcels.create({
        data: {
          farm_id: req.user!.farmId,
          name: updated.name,
          size_hectares: updated.size_hectares ?? 0,
          soil_type: updated.soil_type ?? 'loamy',
          notes: updated.description,
          status: 'fallow',
        },
      }).catch(() => null);
      return res.json(updated);
    }
    res.status(400).json({ error: 'Unknown item type', code: 'VALIDATION_ERROR' });
  } catch {
    res.status(500).json({ error: 'Failed to accept request', code: 'DB_ERROR' });
  }
});

router.patch('/department-requests/:id/decline', async (req, res) => {
  const { itemType } = req.body;
  try {
    if (itemType === 'equipment') {
      const updated = await (prisma as any).equipment_requests.update({
        where: { id: req.params.id },
        data: { status: 'disapproved', updated_at: new Date() },
      });
      return res.json(updated);
    } else if (itemType === 'parcel') {
      const updated = await (prisma as any).parcel_requests.update({
        where: { id: req.params.id },
        data: { status: 'disapproved', updated_at: new Date() },
      });
      return res.json(updated);
    }
    res.status(400).json({ error: 'Unknown item type', code: 'VALIDATION_ERROR' });
  } catch {
    res.status(500).json({ error: 'Failed to decline request', code: 'DB_ERROR' });
  }
});

export default router;
