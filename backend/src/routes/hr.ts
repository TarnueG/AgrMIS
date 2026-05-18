import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { logAuditEvent, clientInfo } from '../lib/audit';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { deactivateUser, reactivateUser } from '../lib/userStatus';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const action = req.method === 'GET'
    ? 'view' as const
    : req.method === 'POST'
      ? 'create' as const
      : req.method === 'DELETE'
        ? 'delete' as const
        : 'edit' as const;
  return requirePermission('human_capital', action)(req, res, next);
});

const noop = () => {};

const employeeSchema = z.object({
  fullName: z.string().min(2),
  dateOfBirth: z.string().optional(),
  placeOfBirth: z.string().optional(),
  employmentType: z.enum(['employee', 'daily', 'permanent', 'contract', 'seasonal', 'supervisor']),
  sector: z.enum(['crops', 'livestock', 'administration', 'general', 'crop', 'aquaculture', 'admin', 'logistics', 'production']).optional(),
  jobTitle: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  dateHired: z.string().optional(),
  salaryAmount: z.number().positive().optional(),
  bankId: z.string().optional(),
  department: z.string().optional(),
  nationalId: z.string().optional(),
  contractEndDate: z.string().optional(),
  notes: z.string().optional(),
});

const attendanceSchema = z.object({
  employeeId: z.string().uuid(),
  logDate: z.string().optional(),
  status: z.enum(['present', 'absent', 'half_day', 'leave', 'public_holiday']),
  clockIn: z.string().optional(),
  clockOut: z.string().optional(),
  hoursWorked: z.number().min(0).max(24).optional(),
  activityDescription: z.string().optional(),
  sector: z.string().optional(),
  notes: z.string().optional(),
});

const taskSchema = z.object({
  employeeId: z.string().uuid().optional().nullable(),
  taskTitle: z.string().min(2),
  description: z.string().optional(),
  sector: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  notes: z.string().optional(),
});

const leaveSchema = z.object({
  employeeId: z.string().uuid(),
  type: z.enum(['sick', 'personal', 'unpaid', 'approved_absence']),
  startDate: z.string(),
  endDate: z.string(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  notes: z.string().optional(),
});

function generatePersonnelId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `PER-${rand}`;
}

function generateContractorId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `CON-${rand}`;
}

function normalizeEmpType(t: string): string {
  return t === 'employee' ? 'permanent' : t;
}

function normalizeSector(s: string): string {
  if (s === 'crops') return 'crop';
  if (s === 'administration') return 'admin';
  return s;
}

