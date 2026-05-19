import prisma from '../lib/prisma';
import { addStock, consumeStock } from './inventoryService';
import { recordAuditEvent } from './auditService';

const prismaAny = prisma as any;

function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

function toDbBatchStatus(status: string | null | undefined) {
  if (status === 'in_process') return 'in_progress';
  if (status === 'declined') return 'failed';
  return status || 'pending';
}

function formatProductionStatus(status: string | null | undefined) {
  const value = status || 'pending';
  if (value === 'in_progress') return 'in_process';
  if (value === 'failed') return 'declined';
  return value;
}

async function ensureOutputStockItem(tx: any, {
  farmId,
  request,
  batch,
}: {
  farmId: string | undefined;
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
    let category = await tx.item_categories.findFirst({
      where: { name: { equals: 'finished goods', mode: 'insensitive' }, deleted_at: null },
    });
    if (!category) {
      category = await tx.item_categories.create({
        data: { name: 'finished goods', type: 'product' },
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

export async function createProductionBatchFlow({
  data,
  actorUserId,
  farmId,
  req,
}: {
  data: any;
  actorUserId: string;
  farmId: string | undefined;
  req?: any;
}) {
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
            farm_id: farmId ?? undefined,
            sales_order_id: data.linkedSalesOrderId,
            product_name: data.productName,
          },
        })
      : null;

    const requestPayload = {
      farm_id: farmId,
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

    request = request
      ? await txAny.inventory_production_requests.update({ where: { id: request.id }, data: requestPayload })
      : await txAny.inventory_production_requests.create({ data: requestPayload });

    const batch = await txAny.inventory_production_batches.create({
      data: {
        farm_id: farmId,
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
        data: { status: 'confirmed', updated_by: actorUserId, updated_at: new Date() },
      });
    }

    return batch;
  });

  await recordAuditEvent({
    req,
    actorUserId,
    eventType: 'create',
    subsystem: 'production',
    description: `Created production batch ${result.batch_number}`,
    recordType: 'production_batch',
    recordId: result.id,
    recordLabel: result.batch_number,
    afterValue: {
      status: result.status,
      plannedQuantity: Number(result.planned_quantity || result.quantity || 0),
      sector: result.sector,
    },
  });
  return result;
}

export async function updateProductionBatchFlow({
  batchId,
  data,
  actorUserId,
  req,
}: {
  batchId: string;
  data: any;
  actorUserId: string;
  req?: any;
}) {
  const existing = await prismaAny.inventory_production_batches.findUnique({ where: { id: batchId } });
  if (!existing) throw Object.assign(new Error('Batch not found'), { code: 'NOT_FOUND' });

  const batch = await prismaAny.inventory_production_batches.update({
    where: { id: batchId },
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

  await recordAuditEvent({
    req,
    actorUserId,
    eventType: data.status && data.status !== formatProductionStatus(existing.status) ? 'status_change' : 'update',
    subsystem: 'production',
    description: `Updated production batch ${batch.batch_number}`,
    recordType: 'production_batch',
    recordId: batch.id,
    recordLabel: batch.batch_number,
    beforeValue: existing,
    afterValue: batch,
  });

  return batch;
}

export async function consumeProductionInputFlow({
  batchId,
  data,
  actorUserId,
  req,
}: {
  batchId: string;
  data: any;
  actorUserId: string;
  req?: any;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const txAny = tx as any;
    const batch = await txAny.inventory_production_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw Object.assign(new Error('Batch not found'), { code: 'NOT_FOUND' });

    const stock = await consumeStock(tx, {
      stockItemId: data.stockItemId,
      performedBy: actorUserId,
      quantity: data.quantityUsed,
      sourceModule: 'production',
      movementType: 'PRODUCTION_INPUT',
      referenceId: batch.id,
      referenceTable: 'inventory_production_batches',
      notes: data.notes ?? `Consumed by ${batch.batch_number}`,
    });

    const transaction = await tx.stock_transactions.findFirst({
      where: {
        stock_item_id: data.stockItemId,
        reference_id: batch.id,
        source_module: 'production',
      },
      orderBy: { transacted_at: 'desc' },
    });

    if ((batch.status || 'pending') === 'pending') {
      await txAny.inventory_production_batches.update({
        where: { id: batch.id },
        data: { status: 'in_progress', start_date: batch.start_date ?? new Date(), updated_at: new Date() },
      });
    }

    return { batch, stock, transaction };
  });

  await recordAuditEvent({
    req,
    actorUserId,
    eventType: 'stock_movement',
    subsystem: 'production',
    description: `Consumed ${data.quantityUsed} for ${result.batch.batch_number}`,
    recordType: 'production_batch',
    recordId: result.batch.id,
    recordLabel: result.batch.batch_number,
    afterValue: {
      quantityAfter: result.stock.after,
      stockItemId: data.stockItemId,
      consumed: data.quantityUsed,
    },
  });

  return result.transaction;
}

export async function qualityCheckProductionFlow({
  batchId,
  data,
  actorUserId,
  farmId,
  req,
}: {
  batchId: string;
  data: any;
  actorUserId: string;
  farmId: string | undefined;
  req?: any;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const txAny = tx as any;
    const batch = await txAny.inventory_production_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw Object.assign(new Error('Batch not found'), { code: 'NOT_FOUND' });
    const request = await txAny.inventory_production_requests.findUnique({ where: { id: batch.request_id } });
    if (!request) throw Object.assign(new Error('Request not found'), { code: 'REQ_NOT_FOUND' });

    await tx.quality_checks.create({
      data: {
        farm_id: farmId,
        checked_by: actorUserId,
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

    const updatedBatch = await txAny.inventory_production_batches.update({
      where: { id: batch.id },
      data: {
        status: toDbBatchStatus(status),
        produced_quantity: data.producedQuantity,
        waste_quantity: data.wasteQuantity,
        actual_completion: data.result === 'rework' ? null : (data.checkedAt ? new Date(data.checkedAt) : new Date()),
        failure_reason: data.result === 'failed' ? data.failureReason ?? data.notes ?? 'Quality check failed' : null,
        notes: data.notes ?? batch.notes ?? null,
        passed_to_inventory: data.result === 'passed',
        updated_at: new Date(),
      },
    });

    let stockResult: any = null;
    if (data.result === 'passed') {
      const stockItem = await ensureOutputStockItem(tx, { farmId, request, batch: updatedBatch });
      stockResult = await addStock(tx, {
        stockItemId: stockItem.id,
        performedBy: actorUserId,
        quantity: data.producedQuantity,
        sourceModule: 'production',
        movementType: 'PRODUCTION_OUTPUT',
        referenceId: batch.id,
        referenceTable: 'inventory_production_batches',
        notes: `Finished output from ${batch.batch_number}`,
      });
      await txAny.inventory_production_requests.update({
        where: { id: request.id },
        data: { status: 'passed', stock_item_id: stockItem.id, updated_at: new Date() },
      });
      const salesOrderId = batch.linked_sales_order_id || request.sales_order_id;
      if (salesOrderId) {
        await tx.sales_orders.update({
          where: { id: salesOrderId },
          data: { status: 'packed', updated_by: actorUserId, updated_at: new Date() },
        }).catch(() => null);
      }
    } else if (data.result === 'failed') {
      await txAny.inventory_production_requests.update({
        where: { id: request.id },
        data: { status: 'cancelled', rejection_reason: data.failureReason ?? data.notes ?? 'Quality check failed', updated_at: new Date() },
      });
    } else {
      await txAny.inventory_production_requests.update({
        where: { id: request.id },
        data: { status: 'accepted', updated_at: new Date() },
      });
    }

    return { updatedBatch, request, stockResult };
  });

  await recordAuditEvent({
    req,
    actorUserId,
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
      stockAfter: result.stockResult?.after ?? null,
    },
    metadata: { result: data.result, failureReason: data.failureReason ?? null },
  });

  return result.updatedBatch;
}
