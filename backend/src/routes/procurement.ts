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
  contactPerson: z.string().optional(),
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
        contact_person: d.contactPerson ?? null,
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

const showcaseProcurementSchema = z.object({
  item_name: z.string().min(1),
  category: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  inventory_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  supplier: z.string().optional().nullable(),
  quantity: z.number().positive(),
  unit_price: z.number().min(0),
  expected_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const showcaseProcurementUpdateSchema = z.object({
  item_name: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  supplier: z.string().optional().nullable(),
  quantity: z.number().positive().optional(),
  unit_price: z.number().min(0).optional(),
  expected_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  rejection_reason: z.string().optional().nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'ordered', 'partially_received', 'received']).optional(),
});

router.get('/showcase', async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT *
      FROM public.procurement
      ORDER BY created_at DESC
    `;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch showcase procurement', code: 'DB_ERROR' });
  }
});

router.post('/showcase', async (req, res) => {
  const parsed = showcaseProcurementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const d = parsed.data;
  try {
    const totalCost = d.quantity * d.unit_price;
    const requestNumber = `PR-${Date.now()}`;
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO public.procurement (
         request_number, item_name, category, unit, inventory_id, supplier_id, supplier, quantity, unit_price, total_cost,
         status, expected_date, notes, received_quantity
       )
       VALUES ($1, $2, $3, $4, $5::uuid, $6::uuid, $7, $8, $9, $10, 'pending', $11, $12, 0)
       RETURNING *`,
      requestNumber,
      d.item_name,
      d.category ?? 'supplies',
      d.unit ?? null,
      d.inventory_id ?? null,
      d.supplier_id ?? null,
      d.supplier ?? null,
      d.quantity,
      d.unit_price,
      totalCost,
      d.expected_date ? new Date(d.expected_date) : null,
      d.notes ?? null,
    );
    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create showcase procurement record', code: 'DB_ERROR' });
  }
});

