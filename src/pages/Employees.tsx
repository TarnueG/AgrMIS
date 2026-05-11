import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Users, CalendarDays, ClipboardCheck, UserCheck, UserX, Briefcase, HardHat, DollarSign, Search, Pencil, Ban } from 'lucide-react';
import { format } from 'date-fns';

type EmpView = 'contractor' | 'suspension' | 'active' | 'inactive' | 'employee' | 'daily' | 'salary' | 'attendance_rate' | 'daily_log' | null;

const ns = 'w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground';

const JOB_TITLES = ['Farm Manager', 'Asset Manager', 'Marketing Manager', 'Human Resource', 'Accounting', 'Procurement', 'Field Supervisor', 'Mechanic', 'Transporter', 'Regular Staff'];
const SECTORS_NEW = ['Crops', 'Livestock', 'Administration', 'General'];
const EMP_TYPES_NEW = ['employee', 'daily'];
const CONTRACT_SECTORS = ['crops', 'livestock'];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-success/20 text-success',
    inactive: 'bg-muted text-muted-foreground',
    suspended: 'bg-warning/20 text-warning',
  };
  return map[status] ?? 'bg-muted';
}

function isImmutable(emp: any) {
  if (!emp.terminated_at) return false;
  return (Date.now() - new Date(emp.terminated_at).getTime()) / 3600000 >= 48;
}

const BLANK_EMP = { fullName: '', dateOfBirth: '', placeOfBirth: '', employmentType: 'employee', sector: 'General', jobTitle: '', email: '', phone: '', address: '', dateHired: '', salaryAmount: '', bankId: '' };
const BLANK_CONTRACT = { contractorName: '', contractType: '', sector: 'crops', amountCharged: '', description: '', bankId: '', startDate: '', endDate: '' };
const BLANK_SUSPEND = { suspensionReason: '', suspensionExpiresAt: '' };

