import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { clientInfo, logAuditEvent } from '../lib/audit';
import { endOfMonth, hasStatus, normalizeStatus, startOfDay, toNumber } from '../lib/summary';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
const prismaAny = prisma as any;

router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const action =
    req.method === 'GET'
      ? ('view' as const)
      : req.method === 'POST'
        ? ('create' as const)
        : req.method === 'DELETE'
          ? ('delete' as const)
          : ('edit' as const);
  return requirePermission('finance', action)(req, res, next);
});

const transactionCategorySchema = z.enum([
  'procurement',
  'payroll',
  'contractor',
  'maintenance',
  'transport',
  'utilities',
  'packaging',
  'feed',
  'fertilizer',
  'chemical',
  'other',
  'sales',
  'service',
]);

const paymentStatusSchema = z.enum(['unpaid', 'partially paid', 'paid', 'overdue']);
const paymentMethodSchema = z.enum(['cash', 'bank transfer', 'mobile money', 'credit', 'cheque', 'other']).optional();
const linkedModuleSchema = z.enum(['procurement', 'payroll', 'maintenance', 'manual', 'sales', 'marketing', 'contractor', 'distribution', 'production']);

const createIncomeSchema = z.object({
  date: z.string(),
  customer: z.string().min(1),
  sourceOrder: z.string().optional(),
  productService: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: paymentMethodSchema,
  paymentStatus: paymentStatusSchema.default('paid'),
  dueDate: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  linkedModule: linkedModuleSchema.default('manual'),
  linkedRecordId: z.string().optional().nullable(),
  recordedBy: z.string().optional(),
  receiptUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  sector: z.string().optional().nullable(),
});

const createExpenseSchema = z.object({
  date: z.string(),
  category: transactionCategorySchema,
  vendor: z.string().min(1),
  linkedModule: linkedModuleSchema.default('manual'),
  linkedRecordId: z.string().optional().nullable(),
  description: z.string().min(1),
  amount: z.number().positive(),
  paymentStatus: paymentStatusSchema.default('unpaid'),
  paymentMethod: paymentMethodSchema,
  dueDate: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  sector: z.string().optional().nullable(),
});

const updateIncomeSchema = createIncomeSchema.partial();
const updateExpenseSchema = createExpenseSchema.partial();

type LedgerRow = {
  id: string;
  transactionId: string;
  date: string | Date | null;
  customer?: string | null;
  vendor?: string | null;
  sourceOrder?: string | null;
  productService?: string | null;
  category?: string | null;
  linkedModule: string;
  linkedRecordId: string | null;
  description: string;
  amount: number;
  paymentMethod?: string | null;
  paymentStatus: 'unpaid' | 'partially paid' | 'paid' | 'overdue';
  recordedBy: string | null;
  dueDate: string | Date | null;
  paidAt: string | Date | null;
  receiptAttached: boolean;
  receiptUrl?: string | null;
  notes?: string | null;
  sector?: string | null;
  transactionType: 'income' | 'expense';
  sourceKind: string;
};

