import prisma from '../lib/prisma';
import { createLinkedFinanceEntry } from './financeService';
import { dispatchReservedStock, releaseReservedStock, reserveStock } from './inventoryService';
import { recordAuditEvent } from './auditService';

const prismaAny = prisma as any;

function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

const UI_TO_DB: Record<string, string> = {
  pending: 'pending',
  in_production: 'confirmed',
  quality_check: 'packed',
  ready_for_dispatch: 'dispatched',
  completed: 'delivered',
  rejected: 'cancelled',
};

const DB_TO_UI: Record<string, string> = {
  pending: 'pending',
  confirmed: 'in_production',
  packed: 'quality_check',
  dispatched: 'ready_for_dispatch',
  delivered: 'completed',
  invoiced: 'completed',
  cancelled: 'rejected',
};

function serializeOrderNotes(orderType: string, notes?: string | null) {
  const cleanNotes = (notes || '').replace(/\[\[[^\]]+\]\]/g, '').trim();
  return `[[type:${orderType}]]${cleanNotes ? ` ${cleanNotes}` : ''}`;
}

function parseOrderMeta(notes?: string | null) {
  const raw = notes || '';
  const typeMatch = raw.match(/\[\[type:([a-z_]+)\]\]/i);
  return {
    orderType: (typeMatch?.[1] || 'direct_sale') as 'direct_sale' | 'production_order' | 'contract',
  };
}