export default function Employees() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<EmpView>(null);
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [attendTypeFilter, setAttendTypeFilter] = useState('all');
  const [salaryMonthFilter, setSalaryMonthFilter] = useState('');
  const [dailyLogSelected, setDailyLogSelected] = useState<Set<string>>(new Set());

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editEmp, setEditEmp] = useState<any>(null);
  const [suspendTarget, setSuspendTarget] = useState<any>(null);
  const [empForm, setEmpForm] = useState({ ...BLANK_EMP });
  const [contractForm, setContractForm] = useState({ ...BLANK_CONTRACT });
  const [suspendForm, setSuspendForm] = useState({ ...BLANK_SUSPEND });

  const { data: stats } = useQuery<any>({
    queryKey: ['hr-stats'],
    queryFn: () => api.get('/hr/stats'),
    refetchInterval: 60_000,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees-all'],
    queryFn: () => api.get('/hr/employees'),
    refetchInterval: 30_000,
  });

  const { data: contractors = [] } = useQuery<any[]>({
    queryKey: ['hr-contractors'],
    queryFn: () => api.get('/hr/contractors'),
  });

  const { data: attendanceSummary = [] } = useQuery<any[]>({
    queryKey: ['attendance-summary', attendTypeFilter],
    queryFn: () => {
      const p = attendTypeFilter !== 'all' ? `?employment_type=${attendTypeFilter}` : '';
      return api.get(`/hr/attendance-summary${p}`);
    },
  });

  const { data: salaryData = [] } = useQuery<any[]>({
    queryKey: ['hr-salary'],
    queryFn: () => api.get('/hr/salary'),
  });

  const addEmployee = useMutation({
    mutationFn: (d: typeof empForm) => api.post('/hr/employees', {
      fullName: d.fullName, dateOfBirth: d.dateOfBirth || undefined, placeOfBirth: d.placeOfBirth || undefined,
      employmentType: d.employmentType, sector: d.sector.toLowerCase(), jobTitle: d.jobTitle || undefined,
      email: d.email || undefined, phone: d.phone || undefined, address: d.address || undefined,
      dateHired: d.dateHired || undefined, salaryAmount: d.salaryAmount ? Number(d.salaryAmount) : undefined, bankId: d.bankId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees-all'] });
      qc.invalidateQueries({ queryKey: ['hr-stats'] });
      toast({ title: 'Personnel added' });
      setIsAddOpen(false);
      setEmpForm({ ...BLANK_EMP });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const editEmployee = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/hr/employees/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees-all'] }); toast({ title: 'Updated' }); setEditEmp(null); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const terminate = useMutation({
    mutationFn: (id: string) => api.patch(`/hr/employees/${id}/terminate`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees-all'] }); qc.invalidateQueries({ queryKey: ['hr-stats'] }); toast({ title: 'Personnel terminated' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const unterminate = useMutation({
    mutationFn: (id: string) => api.patch(`/hr/employees/${id}/unterminate`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees-all'] }); qc.invalidateQueries({ queryKey: ['hr-stats'] }); toast({ title: 'Personnel restored' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/hr/employees/${id}/suspend`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees-all'] });
      qc.invalidateQueries({ queryKey: ['hr-stats'] });
      toast({ title: 'Personnel suspended' });
      setSuspendTarget(null);
      setSuspendForm({ ...BLANK_SUSPEND });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const cancelSuspension = useMutation({
    mutationFn: (id: string) => api.patch(`/hr/employees/${id}/cancel-suspension`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees-all'] }); qc.invalidateQueries({ queryKey: ['hr-stats'] }); toast({ title: 'Suspension cancelled' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const addContractor = useMutation({
    mutationFn: (d: typeof contractForm) => api.post('/hr/contractors', {
      contractorName: d.contractorName, contractType: d.contractType, sector: d.sector,
      amountCharged: Number(d.amountCharged), description: d.description || undefined,
      bankId: d.bankId || undefined, startDate: d.startDate || undefined, endDate: d.endDate || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-contractors'] });
      qc.invalidateQueries({ queryKey: ['hr-stats'] });
      toast({ title: 'Contractor added' });
      setIsAddOpen(false);
      setContractForm({ ...BLANK_CONTRACT });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const finishContract = useMutation({
    mutationFn: (id: string) => api.patch(`/hr/contractors/${id}/finish`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-contractors'] });
      qc.invalidateQueries({ queryKey: ['finance-contractor-payments'] });
      toast({ title: 'Contract finished — payment sent to Finance' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const sendForPayment = useMutation({
    mutationFn: () => api.post('/hr/wages/send-for-payment', {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['hr-salary'] });
      qc.invalidateQueries({ queryKey: ['finance-wages'] });
      toast({ title: `Sent ${data.count} personnel to Finance` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const submitDailyLog = useMutation({
    mutationFn: (ids: string[]) => api.post('/hr/daily-log', { employeeIds: ids }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['employees-all'] });
      qc.invalidateQueries({ queryKey: ['attendance-summary'] });
      qc.invalidateQueries({ queryKey: ['hr-stats'] });
      toast({ title: `Daily log submitted — ${data.submitted} logged, ${data.skipped} already done today` });
      setDailyLogSelected(new Set());
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── derived lists ──
  const activeEmps = employees.filter(e => e.status === 'active');
  const inactiveEmps = employees.filter(e => e.status === 'inactive');
  const suspendedEmps = employees.filter(e => e.status === 'suspended');
  const visibleTotal = employees.filter(e => e.status !== 'inactive');
  const employeeType = employees.filter(e => (e.employment_type === 'employee' || e.employment_type === 'permanent' || e.employment_type === 'contract') && e.status !== 'inactive');
  const dailyWorkers = employees.filter(e => e.employment_type === 'daily' && e.status === 'active');

  const filteredContractors = personnelSearch
    ? contractors.filter((c: any) => c.contractor_name.toLowerCase().includes(personnelSearch.toLowerCase()))
    : contractors;

  const cardClass = (v: EmpView) =>
    `cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${view === v ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`;

  const CARDS = [
    { key: 'contractor' as EmpView, label: 'Contractor', count: stats?.contractorCount ?? contractors.length, Icon: Briefcase, color: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
    { key: 'suspension' as EmpView, label: 'Suspension', count: stats?.suspendedCount ?? suspendedEmps.length, Icon: Ban, color: 'bg-warning/10 border-warning/20 text-warning' },
    { key: 'active' as EmpView, label: 'Active', count: stats?.activeCount ?? activeEmps.length, Icon: UserCheck, color: 'bg-success/10 border-success/20 text-success' },
    { key: 'inactive' as EmpView, label: 'Inactive', count: stats?.inactiveCount ?? inactiveEmps.length, Icon: UserX, color: 'bg-muted/50 border-muted text-muted-foreground' },
    { key: 'employee' as EmpView, label: 'Employee', count: stats?.employeeCount ?? employeeType.length, Icon: Users, color: 'bg-primary/10 border-primary/20 text-primary' },
    { key: 'daily' as EmpView, label: 'Daily Workers', count: stats?.dailyCount ?? dailyWorkers.length, Icon: HardHat, color: 'bg-info/10 border-info/20 text-info' },
    { key: 'salary' as EmpView, label: 'Salary', count: salaryData.filter(s => s.action === 'qualified').length, Icon: DollarSign, color: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
    { key: 'attendance_rate' as EmpView, label: 'Attendance Rate', count: `${stats?.attendanceRate ?? 0}%`, Icon: ClipboardCheck, color: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
    { key: 'daily_log' as EmpView, label: 'Daily Log', count: stats?.presentToday ?? 0, Icon: CalendarDays, color: 'bg-teal-500/10 border-teal-500/20 text-teal-400' },
  ];

  const btnLabel = view === 'contractor' ? 'Add Contract' : view === 'salary' ? 'Send For Payment' : view === 'daily_log' ? 'Add Personnel' : 'Add Personnel';

  function handlePrimaryBtn() {
    if (view === 'salary') {
      if (confirm('Send all qualified personnel to Finance for payment?')) sendForPayment.mutate();
    } else {
      setIsAddOpen(true);
    }
  }

  function getViewList() {
    const base = (() => {
      switch (view) {
        case 'active': return activeEmps;
        case 'inactive': return inactiveEmps;
        case 'suspension': return suspendedEmps;
        case 'employee': return employeeType;
        case 'daily': return dailyWorkers;
        default: return visibleTotal;
      }
    })();
    if (!personnelSearch) return base;
    const q = personnelSearch.toLowerCase();
    return base.filter(e => e.full_name.toLowerCase().includes(q) || (e.personnel_id ?? '').toLowerCase().includes(q));
  }

  const showPersonnelTable = view !== 'contractor' && view !== 'salary' && view !== 'attendance_rate' && view !== 'daily_log';
  const showDailyLogView = view === 'daily_log';
  const showAttendanceView = view === 'attendance_rate';
  const showContractorView = view === 'contractor';
  const showSalaryView = view === 'salary';

  const filteredSalary = salaryMonthFilter
    ? salaryData.filter(s => {
        if (!s.date_hired) return true;
        return format(new Date(s.date_hired), 'yyyy-MM') === salaryMonthFilter;
      })
    : salaryData;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">Human Capital</h1>
            <p className="text-muted-foreground">Workforce management, payroll, and contractor oversight</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={personnelSearch}
                onChange={e => setPersonnelSearch(e.target.value)}
                onBlur={() => setPersonnelSearch('')}
                className="pl-9 w-52 text-white placeholder:text-white/50"
              />
            </div>
            <Button className="gradient-primary text-black font-medium" onClick={handlePrimaryBtn} disabled={view === 'salary' && sendForPayment.isPending}>
              <Plus className="h-4 w-4 mr-2" />{btnLabel}
            </Button>
          </div>
        </div>

        {/* 9 Cards */}
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
          {CARDS.map(({ key, label, count, Icon, color }) => (
            <Card key={key} className={`border ${color} ${cardClass(key)}`} onClick={() => setView(view === key ? null : key)}>
              <CardContent className="p-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Icon className="h-6 w-6" />
                  <div>
                    <p className="text-xs font-medium leading-tight">{label}</p>
                    <p className="text-xl font-bold">{count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Contractor View ── */}
        {showContractorView && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor ID</TableHead>
                    <TableHead>Contractor Name</TableHead>
                    <TableHead>Contract Type</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Amount Charged</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Bank ID</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContractors.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.contractor_id}</TableCell>
                      <TableCell className="font-medium">{c.contractor_name}</TableCell>
                      <TableCell>{c.contract_type}</TableCell>
                      <TableCell className="capitalize">{c.sector}</TableCell>
                      <TableCell>${Number(c.amount_charged).toFixed(2)}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{c.description ?? '-'}</TableCell>
                      <TableCell>{c.bank_id ?? '-'}</TableCell>
                      <TableCell>{c.start_date ? format(new Date(c.start_date), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>{c.end_date ? format(new Date(c.end_date), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>
                        {!c.payment_sent ? (
                          <Button size="sm" className="gradient-primary text-black font-medium text-xs"
                            onClick={() => { if (confirm('Mark contract as finished and send payment request to Finance?')) finishContract.mutate(c.id); }}
                            disabled={finishContract.isPending}>
                            Finish
                          </Button>
                        ) : (
                          <Badge className="bg-success/20 text-success text-xs">Sent to Finance</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredContractors.length && (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No contractors</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Salary View ── */}
        {showSalaryView && (
          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <p className="font-medium text-sm">Salary — Employees & Daily Workers</p>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Filter by month:</Label>
                <Input type="month" value={salaryMonthFilter} onChange={e => setSalaryMonthFilter(e.target.value)} className="w-36 h-8 text-xs text-white" />
                {salaryMonthFilter && <Button size="sm" variant="outline" className="text-xs text-white border-input" onClick={() => setSalaryMonthFilter('')}>Clear</Button>}
              </div>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Personnel ID</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Employment Type</TableHead>
                    <TableHead>Number of Days</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Pay Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Bank ID</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSalary.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.personnel_id ?? '-'}</TableCell>
                      <TableCell className="font-medium">{s.full_name}</TableCell>
                      <TableCell className="capitalize">{s.employment_type}</TableCell>
                      <TableCell>{s.days_worked}</TableCell>
                      <TableCell className="capitalize">{s.sector ?? '-'}</TableCell>
                      <TableCell>{s.pay_period}</TableCell>
                      <TableCell><Badge className={statusBadge(s.status)}>{s.status}</Badge></TableCell>
                      <TableCell className="font-medium">${Number(s.amount).toFixed(2)}</TableCell>
                      <TableCell>{s.bank_id ?? '-'}</TableCell>
                      <TableCell>
                        {s.action === 'qualified'
                          ? <Badge className="bg-success/20 text-success text-xs">Qualified</Badge>
                          : <Badge className="bg-warning/20 text-warning text-xs">Review</Badge>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredSalary.length && (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No salary data</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Daily Log View ── */}
        {showDailyLogView && (
          <Card>
            <div className="p-4 border-b">
              <p className="font-medium text-sm">Daily Log — {format(new Date(), 'EEEE, MMM d, yyyy')}</p>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Personnel ID</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Employee Type</TableHead>
                    <TableHead>Sector</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.filter(e => e.status === 'active').map((emp: any) => (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={dailyLogSelected.has(emp.id)}
                          onChange={ev => {
                            const next = new Set(dailyLogSelected);
                            if (ev.target.checked) next.add(emp.id); else next.delete(emp.id);
                            setDailyLogSelected(next);
                          }}
                          className="h-4 w-4 accent-primary cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{emp.personnel_id ?? '-'}</TableCell>
                      <TableCell className="font-medium">{emp.full_name}</TableCell>
                      <TableCell className="capitalize text-xs">{emp.employment_type}</TableCell>
                      <TableCell className="capitalize text-xs">{emp.sector ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                  {!employees.filter(e => e.status === 'active').length && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No active personnel</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="p-4 flex justify-center">
                <Button
                  className="gradient-primary text-black font-medium"
                  disabled={submitDailyLog.isPending}
                  onClick={() => {
                    if (dailyLogSelected.size === 0) { toast({ title: 'Select at least one personnel', variant: 'destructive' }); return; }
                    if (confirm(`Submit daily log for ${dailyLogSelected.size} personnel?`)) submitDailyLog.mutate(Array.from(dailyLogSelected));
                  }}
                >
                  Submit Daily Log
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Attendance Rate View ── */}
        {showAttendanceView && (
          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <p className="font-medium text-sm">Attendance Summary</p>
              <select value={attendTypeFilter} onChange={e => setAttendTypeFilter(e.target.value)} className="h-8 w-40 rounded border border-input bg-background px-2 text-sm text-foreground">
                <option value="all">All Types</option>
                <option value="employee">Employee</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Personnel ID</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Employee Type</TableHead>
                    <TableHead>Number of Days</TableHead>
                    <TableHead>Total Number of Days</TableHead>
                    <TableHead>Sector</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceSummary.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.personnel_id ?? '-'}</TableCell>
                      <TableCell className="font-medium">{s.full_name}</TableCell>
                      <TableCell className="capitalize">{s.employment_type}</TableCell>
                      <TableCell>{s.days_worked}</TableCell>
                      <TableCell>{s.total_days_worked ?? 0}</TableCell>
                      <TableCell className="capitalize">{s.sector ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                  {!attendanceSummary.length && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No attendance data</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Total Workers / Filtered Personnel Table ── */}
        {showPersonnelTable && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div>
                <p className="font-semibold">
                  {view === 'suspension' ? 'Suspended Personnel' :
                   view === 'active' ? 'Active Personnel' :
                   view === 'inactive' ? 'Inactive Personnel' :
                   view === 'employee' ? 'Employees' :
                   view === 'daily' ? 'Daily Workers' :
                   'Total Workers'}
                </p>
                <p className="text-xs text-muted-foreground">{getViewList().length} records</p>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Personnel ID</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Employee Type</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Job Title</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Hire Date</TableHead>
                      <TableHead>Status</TableHead>
                      {view === 'suspension' && <TableHead>Reason</TableHead>}
                      {view === 'suspension' && <TableHead>Expires</TableHead>}
                      <TableHead>Edit</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getViewList().map((emp: any) => {
                      const immutable = isImmutable(emp);
                      return (
                        <TableRow key={emp.id} className={immutable ? 'opacity-50' : ''}>
                          <TableCell className="font-mono text-xs">{emp.personnel_id ?? '-'}</TableCell>
                          <TableCell className="font-medium">{emp.full_name}</TableCell>
                          <TableCell className="capitalize text-xs">{emp.employment_type}</TableCell>
                          <TableCell className="capitalize text-xs">{emp.sector ?? '-'}</TableCell>
                          <TableCell className="text-xs">{emp.job_title ?? '-'}</TableCell>
                          <TableCell className="text-xs">{emp.email ?? '-'}</TableCell>
                          <TableCell className="text-xs">{emp.phone ?? '-'}</TableCell>
                          <TableCell className="text-xs max-w-[100px] truncate">{emp.address ?? '-'}</TableCell>
                          <TableCell className="text-xs">{emp.date_hired ? format(new Date(emp.date_hired), 'MMM d, yyyy') : '-'}</TableCell>
                          <TableCell><Badge className={`${statusBadge(emp.status)} text-xs`}>{emp.status}</Badge></TableCell>
                          {view === 'suspension' && (
                            <TableCell className="text-xs max-w-[120px] truncate">{emp.suspension_reason ?? '-'}</TableCell>
                          )}
                          {view === 'suspension' && (
                            <TableCell className="text-xs">{emp.suspension_expires_at ? format(new Date(emp.suspension_expires_at), 'MMM d, yyyy') : '-'}</TableCell>
                          )}
                          <TableCell>
                            <Button variant="ghost" size="icon" disabled={immutable} onClick={() => setEditEmp(emp)}>
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            {immutable ? (
                              <Badge className="bg-muted text-muted-foreground text-xs">Immutable</Badge>
                            ) : view === 'suspension' ? (
                              <Button size="sm" variant="outline" className="text-xs text-white border-input"
                                onClick={() => { if (confirm('Cancel suspension and restore Active?')) cancelSuspension.mutate(emp.id); }}>
                                Cancel Suspension
                              </Button>
                            ) : emp.status === 'inactive' ? (
                              <Button size="sm" variant="outline" className="text-xs text-white border-input"
                                onClick={() => { if (confirm('Restore this personnel to Active?')) unterminate.mutate(emp.id); }}>
                                Un-terminate
                              </Button>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" className="text-xs text-white border-input"
                                  onClick={() => setSuspendTarget(emp)}>
                                  Suspend
                                </Button>
                                <Button size="sm" variant="destructive" className="text-xs"
                                  onClick={() => { if (confirm('Terminate this personnel? Record becomes immutable after 48 hours.')) terminate.mutate(emp.id); }}>
                                  Terminate
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!getViewList().length && (
                      <TableRow>
                        <TableCell colSpan={view === 'suspension' ? 14 : 12} className="text-center py-8 text-muted-foreground">
                          No records found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Add Personnel / Add Contract Dialog ── */}
        <Dialog open={isAddOpen} onOpenChange={o => { setIsAddOpen(o); if (!o) { setEmpForm({ ...BLANK_EMP }); setContractForm({ ...BLANK_CONTRACT }); } }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{view === 'contractor' ? 'Add Contract' : 'Add Personnel'}</DialogTitle>
            </DialogHeader>

            {view !== 'contractor' ? (
              <form onSubmit={e => { e.preventDefault(); addEmployee.mutate(empForm); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input value={empForm.fullName} onChange={e => setEmpForm({ ...empForm, fullName: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={empForm.dateOfBirth} onChange={e => setEmpForm({ ...empForm, dateOfBirth: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Place of Birth</Label>
                  <Input value={empForm.placeOfBirth} onChange={e => setEmpForm({ ...empForm, placeOfBirth: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Employment Type *</Label>
                    <select value={empForm.employmentType} onChange={e => setEmpForm({ ...empForm, employmentType: e.target.value })} className={ns} required>
                      {EMP_TYPES_NEW.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sector *</Label>
                    <select value={empForm.sector} onChange={e => setEmpForm({ ...empForm, sector: e.target.value })} className={ns} required>
                      {SECTORS_NEW.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Job Title *</Label>
                  <select value={empForm.jobTitle} onChange={e => setEmpForm({ ...empForm, jobTitle: e.target.value })} className={ns} required>
                    <option value="">Select job title</option>
                    {JOB_TITLES.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Email *</Label>
                    <Input type="email" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number *</Label>
                    <Input value={empForm.phone} onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} placeholder="+231..." required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address *</Label>
                  <Input value={empForm.address} onChange={e => setEmpForm({ ...empForm, address: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date Hired *</Label>
                    <Input type="date" value={empForm.dateHired} onChange={e => setEmpForm({ ...empForm, dateHired: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>{empForm.employmentType === 'daily' ? 'Daily Rate *' : 'Monthly Salary *'}</Label>
                    <Input type="number" step="0.01" min="0.01" value={empForm.salaryAmount} onChange={e => setEmpForm({ ...empForm, salaryAmount: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Bank ID *</Label>
                  <Input value={empForm.bankId} onChange={e => setEmpForm({ ...empForm, bankId: e.target.value })} required />
                </div>
                <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addEmployee.isPending}>Add Personnel</Button>
              </form>
            ) : (
              <form onSubmit={e => { e.preventDefault(); addContractor.mutate(contractForm); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contractor Name *</Label>
                    <Input value={contractForm.contractorName} onChange={e => setContractForm({ ...contractForm, contractorName: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Contract Type *</Label>
                    <Input value={contractForm.contractType} onChange={e => setContractForm({ ...contractForm, contractType: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Sector *</Label>
                    <select value={contractForm.sector} onChange={e => setContractForm({ ...contractForm, sector: e.target.value })} className={ns} required>
                      {CONTRACT_SECTORS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount Charged *</Label>
                    <Input type="number" step="0.01" min="0.01" value={contractForm.amountCharged} onChange={e => setContractForm({ ...contractForm, amountCharged: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description (max 50 words)</Label>
                  <Input value={contractForm.description} onChange={e => {
                    const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                    if (words.length <= 50) setContractForm({ ...contractForm, description: e.target.value });
                  }} placeholder="Brief description..." />
                </div>
                <div className="space-y-2">
                  <Label>Bank ID</Label>
                  <Input value={contractForm.bankId} onChange={e => setContractForm({ ...contractForm, bankId: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={contractForm.startDate} onChange={e => setContractForm({ ...contractForm, startDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" value={contractForm.endDate} onChange={e => setContractForm({ ...contractForm, endDate: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addContractor.isPending}>Add Contract</Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Edit Personnel Dialog ── */}
        <Dialog open={!!editEmp} onOpenChange={o => { if (!o) setEditEmp(null); }}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Personnel</DialogTitle></DialogHeader>
            {editEmp && (
              <form onSubmit={e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                editEmployee.mutate({
                  id: editEmp.id,
                  data: {
                    fullName: fd.get('fullName') as string,
                    email: (fd.get('email') as string) || undefined,
                    phone: (fd.get('phone') as string) || undefined,
                    address: (fd.get('address') as string) || undefined,
                    jobTitle: (fd.get('jobTitle') as string) || undefined,
                    sector: (fd.get('sector') as string) || undefined,
                    bankId: (fd.get('bankId') as string) || undefined,
                    salaryAmount: fd.get('salaryAmount') ? Number(fd.get('salaryAmount')) : undefined,
                  },
                });
              }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input name="fullName" defaultValue={editEmp.full_name} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input name="email" type="email" defaultValue={editEmp.email ?? ''} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input name="phone" defaultValue={editEmp.phone ?? ''} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input name="address" defaultValue={editEmp.address ?? ''} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Job Title</Label>
                    <select name="jobTitle" defaultValue={editEmp.job_title ?? ''} className={ns}>
                      <option value="">Select</option>
                      {JOB_TITLES.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sector</Label>
                    <select name="sector" defaultValue={editEmp.sector ?? 'general'} className={ns}>
                      {SECTORS_NEW.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bank ID</Label>
                    <Input name="bankId" defaultValue={editEmp.bank_id ?? ''} />
                  </div>
                  <div className="space-y-2">
                    <Label>Salary Amount</Label>
                    <Input name="salaryAmount" type="number" step="0.01" defaultValue={editEmp.monthly_salary ?? editEmp.daily_wage ?? ''} />
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={editEmployee.isPending}>Save Changes</Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Suspend Dialog ── */}
        <Dialog open={!!suspendTarget} onOpenChange={o => { if (!o) { setSuspendTarget(null); setSuspendForm({ ...BLANK_SUSPEND }); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Suspend — {suspendTarget?.full_name}</DialogTitle></DialogHeader>
            <form onSubmit={e => {
              e.preventDefault();
              const words = suspendForm.suspensionReason.trim().split(/\s+/).filter(Boolean);
              if (words.length > 50) { toast({ title: 'Reason must be 50 words or fewer', variant: 'destructive' }); return; }
              suspendMutation.mutate({ id: suspendTarget.id, data: { suspensionReason: suspendForm.suspensionReason, suspensionExpiresAt: suspendForm.suspensionExpiresAt } });
            }} className="space-y-4">
              <div className="space-y-2">
                <Label>Suspension Reason (max 50 words) *</Label>
                <Input value={suspendForm.suspensionReason} onChange={e => setSuspendForm({ ...suspendForm, suspensionReason: e.target.value })} required />
                <p className="text-xs text-muted-foreground">{suspendForm.suspensionReason.trim().split(/\s+/).filter(Boolean).length} / 50 words</p>
              </div>
              <div className="space-y-2">
                <Label>Return / Expiration Date *</Label>
                <Input type="date" value={suspendForm.suspensionExpiresAt} onChange={e => setSuspendForm({ ...suspendForm, suspensionExpiresAt: e.target.value })} required min={new Date().toISOString().split('T')[0]} />
              </div>
              <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={suspendMutation.isPending}>Confirm Suspension</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
