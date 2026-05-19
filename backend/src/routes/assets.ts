import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { clientInfo, logAuditEvent } from '../lib/audit';
import { endOfMonth, hasStatus, startOfMonth, toNumber } from '../lib/summary';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { completeMaintenanceScheduleFlow } from '../services/assetService';

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
  return requirePermission('machinery', action)(req, res, next);
});

const assetStatusSchema = z.enum([
  'operational',
  'active',
  'under_maintenance',
  'decommissioned',
  'retired',
  'lost',
  'sold',
]);

const assetConditionSchema = z.enum(['excellent', 'good', 'fair', 'critical']);
const assetCategorySchema = z.enum([
  'tractor',
  'vehicle',
  'generator',
  'irrigation',
  'storage',
  'tool',
  'infrastructure',
]);

const createAssetSchema = z.object({
  assetCode: z.string().optional(),
  name: z.string().min(1),
  assetType: z.enum(['equipment', 'vehicle', 'tool', 'infrastructure', 'other']),
  category: assetCategorySchema.optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  currentValue: z.number().nonnegative().optional(),
  location: z.string().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  condition: assetConditionSchema.default('good'),
  status: assetStatusSchema.default('operational'),
  lastServiceDate: z.string().optional().nullable(),
  nextServiceDate: z.string().optional().nullable(),
  warrantyExpiryDate: z.string().optional().nullable(),
  notes: z.string().optional(),
});

const updateAssetSchema = createAssetSchema.partial();

const maintenanceSchema = z.object({
  maintenanceType: z.enum(['scheduled', 'corrective', 'emergency', 'inspection']),
  description: z.string().min(1),
  cost: z.number().nonnegative().optional(),
  serviceProvider: z.string().optional(),
  maintenanceDate: z.string().optional(),
  nextServiceDate: z.string().optional().nullable(),
  downtimeHours: z.number().min(0).optional(),
  outcome: z.string().optional(),
  condition: assetConditionSchema.optional(),
});

const createScheduleSchema = z.object({
  assetId: z.string().uuid(),
  serviceType: z.string().min(1),
  dueDate: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  technician: z.string().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  status: z.enum(['scheduled', 'due soon', 'overdue', 'completed']).optional(),
  notes: z.string().optional(),
});

const completeScheduleSchema = z.object({
  actualCost: z.number().nonnegative().optional(),
  serviceProvider: z.string().optional(),
  completedDate: z.string().optional(),
  nextServiceDate: z.string().optional().nullable(),
  downtimeHours: z.number().min(0).optional(),
  outcome: z.string().optional(),
  condition: assetConditionSchema.optional(),
});

