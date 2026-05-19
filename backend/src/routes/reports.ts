import { Router } from 'express';
import prisma from '../lib/prisma';
import { clientInfo, logAuditEvent } from '../lib/audit';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { buildFinanceData } from './finance';

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
  return requirePermission('reports', action)(req, res, next);
});

type ReportFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  sector?: string;
  location?: string;
  productCategory?: string;
  department?: string;
};

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

function monthLabel(date: Date) {
  return date.toLocaleString('en-US', { month: 'short' });
}

function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

function titleize(value?: string | null) {
  if (!value) return 'N/A';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function matchesDate(value: string | Date | null | undefined, filters: ReportFilters) {
  if (!value) return true;
  const date = new Date(value);
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return true;
}

function includesText(value: string | null | undefined, needle?: string) {
  if (!needle || needle === 'all') return true;
  return String(value ?? '').toLowerCase().includes(needle.toLowerCase());
}

function parseFilters(query: Record<string, string | undefined>): ReportFilters {
  return {
    dateFrom: query.dateFrom ? startOfDay(query.dateFrom) : undefined,
    dateTo: query.dateTo ? endOfDay(query.dateTo) : undefined,
    sector: query.sector && query.sector !== 'all' ? query.sector : undefined,
    location: query.location && query.location !== 'all' ? query.location : undefined,
    productCategory: query.productCategory && query.productCategory !== 'all' ? query.productCategory : undefined,
    department: query.department && query.department !== 'all' ? query.department : undefined,
  };
}

function applyFinanceFilters<T extends { date?: string | Date | null; sector?: string | null; description?: string; productService?: string | null }>(
  rows: T[],
  filters: ReportFilters,
) {
  return rows.filter((row) => {
    if (!matchesDate(row.date ?? null, filters)) return false;
    if (filters.sector && !includesText(row.sector, filters.sector)) return false;
    if (filters.productCategory) {
      const text = `${row.productService ?? ''} ${row.description ?? ''}`;
      if (!includesText(text, filters.productCategory)) return false;
    }
    return true;
  });
}

function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return 'No data\n';
  const headers = Object.keys(rows[0]);
  const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => esc(row[header])).join(','))].join('\n');
}