function startOfDay(value?: string | Date): Date {
  const date = value ? new Date(value) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value?: string | Date): Date {
  const date = value ? new Date(value) : new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function toDateOnly(value?: string | Date): Date | null {
  if (!value) return null;
  return startOfDay(value);
}

function formatTimeField(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(11, 16);
}

function timeToDate(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.length === 5 ? `${value}:00` : value;
  return new Date(`1970-01-01T${normalized}`);
}

function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

function diffHours(clockIn?: Date | string | null, clockOut?: Date | string | null): number {
  if (!clockIn || !clockOut) return 0;
  const start = new Date(clockIn);
  const end = new Date(clockOut);
  const diff = (end.getTime() - start.getTime()) / 3600000;
  return diff > 0 ? Number(diff.toFixed(2)) : 0;
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const from = startOfDay(start);
  const to = startOfDay(end);
  const diff = Math.round((to.getTime() - from.getTime()) / 86400000);
  return diff + 1;
}

function deriveWorkerType(employee: any): string {
  const title = String(employee.job_title ?? '').toLowerCase();
  const type = String(employee.employment_type ?? '').toLowerCase();
  if (type === 'supervisor' || title.includes('supervisor') || title.includes('manager')) return 'supervisor';
  if (type === 'contract') return 'contract';
  if (type === 'daily' || type === 'seasonal') return 'daily';
  return 'permanent';
}

function statusBucket(task: any, today = startOfDay()): 'unassigned' | 'assigned' | 'in_progress' | 'completed' | 'overdue' {
  if (task.status === 'completed') return 'completed';
  if (task.status === 'in_progress') return 'in_progress';
  if (!task.employee_id) return 'unassigned';
  const dueDate = task.due_date ? startOfDay(task.due_date) : null;
  if (dueDate && dueDate.getTime() < today.getTime()) return 'overdue';
  return 'assigned';
}

async function autoRestoreSuspended(farmId: string | undefined) {
  if (!farmId) return;
  try {
    await prisma.employees.updateMany({
      where: {
        farm_id: farmId,
        status: 'suspended',
        suspension_expires_at: { lte: new Date() },
      } as any,
      data: { status: 'active', suspension_reason: null, suspension_expires_at: null } as any,
    });
  } catch {
    noop();
  }
}

async function getSupervisorAssignments(farmId: string | undefined) {
  const rows = await (prisma as any).supervisor_assignments.findMany({
    where: { farm_id: farmId, released_at: null },
    include: {
      supervisors: { select: { id: true, full_name: true, job_title: true } },
      employees: { select: { id: true, full_name: true } },
    },
  }).catch(() => []);
  const byEmployee = new Map<string, any>();
  const bySupervisor = new Map<string, any[]>();
  for (const row of rows as any[]) {
    byEmployee.set(row.employee_id, row.supervisors);
    const existing = bySupervisor.get(row.supervisor_id) ?? [];
    existing.push(row.employees);
    bySupervisor.set(row.supervisor_id, existing);
  }
  return { rows: rows as any[], byEmployee, bySupervisor };
}

async function getCurrentAssignments(farmId: string | undefined) {
  const tasks = await prisma.task_assignments.findMany({
    where: {
      farm_id: farmId,
      status: { in: ['pending', 'assigned', 'in_progress'] },
      employee_id: { not: null },
    } as any,
    orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
  });
  const assignmentMap = new Map<string, string>();
  for (const task of tasks as any[]) {
    if (!task.employee_id || assignmentMap.has(task.employee_id)) continue;
    assignmentMap.set(task.employee_id, task.task_title);
  }
  return assignmentMap;
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
    const prismaAny = prisma as any;
    const [expenseAccount, cashAccount] = await Promise.all([
      prismaAny.financial_accounts.findFirst({
        where: { farm_id: farmId, OR: [{ account_code: 'EXP-LABOR' }, { name: { contains: 'Labor', mode: 'insensitive' } }] },
      }),
      prismaAny.financial_accounts.findFirst({
        where: { farm_id: farmId, OR: [{ account_code: 'AST-CASH' }, { name: { contains: 'Cash', mode: 'insensitive' } }, { name: { contains: 'Bank', mode: 'insensitive' } }] },
      }),
    ]);

    const laborAccount = expenseAccount ?? await prismaAny.financial_accounts.create({
      data: {
        farm_id: farmId,
        account_code: 'EXP-LABOR',
        name: 'Labor Expense',
        account_type: 'expense',
        is_active: true,
      },
    });

    const bankAccount = cashAccount ?? await prismaAny.financial_accounts.create({
      data: {
        farm_id: farmId,
        account_code: 'AST-CASH',
        name: 'Farm Operating Cash',
        account_type: 'asset',
        is_active: true,
      },
    });

    const entry = await prismaAny.journal_entries.create({
      data: {
        farm_id: farmId,
        created_by: actorUserId,
        entry_date: startOfDay(),
        reference: `PAY-${sourceId.slice(0, 8).toUpperCase()}`,
        source_module: 'human_capital',
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
          account_id: laborAccount.id,
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
    noop();
  }
}

async function getPayrollPreview(farmId: string | undefined, month?: string) {
  const monthBase = month ? new Date(`${month}-01T00:00:00`) : new Date();
  const periodStart = startOfDay(new Date(monthBase.getFullYear(), monthBase.getMonth(), 1));
  const periodEnd = endOfDay(new Date(monthBase.getFullYear(), monthBase.getMonth() + 1, 0));

  const [employees, attendance, leaveRows, wages] = await Promise.all([
    prisma.employees.findMany({
      where: { farm_id: farmId, deleted_at: null } as any,
      orderBy: { full_name: 'asc' },
    }),
    prisma.attendance_logs.findMany({
      where: {
        log_date: { gte: periodStart, lte: periodEnd },
        employees: { farm_id: farmId, deleted_at: null },
      },
      include: { employees: { select: { id: true, full_name: true } } },
      orderBy: [{ log_date: 'asc' }, { created_at: 'asc' }],
    }),
    (prisma as any).leave_requests.findMany({
      where: {
        farm_id: farmId,
        approval_status: 'approved',
        start_date: { lte: periodEnd },
        end_date: { gte: periodStart },
      },
    }).catch(() => []),
    (prisma as any).personnel_wages.findMany({
      where: {
        farm_id: farmId,
        created_at: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { created_at: 'desc' },
    }),
  ]);

  const wageByEmployee = new Map<string, any>();
  for (const row of wages as any[]) {
    if (row.employee_id && !wageByEmployee.has(row.employee_id)) wageByEmployee.set(row.employee_id, row);
  }

  const attendanceByEmployee = new Map<string, any[]>();
  for (const row of attendance as any[]) {
    const list = attendanceByEmployee.get(row.employee_id) ?? [];
    list.push(row);
    attendanceByEmployee.set(row.employee_id, list);
  }

  const leaveByEmployee = new Map<string, any[]>();
  for (const row of leaveRows as any[]) {
    const list = leaveByEmployee.get(row.employee_id) ?? [];
    list.push(row);
    leaveByEmployee.set(row.employee_id, list);
  }

  return (employees as any[]).map((employee) => {
    const logs = attendanceByEmployee.get(employee.id) ?? [];
    const leaveItems = leaveByEmployee.get(employee.id) ?? [];
    const workerType = deriveWorkerType(employee);
    const daysWorked = logs.filter((log) => log.status === 'present' || log.status === 'half_day').length;
    const hoursWorked = logs.reduce((sum, log) => {
      const explicit = decimalToNumber(log.hours_worked);
      return sum + (explicit > 0 ? explicit : diffHours(log.clock_in, log.clock_out));
    }, 0);
    const overtime = logs.reduce((sum, log) => {
      const hours = decimalToNumber(log.hours_worked) || diffHours(log.clock_in, log.clock_out);
      return sum + Math.max(0, hours - 8);
    }, 0);
    const unpaidLeaveDays = leaveItems
      .filter((row) => row.leave_type === 'unpaid')
      .reduce((sum, row) => {
        const start = new Date(Math.max(startOfDay(row.start_date).getTime(), periodStart.getTime()));
        const end = new Date(Math.min(endOfDay(row.end_date).getTime(), periodEnd.getTime()));
        return sum + daysBetweenInclusive(start, end);
      }, 0);

    const dailyRate = decimalToNumber(employee.daily_wage);
    const monthlyRate = decimalToNumber(employee.monthly_salary);
    const baseRate = workerType === 'daily' ? dailyRate : monthlyRate;
    const hourlyRate = workerType === 'daily'
      ? dailyRate / 8
      : (monthlyRate > 0 ? monthlyRate / (22 * 8) : 0);
    const grossPay = workerType === 'daily'
      ? (daysWorked * dailyRate) + (overtime * hourlyRate)
      : monthlyRate + (overtime * hourlyRate);
    const deductions = unpaidLeaveDays * (workerType === 'daily' ? dailyRate : (monthlyRate / 22));
    const netPay = Math.max(grossPay - deductions, 0);
    const wageRecord = wageByEmployee.get(employee.id);

    return {
      id: wageRecord?.id ?? employee.id,
      employeeId: employee.id,
      personnelId: employee.personnel_id,
      worker: employee.full_name,
      workerType,
      sector: employee.sector,
      payType: workerType === 'daily' ? 'daily_rate' : 'monthly_salary',
      daysWorked,
      hoursWorked: Number(hoursWorked.toFixed(2)),
      overtime: Number(overtime.toFixed(2)),
      rate: Number(baseRate.toFixed(2)),
      grossPay: Number(grossPay.toFixed(2)),
      deductions: Number(deductions.toFixed(2)),
      netPay: Number(netPay.toFixed(2)),
      paymentStatus: wageRecord?.payment_status ?? 'pending',
      wageRecordId: wageRecord?.id ?? null,
      bankId: employee.bank_id,
      period: `${periodStart.toISOString().slice(0, 10)}:${periodEnd.toISOString().slice(0, 10)}`,
    };
  });
}

async function buildSummary(farmId: string | undefined) {
  const today = startOfDay();
  const monthStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEnd = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const [employees, todayLogs, contractors, tasks, wages, contractorPayments, supervisorState, leaveRows] = await Promise.all([
    prisma.employees.findMany({
      where: { farm_id: farmId, deleted_at: null } as any,
      orderBy: { full_name: 'asc' },
    }),
    prisma.attendance_logs.findMany({
      where: {
        log_date: today,
        employees: { farm_id: farmId, deleted_at: null },
      },
      include: { employees: { select: { id: true, employment_type: true, job_title: true } } },
    }),
    (prisma as any).contractors.findMany({ where: { farm_id: farmId } }),
    prisma.task_assignments.findMany({
      where: { farm_id: farmId, status: { not: 'cancelled' } },
    }),
    (prisma as any).personnel_wages.findMany({
      where: {
        farm_id: farmId,
        created_at: { gte: monthStart, lte: monthEnd },
      },
    }),
    (prisma as any).contractor_payments.findMany({
      where: {
        farm_id: farmId,
        created_at: { gte: monthStart, lte: monthEnd },
      },
    }),
    getSupervisorAssignments(farmId),
    (prisma as any).leave_requests.findMany({
      where: {
        farm_id: farmId,
        approval_status: 'approved',
        start_date: { lte: today },
        end_date: { gte: today },
      },
    }).catch(() => []),
  ]);

  const workforce = employees as any[];
  const workerIds = new Set(workforce.map((row) => row.id));
  const presentIds = new Set(
    (todayLogs as any[])
      .filter((row) => row.status === 'present' || row.status === 'half_day')
      .map((row) => row.employee_id),
  );
  const leaveIds = new Set((leaveRows as any[]).map((row) => row.employee_id));
  const absentCount = workforce.filter((employee) => {
    if (!workerIds.has(employee.id)) return false;
    if (employee.status === 'inactive' || employee.status === 'suspended') return true;
    if (presentIds.has(employee.id)) return false;
    return leaveIds.has(employee.id) || true;
  }).length - leaveIds.size + leaveIds.size;
  const dailyWorkersClockedIn = (todayLogs as any[]).filter((row) => deriveWorkerType(row.employees) === 'daily' && (row.status === 'present' || row.status === 'half_day')).length;
  const openFieldTasks = (tasks as any[]).filter((row) => statusBucket(row) !== 'completed').length;
  const payrollDue = (wages as any[]).filter((row) => row.payment_status !== 'paid').reduce((sum, row) => sum + decimalToNumber(row.amount), 0);
  const laborCostThisMonth = [...(wages as any[]), ...(contractorPayments as any[])].reduce((sum, row) => sum + decimalToNumber((row as any).amount), 0);
  const overtimeHours = (todayLogs as any[]).reduce((sum, row) => {
    const hours = decimalToNumber(row.hours_worked) || diffHours(row.clock_in, row.clock_out);
    return sum + Math.max(0, hours - 8);
  }, 0);

  return {
    totalWorkforce: workforce.length,
    presentToday: presentIds.size,
    absentOnLeave: absentCount,
    dailyWorkersClockedIn,
    openFieldTasks,
    payrollDue: Number(payrollDue.toFixed(2)),
    contractorsActive: (contractors as any[]).filter((row) => row.status === 'active' || row.status === 'finished').length,
    laborCostThisMonth: Number(laborCostThisMonth.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    supervisorsAssigned: supervisorState.bySupervisor.size,
    totalEmployees: workforce.length,
    pendingTasks: (tasks as any[]).filter((row) => row.status === 'pending').length,
    contractorCount: (contractors as any[]).length,
    activeCount: workforce.filter((row) => row.status === 'active').length,
    inactiveCount: workforce.filter((row) => row.status === 'inactive').length,
    suspendedCount: workforce.filter((row) => row.status === 'suspended').length,
    employeeCount: workforce.filter((row) => {
      const type = deriveWorkerType(row);
      return type === 'permanent' || type === 'contract' || type === 'supervisor';
    }).length,
    dailyCount: workforce.filter((row) => deriveWorkerType(row) === 'daily' && row.status === 'active').length,
    attendanceRate: workforce.length ? Math.round((presentIds.size / workforce.length) * 100) : 0,
  };
}

async function buildPersonnelRows(farmId: string | undefined, query: Record<string, string>) {
  await autoRestoreSuspended(farmId);
  const supervisorState = await getSupervisorAssignments(farmId);
  const currentAssignments = await getCurrentAssignments(farmId);
  const { sector, employment_type, search, status } = query;
  const employees = await prisma.employees.findMany({
    where: {
      farm_id: farmId,
      deleted_at: null,
      ...(sector && { sector }),
      ...(employment_type && { employment_type }),
      ...(status && status !== 'all' ? { status } : {}),
      ...(search && {
        OR: [
          { full_name: { contains: search, mode: 'insensitive' } },
          { personnel_id: { contains: search, mode: 'insensitive' } },
        ],
      }),
    } as any,
    orderBy: { full_name: 'asc' },
  });

  return (employees as any[]).map((employee) => {
    const supervisor = supervisorState.byEmployee.get(employee.id);
    return {
      ...employee,
      personnelId: employee.personnel_id,
      fullName: employee.full_name,
      workerType: deriveWorkerType(employee),
      hireDate: employee.date_hired,
      supervisor: supervisor?.full_name ?? null,
      currentAssignment: currentAssignments.get(employee.id) ?? null,
    };
  });
}

async function createPersonnelRecord(farmId: string, data: z.infer<typeof employeeSchema>) {
  let personnelId = generatePersonnelId();
  let attempts = 0;
  while (await prisma.employees.findFirst({ where: { personnel_id: personnelId } as any })) {
    personnelId = generatePersonnelId();
    if (++attempts > 10) throw new Error('Cannot generate unique personnel ID');
  }
  const empType = normalizeEmpType(data.employmentType);
  const isMonthly = empType === 'permanent' || empType === 'contract' || empType === 'supervisor';
  return prisma.employees.create({
    data: {
      full_name: data.fullName,
      employment_type: empType,
      job_title: data.jobTitle ?? null,
      department: data.department ?? null,
      sector: data.sector ? normalizeSector(data.sector) : null,
      phone: data.phone ?? null,
      national_id: data.nationalId ?? null,
      date_hired: data.dateHired ? startOfDay(data.dateHired) : null,
      contract_end_date: data.contractEndDate ? startOfDay(data.contractEndDate) : null,
      monthly_salary: isMonthly && data.salaryAmount ? data.salaryAmount : null,
      daily_wage: !isMonthly && data.salaryAmount ? data.salaryAmount : null,
      notes: data.notes ?? null,
      farm_id: farmId,
      personnel_id: personnelId,
      date_of_birth: data.dateOfBirth ? startOfDay(data.dateOfBirth) : null,
      place_of_birth: data.placeOfBirth ?? null,
      email: data.email || null,
      address: data.address ?? null,
      bank_id: data.bankId ?? null,
      status: 'active',
    } as any,
  });
}

async function updatePersonnelRecord(id: string, data: Partial<z.infer<typeof employeeSchema>>) {
  const existing = await prisma.employees.findFirst({ where: { id, deleted_at: null } as any });
  if (!existing) return null;
  const emp = existing as any;
  const empType = data.employmentType ? normalizeEmpType(data.employmentType) : null;
  const isMonthly = empType
    ? (empType === 'permanent' || empType === 'contract' || empType === 'supervisor')
    : (emp.employment_type === 'permanent' || emp.employment_type === 'contract' || emp.employment_type === 'supervisor');
  return prisma.employees.update({
    where: { id },
    data: {
      ...(data.fullName && { full_name: data.fullName }),
      ...(empType && { employment_type: empType }),
      ...(data.jobTitle !== undefined && { job_title: data.jobTitle }),
      ...(data.department !== undefined && { department: data.department }),
      ...(data.sector !== undefined && { sector: data.sector ? normalizeSector(data.sector) : null }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.bankId !== undefined && { bank_id: data.bankId }),
      ...(data.dateHired !== undefined && { date_hired: data.dateHired ? startOfDay(data.dateHired) : null }),
      ...(data.placeOfBirth !== undefined && { place_of_birth: data.placeOfBirth }),
      ...(data.dateOfBirth !== undefined && { date_of_birth: data.dateOfBirth ? startOfDay(data.dateOfBirth) : null }),
      ...(data.contractEndDate !== undefined && { contract_end_date: data.contractEndDate ? startOfDay(data.contractEndDate) : null }),
      ...(data.nationalId !== undefined && { national_id: data.nationalId }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.salaryAmount !== undefined && isMonthly ? { monthly_salary: data.salaryAmount, daily_wage: null } : {}),
      ...(data.salaryAmount !== undefined && !isMonthly ? { daily_wage: data.salaryAmount, monthly_salary: null } : {}),
      updated_at: new Date(),
    } as any,
  });
}

async function generatePayrollRecords(farmId: string, month?: string) {
  const preview = await getPayrollPreview(farmId, month);
  const prismaAny = prisma as any;
  let count = 0;
  for (const row of preview) {
    if (row.netPay <= 0) continue;
    if (row.wageRecordId) {
      await prismaAny.personnel_wages.update({
        where: { id: row.wageRecordId },
        data: {
          days_worked: row.daysWorked,
          amount: row.netPay,
          payment_status: row.paymentStatus === 'paid' ? 'paid' : 'pending',
          updated_at: new Date(),
        },
      });
    } else {
      await prismaAny.personnel_wages.create({
        data: {
          farm_id: farmId,
          employee_id: row.employeeId,
          personnel_id: row.personnelId,
          full_name: row.worker,
          employment_type: row.workerType,
          sector: row.sector,
          pay_period: row.period,
          days_worked: row.daysWorked,
          amount: row.netPay,
          bank_id: row.bankId,
          payment_status: 'pending',
        },
      });
    }
    count++;
  }
  return { count };
}

async function payPayrollRecord(wageId: string, farmId: string | undefined, actorUserId: string, req: any) {
  const wage = await (prisma as any).personnel_wages.findUnique({ where: { id: wageId } });
  if (!wage) return { error: 'Wage record not found', code: 'NOT_FOUND' as const };
  if (wage.payment_status === 'paid') return { error: 'Already paid', code: 'DUPLICATE' as const };
  const updated = await (prisma as any).personnel_wages.update({
    where: { id: wageId },
    data: { payment_status: 'paid', paid_at: new Date(), immutable: true, updated_at: new Date() },
  });
  await ensureJournalExpense(farmId, actorUserId, updated.id, decimalToNumber(updated.amount), `Payroll payment: ${updated.full_name}`);
  await logAuditEvent({
    actorUserId,
    eventType: 'payroll_paid',
    subsystem: 'human_capital',
    card: 'payroll',
    action: 'pay',
    description: `Payroll marked paid for ${updated.full_name}`,
    ...clientInfo(req),
    metadata: { wageId: updated.id, amount: decimalToNumber(updated.amount) },
  });
  return { updated };
}

router.get('/summary', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    await autoRestoreSuspended(farmId);
    res.json(await buildSummary(farmId));
  } catch {
    res.status(500).json({ error: 'Failed to fetch workforce summary', code: 'DB_ERROR' });
  }
});

router.get('/stats', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    await autoRestoreSuspended(farmId);
    res.json(await buildSummary(farmId));
  } catch {
    res.status(500).json({ error: 'Failed to fetch HR stats', code: 'DB_ERROR' });
  }
});

router.get('/personnel', async (req, res) => {
  try {
    res.json(await buildPersonnelRows(req.user!.farmId ?? undefined, req.query as Record<string, string>));
  } catch {
    res.status(500).json({ error: 'Failed to fetch personnel', code: 'DB_ERROR' });
  }
});

router.get('/employees', async (req, res) => {
  try {
    res.json(await buildPersonnelRows(req.user!.farmId ?? undefined, req.query as Record<string, string>));
  } catch {
    res.status(500).json({ error: 'Failed to fetch employees', code: 'DB_ERROR' });
  }
});

router.post('/personnel', async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  try {
    const employee = await createPersonnelRecord(req.user!.farmId, parsed.data);
    res.status(201).json(employee);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'National ID already registered', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to create employee', code: 'DB_ERROR' });
  }
});

