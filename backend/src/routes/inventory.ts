import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);

// ── Categories & Units ──────────────────────────────────────────

router.get('/categories', async (_req, res) => {
  try {
    const data = await prisma.item_categories.findMany({
      where: { deleted_at: null },
      orderBy: { name: 'asc' },
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to fetch categories', code: 'DB_ERROR' });
  }
});

router.get('/units', async (_req, res) => {
  try {
    const data = await prisma.units_of_measure.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to fetch units', code: 'DB_ERROR' });
  }
});

// ── Stock Items ─────────────────────────────────────────────────

const createItemSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().uuid(),
  unitOfMeasure: z.string().min(1),
  unitOfMeasureId: z.string().uuid().optional(),
  reorderThreshold: z.number().min(0).default(0),
  initialQuantity: z.number().min(0).default(0),
  unitCost: z.number().positive().optional(),
  storageLocation: z.string().optional(),
  description: z.string().optional(),
  sku: z.string().optional(),
});

const updateItemSchema = createItemSchema.partial();

router.get('/items', async (req, res) => {
  try {
    const items = await prisma.stock_items.findMany({
      where: { deleted_at: null, farm_id: req.user!.farmId ?? undefined },
      include: {
        item_categories: { select: { id: true, name: true, type: true } },
        units_of_measure: { select: { id: true, name: true, symbol: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Failed to fetch stock items', code: 'DB_ERROR' });
  }
});

router.post('/items', async (req, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const { name, categoryId, unitOfMeasure, unitOfMeasureId, reorderThreshold, initialQuantity, unitCost, storageLocation, description, sku } = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.stock_items.create({
        data: {
          name,
          category_id: categoryId,
          farm_id: req.user!.farmId,
          unit_of_measure: unitOfMeasure,
          unit_of_measure_id: unitOfMeasureId ?? null,
          reorder_threshold: reorderThreshold,
          current_quantity: initialQuantity,
          unit_cost: unitCost ?? null,
          storage_location: storageLocation ?? null,
          description: description ?? null,
          sku: sku ?? null,
        },
        include: {
          item_categories: { select: { id: true, name: true, type: true } },
          units_of_measure: { select: { id: true, name: true, symbol: true } },
        },
      });
      if (initialQuantity > 0) {
        await tx.stock_transactions.create({
          data: {
            stock_item_id: item.id,
            performed_by: req.user!.userId,
            transaction_type: 'purchase',
            quantity: initialQuantity,
            quantity_before: 0,
            quantity_after: initialQuantity,
            source_module: 'inventory',
            notes: 'Initial stock',
          },
        });
      }
      return item;
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'SKU already exists', code: 'SKU_CONFLICT' });
    res.status(500).json({ error: 'Failed to create stock item', code: 'DB_ERROR' });
  }
});

router.patch('/items/:id', async (req, res) => {
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  try {
    const item = await prisma.stock_items.update({
      where: { id: req.params.id, deleted_at: null },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.categoryId !== undefined && { category_id: d.categoryId }),
        ...(d.unitOfMeasure !== undefined && { unit_of_measure: d.unitOfMeasure }),
        ...(d.unitOfMeasureId !== undefined && { unit_of_measure_id: d.unitOfMeasureId }),
        ...(d.reorderThreshold !== undefined && { reorder_threshold: d.reorderThreshold }),
        ...(d.unitCost !== undefined && { unit_cost: d.unitCost }),
        ...(d.storageLocation !== undefined && { storage_location: d.storageLocation }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.sku !== undefined && { sku: d.sku }),
        updated_at: new Date(),
      },
      include: {
        item_categories: { select: { id: true, name: true, type: true } },
        units_of_measure: { select: { id: true, name: true, symbol: true } },
      },
    });
    res.json(item);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found', code: 'NOT_FOUND' });
    if (err.code === 'P2002') return res.status(400).json({ error: 'SKU already exists', code: 'SKU_CONFLICT' });
    res.status(500).json({ error: 'Failed to update stock item', code: 'DB_ERROR' });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    await prisma.stock_items.update({
      where: { id: req.params.id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    res.status(204).end();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete stock item', code: 'DB_ERROR' });
  }
});

// ── Transactions ────────────────────────────────────────────────

const transactionSchema = z.object({
  transactionType: z.enum(['usage', 'adjustment', 'purchase', 'transfer', 'waste']),
  quantity: z.number().positive(),
  notes: z.string().optional(),
});

router.get('/items/:id/transactions', async (req, res) => {
  try {
    const txns = await prisma.stock_transactions.findMany({
      where: { stock_item_id: req.params.id },
      include: { users: { select: { full_name: true } } },
      orderBy: { transacted_at: 'desc' },
      take: 50,
    });
    res.json(txns);
  } catch {
    res.status(500).json({ error: 'Failed to fetch transactions', code: 'DB_ERROR' });
  }
});

router.post('/items/:id/transactions', async (req, res) => {
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const { transactionType, quantity, notes } = parsed.data;
  try {
    const item = await prisma.stock_items.findUnique({
      where: { id: req.params.id, deleted_at: null },
    });
    if (!item) return res.status(404).json({ error: 'Item not found', code: 'NOT_FOUND' });

    const qtyBefore = Number(item.current_quantity);
    const isDeduction = ['usage', 'waste', 'transfer'].includes(transactionType);
    const qtyAfter = isDeduction ? qtyBefore - quantity : qtyBefore + quantity;

    if (qtyAfter < 0) {
      return res.status(400).json({ error: 'Insufficient stock', code: 'STOCK_LOW' });
    }

    // Atomic: insert transaction + update quantity (trigger fires reorder check)
    const [txn] = await prisma.$transaction([
      prisma.stock_transactions.create({
        data: {
          stock_item_id: req.params.id,
          performed_by: req.user!.userId,
          transaction_type: transactionType,
          quantity,
          quantity_before: qtyBefore,
          quantity_after: qtyAfter,
          source_module: 'inventory',
          notes: notes ?? null,
        },
      }),
      prisma.stock_items.update({
        where: { id: req.params.id },
        data: { current_quantity: qtyAfter, updated_at: new Date() },
      }),
    ]);

    res.status(201).json(txn);
  } catch {
    res.status(500).json({ error: 'Failed to record transaction', code: 'DB_ERROR' });
  }
});

// ── Reorder Alerts ──────────────────────────────────────────────

router.get('/alerts/count', async (req, res) => {
  try {
    const count = await prisma.reorder_alerts.count({
      where: {
        status: 'open',
        stock_items: { farm_id: req.user!.farmId ?? undefined, deleted_at: null },
      },
    });
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Failed to fetch alert count', code: 'DB_ERROR' });
  }
});

router.get('/alerts', async (req, res) => {
  const status = (req.query.status as string) || 'open';
  try {
    const alerts = await prisma.reorder_alerts.findMany({
      where: {
        status,
        stock_items: { farm_id: req.user!.farmId ?? undefined, deleted_at: null },
      },
      include: {
        stock_items: {
          select: { id: true, name: true, unit_of_measure: true, current_quantity: true, reorder_threshold: true },
        },
      },
      orderBy: { triggered_at: 'desc' },
      take: 20,
    });
    res.json(alerts);
  } catch {
    res.status(500).json({ error: 'Failed to fetch alerts', code: 'DB_ERROR' });
  }
});

const alertUpdateSchema = z.object({
  status: z.enum(['acknowledged', 'resolved', 'dismissed']),
  notes: z.string().optional(),
});

router.patch('/alerts/:id', async (req, res) => {
  const parsed = alertUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const { status, notes } = parsed.data;
  const now = new Date();
  try {
    const alert = await prisma.reorder_alerts.update({
      where: { id: req.params.id },
      data: {
        status,
        notes: notes ?? null,
        ...(status === 'acknowledged' && { acknowledged_by: req.user!.userId, acknowledged_at: now }),
        ...(status === 'resolved' && { resolved_at: now }),
      },
    });
    res.json(alert);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Alert not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update alert', code: 'DB_ERROR' });
  }
});

// ── Inventory Production Requests ──────────────────────────────

const prodReqDb = (prisma as any).inventory_production_requests;
const prodBatchDb = (prisma as any).inventory_production_batches;

const createProdReqSchema = z.object({
  product_name: z.string().min(1),
  quantity: z.number().min(0),
  quantity_unit: z.string().optional(),
  location: z.string().optional(),
});

router.get('/prod-requests', async (req, res) => {
  try {
    const rows = await prodReqDb.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { created_at: 'desc' },
    });
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch production requests', code: 'DB_ERROR' });
  }
});

router.post('/prod-requests', async (req, res) => {
  const parsed = createProdReqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const row = await prodReqDb.create({
      data: {
        farm_id: req.user!.farmId,
        product_name: d.product_name,
        quantity: d.quantity,
        quantity_unit: d.quantity_unit ?? 'kg',
        location: d.location ?? null,
        order_type: 'Make-to-Order',
        link_order: 'Make-to-Stock',
        status: 'pending',
      },
    });
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: 'Failed to create production request', code: 'DB_ERROR' });
  }
});