async function buildReportsData(farmId: string | undefined, filters: ReportFilters) {
  const [
    finance,
    stockItems,
    reorderAlerts,
    salesOrders,
    purchaseOrders,
    productionLogs,
    productionBatches,
    employees,
    attendanceLogs,
    tasks,
    wages,
    maintenanceSchedules,
    maintenanceLogs,
    repairRecords,
    assets,
    auditEvents,
  ] = await Promise.all([
    buildFinanceData(farmId),
    prisma.stock_items.findMany({
      where: { farm_id: farmId, deleted_at: null },
      include: { item_categories: { select: { name: true, type: true } } },
    }),
    prisma.reorder_alerts.findMany({
      where: { stock_items: { farm_id: farmId, deleted_at: null } },
      include: { stock_items: { select: { id: true, name: true, storage_location: true } } },
      orderBy: { triggered_at: 'desc' },
    }),
    prisma.sales_orders.findMany({
      where: { farm_id: farmId },
      include: {
        customers: { select: { name: true } },
        sales_order_items: { include: { stock_items: { include: { item_categories: { select: { name: true } } } } } },
      },
      orderBy: { order_date: 'desc' },
    }),
    prisma.purchase_orders.findMany({
      where: { farm_id: farmId, status: { not: 'cancelled' } },
      include: {
        suppliers: { select: { name: true } },
        purchase_order_items: { include: { stock_items: { include: { item_categories: { select: { name: true } } } } } },
      },
      orderBy: { order_date: 'desc' },
    }),
    prisma.daily_production_logs.findMany({
      where: { farm_id: farmId },
      include: { stock_items: { include: { item_categories: { select: { name: true } } } }, users: { select: { full_name: true } } },
      orderBy: { log_date: 'desc' },
    }),
    prismaAny.inventory_production_batches.findMany({
      where: { farm_id: farmId },
      orderBy: { created_at: 'desc' },
    }).catch(() => []),
    prisma.employees.findMany({
      where: { farm_id: farmId, deleted_at: null },
      orderBy: { full_name: 'asc' },
    }),
    prisma.attendance_logs.findMany({
      where: { employees: { farm_id: farmId, deleted_at: null } },
      include: { employees: { select: { id: true, full_name: true, sector: true, department: true } } },
      orderBy: { log_date: 'desc' },
    }),
    prisma.task_assignments.findMany({
      where: { farm_id: farmId },
      include: { employees: { select: { id: true, full_name: true, sector: true, department: true } } },
      orderBy: { due_date: 'desc' },
    }),
    prismaAny.personnel_wages.findMany({
      where: { farm_id: farmId },
      orderBy: { created_at: 'desc' },
    }).catch(() => []),
    prismaAny.asset_maintenance_schedules.findMany({
      where: { farm_id: farmId },
      include: { assets: { select: { id: true, name: true, location: true } } },
      orderBy: { due_date: 'desc' },
    }).catch(() => []),
    prisma.asset_maintenance_logs.findMany({
      where: { assets: { farm_id: farmId, deleted_at: null } },
      include: { assets: { select: { id: true, name: true, location: true } } },
      orderBy: { maintenance_date: 'desc' },
    }),
    prismaAny.repair_records.findMany({
      where: { farm_id: farmId },
      include: { assets: { select: { id: true, name: true, location: true } } },
      orderBy: { completed_date: 'desc' },
    }).catch(() => []),
    prisma.assets.findMany({
      where: { farm_id: farmId, deleted_at: null },
      include: { work_orders: true },
    }),
    prismaAny.audit_events.findMany({
      where: {
        OR: [
          { event_type: 'login_failed' },
          { event_type: 'failed_authorization' },
          { event_type: 'finance_exported' },
          { event_type: 'report_exported' },
        ],
      },
      orderBy: { occurred_at: 'desc' },
      take: 50,
    }).catch(() => []),
  ]);

  const incomeRows = applyFinanceFilters(finance.incomes, filters);
  const expenseRows = applyFinanceFilters(finance.expenses, filters);
  const receivableRows = finance.receivables.filter((row) => matchesDate(row.dueDate ?? null, filters));
  const payableRows = finance.payables.filter((row) => matchesDate(row.dueDate ?? null, filters));

  const stockFiltered = stockItems.filter((item) => {
    if (filters.location && !includesText(item.storage_location, filters.location)) return false;
    if (filters.productCategory && !includesText(item.item_categories?.name, filters.productCategory)) return false;
    return true;
  });

  const salesFiltered = salesOrders.filter((order) => {
    if (!matchesDate(order.order_date, filters)) return false;
    if (filters.location && !includesText(order.customers?.name, filters.location)) return false;
    if (filters.productCategory) {
      const categories = order.sales_order_items.map((item) => item.stock_items?.item_categories?.name).join(' ');
      if (!includesText(categories, filters.productCategory)) return false;
    }
    return true;
  });

  const purchaseFiltered = purchaseOrders.filter((order) => {
    if (!matchesDate(order.order_date, filters)) return false;
    if (filters.productCategory) {
      const categories = order.purchase_order_items.map((item) => item.stock_items?.item_categories?.name).join(' ');
      const commodity = `${order.commodity ?? ''} ${categories}`;
      if (!includesText(commodity, filters.productCategory)) return false;
    }
    return true;
  });

  const productionFiltered = productionLogs.filter((row) => {
    if (!matchesDate(row.log_date, filters)) return false;
    if (filters.sector && !includesText(row.sector, filters.sector)) return false;
    if (filters.productCategory && !includesText(row.stock_items?.item_categories?.name, filters.productCategory)) return false;
    if (filters.location && !includesText(row.notes, filters.location)) return false;
    return true;
  });

  const employeeFiltered = employees.filter((row) => {
    if (filters.department && !includesText(row.department, filters.department)) return false;
    if (filters.sector && !includesText(row.sector, filters.sector)) return false;
    return true;
  });
  const employeeIds = new Set(employeeFiltered.map((row) => row.id));

  const attendanceFiltered = attendanceLogs.filter((row) => {
    if (!employeeIds.has(row.employee_id)) return false;
    return matchesDate(row.log_date, filters);
  });
  const taskFiltered = tasks.filter((row) => {
    if (row.employee_id && !employeeIds.has(row.employee_id)) return false;
    return matchesDate(row.created_at, filters);
  });
  const wageFiltered = (wages as any[]).filter((row) => {
    if (row.employee_id && !employeeIds.has(row.employee_id)) return false;
    return matchesDate(row.created_at, filters);
  });

  const maintenanceScheduleFiltered = (maintenanceSchedules as any[]).filter((row) => {
    if (!matchesDate(row.due_date, filters)) return false;
    if (filters.location && !includesText(row.assets?.location, filters.location)) return false;
    return true;
  });
  const maintenanceLogFiltered = maintenanceLogs.filter((row) => {
    if (!matchesDate(row.maintenance_date, filters)) return false;
    if (filters.location && !includesText(row.assets?.location, filters.location)) return false;
    return true;
  });
  const repairFiltered = (repairRecords as any[]).filter((row) => {
    if (!matchesDate(row.completed_date, filters)) return false;
    if (filters.location && !includesText(row.assets?.location, filters.location)) return false;
    return true;
  });

  const inventoryValue = stockFiltered.reduce((sum, item) => sum + toNumber(item.current_quantity) * toNumber((item as any).unit_cost), 0);
  const activeOrders = salesFiltered.filter((row) => !['delivered', 'cancelled', 'completed'].includes(String(row.status).toLowerCase())).length;
  const productionOutput = productionFiltered.reduce((sum, row) => sum + toNumber(row.quantity), 0) + (productionBatches as any[]).filter((row) => matchesDate(row.created_at, filters)).reduce((sum, row) => sum + toNumber(row.produced_quantity), 0);
  const procurementSpend = purchaseFiltered.reduce((sum, row) => sum + toNumber(row.total_amount), 0);
  const laborCost = wageFiltered.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const maintenanceCost = [...maintenanceLogFiltered, ...repairFiltered].reduce((sum, row: any) => sum + toNumber(row.cost), 0);

  const alerts: Array<Record<string, unknown>> = [];
  for (const alert of reorderAlerts.slice(0, 6)) {
    alerts.push({
      id: alert.id,
      severity: 'critical',
      subsystem: 'inventory',
      message: `${alert.stock_items.name} is below reorder threshold`,
      recommendedAction: 'Review stock level and raise procurement request immediately.',
      route: '/inventory',
    });
  }

  for (const po of purchaseFiltered.filter((row) => !['received', 'cancelled'].includes(String(row.status).toLowerCase()) && row.expected_delivery && new Date(row.expected_delivery) < startOfDay()).slice(0, 4)) {
    alerts.push({
      id: po.id,
      severity: 'high',
      subsystem: 'procurement',
      message: `Purchase order ${po.po_number} is overdue from ${po.suppliers?.name ?? 'supplier'}`,
      recommendedAction: 'Expedite supplier follow-up and update expected delivery.',
      route: '/procurement',
    });
  }

  for (const batch of (productionBatches as any[]).filter((row) => row.expected_completion && !row.actual_completion && new Date(row.expected_completion) < startOfDay()).slice(0, 4)) {
    alerts.push({
      id: batch.id,
      severity: 'high',
      subsystem: 'production',
      message: `Production batch ${batch.batch_number ?? batch.id} is delayed`,
      recommendedAction: 'Review bottlenecks, labor availability, and input readiness.',
      route: '/production',
    });
  }

  for (const order of salesFiltered.filter((row) => ['confirmed', 'packed', 'pending'].includes(String(row.status).toLowerCase()) && row.delivery_date && new Date(row.delivery_date) < startOfDay()).slice(0, 4)) {
    alerts.push({
      id: order.id,
      severity: 'medium',
      subsystem: 'sales',
      message: `Order ${order.order_number} is awaiting dispatch beyond due date`,
      recommendedAction: 'Check distribution planning and stock release.',
      route: '/orders',
    });
  }

  for (const row of receivableRows.filter((item) => item.status === 'overdue').slice(0, 4)) {
    alerts.push({
      id: row.id,
      severity: 'high',
      subsystem: 'finance',
      message: `${row.customer} has an overdue receivable on ${row.order}`,
      recommendedAction: 'Trigger collection follow-up and review payment terms.',
      route: '/finance',
    });
  }

  if (wageFiltered.some((row) => String(row.payment_status).toLowerCase() !== 'paid')) {
    alerts.push({
      id: 'payroll-pending',
      severity: 'medium',
      subsystem: 'human_capital',
      message: `${wageFiltered.filter((row) => String(row.payment_status).toLowerCase() !== 'paid').length} payroll records are pending`,
      recommendedAction: 'Review payroll approval and release payments.',
      route: '/employees',
    });
  }

  for (const row of maintenanceScheduleFiltered.filter((item) => String(item.status).toLowerCase() !== 'completed' && new Date(item.due_date) < startOfDay()).slice(0, 4)) {
    alerts.push({
      id: row.id,
      severity: 'high',
      subsystem: 'machinery',
      message: `${row.assets?.name ?? 'Asset'} has overdue maintenance`,
      recommendedAction: 'Move asset into service queue and review operational risk.',
      route: '/assets/machinery',
    });
  }

  for (const event of (auditEvents as any[]).filter((row) => ['login_failed', 'failed_authorization'].includes(row.event_type)).slice(0, 4)) {
    alerts.push({
      id: event.id,
      severity: 'high',
      subsystem: 'security',
      message: event.description ?? `Suspicious ${event.event_type} detected`,
      recommendedAction: 'Review account activity and verify whether access restrictions are required.',
      route: '/settings?panel=audit-log',
    });
  }

  const monthlyBase = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    return { key: `${date.getFullYear()}-${date.getMonth()}`, month: monthLabel(date) };
  });

  const financeTrend = monthlyBase.map((bucket) => {
    const cash = finance.cashFlow.find((row) => row.month === bucket.month);
    const salesAmount = salesFiltered
      .filter((row) => monthLabel(new Date(row.order_date)) === bucket.month)
      .reduce((sum, row) => sum + toNumber(row.total_amount), 0);
    const procurementAmount = purchaseFiltered
      .filter((row) => monthLabel(new Date(row.order_date)) === bucket.month)
      .reduce((sum, row) => sum + toNumber(row.total_amount), 0);
    return {
      month: bucket.month,
      revenue: cash?.income ?? 0,
      expenses: cash?.expenses ?? 0,
      netProfit: cash?.netProfit ?? 0,
      sales: Number(salesAmount.toFixed(2)),
      procurement: Number(procurementAmount.toFixed(2)),
    };
  });

  const productionBySectorMap = new Map<string, number>();
  for (const row of productionFiltered) {
    const key = titleize(row.sector);
    productionBySectorMap.set(key, (productionBySectorMap.get(key) ?? 0) + toNumber(row.quantity));
  }
  const lowStockRiskMap = new Map<string, number>();
  for (const alert of reorderAlerts) {
    const key = monthLabel(new Date(alert.triggered_at));
    lowStockRiskMap.set(key, (lowStockRiskMap.get(key) ?? 0) + 1);
  }
  const productionTrend = {
    outputBySector: Array.from(productionBySectorMap.entries()).map(([sector, output]) => ({ sector, output: Number(output.toFixed(2)) })),
    lowStockRisk: monthlyBase.map((bucket) => ({ month: bucket.month, count: lowStockRiskMap.get(bucket.month) ?? 0 })),
  };

  const laborCostMap = new Map<string, number>();
  for (const row of wageFiltered) {
    const key = monthLabel(new Date(row.created_at));
    laborCostMap.set(key, (laborCostMap.get(key) ?? 0) + toNumber(row.amount));
  }
  const laborTrend = monthlyBase.map((bucket) => ({
    month: bucket.month,
    laborCost: Number((laborCostMap.get(bucket.month) ?? 0).toFixed(2)),
    attendance: attendanceFiltered.filter((row) => monthLabel(new Date(row.log_date)) === bucket.month && ['present', 'half_day'].includes(String(row.status).toLowerCase())).length,
  }));

  const downtimeMap = new Map<string, number>();
  for (const row of repairFiltered) {
    const key = monthLabel(new Date(row.completed_date));
    downtimeMap.set(key, (downtimeMap.get(key) ?? 0) + toNumber(row.downtime_hours));
  }
  const orderStatusCounts = salesFiltered.reduce<Record<string, number>>((acc, row) => {
    const key = titleize(String(row.status));
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const assetTrend = {
    maintenanceDowntime: monthlyBase.map((bucket) => ({ month: bucket.month, downtimeHours: Number((downtimeMap.get(bucket.month) ?? 0).toFixed(2)) })),
    ordersByStatus: Object.entries(orderStatusCounts).map(([status, count]) => ({ status, count })),
  };

  const productMap = new Map<string, { product: string; quantity: number; revenue: number; cost: number }>();
  for (const order of salesFiltered) {
    for (const item of order.sales_order_items) {
      const product = item.stock_items?.name ?? 'Unknown product';
      const row = productMap.get(product) ?? { product, quantity: 0, revenue: 0, cost: 0 };
      row.quantity += toNumber(item.quantity);
      row.revenue += toNumber(item.line_total);
      row.cost += toNumber(item.quantity) * Math.max(toNumber((item.stock_items as any)?.unit_cost), 0);
      productMap.set(product, row);
    }
  }
  for (const row of productionFiltered) {
    const product = row.stock_items?.name ?? row.activity;
    const existing = productMap.get(product) ?? { product, quantity: 0, revenue: 0, cost: 0 };
    existing.quantity += toNumber(row.quantity);
    productMap.set(product, existing);
  }
  const topProducts = Array.from(productMap.values())
    .map((row) => ({
      product: row.product,
      quantity: Number(row.quantity.toFixed(2)),
      revenue: Number(row.revenue.toFixed(2)),
      margin: row.revenue > 0 ? Number((((row.revenue - row.cost) / row.revenue) * 100).toFixed(2)) : 0,
      trend: row.revenue >= row.cost ? 'up' : 'down',
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const supplierPerformance = purchaseFiltered.map((row) => {
    const lateDeliveries = (!['received'].includes(String(row.status).toLowerCase()) && row.expected_delivery && new Date(row.expected_delivery) < startOfDay()) ? 1 : 0;
    const reliability = row.total_amount ? Math.max(0, 100 - lateDeliveries * 20) : 100;
    return {
      supplier: row.suppliers?.name ?? 'Supplier',
      orders: 1,
      lateDeliveries,
      totalSpend: Number(toNumber(row.total_amount).toFixed(2)),
      reliability,
    };
  }).reduce<Record<string, { supplier: string; orders: number; lateDeliveries: number; totalSpend: number; reliability: number }>>((acc, row) => {
    const existing = acc[row.supplier] ?? { ...row, orders: 0, lateDeliveries: 0, totalSpend: 0, reliability: 100 };
    existing.orders += row.orders;
    existing.lateDeliveries += row.lateDeliveries;
    existing.totalSpend += row.totalSpend;
    existing.reliability = Math.max(0, 100 - (existing.lateDeliveries / existing.orders) * 100);
    acc[row.supplier] = existing;
    return acc;
  }, {});

  const workerProductivity = employeeFiltered.map((employee) => {
    const attendance = attendanceFiltered.filter((row) => row.employee_id === employee.id && ['present', 'half_day'].includes(String(row.status).toLowerCase())).length;
    const tasksCompleted = taskFiltered.filter((row) => row.employee_id === employee.id && String(row.status).toLowerCase() === 'completed').length;
    const hoursWorked = attendanceFiltered.filter((row) => row.employee_id === employee.id).reduce((sum, row) => sum + toNumber(row.hours_worked), 0);
    const cost = wageFiltered.filter((row) => row.employee_id === employee.id).reduce((sum, row) => sum + toNumber(row.amount), 0);
    return {
      worker: employee.full_name,
      sector: titleize(employee.sector),
      attendance,
      tasksCompleted,
      hoursWorked: Number(hoursWorked.toFixed(2)),
      cost: Number(cost.toFixed(2)),
    };
  }).sort((a, b) => b.tasksCompleted - a.tasksCompleted);

  const assetPerformance = assets.map((asset) => {
    const repairHours = repairFiltered.filter((row) => row.asset_id === asset.id).reduce((sum, row) => sum + toNumber(row.downtime_hours), 0);
    const openWorkOrders = asset.work_orders.filter((row) => !['completed', 'cancelled'].includes(String(row.status).toLowerCase())).length;
    const maintenanceCostByAsset =
      maintenanceLogFiltered.filter((row) => row.asset_id === asset.id).reduce((sum, row) => sum + toNumber(row.cost), 0) +
      repairFiltered.filter((row) => row.asset_id === asset.id).reduce((sum, row) => sum + toNumber(row.cost), 0);
    return {
      asset: asset.name,
      downtimeHours: Number(repairHours.toFixed(2)),
      openWorkOrders,
      maintenanceCost: Number(maintenanceCostByAsset.toFixed(2)),
    };
  }).sort((a, b) => b.downtimeHours - a.downtimeHours);

  const reportCards = [
    { key: 'operational-overview', title: 'Operational Overview', description: 'Cross-farm KPIs, throughput, alerts, and trend indicators.', metric: `${alerts.length} open alerts`, lastGenerated: new Date().toISOString(), exportType: 'operational-overview' },
    { key: 'inventory-risk', title: 'Inventory Risk Report', description: 'Low stock exposure, reorder triggers, and storage vulnerability.', metric: `${reorderAlerts.filter((row) => row.status === 'open').length} risk items`, lastGenerated: new Date().toISOString(), exportType: 'inventory-risk' },
    { key: 'procurement-performance', title: 'Procurement Performance', description: 'Supplier timing, spend concentration, and order backlog.', metric: `${purchaseFiltered.length} purchase orders`, lastGenerated: new Date().toISOString(), exportType: 'procurement-performance' },
    { key: 'sales-distribution', title: 'Sales & Distribution Report', description: 'Order pipeline, dispatch risk, and revenue conversion.', metric: `${activeOrders} active orders`, lastGenerated: new Date().toISOString(), exportType: 'sales-distribution' },
    { key: 'production-performance', title: 'Production Performance', description: 'Output trends, batch delays, and yield cadence.', metric: `${Number(productionOutput.toFixed(2))} output`, lastGenerated: new Date().toISOString(), exportType: 'production-performance' },
    { key: 'workforce-payroll', title: 'Workforce & Payroll Report', description: 'Attendance, task delivery, payroll cost, and worker productivity.', metric: `${Number(laborCost.toFixed(2))} labor cost`, lastGenerated: new Date().toISOString(), exportType: 'workforce-payroll' },
    { key: 'asset-maintenance', title: 'Asset Maintenance Report', description: 'Downtime, work orders, maintenance schedule exposure, and cost.', metric: `${Number(maintenanceCost.toFixed(2))} maintenance`, lastGenerated: new Date().toISOString(), exportType: 'asset-maintenance' },
    { key: 'finance-profitability', title: 'Finance & Profitability Report', description: 'Income, expenses, receivables, payables, and net profitability.', metric: `${Number(finance.summary.netProfit.toFixed(2))} net profit`, lastGenerated: new Date().toISOString(), exportType: 'finance-profitability' },
    { key: 'security-audit', title: 'Security & Audit Report', description: 'Failed logins, authorization issues, and export audit trail.', metric: `${(auditEvents as any[]).filter((row) => ['login_failed', 'failed_authorization'].includes(row.event_type)).length} security events`, lastGenerated: new Date().toISOString(), exportType: 'security-audit' },
  ];

  return {
    summary: {
      totalRevenue: Number(finance.summary.grossRevenue.toFixed(2)),
      totalExpenses: Number(finance.summary.totalExpenses.toFixed(2)),
      netProfit: Number(finance.summary.netProfit.toFixed(2)),
      inventoryValue: Number(inventoryValue.toFixed(2)),
      activeOrders,
      productionOutput: Number(productionOutput.toFixed(2)),
      procurementSpend: Number(procurementSpend.toFixed(2)),
      laborCost: Number(laborCost.toFixed(2)),
      maintenanceCost: Number(maintenanceCost.toFixed(2)),
      openAlerts: alerts.length,
    },
    reportCards,
    alerts: alerts.slice(0, 20),
    trends: {
      finance: financeTrend,
      production: productionTrend,
      labor: laborTrend,
      assets: assetTrend,
    },
    performance: {
      products: topProducts,
      suppliers: Object.values(supplierPerformance).sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 8),
      workers: workerProductivity.slice(0, 10),
      assets: assetPerformance.slice(0, 10),
    },
    previewData: {
      'operational-overview': {
        title: 'Operational Overview',
        summary: `Farm-wide executive view across finance, inventory, sales, production, labor, and assets for the selected filter set.`,
        keyFindings: [
          `${alerts.length} operational alerts currently require attention.`,
          `${activeOrders} orders remain active in the commercial pipeline.`,
          `${finance.summary.netProfit.toFixed(2)} net profit recorded for the filtered window.`,
        ],
        tablePreview: topProducts.slice(0, 5),
      },
      'inventory-risk': {
        title: 'Inventory Risk Report',
        summary: 'Exposure to low-stock and reorder events across key stock categories.',
        keyFindings: [
          `${reorderAlerts.filter((row) => row.status === 'open').length} open stock alerts detected.`,
          `${stockFiltered.filter((row) => toNumber(row.current_quantity) <= toNumber(row.reorder_threshold)).length} items are at or below threshold.`,
        ],
        tablePreview: reorderAlerts.slice(0, 5).map((row) => ({ item: row.stock_items.name, triggeredAt: row.triggered_at, location: row.stock_items.storage_location })),
      },
      'procurement-performance': {
        title: 'Procurement Performance',
        summary: 'Supplier timing, order execution, and spend concentration.',
        keyFindings: [
          `${purchaseFiltered.length} purchase orders are in scope.`,
          `${purchaseFiltered.filter((row) => row.expected_delivery && new Date(row.expected_delivery) < startOfDay() && String(row.status).toLowerCase() !== 'received').length} purchase orders are overdue.`,
        ],
        tablePreview: Object.values(supplierPerformance).slice(0, 5),
      },
      'sales-distribution': {
        title: 'Sales & Distribution Report',
        summary: 'Order status, dispatch readiness, and revenue flow.',
        keyFindings: [
          `${activeOrders} active orders remain in the queue.`,
          `${receivableRows.filter((row) => row.status === 'overdue').length} receivables are overdue.`,
        ],
        tablePreview: salesFiltered.slice(0, 5).map((row) => ({ order: row.order_number, customer: row.customers?.name, status: row.status, total: row.total_amount })),
      },
      'production-performance': {
        title: 'Production Performance',
        summary: 'Sector output, delayed batches, and throughput signals.',
        keyFindings: [
          `${productionOutput.toFixed(2)} production units recorded in the filtered window.`,
          `${(productionBatches as any[]).filter((row) => row.expected_completion && !row.actual_completion && new Date(row.expected_completion) < startOfDay()).length} batches are delayed.`,
        ],
        tablePreview: productionTrend.outputBySector,
      },
      'workforce-payroll': {
        title: 'Workforce & Payroll Report',
        summary: 'Attendance, task completion, and payroll burden by worker.',
        keyFindings: [
          `${laborCost.toFixed(2)} labor cost recorded.`,
          `${workerProductivity.filter((row) => row.tasksCompleted === 0 && row.attendance > 0).length} active workers have no completed tasks logged.`,
        ],
        tablePreview: workerProductivity.slice(0, 5),
      },
      'asset-maintenance': {
        title: 'Asset Maintenance Report',
        summary: 'Downtime, maintenance cost, and work order exposure.',
        keyFindings: [
          `${maintenanceScheduleFiltered.filter((row) => new Date(row.due_date) < startOfDay() && String(row.status).toLowerCase() !== 'completed').length} maintenance tasks are overdue.`,
          `${maintenanceCost.toFixed(2)} maintenance spend recorded.`,
        ],
        tablePreview: assetPerformance.slice(0, 5),
      },
      'finance-profitability': {
        title: 'Finance & Profitability Report',
        summary: 'Cross-module financial performance and margin position.',
        keyFindings: [
          `${finance.summary.grossRevenue.toFixed(2)} total revenue versus ${finance.summary.totalExpenses.toFixed(2)} total expense.`,
          `${finance.summary.profitMargin.toFixed(2)}% margin for the filtered window.`,
        ],
        tablePreview: financeTrend,
      },
      'security-audit': {
        title: 'Security & Audit Report',
        summary: 'Suspicious access events and reporting export trail.',
        keyFindings: [
          `${(auditEvents as any[]).filter((row) => ['login_failed', 'failed_authorization'].includes(row.event_type)).length} failed or suspicious access events recorded.`,
          `${(auditEvents as any[]).filter((row) => ['finance_exported', 'report_exported'].includes(row.event_type)).length} export audit events recorded.`,
        ],
        tablePreview: (auditEvents as any[]).slice(0, 8).map((row) => ({ occurredAt: row.occurred_at, eventType: row.event_type, subsystem: row.subsystem, description: row.description })),
      },
    } as Record<string, { title: string; summary: string; keyFindings: string[]; tablePreview: Record<string, unknown>[] }>,
  };
}

router.get('/summary', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json({ cards: data.summary, reportCards: data.reportCards });
  } catch {
    res.status(500).json({ error: 'Failed to fetch reports summary', code: 'DB_ERROR' });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json(data.alerts);
  } catch {
    res.status(500).json({ error: 'Failed to fetch report alerts', code: 'DB_ERROR' });
  }
});

router.get('/trends/finance', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json(data.trends.finance);
  } catch {
    res.status(500).json({ error: 'Failed to fetch finance trends', code: 'DB_ERROR' });
  }
});