export async function createSalesOrderFlow({
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
  const stockItem = await prisma.stock_items.findUnique({ where: { id: data.stockItemId } });
  if (!stockItem) throw Object.assign(new Error('Product not found'), { code: 'NOT_FOUND' });

  const quantity = Number(data.quantity);
  const unitPrice = Number(data.unitPrice ?? stockItem.unit_cost ?? 0);
  const totalAmount = quantity * unitPrice;
  const availableQuantity = Number(stockItem.current_quantity || 0) - Number(stockItem.reserved_quantity || 0);
  const requiresProduction = data.productionRequired === true || availableQuantity < quantity;
  const initialStatus = requiresProduction ? 'confirmed' : 'pending';
  const orderNumber = `SO-${Date.now()}`;

  const order = await prisma.$transaction(async (tx) => {
    const txAny = tx as any;
    if (!requiresProduction) {
      await reserveStock(tx, {
        stockItemId: stockItem.id,
        performedBy: actorUserId,
        quantity,
        sourceModule: 'sales',
        notes: `Reserved for sales order ${orderNumber}`,
        });
    } else {
      await txAny.inventory_production_requests.create({
        data: {
          farm_id: farmId,
          product_name: stockItem.name,
          quantity,
          quantity_unit: stockItem.unit_of_measure,
          location: stockItem.storage_location ?? 'Production queue',
          order_type: 'Make-to-Order',
          link_order: orderNumber,
          status: 'pending',
          stock_item_id: stockItem.id,
        },
      });
    }

    return tx.sales_orders.create({
      data: {
        farm_id: farmId,
        customer_id: data.customerId,
        created_by: actorUserId,
        updated_by: actorUserId,
        order_number: orderNumber,
        delivery_date: data.deliveryDate ? new Date(data.deliveryDate) : undefined,
        status: initialStatus,
        payment_status: data.paymentStatus,
        payment_method: data.paymentMethod ?? null,
        subtotal: totalAmount,
        total_amount: totalAmount,
        notes: serializeOrderNotes(data.orderType, data.notes),
        sales_order_items: {
          create: {
            stock_item_id: stockItem.id,
            quantity,
            unit_price: unitPrice,
            line_total: totalAmount,
          },
        },
      },
      include: {
        customers: { select: { name: true } },
        sales_order_items: {
          include: { stock_items: { include: { item_categories: { select: { name: true } } } } },
        },
      },
    });
  });

  await recordAuditEvent({
    req,
    actorUserId,
    eventType: 'create',
    subsystem: 'sales_order_points',
    description: `Created sales order ${order.order_number}`,
    recordType: 'sales_order',
    recordId: order.id,
    recordLabel: order.order_number,
    afterValue: {
      status: order.status,
      paymentStatus: order.payment_status,
      customer: order.customers?.name ?? null,
      totalAmount: Number(order.total_amount || 0),
      productionRequested: requiresProduction,
    },
  });

  return order;
}

export async function updateSalesOrderFlow({
  orderId,
  patch,
  actorUserId,
  farmId,
  req,
}: {
  orderId: string;
  patch: any;
  actorUserId: string;
  farmId: string | undefined;
  req?: any;
}) {
  const existing = await prisma.sales_orders.findUnique({
    where: { id: orderId },
    include: {
      customers: { select: { name: true } },
      sales_order_items: {
        include: { stock_items: { include: { item_categories: { select: { name: true } } } } },
      },
      distribution_logs: true,
    },
  });
  if (!existing) throw Object.assign(new Error('Order not found'), { code: 'NOT_FOUND' });

  const { status, notes, deliveryDate, paymentStatus, dispatchDate, deliveryStatus, destination, driverName, vehicleRef, recipientName } = patch;
  const nextDbStatus = status ? (UI_TO_DB[status] ?? status) : existing.status;
  const previousDbStatus = existing.status;
  const { orderType } = parseOrderMeta(existing.notes);

  const order = await prisma.$transaction(async (tx) => {
    for (const item of existing.sales_order_items) {
      const stockItem = item.stock_items;
      const quantity = Number(item.quantity || 0);
      const currentQuantity = Number(stockItem.current_quantity || 0);
      const reservedQuantity = Number(stockItem.reserved_quantity || 0);

      if (previousDbStatus !== 'delivered' && nextDbStatus === 'delivered') {
        if (reservedQuantity < quantity) {
          throw Object.assign(new Error('Cannot complete order without reserved stock'), { code: 'INSUFFICIENT_RESERVED_STOCK' });
        }
        await dispatchReservedStock(tx, {
          stockItemId: stockItem.id,
          performedBy: actorUserId,
          quantity,
          sourceModule: 'sales',
          referenceId: existing.id,
          referenceTable: 'sales_orders',
          notes: `Completed sales order ${existing.order_number}`,
        });
      }

      if (
        previousDbStatus !== 'cancelled' &&
        previousDbStatus !== 'delivered' &&
        nextDbStatus === 'cancelled' &&
        reservedQuantity > 0
      ) {
        await releaseReservedStock(tx, {
          stockItemId: stockItem.id,
          performedBy: actorUserId,
          quantity,
          sourceModule: 'sales',
          referenceId: existing.id,
          referenceTable: 'sales_orders',
          notes: `Released reserved stock for ${existing.order_number}`,
        });
      }

      if (
        previousDbStatus === 'confirmed' &&
        nextDbStatus === 'dispatched' &&
        reservedQuantity < quantity &&
        currentQuantity - reservedQuantity >= quantity
      ) {
        await reserveStock(tx, {
          stockItemId: stockItem.id,
          performedBy: actorUserId,
          quantity,
          sourceModule: 'sales',
          referenceId: existing.id,
          referenceTable: 'sales_orders',
          notes: `Reserved for dispatch ${existing.order_number}`,
        });
      }
    }

    if ((nextDbStatus === 'dispatched' || nextDbStatus === 'delivered') && !existing.distribution_logs.length) {
      await tx.distribution_logs.create({
        data: {
          sales_order_id: existing.id,
          dispatched_by: actorUserId,
          dispatch_date: dispatchDate ? new Date(dispatchDate) : new Date(),
          delivery_status: deliveryStatus ?? (nextDbStatus === 'delivered' ? 'delivered' : 'in_transit'),
          destination: destination ?? existing.customers?.name ?? null,
          driver_name: driverName ?? 'Internal Dispatch Team',
          vehicle_ref: vehicleRef ?? 'AMIS-DELIVERY',
          recipient_name: recipientName ?? existing.customers?.name ?? null,
          notes: notes ?? existing.notes ?? null,
        },
      });
    }

    return tx.sales_orders.update({
      where: { id: orderId },
      data: {
        updated_by: actorUserId,
        status: nextDbStatus,
        ...(notes !== undefined && { notes: serializeOrderNotes(orderType, notes) }),
        ...(deliveryDate && { delivery_date: new Date(deliveryDate) }),
        ...(paymentStatus && { payment_status: paymentStatus }),
      },
      include: {
        customers: { select: { name: true } },
        sales_order_items: {
          include: { stock_items: { include: { item_categories: { select: { name: true } } } } },
        },
      },
    });
  });

  if (previousDbStatus !== 'delivered' && nextDbStatus === 'delivered') {
    await createLinkedFinanceEntry({
      farmId,
      actorUserId,
      kind: 'income',
      amount: toNumber(order.total_amount),
      description: `Sales order completed ${order.order_number}`,
      linkedModule: 'sales',
      linkedRecordId: order.id,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method ?? null,
      dueDate: order.delivery_date ?? new Date(),
      customer: order.customers?.name ?? 'Customer',
      productService: order.sales_order_items[0]?.stock_items?.name ?? 'Sales order',
      sourceOrder: order.order_number,
      date: order.delivery_date ?? new Date(),
    });
  }

  const nextUiStatus = DB_TO_UI[order.status] ?? order.status;
  await recordAuditEvent({
    req,
    actorUserId,
    eventType:
      paymentStatus && paymentStatus !== existing.payment_status ? 'payment_recorded'
      : status && status !== (DB_TO_UI[previousDbStatus] ?? previousDbStatus) ? 'status_change'
      : 'update',
    subsystem: 'sales_order_points',
    description: `Updated sales order ${order.order_number}`,
    recordType: 'sales_order',
    recordId: order.id,
    recordLabel: order.order_number,
    severity: nextUiStatus === 'rejected' ? 'warning' : 'info',
    beforeValue: {
      status: DB_TO_UI[existing.status] ?? existing.status,
      paymentStatus: existing.payment_status,
      deliveryDate: existing.delivery_date,
    },
    afterValue: {
      status: nextUiStatus,
      paymentStatus: order.payment_status,
      deliveryDate: order.delivery_date,
    },
  });

  return order;
}

export async function cancelSalesOrderFlow({
  orderId,
  actorUserId,
  req,
}: {
  orderId: string;
  actorUserId: string;
  req?: any;
}) {
  const existing = await prisma.sales_orders.findUnique({
    where: { id: orderId },
    include: {
      sales_order_items: { include: { stock_items: true } },
    },
  });
  if (!existing) throw Object.assign(new Error('Order not found'), { code: 'NOT_FOUND' });

  await prisma.$transaction(async (tx) => {
    for (const item of existing.sales_order_items) {
      await releaseReservedStock(tx, {
        stockItemId: item.stock_item_id,
        performedBy: actorUserId,
        quantity: Number(item.quantity || 0),
        sourceModule: 'sales',
        referenceId: existing.id,
        referenceTable: 'sales_orders',
        notes: `Cancelled sales order ${existing.order_number}`,
      });
    }
    await tx.sales_orders.update({
      where: { id: orderId },
      data: { status: 'cancelled', updated_by: actorUserId },
    });
  });

  await recordAuditEvent({
    req,
    actorUserId,
    eventType: 'delete',
    subsystem: 'sales_order_points',
    description: `Cancelled sales order ${existing.order_number}`,
    recordType: 'sales_order',
    recordId: existing.id,
    recordLabel: existing.order_number,
    severity: 'warning',
    beforeValue: { status: existing.status },
    afterValue: { status: 'cancelled' },
  });
}
