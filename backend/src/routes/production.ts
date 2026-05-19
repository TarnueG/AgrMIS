import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { logAuditEvent } from '../lib/audit';

const router = Router();
const prismaAny = prisma as any;

router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const subsystem = req.path.startsWith('/livestock') ? 'livestock' : 'production';
  const action = req.method === 'GET' ? ('view' as const) : req.method === 'POST' ? ('create' as const) : req.method === 'DELETE' ? ('delete' as const) : ('edit' as const);
  return requirePermission(subsystem, action)(req, res, next);
});

type StructuredLogNotes = {
  workersAssigned?: string;
  equipmentUsed?: string;
  notes?: string;
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function parseJsonNotes(value: string | null | undefined): StructuredLogNotes {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return {
        workersAssigned: typeof parsed.workersAssigned === 'string' ? parsed.workersAssigned : undefined,
        equipmentUsed: typeof parsed.equipmentUsed === 'string' ? parsed.equipmentUsed : undefined,
        notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
      };
    }
  } catch {
    return { notes: value };
  }
  return {};
}

function inferSector(productName: string) {
  const value = productName.toLowerCase();
  if (value.includes('pond') || value.includes('fish') || value.includes('tilapia') || value.includes('catfish')) return 'aquaculture';
  if (value.includes('broiler') || value.includes('goat') || value.includes('pig') || value.includes('cattle') || value.includes('egg')) return 'livestock';
  if (value.includes('rice') || value.includes('maize') || value.includes('cassava') || value.includes('cocoa') || value.includes('crop')) return 'crop';
  return 'processing';
}

function formatProductionStatus(status: string | null | undefined) {
  const value = status || 'pending';
  if (value === 'in_progress') return 'in_process';
  if (value === 'failed') return 'declined';
  return value;
}

function toDbBatchStatus(status: string | null | undefined) {
  if (status === 'in_process') return 'in_progress';
  if (status === 'declined') return 'failed';
  return status || 'pending';
}

async function ensureOutputStockItem(tx: any, {
  farmId,
  userId,
  request,
  batch,
}: {
  farmId: string | null | undefined;
  userId: string;
  request: any;
  batch: any;
}) {
  let stockItem =
    (request.stock_item_id
      ? await tx.stock_items.findFirst({ where: { id: request.stock_item_id, deleted_at: null } }).catch(() => null)
      : null) ||
    await tx.stock_items.findFirst({
      where: {
        farm_id: farmId ?? undefined,
        deleted_at: null,
        name: { equals: request.product_name, mode: 'insensitive' },
      },
    });

  if (!stockItem) {
    const categoryNameBySector: Record<string, string> = {
      crop: 'crop harvest',
      livestock: 'livestock output',
      aquaculture: 'fish harvest',
      processing: 'finished goods',
    };
    const categoryName = categoryNameBySector[batch.sector || 'processing'] || 'finished goods';
    let category = await tx.item_categories.findFirst({
      where: { name: { equals: categoryName, mode: 'insensitive' }, deleted_at: null },
    });
    if (!category) {
      category = await tx.item_categories.create({
        data: { name: categoryName, type: 'product' },
      });
    }

    stockItem = await tx.stock_items.create({
      data: {
        farm_id: farmId ?? null,
        category_id: category.id,
        name: request.product_name,
        unit_of_measure: batch.quantity_unit || request.quantity_unit || 'kg',
        current_quantity: 0,
        reorder_threshold: 0,
        storage_location: request.location ?? null,
      },
    });

    await tx.inventory_production_requests.update({
      where: { id: request.id },
      data: { stock_item_id: stockItem.id, updated_at: new Date() },
    });
  }

  return stockItem;
}

