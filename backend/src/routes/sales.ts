import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { logAuditEvent, clientInfo } from '../lib/audit';
import { deactivateUser, reactivateUser, findLinkedUserId } from '../lib/userStatus';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const subsystem = req.path.startsWith('/orders') || req.path.startsWith('/distribution-logs') ? 'sales_order_points' : 'crm';
  const action = req.method === 'GET' ? 'view' as const : req.method === 'POST' ? 'create' as const : req.method === 'DELETE' ? 'delete' as const : 'edit' as const;
  return requirePermission(subsystem, action)(req, res, next);
});

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

function parseOrderMeta(notes?: string | null) {
  const raw = notes || '';
  const typeMatch = raw.match(/\[\[type:([a-z_]+)\]\]/i);
  return {
    orderType: (typeMatch?.[1] || 'direct_sale') as 'direct_sale' | 'production_order' | 'contract',
    cleanNotes: raw.replace(/\[\[[^\]]+\]\]/g, '').trim(),
  };
}

function serializeOrderNotes(orderType: string, notes?: string | null) {
  const cleanNotes = (notes || '').replace(/\[\[[^\]]+\]\]/g, '').trim();
  return `[[type:${orderType}]]${cleanNotes ? ` ${cleanNotes}` : ''}`;
}

function mapOrder(order: any) {
  const { orderType, cleanNotes } = parseOrderMeta(order.notes);
  const items = (order.sales_order_items || []).map((item: any) => ({
    id: item.id,
    stock_item_id: item.stock_item_id,
    product_name: item.stock_items?.name || 'Unknown Item',
    category: item.stock_items?.item_categories?.name || null,
    quantity: Number(item.quantity || 0),
    unit: item.stock_items?.unit_of_measure || null,
    unit_price: Number(item.unit_price || 0),
    line_total: Number(item.line_total || 0),
  }));
  const primaryItem = items[0] || null;

  return {
    id: order.id,
    created_at: order.created_at,
    customer_id: order.customer_id,
    order_number: order.order_number,
    order_date: order.order_date,
    delivery_date: order.delivery_date ?? null,
    status: DB_TO_UI[order.status] ?? order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method ?? null,
    subtotal: Number(order.subtotal || 0),
    tax_amount: Number(order.tax_amount || 0),
    total_amount: Number(order.total_amount || 0),
    notes: cleanNotes,
    order_type: orderType,
    product_name: primaryItem?.product_name || 'Mixed Order',
    product_category: primaryItem?.category || null,
    quantity: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
    unit: primaryItem?.unit || null,
    unit_price: primaryItem?.unit_price || 0,
    items,
    customers: order.customers ? { name: order.customers.name } : null,
  };
}