router.get('/trends/production', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json(data.trends.production);
  } catch {
    res.status(500).json({ error: 'Failed to fetch production trends', code: 'DB_ERROR' });
  }
});

router.get('/trends/labor', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json(data.trends.labor);
  } catch {
    res.status(500).json({ error: 'Failed to fetch labor trends', code: 'DB_ERROR' });
  }
});

router.get('/trends/assets', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json(data.trends.assets);
  } catch {
    res.status(500).json({ error: 'Failed to fetch asset trends', code: 'DB_ERROR' });
  }
});

router.get('/performance/products', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json(data.performance.products);
  } catch {
    res.status(500).json({ error: 'Failed to fetch product performance', code: 'DB_ERROR' });
  }
});

router.get('/performance/suppliers', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json(data.performance.suppliers);
  } catch {
    res.status(500).json({ error: 'Failed to fetch supplier performance', code: 'DB_ERROR' });
  }
});

router.get('/performance/workers', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json(data.performance.workers);
  } catch {
    res.status(500).json({ error: 'Failed to fetch worker performance', code: 'DB_ERROR' });
  }
});

router.get('/performance/assets', async (req, res) => {
  try {
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    res.json(data.performance.assets);
  } catch {
    res.status(500).json({ error: 'Failed to fetch asset performance', code: 'DB_ERROR' });
  }
});

