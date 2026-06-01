import stripe from '../lib/stripe';
import prisma from '../lib/prisma';

interface LineItem {
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  quantityUnit: string;
}

function generateOrderId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ORD-${rand}`;
}

async function uniqueOrderId(): Promise<string> {
  const db = prisma as any;
  let id = generateOrderId();
  let attempts = 0;
  while (await db.marketing_orders.findUnique({ where: { order_id: id } })) {
    id = generateOrderId();
    if (++attempts > 20) throw new Error('Cannot generate unique order ID');
  }
  return id;
}

// ── Create PaymentIntent ────────────────────────────────────────────────────
// Amount is ALWAYS calculated server-side from the prices table.
// The frontend amount value is NEVER trusted.

export async function createPaymentIntent(farmId: string, userId: string) {
  const db = prisma as any;

  const cartItems = await db.cart_items.findMany({ where: { farm_id: farmId } });
  if (!cartItems.length) {
    const err = new Error('Cart is empty') as any;
    err.code = 'EMPTY_CART';
    err.status = 400;
    throw err;
  }

  // Calculate total server-side by looking up prices table
  let totalAmount = 0;
  const lineItems: LineItem[] = [];

  for (const item of cartItems) {
    const price = await db.prices.findFirst({
      where: { farm_id: farmId, item_name: { equals: item.item_name, mode: 'insensitive' } },
    });

    if (!price) {
      const err = new Error(`No price configured for "${item.item_name}" — set a price before checkout`) as any;
      err.code = 'PRICE_NOT_FOUND';
      err.status = 422;
      throw err;
    }

    const qty = Number(item.quantity);
    const unitPrice = Number(price.price_per_unit);
    const lineTotal = qty * unitPrice;
    totalAmount += lineTotal;
    lineItems.push({
      itemName: item.item_name,
      quantity: qty,
      unitPrice,
      lineTotal,
      quantityUnit: price.quantity_unit ?? 'kg',
    });
  }

  if (totalAmount < 0.5) {
    const err = new Error('Order total must be at least $0.50') as any;
    err.code = 'AMOUNT_TOO_SMALL';
    err.status = 422;
    throw err;
  }

  const amountInCents = Math.round(totalAmount * 100);

  // Create Stripe PaymentIntent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    metadata: { farmId, userId, itemCount: String(cartItems.length) },
  });

  // Create orders in awaiting_payment state — one per cart item
  const orders: any[] = [];
  for (const item of cartItems) {
    const line = lineItems.find(l => l.itemName.toLowerCase() === item.item_name.toLowerCase())!;
    const orderId = await uniqueOrderId();
    const order = await db.marketing_orders.create({
      data: {
        farm_id: farmId,
        order_id: orderId,
        payment_id: paymentIntent.id,
        item_name: item.item_name,
        quantity: item.quantity,
        quantity_unit: line.quantityUnit,
        amount: line.lineTotal,
        status: 'pending',
        payment_intent_id: paymentIntent.id,
        payment_status: 'awaiting_payment',
      },
    });
    orders.push(order);
  }

  // Record the payment transaction
  await db.payment_transactions.create({
    data: {
      farm_id: farmId,
      payment_intent_id: paymentIntent.id,
      order_group_id: paymentIntent.id,
      amount: totalAmount,
      currency: 'usd',
      payment_status: 'pending',
      metadata: { lineItems, userId },
    },
  });

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
    amount: totalAmount,
    amountInCents,
    currency: 'usd',
    lineItems,
    orders,
  };
}

// ── Get payment status ──────────────────────────────────────────────────────

export async function getPaymentStatus(paymentIntentId: string, farmId: string) {
  const db = prisma as any;
  const tx = await db.payment_transactions.findFirst({
    where: { payment_intent_id: paymentIntentId, farm_id: farmId },
  });
  if (!tx) return null;

  const orders = await db.marketing_orders.findMany({
    where: { payment_intent_id: paymentIntentId, farm_id: farmId },
  });

  return { transaction: tx, orders };
}

// ── Webhook event handlers ──────────────────────────────────────────────────

export async function handlePaymentSuccess(pi: any, eventId: string) {
  const db = prisma as any;

  await db.payment_transactions.updateMany({
    where: { payment_intent_id: pi.id },
    data: {
      payment_status: 'paid',
      payment_method: pi.payment_method_types?.[0] ?? 'card',
      stripe_event_id: eventId,
      updated_at: new Date(),
    },
  });

  await db.marketing_orders.updateMany({
    where: { payment_intent_id: pi.id },
    data: { payment_status: 'paid', status: 'confirmed', paid_at: new Date(), updated_at: new Date() },
  });

  // Clear cart for this farm after successful payment
  const tx = await db.payment_transactions.findFirst({ where: { payment_intent_id: pi.id } });
  if (tx?.farm_id) {
    await db.cart_items.deleteMany({ where: { farm_id: tx.farm_id } });
  }

  console.log(`[Payment] Succeeded: ${pi.id} — orders confirmed, cart cleared`);
}

export async function handlePaymentFailure(pi: any, eventId: string) {
  const db = prisma as any;

  await db.payment_transactions.updateMany({
    where: { payment_intent_id: pi.id },
    data: { payment_status: 'failed', stripe_event_id: eventId, updated_at: new Date() },
  });

  await db.marketing_orders.updateMany({
    where: { payment_intent_id: pi.id },
    data: { payment_status: 'failed', status: 'cancelled', updated_at: new Date() },
  });

  const failureMsg = pi.last_payment_error?.message ?? 'unknown reason';
  console.log(`[Payment] Failed: ${pi.id} — ${failureMsg}`);
}

export async function handlePaymentProcessing(pi: any, eventId: string) {
  const db = prisma as any;

  await db.payment_transactions.updateMany({
    where: { payment_intent_id: pi.id },
    data: { payment_status: 'processing', stripe_event_id: eventId, updated_at: new Date() },
  });

  await db.marketing_orders.updateMany({
    where: { payment_intent_id: pi.id },
    data: { payment_status: 'processing', updated_at: new Date() },
  });

  console.log(`[Payment] Processing: ${pi.id}`);
}