const customerSchema = z.object({
  name: z.string().min(1),
  customerType: z.enum(['individual', 'business', 'exporter', 'retailer', 'restaurant']).default('individual'),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/customers', async (req, res) => {
  const { search } = req.query as Record<string, string>;
  try {
    const customers = await prisma.customers.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        deleted_at: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { created_at: 'asc' },
    });

    const result = customers.map((customer: any, index: number) => ({
      ...customer,
      is_active: customer.is_active ?? true,
      display_id: `CUST-${String(index + 1).padStart(3, '0')}`,
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch customers', code: 'DB_ERROR' });
  }
});

router.post('/customers', async (req, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const data = parsed.data;
  try {
    const customer = await prisma.customers.create({
      data: {
        farm_id: req.user!.farmId,
        name: data.name,
        customer_type: data.customerType,
        contact_person: data.contactPerson,
        phone: data.phone,
        email: data.email || undefined,
        address: data.address,
        country: data.country,
        notes: data.notes,
      },
    });
    res.status(201).json(customer);
  } catch {
    res.status(500).json({ error: 'Failed to create customer', code: 'DB_ERROR' });
  }
});

router.patch('/customers/:id', async (req, res) => {
  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const data = parsed.data;
  try {
    const customer = await prisma.customers.update({
      where: { id: req.params.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.customerType && { customer_type: data.customerType }),
        ...(data.contactPerson !== undefined && { contact_person: data.contactPerson }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
    res.json(customer);
  } catch {
    res.status(500).json({ error: 'Failed to update customer', code: 'DB_ERROR' });
  }
});

router.get('/customers/:id/orders', async (req, res) => {
  try {
    const orders = await prisma.sales_orders.findMany({
      where: {
        customer_id: req.params.id,
        farm_id: req.user!.farmId ?? undefined,
      },
      include: {
        customers: { select: { name: true } },
        sales_order_items: {
          include: { stock_items: { include: { item_categories: { select: { name: true } } } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(orders.map(mapOrder));
  } catch {
    res.status(500).json({ error: 'Failed to fetch customer orders', code: 'DB_ERROR' });
  }
});

router.delete('/customers/:id', async (req, res) => {
  try {
    await prisma.customers.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete customer', code: 'DB_ERROR' });
  }
});

router.patch('/customers/:id/deactivate', async (req, res) => {
  try {
    await prisma.customers.update({
      where: { id: req.params.id },
      data: { is_active: false, deactivated_at: new Date(), updated_at: new Date() },
    });
    const linkedUserId = await findLinkedUserId('customer', req.params.id);
    if (linkedUserId) await deactivateUser(linkedUserId);
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, eventType: 'customer_deactivated', subsystem: 'crm', description: `Customer ${req.params.id} deactivated`, ipAddress: ip, userAgent });
    res.json({ message: 'Customer deactivated' });
  } catch {
    res.status(500).json({ error: 'Failed to deactivate customer', code: 'DB_ERROR' });
  }
});

router.patch('/customers/:id/activate', async (req, res) => {
  try {
    await prisma.customers.update({
      where: { id: req.params.id },
      data: { is_active: true, deactivated_at: null, updated_at: new Date() },
    });
    const linkedUserId = await findLinkedUserId('customer', req.params.id);
    if (linkedUserId) await reactivateUser(linkedUserId);
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, eventType: 'customer_activated', subsystem: 'crm', description: `Customer ${req.params.id} activated`, ipAddress: ip, userAgent });
    res.json({ message: 'Customer activated' });
  } catch {
    res.status(500).json({ error: 'Failed to activate customer', code: 'DB_ERROR' });
  }
});

const orderSchema = z.object({
  customerId: z.string().uuid(),
  stockItemId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
  orderType: z.enum(['direct_sale', 'production_order', 'contract']).default('direct_sale'),
  productionRequired: z.boolean().optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).default('unpaid'),
  paymentMethod: z.string().optional(),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/orders', async (req, res) => {
  const { status, search, payment_status, customer_id, date_from, date_to } = req.query as Record<string, string>;
  const dbStatus = status && UI_TO_DB[status] ? UI_TO_DB[status] : undefined;
  const roleName = req.user!.roleName;

  let customerIdFilter: string | undefined;
  if (roleName === 'customer') {
    const linked = await prisma.customers.findFirst({
      where: { email: { equals: req.user!.email, mode: 'insensitive' }, deleted_at: null },
      select: { id: true },
    });
    customerIdFilter = linked?.id ?? '__none__';
  }

  try {
    const orders = await prisma.sales_orders.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        ...(dbStatus && { status: dbStatus }),
        ...(payment_status && { payment_status }),
        ...(customer_id && { customer_id }),
        ...(customerIdFilter && { customer_id: customerIdFilter }),
        ...(date_from || date_to
          ? {
              order_date: {
                ...(date_from ? { gte: new Date(date_from) } : {}),
                ...(date_to ? { lte: new Date(date_to) } : {}),
              },
            }
          : {}),
      },
      include: {
        customers: { select: { name: true } },
        sales_order_items: {
          include: { stock_items: { include: { item_categories: { select: { name: true } } } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const mapped = orders.map(mapOrder).filter((order) => {
      if (!search) return true;
      const needle = search.toLowerCase();
      return (
        order.order_number.toLowerCase().includes(needle) ||
        (order.customers?.name || '').toLowerCase().includes(needle) ||
        order.product_name.toLowerCase().includes(needle)
      );
    });

    res.json(mapped);
  } catch {
    res.status(500).json({ error: 'Failed to fetch orders', code: 'DB_ERROR' });
  }
});

router.post('/orders', async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const data = parsed.data;

  try {
    const stockItem = await prisma.stock_items.findUnique({ where: { id: data.stockItemId } });
    if (!stockItem) return res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND' });

    const quantity = Number(data.quantity);
    const unitPrice = Number(data.unitPrice ?? stockItem.unit_cost ?? 0);
    const totalAmount = quantity * unitPrice;
    const availableQuantity = Number(stockItem.current_quantity || 0) - Number(stockItem.reserved_quantity || 0);
    const requiresProduction = data.productionRequired === true || availableQuantity < quantity;
    const initialStatus = requiresProduction ? 'confirmed' : 'pending';
    const orderNumber = `SO-${Date.now()}`;

    const order = await prisma.$transaction(async (tx) => {
      if (!requiresProduction) {
        await tx.stock_items.update({
          where: { id: stockItem.id },
          data: {
            reserved_quantity: Number(stockItem.reserved_quantity || 0) + quantity,
            updated_at: new Date(),
          },
        });
      } else {
        await (tx as any).inventory_production_requests.create({
          data: {
            farm_id: req.user!.farmId,
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

      const created = await tx.sales_orders.create({
        data: {
          farm_id: req.user!.farmId,
          customer_id: data.customerId,
          created_by: req.user!.userId,
          updated_by: req.user!.userId,
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

      return created;
    });

    await logAuditEvent({
      req,
      eventType: 'create',
      subsystem: 'sales_order_points',
      description: `Created sales order ${order.order_number}`,
      recordType: 'sales_order',
      recordId: order.id,
      recordLabel: order.order_number,
      severity: 'info',
      afterValue: {
        status: order.status,
        paymentStatus: order.payment_status,
        customer: order.customers?.name ?? null,
        totalAmount: Number(order.total_amount || 0),
      },
    });
    res.status(201).json(mapOrder(order));
  } catch {
    res.status(500).json({ error: 'Failed to create order', code: 'DB_ERROR' });
  }
});

router.patch('/orders/:id', async (req, res) => {
  const { status, notes, deliveryDate, paymentStatus, dispatchDate, deliveryStatus, destination, driverName, vehicleRef, recipientName } = req.body;

  try {
    const existing = await prisma.sales_orders.findUnique({
      where: { id: req.params.id },
      include: {
        customers: { select: { name: true } },
        sales_order_items: {
          include: { stock_items: { include: { item_categories: { select: { name: true } } } } },
        },
        distribution_logs: true,
      },
    });
    if (!existing) return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });

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
          const nextReserved = Math.max(reservedQuantity - Math.min(reservedQuantity, quantity), 0);
          const nextCurrent = Math.max(currentQuantity - quantity, 0);

          await tx.stock_items.update({
            where: { id: stockItem.id },
            data: {
              current_quantity: nextCurrent,
              reserved_quantity: nextReserved,
              updated_at: new Date(),
            },
          });

          await tx.stock_transactions.create({
            data: {
              stock_item_id: stockItem.id,
              performed_by: req.user!.userId,
              transaction_type: 'sale',
              quantity,
              quantity_before: currentQuantity,
              quantity_after: nextCurrent,
              reference_id: existing.id,
              reference_table: 'sales_orders',
              source_module: 'sales',
              notes: `Completed sales order ${existing.order_number}`,
            },
          });
        }

        if (
          previousDbStatus !== 'cancelled' &&
          previousDbStatus !== 'delivered' &&
          nextDbStatus === 'cancelled' &&
          reservedQuantity > 0
        ) {
          const releaseQty = Math.min(reservedQuantity, quantity);
          await tx.stock_items.update({
            where: { id: stockItem.id },
            data: {
              reserved_quantity: Math.max(reservedQuantity - releaseQty, 0),
              updated_at: new Date(),
            },
          });

          await tx.stock_transactions.create({
            data: {
              stock_item_id: stockItem.id,
              performed_by: req.user!.userId,
              transaction_type: 'release',
              quantity: releaseQty,
              quantity_before: reservedQuantity,
              quantity_after: Math.max(reservedQuantity - releaseQty, 0),
              reference_id: existing.id,
              reference_table: 'sales_orders',
              source_module: 'sales',
              notes: `Released reserved stock for ${existing.order_number}`,
            },
          });
        }

        if (
          previousDbStatus === 'confirmed' &&
          nextDbStatus === 'dispatched' &&
          reservedQuantity < quantity &&
          currentQuantity - reservedQuantity >= quantity
        ) {
          await tx.stock_items.update({
            where: { id: stockItem.id },
            data: {
              reserved_quantity: reservedQuantity + quantity,
              updated_at: new Date(),
            },
          });
        }
      }

      if ((nextDbStatus === 'dispatched' || nextDbStatus === 'delivered') && !existing.distribution_logs.length) {
        await tx.distribution_logs.create({
          data: {
            sales_order_id: existing.id,
            dispatched_by: req.user!.userId,
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

      const updated = await tx.sales_orders.update({
        where: { id: req.params.id },
        data: {
          updated_by: req.user!.userId,
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

      return updated;
    });

    const nextUiStatus = DB_TO_UI[order.status] ?? order.status;
    await logAuditEvent({
      req,
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
    res.json(mapOrder(order));
  } catch {
    res.status(500).json({ error: 'Failed to update order', code: 'DB_ERROR' });
  }
});

router.delete('/orders/:id', async (req, res) => {
  try {
    const existing = await prisma.sales_orders.findUnique({
      where: { id: req.params.id },
      select: { id: true, order_number: true, status: true },
    });
    if (!existing) return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });
    await prisma.sales_orders.update({
      where: { id: req.params.id },
      data: { status: 'cancelled', updated_by: req.user!.userId },
    });
    await logAuditEvent({
      req,
      eventType: 'delete',
      subsystem: 'sales_order_points',
      description: `Cancelled sales order ${existing.order_number}`,
      recordType: 'sales_order',
      recordId: existing.id,
      recordLabel: existing.order_number,
      severity: 'warning',
      beforeValue: existing,
      afterValue: { status: 'cancelled' },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete order', code: 'DB_ERROR' });
  }
});

router.get('/distribution-logs', async (req, res) => {
  try {
    const logs = await prisma.distribution_logs.findMany({
      where: {
        sales_orders: {
          farm_id: req.user!.farmId ?? undefined,
        },
      },
      include: {
        sales_orders: {
          include: {
            customers: { select: { name: true } },
            sales_order_items: {
              include: { stock_items: true },
            },
          },
        },
      },
      orderBy: { dispatch_date: 'desc' },
    });

    res.json(
      logs.map((log) => ({
        id: log.id,
        delivery_id: log.id,
        order_id: log.sales_order_id,
        order_number: log.sales_orders.order_number,
        customer: log.sales_orders.customers?.name ?? 'Walk-in',
        product: log.sales_orders.sales_order_items[0]?.stock_items?.name ?? 'Mixed Order',
        quantity: Number(log.sales_orders.sales_order_items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)),
        unit: log.sales_orders.sales_order_items[0]?.stock_items?.unit_of_measure ?? null,
        dispatch_date: log.dispatch_date,
        delivery_status: log.delivery_status,
        destination: log.destination,
        driver_name: log.driver_name,
        notes: log.notes,
      })),
    );
  } catch {
    res.status(500).json({ error: 'Failed to fetch distribution logs', code: 'DB_ERROR' });
  }
});

export default router;
