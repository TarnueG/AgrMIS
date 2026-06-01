import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, RefreshCw, Inbox } from 'lucide-react';

type Metric = 'customers' | 'purchases' | 'carts' | 'segments' | 'top-customers' | 'top-products';

const TITLES: Record<Metric, string> = {
  customers: 'All Customers',
  purchases: 'All Purchases',
  carts: 'Open Cart Items',
  segments: 'Customer Segments',
  'top-customers': 'Top Customers',
  'top-products': 'Top Products',
};
const PAGE_SIZE = 25;
const money = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const paginated = (m: Metric) => m === 'customers' || m === 'purchases';

function endpointFor(m: Metric, page: number): string {
  switch (m) {
    case 'customers': return `/sales/analytics/customers/list?page=${page}&pageSize=${PAGE_SIZE}`;
    case 'purchases': return `/sales/analytics/purchases/list?page=${page}&pageSize=${PAGE_SIZE}`;
    case 'carts': return '/sales/analytics/carts/list';
    case 'segments': return '/sales/analytics/customers/segments';
    case 'top-customers': return '/sales/analytics/customers/top?limit=50';
    case 'top-products': return '/sales/analytics/products/top?limit=10';
  }
}

function SkeletonRows({ cols }: { cols: number }) {
  return <>{Array.from({ length: 7 }, (_, i) => (
    <TableRow key={i} aria-hidden>{Array.from({ length: cols }, (_, j) => (
      <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" style={{ width: j === 0 ? '90px' : '110px' }} /></TableCell>
    ))}</TableRow>
  ))}</>;
}

export default function CRMAnalyticsDrilldown({ metric }: { metric: Metric }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['crm-drilldown', metric, page],
    queryFn: () => api.get(endpointFor(metric, page)),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const cols = metric === 'customers' ? 5 : metric === 'purchases' ? 6 : metric === 'carts' ? 5 : 3;
  const total = paginated(metric) ? (data?.total ?? 0) : 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Normalize rows + headers per metric
  let headers: string[] = [];
  let rows: React.ReactNode = null;
  let count = 0;

  if (data && !isLoading && !isError) {
    if (metric === 'customers') {
      headers = ['Name', 'Email', 'Type', 'Country', 'Total Purchases'];
      const items = data.items ?? [];
      count = items.length;
      rows = items.map((c: any) => (
        <TableRow key={c.id}>
          <TableCell className="font-medium">{c.name}</TableCell>
          <TableCell className="text-muted-foreground">{c.emailMasked}</TableCell>
          <TableCell className="capitalize">{c.type}</TableCell>
          <TableCell>{c.country}</TableCell>
          <TableCell className="font-medium">{money(c.totalPurchase)}</TableCell>
        </TableRow>
      ));
    } else if (metric === 'purchases') {
      headers = ['Order', 'Customer', 'Amount', 'Status', 'Payment', 'Date'];
      const items = data.items ?? [];
      count = items.length;
      rows = items.map((o: any) => (
        <TableRow key={o.id}>
          <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
          <TableCell className="font-medium">{o.customer}</TableCell>
          <TableCell className="font-medium">{money(o.amount)}</TableCell>
          <TableCell className="capitalize">{o.status}</TableCell>
          <TableCell><Badge className={o.payment_status === 'paid' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}>{o.payment_status}</Badge></TableCell>
          <TableCell className="text-muted-foreground">{o.date ? format(new Date(o.date), 'MMM d, yyyy') : '-'}</TableCell>
        </TableRow>
      ));
    } else if (metric === 'carts') {
      headers = ['Item', 'Quantity', 'Unit Price', 'Total', 'Date'];
      const items = data.items ?? [];
      count = items.length;
      rows = items.map((c: any) => (
        <TableRow key={c.id}>
          <TableCell className="font-medium">{c.item_name}</TableCell>
          <TableCell>{Number(c.quantity).toFixed(2)}</TableCell>
          <TableCell>{money(c.unit_price)}</TableCell>
          <TableCell className="font-medium">{money(c.total_amount)}</TableCell>
          <TableCell className="text-muted-foreground">{c.date ? format(new Date(c.date), 'MMM d, yyyy') : '-'}</TableCell>
        </TableRow>
      ));
    } else if (metric === 'segments') {
      headers = ['Segment', 'Customers', 'Share'];
      const segs = data.segments ?? [];
      count = segs.length;
      rows = segs.map((s: any) => (
        <TableRow key={s.type}>
          <TableCell className="font-medium">{s.type}</TableCell>
          <TableCell>{s.count}</TableCell>
          <TableCell>{s.pct}%</TableCell>
        </TableRow>
      ));
    } else if (metric === 'top-customers') {
      headers = ['Rank', 'Name', 'Email'];
      const items = Array.isArray(data) ? data : [];
      count = items.length;
      rows = items.map((c: any, i: number) => (
        <TableRow key={c.id}>
          <TableCell>{i + 1}</TableCell>
          <TableCell className="font-medium">{c.name}<span className="ml-2 text-muted-foreground font-normal">{money(c.totalPurchase)}</span></TableCell>
          <TableCell className="text-muted-foreground">{c.emailMasked}</TableCell>
        </TableRow>
      ));
    } else {
      headers = ['Product', '12-Month Volume'];
      const items = data.products ?? [];
      count = items.length;
      rows = items.map((p: any) => (
        <TableRow key={p.id}>
          <TableCell className="font-medium">{p.name}</TableCell>
          <TableCell>{(p.series as number[]).reduce((s, v) => s + v, 0).toFixed(2)} units</TableCell>
        </TableRow>
      ));
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/crm/analytics')} aria-label="Back to CRM analytics" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{TITLES[metric]}</h1>
            {!isLoading && !isError && <p className="text-sm text-muted-foreground">{paginated(metric) ? `${total} total` : `${count} item${count !== 1 ? 's' : ''}`}</p>}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>{(headers.length ? headers : Array.from({ length: cols }, () => '')).map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {isLoading ? <SkeletonRows cols={cols} /> : isError ? (
                  <TableRow><TableCell colSpan={cols} className="py-8">
                    <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                      <p className="text-sm text-destructive">Couldn't load.</p>
                      <Button size="sm" variant="outline" onClick={() => refetch()} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button>
                    </div>
                  </TableCell></TableRow>
                ) : count === 0 ? (
                  <TableRow><TableCell colSpan={cols} className="py-14 text-center"><Inbox className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" /><p className="text-sm text-muted-foreground">No records.</p></TableCell></TableRow>
                ) : rows}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {paginated(metric) && totalPages > 1 && (
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