function buildBatchLabel(batch: any, request: any, order: any) {
  return {
    id: batch.id,
    requestId: request?.id || null,
    batchNumber: batch.batch_number || `BATCH-${batch.id.slice(0, 8)}`,
    productName: request?.product_name || 'Unnamed product',
    sector: batch.sector || inferSector(request?.product_name || ''),
    linkedSalesOrderId: batch.linked_sales_order_id || request?.sales_order_id || null,
    linkedSalesOrderNumber: order?.order_number || request?.link_order || null,
    linkedCustomer: order?.customers?.name || null,
    plannedQuantity: toNumber(batch.planned_quantity ?? request?.quantity ?? batch.quantity),
    producedQuantity: toNumber(batch.produced_quantity ?? batch.quantity),
    wasteQuantity: toNumber(batch.waste_quantity),
    unit: batch.quantity_unit || request?.quantity_unit || 'kg',
    status: formatProductionStatus(batch.status),
    startDate: batch.start_date,
    expectedCompletion: batch.expected_completion,
    actualCompletion: batch.actual_completion,
    failureReason: batch.failure_reason || request?.rejection_reason || null,
    requestedFromOrder: Boolean(batch.linked_sales_order_id || request?.sales_order_id),
    notes: batch.notes || request?.notes || null,
    location: request?.location || null,
    passedToInventory: Boolean(batch.passed_to_inventory),
    createdAt: batch.created_at,
  };
}

const sectorSchema = z.enum(['crop', 'livestock', 'aquaculture', 'processing']);

