import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { logAuditEvent, clientInfo } from '../lib/audit';

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
    let materialized: { type: string; name: string } | null = null;

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

      // Asset materialization (spec 2.1): a Land Parcel / Machinery asset becomes a
      // real record only now that its originating procurement order is Paid.
      if (po.source_request_id && po.source_request_type === 'parcel') {
        const pr = await tx.parcel_requests.findUnique({ where: { id: po.source_request_id } });
        if (pr && pr.status !== 'fulfilled') {
          await tx.land_parcels.create({ data: { farm_id: farmId, name: pr.name, size_hectares: pr.size_hectares ?? 0, soil_type: pr.soil_type ?? 'loamy', location: pr.location ?? null, notes: pr.description, status: 'active', purchase_cost: po.total_amount } });
          await tx.parcel_requests.update({ where: { id: pr.id }, data: { status: 'fulfilled', updated_at: new Date() } });
          materialized = { type: 'parcel', name: pr.name };
        }
      } else if (po.source_request_id && po.source_request_type === 'equipment') {
        const er = await tx.equipment_requests.findUnique({ where: { id: po.source_request_id } });
        if (er && er.status !== 'fulfilled') {
          await tx.assets.create({ data: { farm_id: farmId, name: er.name, asset_type: er.asset_type, model: er.model ?? null, purchase_cost: po.total_amount, current_value: po.total_amount, status: 'operational', notes: er.notes } });
          await tx.equipment_requests.update({ where: { id: er.id }, data: { status: 'fulfilled', added_to_inventory: true, updated_at: new Date() } });
          materialized = { type: 'equipment', name: er.name };
        }
      } else if (po.source_request_id && po.source_request_type === 'supply') {
        // Chemicals & Feed (spec 4.2): paid request becomes a stock item and drops off Upcoming Items.
        const sr = await tx.inventory_procurement_requests.findUnique({ where: { id: po.source_request_id } });
        if (sr && !sr.in_stock) {
          const CATEGORY_NAME_MAP: Record<string, string> = { pesticides_chemicals: 'pesticides & chemicals', fertilizers: 'fertilizers', livestock_feed: 'livestock feed', aquaculture_feed: 'aquaculture feed' };
          const catName = CATEGORY_NAME_MAP[sr.category] ?? 'general supplies';
          let category = await tx.item_categories.findFirst({ where: { name: { equals: catName, mode: 'insensitive' }, deleted_at: null } });
          if (!category) category = await tx.item_categories.create({ data: { name: catName, type: 'supply' } });
          const stockItem = await tx.stock_items.create({ data: { name: sr.item_name, farm_id: farmId, category_id: category.id, unit_of_measure: sr.quantity_unit ?? 'kg', current_quantity: Number(sr.quantity), reorder_threshold: 10 } });
          await tx.inventory_procurement_requests.update({ where: { id: sr.id }, data: { in_stock: true, status: 'received', stock_item_id: stockItem.id, updated_at: new Date() } });
          materialized = { type: 'supply', name: sr.item_name };
        }
      }

      const newNetProfitCents = netProfitCents - amountCents;
      payload = {
        message: 'Payment processed successfully',
        transactionRef,
        paymentMethod,
        amount: amountCents / 100,
        netProfit: newNetProfitCents / 100,
      };
    });

    if (materialized) {
      const { ip, userAgent } = clientInfo(req);
      await logAuditEvent({
        actorUserId: req.user!.userId,
        eventType: 'asset_materialized',
        subsystem: materialized.type === 'parcel' ? 'land_parcels' : materialized.type === 'supply' ? 'inventory' : 'machinery',
        description: `${materialized.type === 'parcel' ? 'Land parcel' : materialized.type === 'supply' ? 'Supply item' : 'Machinery asset'} "${materialized.name}" materialized on PO payment`,
        metadata: { poId, ...materialized },
        ipAddress: ip,
        userAgent,
      });
    }

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

// ─── Finance Analytics ───────────────────────────────────────────────────────

const FMONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
type FB = { label: string; start: Date; end: Date };
function finBuckets(period: string): FB[] {
  const now = new Date();
  if (period === 'weekly') {
    return Array.from({ length: 12 }, (_, i) => { const start = new Date(now); start.setDate(now.getDate() - (11 - i) * 7); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999); return { label: `W${start.getDate()}/${start.getMonth() + 1}`, start, end }; });
  }
  if (period === 'yearly') {
    return Array.from({ length: 5 }, (_, i) => { const y = now.getFullYear() - (4 - i); return { label: String(y), start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) }; });
  }
  return Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1); return { label: FMONTHS[d.getMonth()], start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }; });
}
const inFB = (d: Date, b: FB) => d >= b.start && d <= b.end;
const fDone = (s?: string | null) => s === 'completed' || s === 'delivered';
const maskCust = (pid?: string | null) => pid ? `Customer ••${String(pid).slice(-4).toUpperCase()}` : 'Guest';

router.get('/analytics/overview', requirePermission('finance', 'view'), async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const period = ['weekly', 'monthly', 'yearly'].includes(String(req.query.period)) ? String(req.query.period) : 'monthly';
  try {
    const [orders, pos, wages, contractors] = await Promise.all([
      (prisma as any).marketing_orders.findMany({ where: { farm_id: farmId } }),
      (prisma as any).purchase_orders.findMany({ where: { farm_id: farmId } }),
      (prisma as any).personnel_wages.findMany({ where: { farm_id: farmId } }),
      (prisma as any).contractor_payments.findMany({ where: { farm_id: farmId } }),
    ]);

    const completed = orders.filter((o: any) => fDone(o.status));
    const paidWages = wages.filter((w: any) => w.payment_status === 'paid');
    const paidContractors = contractors.filter((c: any) => c.payment_status === 'paid');
    const paidPOs = pos.filter((p: any) => p.payment_status === 'paid');
    const revenue = completed.reduce((s: number, o: any) => s + Number(o.amount), 0);
    const wagesSum = paidWages.reduce((s: number, w: any) => s + Number(w.amount), 0);
    const contrSum = paidContractors.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const poSum = paidPOs.reduce((s: number, p: any) => s + Number(p.total_amount), 0);
    const expenses = wagesSum + contrSum + poSum;
    const netProfit = revenue - expenses;
    const netMargin = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

    const oDate = (o: any) => new Date(o.date ?? o.created_at);
    const pDate = (p: any) => new Date(p.paid_at ?? p.created_at);
    const now = Date.now();
    const within = (t: number, from: number, to: number) => t >= now - from * 86400000 && t < now - to * 86400000;
    const deltaOf = (arr: any[], amt: (x: any) => number, date: (x: any) => Date) => { const cur = arr.filter(x => within(date(x).getTime(), 30, 0)).reduce((s, x) => s + amt(x), 0); const prev = arr.filter(x => within(date(x).getTime(), 60, 30)).reduce((s, x) => s + amt(x), 0); return prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0); };

    const spB = finBuckets('weekly').slice(-6);
    const sparkRev = spB.map(b => completed.filter((o: any) => inFB(oDate(o), b)).reduce((s: number, o: any) => s + Number(o.amount), 0));
    const expRows = [...paidWages.map((w: any) => ({ amt: Number(w.amount), d: pDate(w) })), ...paidContractors.map((c: any) => ({ amt: Number(c.amount), d: pDate(c) })), ...paidPOs.map((p: any) => ({ amt: Number(p.total_amount), d: pDate(p) }))];
    const sparkExp = spB.map(b => expRows.filter(r => inFB(r.d, b)).reduce((s, r) => s + r.amt, 0));
    const sparkProfit = spB.map((_, i) => sparkRev[i] - sparkExp[i]);

    const kpis = {
      revenue, expenses, netProfit, netMargin, currency: 'USD',
      deltas: { revenue: deltaOf(completed, (o) => Number(o.amount), oDate), expenses: deltaOf(expRows, (r) => r.amt, (r) => r.d), profit: deltaOf(completed, (o) => Number(o.amount), oDate) - deltaOf(expRows, (r) => r.amt, (r) => r.d) },
      sparklines: { revenue: sparkRev, expenses: sparkExp, profit: sparkProfit },
    };

    const bk = finBuckets(period);
    const revenueExpenses = bk.map(b => ({ label: b.label, revenue: completed.filter((o: any) => inFB(oDate(o), b)).reduce((s: number, o: any) => s + Number(o.amount), 0), expenses: expRows.filter(r => inFB(r.d, b)).reduce((s, r) => s + r.amt, 0) }));
    const profitTrend = revenueExpenses.map(r => ({ label: r.label, value: r.revenue - r.expenses }));

    // Invoices (marketing orders)
    const paidInv = orders.filter((o: any) => o.payment_status === 'paid');
    const pendingInv = orders.filter((o: any) => o.payment_status === 'pending' || o.payment_status === 'awaiting_payment');
    const sumAmt = (a: any[]) => a.reduce((s, o) => s + Number(o.amount), 0);
    const invoiceSummary = {
      paid: { amount: sumAmt(paidInv), count: paidInv.length, deltaPct: deltaOf(paidInv, (o) => Number(o.amount), oDate) },
      sold: { amount: revenue, count: completed.length, deltaPct: deltaOf(completed, (o) => Number(o.amount), oDate) },
      pending: { amount: sumAmt(pendingInv), count: pendingInv.length, deltaPct: deltaOf(pendingInv, (o) => Number(o.amount), oDate) },
      total: orders.length,
    };
    const invoices = [...orders].sort((a: any, b: any) => oDate(b).getTime() - oDate(a).getTime()).slice(0, 8).map((o: any) => ({ id: o.id, number: o.order_id, date: o.date ?? o.created_at, customer: maskCust(o.payment_id), amount: Number(o.amount), status: o.payment_status === 'paid' ? 'Paid' : fDone(o.status) ? 'Sold' : 'Pending', balance: o.payment_status === 'paid' ? 0 : Number(o.amount) }));

    // Transactions feed
    const txns = [
      ...completed.map((o: any) => ({ id: `o${o.id}`, type: 'Sale', label: o.item_name, timestamp: o.date ?? o.created_at, amount: Number(o.amount), direction: 'in', status: 'completed' })),
      ...paidPOs.map((p: any) => ({ id: `p${p.id}`, type: 'Purchase', label: p.commodity ?? p.po_number, timestamp: p.paid_at ?? p.created_at, amount: Number(p.total_amount), direction: 'out', status: 'paid' })),
      ...paidWages.map((w: any) => ({ id: `w${w.id}`, type: 'Wage', label: w.full_name ?? 'Wage', timestamp: w.paid_at ?? w.created_at, amount: Number(w.amount), direction: 'out', status: 'paid' })),
      ...paidContractors.map((c: any) => ({ id: `c${c.id}`, type: 'Contractor', label: c.contractor_name, timestamp: c.paid_at ?? c.created_at, amount: Number(c.amount), direction: 'out', status: 'paid' })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 15);

    const costAnalysis = { total: expenses, categories: [
      { name: 'Wages', amount: wagesSum, pct: expenses > 0 ? Math.round((wagesSum / expenses) * 100) : 0, color: '#675CB0' },
      { name: 'Contractors', amount: contrSum, pct: expenses > 0 ? Math.round((contrSum / expenses) * 100) : 0, color: '#3B79A0' },
      { name: 'Purchases', amount: poSum, pct: expenses > 0 ? Math.round((poSum / expenses) * 100) : 0, color: '#BF5046' },
    ] };

    const score = Math.max(0, Math.min(100, Math.round(50 + netMargin / 2)));
    const financialHealth = { score, label: score >= 70 ? 'Healthy' : score >= 40 ? 'Fair' : 'At risk', liquidity: netProfit, runwayMonths: expenses > 0 && netProfit > 0 ? Math.round(netProfit / (expenses / 12)) : 0, debtRatio: revenue > 0 ? Math.round((expenses / revenue) * 100) : 0 };

    const salesSeries = bk.map(b => ({ label: b.label, sales: completed.filter((o: any) => inFB(oDate(o), b)).reduce((s: number, o: any) => s + Number(o.amount), 0) }));
    const salesOverview = { gross: revenue, units: Math.round(completed.reduce((s: number, o: any) => s + Number(o.quantity), 0)), series: salesSeries };

    const byItem: Record<string, number> = {};
    for (const o of completed) byItem[o.item_name] = (byItem[o.item_name] || 0) + Number(o.amount);
    const itemsRanked = Object.entries(byItem).sort((a, b) => b[1] - a[1]);
    const maxItem = itemsRanked[0]?.[1] || 1;
    const topItems = { items: itemsRanked.slice(0, 5).map(([name, revenue], i) => ({ id: name, name, units: Math.round(completed.filter((o: any) => o.item_name === name).reduce((s: number, o: any) => s + Number(o.quantity), 0)), revenue, pctOfMax: Math.round((revenue / maxItem) * 100) })), combined: itemsRanked.slice(0, 5).reduce((s, [, v]) => s + v, 0) };

    const byCommodity: Record<string, number> = {};
    for (const p of paidPOs) { const k = p.commodity ?? 'Other'; byCommodity[k] = (byCommodity[k] || 0) + Number(p.total_amount); }
    const commRanked = Object.entries(byCommodity).sort((a, b) => b[1] - a[1]);
    const maxComm = commRanked[0]?.[1] || 1;
    const topCommodities = { items: commRanked.slice(0, 5).map(([name, spend]) => ({ id: name, name, spend, pctOfMax: Math.round((spend / maxComm) * 100) })), combined: commRanked.slice(0, 5).reduce((s, [, v]) => s + v, 0) };

    const wageSeries = bk.map(b => paidWages.filter((w: any) => inFB(pDate(w), b)).reduce((s: number, w: any) => s + Number(w.amount), 0));
    const payrollWages = { total: wagesSum, deltaPct: deltaOf(paidWages, (w) => Number(w.amount), pDate), headcount: new Set(paidWages.map((w: any) => w.full_name)).size, series: bk.map((b, i) => ({ label: b.label, value: wageSeries[i] })) };
    const contrSeries = bk.map(b => paidContractors.filter((c: any) => inFB(pDate(c), b)).reduce((s: number, c: any) => s + Number(c.amount), 0));
    const contractorPayments = { total: contrSum, deltaPct: deltaOf(paidContractors, (c) => Number(c.amount), pDate), count: paidContractors.length, series: bk.map((b, i) => ({ label: b.label, value: contrSeries[i] })) };

    const card = paidPOs.filter((p: any) => p.finance_payment_method === 'bank').reduce((s: number, p: any) => s + Number(p.total_amount), 0);
    const mobile = paidPOs.filter((p: any) => p.finance_payment_method === 'mobile_money').reduce((s: number, p: any) => s + Number(p.total_amount), 0);
    const methTotal = card + mobile;
    const purchaseMethods = { total: methTotal, methods: [
      { key: 'card', amount: card, pct: methTotal > 0 ? Math.round((card / methTotal) * 100) : 0 },
      { key: 'mobile', amount: mobile, pct: methTotal > 0 ? Math.round((mobile / methTotal) * 100) : 0 },
    ] };

    res.json({ generatedAt: new Date().toISOString(), period, currency: 'USD', kpis, revenueExpenses, profitTrend, invoiceSummary, invoices, transactions: txns, costAnalysis, financialHealth, salesOverview, topItems, topCommodities, payrollWages, contractorPayments, purchaseMethods, spending: costAnalysis.categories });
  } catch (err) {
    console.error('[Finance/Analytics/Overview]', err);
    res.status(500).json({ error: 'Failed to fetch finance analytics', code: 'DB_ERROR' });
  }
});

