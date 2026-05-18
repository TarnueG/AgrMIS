import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  BriefcaseBusiness,
  DollarSign,
  Download,
  Factory,
  FileSpreadsheet,
  Landmark,
  PiggyBank,
  Plus,
  Receipt,
  Tractor,
  WalletCards,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import api, { getAccessToken } from '@/lib/api';
import { formatCurrency, formatCurrencyPrecise, formatFinanceDate, formatPercent, titleize } from '@/lib/finance-format';

type Summary = {
  grossRevenue: number;
  totalExpenses: number;
  netProfit: number;
  cashCollected: number;
  receivables: number;
  payables: number;
  payrollDue: number;
  procurementCosts: number;
  maintenanceCosts: number;
  profitMargin: number;
};

type CashFlowRow = {
  month: string;
  income: number;
  expenses: number;
  netProfit: number;
};

type SectorProfitability = {
  sector: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

type LedgerRow = {
  id: string;
  transactionId: string;
  date: string;
  customer?: string | null;
  vendor?: string | null;
  sourceOrder?: string | null;
  productService?: string | null;
  category?: string | null;
  linkedModule: string;
  linkedRecordId: string | null;
  description: string;
  amount: number;
  paymentMethod?: string | null;
  paymentStatus: 'unpaid' | 'partially paid' | 'paid' | 'overdue';
  recordedBy: string | null;
  dueDate: string | null;
  paidAt: string | null;
  receiptAttached: boolean;
  receiptUrl?: string | null;
  notes?: string | null;
  sector?: string | null;
  transactionType: 'income' | 'expense';
  sourceKind: string;
};

type ReceivableRow = {
  id: string;
  customer: string;
  order: string;
  dueAmount: number;
  dueDate: string | null;
  status: LedgerRow['paymentStatus'];
};

type PayableRow = {
  id: string;
  vendor: string;
  linkedRecord: string;
  dueAmount: number;
  dueDate: string | null;
  status: LedgerRow['paymentStatus'];
};

type ProductionCostRow = {
  id: string;
  productBatch: string;
  productName: string;
  inputCost: number;
  laborCost: number;
  equipmentCost: number;
  packagingCost: number;
  totalCost: number;
  revenue: number;
  estimatedMargin: number;
};

type IncomeForm = {
  date: string;
  customer: string;
  sourceOrder: string;
  productService: string;
  amount: string;
  paymentMethod: string;
  paymentStatus: LedgerRow['paymentStatus'];
  dueDate: string;
  notes: string;
  sector: string;
};

type ExpenseForm = {
  date: string;
  category: string;
  vendor: string;
  linkedModule: string;
  description: string;
  amount: string;
  paymentMethod: string;
  paymentStatus: LedgerRow['paymentStatus'];
  dueDate: string;
  receiptUrl: string;
  notes: string;
  sector: string;
};

const chartColors = ['#22c55e', '#38bdf8', '#f59e0b', '#f97316', '#a78bfa'];

const defaultIncomeForm: IncomeForm = {
  date: new Date().toISOString().slice(0, 10),
  customer: '',
  sourceOrder: '',
  productService: '',
  amount: '',
  paymentMethod: 'cash',
  paymentStatus: 'paid',
  dueDate: '',
  notes: '',
  sector: 'Crop Production',
};

const defaultExpenseForm: ExpenseForm = {
  date: new Date().toISOString().slice(0, 10),
  category: 'other',
  vendor: '',
  linkedModule: 'manual',
  description: '',
  amount: '',
  paymentMethod: 'cash',
  paymentStatus: 'unpaid',
  dueDate: '',
  receiptUrl: '',
  notes: '',
  sector: 'Crop Production',
};

function amountValue(value: string) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function statusBadge(status: LedgerRow['paymentStatus']) {
  const map: Record<LedgerRow['paymentStatus'], string> = {
    paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'partially paid': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    unpaid: 'bg-slate-500/15 text-slate-200 border-slate-500/30',
    overdue: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  return map[status];
}

function moduleBadge(linkedModule: string) {
  const tones: Record<string, string> = {
    sales: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    marketing: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    procurement: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    payroll: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    maintenance: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    contractor: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
    manual: 'bg-slate-500/15 text-slate-200 border-slate-500/30',
    distribution: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    production: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  };
  return tones[linkedModule] ?? tones.manual;
}

function SnapshotCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof DollarSign;
}) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</p>
          <p className="text-2xl font-semibold text-white">{value}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <Icon className="h-4 w-4 text-slate-200" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Finance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canEdit, canExport } = usePermissions();
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState<IncomeForm>(defaultIncomeForm);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(defaultExpenseForm);

  const { data: summary } = useQuery<Summary>({
    queryKey: ['finance-summary-v2'],
    queryFn: () => api.get('/finance/summary'),
  });

  const { data: cashFlow = [] } = useQuery<CashFlowRow[]>({
    queryKey: ['finance-cash-flow'],
    queryFn: () => api.get('/finance/cash-flow'),
  });

  const { data: profitability = [] } = useQuery<SectorProfitability[]>({
    queryKey: ['finance-profitability'],
    queryFn: () => api.get('/finance/profitability'),
  });

  const { data: incomeLedger = [] } = useQuery<LedgerRow[]>({
    queryKey: ['finance-income-ledger'],
    queryFn: () => api.get('/finance/income'),
  });

  const { data: expenseLedger = [] } = useQuery<LedgerRow[]>({
    queryKey: ['finance-expense-ledger'],
    queryFn: () => api.get('/finance/expenses'),
  });

  const { data: receivables = [] } = useQuery<ReceivableRow[]>({
    queryKey: ['finance-receivables'],
    queryFn: () => api.get('/finance/receivables'),
  });

  const { data: payables = [] } = useQuery<PayableRow[]>({
    queryKey: ['finance-payables'],
    queryFn: () => api.get('/finance/payables'),
  });

  const { data: costOfProduction = [] } = useQuery<ProductionCostRow[]>({
    queryKey: ['finance-cost-of-production'],
    queryFn: () => api.get('/finance/cost-of-production'),
  });

  const invalidateFinance = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['finance-summary-v2'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-cash-flow'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-profitability'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-income-ledger'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-expense-ledger'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-receivables'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-payables'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-cost-of-production'] }),
    ]);

  const createIncome = useMutation({
    mutationFn: () =>
      api.post('/finance/income', {
        date: incomeForm.date,
        customer: incomeForm.customer,
        sourceOrder: incomeForm.sourceOrder || undefined,
        productService: incomeForm.productService,
        amount: amountValue(incomeForm.amount),
        paymentMethod: incomeForm.paymentMethod,
        paymentStatus: incomeForm.paymentStatus,
        dueDate: incomeForm.dueDate || undefined,
        notes: incomeForm.notes || undefined,
        sector: incomeForm.sector || undefined,
      }),
    onSuccess: async () => {
      await invalidateFinance();
      setIncomeDialogOpen(false);
      setIncomeForm(defaultIncomeForm);
      toast({ title: 'Income record created' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to create income record', variant: 'destructive' }),
  });

  const createExpense = useMutation({
    mutationFn: () =>
      api.post('/finance/expenses', {
        date: expenseForm.date,
        category: expenseForm.category,
        vendor: expenseForm.vendor,
        linkedModule: expenseForm.linkedModule,
        description: expenseForm.description,
        amount: amountValue(expenseForm.amount),
        paymentMethod: expenseForm.paymentMethod,
        paymentStatus: expenseForm.paymentStatus,
        dueDate: expenseForm.dueDate || undefined,
        receiptUrl: expenseForm.receiptUrl || undefined,
        notes: expenseForm.notes || undefined,
        sector: expenseForm.sector || undefined,
      }),
    onSuccess: async () => {
      await invalidateFinance();
      setExpenseDialogOpen(false);
      setExpenseForm(defaultExpenseForm);
      toast({ title: 'Expense record created' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to create expense record', variant: 'destructive' }),
  });

  const patchIncome = useMutation({
    mutationFn: ({ id, paymentStatus }: { id: string; paymentStatus: LedgerRow['paymentStatus'] }) =>
      api.patch(`/finance/income/${id}`, { paymentStatus }),
    onSuccess: async () => {
      await invalidateFinance();
      toast({ title: 'Income status updated' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to update income', variant: 'destructive' }),
  });

  const patchExpense = useMutation({
    mutationFn: ({ id, paymentStatus }: { id: string; paymentStatus: LedgerRow['paymentStatus'] }) =>
      api.patch(`/finance/expenses/${id}`, { paymentStatus }),
    onSuccess: async () => {
      await invalidateFinance();
      toast({ title: 'Expense status updated' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to update expense', variant: 'destructive' }),
  });

  async function exportReport(type: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/v1/finance/export/${type}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${type}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: error.message || 'Failed to export report', variant: 'destructive' });
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_24%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.95))] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">Financial Snapshot</Badge>
              <div>
                <h1 className="text-3xl font-semibold text-white">Finance &amp; Accounting</h1>
                <p className="text-slate-400">Income, expenses, payables, receivables, payroll, and farm profitability.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Dialog open={incomeDialogOpen} onOpenChange={setIncomeDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" disabled={!canEdit('finance')}>
                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                    Add Income
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record income</DialogTitle>
                    <DialogDescription>Create a manual income transaction for cash sales, service income, or adjustments.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4">
                    <Grid2>
                      <Field label="Date"><Input type="date" value={incomeForm.date} onChange={(e) => setIncomeForm((s) => ({ ...s, date: e.target.value }))} /></Field>
                      <Field label="Customer"><Input value={incomeForm.customer} onChange={(e) => setIncomeForm((s) => ({ ...s, customer: e.target.value }))} /></Field>
                    </Grid2>
                    <Grid2>
                      <Field label="Source Order"><Input value={incomeForm.sourceOrder} onChange={(e) => setIncomeForm((s) => ({ ...s, sourceOrder: e.target.value }))} /></Field>
                      <Field label="Product / Service"><Input value={incomeForm.productService} onChange={(e) => setIncomeForm((s) => ({ ...s, productService: e.target.value }))} /></Field>
                    </Grid2>
                    <Grid2>
                      <Field label="Amount"><Input type="number" value={incomeForm.amount} onChange={(e) => setIncomeForm((s) => ({ ...s, amount: e.target.value }))} /></Field>
                      <Field label="Payment Method">
                        <Select value={incomeForm.paymentMethod} onValueChange={(value) => setIncomeForm((s) => ({ ...s, paymentMethod: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['cash', 'bank transfer', 'mobile money', 'credit', 'cheque', 'other'].map((method) => <SelectItem key={method} value={method}>{titleize(method)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                    </Grid2>
                    <Grid2>
                      <Field label="Payment Status">
                        <Select value={incomeForm.paymentStatus} onValueChange={(value: LedgerRow['paymentStatus']) => setIncomeForm((s) => ({ ...s, paymentStatus: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['unpaid', 'partially paid', 'paid', 'overdue'].map((status) => <SelectItem key={status} value={status}>{titleize(status)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Due Date"><Input type="date" value={incomeForm.dueDate} onChange={(e) => setIncomeForm((s) => ({ ...s, dueDate: e.target.value }))} /></Field>
                    </Grid2>
                    <Field label="Sector">
                      <Select value={incomeForm.sector} onValueChange={(value) => setIncomeForm((s) => ({ ...s, sector: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Crop Production', 'Livestock', 'Aquaculture', 'Finished Goods / Processing', 'Logistics / Distribution'].map((sector) => <SelectItem key={sector} value={sector}>{sector}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Notes"><Textarea rows={3} value={incomeForm.notes} onChange={(e) => setIncomeForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => createIncome.mutate()} disabled={createIncome.isPending || !incomeForm.customer.trim() || !incomeForm.productService.trim()}>
                      Save Income
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" disabled={!canEdit('finance')}>
                    <ArrowDownCircle className="mr-2 h-4 w-4" />
                    Add Expense
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record expense</DialogTitle>
                    <DialogDescription>Add a manual farm expense with category, payment status, and due date.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4">
                    <Grid2>
                      <Field label="Date"><Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((s) => ({ ...s, date: e.target.value }))} /></Field>
                      <Field label="Vendor / Worker / Supplier"><Input value={expenseForm.vendor} onChange={(e) => setExpenseForm((s) => ({ ...s, vendor: e.target.value }))} /></Field>
                    </Grid2>
                    <Grid2>
                      <Field label="Category">
                        <Select value={expenseForm.category} onValueChange={(value) => setExpenseForm((s) => ({ ...s, category: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['procurement', 'payroll', 'contractor', 'maintenance', 'transport', 'utilities', 'packaging', 'feed', 'fertilizer', 'chemical', 'other'].map((category) => (
                              <SelectItem key={category} value={category}>{titleize(category)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Linked Module">
                        <Select value={expenseForm.linkedModule} onValueChange={(value) => setExpenseForm((s) => ({ ...s, linkedModule: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['manual', 'procurement', 'payroll', 'maintenance', 'contractor', 'distribution', 'production'].map((module) => (
                              <SelectItem key={module} value={module}>{titleize(module)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </Grid2>
                    <Grid2>
                      <Field label="Amount"><Input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm((s) => ({ ...s, amount: e.target.value }))} /></Field>
                      <Field label="Payment Method">
                        <Select value={expenseForm.paymentMethod} onValueChange={(value) => setExpenseForm((s) => ({ ...s, paymentMethod: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['cash', 'bank transfer', 'mobile money', 'credit', 'cheque', 'other'].map((method) => <SelectItem key={method} value={method}>{titleize(method)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                    </Grid2>
                    <Grid2>
                      <Field label="Payment Status">
                        <Select value={expenseForm.paymentStatus} onValueChange={(value: LedgerRow['paymentStatus']) => setExpenseForm((s) => ({ ...s, paymentStatus: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['unpaid', 'partially paid', 'paid', 'overdue'].map((status) => <SelectItem key={status} value={status}>{titleize(status)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Due Date"><Input type="date" value={expenseForm.dueDate} onChange={(e) => setExpenseForm((s) => ({ ...s, dueDate: e.target.value }))} /></Field>
                    </Grid2>
                    <Field label="Description"><Input value={expenseForm.description} onChange={(e) => setExpenseForm((s) => ({ ...s, description: e.target.value }))} /></Field>
                    <Grid2>
                      <Field label="Receipt URL"><Input value={expenseForm.receiptUrl} onChange={(e) => setExpenseForm((s) => ({ ...s, receiptUrl: e.target.value }))} /></Field>
                      <Field label="Sector">
                        <Select value={expenseForm.sector} onValueChange={(value) => setExpenseForm((s) => ({ ...s, sector: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['Crop Production', 'Livestock', 'Aquaculture', 'Finished Goods / Processing', 'Logistics / Distribution'].map((sector) => <SelectItem key={sector} value={sector}>{sector}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                    </Grid2>
                    <Field label="Notes"><Textarea rows={3} value={expenseForm.notes} onChange={(e) => setExpenseForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => createExpense.mutate()} disabled={createExpense.isPending || !expenseForm.vendor.trim() || !expenseForm.description.trim()}>
                      Save Expense
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SnapshotCard title="Gross Revenue" value={formatCurrency(summary?.grossRevenue)} detail="Recognised sales and manual income" icon={ArrowUpCircle} />
            <SnapshotCard title="Total Expenses" value={formatCurrency(summary?.totalExpenses)} detail="Procurement, payroll, maintenance, and overheads" icon={ArrowDownCircle} />
            <SnapshotCard title="Net Profit" value={formatCurrency(summary?.netProfit)} detail="Income minus operating cost" icon={PiggyBank} />
            <SnapshotCard title="Cash Collected" value={formatCurrency(summary?.cashCollected)} detail="Paid and partially paid inflows" icon={WalletCards} />
            <SnapshotCard title="Receivables" value={formatCurrency(summary?.receivables)} detail="Money still owed by customers" icon={Receipt} />
            <SnapshotCard title="Payables" value={formatCurrency(summary?.payables)} detail="Amounts owed to suppliers and workers" icon={Landmark} />
            <SnapshotCard title="Payroll Due" value={formatCurrency(summary?.payrollDue)} detail="Outstanding labor payout" icon={BriefcaseBusiness} />
            <SnapshotCard title="Procurement Costs" value={formatCurrency(summary?.procurementCosts)} detail="Supply and input purchasing burden" icon={Banknote} />
            <SnapshotCard title="Maintenance Costs" value={formatCurrency(summary?.maintenanceCosts)} detail="Workshop, service, and repair spend" icon={Tractor} />
            <SnapshotCard title="Profit Margin %" value={formatPercent(summary?.profitMargin)} detail="Net profitability against revenue" icon={DollarSign} />
          </div>
        </section>

        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Cash Flow Chart</CardTitle>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => `$${value}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }}
                  formatter={(value: number) => formatCurrencyPrecise(value)}
                />
                <Legend />
                <Bar dataKey="income" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" fill="#ef4444" radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="netProfit" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Profitability by Sector</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {profitability.map((row) => (
                <div key={row.sector} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-medium text-white">{row.sector}</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between"><span className="text-slate-500">Revenue</span><span className="text-emerald-300">{formatCurrencyPrecise(row.revenue)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-500">Cost</span><span className="text-rose-300">{formatCurrencyPrecise(row.cost)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-500">Profit/Loss</span><span className={row.profit >= 0 ? 'text-cyan-300' : 'text-amber-300'}>{formatCurrencyPrecise(row.profit)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-500">Margin</span><span className="text-slate-100">{formatPercent(row.margin)}</span></div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Sector Margin Overview</CardTitle>
            </CardHeader>
            <CardContent className="h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitability}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="sector" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tickFormatter={(value) => `${value}%`} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} formatter={(value: number) => `${value.toFixed(1)}%`} />
                  <Bar dataKey="margin" radius={[6, 6, 0, 0]}>
                    {profitability.map((row, index) => <Cell key={row.sector} fill={chartColors[index % chartColors.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>

        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Income / Sales Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Source Order</TableHead>
                  <TableHead>Product / Service</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Payment Status</TableHead>
                  <TableHead>Recorded By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomeLedger.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.transactionId}</TableCell>
                    <TableCell>{formatFinanceDate(row.date)}</TableCell>
                    <TableCell className="font-medium text-white">{row.customer || 'Walk-in customer'}</TableCell>
                    <TableCell>{row.sourceOrder || 'Manual'}</TableCell>
                    <TableCell>{row.productService || row.description}</TableCell>
                    <TableCell className="font-medium text-emerald-300">{formatCurrencyPrecise(row.amount)}</TableCell>
                    <TableCell>{titleize(row.paymentMethod)}</TableCell>
                    <TableCell><Badge className={statusBadge(row.paymentStatus)}>{titleize(row.paymentStatus)}</Badge></TableCell>
                    <TableCell>{row.recordedBy || 'System'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Badge className={moduleBadge(row.linkedModule)}>{titleize(row.linkedModule)}</Badge>
                        {canEdit('finance') && row.paymentStatus !== 'paid' && (
                          <Button size="sm" variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => patchIncome.mutate({ id: row.id, paymentStatus: 'paid' })}>
                            Mark Paid
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!incomeLedger.length && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-slate-500">No income transactions available.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Expense Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor / Worker / Supplier</TableHead>
                  <TableHead>Linked Module</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Status</TableHead>
                  <TableHead>Receipt Attached</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseLedger.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.transactionId}</TableCell>
                    <TableCell>{formatFinanceDate(row.date)}</TableCell>
                    <TableCell><Badge className={moduleBadge(row.category || 'other')}>{titleize(row.category)}</Badge></TableCell>
                    <TableCell className="font-medium text-white">{row.vendor || 'Vendor'}</TableCell>
                    <TableCell><Badge className={moduleBadge(row.linkedModule)}>{titleize(row.linkedModule)}</Badge></TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell className="font-medium text-rose-300">{formatCurrencyPrecise(row.amount)}</TableCell>
                    <TableCell><Badge className={statusBadge(row.paymentStatus)}>{titleize(row.paymentStatus)}</Badge></TableCell>
                    <TableCell>{row.receiptAttached ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      {canEdit('finance') && row.paymentStatus !== 'paid' ? (
                        <Button size="sm" variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => patchExpense.mutate({ id: row.id, paymentStatus: 'paid' })}>
                          Mark Paid
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-500">Posted</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!expenseLedger.length && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-slate-500">No expense transactions available.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Receivables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {receivables.map((row) => (
                <div key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">{row.customer}</p>
                      <p className="text-sm text-slate-400">{row.order}</p>
                    </div>
                    <Badge className={statusBadge(row.status)}>{titleize(row.status)}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Due Amount</span>
                    <span className="text-emerald-300">{formatCurrencyPrecise(row.dueAmount)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Due Date</span>
                    <span className="text-slate-200">{formatFinanceDate(row.dueDate)}</span>
                  </div>
                </div>
              ))}
              {!receivables.length && <p className="py-6 text-center text-sm text-slate-500">No open receivables.</p>}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Payables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {payables.map((row) => (
                <div key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">{row.vendor}</p>
                      <p className="text-sm text-slate-400">{row.linkedRecord}</p>
                    </div>
                    <Badge className={statusBadge(row.status)}>{titleize(row.status)}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Due Amount</span>
                    <span className="text-rose-300">{formatCurrencyPrecise(row.dueAmount)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Due Date</span>
                    <span className="text-slate-200">{formatFinanceDate(row.dueDate)}</span>
                  </div>
                </div>
              ))}
              {!payables.length && <p className="py-6 text-center text-sm text-slate-500">No open payables.</p>}
            </CardContent>
          </Card>
        </section>

        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Cost of Production Panel</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product / Batch</TableHead>
                  <TableHead>Input Cost</TableHead>
                  <TableHead>Labor Cost</TableHead>
                  <TableHead>Equipment Cost</TableHead>
                  <TableHead>Packaging Cost</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Estimated Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costOfProduction.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-white">{row.productBatch}<div className="text-xs text-slate-500">{row.productName}</div></TableCell>
                    <TableCell>{formatCurrencyPrecise(row.inputCost)}</TableCell>
                    <TableCell>{formatCurrencyPrecise(row.laborCost)}</TableCell>
                    <TableCell>{formatCurrencyPrecise(row.equipmentCost)}</TableCell>
                    <TableCell>{formatCurrencyPrecise(row.packagingCost)}</TableCell>
                    <TableCell className="text-rose-300">{formatCurrencyPrecise(row.totalCost)}</TableCell>
                    <TableCell className="text-emerald-300">{formatCurrencyPrecise(row.revenue)}</TableCell>
                    <TableCell>{formatPercent(row.estimatedMargin)}</TableCell>
                  </TableRow>
                ))}
                {!costOfProduction.length && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-slate-500">No production cost rows available.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Financial Reports</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { key: 'income-statement', label: 'Export Income Statement CSV', icon: FileSpreadsheet },
              { key: 'expense-report', label: 'Export Expense Report CSV', icon: Download },
              { key: 'payroll-summary', label: 'Export Payroll Summary CSV', icon: BriefcaseBusiness },
              { key: 'procurement-cost', label: 'Export Procurement Cost CSV', icon: Factory },
              { key: 'profitability-summary', label: 'Export Profitability Summary CSV', icon: DollarSign },
            ].map((report) => (
              <button
                key={report.key}
                type="button"
                disabled={!canExport('finance')}
                onClick={() => exportReport(report.key)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-emerald-500/30 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <report.icon className="mb-3 h-5 w-5 text-slate-200" />
                <p className="font-medium text-white">{report.label}</p>
                <p className="mt-1 text-xs text-slate-500">CSV export for accounting review and audit support.</p>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}
