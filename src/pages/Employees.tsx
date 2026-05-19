import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Coins,
  Crown,
  DollarSign,
  HardHat,
  Leaf,
  ShieldCheck,
  Tractor,
  UserCheck,
  UserMinus,
  Users,
  Wheat,
} from 'lucide-react';
import { addDays, format, subDays } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import api from '@/lib/api';
import { refreshModuleData } from '@/lib/module-refresh';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

type Summary = {
  totalWorkforce: number;
  presentToday: number;
  absentOnLeave: number;
  dailyWorkersClockedIn: number;
  openFieldTasks: number;
  payrollDue: number;
  contractorsActive: number;
  laborCostThisMonth: number;
  overtimeHours: number;
  supervisorsAssigned: number;
};

type Personnel = {
  id: string;
  personnelId: string | null;
  fullName: string;
  workerType: string;
  sector: string | null;
  job_title: string | null;
  supervisor: string | null;
  phone: string | null;
  hireDate: string | null;
  status: string;
  currentAssignment: string | null;
};

type AttendanceRow = {
  id: string | null;
  employeeId: string;
  workerName: string;
  sector: string | null;
  attendanceStatus: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number;
  late: boolean;
  recordedBy: string | null;
};

type TaskRow = {
  id: string;
  task_title: string;
  sector: string | null;
  workerName: string | null;
  supervisor: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  workflowStatus: 'unassigned' | 'assigned' | 'in_progress' | 'completed' | 'overdue';
  notes: string | null;
  description: string | null;
};

type PayrollRow = {
  id: string;
  employeeId: string;
  worker: string;
  payType: string;
  daysWorked: number;
  hoursWorked: number;
  overtime: number;
  rate: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  paymentStatus: string;
  workerType: string;
};

type LeaveRow = {
  id: string;
  worker: string | null;
  type: string;
  startDate: string;
  endDate: string;
  approvalStatus: string;
  notes: string | null;
};

const currency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);

function metricTone(tone: 'green' | 'amber' | 'blue' | 'red' | 'slate') {
  return {
    green: 'border-emerald-500/20 bg-emerald-500/10',
    amber: 'border-amber-500/20 bg-amber-500/10',
    blue: 'border-sky-500/20 bg-sky-500/10',
    red: 'border-rose-500/20 bg-rose-500/10',
    slate: 'border-border bg-card/80',
  }[tone];
}

function statusBadge(status: string) {
  const key = status.toLowerCase();
  const styles: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    suspended: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    inactive: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
    present: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    absent: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
    leave: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
    half_day: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    pending: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    approved: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
    paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    assigned: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
    in_progress: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    overdue: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
    rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
  };
  return <Badge className={styles[key] ?? 'bg-muted text-muted-foreground border-border'}>{status.replace('_', ' ')}</Badge>;
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: typeof Users;
  tone: 'green' | 'amber' | 'blue' | 'red' | 'slate';
}) {
  return (
    <Card className={`border ${metricTone(tone)}`}>
      <CardContent className="flex min-h-[92px] items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardContent>
    </Card>
  );
}

function TaskColumn({
  title,
  tasks,
  accent,
  onAdvance,
}: {
  title: string;
  tasks: TaskRow[];
  accent: string;
  onAdvance: (task: TaskRow) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
          <p className="text-sm font-semibold text-white">{title}</p>
        </div>
        <Badge className="border-border bg-muted text-muted-foreground">{tasks.length}</Badge>
      </div>
      <div className="space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{task.task_title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{task.description || task.notes || 'No field note recorded'}</p>
              </div>
              {statusBadge(task.priority)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <div>Sector: <span className="capitalize text-white">{task.sector || 'general'}</span></div>
              <div>Worker: <span className="text-white">{task.workerName || 'Unassigned'}</span></div>
              <div>Supervisor: <span className="text-white">{task.supervisor || 'Pending'}</span></div>
              <div>Due: <span className="text-white">{task.due_date ? format(new Date(task.due_date), 'MMM d') : 'Open'}</span></div>
            </div>
            {task.workflowStatus !== 'completed' && (
              <Button size="sm" variant="outline" className="mt-3 w-full border-border text-white" onClick={() => onAdvance(task)}>
                Advance Task
              </Button>
            )}
          </div>
        ))}
        {!tasks.length && <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">No tasks in this lane.</div>}
      </div>
    </div>
  );
}

