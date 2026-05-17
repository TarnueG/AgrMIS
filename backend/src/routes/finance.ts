import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);

// GET /api/v1/finance/summary
// Returns aggregated financial data. Accessible to any role with finance:view permission.
// Queries marketing_orders, personnel_wages, and contractor_payments directly so the
// accountant role doesn't need marketing or human_capital permissions on the dashboard.
router.get('/summary', requirePermission('finance', 'view'), async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const [revenueResult, wagesResult, contractorsResult, pendingCount] = await Promise.all([
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
      (prisma as any).marketing_orders.count({
        where: { farm_id: farmId, payment_status: 'pending' },
      }),
    ]);

    const totalRevenue = Number(revenueResult._sum?.amount ?? 0);
    const totalExpenses = Number(wagesResult._sum?.amount ?? 0) + Number(contractorsResult._sum?.amount ?? 0);

    return res.json({
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      pendingPayments: pendingCount,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch finance summary', code: 'DB_ERROR' });
  }
});

export default router;
