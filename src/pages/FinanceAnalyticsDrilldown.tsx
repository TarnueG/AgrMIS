import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, RefreshCw, Inbox } from 'lucide-react';

const TITLES: Record<string, string> = {
  revenue: 'Revenue — Completed Sales', sold: 'Sold (Completed Orders)', sales: 'Sales',
  invoices: 'Invoices', 'net-profit': 'Net Profit Contributions', profit: 'Net Profit Contributions',
  expenses: 'Expenses', spending: 'Spending', 'cost-analysis': 'Cost Analysis',
  wages: 'Payroll & Wages', contractors: 'Contractor Payments',
  purchases: 'Commodity Purchases', commodities: 'Commodity Purchases', 'top-commodities': 'Commodity Purchases',
  transactions: 'All Transactions',
};
const PAGE_SIZE = 25;
const fmt = (n: number) => `$${Math.round(Number(n)).toLocaleString()}`;
function statusBadge(s: string): string {
  const v = String(s).toLowerCase();
  if (v === 'paid') return 'bg-success/20 text-success';
  if (v === 'sold' || v === 'completed' || v === 'delivered') return 'bg-[#675CB0]/20 text-[#a39be0]';
  if (v === 'pending' || v === 'awaiting_payment') return 'bg-amber-500/20 text-amber-400';
  return 'bg-warning/20 text-warning';
}

function SkeletonRows({ cols }: { cols: number }) {
  return <>{Array.from({ length: 7 }, (_, i) => <TableRow key={i} aria-hidden>{Array.from({ length: cols }, (_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" style={{ width: j === 0 ? '90px' : '110px' }} /></TableCell>)}</TableRow>)}</>;
}

export default function FinanceAnalyticsDrilldown() {
  const { metric = '' } = useParams<{ metric: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['fin-drilldown', metric, page],
    queryFn: () => api.get(`/finance/analytics/details/${metric}?page=${page}&pageSize=${PAGE_SIZE}`),
    enabled: !!metric,
    staleTime: 15_000,
  });

  const isOrders = ['revenue', 'invoices', 'sold', 'sales', 'top-items'].includes(metric);
  const isProfit = metric === 'net-profit' || metric === 'profit';
  const isExpenses = ['expenses', 'spending', 'cost-analysis'].includes(metric);
  const isWages = metric === 'wages';
  const isContractors = metric === 'contractors';
  const isPurchases = ['purchases', 'commodities', 'top-commodities'].includes(metric);
  const isTransactions = metric === 'transactions';

  const cols = isOrders ? 6 : isProfit ? 4 : isExpenses ? 4 : isWages || isContractors ? 5 : isPurchases ? 6 : 4;
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const items: any[] = data?.items ?? [];

  let headers: string[] = [];
  let rows: React.ReactNode = null;
  if (data && !isLoading && !isError) {
    if (isOrders) {
      headers = ['Invoice', 'Item', 'Customer', 'Qty', 'Amount', 'Status'];
      rows = items.map(o => <TableRow key={o.id}><TableCell className="font-mono text-xs">{o.number}</TableCell><TableCell className="font-medium">{o.item}</TableCell><TableCell>{o.customer}</TableCell><TableCell className="tabular-nums">{Number(o.quantity).toLocaleString()}</TableCell><TableCell className="tabular-nums">{fmt(o.amount)}</TableCell><TableCell><Badge className={statusBadge(o.status)}>{o.status}</Badge></TableCell></TableRow>);
    } else if (isProfit) {
      headers = ['Invoice', 'Item', 'Amount', 'Date'];
      rows = items.map(o => <TableRow key={o.id}><TableCell className="font-mono text-xs">{o.number}</TableCell><TableCell className="font-medium">{o.item}</TableCell><TableCell className="tabular-nums text-success">{fmt(o.amount)}</TableCell><TableCell className="text-muted-foreground">{o.date ? format(new Date(o.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    } else if (isExpenses) {
      headers = ['Name', 'Category', 'Amount', 'Date'];
      rows = items.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell><TableCell><Badge className="bg-muted/50 text-muted-foreground">{r.category}</Badge></TableCell><TableCell className="tabular-nums text-destructive">{fmt(r.amount)}</TableCell><TableCell className="text-muted-foreground">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    } else if (isWages || isContractors) {
      headers = ['Name', 'Sector', 'Amount', 'Status', 'Date'];
      rows = items.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.sector}</TableCell><TableCell className="tabular-nums">{fmt(r.amount)}</TableCell><TableCell><Badge className={statusBadge(r.status)}>{r.status}</Badge></TableCell><TableCell className="text-muted-foreground">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    } else if (isPurchases) {
      headers = ['PO', 'Commodity', 'Supplier', 'Method', 'Amount', 'Date'];
      rows = items.map(p => <TableRow key={p.id}><TableCell className="font-mono text-xs">{p.number}</TableCell><TableCell className="font-medium">{p.commodity}</TableCell><TableCell>{p.supplier}</TableCell><TableCell className="text-muted-foreground">{p.method}</TableCell><TableCell className="tabular-nums">{fmt(p.amount)}</TableCell><TableCell className="text-muted-foreground">{p.date ? format(new Date(p.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    } else if (isTransactions) {
      headers = ['Type', 'Description', 'Amount', 'Date'];
      rows = items.map(t => <TableRow key={t.id}><TableCell><Badge className={t.direction === 'in' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>{t.type}</Badge></TableCell><TableCell className="font-medium truncate max-w-xs">{t.label}</TableCell><TableCell className={`tabular-nums font-medium ${t.direction === 'in' ? 'text-success' : 'text-destructive'}`}>{t.direction === 'in' ? '+' : '−'}{fmt(t.amount)}</TableCell><TableCell className="text-muted-foreground">{t.date ? format(new Date(t.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/finance/analytics')} aria-label="Back to analytics" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{TITLES[metric] ?? 'Details'}</h1>
            {!isLoading && !isError && <p className="text-sm text-muted-foreground">{total} record{total !== 1 ? 's' : ''}</p>}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>{(headers.length ? headers : Array.from({ length: cols }, () => '')).map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {isLoading ? <SkeletonRows cols={cols} /> : isError ? (
                  <TableRow><TableCell colSpan={cols} className="py-8"><div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"><p className="text-sm text-destructive">Couldn't load.</p><Button size="sm" variant="outline" onClick={() => refetch()} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></div></TableCell></TableRow>
                ) : !items.length ? (
                  <TableRow><TableCell colSpan={cols} className="py-14 text-center"><Inbox className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" /><p className="text-sm text-muted-foreground">No records.</p></TableCell></TableRow>
                ) : rows}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="border border-input bg-background text-white hover:bg-accent">Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="border border-input bg-background text-white hover:bg-accent">Next</Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