export default function Employees() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canCreate, canEdit } = usePermissions();

  const [workerTab, setWorkerTab] = useState('all');
  const [search, setSearch] = useState('');
  const [payMonth] = useState(format(new Date(), 'yyyy-MM'));
  const refreshHrData = () =>
    refreshModuleData(qc, [
      ['hr-summary'],
      ['hr-personnel'],
      ['hr-attendance-today'],
      ['hr-attendance-week'],
      ['hr-tasks'],
      ['hr-payroll'],
      ['hr-leave'],
    ]);

  const { data: summary } = useQuery<Summary>({
    queryKey: ['hr-summary'],
    queryFn: () => api.get('/hr/summary'),
    refetchInterval: 60000,
  });

  const { data: personnel = [] } = useQuery<Personnel[]>({
    queryKey: ['hr-personnel'],
    queryFn: () => api.get('/hr/personnel'),
  });

  const { data: attendance = [] } = useQuery<AttendanceRow[]>({
    queryKey: ['hr-attendance-today'],
    queryFn: () => api.get(`/hr/attendance?date=${format(new Date(), 'yyyy-MM-dd')}`),
    refetchInterval: 30000,
  });

  const { data: tasks = [] } = useQuery<TaskRow[]>({
    queryKey: ['hr-tasks'],
    queryFn: () => api.get('/hr/tasks'),
  });

  const { data: payroll = [] } = useQuery<PayrollRow[]>({
    queryKey: ['hr-payroll', payMonth],
    queryFn: () => api.get(`/hr/payroll?month=${payMonth}`),
  });

  const { data: leave = [] } = useQuery<LeaveRow[]>({
    queryKey: ['hr-leave'],
    queryFn: () => api.get('/hr/leave'),
  });

  const { data: weeklyAttendance = [] } = useQuery<any[]>({
    queryKey: ['hr-attendance-week'],
    queryFn: async () => {
      const dates = Array.from({ length: 7 }, (_, index) => format(subDays(new Date(), 6 - index), 'yyyy-MM-dd'));
      const rows = await Promise.all(dates.map(async (date) => {
        const daily = await api.get<AttendanceRow[]>(`/hr/attendance?date=${date}`);
        const present = daily.filter((item) => item.attendanceStatus === 'present' || item.attendanceStatus === 'half_day').length;
        const absent = daily.filter((item) => item.attendanceStatus === 'absent' || item.attendanceStatus === 'leave').length;
        return { date: format(new Date(date), 'EEE'), present, absent };
      }));
      return rows;
    },
  });

  const markAttendance = useMutation({
    mutationFn: (payload: { employeeId: string; status: 'present' | 'absent'; clockIn?: string }) => api.post('/hr/attendance', payload),
    onSuccess: () => {
      void refreshHrData();
      toast({ title: 'Attendance updated' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to update attendance', variant: 'destructive' }),
  });

  const clockOutWorker = useMutation({
    mutationFn: ({ id }: { id: string }) => api.patch(`/hr/attendance/${id}`, { clockOut: format(new Date(), 'HH:mm') }),
    onSuccess: () => {
      void refreshHrData();
      toast({ title: 'Clock-out recorded' });
    },
    onError: (error: any) => toast({ title: error.message || 'Clock-out failed', variant: 'destructive' }),
  });

  const advanceTask = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: string }) => api.patch(`/hr/tasks/${id}`, { status: nextStatus }),
    onSuccess: () => {
      void refreshHrData();
      toast({ title: 'Task board updated' });
    },
    onError: (error: any) => toast({ title: error.message || 'Task update failed', variant: 'destructive' }),
  });

  const generatePayroll = useMutation({
    mutationFn: () => api.post('/hr/payroll/generate', { month: payMonth }),
    onSuccess: () => {
      void refreshHrData();
      toast({ title: 'Payroll records generated' });
    },
    onError: (error: any) => toast({ title: error.message || 'Payroll generation failed', variant: 'destructive' }),
  });

  const payPayroll = useMutation({
    mutationFn: (id: string) => api.patch(`/hr/payroll/${id}/pay`, {}),
    onSuccess: () => {
      void refreshHrData();
      toast({ title: 'Payroll marked paid' });
    },
    onError: (error: any) => toast({ title: error.message || 'Payroll payment failed', variant: 'destructive' }),
  });

  const filteredPersonnel = useMemo(() => {
    const base = personnel.filter((row) => {
      if (workerTab === 'all') return row.status !== 'inactive';
      if (workerTab === 'permanent') return row.workerType === 'permanent';
      if (workerTab === 'daily') return row.workerType === 'daily';
      if (workerTab === 'contract') return row.workerType === 'contract';
      if (workerTab === 'supervisor') return row.workerType === 'supervisor';
      if (workerTab === 'restricted') return row.status === 'suspended' || row.status === 'inactive';
      return true;
    });
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter((row) =>
      row.fullName.toLowerCase().includes(q)
      || (row.personnelId || '').toLowerCase().includes(q)
      || (row.currentAssignment || '').toLowerCase().includes(q),
    );
  }, [personnel, search, workerTab]);

  const taskColumns = useMemo(() => ({
    unassigned: tasks.filter((task) => task.workflowStatus === 'unassigned'),
    assigned: tasks.filter((task) => task.workflowStatus === 'assigned'),
    in_progress: tasks.filter((task) => task.workflowStatus === 'in_progress'),
    completed: tasks.filter((task) => task.workflowStatus === 'completed'),
    overdue: tasks.filter((task) => task.workflowStatus === 'overdue'),
  }), [tasks]);

  const workforceBySector = useMemo(() => {
    const totals = personnel.reduce<Record<string, number>>((acc, person) => {
      const key = person.sector || 'general';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [personnel]);

  const laborCostByType = useMemo(() => {
    const totals = payroll.reduce<Record<string, number>>((acc, row) => {
      acc[row.workerType] = (acc[row.workerType] || 0) + row.netPay;
      return acc;
    }, {});
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [payroll]);

  const taskCompletionBySector = useMemo(() => {
    const totals = tasks.reduce<Record<string, { completed: number; open: number }>>((acc, task) => {
      const key = task.sector || 'general';
      acc[key] ||= { completed: 0, open: 0 };
      if (task.workflowStatus === 'completed') acc[key].completed += 1;
      else acc[key].open += 1;
      return acc;
    }, {});
    return Object.entries(totals).map(([sector, value]) => ({ sector, ...value }));
  }, [tasks]);

  const commandStrip = [
    { title: 'Total Workforce', value: summary?.totalWorkforce ?? 0, detail: 'All workers on roster', icon: Users, tone: 'slate' as const },
    { title: 'Present Today', value: summary?.presentToday ?? 0, detail: 'Checked in or marked present', icon: UserCheck, tone: 'green' as const },
    { title: 'Absent / On Leave', value: summary?.absentOnLeave ?? 0, detail: 'Unavailable today', icon: UserMinus, tone: 'amber' as const },
    { title: 'Daily Workers Clocked In', value: summary?.dailyWorkersClockedIn ?? 0, detail: 'Casual labor active today', icon: HardHat, tone: 'blue' as const },
    { title: 'Open Field Tasks', value: summary?.openFieldTasks ?? 0, detail: 'Assigned, live, and overdue tasks', icon: Tractor, tone: 'amber' as const },
    { title: 'Payroll Due', value: currency(summary?.payrollDue ?? 0), detail: 'Pending labor payout', icon: BadgeDollarSign, tone: 'red' as const },
    { title: 'Contractors Active', value: summary?.contractorsActive ?? 0, detail: 'Current contract labor', icon: BriefcaseBusiness, tone: 'blue' as const },
    { title: 'Labor Cost This Month', value: currency(summary?.laborCostThisMonth ?? 0), detail: 'Payroll and contract spend', icon: Coins, tone: 'slate' as const },
    { title: 'Overtime Hours', value: summary?.overtimeHours ?? 0, detail: 'Today overtime exposure', icon: Clock3, tone: 'amber' as const },
    { title: 'Supervisors Assigned', value: summary?.supervisorsAssigned ?? 0, detail: 'Active line supervision', icon: Crown, tone: 'green' as const },
  ];

  const nextTaskStatus = (task: TaskRow) => {
    if (task.workflowStatus === 'unassigned') return 'assigned';
    if (task.workflowStatus === 'assigned' || task.workflowStatus === 'overdue') return 'in_progress';
    return 'completed';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_38%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.18),transparent_32%),linear-gradient(135deg,rgba(10,15,22,0.96),rgba(18,26,38,0.92))] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Workforce Operations Deck
              </p>
              <h1 className="text-3xl font-bold text-white">Human Capital</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Workforce management, attendance, payroll, and field task supervision.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Today</p>
                <p className="text-sm font-semibold text-white">{format(new Date(), 'EEEE, MMM d')}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Payroll Window</p>
                <p className="text-sm font-semibold text-white">{format(new Date(`${payMonth}-01`), 'MMMM yyyy')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {commandStrip.map((card) => (
            <MetricCard key={card.title} {...card} />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <Card className="border-border bg-card/80">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle className="text-white">Workforce Register</CardTitle>
                  <p className="text-sm text-muted-foreground">Roster, accountability line, and current assignment visibility.</p>
                </div>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search worker or current assignment"
                  className="w-full max-w-sm border-border bg-background/70 text-white"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={workerTab} onValueChange={setWorkerTab}>
                <TabsList className="grid w-full grid-cols-3 gap-2 bg-transparent lg:grid-cols-6">
                  <TabsTrigger value="all">All Workers</TabsTrigger>
                  <TabsTrigger value="permanent">Permanent</TabsTrigger>
                  <TabsTrigger value="daily">Daily Workers</TabsTrigger>
                  <TabsTrigger value="contract">Contractors</TabsTrigger>
                  <TabsTrigger value="supervisor">Supervisors</TabsTrigger>
                  <TabsTrigger value="restricted">Suspended / Terminated</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Personnel ID</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Worker Type</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Job Title</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Hire Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current Assignment</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPersonnel.map((worker) => (
                      <TableRow key={worker.id}>
                        <TableCell className="font-mono text-xs">{worker.personnelId || '-'}</TableCell>
                        <TableCell className="font-medium text-white">{worker.fullName}</TableCell>
                        <TableCell className="capitalize">{worker.workerType}</TableCell>
                        <TableCell className="capitalize">{worker.sector || '-'}</TableCell>
                        <TableCell>{worker.job_title || '-'}</TableCell>
                        <TableCell>{worker.supervisor || '-'}</TableCell>
                        <TableCell>{worker.phone || '-'}</TableCell>
                        <TableCell>{worker.hireDate ? format(new Date(worker.hireDate), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>{statusBadge(worker.status)}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">{worker.currentAssignment || 'No active assignment'}</TableCell>
                        <TableCell>
                          {worker.status === 'active'
                            ? <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">Selectable</Badge>
                            : <Badge className="border-rose-500/20 bg-rose-500/10 text-rose-300">Restricted</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filteredPersonnel.length && (
                      <TableRow>
                        <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">No workforce records match this filter.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle className="text-white">Today&apos;s Attendance</CardTitle>
              <p className="text-sm text-muted-foreground">Operational attendance board for check-in, absence, and payroll-ready time capture.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyAttendance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.45)" tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.45)" tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="present" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="absent" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Check-In</TableHead>
                      <TableHead>Check-Out</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Late</TableHead>
                      <TableHead>Recorded By</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.map((row) => (
                      <TableRow key={row.employeeId}>
                        <TableCell className="font-medium text-white">{row.workerName}</TableCell>
                        <TableCell className="capitalize">{row.sector || '-'}</TableCell>
                        <TableCell>{row.checkIn || '-'}</TableCell>
                        <TableCell>{row.checkOut || '-'}</TableCell>
                        <TableCell>{statusBadge(row.attendanceStatus)}</TableCell>
                        <TableCell>{row.hoursWorked ? row.hoursWorked.toFixed(2) : '-'}</TableCell>
                        <TableCell>{row.late ? <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-300">Late</Badge> : '-'}</TableCell>
                        <TableCell>{row.recordedBy || '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {!row.id && canEdit('human_capital') && (
                              <>
                                <Button size="sm" variant="outline" className="border-border text-white" onClick={() => markAttendance.mutate({ employeeId: row.employeeId, status: 'present', clockIn: format(new Date(), 'HH:mm') })}>
                                  Mark Present
                                </Button>
                                <Button size="sm" variant="outline" className="border-border text-white" onClick={() => markAttendance.mutate({ employeeId: row.employeeId, status: 'absent' })}>
                                  Mark Absent
                                </Button>
                              </>
                            )}
                            {row.id && !row.checkOut && row.attendanceStatus !== 'absent' && row.attendanceStatus !== 'leave' && canEdit('human_capital') && (
                              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => clockOutWorker.mutate({ id: row.id! })}>
                                Clock Out
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card/80">
          <CardHeader>
            <CardTitle className="text-white">Task Assignment Board</CardTitle>
            <p className="text-sm text-muted-foreground">Who is working today, where the work sits, and which field activities need supervisor intervention.</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 xl:grid-cols-5">
              <TaskColumn title="Unassigned" tasks={taskColumns.unassigned} accent="bg-slate-400" onAdvance={(task) => advanceTask.mutate({ id: task.id, nextStatus: nextTaskStatus(task) })} />
              <TaskColumn title="Assigned" tasks={taskColumns.assigned} accent="bg-sky-400" onAdvance={(task) => advanceTask.mutate({ id: task.id, nextStatus: nextTaskStatus(task) })} />
              <TaskColumn title="In Progress" tasks={taskColumns.in_progress} accent="bg-amber-400" onAdvance={(task) => advanceTask.mutate({ id: task.id, nextStatus: nextTaskStatus(task) })} />
              <TaskColumn title="Completed" tasks={taskColumns.completed} accent="bg-emerald-400" onAdvance={(task) => advanceTask.mutate({ id: task.id, nextStatus: nextTaskStatus(task) })} />
              <TaskColumn title="Overdue" tasks={taskColumns.overdue} accent="bg-rose-400" onAdvance={(task) => advanceTask.mutate({ id: task.id, nextStatus: nextTaskStatus(task) })} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border bg-card/80">
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="text-white">Payroll Preview</CardTitle>
                <p className="text-sm text-muted-foreground">Attendance-derived pay records with overtime, deductions, and finance-ready payout status.</p>
              </div>
              {canCreate('human_capital') && (
                <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => generatePayroll.mutate()} disabled={generatePayroll.isPending}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Generate Payroll
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Pay Type</TableHead>
                    <TableHead>Days Worked</TableHead>
                    <TableHead>Hours Worked</TableHead>
                    <TableHead>Overtime</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Gross Pay</TableHead>
                    <TableHead>Deductions</TableHead>
                    <TableHead>Net Pay</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payroll.map((row) => (
                    <TableRow key={row.employeeId}>
                      <TableCell className="font-medium text-white">{row.worker}</TableCell>
                      <TableCell className="capitalize">{row.payType.replace('_', ' ')}</TableCell>
                      <TableCell>{row.daysWorked}</TableCell>
                      <TableCell>{row.hoursWorked.toFixed(2)}</TableCell>
                      <TableCell>{row.overtime.toFixed(2)}</TableCell>
                      <TableCell>{currency(row.rate)}</TableCell>
                      <TableCell>{currency(row.grossPay)}</TableCell>
                      <TableCell>{currency(row.deductions)}</TableCell>
                      <TableCell className="font-semibold text-white">{currency(row.netPay)}</TableCell>
                      <TableCell>{statusBadge(row.paymentStatus)}</TableCell>
                      <TableCell>
                        {row.id !== row.employeeId && row.paymentStatus !== 'paid' && canEdit('human_capital')
                          ? (
                            <Button size="sm" variant="outline" className="border-border text-white" onClick={() => payPayroll.mutate(row.id)}>
                              Mark Paid
                            </Button>
                          )
                          : <span className="text-xs text-muted-foreground">Posted when approved</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle className="text-white">Leave / Absence Tracker</CardTitle>
              <p className="text-sm text-muted-foreground">Approved and pending absences affecting deployment and deductions.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {leave.map((row) => (
                <div key={row.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{row.worker || 'Unlinked worker'}</p>
                      <p className="text-xs capitalize text-muted-foreground">{row.type.replace('_', ' ')}</p>
                    </div>
                    {statusBadge(row.approvalStatus)}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {format(new Date(row.startDate), 'MMM d')} to {format(new Date(row.endDate), 'MMM d')}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{row.notes || 'No note attached.'}</p>
                </div>
              ))}
              {!leave.length && <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">No leave records available.</div>}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card/80">
          <CardHeader>
            <CardTitle className="text-white">Labor Insights</CardTitle>
            <p className="text-sm text-muted-foreground">Sector mix, attendance movement, labor cost exposure, and task completion pressure.</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 xl:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <Wheat className="h-4 w-4" />
                  Workforce by Sector
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={workforceBySector} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78}>
                        {workforceBySector.map((_, index) => <Cell key={index} fill={['#22c55e', '#38bdf8', '#f59e0b', '#a78bfa', '#f97316'][index % 5]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <CalendarClock className="h-4 w-4" />
                  Attendance Trend
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyAttendance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.45)" tickLine={false} axisLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.45)" tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="present" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <Leaf className="h-4 w-4" />
                  Labor Cost by Worker Type
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={laborCostByType}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.45)" tickLine={false} axisLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.45)" tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value: number) => currency(value)} />
                      <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <CheckCircle2 className="h-4 w-4" />
                  Task Completion by Sector
                </div>
                <div className="space-y-3">
                  {taskCompletionBySector.map((row) => (
                    <div key={row.sector} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="capitalize text-white">{row.sector}</span>
                        <span className="text-muted-foreground">{row.completed} done / {row.open} open</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full bg-emerald-500" style={{ width: `${((row.completed / Math.max(row.completed + row.open, 1)) * 100).toFixed(0)}%` }} />
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                  {!taskCompletionBySector.length && <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">No sector task activity yet.</div>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border bg-card/80">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-white">Suspended and terminated workers are task-locked</p>
                <p className="text-xs text-muted-foreground">The backend blocks new task assignment when status is not active.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card/80">
            <CardContent className="flex items-center gap-3 p-4">
              <Clock3 className="h-5 w-5 text-sky-300" />
              <div>
                <p className="text-sm font-semibold text-white">Attendance drives hours and overtime</p>
                <p className="text-xs text-muted-foreground">Clock-in and clock-out values feed payroll preview calculations.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card/80">
            <CardContent className="flex items-center gap-3 p-4">
              <Coins className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-sm font-semibold text-white">Paid payroll posts labor expense</p>
                <p className="text-xs text-muted-foreground">When finance tables exist, payroll payment writes a journal expense entry.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