router.post('/employees', async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  try {
    const employee = await createPersonnelRecord(req.user!.farmId, parsed.data);
    res.status(201).json(employee);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'National ID already registered', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to create employee', code: 'DB_ERROR' });
  }
});

router.patch('/personnel/:id', async (req, res) => {
  try {
    const existing = await prisma.employees.findFirst({ where: { id: req.params.id, deleted_at: null } as any });
    if (!existing) return res.status(404).json({ error: 'Employee not found', code: 'NOT_FOUND' });
    const emp = existing as any;
    if (emp.terminated_at) {
      const hoursElapsed = (Date.now() - new Date(emp.terminated_at).getTime()) / 3600000;
      if (hoursElapsed >= 48) return res.status(403).json({ error: 'Record is immutable', code: 'IMMUTABLE' });
    }
    const parsed = employeeSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
    const updated = await updatePersonnelRecord(req.params.id, parsed.data);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update employee', code: 'DB_ERROR' });
  }
});

router.patch('/employees/:id', async (req, res) => {
  try {
    const existing = await prisma.employees.findFirst({ where: { id: req.params.id, deleted_at: null } as any });
    if (!existing) return res.status(404).json({ error: 'Employee not found', code: 'NOT_FOUND' });
    const emp = existing as any;
    if (emp.terminated_at) {
      const hoursElapsed = (Date.now() - new Date(emp.terminated_at).getTime()) / 3600000;
      if (hoursElapsed >= 48) return res.status(403).json({ error: 'Record is immutable', code: 'IMMUTABLE' });
    }
    const parsed = employeeSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
    const updated = await updatePersonnelRecord(req.params.id, parsed.data);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update employee', code: 'DB_ERROR' });
  }
});