router.patch('/prod-requests/:id', async (req, res) => {
  const { status, quantity } = req.body;
  try {
    const row = await prodReqDb.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(quantity !== undefined && { quantity }),
        updated_at: new Date(),
      },
    });
    res.json(row);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update production request', code: 'DB_ERROR' });
  }
});

router.delete('/prod-requests/:id', async (req, res) => {
  try {
    const existing = await prodReqDb.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    if (existing.status !== 'pending') return res.status(403).json({ error: 'Can only delete pending requests', code: 'FORBIDDEN' });
    await prodReqDb.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete production request', code: 'DB_ERROR' });
  }
});

// ── Inventory Production Batches ────────────────────────────────

const PRODUCT_CATEGORY_MAP: Record<string, string> = {
  'Cocoa Beans': 'crop harvest',
  'Palm Oil': 'crop harvest',
  'Dried Fish': 'fish harvest',
  'Livestock': 'livestock output',
};

router.get('/prod-batches', async (req, res) => {
  const { requestId } = req.query as Record<string, string>;
  try {
    const rows = await prodBatchDb.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        ...(requestId && { request_id: requestId }),
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch batches', code: 'DB_ERROR' });
  }
});

router.post('/prod-batches', async (req, res) => {
  const { requestId, quantity, status } = req.body;
  if (!requestId) return res.status(400).json({ error: 'requestId required', code: 'VALIDATION_ERROR' });
  try {
    const batchNum = `BATCH-${Date.now()}`;
    const batch = await prodBatchDb.create({
      data: {
        farm_id: req.user!.farmId,
        request_id: requestId,
        batch_number: batchNum,
        quantity: quantity ?? null,
        status: status ?? 'pending',
      },
    });
    res.status(201).json(batch);
  } catch {
    res.status(500).json({ error: 'Failed to create batch', code: 'DB_ERROR' });
  }
});

