import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, DollarSign, Package, Wrench, Users } from 'lucide-react';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type FinView = 'income' | 'expenses' | 'profit' | 'purchase_requests' | 'contractor' | 'wages' | null;

export default function Finance() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [finView, setFinView] = useState<FinView>(null);

  const { data: marketingOrders = [] } = useQuery<any[]>({
    queryKey: ['marketing-orders'],
    queryFn: () => api.get('/marketing/orders'),
  });

  const { data: procRequests = [] } = useQuery<any[]>({
    queryKey: ['proc-requests-fin'],
    queryFn: () => api.get('/inventory/proc-requests'),
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees-fin'],
    queryFn: () => api.get('/hr/employees'),
  });

  const { data: contractorPayments = [], refetch: refetchContractorPayments } = useQuery<any[]>({
    queryKey: ['finance-contractor-payments'],
    queryFn: () => api.get('/hr/contractor-payments'),
  });

  const { data: personnelWages = [], refetch: refetchWages } = useQuery<any[]>({
    queryKey: ['finance-wages'],
    queryFn: () => api.get('/hr/wages'),
  });

  const payContractor = useMutation({
    mutationFn: (id: string) => api.patch(`/hr/contractor-payments/${id}/pay`, {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['finance-contractor-payments'] });
      toast({ title: data.message ?? 'Payment Successful' });
    },
    onError: (e: any) => toast({ title: e.message || 'Error', variant: 'destructive' }),
  });

  const payWage = useMutation({
    mutationFn: (id: string) => api.patch(`/hr/wages/${id}/pay`, {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['finance-wages'] });
      toast({ title: data.message ?? 'Payment Successful' });
    },
    onError: (e: any) => toast({ title: e.message || 'Error', variant: 'destructive' }),
  });

  // Income: only sold/delivered orders
  const soldOrders = marketingOrders.filter((o: any) => o.status === 'completed' || o.status === 'delivered');
  const totalIncome = soldOrders.reduce((s: number, o: any) => s + Number(o.amount), 0);

  // Expenses: paid wages + paid contractor payments
  const paidWagesTotal = personnelWages.filter((w: any) => w.payment_status === 'paid').reduce((s: number, w: any) => s + Number(w.amount), 0);
  const paidContractorTotal = contractorPayments.filter((c: any) => c.payment_status === 'paid').reduce((s: number, c: any) => s + Number(c.amount), 0);
  const totalExpenses = paidWagesTotal + paidContractorTotal;
  const netProfit = totalIncome - totalExpenses;

  // Contractor / wages card values
  const pendingContractorTotal = contractorPayments.filter((c: any) => c.payment_status === 'pending').reduce((s: number, c: any) => s + Number(c.amount), 0);
  const pendingWagesTotal = personnelWages.filter((w: any) => w.payment_status === 'pending').reduce((s: number, w: any) => s + Number(w.amount), 0);

  // Legacy fallback for expenses panel
  const totalWages = employees.reduce((s: number, e: any) => {
    if (e.monthly_salary) return s + Number(e.monthly_salary);
    if (e.daily_wage) return s + Number(e.daily_wage) * 22;
    return s;
  }, 0);

  const uniqueMonths = [...new Set(
    soldOrders.filter((o: any) => o.date).map((o: any) => format(new Date(o.date), 'MMM yyyy'))
  )];
  const monthlyExpense = uniqueMonths.length > 0 ? totalExpenses / uniqueMonths.length : 0;

  const chartData = soldOrders.reduce((acc: any[], o: any) => {
    const date = o.date ? format(new Date(o.date), 'MMM yyyy') : 'Unknown';
    const existing = acc.find((a: any) => a.date === date);
    if (existing) {
      existing.income += Number(o.amount);
      existing.profit = existing.income - existing.expenses;
    } else {
      const exp = Math.round(monthlyExpense);
      acc.push({ date, income: Number(o.amount), expenses: exp, profit: Number(o.amount) - exp });
    }
    return acc;
  }, []);

  function fmt(n: number) {
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function cardClass(v: FinView) {
    return `cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${finView === v ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`;
  }

  const CARDS = [
    { key: 'income' as FinView, label: 'Total Income', value: fmt(totalIncome), Icon: TrendingUp, color: 'bg-success/10 border-success/20 text-success' },
    { key: 'expenses' as FinView, label: 'Total Expenses', value: fmt(totalExpenses), Icon: TrendingDown, color: 'bg-destructive/10 border-destructive/20 text-destructive' },
    { key: 'profit' as FinView, label: 'Net Profit', value: fmt(netProfit), Icon: DollarSign, color: netProfit >= 0 ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-warning/10 border-warning/20 text-warning' },
    { key: 'purchase_requests' as FinView, label: 'Purchase Requests', value: String(procRequests.length), Icon: Package, color: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
    { key: 'contractor' as FinView, label: 'Contractor Payment', value: fmt(pendingContractorTotal), Icon: Wrench, color: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
    { key: 'wages' as FinView, label: 'Personnel Wages', value: fmt(pendingWagesTotal), Icon: Users, color: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Finance & Accounting</h1>
          <p className="text-muted-foreground">Track income, expenses, and profitability</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {CARDS.map(({ key, label, value, Icon, color }) => (
            <Card key={key} className={`border ${color} ${cardClass(key)}`} onClick={() => setFinView(prev => prev === key ? null : key)}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${color.replace('border-', 'bg-').replace('/10', '/20').replace('/20', '/30')}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold">{value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Financial Overview */}
        <Card>
          <CardHeader><CardTitle>Financial Overview</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                <XAxis dataKey="date" stroke="hsl(220, 10%, 55%)" tick={{ fontSize: 12 }} />
                <YAxis stroke="hsl(220, 10%, 55%)" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }}
                  formatter={(v: number) => `$${v.toLocaleString()}`}
                />
                <Legend />
                <Line type="monotone" dataKey="income" stroke="hsl(142, 70%, 50%)" name="Income" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" stroke="hsl(0, 72%, 51%)" name="Expenses" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" stroke="hsl(217, 91%, 60%)" name="Net Profit" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Income Panel ── */}
        {finView === 'income' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Total Income — Marketing Orders</CardTitle>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span className="text-success font-medium">{soldOrders.length} Sold</span>
                  <span>{marketingOrders.length - soldOrders.length} Processing</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marketingOrders.map((o: any) => {
                    const isSold = o.status === 'completed' || o.status === 'delivered';
                    return (
                      <TableRow key={o.id} className={isSold ? '' : 'opacity-50'}>
                        <TableCell className="font-mono text-sm">{o.order_id}</TableCell>
                        <TableCell className="font-medium">{o.item_name}</TableCell>
                        <TableCell>{Number(o.quantity).toFixed(2)} {o.quantity_unit}</TableCell>
                        <TableCell>
                          <Badge className={isSold ? 'bg-success/20 text-success' : 'bg-info/20 text-info'}>
                            {isSold ? 'Sold' : 'Processing'}
                          </Badge>
                        </TableCell>
                        <TableCell>{o.date ? format(new Date(o.date), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${isSold ? 'text-success' : 'text-muted-foreground'}`}>
                          ${Number(o.amount).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!marketingOrders.length && (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No income records</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {marketingOrders.length > 0 && (
                <div className="p-4 border-t flex justify-end gap-8 text-sm">
                  <span className="text-muted-foreground">Processing: <span className="font-medium">${marketingOrders.filter((o: any) => o.status !== 'completed' && o.status !== 'delivered').reduce((s: number, o: any) => s + Number(o.amount), 0).toFixed(2)}</span></span>
                  <span className="text-success font-bold">Recognised Income: ${totalIncome.toFixed(2)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Expenses Panel ── */}
        {finView === 'expenses' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Total Expenses — Payroll Summary</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">Monthly Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((e: any) => {
                    const cost = e.monthly_salary ? Number(e.monthly_salary) : (e.daily_wage ? Number(e.daily_wage) * 22 : 0);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.full_name}</TableCell>
                        <TableCell>{e.job_title || '-'}</TableCell>
                        <TableCell><Badge className="bg-muted text-muted-foreground capitalize">{e.employment_type}</Badge></TableCell>
                        <TableCell className="capitalize">{e.sector || '-'}</TableCell>
                        <TableCell className="text-right font-medium text-destructive">${cost.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!employees.length && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No employee records</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="p-4 border-t flex justify-end gap-8 text-sm">
                <span className="text-muted-foreground">Paid Wages: <span className="font-medium text-destructive">${paidWagesTotal.toFixed(2)}</span></span>
                <span className="text-muted-foreground">Paid Contractors: <span className="font-medium text-destructive">${paidContractorTotal.toFixed(2)}</span></span>
                <span className="text-destructive font-bold">Total Paid: ${totalExpenses.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Profit Panel ── */}
        {finView === 'profit' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Net Profit — Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-success/10 border border-success/20 p-4">
                  <p className="text-sm text-muted-foreground">Total Income</p>
                  <p className="text-xl font-bold text-success">{fmt(totalIncome)}</p>
                </div>
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                  <p className="text-sm text-muted-foreground">Total Expenses</p>
                  <p className="text-xl font-bold text-destructive">{fmt(totalExpenses)}</p>
                </div>
                <div className={`rounded-lg p-4 ${netProfit >= 0 ? 'bg-primary/10 border border-primary/20' : 'bg-warning/10 border border-warning/20'}`}>
                  <p className="text-sm text-muted-foreground">Net Profit</p>
                  <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-primary' : 'text-warning'}`}>{fmt(netProfit)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Purchase Requests Panel ── */}
        {finView === 'purchase_requests' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Purchase Requests — Inventory</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procRequests.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.item_name}</TableCell>
                      <TableCell className="capitalize">{r.category?.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
                      <TableCell>
                        <Badge className={r.status === 'received' ? 'bg-success/20 text-success' : r.status === 'cancelled' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                    </TableRow>
                  ))}
                  {!procRequests.length && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No purchase requests</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Contractor Payment Panel ── */}
        {finView === 'contractor' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Contractor Payment</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor Name</TableHead>
                    <TableHead>Contract Type</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Bank ID</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractorPayments.map((c: any) => (
                    <TableRow key={c.id} className={c.payment_status === 'paid' ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">{c.contractor_name}</TableCell>
                      <TableCell>{c.contract_type ?? '-'}</TableCell>
                      <TableCell className="capitalize">{c.sector ?? '-'}</TableCell>
                      <TableCell className="font-medium">${Number(c.amount).toFixed(2)}</TableCell>
                      <TableCell>{c.bank_id ?? '-'}</TableCell>
                      <TableCell>{c.start_date ? format(new Date(c.start_date), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>{c.end_date ? format(new Date(c.end_date), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>
                        <Badge className={c.payment_status === 'paid' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}>
                          {c.payment_status === 'paid' ? 'Paid' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.payment_status === 'paid' ? (
                          <Badge className="bg-success/20 text-success text-xs">Paid</Badge>
                        ) : (
                          <Button size="sm" className="gradient-primary text-black font-medium text-xs"
                            disabled={payContractor.isPending}
                            onClick={() => { if (confirm(`Make payment of $${Number(c.amount).toFixed(2)} to ${c.contractor_name}?`)) payContractor.mutate(c.id); }}>
                            Make Payment
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!contractorPayments.length && (
                    <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No contractor payments pending</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Personnel Wages Panel ── */}
        {finView === 'wages' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Personnel Wages</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Personnel ID</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Employment Type</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Pay Period</TableHead>
                    <TableHead>Days Worked</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Bank ID</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personnelWages.map((w: any) => (
                    <TableRow key={w.id} className={w.payment_status === 'paid' ? 'opacity-60' : ''}>
                      <TableCell className="font-mono text-xs">{w.personnel_id ?? '-'}</TableCell>
                      <TableCell className="font-medium">{w.full_name}</TableCell>
                      <TableCell className="capitalize">{w.employment_type}</TableCell>
                      <TableCell className="capitalize">{w.sector ?? '-'}</TableCell>
                      <TableCell>{w.pay_period}</TableCell>
                      <TableCell>{w.days_worked}</TableCell>
                      <TableCell className="font-medium">${Number(w.amount).toFixed(2)}</TableCell>
                      <TableCell>{w.bank_id ?? '-'}</TableCell>
                      <TableCell>
                        <Badge className={w.payment_status === 'paid' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}>
                          {w.payment_status === 'paid' ? 'Paid' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {w.payment_status === 'paid' || w.immutable ? (
                          <Badge className="bg-success/20 text-success text-xs">Paid</Badge>
                        ) : (
                          <Button size="sm" className="gradient-primary text-black font-medium text-xs"
                            disabled={payWage.isPending}
                            onClick={() => { if (confirm(`Make payment of $${Number(w.amount).toFixed(2)} to ${w.full_name}?`)) payWage.mutate(w.id); }}>
                            Make Payment
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!personnelWages.length && (
                    <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">No personnel wages pending. Use "Send For Payment" in Human Capital.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
