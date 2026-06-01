import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import paymentRouter from './marketingPayments';

// Maps a sold marketing item to a livestock species/source so a completed order
// marks that many Healthy animals as 'sold' (mirrors raw-material stock deduction).
async function sellLivestock(farmId: string | undefined, itemName: string, qty: number) {
  const name = (itemName || '').toLowerCase().trim();
  const n = Math.max(0, Math.floor(qty));
  if (!farmId || n <= 0) return;
  let ids: any[] = [];
  if (name.includes('pig') || name.includes('piglet')) {
    ids = await prisma.$queryRaw<any[]>`SELECT id FROM pigs WHERE farm_id = ${farmId}::uuid AND status = 'healthy' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT ${n}`;
    for (const r of ids) await prisma.$executeRaw`UPDATE pigs SET status = 'sold', updated_at = NOW() WHERE id = ${r.id}::uuid`;
  } else if (name === 'chicken' || name === 'duck') {
    ids = await prisma.$queryRaw<any[]>`SELECT id FROM birds WHERE farm_id = ${farmId}::uuid AND status = 'healthy' AND bird_type = ${name} AND deleted_at IS NULL ORDER BY created_at ASC LIMIT ${n}`;
    for (const r of ids) await prisma.$executeRaw`UPDATE birds SET status = 'sold', updated_at = NOW() WHERE id = ${r.id}::uuid`;
  } else if (name === 'cow' || name === 'goat' || name === 'sheep') {
    ids = await prisma.$queryRaw<any[]>`SELECT id FROM cattle WHERE farm_id = ${farmId}::uuid AND status = 'healthy' AND cattle_type = ${name} AND deleted_at IS NULL ORDER BY created_at ASC LIMIT ${n}`;
    for (const r of ids) await prisma.$executeRaw`UPDATE cattle SET status = 'sold', updated_at = NOW() WHERE id = ${r.id}::uuid`;
  }
}

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'view' as const : req.method === 'POST' ? 'create' as const : req.method === 'DELETE' ? 'delete' as const : 'edit' as const;
  return requirePermission('marketing', action)(req, res, next);
});