router.patch('/employees/:id/terminate', async (req, res) => {
  try {
    const existing = await prisma.employees.findFirst({ where: { id: req.params.id, deleted_at: null } as any });
    if (!existing) return res.status(404).json({ error: 'Employee not found', code: 'NOT_FOUND' });
    const emp = existing as any;
    if (emp.terminated_at) {
      const hoursElapsed = (Date.now() - new Date(emp.terminated_at).getTime()) / 3600000;
      if (hoursElapsed >= 48) return res.status(403).json({ error: 'Record is immutable', code: 'IMMUTABLE' });
    }
    const updated = await prisma.employees.update({
      where: { id: req.params.id },
      data: { status: 'inactive', terminated_at: new Date(), updated_at: new Date() } as any,
    });
    const userId = (updated as any).user_id;
    if (userId) await deactivateUser(userId).catch(() => {});
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to terminate employee', code: 'DB_ERROR' });
  }
});

router.patch('/employees/:id/unterminate', async (req, res) => {
  try {
    const existing = await prisma.employees.findFirst({ where: { id: req.params.id, deleted_at: null } as any });
    if (!existing) return res.status(404).json({ error: 'Employee not found', code: 'NOT_FOUND' });
    const emp = existing as any;
    if (!emp.terminated_at) return res.status(400).json({ error: 'Employee is not terminated', code: 'VALIDATION_ERROR' });
    const hoursElapsed = (Date.now() - new Date(emp.terminated_at).getTime()) / 3600000;
    if (hoursElapsed >= 48) return res.status(403).json({ error: 'Record is immutable after 48 hours', code: 'IMMUTABLE' });
    const updated = await prisma.employees.update({
      where: { id: req.params.id },
      data: { status: 'active', terminated_at: null, updated_at: new Date() } as any,
    });
    const userId = (updated as any).user_id;
    if (userId) await reactivateUser(userId).catch(() => {});
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to restore employee', code: 'DB_ERROR' });
  }
});