router.patch('/prod-batches/:id', async (req, res) => {
  const { status, quantity } = req.body;
  try {
    const existing = await prodBatchDb.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Batch not found', code: 'NOT_FOUND' });

    const batch = await prodBatchDb.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(quantity !== undefined && { quantity }),
        updated_at: new Date(),
      },
    });

    // When batch passes → add item to stock_items
    if (status === 'passed' && existing.status !== 'passed') {
      const request = await prodReqDb.findUnique({ where: { id: existing.request_id } });
      if (request && request.status !== 'passed') {
        const finalQty = Number(batch.quantity ?? request.quantity ?? 0);
        const catName = PRODUCT_CATEGORY_MAP[request.product_name] ?? 'general supplies';
        let category = await prisma.item_categories.findFirst({
          where: { name: { equals: catName, mode: 'insensitive' }, deleted_at: null },
        });
        if (!category) {
          category = await prisma.item_categories.create({
            data: { name: catName, type: 'product' },
          });
        }
        const stockItem = await prisma.stock_items.create({
          data: {
            name: request.product_name,
            farm_id: request.farm_id,
            category_id: category.id,
            unit_of_measure: request.quantity_unit ?? 'kg',
            current_quantity: finalQty,
            reorder_threshold: 10,
            storage_location: request.location ?? null,
          },
        });
        if (finalQty > 0) {
          await prisma.stock_transactions.create({
            data: {
              stock_item_id: stockItem.id,
              performed_by: req.user!.userId,
              transaction_type: 'purchase',
              quantity: finalQty,
              quantity_before: 0,
              quantity_after: finalQty,
              source_module: 'inventory',
              notes: `Added from production batch ${existing.batch_number}`,
            },
          });
        }
        await prodReqDb.update({
          where: { id: request.id },
          data: { status: 'passed', stock_item_id: stockItem.id, updated_at: new Date() },
        });
      }
    }

    res.json(batch);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Batch not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update batch', code: 'DB_ERROR' });
  }
});

