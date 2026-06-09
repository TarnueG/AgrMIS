import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { deactivateUser, reactivateUser } from '../lib/userStatus';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'view' as const : req.method === 'POST' ? 'create' as const : req.method === 'DELETE' ? 'delete' as const : 'edit' as const;
  return requirePermission('human_capital', action)(req, res, next);
});

const noop = () => {};

function generatePersonnelId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `PER-${rand}`;
}

function normalizeEmpType(t: string): string {
  return t === 'employee' ? 'permanent' : t;
}

function normalizeSector(s: string): string {
  if (s === 'crops') return 'crop';
  if (s === 'administration') return 'admin';
  return s;
}

function generateContractorId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `CON-${rand}`;
}

async function autoRestoreSuspended(farmId: string | undefined) {
  if (!farmId) return;
  try {
    // Fetch first so we can reactivate the linked user accounts after restoring.
    const due = await prisma.employees.findMany({
      where: {
        farm_id: farmId,
        status: 'suspended',
        suspension_expires_at: { lte: new Date() },
      } as any,
      select: { id: true, user_id: true } as any,
    });
    if (!due.length) return;
    await prisma.employees.updateMany({
      where: { id: { in: due.map((e: any) => e.id) } },
      data: { status: 'active', suspension_reason: null, suspension_expires_at: null } as any,
    });
    // Restoring to Active reactivates the linked user account (idempotent).
    for (const e of due as any[]) {
      if (e.user_id) await reactivateUser(e.user_id).catch(() => {});
    }
  } catch { noop(); }
}

// ── Stats ──────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const farmId = req.user!.farmId ?? undefined;
  try {
    await autoRestoreSuspended(farmId);
    const [totalEmployees, presentToday, pendingTasks, contractorCount, activeCount, inactiveCount, suspendedCount, employeeCount, dailyCount] = await Promise.all([
      prisma.employees.count({ where: { farm_id: farmId, deleted_at: null } }),
      prisma.attendance_logs.count({
        where: { log_date: new Date(today), status: 'present', employees: { farm_id: farmId, deleted_at: null } },
      }),
      prisma.task_assignments.count({ where: { farm_id: farmId, status: 'pending' } }),
      (prisma as any).contractors.count({ where: { farm_id: farmId } }),
      prisma.employees.count({ where: { farm_id: farmId, deleted_at: null, status: 'active' } as any }),
      prisma.employees.count({ where: { farm_id: farmId, deleted_at: null, status: 'inactive' } as any }),
      prisma.employees.count({ where: { farm_id: farmId, deleted_at: null, status: 'suspended' } as any }),
      prisma.employees.count({ where: { farm_id: farmId, deleted_at: null, employment_type: { in: ['permanent', 'contract', 'employee'] }, status: { not: 'inactive' } } as any }),
      prisma.employees.count({ where: { farm_id: farmId, deleted_at: null, employment_type: 'daily', status: 'active' } as any }),
    ]);
    const presentAtLeastOnce = await prisma.employees.count({
      where: { farm_id: farmId, deleted_at: null, total_days_worked: { gt: 0 } } as any,
    });
    const attendanceRate = totalEmployees > 0 ? Math.round((presentAtLeastOnce / totalEmployees) * 100) : 0;
    res.json({ totalEmployees, presentToday, pendingTasks, contractorCount, activeCount, inactiveCount, suspendedCount, employeeCount, dailyCount, attendanceRate });
  } catch {
    res.status(500).json({ error: 'Failed to fetch HR stats', code: 'DB_ERROR' });
  }
});

// ── Employees ──────────────────────────────────────────────────────