router.get('/analytics/details/:metric', requirePermission('finance', 'view'), async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const metric = String(req.params.metric);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const pg = <T,>(arr: T[]) => arr.slice((page - 1) * pageSize, page * pageSize);
  const oDate = (o: any) => new Date(o.date ?? o.created_at);
  try {
    if (['revenue', 'invoices', 'sold', 'sales', 'top-items'].includes(metric)) {
      const orders = await (prisma as any).marketing_orders.findMany({ where: { farm_id: farmId }, orderBy: { date: 'desc' } });
      const status = String(req.query.status || '');
      let list = orders;
      if (status === 'paid') list = orders.filter((o: any) => o.payment_status === 'paid');
      else if (status === 'pending') list = orders.filter((o: any) => o.payment_status === 'pending' || o.payment_status === 'awaiting_payment');
      else if (status === 'sold' || metric === 'revenue' || metric === 'sales') list = orders.filter((o: any) => fDone(o.status));
      const rows = list.map((o: any) => ({ id: o.id, number: o.order_id, item: o.item_name, customer: maskCust(o.payment_id), amount: Number(o.amount), quantity: Number(o.quantity), status: o.payment_status === 'paid' ? 'Paid' : fDone(o.status) ? 'Sold' : 'Pending', date: o.date ?? o.created_at }));
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (['expenses', 'spending', 'cost-analysis'].includes(metric)) {
      const [pos, wages, contractors] = await Promise.all([
        (prisma as any).purchase_orders.findMany({ where: { farm_id: farmId, payment_status: 'paid' } }),
        (prisma as any).personnel_wages.findMany({ where: { farm_id: farmId, payment_status: 'paid' } }),
        (prisma as any).contractor_payments.findMany({ where: { farm_id: farmId, payment_status: 'paid' } }),
      ]);
      const rows = [
        ...wages.map((w: any) => ({ id: `w${w.id}`, name: w.full_name ?? 'Wage', category: 'Wages', amount: Number(w.amount), date: w.paid_at ?? w.created_at })),
        ...contractors.map((c: any) => ({ id: `c${c.id}`, name: c.contractor_name, category: 'Contractors', amount: Number(c.amount), date: c.paid_at ?? c.created_at })),
        ...pos.map((p: any) => ({ id: `p${p.id}`, name: p.commodity ?? p.po_number, category: 'Purchases', amount: Number(p.total_amount), date: p.paid_at ?? p.created_at })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (metric === 'net-profit' || metric === 'profit') {
      const orders = await (prisma as any).marketing_orders.findMany({ where: { farm_id: farmId }, orderBy: { date: 'desc' } });
      const rows = orders.filter((o: any) => fDone(o.status)).map((o: any) => ({ id: o.id, number: o.order_id, item: o.item_name, amount: Number(o.amount), date: o.date ?? o.created_at }));
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (metric === 'wages') {
      const rows = await (prisma as any).personnel_wages.findMany({ where: { farm_id: farmId }, orderBy: { created_at: 'desc' } });
      return res.json({ total: rows.length, items: pg(rows.map((w: any) => ({ id: w.id, name: w.full_name, sector: w.sector ?? '-', amount: Number(w.amount), status: w.payment_status, date: w.paid_at ?? w.created_at }))) });
    }
    if (metric === 'contractors') {
      const rows = await (prisma as any).contractor_payments.findMany({ where: { farm_id: farmId }, orderBy: { created_at: 'desc' } });
      return res.json({ total: rows.length, items: pg(rows.map((c: any) => ({ id: c.id, name: c.contractor_name, sector: c.sector ?? '-', amount: Number(c.amount), status: c.payment_status, date: c.paid_at ?? c.created_at }))) });
    }
    if (['purchases', 'commodities', 'top-commodities'].includes(metric)) {
      const pos = await (prisma as any).purchase_orders.findMany({ where: { farm_id: farmId, payment_status: 'paid' }, include: { suppliers: { select: { name: true } } }, orderBy: { paid_at: 'desc' } });
      return res.json({ total: pos.length, items: pg(pos.map((p: any) => ({ id: p.id, number: p.po_number, commodity: p.commodity ?? '-', supplier: p.suppliers?.name ?? '-', amount: Number(p.total_amount), method: p.finance_payment_method === 'mobile_money' ? 'Mobile money' : p.finance_payment_method === 'bank' ? 'Card' : '-', date: p.paid_at ?? p.created_at }))) });
    }
    if (metric === 'transactions') {
      const [orders, pos, wages, contractors] = await Promise.all([
        (prisma as any).marketing_orders.findMany({ where: { farm_id: farmId } }),
        (prisma as any).purchase_orders.findMany({ where: { farm_id: farmId, payment_status: 'paid' } }),
        (prisma as any).personnel_wages.findMany({ where: { farm_id: farmId, payment_status: 'paid' } }),
        (prisma as any).contractor_payments.findMany({ where: { farm_id: farmId, payment_status: 'paid' } }),
      ]);
      const rows = [
        ...orders.filter((o: any) => fDone(o.status)).map((o: any) => ({ id: `o${o.id}`, type: 'Sale', label: o.item_name, amount: Number(o.amount), direction: 'in', date: o.date ?? o.created_at })),
        ...pos.map((p: any) => ({ id: `p${p.id}`, type: 'Purchase', label: p.commodity ?? p.po_number, amount: Number(p.total_amount), direction: 'out', date: p.paid_at ?? p.created_at })),
        ...wages.map((w: any) => ({ id: `w${w.id}`, type: 'Wage', label: w.full_name ?? 'Wage', amount: Number(w.amount), direction: 'out', date: w.paid_at ?? w.created_at })),
        ...contractors.map((c: any) => ({ id: `c${c.id}`, type: 'Contractor', label: c.contractor_name, amount: Number(c.amount), direction: 'out', date: c.paid_at ?? c.created_at })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return res.json({ total: rows.length, items: pg(rows) });
    }
    res.status(400).json({ error: 'Unknown metric', code: 'VALIDATION_ERROR' });
  } catch (err) {
    console.error('[Finance/Analytics/Details]', err);
    res.status(500).json({ error: 'Failed to fetch details', code: 'DB_ERROR' });
  }
});

export default router;