router.patch('/employees/:id/suspend', async (req, res) => {
  const schema = z.object({
    suspensionReason: z.string().min(1).max(300),
    suspensionExpiresAt: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  try {
    const updated = await prisma.employees.update({
      where: { id: req.params.id },
      data: {
        status: 'suspended',
        suspension_reason: parsed.data.suspensionReason,
        suspension_expires_at: new Date(parsed.data.suspensionExpiresAt),
        updated_at: new Date(),
      } as any,
    });
    const userId = (updated as any).user_id;
    if (userId) await deactivateUser(userId).catch(() => {});
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to suspend employee', code: 'DB_ERROR' });
  }
});

router.patch('/employees/:id/cancel-suspension', async (req, res) => {
  try {
    const updated = await prisma.employees.update({
      where: { id: req.params.id },
      data: { status: 'active', suspension_reason: null, suspension_expires_at: null, updated_at: new Date() } as any,
    });
    const userId = (updated as any).user_id;
    if (userId) await reactivateUser(userId).catch(() => {});
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to cancel suspension', code: 'DB_ERROR' });
  }
});

router.delete('/employees/:id', async (req, res) => {
  try {
    await prisma.employees.update({
      where: { id: req.params.id, deleted_at: null } as any,
      data: { deleted_at: new Date() } as any,
    });
    res.status(204).end();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Employee not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete employee', code: 'DB_ERROR' });
  }
});

const contractorSchema = z.object({
  contractorName: z.string().min(1),
  contractType: z.string().min(1),
  sector: z.enum(['crops', 'livestock']),
  amountCharged: z.number().positive(),
  description: z.string().max(300).optional(),
  bankId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get('/contractors', async (req, res) => {
  try {
    const contractors = await (prisma as any).contractors.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { created_at: 'desc' },
    });
    res.json(contractors);
  } catch {
    res.status(500).json({ error: 'Failed to fetch contractors', code: 'DB_ERROR' });
  }
});

router.post('/contractors', async (req, res) => {
  const parsed = contractorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  try {
    let contractorId = generateContractorId();
    let attempts = 0;
    while (await (prisma as any).contractors.findFirst({ where: { contractor_id: contractorId } })) {
      contractorId = generateContractorId();
      if (++attempts > 10) throw new Error('Cannot generate unique contractor ID');
    }
    const contractor = await (prisma as any).contractors.create({
      data: {
        farm_id: farmId,
        contractor_id: contractorId,
        contractor_name: d.contractorName,
        contract_type: d.contractType,
        sector: d.sector,
        amount_charged: d.amountCharged,
        description: d.description ?? null,
        bank_id: d.bankId ?? null,
        start_date: d.startDate ? startOfDay(d.startDate) : null,
        end_date: d.endDate ? startOfDay(d.endDate) : null,
      },
    });
    res.status(201).json(contractor);
  } catch {
    res.status(500).json({ error: 'Failed to create contractor', code: 'DB_ERROR' });
  }
});

router.patch('/contractors/:id/finish', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const contractor = await (prisma as any).contractors.findUnique({ where: { id: req.params.id } });
    if (!contractor) return res.status(404).json({ error: 'Contractor not found', code: 'NOT_FOUND' });
    if (contractor.payment_sent) return res.status(400).json({ error: 'Payment request already sent', code: 'DUPLICATE' });

    await (prisma as any).contractors.update({
      where: { id: req.params.id },
      data: { status: 'finished', payment_sent: true, updated_at: new Date() },
    });
    const payment = await (prisma as any).contractor_payments.create({
      data: {
        farm_id: farmId,
        contractor_id: contractor.id,
        contractor_name: contractor.contractor_name,
        contract_type: contractor.contract_type,
        sector: contractor.sector,
        amount: contractor.amount_charged,
        bank_id: contractor.bank_id,
        start_date: contractor.start_date,
        end_date: contractor.end_date,
      },
    });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Failed to finish contract', code: 'DB_ERROR' });
  }
});

