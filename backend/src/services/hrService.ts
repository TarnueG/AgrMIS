import prisma from '../lib/prisma';
import { createLinkedFinanceEntry } from './financeService';
import { recordAuditEvent } from './auditService';

const prismaAny = prisma as any;

function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

export async function payPayrollFlow({
  wageId,
  farmId,
  actorUserId,
  req,
}: {
  wageId: string;
  farmId: string | undefined;
  actorUserId: string;
  req?: any;
}) {
  const wage = await prismaAny.personnel_wages.findUnique({ where: { id: wageId } });
  if (!wage) throw Object.assign(new Error('Wage record not found'), { code: 'NOT_FOUND' });
  if (wage.payment_status === 'paid') throw Object.assign(new Error('Already paid'), { code: 'DUPLICATE' });

  const updated = await prismaAny.personnel_wages.update({
    where: { id: wageId },
    data: { payment_status: 'paid', paid_at: new Date(), immutable: true, updated_at: new Date() },
  });

  await createLinkedFinanceEntry({
    farmId,
    actorUserId,
    kind: 'expense',
    amount: toNumber(updated.amount),
    description: `Payroll payment: ${updated.full_name}`,
    linkedModule: 'payroll',
    linkedRecordId: updated.id,
    paymentStatus: 'paid',
    dueDate: updated.pay_period ?? new Date(),
    vendor: updated.full_name,
    category: 'payroll',
    date: new Date(),
  });

  await recordAuditEvent({
    req,
    actorUserId,
    eventType: 'payment_recorded',
    subsystem: 'human_capital',
    description: `Payroll marked paid for ${updated.full_name}`,
    recordType: 'payroll_record',
    recordId: updated.id,
    recordLabel: updated.full_name,
    metadata: { amount: toNumber(updated.amount) },
  });

  return updated;
}
