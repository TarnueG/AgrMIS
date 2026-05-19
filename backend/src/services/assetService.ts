import prisma from '../lib/prisma';
import { createLinkedFinanceEntry } from './financeService';
import { recordAuditEvent } from './auditService';

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

export async function completeMaintenanceScheduleFlow({
  scheduleId,
  data,
  actorUserId,
  farmId,
  req,
}: {
  scheduleId: string;
  data: any;
  actorUserId: string;
  farmId: string | undefined;
  req?: any;
}) {
  const completedAt = data.completedDate ? new Date(data.completedDate) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const schedule = await (tx as any).asset_maintenance_schedules.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw Object.assign(new Error('Schedule not found'), { code: 'NOT_FOUND' });
    const asset = await tx.assets.findUnique({ where: { id: schedule.asset_id } });
    if (!asset) throw Object.assign(new Error('Asset not found'), { code: 'ASSET_NOT_FOUND' });

    const log = await tx.asset_maintenance_logs.create({
      data: {
        asset_id: schedule.asset_id,
        performed_by: actorUserId,
        maintenance_type: 'scheduled',
        description: schedule.service_type,
        cost: data.actualCost ?? schedule.estimated_cost ?? null,
        service_provider: data.serviceProvider ?? schedule.technician_name ?? null,
        maintenance_date: startOfDay(completedAt),
        next_service_date: data.nextServiceDate ? startOfDay(data.nextServiceDate) : null,
        downtime_hours: data.downtimeHours ?? null,
        outcome: data.outcome ?? schedule.notes ?? null,
      },
    });

    await (tx as any).asset_maintenance_schedules.update({
      where: { id: schedule.id },
      data: { status: 'completed', completed_at: completedAt, updated_at: new Date() },
    });

    const updatedAsset = await tx.assets.update({
      where: { id: schedule.asset_id },
      data: {
        last_service_date: startOfDay(completedAt),
        next_service_date: data.nextServiceDate ? startOfDay(data.nextServiceDate) : null,
        condition: data.condition ?? asset.condition,
        status: 'operational',
        updated_at: new Date(),
      },
    });

    return { schedule, asset, updatedAsset, log };
  });

  const cost = toNumber(data.actualCost ?? result.log.cost);
  if (cost > 0) {
    await createLinkedFinanceEntry({
      farmId,
      actorUserId,
      kind: 'expense',
      amount: cost,
      description: `Maintenance completed for ${result.asset.name}`,
      linkedModule: 'maintenance',
      linkedRecordId: result.log.id,
      paymentStatus: 'paid',
      vendor: data.serviceProvider ?? 'Maintenance service',
      category: 'maintenance',
      date: completedAt,
    });
  }

  await recordAuditEvent({
    req,
    actorUserId,
    eventType: 'status_change',
    subsystem: 'machinery',
    description: `Maintenance completed for ${result.asset.name}`,
    recordType: 'asset',
    recordId: result.asset.id,
    recordLabel: result.asset.name,
    beforeValue: { status: result.asset.status, nextServiceDate: result.asset.next_service_date },
    afterValue: {
      status: result.updatedAsset.status,
      nextServiceDate: result.updatedAsset.next_service_date,
      financeAmount: cost,
    },
  });

  return result.log;
}
