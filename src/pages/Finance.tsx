import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, DollarSign, Package, Wrench, Users, ShoppingBag, Download, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/contexts/ConfirmContext';

type FinView = 'income' | 'expenses' | 'profit' | 'purchase_requests' | 'purchased_orders' | 'contractor' | 'wages' | null;

function exportToCSV(rows: any[], columns: { key: string; label: string }[], filename: string) {
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(',')
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Finance() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canEdit, canViewCard } = usePermissions();
  const { openConfirm } = useConfirm();
  const [finView, setFinView] = useState<FinView>(null);
  const [dateFilter, setDateFilter] = useState<'all' | '7' | '30' | '90' | '365'>('all');
  const [payPOItem, setPayPOItem] = useState<any | null>(null);
  const [payMethod, setPayMethod] = useState<'bank' | 'mobile_money'>('bank');

  const DAYS_MAP: Record<string, number> = { '7': 7, '30': 30, '90': 90, '365': 365 };
  const withinDays = (dateStr?: string) => {
    if (dateFilter === 'all') return true;
    if (!dateStr) return false;
    return Date.now() - new Date(dateStr).getTime() <= DAYS_MAP[dateFilter] * 24 * 60 * 60 * 1000;
  };

  const { data: marketingOrders = [] } = useQuery<any[]>({
    queryKey: ['marketing-orders'],
    queryFn: () => api.get('/marketing/orders'),
  });

  const { data: purchaseOrders = [] } = useQuery<any[]>({
    queryKey: ['finance-purchase-orders'],
    queryFn: () => api.get('/procurement/purchase-orders'),
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees-fin'],
    queryFn: () => api.get('/hr/employees'),
  });

  const { data: contractorPayments = [] } = useQuery<any[]>({
    queryKey: ['finance-contractor-payments'],
    queryFn: () => api.get('/hr/contractor-payments'),
  });

  const { data: personnelWages = [] } = useQuery<any[]>({
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

  const payPO = useMutation({
    mutationFn: ({ id, paymentMethod }: { id: string; paymentMethod: 'bank' | 'mobile_money' }) =>
      api.post<any>(`/finance/purchase-orders/${id}/pay`, { paymentMethod }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['finance-purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['procurement-analytics'] });
      qc.invalidateQueries({ queryKey: ['procurement-analytics-items'] });
      qc.invalidateQueries({ queryKey: ['marketing-orders'] });
      qc.invalidateQueries({ queryKey: ['finance-wages'] });
      qc.invalidateQueries({ queryKey: ['finance-contractor-payments'] });
      setPayPOItem(null);
      const ref    = data?.transactionRef ?? '';
      const method = data?.paymentMethod === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer';
      toast({ title: `Payment Successful via ${method}`, description: ref ? `Ref: ${ref}` : undefined });
    },
    onError: (e: any) => {
      toast({ title: e.message ?? 'Payment failed', variant: 'destructive' });
    },
  });

  // Income: only sold/delivered orders
  const soldOrders = marketingOrders.filter((o: any) => o.status === 'completed' || o.status === 'delivered');
  const totalIncome = soldOrders.reduce((s: number, o: any) => s + Number(o.amount), 0);

  // Expenses: paid wages + paid contractor payments + paid POs
  const paidWagesTotal = personnelWages.filter((w: any) => w.payment_status === 'paid').reduce((s: number, w: any) => s + Number(w.amount), 0);
  const paidContractorTotal = contractorPayments.filter((c: any) => c.payment_status === 'paid').reduce((s: number, c: any) => s + Number(c.amount), 0);
  const paidPOs = purchaseOrders.filter((p: any) => p.payment_status === 'paid');
  const paidPOsTotal = paidPOs.reduce((s: number, p: any) => s + Number(p.total_amount), 0);
  const totalExpenses = paidWagesTotal + paidContractorTotal + paidPOsTotal;
  const netProfit = totalIncome - totalExpenses;

  const pendingPOs = purchaseOrders.filter((p: any) => p.status !== 'cancelled' && p.payment_status !== 'paid');

  const pendingContractorTotal = contractorPayments.filter((c: any) => c.payment_status === 'pending').reduce((s: number, c: any) => s + Number(c.amount), 0);
  // Total $ of all personnel wages (paid + pending) — matches the Personnel Wages detail table.
  const totalWagesAmount = personnelWages.reduce((s: number, w: any) => s + Number(w.amount), 0);

  function fmt(n: number) {
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Card styling mirrors the Machinery dashboard (structure, spacing, icon tile, typography).
  function cardClass(v: FinView, color: string) {
    return `cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${color} ${finView === v ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`;
  }

  const CARDS = [
    { key: 'income' as FinView, label: 'Total Income', value: fmt(totalIncome), Icon: TrendingUp, color: 'bg-success/10 border-success/20' },
    { key: 'expenses' as FinView, label: 'Total Expenses', value: fmt(totalExpenses), Icon: TrendingDown, color: 'bg-destructive/10 border-destructive/20' },
    { key: 'profit' as FinView, label: 'Net Profit', value: fmt(netProfit), Icon: DollarSign, color: netProfit >= 0 ? 'bg-primary/10 border-primary/20' : 'bg-warning/10 border-warning/20' },
    { key: 'purchase_requests' as FinView, label: 'Purchase Requests', value: String(pendingPOs.length), Icon: Package, color: 'bg-info/10 border-blue-500/20' },
    { key: 'purchased_orders' as FinView, label: 'Purchased Order', value: String(paidPOs.length), Icon: ShoppingBag, color: 'bg-success/10 border-success/20' },
    { key: 'contractor' as FinView, label: 'Contractor Payment', value: fmt(pendingContractorTotal), Icon: Wrench, color: 'bg-warning/10 border-warning/20' },
    { key: 'wages' as FinView, label: 'Personnel Wages', value: fmt(totalWagesAmount), Icon: Users, color: 'bg-secondary/10 border-secondary/20' },
  ];

  // Build total expenses rows for export
  const totalExpensesRows = [
    ...paidPOs.map((p: any) => ({ id: p.po_number, name: p.commodity ?? '-', type: 'Purchased', amount: Number(p.total_amount).toFixed(2), date: p.created_at ? format(new Date(p.created_at), 'MMM d, yyyy') : '-' })),
    ...personnelWages.filter((w: any) => w.payment_status === 'paid').map((w: any) => ({ id: w.personnel_id ?? '-', name: w.full_name, type: 'Wage', amount: Number(w.amount).toFixed(2), date: w.paid_at ? format(new Date(w.paid_at), 'MMM d, yyyy') : '-' })),
    ...contractorPayments.filter((c: any) => c.payment_status === 'paid').map((c: any) => ({ id: c.id?.substring(0, 8).toUpperCase() ?? '-', name: c.contractor_name, type: 'Contractor', amount: Number(c.amount).toFixed(2), date: c.paid_at ? format(new Date(c.paid_at), 'MMM d, yyyy') : '-' })),
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Cards stay visible; clicking expands the row list inline below (Machinery pattern, spec 2). */}
        <div>
          <h1 className="text-3xl font-bold">Finance & Accounting</h1>
          <p className="text-muted-foreground">Track income, expenses, and profitability</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CARDS.filter(({ key }) => canViewCard(`finance.${key}`)).map(({ key, label, value, Icon, color }) => (
            <Card key={key} className={cardClass(key, color)} onClick={() => setFinView(prev => prev === key ? null : key)}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/10"><Icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Inline drilldown header (re-click a card to collapse; selecting another swaps the list). */}
        {finView && (
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h2 className="text-lg font-semibold">{CARDS.find(c => c.key === finView)?.label ?? 'Detail'}</h2>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
              <option value="all">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 365 days</option>
            </select>
          </div>
        )}

        {/* ── Income Panel ── */}
        {finView === 'income' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Total Income — Marketing Orders</CardTitle>
                <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => exportToCSV(marketingOrders.map((o: any) => ({ order_id: o.order_id, item: o.item_name, qty: o.quantity, status: o.status, date: o.date ? format(new Date(o.date), 'MMM d, yyyy') : '-', amount: Number(o.amount).toFixed(2) })), [{ key: 'order_id', label: 'Order ID' }, { key: 'item', label: 'Item' }, { key: 'qty', label: 'Quantity' }, { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' }, { key: 'amount', label: 'Amount' }], 'finance_income.csv')}>
                  <Download className="h-4 w-4 mr-1" />Export CSV
                </Button>
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
                  {marketingOrders.filter((o: any) => withinDays(o.date)).map((o: any) => {
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
            </CardContent>
          </Card>
        )}

        {/* ── Expenses Panel ── */}
        {finView === 'expenses' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Total Expenses</CardTitle>
                <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => exportToCSV(totalExpensesRows, [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name/Commodity' }, { key: 'type', label: 'Type' }, { key: 'amount', label: 'Amount' }, { key: 'date', label: 'Date' }], 'finance_expenses.csv')}>
                  <Download className="h-4 w-4 mr-1" />Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name / Commodity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {totalExpensesRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">{row.id}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell><Badge className="bg-muted text-muted-foreground">{row.type}</Badge></TableCell>
                      <TableCell className="text-right font-medium text-destructive">${row.amount}</TableCell>
                      <TableCell>{row.date}</TableCell>
                    </TableRow>
                  ))}
                  {!totalExpensesRows.length && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No expense records</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="p-4 border-t flex justify-end gap-8 text-sm">
                <span className="text-muted-foreground">Paid Wages: <span className="font-medium text-destructive">${paidWagesTotal.toFixed(2)}</span></span>
                <span className="text-muted-foreground">Paid Contractors: <span className="font-medium text-destructive">${paidContractorTotal.toFixed(2)}</span></span>
                <span className="text-muted-foreground">Purchased Orders: <span className="font-medium text-destructive">${paidPOsTotal.toFixed(2)}</span></span>
                <span className="text-destructive font-bold">Total Paid: ${totalExpenses.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Profit Panel ── */}
        {finView === 'profit' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Net Profit — Summary</CardTitle>
                <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => exportToCSV([{ income: totalIncome.toFixed(2), expenses: totalExpenses.toFixed(2), net_profit: netProfit.toFixed(2) }], [{ key: 'income', label: 'Total Income' }, { key: 'expenses', label: 'Total Expenses' }, { key: 'net_profit', label: 'Net Profit' }], 'finance_profit.csv')}>
                  <Download className="h-4 w-4 mr-1" />Export CSV
                </Button>
              </div>
            </CardHeader>
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
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Purchase Requests</CardTitle>
                <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => exportToCSV(pendingPOs.map((p: any) => ({ po_number: p.po_number, supplier: p.suppliers?.name ?? '-', commodity: p.commodity ?? '-', quantity: p.quantity != null ? Number(p.quantity).toFixed(2) : '-', amount: Number(p.total_amount).toFixed(2), payment_method: p.suppliers?.payment_method?.replace('_', ' ') ?? '-', account_number: p.suppliers?.account_number ?? '-', status: p.status, date: p.created_at ? format(new Date(p.created_at), 'MMM d, yyyy') : '-' })), [{ key: 'po_number', label: 'PO Number' }, { key: 'supplier', label: 'Supplier' }, { key: 'commodity', label: 'Commodity' }, { key: 'quantity', label: 'Quantity' }, { key: 'amount', label: 'Amount' }, { key: 'payment_method', label: 'Payment Method' }, { key: 'account_number', label: 'Account Number' }, { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' }], 'finance_purchase_requests.csv')}>
                  <Download className="h-4 w-4 mr-1" />Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Commodity</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Account Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    {canEdit('finance') && <TableHead>Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPOs.filter((p: any) => withinDays(p.created_at)).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.po_number}</TableCell>
                      <TableCell className="font-medium">{p.suppliers?.name ?? '-'}</TableCell>
                      <TableCell>{p.commodity ?? '-'}</TableCell>
                      <TableCell>{p.quantity != null ? Number(p.quantity).toFixed(2) : '-'}</TableCell>
                      <TableCell className="font-medium">${Number(p.total_amount).toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{p.suppliers?.payment_method?.replace('_', ' ') ?? '-'}</TableCell>
                      <TableCell>{p.suppliers?.account_number ?? '-'}</TableCell>
                      <TableCell>
                        <Badge className={p.status === 'submitted' ? 'bg-blue-500/20 text-blue-500' : 'bg-warning/20 text-warning'}>
                          {p.status === 'submitted' ? 'Submitted' : 'Pending Payment'}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.created_at ? format(new Date(p.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      {canEdit('finance') && (
                        <TableCell>
                          <Button size="sm" className="gradient-primary text-black font-medium text-xs" onClick={() => setPayPOItem(p)}>
                            Make Payment
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {!pendingPOs.length && (
                    <TableRow><TableCell colSpan={canEdit('finance') ? 10 : 9} className="text-center py-6 text-muted-foreground">No purchase requests</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Purchased Orders Panel ── */}
        {finView === 'purchased_orders' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Purchased Orders</CardTitle>
                <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => exportToCSV(paidPOs.map((p: any) => ({ po_number: p.po_number, supplier: p.suppliers?.name ?? '-', commodity: p.commodity ?? '-', quantity: p.quantity != null ? Number(p.quantity).toFixed(2) : '-', amount: Number(p.total_amount).toFixed(2), payment_method: p.suppliers?.payment_method?.replace('_', ' ') ?? '-', account_number: p.suppliers?.account_number ?? '-', status: 'Paid', date: p.created_at ? format(new Date(p.created_at), 'MMM d, yyyy') : '-' })), [{ key: 'po_number', label: 'PO Number' }, { key: 'supplier', label: 'Supplier' }, { key: 'commodity', label: 'Commodity' }, { key: 'quantity', label: 'Quantity' }, { key: 'amount', label: 'Amount' }, { key: 'payment_method', label: 'Payment Method' }, { key: 'account_number', label: 'Account Number' }, { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' }], 'finance_purchased_orders.csv')}>
                  <Download className="h-4 w-4 mr-1" />Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Commodity</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Account Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paidPOs.filter((p: any) => withinDays(p.created_at)).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.po_number}</TableCell>
                      <TableCell className="font-medium">{p.suppliers?.name ?? '-'}</TableCell>
                      <TableCell>{p.commodity ?? '-'}</TableCell>
                      <TableCell>{p.quantity != null ? Number(p.quantity).toFixed(2) : '-'}</TableCell>
                      <TableCell className="font-medium">${Number(p.total_amount).toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{p.suppliers?.payment_method?.replace('_', ' ') ?? '-'}</TableCell>
                      <TableCell>{p.suppliers?.account_number ?? '-'}</TableCell>
                      <TableCell><Badge className="bg-success/20 text-success">Paid</Badge></TableCell>
                      <TableCell>{p.created_at ? format(new Date(p.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                    </TableRow>
                  ))}
                  {!paidPOs.length && (
                    <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No purchased orders</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Contractor Payment Panel ── */}
        {finView === 'contractor' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Contractor Payment</CardTitle>
                <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => exportToCSV(contractorPayments.map((c: any) => ({ name: c.contractor_name, type: c.contract_type ?? '-', sector: c.sector ?? '-', amount: Number(c.amount).toFixed(2), bank_id: c.bank_id ?? '-', status: c.payment_status === 'paid' ? 'Paid' : 'Pending', date: c.paid_at ? format(new Date(c.paid_at), 'MMM d, yyyy') : '-' })), [{ key: 'name', label: 'Contractor Name' }, { key: 'type', label: 'Contract Type' }, { key: 'sector', label: 'Sector' }, { key: 'amount', label: 'Amount' }, { key: 'bank_id', label: 'Bank ID' }, { key: 'status', label: 'Payment Status' }, { key: 'date', label: 'Date' }], 'finance_contractors.csv')}>
                  <Download className="h-4 w-4 mr-1" />Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor Name</TableHead>
                    <TableHead>Contract Type</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Bank ID</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractorPayments.filter((c: any) => withinDays(c.paid_at ?? c.created_at)).map((c: any) => (
                    <TableRow key={c.id} className={c.payment_status === 'paid' ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">{c.contractor_name}</TableCell>
                      <TableCell>{c.contract_type ?? '-'}</TableCell>
                      <TableCell className="capitalize">{c.sector ?? '-'}</TableCell>
                      <TableCell className="font-medium">${Number(c.amount).toFixed(2)}</TableCell>
                      <TableCell>{c.bank_id ?? '-'}</TableCell>
                      <TableCell>
                        <Badge className={c.payment_status === 'paid' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}>
                          {c.payment_status === 'paid' ? 'Paid' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.paid_at ? format(new Date(c.paid_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>
                        {c.payment_status === 'paid' ? (
                          <Badge className="bg-success/20 text-success text-xs">Paid</Badge>
                        ) : canEdit('finance') ? (
                          <Button size="sm" className="gradient-primary text-black font-medium text-xs"
                            disabled={payContractor.isPending}
                            onClick={() => openConfirm({ title: 'Make Payment', message: `Make payment of $${Number(c.amount).toFixed(2)} to ${c.contractor_name}?`, type: 'info', confirmText: 'Pay', onConfirm: () => payContractor.mutate(c.id) })}>
                            Make Payment
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!contractorPayments.length && (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No contractor payments pending</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Personnel Wages Panel ── */}
        {finView === 'wages' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Personnel Wages</CardTitle>
                <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => exportToCSV(personnelWages.map((w: any) => ({ personnel_id: w.personnel_id ?? '-', name: w.full_name, type: w.employment_type, sector: w.sector ?? '-', pay_period: w.pay_period, days: w.days_worked, amount: Number(w.amount).toFixed(2), bank_id: w.bank_id ?? '-', status: w.payment_status === 'paid' ? 'Paid' : 'Pending', date: w.paid_at ? format(new Date(w.paid_at), 'MMM d, yyyy') : '-' })), [{ key: 'personnel_id', label: 'Personnel ID' }, { key: 'name', label: 'Full Name' }, { key: 'type', label: 'Employment Type' }, { key: 'sector', label: 'Sector' }, { key: 'pay_period', label: 'Pay Period' }, { key: 'days', label: 'Days Worked' }, { key: 'amount', label: 'Amount' }, { key: 'bank_id', label: 'Bank ID' }, { key: 'status', label: 'Payment Status' }, { key: 'date', label: 'Date' }], 'finance_wages.csv')}>
                  <Download className="h-4 w-4 mr-1" />Export CSV
                </Button>
              </div>
            </CardHeader>
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
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personnelWages.filter((w: any) => withinDays(w.paid_at ?? w.created_at)).map((w: any) => (
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
                      <TableCell>{w.paid_at ? format(new Date(w.paid_at), 'MMM d, yyyy') : '-'}</TableCell>
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

        {/* ── PO Payment Modal ── */}
        <Dialog open={!!payPOItem} onOpenChange={(o) => { if (!o) { setPayPOItem(null); setPayMethod('bank'); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Make Payment</DialogTitle></DialogHeader>
            {payPOItem && (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">PO Number</span><span className="font-medium">{payPOItem.po_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-medium">{payPOItem.suppliers?.name ?? '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Commodity</span><span className="font-medium">{payPOItem.commodity ?? '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold text-lg">${Number(payPOItem.total_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Account Number</span><span>{payPOItem.suppliers?.account_number ?? '-'}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net Profit Balance</span>
                    <span className={`font-semibold ${netProfit >= Number(payPOItem.total_amount) ? 'text-success' : 'text-destructive'}`}>
                      ${netProfit.toFixed(2)}
                    </span>
                  </div>
                </div>

                {Number(payPOItem.total_amount) > netProfit && (
                  <p className="text-xs text-destructive font-medium rounded border border-destructive/30 bg-destructive/10 px-3 py-2">
                    Insufficient fund to process payment — balance ${netProfit.toFixed(2)} is less than ${Number(payPOItem.total_amount).toFixed(2)}.
                  </p>
                )}

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as 'bank' | 'mobile_money')}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="bank">Bank Transfer</option>
                    <option value="mobile_money">Mobile Money</option>
                  </select>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1 gradient-primary text-black font-medium"
                    disabled={payPO.isPending || Number(payPOItem.total_amount) > netProfit}
                    onClick={() => payPO.mutate({ id: payPOItem.id, paymentMethod: payMethod })}
                  >
                    {payPO.isPending ? 'Processing...' : 'Confirm Payment'}
                  </Button>
                  <Button variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => { setPayPOItem(null); setPayMethod('bank'); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