router.get('/:reportType/preview', async (req, res) => {
  try {
    const reportType = req.params.reportType;
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    const preview = data.previewData[reportType];
    if (!preview) return res.status(404).json({ error: 'Report preview not found', code: 'NOT_FOUND' });
    res.json({
      title: preview.title,
      dateRange: {
        from: (req.query.dateFrom as string) ?? null,
        to: (req.query.dateTo as string) ?? null,
      },
      summary: preview.summary,
      keyFindings: preview.keyFindings,
      tablePreview: preview.tablePreview,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch report preview', code: 'DB_ERROR' });
  }
});

router.get('/export/:reportType', async (req, res) => {
  try {
    const reportType = req.params.reportType;
    const data = await buildReportsData(req.user!.farmId ?? undefined, parseFilters(req.query as Record<string, string>));
    const preview = data.previewData[reportType];
    if (!preview) return res.status(404).json({ error: 'Report export not found', code: 'NOT_FOUND' });

    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'report_exported',
      subsystem: 'reports',
      card: reportType,
      action: 'export',
      description: `Exported report ${reportType}`,
      ipAddress: ip,
      userAgent,
      metadata: { reportType },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reportType}.csv"`);
    res.send(csv(preview.tablePreview));
  } catch {
    res.status(500).json({ error: 'Failed to export report', code: 'DB_ERROR' });
  }
});

export default router;