const employeeSchema = z.object({
  fullName: z.string().min(2),
  dateOfBirth: z.string().optional(),
  placeOfBirth: z.string().optional(),
  employmentType: z.enum(['employee', 'daily', 'permanent', 'contract', 'seasonal']),
  sector: z.enum(['crops', 'livestock', 'administration', 'general', 'crop', 'aquaculture', 'admin', 'logistics']).optional(),
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

router.get('/employees', async (req, res) => {
  const { sector, employment_type, search, status } = req.query as Record<string, string>;
  const farmId = req.user!.farmId ?? undefined;
  try {
    await autoRestoreSuspended(farmId);
    const employees = await prisma.employees.findMany({
      where: {
        farm_id: farmId,
        deleted_at: null,
        ...(sector && { sector }),
        ...(employment_type && { employment_type }),
        ...(status && status !== 'all' ? { status } : {}),
        ...(search && { full_name: { contains: search, mode: 'insensitive' } }),
      } as any,
      orderBy: { full_name: 'asc' },
    });
    res.json(employees);
  } catch {
    res.status(500).json({ error: 'Failed to fetch employees', code: 'DB_ERROR' });
  }
});

router.post('/employees', async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  try {
    let personnelId = generatePersonnelId();
    let attempts = 0;
    while (await prisma.employees.findFirst({ where: { personnel_id: personnelId } as any })) {
      personnelId = generatePersonnelId();
      if (++attempts > 10) throw new Error('Cannot generate unique personnel ID');
    }
    const empType = normalizeEmpType(d.employmentType);
    const isMonthly = empType === 'permanent' || empType === 'contract';
    const employee = await prisma.employees.create({
      data: {
        full_name: d.fullName,
        employment_type: empType,
        job_title: d.jobTitle ?? null,
        department: d.department ?? null,
        sector: d.sector ? normalizeSector(d.sector) : null,
        phone: d.phone ?? null,
        national_id: d.nationalId ?? null,
        date_hired: d.dateHired ? new Date(d.dateHired) : null,
        contract_end_date: d.contractEndDate ? new Date(d.contractEndDate) : null,
        monthly_salary: isMonthly && d.salaryAmount ? d.salaryAmount : null,
        daily_wage: !isMonthly && d.salaryAmount ? d.salaryAmount : null,
        notes: d.notes ?? null,
        farm_id: farmId,
        personnel_id: personnelId,
        date_of_birth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
        place_of_birth: d.placeOfBirth ?? null,
        email: d.email || null,
        address: d.address ?? null,
        bank_id: d.bankId ?? null,
        status: 'active',
      } as any,
    });
    res.status(201).json(employee);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'National ID already registered', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to create employee', code: 'DB_ERROR' });
  }
});

router.patch('/employees/:id', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
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
    const d = parsed.data;
    const empType = d.employmentType ? normalizeEmpType(d.employmentType) : null;
    const isMonthly = empType ? (empType === 'permanent' || empType === 'contract') : (emp.employment_type === 'permanent' || emp.employment_type === 'contract');
    const updated = await prisma.employees.update({
      where: { id: req.params.id },
      data: {
        ...(d.fullName && { full_name: d.fullName }),
        ...(empType && { employment_type: empType }),
        ...(d.jobTitle !== undefined && { job_title: d.jobTitle }),
        ...(d.sector !== undefined && { sector: d.sector ? normalizeSector(d.sector) : null }),
        ...(d.phone !== undefined && { phone: d.phone }),
        ...(d.email !== undefined && { email: d.email || null }),
        ...(d.address !== undefined && { address: d.address }),
        ...(d.bankId !== undefined && { bank_id: d.bankId }),
        ...(d.dateHired !== undefined && { date_hired: d.dateHired ? new Date(d.dateHired) : null }),
        ...(d.placeOfBirth !== undefined && { place_of_birth: d.placeOfBirth }),
        ...(d.dateOfBirth !== undefined && { date_of_birth: d.dateOfBirth ? new Date(d.dateOfBirth) : null }),
        ...(d.salaryAmount !== undefined && isMonthly ? { monthly_salary: d.salaryAmount, daily_wage: null } : {}),
        ...(d.salaryAmount !== undefined && !isMonthly ? { daily_wage: d.salaryAmount, monthly_salary: null } : {}),
        updated_at: new Date(),
      } as any,
    });
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
    // Treat a date-only expiry as end-of-day so a suspension that ends "today"
    // is not instantly reverted by autoRestoreSuspended on the next fetch.
    const expires = new Date(parsed.data.suspensionExpiresAt);
    expires.setHours(23, 59, 59, 999);
    const updated = await prisma.employees.update({
      where: { id: req.params.id },
      data: {
        status: 'suspended',
        suspension_reason: parsed.data.suspensionReason,
        suspension_expires_at: expires,
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
      where: { id: req.params.id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    res.status(204).end();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Employee not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to delete employee', code: 'DB_ERROR' });
  }
});

// ── Contractors ───────────────────────────────────────────────────

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
        start_date: d.startDate ? new Date(d.startDate) : null,
        end_date: d.endDate ? new Date(d.endDate) : null,
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

// ── Contractor Payments (Finance) ─────────────────────────────────

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

    const [incomeResult, paidWages, paidContractors] = await Promise.all([
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
    ]);

    const income = Number(incomeResult._sum?.amount ?? 0);
    const wages = Number(paidWages._sum?.amount ?? 0);
    const contractors = Number(paidContractors._sum?.amount ?? 0);
    const netProfit = income - wages - contractors;

    if (netProfit < Number(payment.amount)) {
      return res.status(400).json({ error: 'Not enough funds to complete payment', code: 'INSUFFICIENT_FUNDS' });
    }

    const updated = await (prisma as any).contractor_payments.update({
      where: { id: req.params.id },
      data: { payment_status: 'paid', paid_at: new Date() },
    });
    res.json({ ...updated, message: 'Payment Successful' });
  } catch {
    res.status(500).json({ error: 'Failed to process payment', code: 'DB_ERROR' });
  }
});

