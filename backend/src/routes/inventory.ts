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
  return requirePermission('inventory', action)(req, res, next);
});

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

// POST /inventory/apply — deduct a chemical/feed item from stock as a production application
router.post('/apply', async (req, res) => {
  const schema = z.object({
    stockItemId: z.string().uuid(),
    quantity: z.number().positive(),
    description: z.string().max(400).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const { stockItemId, quantity, description } = parsed.data;
  try {
    const item = await prisma.stock_items.findUnique({
      where: { id: stockItemId, deleted_at: null, farm_id: req.user!.farmId ?? undefined },
    });
    if (!item) return res.status(404).json({ error: 'Item not found', code: 'NOT_FOUND' });
    const qtyBefore = Number(item.current_quantity);
    if (quantity >= qtyBefore) {
      return res.status(400).json({ error: 'Quantity must be less than available stock', code: 'STOCK_LOW' });
    }
    const qtyAfter = qtyBefore - quantity;
    await prisma.$transaction([
      prisma.stock_transactions.create({
        data: {
          stock_item_id: stockItemId,
          performed_by: req.user!.userId,
          transaction_type: 'usage',
          quantity,
          quantity_before: qtyBefore,
          quantity_after: qtyAfter,
          source_module: 'production',
          notes: description ?? null,
        },
      }),
      prisma.stock_items.update({
        where: { id: stockItemId },
        data: { current_quantity: qtyAfter, updated_at: new Date() } as any,
      }),
    ]);
    return res.json({ message: 'Applied successfully', quantityAfter: qtyAfter });
  } catch {
    return res.status(500).json({ error: 'Failed to apply', code: 'DB_ERROR' });
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

// ── Marketing Deductions ────────────────────────────────────────

router.get('/marketing-deductions', async (req, res) => {
  const productName = req.query.product as string | undefined;
  try {
    const items = await prisma.stock_items.findMany({
      where: {
        ...(productName ? { name: { contains: productName, mode: 'insensitive' } } : {}),
        farm_id: req.user!.farmId ?? undefined,
        deleted_at: null,
      },
      select: { id: true, name: true, unit_of_measure: true },
    });

    if (!items.length) return res.json([]);

    const itemMap: Record<string, { name: string; unit: string }> = {};
    for (const i of items) itemMap[i.id] = { name: i.name, unit: i.unit_of_measure ?? 'kg' };
    const itemIds = Object.keys(itemMap);

    const transactions = await prisma.stock_transactions.findMany({
      where: {
        stock_item_id: { in: itemIds },
        source_module: 'marketing',
        transaction_type: 'usage',
      },
      orderBy: { transacted_at: 'desc' },
    });

    const result = transactions.map(t => ({
      id: t.id,
      product_name: itemMap[t.stock_item_id]?.name ?? '',
      quantity: Number(t.quantity),
      quantity_unit: itemMap[t.stock_item_id]?.unit ?? 'kg',
      status: 'marketing_deduction',
      created_at: t.transacted_at,
      notes: t.notes,
    }));

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch marketing deductions', code: 'DB_ERROR' });
  }
});

// ─── Inventory Analytics ─────────────────────────────────────────────────────

const AMONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
type AB = { label: string; start: Date; end: Date };
function analyticBuckets(range: string, n: number): AB[] {
  const now = new Date();
  if (range === 'daily') {
    return Array.from({ length: n }, (_, i) => {
      const start = new Date(now); start.setDate(now.getDate() - (n - 1 - i)); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setHours(23, 59, 59, 999);
      return { label: `${start.getDate()}/${start.getMonth() + 1}`, start, end };
    });
  }
  if (range === 'weekly') {
    return Array.from({ length: n }, (_, i) => {
      const start = new Date(now); start.setDate(now.getDate() - (n - 1 - i) * 7); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
      return { label: `W${start.getDate()}/${start.getMonth() + 1}`, start, end };
    });
  }
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { label: AMONTHS[d.getMonth()], start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) };
  });
}
const inA = (d: Date, b: AB) => d >= b.start && d <= b.end;
const aDone = (s?: string | null) => s === 'completed' || s === 'delivered';

router.get('/analytics/overview', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const range = ['daily', 'weekly', 'monthly'].includes(String(req.query.range)) ? String(req.query.range) : 'monthly';
  try {
    const [pigs, cattle, birds, fish, mort, orders, stock, pos] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT status, mature_for_market, created_at FROM pigs WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL`,
      prisma.$queryRaw<any[]>`SELECT status, created_at FROM cattle WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL`,
      prisma.$queryRaw<any[]>`SELECT status, created_at FROM birds WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL`,
      prisma.$queryRaw<any[]>`SELECT fs.number_of_fish, fs.created_at FROM fish_stock fs JOIN fish_ponds fp ON fp.id = fs.pond_id WHERE fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL`,
      prisma.$queryRaw<any[]>`SELECT livestock_type, created_at FROM mortality_records WHERE farm_id = ${farmId}::uuid`,
      (prisma as any).marketing_orders.findMany({ where: { farm_id: farmId } }),
      prisma.stock_items.findMany({ where: { farm_id: farmId, deleted_at: null }, select: { name: true, sku: true, current_quantity: true, reorder_threshold: true } }),
      prisma.purchase_orders.findMany({ where: { farm_id: farmId, status: { in: ['draft', 'submitted'] } }, include: { suppliers: { select: { name: true } } } }),
    ]);

    const spark = analyticBuckets(range, 6);
    const head = (rows: any[], qty?: (r: any) => number) => {
      const value = qty ? rows.reduce((s, r) => s + qty(r), 0) : rows.length;
      const series = spark.map(b => rows.filter(r => inA(new Date(r.created_at), b)).reduce((s, r) => s + (qty ? qty(r) : 1), 0));
      const cur = series[series.length - 1] ?? 0; const prev = series[series.length - 2] ?? 0;
      const trend = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);
      return { value: Math.round(value), trend, spark: series };
    };
    const headcounts = {
      fish: head(fish, (r) => Number(r.number_of_fish)),
      birds: head(birds),
      grazing: head(cattle),
      pigs: head(pigs),
    };

    const oDate = (o: any) => new Date(o.date ?? o.created_at);
    const completed = orders.filter((o: any) => aDone(o.status));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const ordersThisMonth = orders.filter((o: any) => oDate(o) >= monthStart).length;
    const salesThisMonth = completed.filter((o: any) => oDate(o) >= monthStart).reduce((s: number, o: any) => s + Number(o.amount), 0);
    const ordersToday = orders.filter((o: any) => oDate(o) >= dayStart).length;
    const totalSales = completed.reduce((s: number, o: any) => s + Number(o.amount), 0);
    const avgOrderValue = completed.length ? totalSales / completed.length : 0;
    const oBuckets = analyticBuckets(range, 8);
    const orderSeries = oBuckets.map(b => ({
      bucket: b.label,
      orders: orders.filter((o: any) => inA(oDate(o), b)).length,
      sales: completed.filter((o: any) => inA(oDate(o), b)).reduce((s: number, o: any) => s + Number(o.amount), 0),
    }));

    const onTime = orders.filter((o: any) => aDone(o.status)).length;
    const delayed = orders.filter((o: any) => o.status === 'en_route' || o.status === 'processing' || o.status === 'in_process').length;
    const failed = orders.filter((o: any) => o.status === 'cancelled').length;
    const delTotal = onTime + delayed + failed;
    const deliveryRate = { rate: delTotal ? Math.round((onTime / delTotal) * 1000) / 10 : 0, onTime, delayed, failed };

    const idx = (rows: any[], qty?: (r: any) => number) => {
      const vals = oBuckets.map(b => rows.filter(r => inA(new Date(r.created_at), b)).reduce((s, r) => s + (qty ? qty(r) : 1), 0));
      const max = Math.max(1, ...vals);
      return vals.map(v => Math.round((v / max) * 100));
    };
    const performance = {
      labels: oBuckets.map(b => b.label),
      series: { fish: idx(fish, (r) => Number(r.number_of_fish)), birds: idx(birds), grazing: idx(cattle), pigs: idx(pigs) },
    };

    const byItem: Record<string, { qty: number; amount: number }> = {};
    for (const o of orders as any[]) { const k = o.item_name; if (!byItem[k]) byItem[k] = { qty: 0, amount: 0 }; byItem[k].qty += Number(o.quantity); byItem[k].amount += Number(o.amount); }
    const rankedItems = Object.entries(byItem).sort((a, b) => b[1].qty - a[1].qty);
    const mostSold = rankedItems.slice(0, 7).map(([name, v]) => ({ name, quantity: Math.round(v.qty) }));
    const stockLevel = (q: number, rt: number) => q === 0 ? 'Out of stock' : q <= (rt || 10) ? 'Low stock' : 'In stock';
    const topSelling = rankedItems.slice(0, 7).map(([name, v]) => {
      const si = stock.find(s => s.name.toLowerCase() === name.toLowerCase());
      return { name, sku: si?.sku ?? '—', quantity: Math.round(v.qty), totalAmount: Math.round(v.amount), status: si ? stockLevel(Number(si.current_quantity), Number(si.reorder_threshold)) : 'In stock' };
    });

    const mortBy = (type: string) => mort.filter(m => m.livestock_type === type).length;
    const ratePct = (dead: number, alive: number) => (dead + alive) > 0 ? Math.round((dead / (dead + alive)) * 1000) / 10 : 0;
    const mortality = [
      { category: 'Pigs', rate: ratePct(mortBy('pig'), pigs.length) },
      { category: 'Birds', rate: ratePct(mortBy('bird'), birds.length) },
      { category: 'Grazing', rate: ratePct(mortBy('cattle'), cattle.length) },
      { category: 'Fish', rate: ratePct(mortBy('fish'), fish.reduce((s, r) => s + Number(r.number_of_fish), 0)) },
    ];
    const healthPct = (rows: any[]) => rows.length ? Math.round((rows.filter(r => r.status === 'healthy').length / rows.length) * 1000) / 10 : 0;
    const health = [
      { category: 'Pigs', rate: healthPct(pigs) },
      { category: 'Birds', rate: healthPct(birds) },
      { category: 'Grazing', rate: healthPct(cattle) },
    ];

    const soldRateVal = orders.length ? Math.round((completed.length / orders.length) * 1000) / 10 : 0;
    const soldRate = {
      rate: soldRateVal, sold: completed.length, listed: orders.length,
      perProduct: rankedItems.slice(0, 5).map(([name, v]) => {
        const done = completed.filter((o: any) => o.item_name === name).reduce((s: number, o: any) => s + Number(o.quantity), 0);
        return { name, rate: v.qty > 0 ? Math.round((done / v.qty) * 100) : 0 };
      }),
    };

    let inStock = 0, lowStock = 0, outOfStock = 0;
    for (const s of stock) { const q = Number(s.current_quantity); const lvl = stockLevel(q, Number(s.reorder_threshold)); if (lvl === 'In stock') inStock++; else if (lvl === 'Low stock') lowStock++; else outOfStock++; }
    const stockSummary = { totalSkus: stock.length, inStock, lowStock, outOfStock };

    const poStatusMap: Record<string, string> = { submitted: 'In Transit', draft: 'Scheduled' };
    const upcoming = pos.slice(0, 25).map((p: any, i: number) => {
      const overdue = p.expected_delivery && new Date(p.expected_delivery) < now;
      return { no: i + 1, item_name: p.commodity ?? '-', location: p.suppliers?.name ?? '-', batch_no: p.po_number, quantity: p.quantity != null ? Number(p.quantity) : 0, status: overdue ? 'Delayed' : (poStatusMap[p.status] ?? 'Scheduled') };
    });

    res.json({
      generatedAt: new Date().toISOString(), range,
      headcounts,
      orderStats: { ordersThisMonth, salesThisMonth, ordersToday, avgOrderValue: Math.round(avgOrderValue), series: orderSeries },
      deliveryRate, performance, mostSold, mortality, health, soldRate, topSelling, stockSummary,
      upcoming,
    });
  } catch (err) {
    console.error('[Inventory/Analytics/Overview]', err);
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
    if (metric === 'top-selling' || metric === 'most-sold') {
      const orders = await (prisma as any).marketing_orders.findMany({ where: { farm_id: farmId } });
      const byItem: Record<string, { qty: number; amount: number }> = {};
      for (const o of orders) { const k = o.item_name; if (!byItem[k]) byItem[k] = { qty: 0, amount: 0 }; byItem[k].qty += Number(o.quantity); byItem[k].amount += Number(o.amount); }
      const rows = Object.entries(byItem).sort((a, b) => b[1].qty - a[1].qty).map(([name, v]) => ({ id: name, name, quantity: Math.round(v.qty), totalAmount: Math.round(v.amount) }));
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (metric === 'stock-summary') {
      const stock = await prisma.stock_items.findMany({ where: { farm_id: farmId, deleted_at: null }, select: { id: true, name: true, sku: true, current_quantity: true, reorder_threshold: true, unit_of_measure: true } });
      const items = stock.map(s => { const q = Number(s.current_quantity); const rt = Number(s.reorder_threshold); return { id: s.id, name: s.name, sku: s.sku ?? '—', quantity: q, unit: s.unit_of_measure, status: q === 0 ? 'Out of stock' : q <= (rt || 10) ? 'Low stock' : 'In stock' }; });
      return res.json({ total: items.length, items: pg(items) });
    }
    if (metric === 'upcoming') {
      const pos = await prisma.purchase_orders.findMany({ where: { farm_id: farmId, status: { in: ['draft', 'submitted'] } }, include: { suppliers: { select: { name: true } } } });
      const items = pos.map((p: any, i: number) => ({ id: p.id, no: i + 1, name: p.commodity ?? '-', location: p.suppliers?.name ?? '-', batch_no: p.po_number, quantity: p.quantity != null ? Number(p.quantity) : 0, status: p.status === 'submitted' ? 'In Transit' : 'Scheduled' }));
      return res.json({ total: items.length, items: pg(items) });
    }
    const speciesTable: Record<string, string> = { 'total-pigs': 'pigs', 'total-birds': 'birds', 'total-grazing-livestock': 'cattle' };
    if (speciesTable[metric]) {
      const table = speciesTable[metric];
      const idCol = table === 'pigs' ? 'pig_id' : table === 'birds' ? 'bird_id' : 'cattle_id';
      const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id, ${idCol} AS record_id, status, weight_kg, created_at FROM ${table} WHERE farm_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at DESC`, farmId);
      const mapped = rows.map(r => ({ id: r.id, record_id: r.record_id, status: r.status, weight_kg: r.weight_kg != null ? Number(r.weight_kg) : null, date: r.created_at }));
      return res.json({ total: mapped.length, items: pg(mapped) });
    }
    if (metric === 'total-fish') {
      const rows = await prisma.$queryRaw<any[]>`SELECT fs.id, fs.fish_type, fs.batch_number, fs.number_of_fish, fp.pond_id, fs.created_at FROM fish_stock fs JOIN fish_ponds fp ON fp.id = fs.pond_id WHERE fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL ORDER BY fs.created_at DESC`;
      const mapped = rows.map(r => ({ id: r.id, record_id: r.batch_number, type: r.fish_type, pond: r.pond_id, quantity: Number(r.number_of_fish), date: r.created_at }));
      return res.json({ total: mapped.length, items: pg(mapped) });
    }
    res.status(400).json({ error: 'Unknown metric', code: 'VALIDATION_ERROR' });
  } catch (err) {
    console.error('[Inventory/Analytics/Details]', err);
    res.status(500).json({ error: 'Failed to fetch details', code: 'DB_ERROR' });
  }
});

export default router;