router.get('/contractor-payments', async (req, res) => {
  try {
    const payments = await (prisma as any).contractor_payments.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { created_at: 'desc' },
    });
    res.json(payments);
  } catch {
    res.status(500).json({ error: 'Failed to fetch contractor payments', code: 'DB_ERROR' });
  }
});

router.patch('/contractor-payments/:id/pay', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const payment = await (prisma as any).contractor_payments.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ error: 'Payment not found', code: 'NOT_FOUND' });
    if (payment.payment_status === 'paid') return res.status(400).json({ error: 'Already paid', code: 'DUPLICATE' });

    const updated = await (prisma as any).contractor_payments.update({
      where: { id: req.params.id },
      data: { payment_status: 'paid', paid_at: new Date() },
    });
    await ensureJournalExpense(farmId, req.user!.userId, updated.id, decimalToNumber(updated.amount), `Contractor payment: ${updated.contractor_name}`);
    res.json({ ...updated, message: 'Payment Successful' });
  } catch {
    res.status(500).json({ error: 'Failed to process payment', code: 'DB_ERROR' });
  }
});

router.get('/attendance', async (req, res) => {
  const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const date = startOfDay(dateStr);
  const farmId = req.user!.farmId ?? undefined;
  try {
    const [workers, logs, leaveRows] = await Promise.all([
      buildPersonnelRows(farmId, { status: 'all' }),
      prisma.attendance_logs.findMany({
        where: {
          log_date: date,
          employees: { farm_id: farmId, deleted_at: null },
        },
        include: {
          employees: { select: { id: true, full_name: true, job_title: true, sector: true, employment_type: true, personnel_id: true } as any },
          users: { select: { id: true, full_name: true } as any },
        } as any,
        orderBy: { employees: { full_name: 'asc' } },
      }),
      (prisma as any).leave_requests.findMany({
        where: {
          farm_id: farmId,
          approval_status: 'approved',
          start_date: { lte: date },
          end_date: { gte: date },
        },
      }).catch(() => []),
    ]);

    const logByEmployee = new Map<string, any>();
    for (const log of logs as any[]) logByEmployee.set(log.employee_id, log);
    const leaveByEmployee = new Map<string, any>();
    for (const leave of leaveRows as any[]) leaveByEmployee.set(leave.employee_id, leave);

    const rows = workers.map((worker: any) => {
      const log = logByEmployee.get(worker.id);
      const leave = leaveByEmployee.get(worker.id);
      const checkIn = formatTimeField(log?.clock_in);
      const checkOut = formatTimeField(log?.clock_out);
      const hoursWorked = log ? decimalToNumber(log.hours_worked) || diffHours(log.clock_in, log.clock_out) : 0;
      const late = !!checkIn && checkIn > '08:15';
      const status = log?.status ?? (leave ? 'leave' : worker.status === 'active' ? 'absent' : worker.status);
      return {
        id: log?.id ?? null,
        employeeId: worker.id,
        personnelId: worker.personnelId,
        workerName: worker.fullName,
        sector: worker.sector,
        workerType: worker.workerType,
        supervisor: worker.supervisor,
        checkIn,
        checkOut,
        attendanceStatus: status,
        hoursWorked: Number(hoursWorked.toFixed(2)),
        late,
        recordedBy: log?.users?.full_name ?? null,
        leaveType: leave?.leave_type ?? null,
        notes: log?.notes ?? leave?.notes ?? null,
      };
    });

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch attendance', code: 'DB_ERROR' });
  }
});