// ── Attendance ──────────────────────────────────────────────────

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

router.get('/attendance', async (req, res) => {
  const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const farmId = req.user!.farmId ?? undefined;
  try {
    const logs = await prisma.attendance_logs.findMany({
      where: {
        log_date: new Date(dateStr),
        employees: { farm_id: farmId, deleted_at: null },
      },
      include: {
        employees: { select: { id: true, full_name: true, job_title: true, sector: true, employment_type: true, personnel_id: true } as any },
      },
      orderBy: { employees: { full_name: 'asc' } },
    });
    res.json(logs);
  } catch {
    res.status(500).json({ error: 'Failed to fetch attendance', code: 'DB_ERROR' });
  }
});

// Summary: total days worked per employee (all time)
router.get('/attendance-summary', async (req, res) => {
  const { employment_type } = req.query as Record<string, string>;
  const farmId = req.user!.farmId ?? undefined;
  try {
    const employees = await prisma.employees.findMany({
      where: {
        farm_id: farmId,
        deleted_at: null,
        ...(employment_type && employment_type !== 'all' ? { employment_type } : {}),
      } as any,
      orderBy: { full_name: 'asc' },
    });
    const result = employees.map((e: any) => ({
      id: e.id,
      personnel_id: e.personnel_id,
      full_name: e.full_name,
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
  const logDate = d.logDate ? new Date(d.logDate) : new Date();
  try {
    const log = await prisma.attendance_logs.create({
      data: {
        employee_id: d.employeeId,
        recorded_by: req.user!.userId,
        log_date: logDate,
        status: d.status,
        clock_in: d.clockIn ? new Date(`1970-01-01T${d.clockIn}`) : null,
        clock_out: d.clockOut ? new Date(`1970-01-01T${d.clockOut}`) : null,
        hours_worked: d.hoursWorked ?? null,
        activity_description: d.activityDescription ?? null,
        sector: d.sector ?? null,
        notes: d.notes ?? null,
      },
      include: {
        employees: { select: { id: true, full_name: true, job_title: true, sector: true } },
      },
    });
    res.status(201).json(log);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Attendance already logged for this employee today', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to log attendance', code: 'DB_ERROR' });
  }
});

// Returns each personnel whose last daily-log submission is still inside its rolling
// 24h window. The frontend uses this to keep those rows checked and locked until the
// window elapses (per-personnel, not a global midnight reset).
router.get('/daily-log/status', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const logs = await prisma.attendance_logs.findMany({
      where: {
        created_at: { gte: since },
        employees: { farm_id: farmId, deleted_at: null },
      },
      select: { employee_id: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    const latest = new Map<string, Date>();
    for (const l of logs) if (!latest.has(l.employee_id)) latest.set(l.employee_id, l.created_at);
    res.json(
      Array.from(latest.entries()).map(([employeeId, submittedAt]) => ({
        employeeId,
        submittedAt: submittedAt.toISOString(),
        resetsAt: new Date(submittedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to fetch daily log status', code: 'DB_ERROR' });
  }
});

router.post('/daily-log', async (req, res) => {
  const schema = z.object({ employeeIds: z.array(z.string().uuid()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let submitted = 0;
  let skipped = 0;
  for (const employeeId of parsed.data.employeeIds) {
    // Rolling 24h guard: skip if this personnel already submitted within the last 24h.
    const recent = await prisma.attendance_logs.findFirst({
      where: { employee_id: employeeId, created_at: { gte: since } },
      select: { id: true },
    });
    if (recent) { skipped++; continue; }
    try {
      await prisma.attendance_logs.create({
        data: { employee_id: employeeId, recorded_by: req.user!.userId, log_date: today, status: 'present' },
      });
      await prisma.employees.update({
        where: { id: employeeId },
        data: { days_worked: { increment: 1 }, total_days_worked: { increment: 1 } } as any,
      });
      submitted++;
    } catch (err: any) {
      if (err.code === 'P2002') { skipped++; } else { throw err; }
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
  const { clockOut, hoursWorked, activityDescription, notes } = req.body;
  try {
    const log = await prisma.attendance_logs.update({
      where: { id: req.params.id },
      data: {
        ...(clockOut !== undefined && { clock_out: clockOut ? new Date(`1970-01-01T${clockOut}`) : null }),
        ...(hoursWorked !== undefined && { hours_worked: hoursWorked }),
        ...(activityDescription !== undefined && { activity_description: activityDescription }),
        ...(notes !== undefined && { notes }),
      },
    });
    res.json(log);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Log not found', code: 'NOT_FOUND' });
    res.status(500).json({ error: 'Failed to update attendance log', code: 'DB_ERROR' });
  }
});

// ── Salary / Wages ──────────────────────────────────────────────

router.get('/salary', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    await autoRestoreSuspended(farmId);
    const employees = await prisma.employees.findMany({
      where: { farm_id: farmId, deleted_at: null } as any,
      orderBy: { full_name: 'asc' },
    });

    const now = new Date();
    const result = (employees as any[]).map((e) => {
      const daysWorked = e.days_worked ?? 0;
      const isMonthly = e.employment_type === 'employee' || e.employment_type === 'permanent' || e.employment_type === 'contract';
      const amount = isMonthly ? Number(e.monthly_salary ?? 0) : Number(e.daily_wage ?? 0) * daysWorked;
      const hiredAt = e.date_hired ? new Date(e.date_hired) : null;
      const payPeriod = isMonthly ? 'Monthly' : 'Every 15 days';
      let payPeriodReached = false;
      if (hiredAt) {
        const daysSinceHired = Math.floor((now.getTime() - hiredAt.getTime()) / 86400000);
        payPeriodReached = isMonthly ? daysSinceHired >= 30 : daysSinceHired >= 15;
      }
      const action = (e.status === 'active' && payPeriodReached) ? 'qualified' : 'review';
      return {
        id: e.id,
        personnel_id: e.personnel_id,
        full_name: e.full_name,
        employment_type: e.employment_type,
        sector: e.sector,
        days_worked: daysWorked,
        pay_period: payPeriod,
        amount,
        bank_id: e.bank_id,
        status: e.status,
        action,
        daily_wage: e.daily_wage,
        monthly_salary: e.monthly_salary,
      };
    });
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch salary data', code: 'DB_ERROR' });
  }
});

// ── Personnel Wages (Finance) ──────────────────────────────────

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

router.post('/wages/send-for-payment', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const employees = await prisma.employees.findMany({
      where: { farm_id: farmId, deleted_at: null } as any,
    });

    const now = new Date();
    const toSend: any[] = [];
    for (const e of employees as any[]) {
      const isMonthly = e.employment_type === 'employee' || e.employment_type === 'permanent' || e.employment_type === 'contract';
      const daysWorked = e.days_worked ?? 0;
      const amount = isMonthly ? Number(e.monthly_salary ?? 0) : Number(e.daily_wage ?? 0) * daysWorked;
      if (amount <= 0) continue;
      const hiredAt = e.date_hired ? new Date(e.date_hired) : null;
      let payPeriodReached = false;
      if (hiredAt) {
        const daysSinceHired = Math.floor((now.getTime() - hiredAt.getTime()) / 86400000);
        payPeriodReached = isMonthly ? daysSinceHired >= 30 : daysSinceHired >= 15;
      }
      if (e.status === 'active' && payPeriodReached) {
        toSend.push({
          farm_id: farmId,
          employee_id: e.id,
          personnel_id: e.personnel_id,
          full_name: e.full_name,
          employment_type: e.employment_type,
          sector: e.sector,
          pay_period: isMonthly ? 'Monthly' : 'Every 15 days',
          days_worked: daysWorked,
          amount,
          bank_id: e.bank_id,
        });
      }
    }

    if (!toSend.length) return res.status(400).json({ error: 'No qualified personnel to send', code: 'EMPTY' });

    const created = await (prisma as any).personnel_wages.createMany({ data: toSend, skipDuplicates: true });
    res.json({ count: created.count });
  } catch {
    res.status(500).json({ error: 'Failed to send for payment', code: 'DB_ERROR' });
  }
});

router.patch('/wages/:id/pay', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    const wage = await (prisma as any).personnel_wages.findUnique({ where: { id: req.params.id } });
    if (!wage) return res.status(404).json({ error: 'Wage record not found', code: 'NOT_FOUND' });
    if (wage.payment_status === 'paid') return res.status(400).json({ error: 'Already paid', code: 'DUPLICATE' });

    const [incomeResult, paidWages, paidContractors] = await Promise.all([
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
    ]);

    const income = Number(incomeResult._sum?.amount ?? 0);
    const wages = Number(paidWages._sum?.amount ?? 0);
    const contractors = Number(paidContractors._sum?.amount ?? 0);
    const netProfit = income - wages - contractors;

    if (netProfit < Number(wage.amount)) {
      return res.status(400).json({ error: 'Not enough funds to complete payment', code: 'INSUFFICIENT_FUNDS' });
    }

    const updated = await (prisma as any).personnel_wages.update({
      where: { id: req.params.id },
      data: { payment_status: 'paid', paid_at: new Date(), immutable: true, updated_at: new Date() },
    });
    res.json({ ...updated, message: 'Payment Successful' });
  } catch {
    res.status(500).json({ error: 'Failed to process payment', code: 'DB_ERROR' });
  }
});

// ── Tasks ───────────────────────────────────────────────────────

const taskSchema = z.object({
  employeeId: z.string().uuid(),
  taskTitle: z.string().min(2),
  description: z.string().optional(),
  sector: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  notes: z.string().optional(),
});

router.get('/tasks', async (req, res) => {
  const { status, employee_id, sector } = req.query as Record<string, string>;
  try {
    const tasks = await prisma.task_assignments.findMany({
      where: {
        farm_id: req.user!.farmId ?? undefined,
        status: status ? status : { not: 'cancelled' },
        ...(employee_id && { employee_id }),
        ...(sector && { sector }),
      },
      include: { employees: { select: { id: true, full_name: true, sector: true } } },
      orderBy: [{ status: 'asc' }, { due_date: 'asc' }],
    });
    res.json(tasks);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tasks', code: 'DB_ERROR' });
  }
});

router.post('/tasks', async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  try {
    const task = await prisma.task_assignments.create({
      data: {
        employee_id: d.employeeId,
        assigned_by: req.user!.userId,
        task_title: d.taskTitle,
        description: d.description ?? null,
        sector: d.sector ?? null,
        due_date: d.dueDate ? new Date(d.dueDate) : null,
        priority: d.priority,
        notes: d.notes ?? null,
        farm_id: req.user!.farmId,
        status: 'pending',
      },
      include: { employees: { select: { id: true, full_name: true, sector: true } } },
    });
    res.status(201).json(task);
  } catch {
    res.status(500).json({ error: 'Failed to create task', code: 'DB_ERROR' });
  }
});

router.patch('/tasks/:id', async (req, res) => {
  const { status, notes, description } = req.body;
  try {
    const task = await prisma.task_assignments.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        ...(description !== undefined && { description }),
        ...(status === 'completed' && { completed_at: new Date() }),
        updated_at: new Date(),
      },
      include: { employees: { select: { id: true, full_name: true, sector: true } } },
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

// ── Human Capital Analytics ─────────────────────────────────────────

const DAY_MS = 86400000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEMO_COLORS = ['#3f9142', '#675CB0', '#3B79A0', '#e0a106', '#BF5046', '#84cc16', '#8A6FE8', '#3DA5E0'];
const isMonthlyType = (t?: string | null) => t === 'permanent' || t === 'contract' || t === 'employee' || t === 'seasonal';
const initialsOf = (name?: string | null) => String(name ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?';

// Monday-anchored start of the ISO week containing `d`.
function weekStart(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

router.get('/analytics/overview', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  try {
    await autoRestoreSuspended(farmId);
    const now = new Date();
    const ws = weekStart(now);
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const since60 = new Date(now.getTime() - 60 * DAY_MS);

    const [employees, contractors, attendance, tasks] = await Promise.all([
      prisma.employees.findMany({ where: { farm_id: farmId, deleted_at: null } as any }),
      (prisma as any).contractors.findMany({ where: { farm_id: farmId } }),
      prisma.attendance_logs.findMany({
        where: { log_date: { gte: weekStart(new Date(now.getTime() - 21 * DAY_MS)) }, employees: { farm_id: farmId, deleted_at: null } },
        include: { employees: { select: { id: true, full_name: true } } },
      }),
      // Personnel tasks live in farm_tasks (raw-SQL table), not task_assignments.
      prisma.$queryRaw<any[]>`
        SELECT t.id, t.task_name, t.status, t.start_date, t.end_date, t.created_at, t.updated_at,
               t.personnel_id, t.men_required, t.equipment_id, e.full_name AS personnel_name,
               (SELECT COUNT(*)::int FROM farm_task_equipment WHERE task_id = t.id) AS equipment_count
        FROM farm_tasks t
        LEFT JOIN employees e ON e.id = t.personnel_id
        WHERE t.farm_id = ${farmId ?? null}::uuid AND t.status <> 'cancelled'
      `,
    ]);

    const active = (employees as any[]).filter((e) => e.status !== 'inactive');
    const dailyWorkers = active.filter((e) => e.employment_type === 'daily');
    const regularEmployees = active.filter((e) => e.employment_type !== 'daily');
    const totalWorkforce = active.length + contractors.length;

    // Trend helper: count of records created in last 30d vs prior 30d.
    const hiredIn = (arr: any[], from: Date, to: Date) => arr.filter((e) => { const d = new Date(e.date_hired ?? e.created_at); return d >= from && d < to; }).length;
    const trendOf = (arr: any[]) => { const cur = hiredIn(arr, since30, now); const prev = hiredIn(arr, since60, since30); const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0); return { trendPct: Math.abs(pct), trendUp: pct >= 0 }; };
    // 6-week cumulative headcount sparkline.
    const sparkOf = (arr: any[]) => Array.from({ length: 6 }, (_, i) => { const cutoff = new Date(now.getTime() - (5 - i) * 7 * DAY_MS); return arr.filter((e) => new Date(e.date_hired ?? e.created_at) <= cutoff).length; });

    const kpis = {
      workforce: { value: totalWorkforce, ...trendOf([...active, ...contractors]), spark: sparkOf([...active, ...contractors]), sub: `${active.length} staff · ${contractors.length} contractors` },
      employees: { value: regularEmployees.length, ...trendOf(regularEmployees), spark: sparkOf(regularEmployees), sub: 'Permanent & contract' },
      dailyWorkers: { value: dailyWorkers.length, ...trendOf(dailyWorkers), spark: sparkOf(dailyWorkers), sub: 'Active daily workers' },
      contractors: { value: contractors.length, ...trendOf(contractors), spark: sparkOf(contractors), sub: 'External contracts' },
    };

    // Performance series — last 7 days: attendance rate + task on-time rate.
    const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate() + i); return d; });
    const todayIdx = (now.getDay() + 6) % 7;
    const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const attRate: number[] = [];
    const taskRate: number[] = [];
    for (const day of last7) {
      const dayLogs = (attendance as any[]).filter((l) => sameDay(new Date(l.log_date), day));
      const present = dayLogs.filter((l) => l.status === 'present').length + dayLogs.filter((l) => l.status === 'half_day').length * 0.5;
      attRate.push(dayLogs.length ? Math.round((present / dayLogs.length) * 100) : 0);
      const dueTasks = (tasks as any[]).filter((t) => t.end_date && sameDay(new Date(t.end_date), day));
      const endOfDay = new Date(day); endOfDay.setHours(23, 59, 59, 999);
      const doneOnTime = dueTasks.filter((t) => t.status === 'completed' && t.updated_at && new Date(t.updated_at) <= endOfDay).length;
      taskRate.push(dueTasks.length ? Math.round((doneOnTime / dueTasks.length) * 100) : 0);
    }
    const performance = { labels: WEEKDAYS, attendance: attRate, taskOnTime: taskRate, todayIdx, todayRate: attRate[todayIdx] ?? 0 };

    // Top performers — ranked by number of completed tasks (farm_tasks).
    const completedByPerson: Record<string, number> = {};
    for (const t of tasks as any[]) { if (t.status === 'completed' && t.personnel_id) completedByPerson[t.personnel_id] = (completedByPerson[t.personnel_id] || 0) + 1; }
    const maxCompleted = Math.max(1, ...Object.values(completedByPerson), 0);
    const topPerformers = [...active]
      .map((e: any) => ({ e, done: completedByPerson[e.id] ?? 0 }))
      .sort((a, b) => b.done - a.done)
      .slice(0, 5)
      .map(({ e, done }) => ({ id: e.id, name: e.full_name, jobTitle: e.job_title || (e.sector ? `${e.sector} worker` : 'Worker'), tasksDone: done, ratePct: Math.round((done / maxCompleted) * 100), initials: initialsOf(e.full_name) }));

    // Task completion checklist (active tasks first, then recently completed).
    const taskList = [...(tasks as any[])]
      .sort((a, b) => { const order: Record<string, number> = { active: 0, completed: 1 }; return (order[a.status] ?? 2) - (order[b.status] ?? 2); })
      .slice(0, 6)
      .map((t) => ({ id: t.id, title: t.task_name, status: t.status === 'active' ? 'in_progress' : t.status, priority: 'normal', due: t.end_date, assignee: initialsOf(t.personnel_name), progressPct: t.status === 'completed' ? 100 : 55 }));
    const totalTasks = (tasks as any[]).length;
    const completedTasks = (tasks as any[]).filter((t) => t.status === 'completed').length;

    // Attendance donut over last 30 days.
    const recentAtt = (attendance as any[]).filter((l) => new Date(l.log_date) >= since30);
    const onTime = recentAtt.filter((l) => l.status === 'present').length;
    const late = recentAtt.filter((l) => l.status === 'half_day' || l.status === 'leave').length;
    const absent = recentAtt.filter((l) => l.status === 'absent').length;
    const attTotal = onTime + late + absent;
    const empLogs = recentAtt.filter((l: any) => regularEmployees.some((e: any) => e.id === l.employee_id));
    const dailyLogs = recentAtt.filter((l: any) => dailyWorkers.some((e: any) => e.id === l.employee_id));
    const presentPctOf = (logs: any[]) => { const p = logs.filter((l) => l.status === 'present').length; return logs.length ? Math.round((p / logs.length) * 100) : 0; };
    const attendanceRate = {
      onTime, late, absent, presentPct: attTotal ? Math.round((onTime / attTotal) * 100) : 0,
      employees: { pct: presentPctOf(empLogs) }, dailyWorkers: { pct: presentPctOf(dailyLogs) },
    };

    // Job position pie (job_title), grouped.
    const jobMap: Record<string, number> = {};
    for (const e of active as any[]) { const k = e.job_title || (e.sector ? `${e.sector[0].toUpperCase()}${e.sector.slice(1)}` : 'Unassigned'); jobMap[k] = (jobMap[k] || 0) + 1; }
    const jobEntries = Object.entries(jobMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const jobTotal = jobEntries.reduce((s, [, v]) => s + v, 0) || 1;
    const jobPosition = jobEntries.map(([name, count], i) => ({ name, count, pct: Math.round((count / jobTotal) * 100), color: DEMO_COLORS[i % DEMO_COLORS.length] }));

    // Demographics — real columns only (employment type, age group, sector).
    const groupDonut = (counts: Record<string, number>) => { const entries = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]); const tot = entries.reduce((s, [, v]) => s + v, 0) || 1; return entries.map(([name, count], i) => ({ name, count, pct: Math.round((count / tot) * 100), color: DEMO_COLORS[i % DEMO_COLORS.length] })); };
    const empTypeCounts: Record<string, number> = {};
    for (const e of active as any[]) { const k = e.employment_type === 'daily' ? 'Daily' : isMonthlyType(e.employment_type) ? (e.employment_type[0].toUpperCase() + e.employment_type.slice(1)) : 'Other'; empTypeCounts[k] = (empTypeCounts[k] || 0) + 1; }
    const ageCounts: Record<string, number> = { 'Under 25': 0, '25–34': 0, '35–44': 0, '45–54': 0, '55+': 0 };
    let withDob = 0; let ageSum = 0;
    for (const e of active as any[]) { if (!e.date_of_birth) continue; const age = Math.floor((now.getTime() - new Date(e.date_of_birth).getTime()) / (365.25 * DAY_MS)); if (age <= 0 || age > 100) continue; withDob++; ageSum += age; if (age < 25) ageCounts['Under 25']++; else if (age < 35) ageCounts['25–34']++; else if (age < 45) ageCounts['35–44']++; else if (age < 55) ageCounts['45–54']++; else ageCounts['55+']++; }
    const sectorCounts: Record<string, number> = {};
    for (const e of active as any[]) { const k = e.sector ? (e.sector[0].toUpperCase() + e.sector.slice(1)) : 'General'; sectorCounts[k] = (sectorCounts[k] || 0) + 1; }
    const demographics = {
      employmentType: { caption: `${active.length} staff`, segments: groupDonut(empTypeCounts) },
      ageGroup: { caption: withDob ? `${Math.round(ageSum / withDob)} yr avg` : 'No DOB data', segments: groupDonut(ageCounts) },
      sector: { caption: `${Object.keys(sectorCounts).length} sectors`, segments: groupDonut(sectorCounts) },
    };

    // Schedule / Gantt — tasks whose start/end window overlaps the current week.
    const weekEnd = new Date(ws); weekEnd.setDate(ws.getDate() + 7);
    const schedule = (tasks as any[])
      .filter((t) => t.start_date || t.end_date)
      .map((t) => ({ t, start: new Date(t.start_date ?? t.end_date), end: new Date(t.end_date ?? t.start_date) }))
      .filter(({ start, end }) => end >= ws && start < weekEnd)
      .map(({ t, start, end }, i) => { const clampedStart = start < ws ? ws : start; const startDay = Math.max(0, Math.min(6, Math.round((clampedStart.getTime() - ws.getTime()) / DAY_MS))); const endDay = Math.max(startDay, Math.min(6, Math.round((end.getTime() - ws.getTime()) / DAY_MS))); const spanDays = Math.max(1, endDay - startDay + 1); const colorIdx = i % DEMO_COLORS.length; return { id: t.id, name: t.task_name, startDay, spanDays, progressPct: t.status === 'completed' ? 100 : 55, color: DEMO_COLORS[colorIdx], dueInWeek: true, men: t.men_required ?? 1, equipment: Number(t.equipment_count ?? (t.equipment_id ? 1 : 0)), crew: [{ id: t.personnel_id ?? t.id, initials: initialsOf(t.personnel_name), colorIndex: colorIdx }] }; })
      .sort((a, b) => a.startDay - b.startDay)
      .slice(0, 10);

    res.json({ updatedAt: new Date().toISOString(), weekStart: ws.toISOString(), todayIdx, kpis, performance, topPerformers, tasks: taskList, taskSummary: { total: totalTasks, completed: completedTasks }, attendanceRate, jobPosition, demographics, schedule });
  } catch (err) {
    console.error('[HR/Analytics/Overview]', err);
    res.status(500).json({ error: 'Failed to fetch HR analytics', code: 'DB_ERROR' });
  }
});

router.get('/analytics/details/:metric', async (req, res) => {
  const farmId = req.user!.farmId ?? undefined;
  const metric = String(req.params.metric);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const pg = <T,>(arr: T[]) => arr.slice((page - 1) * pageSize, page * pageSize);
  // Aggregate-only fields: never leak national_id, email, phone, address, bank_id, DOB.
  const safeEmp = (e: any) => ({ id: e.id, name: e.full_name, code: e.personnel_id, jobTitle: e.job_title || '-', sector: e.sector || '-', employmentType: e.employment_type, status: e.status, daysWorked: e.total_days_worked ?? 0, dateHired: e.date_hired });
  try {
    if (['workforce', 'employees', 'daily-workers', 'top-performers', 'performance', 'job-position', 'demographics'].includes(metric)) {
      const all = await prisma.employees.findMany({ where: { farm_id: farmId, deleted_at: null } as any, orderBy: { total_days_worked: 'desc' } });
      let list = (all as any[]).filter((e) => e.status !== 'inactive');
      if (metric === 'employees') list = list.filter((e) => e.employment_type !== 'daily');
      else if (metric === 'daily-workers') list = list.filter((e) => e.employment_type === 'daily');
      const rows = list.map(safeEmp);
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (metric === 'contractors') {
      const rows = await (prisma as any).contractors.findMany({ where: { farm_id: farmId }, orderBy: { created_at: 'desc' } });
      return res.json({ total: rows.length, items: pg(rows.map((c: any) => ({ id: c.id, name: c.contractor_name, code: c.contractor_id, contractType: c.contract_type, sector: c.sector, amount: Number(c.amount_charged ?? 0), status: c.status, startDate: c.start_date, endDate: c.end_date }))) });
    }
    if (metric === 'attendance') {
      const date = String(req.query.date || '');
      const since = new Date(Date.now() - 30 * DAY_MS);
      const logs = await prisma.attendance_logs.findMany({
        where: { ...(date ? { log_date: new Date(date) } : { log_date: { gte: since } }), employees: { farm_id: farmId, deleted_at: null } },
        include: { employees: { select: { full_name: true, job_title: true } } },
        orderBy: { log_date: 'desc' },
      });
      const rows = (logs as any[]).map((l) => ({ id: l.id, name: l.employees?.full_name ?? '-', jobTitle: l.employees?.job_title ?? '-', status: l.status, hours: l.hours_worked ? Number(l.hours_worked) : null, date: l.log_date }));
      return res.json({ total: rows.length, items: pg(rows) });
    }
    if (['tasks', 'schedule'].includes(metric)) {
      const tasks = await prisma.$queryRaw<any[]>`
        SELECT t.id, t.task_name, t.location, t.men_required, t.status, t.start_date, t.end_date,
               e.full_name AS personnel_name, a.name AS equipment_name
        FROM farm_tasks t
        LEFT JOIN employees e ON e.id = t.personnel_id
        LEFT JOIN assets a ON a.id = t.equipment_id
        WHERE t.farm_id = ${farmId ?? null}::uuid AND t.status <> 'cancelled'
        ORDER BY (t.status = 'completed'), t.start_date ASC NULLS LAST
      `;
      const rows = (tasks as any[]).map((t) => ({ id: t.id, title: t.task_name, assignee: t.personnel_name ?? '-', equipment: t.equipment_name ?? '-', location: t.location ?? '-', men: t.men_required ?? 1, status: t.status, start: t.start_date, due: t.end_date }));
      return res.json({ total: rows.length, items: pg(rows) });
    }
    res.status(400).json({ error: 'Unknown metric', code: 'VALIDATION_ERROR' });
  } catch (err) {
    console.error('[HR/Analytics/Details]', err);
    res.status(500).json({ error: 'Failed to fetch details', code: 'DB_ERROR' });
  }
});

export default router;