function generateOrderId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ORD-${rand}`;
}

// ── Prices ──────────────────────────────────────────────────────

router.get('/prices', async (req, res) => {
  try {
    const data = await (prisma as any).prices.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { item_name: 'asc' },
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to fetch prices', code: 'DB_ERROR' });
  }
});

router.post('/prices', async (req, res) => {
  const schema = z.object({
    itemName: z.string().min(1),
    pricePerUnit: z.number().min(0),
    quantityUnit: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const existing = await (prisma as any).prices.findFirst({
      where: { farm_id: req.user!.farmId, item_name: d.itemName },
    });
    if (existing) {
      const updated = await (prisma as any).prices.update({
        where: { id: existing.id },
        data: { price_per_unit: d.pricePerUnit, quantity_unit: d.quantityUnit, updated_at: new Date() },
      });
      return res.json(updated);
    }
    const created = await (prisma as any).prices.create({
      data: {
        farm_id: req.user!.farmId,
        item_name: d.itemName,
        price_per_unit: d.pricePerUnit,
        quantity_unit: d.quantityUnit,
      },
    });
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Failed to save price', code: 'DB_ERROR' });
  }
});

router.patch('/prices/:id', async (req, res) => {
  const schema = z.object({
    pricePerUnit: z.number().min(0),
    quantityUnit: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const updated = await (prisma as any).prices.update({
      where: { id: req.params.id },
      data: {
        price_per_unit: d.pricePerUnit,
        ...(d.quantityUnit !== undefined && { quantity_unit: d.quantityUnit }),
        updated_at: new Date(),
      },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update price', code: 'DB_ERROR' });
  }
});

// ── Cart ──────────────────────────────────────────────────────────

router.get('/cart', async (req, res) => {
  try {
    const items = await (prisma as any).cart_items.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { created_at: 'asc' },
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Failed to fetch cart', code: 'DB_ERROR' });
  }
});

router.post('/cart', async (req, res) => {
  const schema = z.object({
    itemName: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const item = await (prisma as any).cart_items.create({
      data: {
        farm_id: req.user!.farmId,
        item_name: d.itemName,
        quantity: d.quantity,
        unit_price: d.unitPrice,
        total_amount: d.quantity * d.unitPrice,
      },
    });
    res.status(201).json(item);
  } catch {
    res.status(500).json({ error: 'Failed to add to cart', code: 'DB_ERROR' });
  }
});

router.delete('/cart/:id', async (req, res) => {
  try {
    await (prisma as any).cart_items.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to remove cart item', code: 'DB_ERROR' });
  }
});

router.delete('/cart', async (req, res) => {
  try {
    await (prisma as any).cart_items.deleteMany({ where: { farm_id: req.user!.farmId ?? undefined } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to clear cart', code: 'DB_ERROR' });
  }
});

// ── Checkout ─────────────────────────────────────────────────────

router.post('/checkout', async (req, res) => {
  try {
    const cartItems = await (prisma as any).cart_items.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
    });
    if (!cartItems.length) return res.status(400).json({ error: 'Cart is empty', code: 'EMPTY_CART' });

    const paymentId = randomUUID();
    const orders: any[] = [];

    for (const item of cartItems) {
      let orderId = generateOrderId();
      let attempts = 0;
      while (await (prisma as any).marketing_orders.findUnique({ where: { order_id: orderId } })) {
        orderId = generateOrderId();
        if (++attempts > 10) throw new Error('Cannot generate unique order ID');
      }
      const order = await (prisma as any).marketing_orders.create({
        data: {
          farm_id: req.user!.farmId,
          order_id: orderId,
          payment_id: paymentId,
          item_name: item.item_name,
          quantity: item.quantity,
          amount: item.total_amount,
          status: 'pending',
        },
      });
      orders.push(order);
    }

    await (prisma as any).cart_items.deleteMany({ where: { farm_id: req.user!.farmId ?? undefined } });
    res.json({ orders, paymentId });
  } catch {
    res.status(500).json({ error: 'Checkout failed', code: 'DB_ERROR' });
  }
});

// ── Marketing Orders ──────────────────────────────────────────────

router.get('/orders', async (req, res) => {
  try {
    const orders = await (prisma as any).marketing_orders.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { date: 'desc' },
    });
    res.json(orders);
  } catch {
    res.status(500).json({ error: 'Failed to fetch orders', code: 'DB_ERROR' });
  }
});

router.patch('/orders/:id', async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'processing', 'in_process', 'en_route', 'delivered', 'completed'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' });
  try {
    const order = await (prisma as any).marketing_orders.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });

    // Stock deduction triggers when order is first marked completed — best-effort, never blocks status update
    if (status === 'completed' && order.status !== 'completed' && order.status !== 'delivered') {
      try {
        // Prefer the stock item with the highest available quantity for the deduction
        const stockItem = await prisma.stock_items.findFirst({
          where: {
            name: { contains: order.item_name, mode: 'insensitive' },
            farm_id: req.user!.farmId ?? undefined,
            deleted_at: null,
          },
          orderBy: { current_quantity: 'desc' },
        });
        if (stockItem) {
          const currentQty = Number(stockItem.current_quantity) || 0;
          const orderQty = Number(order.quantity) || 0;
          const newQty = Math.max(0, currentQty - orderQty);
          await prisma.$transaction([
            prisma.stock_items.update({
              where: { id: stockItem.id },
              data: { current_quantity: newQty, updated_at: new Date() } as any,
            }),
            prisma.stock_transactions.create({
              data: {
                stock_item_id: stockItem.id,
                performed_by: req.user!.userId,
                transaction_type: 'usage',
                quantity: orderQty,
                quantity_before: currentQty,
                quantity_after: newQty,
                source_module: 'marketing',
                notes: `Marketing order ${order.order_id} completed`,
              },
            }),
          ]);
        }
        // Livestock sale: mark the ordered quantity of Healthy animals as 'sold'
        await sellLivestock(req.user!.farmId ?? undefined, order.item_name, Number(order.quantity) || 0);
      } catch {
        // best-effort; never block the status update
      }
    }

    const updated = await (prisma as any).marketing_orders.update({
      where: { id: req.params.id },
      data: { status, updated_at: new Date() },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update order', code: 'DB_ERROR' });
  }
});

// ── Payment routes (Stripe) ──────────────────────────────────────

router.use(paymentRouter);

// ── Available Inventory Items ─────────────────────────────────────

router.get('/available-items', async (req, res) => {
  try {
    const items = await prisma.stock_items.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        deleted_at: null,
        current_quantity: { gt: 0 },
      },
      include: { units_of_measure: { select: { symbol: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Failed to fetch items', code: 'DB_ERROR' });
  }
});

export default router;