router.get('/attendance-summary', async (req, res) => {
  const { employment_type } = req.query as Record<string, string>;
  const farmId = req.user!.farmId ?? undefined;
  try {
    const personnel = await buildPersonnelRows(farmId, employment_type ? { employment_type } : {});
    const result = personnel.map((e: any) => ({
      id: e.id,
      personnel_id: e.personnelId,
      full_name: e.fullName,
      employment_type: e.employment_type,
      sector: e.sector,
      days_worked: e.days_worked ?? 0,
      total_days_worked: e.total_days_worked ?? 0,
      daily_wage: e.daily_wage,
      monthly_salary: e.monthly_salary,
      bank_id: e.bank_id,
      status: e.status,
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch attendance summary', code: 'DB_ERROR' });
  }
});

router.post('/attendance', async (req, res) => {
  const parsed = attendanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const logDate = startOfDay(d.logDate);
  try {
    const existing = await prisma.attendance_logs.findFirst({
      where: { employee_id: d.employeeId, log_date: logDate },
    });

    const hoursWorked = d.hoursWorked
      ?? (d.clockIn && d.clockOut ? diffHours(timeToDate(d.clockIn), timeToDate(d.clockOut)) : null);

    const payload: any = {
      employee_id: d.employeeId,
      recorded_by: req.user!.userId,
      log_date: logDate,
      status: d.status,
      clock_in: d.clockIn ? timeToDate(d.clockIn) : (d.status === 'present' ? timeToDate('07:45') : null),
      clock_out: d.clockOut ? timeToDate(d.clockOut) : null,
      hours_worked: hoursWorked,
      activity_description: d.activityDescription ?? null,
      sector: d.sector ?? null,
      notes: d.notes ?? null,
    };

    const wasPresent = existing ? (existing.status === 'present' || existing.status === 'half_day') : false;
    const isPresent = d.status === 'present' || d.status === 'half_day';
    const log = existing
      ? await prisma.attendance_logs.update({ where: { id: existing.id }, data: payload })
      : await prisma.attendance_logs.create({ data: payload });

    if (!existing && isPresent) {
      await prisma.employees.update({
        where: { id: d.employeeId },
        data: { days_worked: { increment: 1 }, total_days_worked: { increment: 1 } } as any,
      });
    }
    if (existing && wasPresent !== isPresent) {
      await prisma.employees.update({
        where: { id: d.employeeId },
        data: {
          days_worked: { increment: isPresent ? 1 : -1 },
          total_days_worked: wasPresent && !isPresent ? undefined : { increment: isPresent ? 1 : 0 },
        } as any,
      }).catch(() => noop());
    }

    res.status(existing ? 200 : 201).json(log);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Attendance already logged for this employee today', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to log attendance', code: 'DB_ERROR' });
  }
});

router.post('/daily-log', async (req, res) => {
  const schema = z.object({ employeeIds: z.array(z.string().uuid()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const today = startOfDay();
  let submitted = 0;
  let skipped = 0;
  for (const employeeId of parsed.data.employeeIds) {
    try {
      await prisma.attendance_logs.create({
        data: { employee_id: employeeId, recorded_by: req.user!.userId, log_date: today, status: 'present', clock_in: timeToDate('07:45') },
      });
      await prisma.employees.update({
        where: { id: employeeId },
        data: { days_worked: { increment: 1 }, total_days_worked: { increment: 1 } } as any,
      });
      submitted++;
    } catch (err: any) {
      if (err.code === 'P2002') skipped++;
      else throw err;
    }
  }
  res.json({ submitted, skipped });
});

router.post('/reset-days', async (req, res) => {
  const schema = z.object({ employmentType: z.enum(['employee', 'daily', 'all']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const farmId = req.user!.farmId;
  const where: any = { farm_id: farmId, deleted_at: null };
  if (parsed.data.employmentType !== 'all') where.employment_type = parsed.data.employmentType;
  try {
    const result = await prisma.employees.updateMany({ where, data: { days_worked: 0 } as any });
    res.json({ reset: result.count });
  } catch {
    res.status(500).json({ error: 'Failed to reset days', code: 'DB_ERROR' });
  }
});

router.patch('/attendance/:id', async (req, res) => {
  const schema = z.object({
    status: z.enum(['present', 'absent', 'half_day', 'leave', 'public_holiday']).optional(),
    clockIn: z.string().optional().nullable(),
    clockOut: z.string().optional().nullable(),
    hoursWorked: z.number().min(0).max(24).optional(),
    activityDescription: z.string().optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const existing = await prisma.attendance_logs.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Log not found', code: 'NOT_FOUND' });
    const status = d.status ?? existing.status;
    const computedHours = d.hoursWorked
      ?? ((d.clockIn ?? formatTimeField(existing.clock_in)) && (d.clockOut ?? formatTimeField(existing.clock_out))
        ? diffHours(timeToDate(d.clockIn ?? formatTimeField(existing.clock_in)), timeToDate(d.clockOut ?? formatTimeField(existing.clock_out)))
        : undefined);
    const updated = await prisma.attendance_logs.update({
      where: { id: req.params.id },
      data: {
        ...(d.status !== undefined && { status }),
        ...(d.clockIn !== undefined && { clock_in: timeToDate(d.clockIn ?? null) }),
        ...(d.clockOut !== undefined && { clock_out: timeToDate(d.clockOut ?? null) }),
        ...(computedHours !== undefined && { hours_worked: computedHours }),
        ...(d.activityDescription !== undefined && { activity_description: d.activityDescription }),
        ...(d.notes !== undefined && { notes: d.notes }),
      },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update attendance log', code: 'DB_ERROR' });
  }
});

router.get('/salary', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const result = await getPayrollPreview(farmId, req.query.month as string | undefined);
    res.json(result.map((row) => ({
      id: row.employeeId,
      personnel_id: row.personnelId,
      full_name: row.worker,
      employment_type: row.workerType,
      sector: row.sector,
      days_worked: row.daysWorked,
      pay_period: 'Current Month',
      amount: row.grossPay,
      bank_id: row.bankId,
      status: row.paymentStatus,
      action: row.grossPay > 0 ? 'qualified' : 'review',
    })));
  } catch {
    res.status(500).json({ error: 'Failed to fetch salary data', code: 'DB_ERROR' });
  }
});

router.get('/payroll', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    res.json(await getPayrollPreview(farmId, req.query.month as string | undefined));
  } catch {
    res.status(500).json({ error: 'Failed to fetch payroll preview', code: 'DB_ERROR' });
  }
});

router.get('/wages', async (req, res) => {
  try {
    const wages = await (prisma as any).personnel_wages.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      orderBy: { created_at: 'desc' },
    });
    res.json(wages);
  } catch {
    res.status(500).json({ error: 'Failed to fetch wages', code: 'DB_ERROR' });
  }
});

router.post('/payroll/generate', async (req, res) => {
  try {
    res.json(await generatePayrollRecords(req.user!.farmId, req.body?.month as string | undefined));
  } catch {
    res.status(500).json({ error: 'Failed to generate payroll', code: 'DB_ERROR' });
  }
});

router.post('/wages/send-for-payment', async (req, res) => {
  try {
    const month = req.body?.month as string | undefined;
    res.json(await generatePayrollRecords(req.user!.farmId, month));
  } catch {
    res.status(500).json({ error: 'Failed to send for payment', code: 'DB_ERROR' });
  }
});

router.patch('/payroll/:id/pay', async (req, res) => {
  try {
    const result = await payPayrollRecord(req.params.id, req.user!.farmId ?? undefined, req.user!.userId, req);
    if ('error' in result) return res.status(result.code === 'NOT_FOUND' ? 404 : 400).json(result);
    const { updated } = result;
    res.json({ ...updated, message: 'Payment Successful' });
  } catch {
    res.status(500).json({ error: 'Failed to process payment', code: 'DB_ERROR' });
  }
});

router.patch('/wages/:id/pay', async (req, res) => {
  try {
    const result = await payPayrollRecord(req.params.id, req.user!.farmId ?? undefined, req.user!.userId, req);
    if ('error' in result) return res.status(result.code === 'NOT_FOUND' ? 404 : 400).json(result);
    const { updated } = result;
    res.json({ ...updated, message: 'Payment Successful' });
  } catch {
    res.status(500).json({ error: 'Failed to process payment', code: 'DB_ERROR' });
  }
});

router.get('/tasks', async (req, res) => {
  const { status, employee_id, sector } = req.query as Record<string, string>;
  const farmId = req.user!.farmId ?? undefined;
  try {
    const [tasks, supervisorState] = await Promise.all([
      prisma.task_assignments.findMany({
        where: {
          farm_id: farmId,
          ...(status && status !== 'all' ? { status } : { status: { not: 'cancelled' } }),
          ...(employee_id ? { employee_id } : {}),
          ...(sector ? { sector } : {}),
        } as any,
        include: {
          employees: { select: { id: true, full_name: true, sector: true, personnel_id: true } },
          users: { select: { id: true, full_name: true } },
        } as any,
        orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
      }),
      getSupervisorAssignments(farmId),
    ]);

    const rows = (tasks as any[]).map((task) => {
      const supervisor = task.employee_id ? supervisorState.byEmployee.get(task.employee_id) : null;
      return {
        ...task,
        workerName: task.employees?.full_name ?? null,
        personnelId: task.employees?.personnel_id ?? null,
        supervisor: supervisor?.full_name ?? task.users?.full_name ?? null,
        workflowStatus: statusBucket(task),
      };
    });

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tasks', code: 'DB_ERROR' });
  }
});

router.post('/tasks', async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    if (d.employeeId) {
      const employee = await prisma.employees.findFirst({ where: { id: d.employeeId, deleted_at: null } as any });
      if (!employee) return res.status(404).json({ error: 'Worker not found', code: 'NOT_FOUND' });
      if ((employee as any).status !== 'active') return res.status(400).json({ error: 'Suspended or terminated workers cannot receive new tasks', code: 'INVALID_WORKER' });
    }

    const task = await prisma.task_assignments.create({
      data: {
        employee_id: d.employeeId ?? null,
        assigned_by: req.user!.userId,
        task_title: d.taskTitle,
        description: d.description ?? null,
        sector: d.sector ?? null,
        due_date: d.dueDate ? startOfDay(d.dueDate) : null,
        priority: d.priority,
        notes: d.notes ?? null,
        farm_id: req.user!.farmId,
        status: d.employeeId ? 'assigned' : 'pending',
      },
      include: { employees: { select: { id: true, full_name: true, sector: true } } },
    });

    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'labor_task_created',
      subsystem: 'human_capital',
      card: 'task_assignment',
      action: 'create',
      description: `Labor task created: ${task.task_title}`,
      ...clientInfo(req),
      metadata: { taskId: task.id, employeeId: task.employee_id },
    });
    res.status(201).json(task);
  } catch {
    res.status(500).json({ error: 'Failed to create task', code: 'DB_ERROR' });
  }
});

