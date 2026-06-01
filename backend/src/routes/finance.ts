import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);

// ── Helper: compute net profit in cents (integer arithmetic avoids float drift) ──

async function computeNetProfitCents(farmId: string | undefined, tx?: any): Promise<number> {
  const db = (tx ?? prisma) as any;
  const [revenue, wages, contractors, paidPOs] = await Promise.all([
    db.marketing_orders.aggregate({
      _sum: { amount: true },
      where: { farm_id: farmId, status: { in: ['completed', 'delivered'] } },
    }),
    db.personnel_wages.aggregate({
      _sum: { amount: true },
      where: { farm_id: farmId, payment_status: 'paid' },
    }),
    db.contractor_payments.aggregate({
      _sum: { amount: true },
      where: { farm_id: farmId, payment_status: 'paid' },
    }),
    db.purchase_orders.aggregate({
      _sum: { total_amount: true },
      where: { farm_id: farmId, payment_status: 'paid' },
    }),
  ]);

  const revCents  = Math.round(Number(revenue._sum?.amount       ?? 0) * 100);
  const wageCents = Math.round(Number(wages._sum?.amount         ?? 0) * 100);
  const contCents = Math.round(Number(contractors._sum?.amount   ?? 0) * 100);
  const poCents   = Math.round(Number(paidPOs._sum?.total_amount ?? 0) * 100);

  return revCents - wageCents - contCents - poCents;
}

// ── Mock transaction reference generator ──

function mockRef(method: 'bank' | 'mobile_money'): string {
  const prefix = method === 'mobile_money' ? 'MOM' : 'BNK';
  const rand   = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${prefix}-${Date.now()}-${rand}`;
}

// GET /api/v1/finance/summary
router.get('/summary', requirePermission('finance', 'view'), async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const netProfitCents = await computeNetProfitCents(farmId);
    const netProfit      = netProfitCents / 100;

    const [revenueResult, wagesResult, contractorsResult, paidPOsResult, pendingCount] = await Promise.all([
      (prisma as any).marketing_orders.aggregate({
        _sum: { amount: true },
        where: { farm_id: farmId, status: { in: ['completed', 'delivered'] } },
      }),
      (prisma as any).personnel_wages.aggregate({
        _sum: { amount: true },
        where: { farm_id: farmId, payment_status: 'paid' },
      }),
      (prisma as any).contractor_payments.aggregate({
        _sum: { amount: true },
        where: { farm_id: farmId, payment_status: 'paid' },
      }),
      (prisma as any).purchase_orders.aggregate({
        _sum: { total_amount: true },
        where: { farm_id: farmId, payment_status: 'paid' },
      }),
      (prisma as any).marketing_orders.count({
        where: { farm_id: farmId, payment_status: 'pending' },
      }),
    ]);

    const totalRevenue   = Number(revenueResult._sum?.amount           ?? 0);
    const totalExpenses  = Number(wagesResult._sum?.amount             ?? 0)
                         + Number(contractorsResult._sum?.amount       ?? 0)
                         + Number(paidPOsResult._sum?.total_amount     ?? 0);

    return res.json({
      totalRevenue,
      totalExpenses,
      netProfit,
      pendingPayments: pendingCount,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch finance summary', code: 'DB_ERROR' });
  }
});

// POST /api/v1/finance/purchase-orders/:id/pay
// Validates amount ≤ net profit then marks PO as paid (Bank or Mobile Money simulation).
// Balance read + deduction are wrapped in a single DB transaction to prevent double-spending.
const paySchema = z.object({
  paymentMethod: z.enum(['bank', 'mobile_money'], {
    errorMap: () => ({ message: 'Payment method must be bank or mobile_money' }),
  }),
});

router.post('/purchase-orders/:id/pay', requirePermission('finance', 'edit'), async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const poId   = req.params.id as string;

  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const { paymentMethod } = parsed.data;

  try {
    let payload: {
      message: string;
      transactionRef: string;
      paymentMethod: string;
      amount: number;
      netProfit: number;
    };

    await (prisma as any).$transaction(async (tx: any) => {
      // Re-fetch inside transaction so we see committed state
      const po = await tx.purchase_orders.findUnique({ where: { id: poId } });
      if (!po) {
        throw Object.assign(new Error('Purchase order not found'), { status: 404, code: 'NOT_FOUND' });
      }
      if (po.payment_status === 'paid') {
        throw Object.assign(new Error('This purchase order has already been paid'), { status: 400, code: 'DUPLICATE' });
      }

      const amountCents   = Math.round(Number(po.total_amount) * 100);
      if (!isFinite(amountCents) || amountCents <= 0) {
        throw Object.assign(new Error('Invalid payment amount'), { status: 422, code: 'INVALID_AMOUNT' });
      }

      // Compute net profit inside the transaction (reads committed rows only)
      const netProfitCents = await computeNetProfitCents(farmId, tx);

      // Core rule: reject if amount > net profit
      if (amountCents > netProfitCents) {
        throw Object.assign(new Error('Insufficient fund to process payment'), { status: 402, code: 'INSUFFICIENT_FUNDS' });
      }

      // Simulate payment gateway — generate mock reference
      const transactionRef = mockRef(paymentMethod);

      // Persist: mark PO as paid with timestamp and reference
      await tx.purchase_orders.update({
        where: { id: poId },
        data: {
          payment_status: 'paid',
          paid_at: new Date(),
          transaction_ref: transactionRef,
          finance_payment_method: paymentMethod,
          updated_at: new Date(),
        },
      });

      const newNetProfitCents = netProfitCents - amountCents;
      payload = {
        message: 'Payment processed successfully',
        transactionRef,
        paymentMethod,
        amount: amountCents / 100,
        netProfit: newNetProfitCents / 100,
      };
    });

    return res.json(payload!);
  } catch (err: any) {
    const status  = err.status  ?? 500;
    const code    = err.code    ?? 'DB_ERROR';
    const message = err.message ?? 'Failed to process payment';
    if (status === 500) {
      console.error('[Finance/Pay]', err.message);
    }
    return res.status(status).json({ error: message, code });
  }
});

export default router;