// ── Inventory Procurement Requests ──────────────────────────────

const procReqDb = (prisma as any).inventory_procurement_requests;

const createProcReqSchema = z.object({
  category: z.enum(['pesticides_chemicals', 'fertilizers', 'livestock_feed', 'aquaculture_feed']),
  item_name: z.string().min(1),
  quantity: z.number().min(0),
  quantity_unit: z.string().optional(),
});

router.get('/proc-requests', async (req, res) => {
  try {
    const rows = await procReqDb.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { created_at: 'desc' },
    });
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch procurement requests', code: 'DB_ERROR' });
  }
});

router.post('/proc-requests', async (req, res) => {
  const parsed = createProcReqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const row = await procReqDb.create({
      data: {
        farm_id: req.user!.farmId,
        category: d.category,
        item_name: d.item_name,
        quantity: d.quantity,
        quantity_unit: d.quantity_unit ?? 'liters',
        status: 'pending',
      },
    });
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: 'Failed to create procurement request', code: 'DB_ERROR' });
  }
});

router.patch('/proc-requests/:id', async (req, res) => {
  const { status, manufacture_date, expiration_date } = req.body;
  try {
    const existing = await procReqDb.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });

    const updated = await procReqDb.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(manufacture_date !== undefined && { manufacture_date: manufacture_date ? new Date(manufacture_date) : null }),
        ...(expiration_date !== undefined && { expiration_date: expiration_date ? new Date(expiration_date) : null }),
        updated_at: new Date(),
      },
    });

    // When both dates provided + status received → add to stock_items
    const mfgDate = manufacture_date ?? existing.manufacture_date;
    const expDate = expiration_date ?? existing.expiration_date;
    const newStatus = status ?? existing.status;

    if (mfgDate && expDate && newStatus === 'received' && !existing.in_stock) {
      const CATEGORY_NAME_MAP: Record<string, string> = {
        pesticides_chemicals: 'pesticides & chemicals',
        fertilizers: 'fertilizers',
        livestock_feed: 'livestock feed',
        aquaculture_feed: 'aquaculture feed',
      };
      const catName = CATEGORY_NAME_MAP[existing.category] ?? 'general supplies';
      let category = await prisma.item_categories.findFirst({
        where: { name: { equals: catName, mode: 'insensitive' }, deleted_at: null },
      });
      if (!category) {
        category = await prisma.item_categories.create({
          data: { name: catName, type: 'supply' },
        });
      }
      const stockItem = await prisma.stock_items.create({
        data: {
          name: existing.item_name,
          farm_id: existing.farm_id,
          category_id: category.id,
          unit_of_measure: existing.quantity_unit ?? 'liters',
          current_quantity: Number(existing.quantity),
          reorder_threshold: 10,
        },
      });
      if (Number(existing.quantity) > 0) {
        await prisma.stock_transactions.create({
          data: {
            stock_item_id: stockItem.id,
            performed_by: req.user!.userId,
            transaction_type: 'purchase',
            quantity: Number(existing.quantity),
            quantity_before: 0,
            quantity_after: Number(existing.quantity),
            source_module: 'inventory',
            notes: 'Added from procurement request',
          },
        });
      }
      await procReqDb.update({
        where: { id: req.params.id },
        data: { in_stock: true, stock_item_id: stockItem.id, updated_at: new Date() },
      });
    }

    res.json(updated);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update procurement request', code: 'DB_ERROR' });
  }
});

router.delete('/proc-requests/:id', async (req, res) => {
  try {
    const existing = await procReqDb.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    if (existing.status !== 'pending') return res.status(403).json({ error: 'Can only delete pending requests', code: 'FORBIDDEN' });
    await procReqDb.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete procurement request', code: 'DB_ERROR' });
  }
});

export default router;
