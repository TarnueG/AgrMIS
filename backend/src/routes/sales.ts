import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);

// UI ↔ DB status translation
const UI_TO_DB: Record<string, string> = {
  pending: 'pending',
  in_production: 'confirmed',
  quality_check: 'packed',
  completed: 'delivered',
  rejected: 'cancelled',
};

const DB_TO_UI: Record<string, string> = {
  pending: 'pending',
  confirmed: 'in_production',
  packed: 'quality_check',
  dispatched: 'quality_check',
  delivered: 'completed',
  invoiced: 'completed',
  cancelled: 'rejected',
};

function mapOrder(o: any) {
  return {
    id: o.id,
    created_at: o.created_at,
    customer_id: o.customer_id,
    order_number: o.order_number,
    order_date: o.order_date,
    delivery_date: o.delivery_date ?? null,
    status: DB_TO_UI[o.status] ?? o.status,
    payment_status: o.payment_status,
    total_amount: o.total_amount,
    notes: o.notes ?? '',
    order_type: 'sale',
    customers: o.customers ? { name: o.customers.name } : null,
  };
}

// ── Customers ───────────────────────────────────────────────────

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
      orderBy: { name: 'asc' },
    });
    res.json(customers);
  } catch {
    res.status(500).json({ error: 'Failed to fetch customers', code: 'DB_ERROR' });
  }
});

router.post('/customers', async (req, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const customer = await prisma.customers.create({
      data: {
        farm_id: req.user!.farmId,
        name: d.name,
        customer_type: d.customerType,
        contact_person: d.contactPerson,
        phone: d.phone,
        email: d.email || undefined,
        address: d.address,
        country: d.country,
        notes: d.notes,
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
  const d = parsed.data;
  try {
    const customer = await prisma.customers.update({
      where: { id: req.params.id },
      data: {
        ...(d.name && { name: d.name }),
        ...(d.customerType && { customer_type: d.customerType }),
        ...(d.phone !== undefined && { phone: d.phone }),
        ...(d.email !== undefined && { email: d.email }),
        ...(d.address !== undefined && { address: d.address }),
        ...(d.notes !== undefined && { notes: d.notes }),
      },
    });
    res.json(customer);
  } catch {
    res.status(500).json({ error: 'Failed to update customer', code: 'DB_ERROR' });
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

// ── Sales Orders ─────────────────────────────────────────────────

const orderSchema = z.object({
  customerId: z.string().uuid(),
  totalAmount: z.number().min(0).default(0),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/orders', async (req, res) => {
  const { status, search } = req.query as Record<string, string>;
  const dbStatus = status && UI_TO_DB[status] ? UI_TO_DB[status] : undefined;
  try {
    const orders = await prisma.sales_orders.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        ...(dbStatus && { status: dbStatus }),
      },
      include: { customers: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(orders.map(mapOrder));
  } catch {
    res.status(500).json({ error: 'Failed to fetch orders', code: 'DB_ERROR' });
  }
});

router.post('/orders', async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const orderNumber = `SO-${Date.now()}`;
    const order = await prisma.sales_orders.create({
      data: {
        farm_id: req.user!.farmId,
        customer_id: d.customerId,
        created_by: req.user!.userId,
        order_number: orderNumber,
        total_amount: d.totalAmount,
        delivery_date: d.deliveryDate ? new Date(d.deliveryDate) : undefined,
        notes: d.notes,
      },
      include: { customers: { select: { name: true } } },
    });
    res.status(201).json(mapOrder(order));
  } catch {
    res.status(500).json({ error: 'Failed to create order', code: 'DB_ERROR' });
  }
});

router.patch('/orders/:id', async (req, res) => {
  const { status, notes, deliveryDate, paymentStatus } = req.body;
  try {
    const order = await prisma.sales_orders.update({
      where: { id: req.params.id },
      data: {
        updated_by: req.user!.userId,
        ...(status && { status: UI_TO_DB[status] ?? status }),
        ...(notes !== undefined && { notes }),
        ...(deliveryDate && { delivery_date: new Date(deliveryDate) }),
        ...(paymentStatus && { payment_status: paymentStatus }),
      },
      include: { customers: { select: { name: true } } },
    });
    res.json(mapOrder(order));
  } catch {
    res.status(500).json({ error: 'Failed to update order', code: 'DB_ERROR' });
  }
});

router.delete('/orders/:id', async (req, res) => {
  try {
    await prisma.sales_orders.update({
      where: { id: req.params.id },
      data: { status: 'cancelled', updated_by: req.user!.userId },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete order', code: 'DB_ERROR' });
  }
});

export default router;