router.patch('/showcase/:id', async (req, res) => {
  if (req.body?.status && ['approved', 'rejected', 'ordered', 'partially_received', 'received'].includes(req.body.status)) {
    const permissionCheck = requirePermission('procurement', 'approve');
    let blocked = false;
    await permissionCheck(req, res, () => undefined);
    if (res.headersSent) {
      blocked = true;
    }
    if (blocked) {
      return;
    }
  }

  const parsed = showcaseProcurementUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const d = parsed.data;
  try {
    const existingRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM public.procurement WHERE id = $1::uuid LIMIT 1`,
      req.params.id,
    );
    if (!existingRows.length) {
      return res.status(404).json({ error: 'Procurement record not found', code: 'NOT_FOUND' });
    }

    const existing = existingRows[0];
    const nextQuantity = d.quantity ?? Number(existing.quantity || 0);
    const nextUnitPrice = d.unit_price ?? Number(existing.unit_price || 0);
    const nextStatus = d.status ?? existing.status;
    const poNumber =
      (nextStatus === 'approved' || nextStatus === 'ordered' || nextStatus === 'partially_received' || nextStatus === 'received')
        ? (existing.po_number || `PO-${Date.now()}`)
        : existing.po_number;
    const approvedAt =
      (nextStatus === 'approved' || nextStatus === 'ordered' || nextStatus === 'partially_received' || nextStatus === 'received')
        ? (existing.approved_at || new Date())
        : existing.approved_at;

    const updatedRows = await prisma.$queryRawUnsafe<any[]>(
      `UPDATE public.procurement
       SET item_name = COALESCE($2, item_name),
           category = COALESCE($3, category),
           unit = COALESCE($4, unit),
           supplier_id = COALESCE($5::uuid, supplier_id),
           supplier = COALESCE($6, supplier),
           quantity = $7,
           unit_price = $8,
           total_cost = $9,
           expected_date = $10,
           notes = COALESCE($11, notes),
           rejection_reason = $12,
           status = $13,
           po_number = $14,
           approved_at = $15,
           updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING *`,
      req.params.id,
      d.item_name ?? null,
      d.category ?? null,
      d.unit ?? null,
      d.supplier_id ?? null,
      d.supplier ?? null,
      nextQuantity,
      nextUnitPrice,
      nextQuantity * nextUnitPrice,
      d.expected_date !== undefined ? (d.expected_date ? new Date(d.expected_date) : null) : existing.expected_date,
      d.notes ?? null,
      d.rejection_reason ?? existing.rejection_reason ?? null,
      nextStatus,
      poNumber ?? null,
      approvedAt ?? null,
    );

    res.json(updatedRows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update procurement record', code: 'DB_ERROR' });
  }
});

router.post('/showcase/:id/receive', async (req, res) => {
  const permissionCheck = requirePermission('procurement', 'approve');
  let blocked = false;
  await permissionCheck(req, res, () => undefined);
  if (res.headersSent) {
    blocked = true;
  }
  if (blocked) {
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM public.procurement WHERE id = $1::uuid LIMIT 1`,
        req.params.id,
      );

      if (!rows.length) {
        throw Object.assign(new Error('Procurement record not found'), { code: 'NOT_FOUND' });
      }

      const row = rows[0];
      if (row.status === 'rejected') {
        throw Object.assign(new Error('Rejected procurement cannot be received'), { code: 'INVALID_STATUS' });
      }
      if (row.status === 'received') {
        throw Object.assign(new Error('Procurement already received'), { code: 'ALREADY_RECEIVED' });
      }

      const requestedQuantity = Number(row.quantity || 0);
      const alreadyReceived = Number(row.received_quantity || 0);
      const requestedReceiptQuantity = Number(req.body?.received_quantity ?? 0);
      const receiptQuantity = requestedReceiptQuantity > 0 ? requestedReceiptQuantity : requestedQuantity - alreadyReceived;
      if (receiptQuantity <= 0) {
        throw Object.assign(new Error('Receipt quantity must be greater than zero'), { code: 'INVALID_QTY' });
      }
      if (alreadyReceived + receiptQuantity > requestedQuantity) {
        throw Object.assign(new Error('Receipt quantity exceeds outstanding quantity'), { code: 'INVALID_QTY' });
      }

      let inventoryRows = row.inventory_id
        ? await tx.$queryRawUnsafe<any[]>(`SELECT * FROM public.inventory WHERE id = $1::uuid LIMIT 1`, row.inventory_id)
        : [];

      if (!inventoryRows.length) {
        inventoryRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM public.inventory WHERE LOWER(item_name) = LOWER($1) LIMIT 1`,
          row.item_name,
        );
      }

      let inventoryItem = inventoryRows[0];

      if (!inventoryItem) {
        const created = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO public.inventory (
             item_name, category, quantity, unit_cost, supplier_id, notes
           )
           VALUES ($1, 'supplies', 0, $2, $3::uuid, 'Created automatically from procurement receipt.')
           RETURNING *`,
          row.item_name,
          Number(row.unit_price || 0),
          row.supplier_id ?? null,
        );
        inventoryItem = created[0];
      }

      const nextQuantity = Number(inventoryItem.quantity || 0) + receiptQuantity;
      const nextReceivedQuantity = alreadyReceived + receiptQuantity;
      const nextStatus = nextReceivedQuantity >= requestedQuantity ? 'received' : 'partially_received';

      await tx.$executeRawUnsafe(
        `UPDATE public.inventory
         SET quantity = $2,
             unit_cost = $3,
             supplier_id = COALESCE($4::uuid, supplier_id),
             updated_at = NOW()
         WHERE id = $1::uuid`,
        inventoryItem.id,
        nextQuantity,
        Number(row.unit_price || inventoryItem.unit_cost || 0),
        row.supplier_id ?? null,
      );

      const receivedAt = new Date();

      await tx.$executeRawUnsafe(
        `INSERT INTO public.inventory_movements (
           inventory_id, movement_type, quantity, unit_cost, source_module, reference_id, movement_date, notes
         )
         VALUES ($1::uuid, 'received', $2, $3, 'procurement', $4::uuid, $5, $6)`,
        inventoryItem.id,
        receiptQuantity,
        Number(row.unit_price || 0),
        row.id,
        receivedAt,
        `Procurement receipt for ${row.item_name}`,
      );

      const updatedRows = await tx.$queryRawUnsafe<any[]>(
        `UPDATE public.procurement
         SET status = $2,
             received_quantity = $3,
             po_number = COALESCE(po_number, $4),
             approved_at = COALESCE(approved_at, NOW()),
             received_at = $5,
             inventory_id = $6::uuid,
             updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING *`,
        row.id,
        nextStatus,
        nextReceivedQuantity,
        row.po_number ?? `PO-${Date.now()}`,
        receivedAt,
        inventoryItem.id,
      );

      return updatedRows[0];
    });

    res.json(result);
  } catch (error: any) {
    if (error?.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Procurement record not found', code: 'NOT_FOUND' });
    }
    if (error?.code === 'ALREADY_RECEIVED') {
      return res.status(400).json({ error: 'This procurement record has already been received.', code: 'ALREADY_RECEIVED' });
    }
    if (error?.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: 'This procurement record cannot be received in its current status.', code: 'INVALID_STATUS' });
    }
    if (error?.code === 'INVALID_QTY') {
      return res.status(400).json({ error: 'Receipt quantity is invalid for this procurement record.', code: 'INVALID_QTY' });
    }
    res.status(500).json({ error: 'Failed to receive showcase procurement', code: 'DB_ERROR' });
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