function endOfDay(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function formatMonth(value: Date) {
  return value.toLocaleString('en-US', { month: 'short' });
}

function normalizePaymentStatus(status?: string | null, dueDate?: string | Date | null): LedgerRow['paymentStatus'] {
  const raw = normalizeStatus(status);
  if (raw === 'paid') return 'paid';
  if (raw === 'partial' || raw === 'partially_paid') return 'partially paid';
  if (raw === 'overdue') return 'overdue';
  const due = dueDate ? new Date(dueDate) : null;
  if (due && startOfDay(due).getTime() < startOfDay().getTime()) return 'overdue';
  return 'unpaid';
}

function remainingAmount(amount: number, status: LedgerRow['paymentStatus']) {
  if (status === 'paid') return 0;
  if (status === 'partially paid') return Number((amount * 0.5).toFixed(2));
  return amount;
}

function collectedAmount(amount: number, status: LedgerRow['paymentStatus']) {
  if (status === 'paid') return amount;
  if (status === 'partially paid') return Number((amount * 0.5).toFixed(2));
  return 0;
}

function classifyIncomeSector(product: string, category?: string | null) {
  const text = `${product} ${category ?? ''}`.toLowerCase();
  if (text.includes('fish') || text.includes('pond') || text.includes('aquaculture')) return 'Aquaculture';
  if (text.includes('feed') || text.includes('broiler') || text.includes('livestock')) return 'Livestock';
  if (text.includes('packaged') || text.includes('finished') || text.includes('processing') || text.includes('rice')) return 'Finished Goods / Processing';
  if (text.includes('delivery') || text.includes('transport') || text.includes('logistics')) return 'Logistics / Distribution';
  return 'Crop Production';
}

function classifyExpenseSector(category: string, sourceText: string) {
  const text = `${category} ${sourceText}`.toLowerCase();
  if (text.includes('fish') || text.includes('aquaculture')) return 'Aquaculture';
  if (text.includes('feed') || text.includes('broiler') || text.includes('livestock')) return 'Livestock';
  if (text.includes('packaging') || text.includes('processing') || text.includes('cold room') || text.includes('finished')) return 'Finished Goods / Processing';
  if (text.includes('transport') || text.includes('logistics') || text.includes('delivery') || text.includes('truck')) return 'Logistics / Distribution';
  return 'Crop Production';
}

function mapProcurementCategory(text: string) {
  const value = text.toLowerCase();
  if (value.includes('feed')) return 'feed';
  if (value.includes('fertilizer')) return 'fertilizer';
  if (value.includes('chemical') || value.includes('fungicide') || value.includes('pesticide')) return 'chemical';
  if (value.includes('packaging')) return 'packaging';
  return 'procurement';
}

function encodeFinanceMeta(description: string, meta: Record<string, unknown>) {
  return `${description}\n@@finance-meta:${JSON.stringify(meta)}`;
}

function decodeFinanceMeta(description: string | null | undefined) {
  const raw = description ?? '';
  const marker = '\n@@finance-meta:';
  const index = raw.indexOf(marker);
  if (index === -1) return { description: raw, meta: {} as Record<string, unknown> };
  const clean = raw.slice(0, index);
  const payload = raw.slice(index + marker.length);
  try {
    return { description: clean, meta: JSON.parse(payload) as Record<string, unknown> };
  } catch {
    return { description: clean, meta: {} as Record<string, unknown> };
  }
}

async function ensureFinancialAccount(farmId: string | undefined, accountCode: string, name: string, type: string) {
  const existing = await prismaAny.financial_accounts.findFirst({
    where: { farm_id: farmId, account_code: accountCode },
  });
  if (existing) return existing;
  return prismaAny.financial_accounts.create({
    data: {
      farm_id: farmId,
      account_code: accountCode,
      name,
      account_type: type,
      is_active: true,
    },
  });
}

async function createManualJournalEntry(
  farmId: string | undefined,
  actorUserId: string,
  kind: 'income' | 'expense',
  amount: number,
  description: string,
  meta: Record<string, unknown>,
  date?: string | null,
) {
  const [cashAccount, receivableAccount, payableAccount, incomeAccount, expenseAccount] = await Promise.all([
    ensureFinancialAccount(farmId, 'AST-CASH', 'Farm Operating Cash', 'asset'),
    ensureFinancialAccount(farmId, 'AST-AR', 'Accounts Receivable', 'asset'),
    ensureFinancialAccount(farmId, 'LIA-AP', 'Accounts Payable', 'liability'),
    ensureFinancialAccount(farmId, 'REV-OTHER', 'Other Operating Income', 'revenue'),
    ensureFinancialAccount(farmId, 'EXP-OTHER', 'Other Operating Expense', 'expense'),
  ]);

  const paymentStatus = normalizePaymentStatus(String(meta.paymentStatus ?? 'paid'), meta.dueDate as string | undefined);
  const balanceAccount = kind === 'income'
    ? (paymentStatus === 'paid' ? cashAccount : receivableAccount)
    : (paymentStatus === 'paid' ? cashAccount : payableAccount);
  const pnlAccount = kind === 'income' ? incomeAccount : expenseAccount;

  const entry = await prismaAny.journal_entries.create({
    data: {
      farm_id: farmId,
      created_by: actorUserId,
      entry_date: date ? startOfDay(date) : startOfDay(),
      reference: `FIN-${Date.now().toString().slice(-8)}`,
      source_module: 'finance',
      description: encodeFinanceMeta(description, { ...meta, transactionType: kind }),
      total_debit: amount,
      total_credit: amount,
      status: 'posted',
    },
  });

  await prismaAny.journal_entry_lines.createMany({
    data: kind === 'income'
      ? [
          {
            journal_entry_id: entry.id,
            account_id: balanceAccount.id,
            debit_amount: amount,
            credit_amount: 0,
            description,
          },
          {
            journal_entry_id: entry.id,
            account_id: pnlAccount.id,
            debit_amount: 0,
            credit_amount: amount,
            description,
          },
        ]
      : [
          {
            journal_entry_id: entry.id,
            account_id: pnlAccount.id,
            debit_amount: amount,
            credit_amount: 0,
            description,
          },
          {
            journal_entry_id: entry.id,
            account_id: balanceAccount.id,
            debit_amount: 0,
            credit_amount: amount,
            description,
          },
        ],
  });

  return entry;
}

async function updateManualJournalEntry(
  entryId: string,
  farmId: string | undefined,
  actorUserId: string,
  payload: Record<string, unknown>,
  kind: 'income' | 'expense',
) {
  const existing = await prismaAny.journal_entries.findUnique({
    where: { id: entryId },
  });
  if (!existing || existing.source_module !== 'finance') {
    throw Object.assign(new Error('Transaction not found'), { code: 'NOT_FOUND' });
  }

  const decoded = decodeFinanceMeta(existing.description);
  const merged = { ...decoded.meta, ...payload };
  const amount = toNumber(merged.amount ?? existing.total_credit ?? existing.total_debit);
  const description = String(merged.description ?? decoded.description);

  const [cashAccount, receivableAccount, payableAccount, incomeAccount, expenseAccount] = await Promise.all([
    ensureFinancialAccount(farmId, 'AST-CASH', 'Farm Operating Cash', 'asset'),
    ensureFinancialAccount(farmId, 'AST-AR', 'Accounts Receivable', 'asset'),
    ensureFinancialAccount(farmId, 'LIA-AP', 'Accounts Payable', 'liability'),
    ensureFinancialAccount(farmId, 'REV-OTHER', 'Other Operating Income', 'revenue'),
    ensureFinancialAccount(farmId, 'EXP-OTHER', 'Other Operating Expense', 'expense'),
  ]);

  const paymentStatus = normalizePaymentStatus(String(merged.paymentStatus ?? 'paid'), merged.dueDate as string | undefined);
  const balanceAccount = kind === 'income'
    ? (paymentStatus === 'paid' ? cashAccount : receivableAccount)
    : (paymentStatus === 'paid' ? cashAccount : payableAccount);
  const pnlAccount = kind === 'income' ? incomeAccount : expenseAccount;

  await prisma.$transaction(async (tx) => {
    await (tx as any).journal_entries.update({
      where: { id: entryId },
      data: {
        created_by: actorUserId,
        entry_date: merged.date ? startOfDay(String(merged.date)) : existing.entry_date,
        description: encodeFinanceMeta(description, { ...merged, transactionType: kind }),
        total_debit: amount,
        total_credit: amount,
      },
    });
    await (tx as any).journal_entry_lines.deleteMany({ where: { journal_entry_id: entryId } });
    await (tx as any).journal_entry_lines.createMany({
      data: kind === 'income'
        ? [
            {
              journal_entry_id: entryId,
              account_id: balanceAccount.id,
              debit_amount: amount,
              credit_amount: 0,
              description,
            },
            {
              journal_entry_id: entryId,
              account_id: pnlAccount.id,
              debit_amount: 0,
              credit_amount: amount,
              description,
            },
          ]
        : [
            {
              journal_entry_id: entryId,
              account_id: pnlAccount.id,
              debit_amount: amount,
              credit_amount: 0,
              description,
            },
            {
              journal_entry_id: entryId,
              account_id: balanceAccount.id,
              debit_amount: 0,
              credit_amount: amount,
              description,
            },
          ],
    });
  });
}

export async function buildFinanceData(farmId: string | undefined) {
  const salesOrders = await prisma.sales_orders.findMany({
    where: { farm_id: farmId },
    include: {
      customers: { select: { name: true } },
      users_sales_orders_created_byTousers: { select: { full_name: true } },
      sales_order_items: { include: { stock_items: { include: { item_categories: { select: { name: true } } } } } },
    },
    orderBy: { order_date: 'desc' },
  });
  const marketingOrders = await prismaAny.marketing_orders.findMany({
    where: { farm_id: farmId },
    orderBy: { date: 'desc' },
  }).catch(() => []);
  const purchaseOrders = await prisma.purchase_orders.findMany({
    where: { farm_id: farmId, status: { not: 'cancelled' } },
    include: {
      suppliers: { select: { name: true } },
      users: { select: { full_name: true } },
    },
    orderBy: { order_date: 'desc' },
  });
  const wages = await prismaAny.personnel_wages.findMany({
    where: { farm_id: farmId },
    orderBy: { created_at: 'desc' },
  }).catch(() => []);
  const contractorPayments = await prismaAny.contractor_payments.findMany({
    where: { farm_id: farmId },
    orderBy: { created_at: 'desc' },
  }).catch(() => []);
  const maintenanceLogs = await prisma.asset_maintenance_logs.findMany({
    where: { assets: { farm_id: farmId, deleted_at: null } },
    include: { assets: { select: { name: true, category: true } }, users: { select: { full_name: true } } },
    orderBy: { maintenance_date: 'desc' },
  });
  const repairRecords = await prismaAny.repair_records.findMany({
    where: { farm_id: farmId },
    include: { assets: { select: { name: true, category: true } } },
    orderBy: { completed_date: 'desc' },
  }).catch(() => []);
  const usageLogs = await prisma.asset_usage_logs.findMany({
    where: { assets: { farm_id: farmId, deleted_at: null }, fuel_cost: { gt: 0 } as any },
    include: { assets: { select: { name: true, category: true } }, employees: { select: { full_name: true } } },
    orderBy: { start_time: 'desc' },
  });
  const manualEntries = await prismaAny.journal_entries.findMany({
    where: { farm_id: farmId, source_module: 'finance' },
    include: { users: { select: { full_name: true } }, journal_entry_lines: true },
    orderBy: { entry_date: 'desc' },
  }).catch(() => []);
  const productionBatches = await prismaAny.inventory_production_batches.findMany({
    where: { farm_id: farmId },
    orderBy: { created_at: 'desc' },
    take: 8,
  }).catch(() => []);
  const productionRequests = await prismaAny.inventory_production_requests.findMany({
    where: { farm_id: farmId },
  }).catch(() => []);
  const priceList = await prisma.prices.findMany({
    where: { farm_id: farmId },
  });

  const incomes: LedgerRow[] = salesOrders.map((order: any) => {
    const products = order.sales_order_items.map((item: any) => item.stock_items?.name ?? 'Unknown item');
    const firstCategory = order.sales_order_items[0]?.stock_items?.item_categories?.name ?? null;
    return {
      id: order.id,
      transactionId: order.order_number,
      date: order.order_date,
      customer: order.customers?.name ?? 'Walk-in customer',
      sourceOrder: order.order_number,
      productService: products.join(', '),
      linkedModule: 'sales',
      linkedRecordId: order.id,
      description: order.notes ?? `Sales order ${order.order_number}`,
      amount: toNumber(order.total_amount),
      paymentMethod: order.payment_method ?? 'other',
      paymentStatus: normalizePaymentStatus(order.payment_status, order.delivery_date ?? order.order_date),
      recordedBy: order.users_sales_orders_created_byTousers?.full_name ?? null,
      dueDate: order.delivery_date ?? addDays(new Date(order.order_date), 14),
      paidAt: order.payment_status === 'paid' ? order.updated_at : null,
      receiptAttached: false,
      notes: order.notes ?? null,
      sector: classifyIncomeSector(products.join(' '), firstCategory),
      transactionType: 'income',
      sourceKind: 'sales_order',
    };
  });

  for (const order of marketingOrders as any[]) {
    const status = ['completed', 'delivered'].includes(String(order.status).toLowerCase()) ? 'paid' : 'unpaid';
    incomes.push({
      id: order.id,
      transactionId: order.order_id,
      date: order.date,
      customer: 'Walk-in / Market sales',
      sourceOrder: order.order_id,
      productService: order.item_name,
      linkedModule: 'marketing',
      linkedRecordId: order.id,
      description: `Marketing sale for ${order.item_name}`,
      amount: toNumber(order.amount),
      paymentMethod: 'cash',
      paymentStatus: normalizePaymentStatus(status, order.date),
      recordedBy: 'Marketing module',
      dueDate: order.date,
      paidAt: status === 'paid' ? order.updated_at ?? order.date : null,
      receiptAttached: false,
      notes: null,
      sector: classifyIncomeSector(order.item_name, null),
      transactionType: 'income',
      sourceKind: 'marketing_order',
    });
  }

  const expenses: LedgerRow[] = purchaseOrders.map((order: any) => {
    const category = mapProcurementCategory(order.commodity ?? order.notes ?? 'procurement');
    return {
      id: order.id,
      transactionId: order.po_number,
      date: order.order_date,
      vendor: order.suppliers?.name ?? 'Unknown supplier',
      category,
      linkedModule: 'procurement',
      linkedRecordId: order.id,
      description: order.notes ?? `Purchase order ${order.po_number}`,
      amount: toNumber(order.total_amount),
      paymentMethod: 'bank transfer',
      paymentStatus: normalizePaymentStatus(order.payment_status, order.expected_delivery ?? order.order_date),
      recordedBy: order.users?.full_name ?? null,
      dueDate: order.expected_delivery ?? addDays(new Date(order.order_date), 14),
      paidAt: order.payment_status === 'paid' ? order.updated_at : null,
      receiptAttached: false,
      receiptUrl: null,
      notes: order.commodity ?? null,
      sector: classifyExpenseSector(category, `${order.commodity ?? ''} ${order.notes ?? ''}`),
      transactionType: 'expense',
      sourceKind: 'purchase_order',
    };
  });

  for (const wage of wages as any[]) {
    expenses.push({
      id: wage.id,
      transactionId: `PAY-${String(wage.id).slice(0, 8).toUpperCase()}`,
      date: wage.created_at,
      vendor: wage.full_name ?? 'Worker',
      category: 'payroll',
      linkedModule: 'payroll',
      linkedRecordId: wage.id,
      description: `Payroll for ${wage.pay_period}`,
      amount: toNumber(wage.amount),
      paymentMethod: 'bank transfer',
      paymentStatus: normalizePaymentStatus(wage.payment_status, addDays(new Date(wage.created_at), 7)),
      recordedBy: 'Human Capital',
      dueDate: addDays(new Date(wage.created_at), 7),
      paidAt: wage.paid_at,
      receiptAttached: false,
      notes: wage.pay_period,
      sector: wage.sector ? classifyExpenseSector('payroll', wage.sector) : 'Crop Production',
      transactionType: 'expense',
      sourceKind: 'payroll',
    });
  }

  for (const payment of contractorPayments as any[]) {
    expenses.push({
      id: payment.id,
      transactionId: `CTR-${String(payment.id).slice(0, 8).toUpperCase()}`,
      date: payment.created_at,
      vendor: payment.contractor_name,
      category: 'contractor',
      linkedModule: 'contractor',
      linkedRecordId: payment.id,
      description: payment.contract_type ?? 'Contractor service',
      amount: toNumber(payment.amount),
      paymentMethod: 'bank transfer',
      paymentStatus: normalizePaymentStatus(payment.payment_status, payment.end_date ?? payment.created_at),
      recordedBy: 'Human Capital',
      dueDate: payment.end_date ?? addDays(new Date(payment.created_at), 10),
      paidAt: payment.paid_at,
      receiptAttached: false,
      notes: payment.contract_type ?? null,
      sector: payment.sector ? classifyExpenseSector('contractor', payment.sector) : 'Crop Production',
      transactionType: 'expense',
      sourceKind: 'contractor_payment',
    });
  }

  for (const log of maintenanceLogs as any[]) {
    expenses.push({
      id: log.id,
      transactionId: `MNT-${String(log.id).slice(0, 8).toUpperCase()}`,
      date: log.maintenance_date,
      vendor: log.service_provider ?? log.users?.full_name ?? 'Workshop',
      category: 'maintenance',
      linkedModule: 'maintenance',
      linkedRecordId: log.id,
      description: `${log.assets?.name ?? 'Asset'}: ${log.description}`,
      amount: toNumber(log.cost),
      paymentMethod: 'other',
      paymentStatus: 'paid',
      recordedBy: log.users?.full_name ?? null,
      dueDate: log.maintenance_date,
      paidAt: log.maintenance_date,
      receiptAttached: !!log.service_provider,
      receiptUrl: null,
      notes: log.outcome ?? null,
      sector: classifyExpenseSector('maintenance', `${log.assets?.category ?? ''} ${log.assets?.name ?? ''}`),
      transactionType: 'expense',
      sourceKind: 'maintenance_log',
    });
  }

  for (const repair of repairRecords as any[]) {
    expenses.push({
      id: repair.id,
      transactionId: `REP-${String(repair.id).slice(0, 8).toUpperCase()}`,
      date: repair.completed_date,
      vendor: repair.completed_by ?? 'Workshop',
      category: 'maintenance',
      linkedModule: 'maintenance',
      linkedRecordId: repair.id,
      description: `${repair.assets?.name ?? 'Asset'}: ${repair.issue}`,
      amount: toNumber(repair.cost),
      paymentMethod: 'other',
      paymentStatus: 'paid',
      recordedBy: repair.completed_by ?? null,
      dueDate: repair.completed_date,
      paidAt: repair.completed_date,
      receiptAttached: Array.isArray(repair.parts_used) && repair.parts_used.length > 0,
      receiptUrl: null,
      notes: repair.notes ?? null,
      sector: classifyExpenseSector('maintenance', `${repair.assets?.category ?? ''} ${repair.assets?.name ?? ''}`),
      transactionType: 'expense',
      sourceKind: 'repair_record',
    });
  }

  for (const usage of usageLogs as any[]) {
    expenses.push({
      id: usage.id,
      transactionId: `FUEL-${String(usage.id).slice(0, 8).toUpperCase()}`,
      date: usage.start_time,
      vendor: usage.employees?.full_name ?? 'Field team',
      category: usage.sector && String(usage.sector).toLowerCase().includes('logistics') ? 'transport' : 'maintenance',
      linkedModule: 'distribution',
      linkedRecordId: usage.id,
      description: `${usage.assets?.name ?? 'Equipment'} fuel and operating cost`,
      amount: toNumber(usage.fuel_cost),
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      recordedBy: usage.employees?.full_name ?? null,
      dueDate: usage.start_time,
      paidAt: usage.end_time ?? usage.start_time,
      receiptAttached: false,
      receiptUrl: null,
      notes: usage.activity ?? usage.notes ?? null,
      sector: classifyExpenseSector('transport', `${usage.sector ?? ''} ${usage.assets?.name ?? ''}`),
      transactionType: 'expense',
      sourceKind: 'usage_log',
    });
  }

  for (const entry of manualEntries as any[]) {
    const decoded = decodeFinanceMeta(entry.description);
    const meta = decoded.meta;
    const kind = String(meta.transactionType ?? '').toLowerCase() === 'income' ? 'income' : 'expense';
    const amount = kind === 'income' ? toNumber(entry.total_credit) : toNumber(entry.total_debit);
    const row: LedgerRow = {
      id: entry.id,
      transactionId: entry.reference ?? `FIN-${String(entry.id).slice(0, 8).toUpperCase()}`,
      date: entry.entry_date,
      customer: kind === 'income' ? String(meta.customer ?? 'Manual customer') : undefined,
      vendor: kind === 'expense' ? String(meta.vendor ?? 'Manual vendor') : undefined,
      sourceOrder: meta.sourceOrder ? String(meta.sourceOrder) : null,
      productService: meta.productService ? String(meta.productService) : null,
      category: meta.category ? String(meta.category) : 'other',
      linkedModule: String(meta.linkedModule ?? 'manual'),
      linkedRecordId: meta.linkedRecordId ? String(meta.linkedRecordId) : null,
      description: decoded.description,
      amount,
      paymentMethod: meta.paymentMethod ? String(meta.paymentMethod) : 'other',
      paymentStatus: normalizePaymentStatus(String(meta.paymentStatus ?? 'paid'), meta.dueDate as string | undefined),
      recordedBy: entry.users?.full_name ?? null,
      dueDate: (meta.dueDate as string | undefined) ?? entry.entry_date,
      paidAt: (meta.paidAt as string | undefined) ?? null,
      receiptAttached: Boolean(meta.receiptUrl),
      receiptUrl: meta.receiptUrl ? String(meta.receiptUrl) : null,
      notes: meta.notes ? String(meta.notes) : null,
      sector: meta.sector ? String(meta.sector) : (kind === 'income' ? classifyIncomeSector(String(meta.productService ?? decoded.description)) : classifyExpenseSector(String(meta.category ?? 'other'), decoded.description)),
      transactionType: kind,
      sourceKind: 'manual_finance',
    };
    if (kind === 'income') incomes.push(row);
    else expenses.push(row);
  }

  const sectorLabels = ['Crop Production', 'Livestock', 'Aquaculture', 'Finished Goods / Processing', 'Logistics / Distribution'];
  const profitability = sectorLabels.map((sector) => {
    const revenue = incomes.filter((row) => row.sector === sector).reduce((sum, row) => sum + row.amount, 0);
    const cost = expenses.filter((row) => row.sector === sector).reduce((sum, row) => sum + row.amount, 0);
    const profit = revenue - cost;
    return {
      sector,
      revenue: Number(revenue.toFixed(2)),
      cost: Number(cost.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      margin: revenue > 0 ? Number(((profit / revenue) * 100).toFixed(2)) : 0,
    };
  });

  const today = startOfDay();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = endOfMonth(today);
  const summary = {
    grossRevenue: Number(incomes.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
    totalExpenses: Number(expenses.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
    cashCollected: Number(incomes.reduce((sum, row) => sum + collectedAmount(row.amount, row.paymentStatus), 0).toFixed(2)),
    receivables: Number(incomes.reduce((sum, row) => sum + remainingAmount(row.amount, row.paymentStatus), 0).toFixed(2)),
    payables: Number(expenses.reduce((sum, row) => sum + remainingAmount(row.amount, row.paymentStatus), 0).toFixed(2)),
    payrollDue: Number(expenses.filter((row) => row.category === 'payroll').reduce((sum, row) => sum + remainingAmount(row.amount, row.paymentStatus), 0).toFixed(2)),
    procurementCosts: Number(expenses.filter((row) => row.linkedModule === 'procurement').reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
    maintenanceCosts: Number(expenses.filter((row) => row.category === 'maintenance').reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
    contractorPayments: Number(expenses.filter((row) => row.category === 'contractor').reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
  };
  const netProfit = Number((summary.grossRevenue - summary.totalExpenses).toFixed(2));
  const profitMargin = summary.grossRevenue > 0 ? Number(((netProfit / summary.grossRevenue) * 100).toFixed(2)) : 0;

  const receivables = incomes
    .filter((row) => row.paymentStatus !== 'paid')
    .map((row) => ({
      id: row.id,
      customer: row.customer ?? 'Customer',
      order: row.sourceOrder ?? row.transactionId,
      dueAmount: remainingAmount(row.amount, row.paymentStatus),
      dueDate: row.dueDate,
      status: row.paymentStatus,
    }))
    .sort((a, b) => new Date(String(a.dueDate)).getTime() - new Date(String(b.dueDate)).getTime());

  const payables = expenses
    .filter((row) => row.paymentStatus !== 'paid')
    .map((row) => ({
      id: row.id,
      vendor: row.vendor ?? 'Vendor',
      linkedRecord: row.transactionId,
      dueAmount: remainingAmount(row.amount, row.paymentStatus),
      dueDate: row.dueDate,
      status: row.paymentStatus,
    }))
    .sort((a, b) => new Date(String(a.dueDate)).getTime() - new Date(String(b.dueDate)).getTime());

  const cashFlow = Array.from({ length: 6 }).map((_, index) => {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
    const from = startOfDay(monthDate);
    const to = endOfDay(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
    const income = incomes
      .filter((row) => row.date && new Date(row.date) >= from && new Date(row.date) <= to)
      .reduce((sum, row) => sum + row.amount, 0);
    const expense = expenses
      .filter((row) => row.date && new Date(row.date) >= from && new Date(row.date) <= to)
      .reduce((sum, row) => sum + row.amount, 0);
    return {
      month: formatMonth(monthDate),
      income: Number(income.toFixed(2)),
      expenses: Number(expense.toFixed(2)),
      netProfit: Number((income - expense).toFixed(2)),
    };
  });

  const priceByName = new Map(priceList.map((row) => [row.item_name, toNumber(row.price_per_unit)]));
  const requestById = new Map((productionRequests as any[]).map((row) => [row.id, row]));
  const costOfProduction = (productionBatches as any[]).slice(0, 6).map((batch) => {
    const req = requestById.get(batch.request_id);
    const productName = req?.product_name ?? batch.batch_number ?? 'Production batch';
    const qty = Math.max(toNumber(batch.produced_quantity || batch.quantity || batch.planned_quantity || 0), 1);
    const inputCost = Number((qty * 3.2).toFixed(2));
    const laborCost = Number((qty * 0.9).toFixed(2));
    const equipmentCost = Number((qty * 0.4).toFixed(2));
    const packagingCost = Number((qty * (String(productName).toLowerCase().includes('pack') ? 0.6 : 0.25)).toFixed(2));
    const totalCost = Number((inputCost + laborCost + equipmentCost + packagingCost).toFixed(2));
    const benchmarkPrice = priceByName.get(productName) ?? (String(productName).toLowerCase().includes('rice') ? 7 : 5);
    const revenue = Number((qty * benchmarkPrice).toFixed(2));
    const margin = revenue > 0 ? Number((((revenue - totalCost) / revenue) * 100).toFixed(2)) : 0;
    return {
      id: batch.id,
      productBatch: batch.batch_number ?? productName,
      productName,
      inputCost,
      laborCost,
      equipmentCost,
      packagingCost,
      totalCost,
      revenue,
      estimatedMargin: margin,
    };
  });

  return {
    summary: {
      ...summary,
      totalIncome: summary.grossRevenue,
      totalRevenue: summary.grossRevenue,
      totalExpense: summary.totalExpenses,
      totalExpenses: summary.totalExpenses,
      incomeThisMonth: Number(incomes.filter((row) => row.date && new Date(row.date) >= monthStart && new Date(row.date) <= monthEnd).reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
      expensesThisMonth: Number(expenses.filter((row) => row.date && new Date(row.date) >= monthStart && new Date(row.date) <= monthEnd).reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
      netProfit,
      profitMargin,
    },
    cashFlow,
    profitability,
    incomes: incomes.sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime()),
    expenses: expenses.sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime()),
    receivables,
    payables,
    costOfProduction,
  };
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return 'No data\n';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

router.get('/summary', async (req, res) => {
  try {
    const data = await buildFinanceData(req.user!.farmId ?? undefined);
    res.json(data.summary);
  } catch {
    res.status(500).json({ error: 'Failed to fetch finance summary', code: 'DB_ERROR' });
  }
});

router.get('/cash-flow', async (req, res) => {
  try {
    const data = await buildFinanceData(req.user!.farmId ?? undefined);
    res.json(data.cashFlow);
  } catch {
    res.status(500).json({ error: 'Failed to fetch cash flow', code: 'DB_ERROR' });
  }
});

router.get('/profitability', async (req, res) => {
  try {
    const data = await buildFinanceData(req.user!.farmId ?? undefined);
    res.json(data.profitability);
  } catch {
    res.status(500).json({ error: 'Failed to fetch profitability', code: 'DB_ERROR' });
  }
});

router.get('/income', async (req, res) => {
  try {
    const data = await buildFinanceData(req.user!.farmId ?? undefined);
    res.json(data.incomes);
  } catch {
    res.status(500).json({ error: 'Failed to fetch income ledger', code: 'DB_ERROR' });
  }
});

router.post('/income', async (req, res) => {
  const parsed = createIncomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  try {
    const data = parsed.data;
    const entry = await createManualJournalEntry(
      req.user!.farmId ?? undefined,
      req.user!.userId,
      'income',
      data.amount,
      `${data.productService} income`,
      {
        customer: data.customer,
        sourceOrder: data.sourceOrder ?? null,
        productService: data.productService,
        amount: data.amount,
        paymentMethod: data.paymentMethod ?? 'other',
        paymentStatus: data.paymentStatus,
        dueDate: data.dueDate ?? null,
        paidAt: data.paidAt ?? null,
        linkedModule: data.linkedModule,
        linkedRecordId: data.linkedRecordId ?? null,
        receiptUrl: data.receiptUrl ?? null,
        notes: data.notes ?? null,
        sector: data.sector ?? null,
        description: `${data.productService} income`,
      },
      data.date,
    );
    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'finance_transaction_created',
      subsystem: 'finance',
      card: 'income_ledger',
      action: 'create',
      description: `Manual income created for ${data.customer}`,
      ipAddress: ip,
      userAgent,
      metadata: { transactionId: entry.id, amount: data.amount },
    });
    res.status(201).json(entry);
  } catch {
    res.status(500).json({ error: 'Failed to create income record', code: 'DB_ERROR' });
  }
});

router.patch('/income/:id', async (req, res) => {
  const parsed = updateIncomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const data = parsed.data;
  try {
    const salesOrder = await prisma.sales_orders.findFirst({ where: { id: req.params.id, farm_id: req.user!.farmId ?? undefined } });
    if (salesOrder) {
      const updated = await prisma.sales_orders.update({
        where: { id: req.params.id },
        data: {
          ...(data.paymentStatus && { payment_status: data.paymentStatus === 'partially paid' ? 'partial' : data.paymentStatus }),
          ...(data.paymentMethod !== undefined && { payment_method: data.paymentMethod ?? null }),
          ...(data.sourceOrder && { order_number: data.sourceOrder }),
          ...(data.dueDate && { delivery_date: startOfDay(data.dueDate) }),
          ...(data.notes !== undefined && { notes: data.notes }),
          updated_by: req.user!.userId,
          updated_at: new Date(),
        } as any,
      });
      return res.json(updated);
    }

    await updateManualJournalEntry(req.params.id, req.user!.farmId ?? undefined, req.user!.userId, {
      ...data,
      amount: data.amount,
      description: data.productService ? `${data.productService} income` : undefined,
    }, 'income');
    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'finance_transaction_updated',
      subsystem: 'finance',
      card: 'income_ledger',
      action: 'edit',
      description: `Income transaction ${req.params.id} updated`,
      ipAddress: ip,
      userAgent,
      metadata: { transactionId: req.params.id },
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Income record not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update income record', code: 'DB_ERROR' });
  }
});

router.get('/expenses', async (req, res) => {
  try {
    const data = await buildFinanceData(req.user!.farmId ?? undefined);
    res.json(data.expenses);
  } catch {
    res.status(500).json({ error: 'Failed to fetch expense ledger', code: 'DB_ERROR' });
  }
});

router.post('/expenses', async (req, res) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  try {
    const data = parsed.data;
    const entry = await createManualJournalEntry(
      req.user!.farmId ?? undefined,
      req.user!.userId,
      'expense',
      data.amount,
      data.description,
      {
        vendor: data.vendor,
        category: data.category,
        linkedModule: data.linkedModule,
        linkedRecordId: data.linkedRecordId ?? null,
        amount: data.amount,
        paymentMethod: data.paymentMethod ?? 'other',
        paymentStatus: data.paymentStatus,
        dueDate: data.dueDate ?? null,
        paidAt: data.paidAt ?? null,
        receiptUrl: data.receiptUrl ?? null,
        notes: data.notes ?? null,
        sector: data.sector ?? null,
        description: data.description,
      },
      data.date,
    );
    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'finance_transaction_created',
      subsystem: 'finance',
      card: 'expense_ledger',
      action: 'create',
      description: `Manual expense created for ${data.vendor}`,
      ipAddress: ip,
      userAgent,
      metadata: { transactionId: entry.id, amount: data.amount, category: data.category },
    });
    res.status(201).json(entry);
  } catch {
    res.status(500).json({ error: 'Failed to create expense record', code: 'DB_ERROR' });
  }
});

router.patch('/expenses/:id', async (req, res) => {
  const parsed = updateExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const data = parsed.data;
  try {
    const purchaseOrder = await prisma.purchase_orders.findFirst({ where: { id: req.params.id, farm_id: req.user!.farmId ?? undefined } });
    if (purchaseOrder) {
      const updated = await prisma.purchase_orders.update({
        where: { id: req.params.id },
        data: {
          ...(data.paymentStatus && { payment_status: data.paymentStatus === 'partially paid' ? 'partial' : data.paymentStatus }),
          ...(data.dueDate && { expected_delivery: startOfDay(data.dueDate) }),
          ...(data.notes !== undefined && { notes: data.notes }),
          updated_at: new Date(),
        } as any,
      });
      return res.json(updated);
    }

    const wage = await prismaAny.personnel_wages.findUnique({ where: { id: req.params.id } }).catch(() => null);
    if (wage && data.paymentStatus === 'paid') {
      const updated = await prismaAny.personnel_wages.update({
        where: { id: req.params.id },
        data: { payment_status: 'paid', paid_at: new Date(), updated_at: new Date() },
      });
      return res.json(updated);
    }

    const contractor = await prismaAny.contractor_payments.findUnique({ where: { id: req.params.id } }).catch(() => null);
    if (contractor && data.paymentStatus === 'paid') {
      const updated = await prismaAny.contractor_payments.update({
        where: { id: req.params.id },
        data: { payment_status: 'paid', paid_at: new Date() },
      });
      return res.json(updated);
    }

    await updateManualJournalEntry(req.params.id, req.user!.farmId ?? undefined, req.user!.userId, {
      ...data,
      amount: data.amount,
      description: data.description,
    }, 'expense');
    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'finance_transaction_updated',
      subsystem: 'finance',
      card: 'expense_ledger',
      action: 'edit',
      description: `Expense transaction ${req.params.id} updated`,
      ipAddress: ip,
      userAgent,
      metadata: { transactionId: req.params.id },
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Expense record not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update expense record', code: 'DB_ERROR' });
  }
});

router.get('/payables', async (req, res) => {
  try {
    const data = await buildFinanceData(req.user!.farmId ?? undefined);
    res.json(data.payables);
  } catch {
    res.status(500).json({ error: 'Failed to fetch payables', code: 'DB_ERROR' });
  }
});

router.get('/receivables', async (req, res) => {
  try {
    const data = await buildFinanceData(req.user!.farmId ?? undefined);
    res.json(data.receivables);
  } catch {
    res.status(500).json({ error: 'Failed to fetch receivables', code: 'DB_ERROR' });
  }
});

router.get('/cost-of-production', async (req, res) => {
  try {
    const data = await buildFinanceData(req.user!.farmId ?? undefined);
    res.json(data.costOfProduction);
  } catch {
    res.status(500).json({ error: 'Failed to fetch cost of production', code: 'DB_ERROR' });
  }
});

router.get('/export/:type', async (req, res) => {
  try {
    const data = await buildFinanceData(req.user!.farmId ?? undefined);
    const type = req.params.type;
    const payload =
      type === 'income-statement'
        ? [
            { metric: 'Gross Revenue', value: data.summary.grossRevenue },
            { metric: 'Total Expenses', value: data.summary.totalExpenses },
            { metric: 'Net Profit', value: data.summary.netProfit },
            { metric: 'Profit Margin %', value: data.summary.profitMargin },
          ]
        : type === 'expense-report'
          ? data.expenses
          : type === 'payroll-summary'
            ? data.expenses.filter((row) => row.category === 'payroll')
            : type === 'procurement-cost'
              ? data.expenses.filter((row) => row.linkedModule === 'procurement')
              : type === 'profitability-summary'
                ? data.profitability
                : null;

    if (!payload) return res.status(404).json({ error: 'Unknown export type', code: 'NOT_FOUND' });

    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'finance_exported',
      subsystem: 'finance',
      card: 'financial_reports',
      action: 'export',
      description: `Exported finance report ${type}`,
      ipAddress: ip,
      userAgent,
      metadata: { type },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}.csv"`);
    res.send(toCsv(payload as Record<string, unknown>[]));
  } catch {
    res.status(500).json({ error: 'Failed to export finance report', code: 'DB_ERROR' });
  }
});

export default router;