const createBatchSchema = z.object({
  productName: z.string().min(1),
  sector: sectorSchema.default('processing'),
  plannedQuantity: z.number().positive(),
  unit: z.string().min(1),
  linkedSalesOrderId: z.string().uuid().optional().nullable(),
  stockItemId: z.string().uuid().optional().nullable(),
  location: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  expectedCompletion: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateBatchSchema = z.object({
  status: z.enum(['pending', 'in_process', 'quality_check']).optional(),
  plannedQuantity: z.number().nonnegative().optional(),
  producedQuantity: z.number().nonnegative().optional(),
  wasteQuantity: z.number().nonnegative().optional(),
  startDate: z.string().optional().nullable(),
  expectedCompletion: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const consumeInputSchema = z.object({
  stockItemId: z.string().uuid(),
  quantityUsed: z.number().positive(),
  usedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const qualityCheckSchema = z.object({
  result: z.enum(['passed', 'rework', 'failed']),
  producedQuantity: z.number().nonnegative().default(0),
  wasteQuantity: z.number().nonnegative().default(0),
  notes: z.string().optional().nullable(),
  failureReason: z.string().optional().nullable(),
  checkedAt: z.string().optional().nullable(),
});

const dailyLogSchema = z.object({
  batchId: z.string().uuid().optional().nullable(),
  sector: sectorSchema,
  activity: z.string().min(1),
  logDate: z.string().optional().nullable(),
  workersAssigned: z.string().optional().nullable(),
  equipmentUsed: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const createLivestockSchema = z.object({
  animal_type: z.string().min(1),
  breed: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  health_status: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

const createWorkOrderSchema = z.object({
  product_name: z.string().min(1),
  quantity: z.number().min(0).default(0),
  order_id: z.string().optional(),
  notes: z.string().optional(),
});

function toDbStatus(uiStatus: string) {
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

function toUiStatus(dbStatus: string) {
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

function toUiHealthStatus(dbStatus: string) {
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

router.get('/command-center', async (req, res) => {
  try {
    const farmId = req.user!.farmId ?? undefined;
    const [
      requests,
      batches,
      consumptionRows,
      qualityRows,
      dailyLogs,
      salesOrders,
      stockItems,
    ] = await Promise.all([
      prismaAny.inventory_production_requests.findMany({
        where: { farm_id: farmId },
        orderBy: { created_at: 'desc' },
      }),
      prismaAny.inventory_production_batches.findMany({
        where: { farm_id: farmId },
        include: { inventory_production_requests: true },
        orderBy: { created_at: 'desc' },
      }),
      prisma.stock_transactions.findMany({
        where: {
          transaction_type: 'production_consumption',
          source_module: 'production',
          stock_items: { farm_id: farmId, deleted_at: null },
        },
        include: {
          stock_items: true,
          users: { select: { full_name: true } },
        },
        orderBy: { transacted_at: 'desc' },
        take: 100,
      }),
      prisma.quality_checks.findMany({
        where: { farm_id: farmId },
        include: {
          users: { select: { full_name: true } },
        },
        orderBy: { check_date: 'desc' },
        take: 100,
      }),
      prisma.daily_production_logs.findMany({
        where: { farm_id: farmId },
        include: {
          users: { select: { full_name: true } },
        },
        orderBy: [{ log_date: 'desc' }, { created_at: 'desc' }],
        take: 100,
      }),
      prisma.sales_orders.findMany({
        where: { farm_id: farmId },
        include: {
          customers: { select: { name: true } },
          sales_order_items: {
            include: {
              stock_items: { select: { id: true, name: true, unit_of_measure: true } },
            },
          },
        },
        orderBy: { order_date: 'desc' },
      }),
      prisma.stock_items.findMany({
        where: { farm_id: farmId, deleted_at: null },
        include: {
          item_categories: { select: { id: true, name: true, type: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const requestMap = new Map(requests.map((request: any) => [request.id, request]));
    const batchMap = new Map(batches.map((batch: any) => [batch.id, batch]));
    const salesOrderMap = new Map(salesOrders.map((order) => [order.id, order]));

    const normalizedBatches = batches.map((batch: any) => {
      const request = batch.inventory_production_requests || requestMap.get(batch.request_id);
      const linkedOrder = salesOrderMap.get(batch.linked_sales_order_id || request?.sales_order_id || '');
      return buildBatchLabel(batch, request, linkedOrder);
    });

    const openRequestStatuses = new Set(['pending', 'accepted']);
    const requestedOrders = requests
      .filter((request: any) => openRequestStatuses.has(request.status || 'pending'))
      .map((request: any) => {
        const linkedOrder = salesOrderMap.get(request.sales_order_id || '');
        const requestBatches = normalizedBatches.filter((batch) => batch.requestId === request.id);
        return {
          id: request.id,
          productName: request.product_name,
          plannedQuantity: toNumber(request.quantity),
          unit: request.quantity_unit || 'kg',
          status: request.status || 'pending',
          location: request.location,
          linkedSalesOrderId: request.sales_order_id || null,
          linkedSalesOrderNumber: linkedOrder?.order_number || request.link_order || null,
          linkedCustomer: linkedOrder?.customers?.name || null,
          dueDate: request.due_date,
          rejectionReason: request.rejection_reason || null,
          notes: request.notes || null,
          batchCount: requestBatches.length,
          createdAt: request.created_at,
        };
      });

    const inputConsumptions = consumptionRows.map((row) => {
      const batch: any = row.reference_id ? batchMap.get(row.reference_id) : null;
      const request: any = batch?.request_id ? requestMap.get(batch.request_id) : null;
      return {
        id: row.id,
        batchId: row.reference_id,
        batchNumber: batch?.batch_number || 'Batch',
        productName: request?.product_name || batch?.batch_number || 'Production batch',
        inputItem: row.stock_items.name,
        quantityUsed: toNumber(row.quantity),
        unit: row.stock_items.unit_of_measure,
        sourceInventoryLocation: row.stock_items.storage_location || '-',
        dateUsed: row.transacted_at,
        recordedBy: row.users.full_name,
        notes: row.notes,
      };
    });

    const qualityChecks = qualityRows
      .filter((row) => {
        const params = row.parameters as Record<string, unknown> | null;
        return Boolean(params && params.batchId);
      })
      .map((row) => {
        const params = (row.parameters || {}) as Record<string, unknown>;
        const batchId = typeof params.batchId === 'string' ? params.batchId : null;
        const batch: any = batchId ? batchMap.get(batchId) : null;
        const request: any = batch?.request_id ? requestMap.get(batch.request_id) : null;
        const batchNumber =
          batch?.batch_number ||
          (typeof params.batchNumber === 'string' ? params.batchNumber : 'Batch');
        return {
          id: row.id,
          batchId,
          batchNumber,
          productName: request?.product_name || (typeof params.productName === 'string' ? params.productName : 'Production batch'),
          inspectionDate: row.check_date,
          result: typeof params.result === 'string' ? params.result : row.passed ? 'passed' : 'failed',
          notes: row.notes || null,
          checkedBy: row.users.full_name,
        };
      });

    const dailyProductionLogs = dailyLogs.map((row) => {
      const structured = parseJsonNotes(row.notes);
      const batch: any = row.reference_id ? batchMap.get(row.reference_id) : null;
      return {
        id: row.id,
        date: row.log_date,
        sector: row.sector,
        activity: row.activity,
        batchId: row.reference_id,
        batchNumber: batch?.batch_number || null,
        workersAssigned: structured.workersAssigned || '-',
        equipmentUsed: structured.equipmentUsed || '-',
        notes: structured.notes || row.notes || null,
        recordedBy: row.users.full_name,
      };
    });

    const salesOrderOptions = salesOrders.map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      customerName: order.customers.name,
      status: order.status,
      deliveryDate: order.delivery_date,
      items: order.sales_order_items.map((item) => ({
        stockItemId: item.stock_items.id,
        productName: item.stock_items.name,
        unit: item.stock_items.unit_of_measure,
        quantity: toNumber(item.quantity),
      })),
    }));

    const stockItemOptions = stockItems.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit_of_measure,
      currentQuantity: toNumber(item.current_quantity),
      reservedQuantity: toNumber(item.reserved_quantity),
      availableQuantity: toNumber(item.available_quantity),
      location: item.storage_location,
      category: item.item_categories?.name || null,
    }));

    res.json({
      batches: normalizedBatches,
      requestedOrders,
      inputConsumptions,
      qualityChecks,
      dailyLogs: dailyProductionLogs,
      salesOrders: salesOrderOptions,
      stockItems: stockItemOptions,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load production command center', code: 'DB_ERROR' });
  }
});

router.post('/batches', async (req, res) => {
  const parsed = createBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const data = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const txAny = tx as any;
      const salesOrder = data.linkedSalesOrderId
        ? await tx.sales_orders.findUnique({
            where: { id: data.linkedSalesOrderId },
            include: { customers: { select: { name: true } } },
          })
        : null;

      let request = data.linkedSalesOrderId
        ? await txAny.inventory_production_requests.findFirst({
            where: {
              farm_id: req.user!.farmId ?? undefined,
              sales_order_id: data.linkedSalesOrderId,
              product_name: data.productName,
            },
          })
        : null;

      const requestPayload = {
        farm_id: req.user!.farmId,
        product_name: data.productName,
        quantity: data.plannedQuantity,
        quantity_unit: data.unit,
        location: data.location ?? null,
        order_type: data.linkedSalesOrderId ? 'Make-to-Order' : 'Manual Batch',
        link_order: salesOrder?.order_number || 'Manual Planning',
        status: 'accepted',
        stock_item_id: data.stockItemId ?? null,
        sales_order_id: data.linkedSalesOrderId ?? null,
        notes: data.notes ?? null,
        due_date: data.expectedCompletion ? new Date(data.expectedCompletion) : null,
        updated_at: new Date(),
      };

      if (request) {
        request = await txAny.inventory_production_requests.update({
          where: { id: request.id },
          data: requestPayload,
        });
      } else {
        request = await txAny.inventory_production_requests.create({
          data: requestPayload,
        });
      }

      const batch = await txAny.inventory_production_batches.create({
        data: {
          farm_id: req.user!.farmId,
          request_id: request.id,
          batch_number: `PB-${Date.now().toString().slice(-8)}`,
          quantity: data.plannedQuantity,
          status: 'pending',
          sector: data.sector,
          linked_sales_order_id: data.linkedSalesOrderId ?? null,
          planned_quantity: data.plannedQuantity,
          produced_quantity: 0,
          waste_quantity: 0,
          quantity_unit: data.unit,
          start_date: data.startDate ? new Date(data.startDate) : new Date(),
          expected_completion: data.expectedCompletion ? new Date(data.expectedCompletion) : null,
          notes: data.notes ?? null,
        },
      });

      if (salesOrder && ['pending', 'confirmed'].includes(salesOrder.status)) {
        await tx.sales_orders.update({
          where: { id: salesOrder.id },
          data: { status: 'confirmed', updated_by: req.user!.userId, updated_at: new Date() },
        });
      }

      return batch;
    });

    await logAuditEvent({
      req,
      eventType: 'create',
      subsystem: 'production',
      description: `Created production batch ${result.batch_number}`,
      recordType: 'production_batch',
      recordId: result.id,
      recordLabel: result.batch_number,
      severity: 'info',
      afterValue: {
        status: result.status,
        plannedQuantity: Number(result.planned_quantity || result.quantity || 0),
        sector: result.sector,
      },
    });
    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: 'Failed to create production batch', code: 'DB_ERROR' });
  }
});

router.patch('/batches/:id', async (req, res) => {
  const parsed = updateBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const data = parsed.data;
  try {
    const existing = await prismaAny.inventory_production_batches.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Batch not found', code: 'NOT_FOUND' });
    }
    const batch = await prismaAny.inventory_production_batches.update({
      where: { id: req.params.id },
      data: {
        ...(data.status !== undefined && { status: toDbBatchStatus(data.status) }),
        ...(data.plannedQuantity !== undefined && { planned_quantity: data.plannedQuantity }),
        ...(data.producedQuantity !== undefined && { produced_quantity: data.producedQuantity }),
        ...(data.wasteQuantity !== undefined && { waste_quantity: data.wasteQuantity }),
        ...(data.startDate !== undefined && { start_date: data.startDate ? new Date(data.startDate) : null }),
        ...(data.expectedCompletion !== undefined && { expected_completion: data.expectedCompletion ? new Date(data.expectedCompletion) : null }),
        ...(data.notes !== undefined && { notes: data.notes }),
        updated_at: new Date(),
      },
    });

    await logAuditEvent({
      req,
      eventType: data.status && data.status !== formatProductionStatus(existing.status) ? 'status_change' : 'update',
      subsystem: 'production',
      description: `Updated production batch ${batch.batch_number}`,
      recordType: 'production_batch',
      recordId: batch.id,
      recordLabel: batch.batch_number,
      severity: 'info',
      beforeValue: existing,
      afterValue: batch,
    });
    res.json(batch);
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Batch not found', code: 'NOT_FOUND' });
    }
    res.status(500).json({ error: 'Failed to update production batch', code: 'DB_ERROR' });
  }
});

router.post('/batches/:id/consume', async (req, res) => {
  const parsed = consumeInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const data = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await prismaAny.inventory_production_batches.findUnique({ where: { id: req.params.id } });
      if (!batch) throw Object.assign(new Error('Batch not found'), { code: 'NOT_FOUND' });

      const stockItem = await tx.stock_items.findFirst({
        where: { id: data.stockItemId, deleted_at: null },
      });
      if (!stockItem) throw Object.assign(new Error('Input item not found'), { code: 'INPUT_NOT_FOUND' });

      const currentQuantity = toNumber(stockItem.current_quantity);
      if (currentQuantity < data.quantityUsed) {
        throw Object.assign(new Error('Insufficient stock'), { code: 'STOCK_LOW' });
      }

      const nextQuantity = currentQuantity - data.quantityUsed;
      await tx.stock_items.update({
        where: { id: stockItem.id },
        data: { current_quantity: nextQuantity, updated_at: new Date() },
      });

      const transaction = await tx.stock_transactions.create({
        data: {
          stock_item_id: stockItem.id,
          performed_by: req.user!.userId,
          transaction_type: 'production_consumption',
          quantity: data.quantityUsed,
          quantity_before: currentQuantity,
          quantity_after: nextQuantity,
          reference_id: batch.id,
          reference_table: 'inventory_production_batches',
          source_module: 'production',
          notes: data.notes ?? `Consumed by ${batch.batch_number}`,
          transacted_at: data.usedAt ? new Date(data.usedAt) : new Date(),
        },
      });

      if ((batch.status || 'pending') === 'pending') {
        await prismaAny.inventory_production_batches.update({
          where: { id: batch.id },
          data: {
            status: 'in_progress',
            start_date: batch.start_date ?? new Date(),
            updated_at: new Date(),
          },
        });
      }

      return { transaction, batch, stockItem, currentQuantity, nextQuantity };
    });

    await logAuditEvent({
      req,
      eventType: 'stock_movement',
      subsystem: 'production',
      description: `Consumed ${data.quantityUsed} ${result.stockItem.unit_of_measure || ''} of ${result.stockItem.name} for ${result.batch.batch_number}`.trim(),
      recordType: 'production_batch',
      recordId: result.batch.id,
      recordLabel: result.batch.batch_number,
      severity: 'info',
      beforeValue: { quantity: result.currentQuantity },
      afterValue: { quantity: result.nextQuantity, stockItem: result.stockItem.name, consumed: data.quantityUsed },
    });
    res.status(201).json(result.transaction);
  } catch (error: any) {
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Batch not found', code: 'NOT_FOUND' });
    if (error?.code === 'INPUT_NOT_FOUND') return res.status(404).json({ error: 'Input item not found', code: 'INPUT_NOT_FOUND' });
    if (error?.code === 'STOCK_LOW') return res.status(400).json({ error: 'Insufficient stock for consumption', code: 'STOCK_LOW' });
    res.status(500).json({ error: 'Failed to consume production inputs', code: 'DB_ERROR' });
  }
});

router.post('/batches/:id/quality-check', async (req, res) => {
  const parsed = qualityCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const data = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await prismaAny.inventory_production_batches.findUnique({ where: { id: req.params.id } });
      if (!batch) throw Object.assign(new Error('Batch not found'), { code: 'NOT_FOUND' });

      const request = await prismaAny.inventory_production_requests.findUnique({ where: { id: batch.request_id } });
      if (!request) throw Object.assign(new Error('Request not found'), { code: 'REQ_NOT_FOUND' });

      await tx.quality_checks.create({
        data: {
          farm_id: req.user!.farmId,
          checked_by: req.user!.userId,
          check_date: data.checkedAt ? new Date(data.checkedAt) : new Date(),
          grade: data.result === 'passed' ? 'A' : data.result === 'rework' ? 'B' : 'C',
          passed: data.result === 'passed',
          notes: data.notes ?? data.failureReason ?? null,
          stock_item_id: request.stock_item_id ?? null,
          sales_order_id: batch.linked_sales_order_id || request.sales_order_id || null,
          parameters: {
            batchId: batch.id,
            batchNumber: batch.batch_number,
            productName: request.product_name,
            result: data.result,
            producedQuantity: data.producedQuantity,
            wasteQuantity: data.wasteQuantity,
            failureReason: data.failureReason ?? null,
          },
        },
      });

      let status = 'quality_check';
      if (data.result === 'passed') status = 'passed';
      if (data.result === 'rework') status = 'rework';
      if (data.result === 'failed') status = 'declined';

      const updatedBatch = await prismaAny.inventory_production_batches.update({
        where: { id: batch.id },
        data: {
          status: toDbBatchStatus(status),
          produced_quantity: data.producedQuantity,
          waste_quantity: data.wasteQuantity,
          actual_completion: data.result === 'rework' ? null : (data.checkedAt ? new Date(data.checkedAt) : new Date()),
          failure_reason: data.result === 'failed' ? data.failureReason ?? data.notes ?? 'Quality check failed' : null,
          notes: data.notes ?? batch.notes ?? null,
          passed_to_inventory: data.result === 'passed' ? true : false,
          updated_at: new Date(),
        },
      });

      if (data.result === 'passed') {
        const stockItem = await ensureOutputStockItem(tx, {
          farmId: req.user!.farmId,
          userId: req.user!.userId,
          request,
          batch: updatedBatch,
        });

        const before = toNumber(stockItem.current_quantity);
        const after = before + data.producedQuantity;
        await tx.stock_items.update({
          where: { id: stockItem.id },
          data: { current_quantity: after, updated_at: new Date() },
        });

        await tx.stock_transactions.create({
          data: {
            stock_item_id: stockItem.id,
            performed_by: req.user!.userId,
            transaction_type: 'production_output',
            quantity: data.producedQuantity,
            quantity_before: before,
            quantity_after: after,
            reference_id: batch.id,
            reference_table: 'inventory_production_batches',
            source_module: 'production',
            notes: `Finished output from ${batch.batch_number}`,
            transacted_at: data.checkedAt ? new Date(data.checkedAt) : new Date(),
          },
        });

        await prismaAny.inventory_production_requests.update({
          where: { id: request.id },
          data: {
            status: 'passed',
            stock_item_id: stockItem.id,
            updated_at: new Date(),
          },
        });

        const salesOrderId = batch.linked_sales_order_id || request.sales_order_id;
        if (salesOrderId) {
          await tx.sales_orders.update({
            where: { id: salesOrderId },
            data: { status: 'packed', updated_by: req.user!.userId, updated_at: new Date() },
          }).catch(() => null);
        }
      } else if (data.result === 'failed') {
        await prismaAny.inventory_production_requests.update({
          where: { id: request.id },
          data: {
            status: 'cancelled',
            rejection_reason: data.failureReason ?? data.notes ?? 'Quality check failed',
            updated_at: new Date(),
          },
        });
      } else {
        await prismaAny.inventory_production_requests.update({
          where: { id: request.id },
          data: { status: 'accepted', updated_at: new Date() },
        });
      }

      return { updatedBatch, request };
    });

    await logAuditEvent({
      req,
      eventType: data.result === 'passed' ? 'approve' : data.result === 'failed' ? 'reject' : 'status_change',
      subsystem: 'production',
      description: `Quality check ${data.result} for ${result.updatedBatch.batch_number}`,
      recordType: 'production_batch',
      recordId: result.updatedBatch.id,
      recordLabel: result.updatedBatch.batch_number,
      severity: data.result === 'failed' ? 'critical' : data.result === 'rework' ? 'warning' : 'info',
      afterValue: {
        status: result.updatedBatch.status,
        producedQuantity: data.producedQuantity,
        wasteQuantity: data.wasteQuantity,
        requestId: result.request.id,
      },
      metadata: {
        result: data.result,
        failureReason: data.failureReason ?? null,
      },
    });
    res.status(201).json(result.updatedBatch);
  } catch (error: any) {
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Batch not found', code: 'NOT_FOUND' });
    if (error?.code === 'REQ_NOT_FOUND') return res.status(404).json({ error: 'Production request not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to record quality check', code: 'DB_ERROR' });
  }
});

router.get('/daily-logs', async (req, res) => {
  try {
    const logs = await prisma.daily_production_logs.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      include: {
        users: { select: { full_name: true } },
      },
      orderBy: [{ log_date: 'desc' }, { created_at: 'desc' }],
      take: 100,
    });

    res.json(logs.map((row) => {
      const structured = parseJsonNotes(row.notes);
      return {
        ...row,
        workers_assigned: structured.workersAssigned || null,
        equipment_used: structured.equipmentUsed || null,
        plain_notes: structured.notes || row.notes || null,
        recorded_by_name: row.users.full_name,
      };
    }));
  } catch {
    res.status(500).json({ error: 'Failed to fetch daily logs', code: 'DB_ERROR' });
  }
});

router.post('/daily-logs', async (req, res) => {
  const parsed = dailyLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const data = parsed.data;
  try {
    const log = await prisma.daily_production_logs.create({
      data: {
        farm_id: req.user!.farmId,
        logged_by: req.user!.userId,
        log_date: data.logDate ? new Date(data.logDate) : new Date(),
        sector: data.sector,
        activity: data.activity,
        reference_id: data.batchId ?? null,
        notes: JSON.stringify({
          workersAssigned: data.workersAssigned || null,
          equipmentUsed: data.equipmentUsed || null,
          notes: data.notes || null,
        }),
      },
    });
    res.status(201).json(log);
  } catch {
    res.status(500).json({ error: 'Failed to create daily log', code: 'DB_ERROR' });
  }
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
  const { status } = req.body;
  try {
    const wo = await prisma.work_orders.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status: toDbStatus(status) }),
        updated_at: new Date(),
      },
    });
    res.json(mapWorkOrder(wo));
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Work order not found', code: 'NOT_FOUND' });
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
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Work order not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete work order', code: 'DB_ERROR' });
  }
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
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Record not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete livestock record', code: 'DB_ERROR' });
  }
});

export default router;