const createWorkOrderSchema = z.object({
  assetId: z.string().uuid(),
  issueServiceType: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  requestedBy: z.string().optional().nullable(),
  assignedTechnician: z.string().optional(),
  openedDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(['open', 'assigned', 'in progress', 'waiting parts', 'completed', 'cancelled']).default('open'),
  estimatedCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const updateWorkOrderSchema = z.object({
  issueServiceType: z.string().min(1).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  requestedBy: z.string().uuid().optional().nullable(),
  assignedTechnician: z.string().optional().nullable(),
  openedDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(['open', 'assigned', 'in progress', 'waiting parts', 'completed', 'cancelled']).optional(),
  estimatedCost: z.number().nonnegative().optional(),
  actualCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  repairAction: z.string().optional(),
  partsUsed: z.array(z.string()).optional(),
  downtimeHours: z.number().min(0).optional(),
  completedBy: z.string().optional(),
  completedDate: z.string().optional(),
});

const assignAssetSchema = z.object({
  operatorId: z.string().uuid(),
  sector: z.string().optional(),
  activity: z.string().optional(),
  location: z.string().optional(),
  purpose: z.string().min(1).default('Production assignment'),
  startTime: z.string().optional(),
  notes: z.string().optional(),
});

const returnAssetSchema = z.object({
  endTime: z.string().optional(),
  fuelCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const createUsageSchema = z.object({
  assetId: z.string().uuid(),
  operatorId: z.string().uuid(),
  sector: z.string().optional(),
  activity: z.string().optional(),
  purpose: z.string().min(1),
  startTime: z.string(),
  endTime: z.string().optional().nullable(),
  fuelCost: z.number().nonnegative().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

function startOfDay(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function dateOnly(value?: string | Date | null) {
  if (!value) return null;
  return startOfDay(value);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function diffHours(start: Date, end: Date) {
  return Number(Math.max((end.getTime() - start.getTime()) / 3600000, 0).toFixed(2));
}

function mapBoardStatus(status: string) {
  if (status === 'operational') return 'available';
  if (status === 'active') return 'assigned';
  if (status === 'under_maintenance') return 'maintenance';
  if (['retired', 'sold'].includes(status)) return 'retired';
  return 'out_of_service';
}

function computeScheduleStatus(dueDate: Date | string, storedStatus?: string | null) {
  if (hasStatus(storedStatus, 'completed')) return 'completed';
  const due = startOfDay(dueDate);
  const today = startOfDay();
  if (due.getTime() < today.getTime()) return 'overdue';
  if (due.getTime() <= addDays(today, 7).getTime()) return 'due soon';
  return 'scheduled';
}

function workOrderStatusToDb(status: string) {
  return status;
}

function workOrderStatusFromDb(status: string | null | undefined) {
  const value = status || 'open';
  return value === 'planned' ? 'open' : value;
}

async function ensureJournalExpense(
  farmId: string | undefined,
  actorUserId: string,
  sourceId: string,
  amount: number,
  description: string,
) {
  if (!farmId || amount <= 0) return;
  try {
    const [expenseAccount, cashAccount] = await Promise.all([
      prismaAny.financial_accounts.findFirst({
        where: {
          farm_id: farmId,
          OR: [{ account_code: 'EXP-MAINT' }, { name: { contains: 'Maintenance', mode: 'insensitive' } }],
        },
      }),
      prismaAny.financial_accounts.findFirst({
        where: {
          farm_id: farmId,
          OR: [{ account_code: 'AST-CASH' }, { name: { contains: 'Cash', mode: 'insensitive' } }, { name: { contains: 'Bank', mode: 'insensitive' } }],
        },
      }),
    ]);

    const maintenanceAccount =
      expenseAccount ??
      await prismaAny.financial_accounts.create({
        data: {
          farm_id: farmId,
          account_code: 'EXP-MAINT',
          name: 'Maintenance Expense',
          account_type: 'expense',
          is_active: true,
        },
      });

    const bankAccount =
      cashAccount ??
      await prismaAny.financial_accounts.create({
        data: {
          farm_id: farmId,
          account_code: 'AST-CASH',
          name: 'Farm Operating Cash',
          account_type: 'asset',
          is_active: true,
        },
      });

    const existingEntry = await prismaAny.journal_entries.findFirst({
      where: { source_module: 'machinery', source_id: sourceId },
    });
    if (existingEntry) return;

    const entry = await prismaAny.journal_entries.create({
      data: {
        farm_id: farmId,
        created_by: actorUserId,
        entry_date: startOfDay(),
        reference: `MNT-${sourceId.slice(0, 8).toUpperCase()}`,
        source_module: 'machinery',
        source_id: sourceId,
        description,
        total_debit: amount,
        total_credit: amount,
        status: 'posted',
      },
    });

    await prismaAny.journal_entry_lines.createMany({
      data: [
        {
          journal_entry_id: entry.id,
          account_id: maintenanceAccount.id,
          debit_amount: amount,
          credit_amount: 0,
          description,
        },
        {
          journal_entry_id: entry.id,
          account_id: bankAccount.id,
          debit_amount: 0,
          credit_amount: amount,
          description,
        },
      ],
    });
  } catch {
    // Finance is optional.
  }
}

async function auditAssetStatusChange(req: any, assetId: string, fromStatus: string | null | undefined, toStatus: string) {
  if (!fromStatus || fromStatus === toStatus) return;
  await logAuditEvent({
    actorUserId: req.user!.userId,
    eventType: 'asset_status_changed',
    subsystem: 'machinery',
    card: 'asset_register',
    action: 'status_change',
    description: `Asset status changed from ${fromStatus} to ${toStatus}`,
    ...clientInfo(req),
    metadata: { assetId, fromStatus, toStatus },
  });
}

async function buildAssetSnapshot(farmId: string | undefined) {
  const [assets, schedules, workOrders, usageLogs] = await Promise.all([
    prisma.assets.findMany({
      where: { farm_id: farmId, deleted_at: null },
      include: {
        employees: { select: { id: true, full_name: true, job_title: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prismaAny.asset_maintenance_schedules.findMany({
      where: { farm_id: farmId },
      orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
    }).catch(() => []),
    prisma.work_orders.findMany({
      where: { farm_id: farmId, asset_id: { not: null } } as any,
      orderBy: { created_at: 'desc' },
    }),
    prisma.asset_usage_logs.findMany({
      where: { assets: { farm_id: farmId, deleted_at: null } },
      include: {
        employees: { select: { id: true, full_name: true } },
      },
      orderBy: { start_time: 'desc' },
    }),
  ]);

  const scheduleByAsset = new Map<string, any[]>();
  for (const schedule of schedules as any[]) {
    const list = scheduleByAsset.get(schedule.asset_id) ?? [];
    list.push(schedule);
    scheduleByAsset.set(schedule.asset_id, list);
  }

  const workOrdersByAsset = new Map<string, any[]>();
  for (const order of workOrders as any[]) {
    if (!order.asset_id) continue;
    const list = workOrdersByAsset.get(order.asset_id) ?? [];
    list.push(order);
    workOrdersByAsset.set(order.asset_id, list);
  }

  const usageByAsset = new Map<string, any[]>();
  for (const usage of usageLogs as any[]) {
    const list = usageByAsset.get(usage.asset_id) ?? [];
    list.push(usage);
    usageByAsset.set(usage.asset_id, list);
  }

  return assets.map((asset) => {
    const assetSchedules = (scheduleByAsset.get(asset.id) ?? []).map((schedule) => ({
      ...schedule,
      computed_status: computeScheduleStatus(schedule.due_date, schedule.status),
    }));
    const dueSchedule = assetSchedules.find((schedule) => schedule.computed_status !== 'completed');
    const assetUsage = usageByAsset.get(asset.id) ?? [];
    const totalUsageHours = assetUsage.reduce((sum, row) => sum + toNumber(row.hours_used), 0);
    const latestUsage = assetUsage[0] ?? null;
    const openUsage = assetUsage.find((row) => !row.end_time) ?? null;
    const assetOrders = workOrdersByAsset.get(asset.id) ?? [];
    const openWorkOrders = assetOrders.filter((order) => !['completed', 'cancelled'].includes(order.status));

    return {
      id: asset.id,
      asset_code: asset.asset_code,
      name: asset.name,
      asset_type: asset.asset_type,
      category: asset.category,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serial_number: asset.serial_number,
      purchase_date: asset.purchase_date,
      purchase_cost: asset.purchase_cost,
      current_value: asset.current_value,
      location: asset.location,
      assigned_to: asset.assigned_to,
      assigned_operator: asset.employees
        ? {
            id: asset.employees.id,
            full_name: asset.employees.full_name,
            job_title: asset.employees.job_title,
          }
        : null,
      condition: asset.condition,
      status: asset.status,
      board_status: mapBoardStatus(asset.status),
      last_service_date: asset.last_service_date,
      next_service_date: asset.next_service_date,
      warranty_expiry_date: asset.warranty_expiry_date,
      notes: asset.notes,
      usage_hours: Number(totalUsageHours.toFixed(2)),
      latest_usage: latestUsage
        ? {
            date: latestUsage.start_time,
            operator: latestUsage.employees?.full_name ?? null,
            sector: latestUsage.sector,
            activity: latestUsage.activity,
            location: latestUsage.location,
          }
        : null,
      open_usage_id: openUsage?.id ?? null,
      next_maintenance: dueSchedule
        ? {
            id: dueSchedule.id,
            service_type: dueSchedule.service_type,
            due_date: dueSchedule.due_date,
            priority: dueSchedule.priority,
            technician: dueSchedule.technician_name,
            status: dueSchedule.computed_status,
          }
        : null,
      open_work_order_count: openWorkOrders.length,
    };
  });
}

router.get('/summary', async (req, res) => {
  try {
    const farmId = req.user!.farmId ?? undefined;
    const today = startOfDay();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const [assets, schedules, workOrders, usageLogs, repairs, maintenanceLogs] = await Promise.all([
      buildAssetSnapshot(farmId),
      prismaAny.asset_maintenance_schedules.findMany({ where: { farm_id: farmId } }).catch(() => []),
      prisma.work_orders.findMany({ where: { farm_id: farmId, asset_id: { not: null } } as any }),
      prisma.asset_usage_logs.findMany({
        where: {
          assets: { farm_id: farmId, deleted_at: null },
          start_time: { gte: today, lte: endOfDay(today) },
        },
      }),
      prismaAny.repair_records.findMany({ where: { farm_id: farmId } }).catch(() => []),
      prisma.asset_maintenance_logs.findMany({
        where: {
          assets: { farm_id: farmId, deleted_at: null },
          maintenance_date: { gte: monthStart, lte: monthEnd },
        },
      }),
    ]);

    const dueCount = (schedules as any[]).filter((schedule) => ['overdue', 'due soon'].includes(computeScheduleStatus(schedule.due_date, schedule.status))).length;
    const openWorkOrders = workOrders.filter((order) => !hasStatus(order.status, 'completed', 'cancelled'));
    const downtimeHours =
      (repairs as any[]).reduce((sum, row) => sum + toNumber(row.downtime_hours), 0) +
      maintenanceLogs.reduce((sum, row) => sum + toNumber(row.downtime_hours), 0);
    const monthlyMaintenanceCost =
      (repairs as any[])
        .filter((row) => {
          const completed = new Date(row.completed_date);
          return completed >= monthStart && completed <= monthEnd;
        })
        .reduce((sum, row) => sum + toNumber(row.cost), 0) +
      maintenanceLogs.reduce((sum, row) => sum + toNumber(row.cost), 0);

    const statusDistribution = [
      { name: 'Available', value: assets.filter((asset) => hasStatus(asset.board_status, 'available')).length },
      { name: 'In Use', value: assets.filter((asset) => hasStatus(asset.board_status, 'assigned')).length },
      { name: 'Maintenance', value: assets.filter((asset) => hasStatus(asset.board_status, 'maintenance')).length },
      { name: 'Out of Service', value: assets.filter((asset) => hasStatus(asset.board_status, 'out_of_service')).length },
      { name: 'Retired', value: assets.filter((asset) => hasStatus(asset.board_status, 'retired')).length },
    ];

    const usageByCategory = Object.values(
      assets.reduce((acc: Record<string, { category: string; hours: number }>, asset) => {
        const key = asset.category || asset.asset_type;
        acc[key] = acc[key] || { category: key, hours: 0 };
        acc[key].hours += asset.usage_hours;
        return acc;
      }, {}),
    );

    const downtimeByAsset = (repairs as any[])
      .reduce((acc: Record<string, number>, row) => {
        const key = row.asset_id;
        acc[key] = (acc[key] ?? 0) + toNumber(row.downtime_hours);
        return acc;
      }, {});

    const downtimeChart = Object.entries(downtimeByAsset).map(([assetId, hours]) => ({
      asset:
        assets.find((asset) => asset.id === assetId)?.name ?? 'Unknown asset',
      hours: Number(toNumber(hours).toFixed(2)),
    }));

    const maintenanceCostTrend = Array.from({ length: 6 }).map((_, index) => {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
      const start = startOfDay(monthDate);
      const end = endOfDay(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
      const repairCost = (repairs as any[])
        .filter((row) => {
          const completed = new Date(row.completed_date);
          return completed >= start && completed <= end;
        })
        .reduce((sum, row) => sum + toNumber(row.cost), 0);
      const maintenanceCost = maintenanceLogs
        .filter((row) => {
          const completed = new Date(row.maintenance_date);
          return completed >= start && completed <= end;
        })
        .reduce((sum, row) => sum + toNumber(row.cost), 0);
      return {
        month: monthDate.toLocaleString('en-US', { month: 'short' }),
        cost: Number((repairCost + maintenanceCost).toFixed(2)),
      };
    });

    const upcomingMaintenanceCount = [
      { label: 'Overdue', count: (schedules as any[]).filter((s) => computeScheduleStatus(s.due_date, s.status) === 'overdue').length },
      { label: 'Due Soon', count: (schedules as any[]).filter((s) => computeScheduleStatus(s.due_date, s.status) === 'due soon').length },
      { label: 'Scheduled', count: (schedules as any[]).filter((s) => computeScheduleStatus(s.due_date, s.status) === 'scheduled').length },
      { label: 'Completed', count: (schedules as any[]).filter((s) => computeScheduleStatus(s.due_date, s.status) === 'completed').length },
    ];

    res.json({
      cards: {
        totalAssets: assets.length,
        availableNow: assets.filter((asset) => hasStatus(asset.board_status, 'available')).length,
        inUseToday: usageLogs.length,
        inUse: assets.filter((asset) => hasStatus(asset.board_status, 'assigned')).length,
        operational: assets.filter((asset) => hasStatus(asset.status, 'operational', 'active')).length,
        inMaintenance: assets.filter((asset) => hasStatus(asset.board_status, 'maintenance')).length,
        maintenanceDue: dueCount,
        openWorkOrders: openWorkOrders.length,
        downtimeHours: Number(downtimeHours.toFixed(2)),
        monthlyMaintenanceCost: Number(monthlyMaintenanceCost.toFixed(2)),
        retiredSold: assets.filter((asset) => hasStatus(asset.status, 'retired', 'sold')).length,
        lostDamaged: assets.filter((asset) => hasStatus(asset.status, 'lost', 'decommissioned')).length,
        retiredSoldLost: assets.filter((asset) => hasStatus(asset.status, 'retired', 'sold', 'lost', 'decommissioned')).length,
      },
      charts: {
        statusDistribution,
        maintenanceCostTrend,
        downtimeByAsset: downtimeChart,
        usageHoursByCategory: usageByCategory,
        upcomingMaintenanceCount,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch asset summary', code: 'DB_ERROR' });
  }
});

router.get('/availability', async (req, res) => {
  try {
    const assets = await buildAssetSnapshot(req.user!.farmId ?? undefined);
    res.json({
      available: assets.filter((asset) => asset.board_status === 'available'),
      assigned: assets.filter((asset) => asset.board_status === 'assigned'),
      maintenance: assets.filter((asset) => asset.board_status === 'maintenance'),
      out_of_service: assets.filter((asset) => asset.board_status === 'out_of_service'),
      retired: assets.filter((asset) => asset.board_status === 'retired'),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch asset availability board', code: 'DB_ERROR' });
  }
});

router.get('/maintenance', async (req, res) => {
  try {
    const rows = await prismaAny.asset_maintenance_schedules.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      include: {
        assets: { select: { id: true, name: true, asset_code: true } },
      },
      orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
    });

    res.json(
      (rows as any[]).map((row) => ({
        id: row.id,
        assetId: row.asset_id,
        asset: row.assets?.name ?? 'Unknown asset',
        assetCode: row.assets?.asset_code ?? null,
        serviceType: row.service_type,
        dueDate: row.due_date,
        priority: row.priority,
        technician: row.technician_name,
        estimatedCost: toNumber(row.estimated_cost),
        status: computeScheduleStatus(row.due_date, row.status),
        notes: row.notes,
        completedAt: row.completed_at,
      })),
    );
  } catch {
    res.status(500).json({ error: 'Failed to fetch maintenance schedule', code: 'DB_ERROR' });
  }
});

router.post('/maintenance', async (req, res) => {
  const parsed = createScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const data = parsed.data;
  try {
    const schedule = await prismaAny.asset_maintenance_schedules.create({
      data: {
        farm_id: req.user!.farmId,
        asset_id: data.assetId,
        service_type: data.serviceType,
        due_date: startOfDay(data.dueDate),
        priority: data.priority,
        technician_name: data.technician ?? null,
        estimated_cost: data.estimatedCost ?? null,
        status: data.status ?? 'scheduled',
        notes: data.notes ?? null,
        created_by: req.user!.userId,
      },
    });
    res.status(201).json(schedule);
  } catch {
    res.status(500).json({ error: 'Failed to create maintenance schedule', code: 'DB_ERROR' });
  }
});

router.patch('/maintenance/:id/complete', async (req, res) => {
  const parsed = completeScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const data = parsed.data;
  try {
    const log = await completeMaintenanceScheduleFlow({
      scheduleId: req.params.id,
      data,
      actorUserId: req.user!.userId,
      farmId: req.user!.farmId ?? undefined,
      req,
    });
    res.json(log);
  } catch (error: any) {
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Maintenance schedule not found', code: 'NOT_FOUND' });
    if (error?.code === 'ASSET_NOT_FOUND') return res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to complete maintenance schedule', code: 'DB_ERROR' });
  }
});

router.get('/work-orders', async (req, res) => {
  try {
    const rows = await prisma.work_orders.findMany({
      where: { farm_id: req.user!.farmId ?? undefined, asset_id: { not: null } } as any,
      include: {
        assets: { select: { id: true, name: true } },
      } as any,
      orderBy: { created_at: 'desc' },
    });

    res.json(
      rows.map((row: any) => ({
        id: row.id,
        workOrderId: row.work_order_number,
        assetId: row.asset_id,
        asset: row.assets?.name ?? row.title,
        issueServiceType: row.issue_type ?? row.title,
        priority: row.priority,
        requestedBy: row.requested_by_employee_id ?? null,
        assignedTechnician: row.assigned_technician,
        openedDate: row.planned_start_date,
        dueDate: row.planned_end_date,
        status: workOrderStatusFromDb(row.status),
        cost: toNumber(row.actual_cost ?? row.estimated_cost),
        estimatedCost: toNumber(row.estimated_cost),
        notes: row.description,
      })),
    );
  } catch {
    res.status(500).json({ error: 'Failed to fetch work orders', code: 'DB_ERROR' });
  }
});

router.post('/work-orders', async (req, res) => {
  const parsed = createWorkOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const data = parsed.data;
  try {
    const order = await prisma.work_orders.create({
      data: {
        farm_id: req.user!.farmId,
        asset_id: data.assetId,
        work_order_number: `MWO-${Date.now().toString().slice(-8)}`,
        title: data.issueServiceType,
        description: data.notes ?? null,
        planned_start_date: dateOnly(data.openedDate) ?? startOfDay(),
        planned_end_date: dateOnly(data.dueDate),
        priority: data.priority,
        requested_by_employee_id: data.requestedBy ?? null,
        assigned_technician: data.assignedTechnician ?? null,
        issue_type: data.issueServiceType,
        estimated_cost: data.estimatedCost ?? null,
        status: workOrderStatusToDb(data.status),
        created_by: req.user!.userId,
        planned_inputs: { module: 'machinery' },
      } as any,
    });

    res.status(201).json(order);
  } catch {
    res.status(500).json({ error: 'Failed to create work order', code: 'DB_ERROR' });
  }
});

router.patch('/work-orders/:id', async (req, res) => {
  const parsed = updateWorkOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const data = parsed.data;
  try {
    const existing = await prisma.work_orders.findUnique({ where: { id: req.params.id } as any });
    if (!existing || !existing.asset_id) return res.status(404).json({ error: 'Work order not found', code: 'NOT_FOUND' });

    const updated = await prisma.work_orders.update({
      where: { id: req.params.id } as any,
      data: {
        ...(data.issueServiceType !== undefined && { title: data.issueServiceType, issue_type: data.issueServiceType }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.requestedBy !== undefined && { requested_by_employee_id: data.requestedBy }),
        ...(data.assignedTechnician !== undefined && { assigned_technician: data.assignedTechnician }),
        ...(data.openedDate !== undefined && { planned_start_date: dateOnly(data.openedDate) }),
        ...(data.dueDate !== undefined && { planned_end_date: dateOnly(data.dueDate) }),
        ...(data.status !== undefined && { status: workOrderStatusToDb(data.status) }),
        ...(data.estimatedCost !== undefined && { estimated_cost: data.estimatedCost }),
        ...(data.actualCost !== undefined && { actual_cost: data.actualCost }),
        ...(data.notes !== undefined && { description: data.notes }),
        ...(data.status === 'completed' && {
          completed_at: data.completedDate ? new Date(data.completedDate) : new Date(),
          actual_end_time: data.completedDate ? new Date(data.completedDate) : new Date(),
        }),
        updated_at: new Date(),
        ...(data.repairAction || data.partsUsed || data.downtimeHours !== undefined || data.completedBy
          ? {
              actual_outputs: {
                repairAction: data.repairAction,
                partsUsed: data.partsUsed ?? [],
                downtimeHours: data.downtimeHours ?? 0,
                completedBy: data.completedBy ?? data.assignedTechnician ?? existing.assigned_technician ?? null,
              },
            }
          : {}),
      } as any,
    });

    if (data.status === 'completed') {
      const asset = await prisma.assets.findUnique({ where: { id: existing.asset_id } });
      if (asset) {
        const actualOutputs = updated.actual_outputs as Record<string, unknown> | null;
        const completedDate = data.completedDate ? startOfDay(data.completedDate) : startOfDay();
        const existingRepair = await prismaAny.repair_records.findFirst({
          where: { work_order_id: updated.id },
        });
        if (!existingRepair) {
          await prismaAny.repair_records.create({
            data: {
              farm_id: req.user!.farmId,
              asset_id: asset.id,
              work_order_id: updated.id,
              issue: updated.issue_type ?? updated.title,
              repair_action: data.repairAction ?? 'Work order completed',
              parts_used: data.partsUsed ?? [],
              downtime_hours: data.downtimeHours ?? toNumber(actualOutputs?.downtimeHours),
              cost: data.actualCost ?? toNumber(updated.actual_cost),
              completed_by: data.completedBy ?? data.assignedTechnician ?? updated.assigned_technician ?? null,
              completed_date: completedDate,
              notes: data.notes ?? updated.description ?? null,
            },
          });
        }

        if ((data.actualCost ?? toNumber(updated.actual_cost)) > 0) {
          await ensureJournalExpense(
            req.user!.farmId ?? undefined,
            req.user!.userId,
            updated.id,
            data.actualCost ?? toNumber(updated.actual_cost),
            `Work order completed for ${asset.name}`,
          );
        }
      }
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update work order', code: 'DB_ERROR' });
  }
});

router.get('/repairs', async (req, res) => {
  try {
    const rows = await prismaAny.repair_records.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      include: {
        assets: { select: { name: true } },
      },
      orderBy: [{ completed_date: 'desc' }, { created_at: 'desc' }],
    });

    res.json(
      (rows as any[]).map((row) => ({
        id: row.id,
        asset: row.assets?.name ?? 'Unknown asset',
        issue: row.issue,
        repairAction: row.repair_action,
        partsUsed: Array.isArray(row.parts_used) ? row.parts_used : [],
        downtimeHours: toNumber(row.downtime_hours),
        cost: toNumber(row.cost),
        completedBy: row.completed_by,
        completedDate: row.completed_date,
        notes: row.notes,
      })),
    );
  } catch {
    res.status(500).json({ error: 'Failed to fetch repair history', code: 'DB_ERROR' });
  }
});

router.get('/usage', async (req, res) => {
  try {
    const rows = await prisma.asset_usage_logs.findMany({
      where: { assets: { farm_id: req.user!.farmId ?? undefined, deleted_at: null } },
      include: {
        assets: { select: { id: true, name: true } },
        employees: { select: { id: true, full_name: true } },
      },
      orderBy: { start_time: 'desc' },
      take: 200,
    });

    res.json(
      rows.map((row) => ({
        id: row.id,
        date: row.start_time,
        assetId: row.asset_id,
        asset: row.assets.name,
        operator: row.employees.full_name,
        sector: row.sector,
        activity: row.activity,
        hoursUsed: toNumber(row.hours_used),
        fuelCost: toNumber(row.fuel_cost),
        location: row.location,
        notes: row.notes,
        endTime: row.end_time,
      })),
    );
  } catch {
    res.status(500).json({ error: 'Failed to fetch asset usage logs', code: 'DB_ERROR' });
  }
});

router.post('/usage', async (req, res) => {
  const parsed = createUsageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const data = parsed.data;
  try {
    const asset = await prisma.assets.findFirst({ where: { id: data.assetId, deleted_at: null } });
    if (!asset) return res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });
    if (['under_maintenance', 'decommissioned', 'retired', 'lost', 'sold'].includes(asset.status)) {
      return res.status(400).json({ error: 'Asset is not available for production usage', code: 'ASSET_UNAVAILABLE' });
    }

    const start = new Date(data.startTime);
    const end = data.endTime ? new Date(data.endTime) : null;
    const usage = await prisma.asset_usage_logs.create({
      data: {
        asset_id: data.assetId,
        used_by: data.operatorId,
        authorized_by: req.user!.userId,
        purpose: data.purpose,
        sector: data.sector ?? null,
        activity: data.activity ?? null,
        start_time: start,
        end_time: end,
        hours_used: end ? diffHours(start, end) : null,
        fuel_cost: data.fuelCost ?? null,
        location: data.location ?? null,
        notes: data.notes ?? null,
      },
    });

    await prisma.assets.update({
      where: { id: data.assetId },
      data: {
        assigned_to: data.operatorId,
        status: end ? 'operational' : 'active',
        updated_at: new Date(),
      },
    });

    res.status(201).json(usage);
  } catch {
    res.status(500).json({ error: 'Failed to create usage log', code: 'DB_ERROR' });
  }
});

router.get('/', async (req, res) => {
  try {
    res.json(await buildAssetSnapshot(req.user!.farmId ?? undefined));
  } catch {
    res.status(500).json({ error: 'Failed to fetch assets', code: 'DB_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const parsed = createAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  try {
    const asset = await prisma.assets.create({
      data: {
        asset_code: d.assetCode ?? null,
        name: d.name,
        asset_type: d.assetType,
        category: d.category ?? null,
        manufacturer: d.manufacturer ?? null,
        model: d.model ?? null,
        serial_number: d.serialNumber ?? null,
        purchase_date: dateOnly(d.purchaseDate),
        purchase_cost: d.purchaseCost ?? null,
        current_value: d.currentValue ?? d.purchaseCost ?? null,
        location: d.location ?? null,
        assigned_to: d.assignedTo ?? null,
        condition: d.condition,
        status: d.status,
        last_service_date: dateOnly(d.lastServiceDate),
        next_service_date: dateOnly(d.nextServiceDate),
        warranty_expiry_date: dateOnly(d.warrantyExpiryDate),
        notes: d.notes ?? null,
        farm_id: req.user!.farmId,
      },
    });
    res.status(201).json(asset);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Duplicate asset code or serial number', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to create asset', code: 'DB_ERROR' });
  }
});

router.patch('/:id', async (req, res) => {
  const parsed = updateAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  try {
    const existing = await prisma.assets.findFirst({ where: { id: req.params.id, deleted_at: null } });
    if (!existing) return res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });

    const asset = await prisma.assets.update({
      where: { id: req.params.id },
      data: {
        ...(d.assetCode !== undefined && { asset_code: d.assetCode }),
        ...(d.name !== undefined && { name: d.name }),
        ...(d.assetType !== undefined && { asset_type: d.assetType }),
        ...(d.category !== undefined && { category: d.category }),
        ...(d.manufacturer !== undefined && { manufacturer: d.manufacturer }),
        ...(d.model !== undefined && { model: d.model }),
        ...(d.serialNumber !== undefined && { serial_number: d.serialNumber }),
        ...(d.purchaseDate !== undefined && { purchase_date: dateOnly(d.purchaseDate) }),
        ...(d.purchaseCost !== undefined && { purchase_cost: d.purchaseCost }),
        ...(d.currentValue !== undefined && { current_value: d.currentValue }),
        ...(d.location !== undefined && { location: d.location }),
        ...(d.assignedTo !== undefined && { assigned_to: d.assignedTo }),
        ...(d.condition !== undefined && { condition: d.condition }),
        ...(d.status !== undefined && { status: d.status }),
        ...(d.lastServiceDate !== undefined && { last_service_date: dateOnly(d.lastServiceDate) }),
        ...(d.nextServiceDate !== undefined && { next_service_date: dateOnly(d.nextServiceDate) }),
        ...(d.warrantyExpiryDate !== undefined && { warranty_expiry_date: dateOnly(d.warrantyExpiryDate) }),
        ...(d.notes !== undefined && { notes: d.notes }),
        updated_at: new Date(),
      },
    });

    if (d.status) await auditAssetStatusChange(req, asset.id, existing.status, d.status);
    res.json(asset);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Duplicate asset code or serial number', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to update asset', code: 'DB_ERROR' });
  }
});

router.post('/:id/assign', async (req, res) => {
  const parsed = assignAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const data = parsed.data;

  try {
    const asset = await prisma.assets.findFirst({ where: { id: req.params.id, deleted_at: null } });
    if (!asset) return res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });
    if (['under_maintenance', 'decommissioned', 'retired', 'lost', 'sold'].includes(asset.status)) {
      return res.status(400).json({ error: 'Asset cannot be assigned while unavailable', code: 'ASSET_UNAVAILABLE' });
    }

    const openUsage = await prisma.asset_usage_logs.findFirst({
      where: { asset_id: asset.id, end_time: null },
      orderBy: { start_time: 'desc' },
    });
    if (openUsage) {
      return res.status(400).json({ error: 'Asset is already assigned', code: 'ALREADY_ASSIGNED' });
    }

    const startTime = data.startTime ? new Date(data.startTime) : new Date();
    const [usage] = await prisma.$transaction([
      prisma.asset_usage_logs.create({
        data: {
          asset_id: asset.id,
          used_by: data.operatorId,
          authorized_by: req.user!.userId,
          purpose: data.purpose,
          sector: data.sector ?? null,
          activity: data.activity ?? 'Assigned for field operations',
          start_time: startTime,
          location: data.location ?? asset.location ?? null,
          notes: data.notes ?? null,
        },
      }),
      prisma.assets.update({
        where: { id: asset.id },
        data: {
          assigned_to: data.operatorId,
          status: 'active',
          location: data.location ?? asset.location,
          updated_at: new Date(),
        },
      }),
    ]);

    await auditAssetStatusChange(req, asset.id, asset.status, 'active');
    res.status(201).json(usage);
  } catch {
    res.status(500).json({ error: 'Failed to assign asset', code: 'DB_ERROR' });
  }
});

router.post('/:id/return', async (req, res) => {
  const parsed = returnAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const data = parsed.data;

  try {
    const asset = await prisma.assets.findFirst({ where: { id: req.params.id, deleted_at: null } });
    if (!asset) return res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });

    const openUsage = await prisma.asset_usage_logs.findFirst({
      where: { asset_id: asset.id, end_time: null },
      orderBy: { start_time: 'desc' },
    });
    if (!openUsage) return res.status(400).json({ error: 'Asset is not currently assigned', code: 'NOT_ASSIGNED' });

    const endTime = data.endTime ? new Date(data.endTime) : new Date();
    const hoursUsed = diffHours(new Date(openUsage.start_time), endTime);

    const dueStatus =
      asset.next_service_date && startOfDay(asset.next_service_date).getTime() < startOfDay().getTime()
        ? 'under_maintenance'
        : 'operational';

    const [usage] = await prisma.$transaction([
      prisma.asset_usage_logs.update({
        where: { id: openUsage.id },
        data: {
          end_time: endTime,
          hours_used: hoursUsed,
          fuel_cost: data.fuelCost ?? null,
          notes: data.notes ?? openUsage.notes,
        },
      }),
      prisma.assets.update({
        where: { id: asset.id },
        data: {
          assigned_to: null,
          status: dueStatus,
          updated_at: new Date(),
        },
      }),
    ]);

    await auditAssetStatusChange(req, asset.id, asset.status, dueStatus);
    res.json(usage);
  } catch {
    res.status(500).json({ error: 'Failed to return asset', code: 'DB_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.assets.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), updated_at: new Date() },
    });
    res.status(204).end();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete asset', code: 'DB_ERROR' });
  }
});

router.get('/:id/maintenance', async (req, res) => {
  try {
    const logs = await prisma.asset_maintenance_logs.findMany({
      where: { asset_id: req.params.id },
      include: { users: { select: { full_name: true } } },
      orderBy: { maintenance_date: 'desc' },
    });
    res.json(
      logs.map((log) => ({
        ...log,
        performed_by_name: log.users.full_name,
      })),
    );
  } catch {
    res.status(500).json({ error: 'Failed to fetch maintenance logs', code: 'DB_ERROR' });
  }
});

router.post('/:id/maintenance', async (req, res) => {
  const parsed = maintenanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  const maintenanceDate = d.maintenanceDate ? new Date(d.maintenanceDate) : startOfDay();

  try {
    const asset = await prisma.assets.findFirst({ where: { id: req.params.id, deleted_at: null } });
    if (!asset) return res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });

    const [log] = await prisma.$transaction([
      prisma.asset_maintenance_logs.create({
        data: {
          asset_id: req.params.id,
          performed_by: req.user!.userId,
          maintenance_type: d.maintenanceType,
          description: d.description,
          cost: d.cost ?? null,
          service_provider: d.serviceProvider ?? null,
          maintenance_date: startOfDay(maintenanceDate),
          next_service_date: dateOnly(d.nextServiceDate),
          downtime_hours: d.downtimeHours ?? null,
          outcome: d.outcome ?? null,
        },
      }),
      prisma.assets.update({
        where: { id: req.params.id },
        data: {
          last_service_date: startOfDay(maintenanceDate),
          next_service_date: dateOnly(d.nextServiceDate),
          condition: d.condition ?? asset.condition,
          status: 'operational',
          updated_at: new Date(),
        },
      }),
    ]);

    if ((d.cost ?? 0) > 0) {
      await ensureJournalExpense(
        req.user!.farmId ?? undefined,
        req.user!.userId,
        log.id,
        d.cost ?? 0,
        `Maintenance logged for ${asset.name}`,
      );
    }

    await auditAssetStatusChange(req, asset.id, asset.status, 'operational');
    res.status(201).json(log);
  } catch {
    res.status(500).json({ error: 'Failed to log maintenance', code: 'DB_ERROR' });
  }
});

export default router;
