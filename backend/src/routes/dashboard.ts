import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { buildFinanceData } from './finance';
import { hasStatus, normalizeStatus, toNumber } from '../lib/summary';

const router = Router();
const prismaAny = prisma as any;

router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => requirePermission('dashboard', 'view')(req, res, next));

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

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function titleize(value: string | null | undefined) {
  if (!value) return 'System';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function computeMaintenanceStatus(dueDate: Date | string, status?: string | null) {
  if (hasStatus(status, 'completed')) return 'completed';
  const due = startOfDay(dueDate);
  const today = startOfDay();
  if (due.getTime() < today.getTime()) return 'overdue';
  if (due.getTime() <= addDays(today, 7).getTime()) return 'due_soon';
  return 'scheduled';
}

function mapOrderStatus(status: string) {
  const map: Record<string, string> = {
    pending: 'pending',
    confirmed: 'in_production',
    packed: 'quality_check',
    dispatched: 'ready_for_dispatch',
    delivered: 'completed',
    invoiced: 'completed',
    cancelled: 'rejected',
  };
  return map[status] ?? status;
}

function remainingAmount(amount: number, status: string) {
  if (status === 'paid') return 0;
  if (status === 'partially paid' || status === 'partial') return Number((amount * 0.5).toFixed(2));
  return amount;
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[dashboard] Failed to load ${label}`, error);
    return fallback;
  }
}

function emptyFinanceData() {
  return {
    summary: {
      grossRevenue: 0,
      totalExpenses: 0,
      cashCollected: 0,
      receivables: 0,
      payables: 0,
      payrollDue: 0,
      procurementCosts: 0,
      maintenanceCosts: 0,
      contractorPayments: 0,
      netProfit: 0,
      profitMargin: 0,
      totalIncome: 0,
      totalRevenue: 0,
      totalExpense: 0,
      incomeThisMonth: 0,
      expensesThisMonth: 0,
    },
    cashFlow: [],
    profitability: [],
    incomes: [],
    expenses: [],
    receivables: [],
    payables: [],
    costOfProduction: [],
  };
}

async function loadDashboardData(farmId: string | undefined) {
  const today = startOfDay();
  const todayEnd = endOfDay(today);
  const weekAgo = startOfDay(addDays(today, -6));

  const finance = await safe('finance', () => buildFinanceData(farmId), emptyFinanceData());
  const stockItems = await safe('stock items', () => prisma.stock_items.findMany({
    where: { farm_id: farmId, deleted_at: null },
    select: { id: true, name: true, current_quantity: true, reorder_threshold: true, unit_of_measure: true },
  }), []);
  const reorderAlerts = await safe('reorder alerts', () => prisma.reorder_alerts.findMany({
    where: {
      status: 'open',
      stock_items: { farm_id: farmId, deleted_at: null },
    },
    include: {
      stock_items: { select: { id: true, name: true, current_quantity: true, reorder_threshold: true } },
    },
    orderBy: { triggered_at: 'desc' },
    take: 25,
  }), []);
  const procurementShowcase = await safe('procurement showcase', () => prisma.$queryRaw<any[]>`
      SELECT id, item_name, quantity, received_quantity, status, expected_date, supplier, notes, total_cost
      FROM public.procurement
      WHERE farm_id = ${farmId}::uuid
      ORDER BY created_at DESC
      LIMIT 200
    `, []);
  const purchaseOrders = await safe('purchase orders', () => prisma.purchase_orders.findMany({
    where: { farm_id: farmId },
    include: { suppliers: { select: { name: true } } },
    orderBy: { created_at: 'desc' },
    take: 200,
  }), []);
  const salesOrders = await safe('sales orders', () => prisma.sales_orders.findMany({
    where: { farm_id: farmId },
    include: {
      customers: { select: { name: true } },
      sales_order_items: { include: { stock_items: { select: { name: true } } } },
    },
    orderBy: { created_at: 'desc' },
    take: 200,
  }), []);
  const customerCount = await safe('customer count', () => prisma.customers.count({
    where: { farm_id: farmId, deleted_at: null, is_active: { not: false } as any },
  }), 0);
  const batches = await safe('production batches', () => prismaAny.inventory_production_batches.findMany({
    where: { farm_id: farmId },
    orderBy: { created_at: 'desc' },
    take: 200,
  }), []);
  const productionRequestsCount = await safe('production requests', () => prismaAny.inventory_production_requests.count({
    where: { farm_id: farmId },
  }), 0);
  const employees = await safe('employees', () => prisma.employees.findMany({
    where: { farm_id: farmId, deleted_at: null },
    select: { id: true, status: true, employment_type: true },
  }), []);
  const attendanceLogs = await safe('attendance logs', () => prisma.attendance_logs.findMany({
    where: {
      employees: { farm_id: farmId, deleted_at: null },
      log_date: { gte: weekAgo, lte: todayEnd },
    },
    select: { id: true, employee_id: true, log_date: true, status: true },
    orderBy: { log_date: 'desc' },
  }), []);
  const maintenanceSchedules = await safe('maintenance schedules', () => prismaAny.asset_maintenance_schedules.findMany({
    where: { farm_id: farmId },
    include: { assets: { select: { id: true, name: true, asset_code: true } } },
    orderBy: { due_date: 'asc' },
    take: 200,
  }), []);
  const workOrders = await safe('work orders', () => prisma.work_orders.findMany({
    where: { farm_id: farmId, asset_id: { not: null } } as any,
    include: { assets: { select: { id: true, name: true } } } as any,
    orderBy: { created_at: 'desc' },
    take: 200,
  }), []);
  const assets = await safe('assets', () => prisma.assets.findMany({
    where: { farm_id: farmId, deleted_at: null },
    select: { id: true, name: true, status: true, next_service_date: true, category: true },
  }), []);
  const auditRows = await safe('audit rows', () => prismaAny.audit_events.findMany({
    where: {
      occurred_at: { gte: addDays(today, -14) },
    },
    orderBy: { occurred_at: 'desc' },
    take: 20,
  }), []);
  const leaveRows = await safe('leave rows', () => prisma.leave_requests.findMany({
    where: { employees: { farm_id: farmId, deleted_at: null } },
    select: { id: true, approval_status: true },
    orderBy: { created_at: 'desc' },
    take: 100,
  }), []);
  const wages = await safe('wages', () => prismaAny.personnel_wages.findMany({
    where: { farm_id: farmId },
    select: { id: true, payment_status: true, full_name: true, pay_period: true },
    orderBy: { created_at: 'desc' },
    take: 100,
  }), []);

  const activeOrders = salesOrders.filter((order) => !['delivered', 'invoiced', 'cancelled'].includes(order.status));
  const productionInProgress = (batches as any[]).filter((batch) => ['pending', 'in_progress'].includes(String(batch.status || 'pending')));
  const batchesWaitingQuality = (batches as any[]).filter((batch) => String(batch.status || '') === 'quality_check');
  const todayRevenue = finance.incomes
    .filter((row) => row.date && new Date(row.date) >= today && new Date(row.date) <= todayEnd)
    .reduce((sum, row) => sum + row.amount, 0);
  const todayExpenses = finance.expenses
    .filter((row) => row.date && new Date(row.date) >= today && new Date(row.date) <= todayEnd)
    .reduce((sum, row) => sum + row.amount, 0);
  const activeEmployees = employees.filter((employee) => !hasStatus(employee.status, 'terminated', 'inactive', 'suspended'));
  const todayAttendance = attendanceLogs.filter((row) => {
    const date = new Date(row.log_date);
    return date >= today && date <= todayEnd;
  });
  const workersPresent = todayAttendance.filter((row) => hasStatus(row.status, 'present', 'half_day')).length;
  const workersAbsent = todayAttendance.filter((row) => hasStatus(row.status, 'absent', 'leave')).length;
  const assetsAvailable = assets.filter((asset) => hasStatus(asset.status, 'operational', 'active')).length;
  const pendingApprovals =
    (procurementShowcase as any[]).filter((row) => String(row.status || '').toLowerCase() === 'pending').length +
    (leaveRows as any[]).filter((row) => String(row.approval_status || '').toLowerCase() === 'pending').length +
    purchaseOrders.filter((row) => ['submitted', 'draft'].includes(String(row.status || '').toLowerCase())).length;

  const overdueProcurement = (procurementShowcase as any[]).filter((row) => {
    if (!row.expected_date) return false;
    return new Date(row.expected_date) < today && !['received', 'rejected'].includes(String(row.status || '').toLowerCase());
  });
  const delayedProduction = (batches as any[]).filter((batch) => {
    if (!batch.expected_completion) return false;
    return new Date(batch.expected_completion) < today && !['passed', 'declined'].includes(String(batch.status || '').toLowerCase());
  });
  const overdueMaintenance = [
    ...(maintenanceSchedules as any[]).filter((row) => computeMaintenanceStatus(row.due_date, row.status) === 'overdue').map((row) => ({
      label: row.assets?.name ?? 'Asset',
    })),
    ...workOrders
      .filter((row) => row.planned_end_date && new Date(row.planned_end_date) < today && !['completed', 'cancelled'].includes(String(row.status || '').toLowerCase()))
      .map((row: any) => ({
        label: row.assets?.name ?? row.title ?? 'Work order',
      })),
  ];
  const recentSecurityIssues = (auditRows as any[]).filter((row) => ['failed_login', 'login_failed', 'permission_change'].includes(String(row.event_type || '').toLowerCase()));
  const lowStock = stockItems.filter((item) => toNumber(item.current_quantity) <= toNumber(item.reorder_threshold));
  const unpaidReceivables = finance.receivables.filter((row) => row.dueDate && new Date(String(row.dueDate)) < today);

  const healthScore = Math.max(
    0,
    100
      - lowStock.length * 3
      - overdueProcurement.length * 5
      - delayedProduction.length * 6
      - unpaidReceivables.length * 4
      - overdueMaintenance.length * 5
      - recentSecurityIssues.length * 7,
  );

  const chartRevenueExpenses = finance.cashFlow;
  const productionTrend = Array.from({ length: 6 }).map((_, index) => {
    const start = startOfDay(addDays(today, -(35 - index * 7)));
    const end = endOfDay(addDays(start, 6));
    const output = (batches as any[])
      .filter((batch) => batch.actual_completion && new Date(batch.actual_completion) >= start && new Date(batch.actual_completion) <= end)
      .reduce((sum, batch) => sum + toNumber(batch.produced_quantity || batch.quantity || 0), 0);
    return {
      week: `${start.toLocaleString('en-US', { month: 'short' })} ${start.getDate()}`,
      output: Number(output.toFixed(2)),
    };
  });

  const ordersByStatusMap = salesOrders.reduce<Record<string, number>>((acc, order) => {
    const status = mapOrderStatus(order.status);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const ordersByStatus = Object.entries(ordersByStatusMap).map(([status, count]) => ({ status: titleize(status), count }));

  const attendanceThisWeek = Array.from({ length: 7 }).map((_, index) => {
    const date = startOfDay(addDays(today, -(6 - index)));
    const logs = attendanceLogs.filter((row) => {
      const logDate = startOfDay(row.log_date);
      return logDate.getTime() === date.getTime();
    });
    return {
      day: date.toLocaleString('en-US', { weekday: 'short' }),
      present: logs.filter((row) => ['present', 'half_day'].includes(String(row.status || ''))).length,
      absent: logs.filter((row) => ['absent', 'leave'].includes(String(row.status || ''))).length,
    };
  });

  const maintenanceDueTrend = Array.from({ length: 6 }).map((_, index) => {
    const date = startOfDay(addDays(today, index * 7));
    const end = endOfDay(addDays(date, 6));
    return {
      week: `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`,
      due:
        (maintenanceSchedules as any[]).filter((row) => {
          const dueDate = new Date(row.due_date);
          return dueDate >= date && dueDate <= end && computeMaintenanceStatus(row.due_date, row.status) !== 'completed';
        }).length +
        workOrders.filter((row) => {
          if (!row.planned_end_date) return false;
          const dueDate = new Date(row.planned_end_date);
          return dueDate >= date && dueDate <= end && !['completed', 'cancelled'].includes(String(row.status || '').toLowerCase());
        }).length,
    };
  });

  const priorityAlerts = [
    ...reorderAlerts.slice(0, 2).map((row: any) => ({
      severity: 'critical',
      subsystem: 'inventory',
      issue: `${row.stock_items?.name ?? 'Stock item'} is below reorder threshold`,
      recommendedAction: 'Raise a purchase request or receive replenishment stock.',
      link: '/inventory',
    })),
    ...activeOrders
      .filter((order) => order.delivery_date && new Date(order.delivery_date) < today)
      .slice(0, 2)
      .map((order) => ({
        severity: 'warning',
        subsystem: 'sales',
        issue: `${order.order_number} delivery is overdue for ${order.customers?.name ?? 'customer'}`,
        recommendedAction: 'Review dispatch status and confirm delivery commitment.',
        link: '/orders',
      })),
    ...delayedProduction.slice(0, 2).map((batch) => ({
      severity: 'warning',
      subsystem: 'production',
      issue: `${batch.batch_number ?? 'Production batch'} is delayed against expected completion`,
      recommendedAction: 'Resolve the bottleneck and update batch status or output.',
      link: '/production',
    })),
    ...overdueMaintenance.slice(0, 2).map((row: any) => ({
      severity: 'critical',
      subsystem: 'machinery',
      issue: `${row.label ?? 'Asset'} maintenance is overdue`,
      recommendedAction: 'Schedule or complete maintenance before operational impact grows.',
      link: '/machinery',
    })),
    ...(wages as any[])
      .filter((row) => String(row.payment_status || '').toLowerCase() !== 'paid')
      .slice(0, 1)
      .map((row) => ({
        severity: 'warning',
        subsystem: 'human_capital',
        issue: `Payroll remains pending for ${row.full_name ?? row.pay_period ?? 'current cycle'}`,
        recommendedAction: 'Review payroll funding and mark payment once released.',
        link: '/employees',
      })),
    ...recentSecurityIssues.slice(0, 2).map((row: any) => ({
      severity: 'security',
      subsystem: row.subsystem || 'settings',
      issue: row.description || 'Security warning detected',
      recommendedAction: 'Review audit activity and verify user access posture.',
      link: '/settings?panel=audit-log',
    })),
  ].slice(0, 8);

  const activity = (auditRows as any[]).map((row) => {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    return {
      id: row.id,
      actor: typeof meta.actorName === 'string' ? meta.actorName : 'System',
      action: titleize(typeof row.event_type === 'string' ? row.event_type : 'event'),
      module: titleize(row.subsystem),
      time: row.occurred_at,
      severity: typeof meta.severity === 'string' ? meta.severity : 'info',
      description: row.description,
    };
  });

  return {
    summary: {
      operationalHealth: healthScore,
      todaysRevenue: Number(todayRevenue.toFixed(2)),
      todaysExpenses: Number(todayExpenses.toFixed(2)),
      netPosition: Number((todayRevenue - todayExpenses).toFixed(2)),
      activeOrders: activeOrders.length,
      productionInProgress: productionInProgress.length,
      workersPresent,
      assetsAvailable,
      criticalAlerts: priorityAlerts.filter((row) => ['critical', 'security'].includes(row.severity)).length,
      pendingApprovals,
      inventoryValue: Number(stockItems.reduce((sum, item) => sum + toNumber(item.current_quantity), 0).toFixed(2)),
      lowStockItems: lowStock.length,
      pendingProcurement: (procurementShowcase as any[]).filter((row) => !hasStatus(row.status, 'received', 'rejected', 'cancelled')).length,
    productionOutput: Number((batches as any[]).reduce((sum, batch) => sum + toNumber(batch.produced_quantity || batch.quantity || 0), 0).toFixed(2)),
    activeSalesOrders: activeOrders.length,
      customerCount,
      laborSummary: {
        total: activeEmployees.length,
        present: workersPresent,
        absent: workersAbsent,
      },
      assetsRequiringService:
        (maintenanceSchedules as any[]).filter((row) => ['overdue', 'due_soon'].includes(normalizeStatus(computeMaintenanceStatus(row.due_date, row.status)))).length +
        workOrders.filter((row) => !hasStatus(row.status, 'completed', 'cancelled')).length,
      revenueSummary: {
        today: Number(todayRevenue.toFixed(2)),
        receivables: Number(finance.summary.receivables.toFixed(2)),
        payables: Number(finance.summary.payables.toFixed(2)),
      },
      reportsAlertsCount: priorityAlerts.length,
    },
    today: {
      productionScheduledToday: (batches as any[]).filter((batch) => batch.start_date && new Date(batch.start_date) >= today && new Date(batch.start_date) <= todayEnd).length,
      deliveriesDueToday: activeOrders.filter((order) => order.delivery_date && new Date(order.delivery_date) >= today && new Date(order.delivery_date) <= todayEnd).length,
      procurementReceiptsExpectedToday: (procurementShowcase as any[]).filter((row) => row.expected_date && new Date(row.expected_date) >= today && new Date(row.expected_date) <= todayEnd && !['received', 'rejected'].includes(String(row.status || '').toLowerCase())).length,
      workersAbsentToday: workersAbsent,
      maintenanceDueToday:
        (maintenanceSchedules as any[]).filter((row) => new Date(row.due_date) >= today && new Date(row.due_date) <= todayEnd && computeMaintenanceStatus(row.due_date, row.status) !== 'completed').length +
        workOrders.filter((row) => row.planned_end_date && new Date(row.planned_end_date) >= today && new Date(row.planned_end_date) <= todayEnd && !['completed', 'cancelled'].includes(String(row.status || '').toLowerCase())).length,
      paymentsDueToday: finance.receivables.filter((row) => row.dueDate && new Date(String(row.dueDate)) >= today && new Date(String(row.dueDate)) <= todayEnd).length + finance.payables.filter((row) => row.dueDate && new Date(String(row.dueDate)) >= today && new Date(String(row.dueDate)) <= todayEnd).length,
    },
    alerts: priorityAlerts,
    flow: [
      {
        key: 'procurement',
        label: 'Procurement',
        value: overdueProcurement.length || (procurementShowcase as any[]).filter((row) => !['received', 'rejected'].includes(String(row.status || '').toLowerCase())).length,
        status: overdueProcurement.length ? 'Attention needed' : 'On track',
        bottleneck: overdueProcurement.length ? `${overdueProcurement.length} overdue receipts` : `${(procurementShowcase as any[]).filter((row) => String(row.status || '').toLowerCase() === 'pending').length} waiting approval`,
      },
      {
        key: 'inventory',
        label: 'Inventory',
        value: reorderAlerts.length || lowStock.length,
        status: reorderAlerts.length ? 'Risk' : 'Stable',
        bottleneck: lowStock.length ? `${lowStock.length} reorder risks` : 'Stock levels within threshold',
      },
      {
        key: 'production',
        label: 'Production',
        value: productionInProgress.length,
        status: delayedProduction.length ? 'Delayed' : 'Running',
        bottleneck: batchesWaitingQuality.length ? `${batchesWaitingQuality.length} batches waiting quality` : 'No quality queue backlog',
      },
      {
        key: 'sales',
        label: 'Sales',
        value: activeOrders.length,
        status: activeOrders.length ? 'Active' : 'Quiet',
        bottleneck: activeOrders.filter((order) => mapOrderStatus(order.status) === 'pending').length ? `${activeOrders.filter((order) => mapOrderStatus(order.status) === 'pending').length} pending orders` : 'Orders moving through pipeline',
      },
      {
        key: 'finance',
        label: 'Finance',
        value: Number(finance.summary.receivables.toFixed(2)),
        status: finance.summary.receivables > finance.summary.payables ? 'Receivables heavy' : 'Balanced',
        bottleneck: finance.receivables.filter((row) => row.status === 'overdue').length ? `${finance.receivables.filter((row) => row.status === 'overdue').length} overdue receivables` : 'Collections within expectation',
      },
    ],
    activity,
    charts: {
      revenueExpenses: chartRevenueExpenses,
      productionOutputTrend: productionTrend,
      ordersByStatus,
      laborAttendanceWeek: attendanceThisWeek,
      maintenanceDueTrend,
    },
    context: {
      customers: customerCount,
      expectedReceiptsOpen: overdueProcurement.length + (procurementShowcase as any[]).filter((row) => String(row.status || '').toLowerCase() === 'approved').length,
      workOrdersOpen: workOrders.filter((row) => !['completed', 'cancelled'].includes(String(row.status || '').toLowerCase())).length,
      requestsTracked: productionRequestsCount,
    },
  };
}

router.get('/summary', async (req, res) => {
  try {
    const data = await loadDashboardData(req.user!.farmId ?? undefined);
    res.json(data.summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary', code: 'DB_ERROR' });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const data = await loadDashboardData(req.user!.farmId ?? undefined);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview', code: 'DB_ERROR' });
  }
});

router.get('/today', async (req, res) => {
  try {
    const data = await loadDashboardData(req.user!.farmId ?? undefined);
    res.json(data.today);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch dashboard today board', code: 'DB_ERROR' });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const data = await loadDashboardData(req.user!.farmId ?? undefined);
    res.json(data.alerts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch dashboard alerts', code: 'DB_ERROR' });
  }
});

router.get('/flow', async (req, res) => {
  try {
    const data = await loadDashboardData(req.user!.farmId ?? undefined);
    res.json(data.flow);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch dashboard flow', code: 'DB_ERROR' });
  }
});

router.get('/activity', async (req, res) => {
  try {
    const data = await loadDashboardData(req.user!.farmId ?? undefined);
    res.json(data.activity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch dashboard activity', code: 'DB_ERROR' });
  }
});

router.get('/charts', async (req, res) => {
  try {
    const data = await loadDashboardData(req.user!.farmId ?? undefined);
    res.json(data.charts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch dashboard charts', code: 'DB_ERROR' });
  }
});

export default router;