router.patch('/tasks/:id', async (req, res) => {
  const schema = z.object({
    employeeId: z.string().uuid().optional().nullable(),
    status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']).optional(),
    notes: z.string().optional(),
    description: z.string().optional(),
    dueDate: z.string().optional().nullable(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    if (d.employeeId) {
      const employee = await prisma.employees.findFirst({ where: { id: d.employeeId, deleted_at: null } as any });
      if (!employee) return res.status(404).json({ error: 'Worker not found', code: 'NOT_FOUND' });
      if ((employee as any).status !== 'active') return res.status(400).json({ error: 'Suspended or terminated workers cannot receive new tasks', code: 'INVALID_WORKER' });
    }

    const task = await prisma.task_assignments.update({
      where: { id: req.params.id },
      data: {
        ...(d.employeeId !== undefined && { employee_id: d.employeeId }),
        ...(d.status !== undefined && { status: d.status }),
        ...(d.notes !== undefined && { notes: d.notes }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.dueDate !== undefined && { due_date: d.dueDate ? startOfDay(d.dueDate) : null }),
        ...(d.priority !== undefined && { priority: d.priority }),
        ...((d.status === 'completed') && { completed_at: new Date() }),
        updated_at: new Date(),
      },
      include: { employees: { select: { id: true, full_name: true, sector: true } } },
    });

    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'labor_task_updated',
      subsystem: 'human_capital',
      card: 'task_assignment',
      action: 'update',
      description: `Labor task updated: ${task.task_title}`,
      ...clientInfo(req),
      metadata: { taskId: task.id, status: task.status, employeeId: task.employee_id },
    });
    res.json(task);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update task', code: 'DB_ERROR' });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    await prisma.task_assignments.update({
      where: { id: req.params.id },
      data: { status: 'cancelled', updated_at: new Date() },
    });
    res.status(204).end();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete task', code: 'DB_ERROR' });
  }
});

router.get('/leave', async (req, res) => {
  try {
    const rows = await (prisma as any).leave_requests.findMany({
      where: { farm_id: req.user!.farmId ?? undefined },
      include: { employees: { select: { id: true, full_name: true, personnel_id: true, sector: true } } },
      orderBy: [{ start_date: 'desc' }, { created_at: 'desc' }],
    });
    res.json((rows as any[]).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      worker: row.employees?.full_name ?? null,
      personnelId: row.employees?.personnel_id ?? null,
      sector: row.employees?.sector ?? null,
      type: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
      approvalStatus: row.approval_status,
      notes: row.notes,
    })));
  } catch {
    res.status(500).json({ error: 'Failed to fetch leave records', code: 'DB_ERROR' });
  }
});

router.post('/leave', async (req, res) => {
  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const employee = await prisma.employees.findFirst({ where: { id: d.employeeId, deleted_at: null } as any });
    if (!employee) return res.status(404).json({ error: 'Worker not found', code: 'NOT_FOUND' });
    const row = await (prisma as any).leave_requests.create({
      data: {
        farm_id: req.user!.farmId,
        employee_id: d.employeeId,
        leave_type: d.type,
        start_date: startOfDay(d.startDate),
        end_date: startOfDay(d.endDate),
        approval_status: d.approvalStatus,
        notes: d.notes ?? null,
        created_by: req.user!.userId,
      },
    });
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: 'Failed to create leave request', code: 'DB_ERROR' });
  }
});

router.patch('/leave/:id', async (req, res) => {
  const parsed = leaveSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const row = await (prisma as any).leave_requests.update({
      where: { id: req.params.id },
      data: {
        ...(d.employeeId !== undefined && { employee_id: d.employeeId }),
        ...(d.type !== undefined && { leave_type: d.type }),
        ...(d.startDate !== undefined && { start_date: startOfDay(d.startDate) }),
        ...(d.endDate !== undefined && { end_date: startOfDay(d.endDate) }),
        ...(d.approvalStatus !== undefined && { approval_status: d.approvalStatus }),
        ...(d.notes !== undefined && { notes: d.notes }),
        updated_at: new Date(),
      },
    });
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'leave_updated',
      subsystem: 'human_capital',
      card: 'leave_tracker',
      action: 'update',
      description: `Leave request updated: ${req.params.id}`,
      ...clientInfo(req),
      metadata: { leaveId: req.params.id, approvalStatus: row.approval_status },
    });
    res.json(row);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Leave request not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update leave request', code: 'DB_ERROR' });
  }
});

export default router;
