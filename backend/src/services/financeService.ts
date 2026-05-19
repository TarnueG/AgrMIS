import prisma from '../lib/prisma';

const prismaAny = prisma as any;

function startOfDay(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

function normalizePaymentStatus(status?: string | null, dueDate?: string | Date | null) {
  const raw = String(status ?? '').toLowerCase();
  if (raw === 'paid') return 'paid';
  if (raw === 'partial' || raw === 'partially paid') return 'partially paid';
  if (dueDate && startOfDay(dueDate).getTime() < startOfDay().getTime()) return 'overdue';
  return 'unpaid';
}

function encodeFinanceMeta(description: string, meta: Record<string, unknown>) {
  return `${description}\n@@finance-meta:${JSON.stringify(meta)}`;
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

export async function createLinkedFinanceEntry({
  farmId,
  actorUserId,
  kind,
  amount,
  description,
  linkedModule,
  linkedRecordId,
  paymentStatus,
  paymentMethod,
  dueDate,
  customer,
  vendor,
  productService,
  category,
  sourceOrder,
  sector,
  date,
  receiptUrl,
  notes,
}: {
  farmId: string | undefined;
  actorUserId: string;
  kind: 'income' | 'expense';
  amount: number;
  description: string;
  linkedModule: string;
  linkedRecordId?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  dueDate?: string | Date | null;
  customer?: string | null;
  vendor?: string | null;
  productService?: string | null;
  category?: string | null;
  sourceOrder?: string | null;
  sector?: string | null;
  date?: string | Date | null;
  receiptUrl?: string | null;
  notes?: string | null;
}) {
  const [cashAccount, receivableAccount, payableAccount, incomeAccount, expenseAccount] = await Promise.all([
    ensureFinancialAccount(farmId, 'AST-CASH', 'Farm Operating Cash', 'asset'),
    ensureFinancialAccount(farmId, 'AST-AR', 'Accounts Receivable', 'asset'),
    ensureFinancialAccount(farmId, 'LIA-AP', 'Accounts Payable', 'liability'),
    ensureFinancialAccount(farmId, 'REV-OTHER', 'Other Operating Income', 'revenue'),
    ensureFinancialAccount(farmId, 'EXP-OTHER', 'Other Operating Expense', 'expense'),
  ]);

  const normalizedStatus = normalizePaymentStatus(paymentStatus, dueDate);
  const balanceAccount = kind === 'income'
    ? (normalizedStatus === 'paid' ? cashAccount : receivableAccount)
    : (normalizedStatus === 'paid' ? cashAccount : payableAccount);
  const pnlAccount = kind === 'income' ? incomeAccount : expenseAccount;

  const entry = await prismaAny.journal_entries.create({
    data: {
      farm_id: farmId,
      created_by: actorUserId,
      entry_date: date ? startOfDay(date) : startOfDay(),
      reference: `FIN-${Date.now().toString().slice(-8)}`,
      source_module: linkedModule,
      source_id: linkedRecordId ?? null,
      description: encodeFinanceMeta(description, {
        transactionType: kind,
        amount: toNumber(amount),
        paymentStatus: normalizedStatus,
        paymentMethod: paymentMethod ?? null,
        dueDate: dueDate ? new Date(dueDate).toISOString().slice(0, 10) : null,
        linkedModule,
        linkedRecordId: linkedRecordId ?? null,
        customer: customer ?? null,
        vendor: vendor ?? null,
        productService: productService ?? null,
        category: category ?? null,
        sourceOrder: sourceOrder ?? null,
        sector: sector ?? null,
        receiptUrl: receiptUrl ?? null,
        notes: notes ?? null,
      }),
      total_debit: amount,
      total_credit: amount,
      status: 'posted',
    },
  });

  await prismaAny.journal_entry_lines.createMany({
    data: kind === 'income'
      ? [
          { journal_entry_id: entry.id, account_id: balanceAccount.id, debit_amount: amount, credit_amount: 0, description },
          { journal_entry_id: entry.id, account_id: pnlAccount.id, debit_amount: 0, credit_amount: amount, description },
        ]
      : [
          { journal_entry_id: entry.id, account_id: pnlAccount.id, debit_amount: amount, credit_amount: 0, description },
          { journal_entry_id: entry.id, account_id: balanceAccount.id, debit_amount: 0, credit_amount: amount, description },
        ],
  });

  return entry;
}
