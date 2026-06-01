import express from 'express';
import stripe from '../lib/stripe';
import prisma from '../lib/prisma';
import {
  createPaymentIntent,
  getPaymentStatus,
  handlePaymentSuccess,
  handlePaymentFailure,
  handlePaymentProcessing,
} from '../services/paymentService';

// ── Webhook (registered at app level BEFORE express.json()) ────────────────

export async function handleStripeWebhook(req: express.Request, res: express.Response) {
  const sig = req.headers['stripe-signature'] as string;

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Idempotency — skip already-processed events
  const db = prisma as any;
  const existing = await db.payment_transactions.findFirst({
    where: { stripe_event_id: event.id },
  });
  if (existing) {
    console.log(`[Webhook] Duplicate event ${event.id} — skipping`);
    return res.json({ received: true });
  }

  const pi = event.data.object as any;

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(pi, event.id);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailure(pi, event.id);
        break;
      case 'payment_intent.processing':
        await handlePaymentProcessing(pi, event.id);
        break;
      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error(`[Webhook] Handler error for ${event.type}:`, err.message);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  res.json({ received: true });
}

// ── Auth-protected payment routes (mounted under /api/v1/marketing) ────────

const router = express.Router();

router.post('/payments/create-payment-intent', async (req: any, res) => {
  const farmId: string = req.user!.farmId;
  const userId: string = req.user!.userId ?? req.user!.id ?? '';

  try {
    const result = await createPaymentIntent(farmId, userId);
    res.json(result);
  } catch (err: any) {
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

router.get('/payments/status/:paymentIntentId', async (req: any, res) => {
  const farmId: string = req.user!.farmId;
  const { paymentIntentId } = req.params;

  try {
    const result = await getPaymentStatus(paymentIntentId, farmId);
    if (!result) return res.status(404).json({ error: 'Payment not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
