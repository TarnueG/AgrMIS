import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  'total-fish': 'Total Fish', 'total-birds': 'Total Birds', 'total-grazing-livestock': 'Total Grazing Livestock', 'total-pigs': 'Total Pigs',
  'order-statistics': 'Order Statistics', 'delivery-rate': 'Delivery Rate', 'performance': 'Livestock Performance',
  'most-sold': 'Most Sold Products', 'mortality': 'Mortality Rate', 'health': 'Health Condition Rate', 'sold-rate': 'Sold Rate',
  'top-selling': 'Top Selling Products', 'stock-summary': 'Stock Summary', 'upcoming': 'Upcoming Items',
};
const DETAILS = new Set(['total-fish', 'total-birds', 'total-grazing-livestock', 'total-pigs', 'top-selling', 'most-sold', 'stock-summary', 'upcoming']);
const PAGE_SIZE = 25;
const money = (n: number) => `$${Number(n).toLocaleString()}`;
function statusBadge(s: string): string {
  const x = String(s).toLowerCase();
  if (x.includes('out') || x === 'failed' || x === 'delayed' || x === 'dead' || x === 'cancel') return 'bg-destructive/20 text-destructive';
  if (x.includes('low') || x === 'scheduled' || x === 'ill' || x === 'pending') return 'bg-warning/20 text-warning';
  if (x === 'in transit' || x === 'processing') return 'bg-blue-500/20 text-blue-500';
  return 'bg-success/20 text-success';
}

function SkeletonRows({ cols }: { cols: number }) {
  return <>{Array.from({ length: 7 }, (_, i) => <TableRow key={i} aria-hidden>{Array.from({ length: cols }, (_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" style={{ width: j === 0 ? '80px' : '110px' }} /></TableCell>)}</TableRow>)}</>;
}

export default function InventoryAnalyticsDrilldown() {
  const { metric = '' } = useParams<{ metric: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const isDetail = DETAILS.has(metric);
  const range = sessionStorage.getItem('inv-analytics-range') || 'monthly';

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['inv-drilldown', metric, page],
    queryFn: () => isDetail
      ? api.get(`/inventory/analytics/details/${metric}?page=${page}&pageSize=${PAGE_SIZE}`)
      : api.get(`/inventory/analytics/overview?range=${range}`),
    staleTime: 30_000,
  });

  let headers: string[] = [];
  let rows: React.ReactNode = null;
  let count = 0;
  const total = isDetail ? (data?.total ?? 0) : 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (data && !isLoading && !isError) {
    const items: any[] = data.items ?? [];
    if (metric === 'total-pigs' || metric === 'total-birds' || metric === 'total-grazing-livestock') {
      headers = ['ID', 'Status', 'Weight (kg)', 'Date']; count = items.length;
      rows = items.map(r => <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.record_id}</TableCell><TableCell><Badge className={statusBadge(r.status)}>{r.status}</Badge></TableCell><TableCell>{r.weight_kg != null ? Number(r.weight_kg).toFixed(2) : '-'}</TableCell><TableCell className="text-muted-foreground">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    } else if (metric === 'total-fish') {
      headers = ['Batch', 'Type', 'Pond', 'Quantity', 'Date']; count = items.length;
      rows = items.map(r => <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.record_id}</TableCell><TableCell className="capitalize">{r.type}</TableCell><TableCell>{r.pond}</TableCell><TableCell>{Number(r.quantity).toLocaleString()}</TableCell><TableCell className="text-muted-foreground">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    } else if (metric === 'top-selling' || metric === 'most-sold') {
      headers = ['Item', 'Quantity', 'Total Amount']; count = items.length;
      rows = items.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell><TableCell>{Number(r.quantity).toLocaleString()}</TableCell><TableCell className="font-medium">{money(r.totalAmount)}</TableCell></TableRow>);
    } else if (metric === 'stock-summary') {
      headers = ['Item', 'SKU', 'Quantity', 'Status']; count = items.length;
      rows = items.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="font-mono text-xs">{r.sku}</TableCell><TableCell>{Number(r.quantity).toFixed(2)} {r.unit}</TableCell><TableCell><Badge className={statusBadge(r.status)}>{r.status}</Badge></TableCell></TableRow>);
    } else if (metric === 'upcoming') {
      headers = ['No', 'Item Name', 'Quantity', 'Batch / PO No', 'Status']; count = items.length;
      rows = items.map(r => <TableRow key={r.id}><TableCell>{r.no}</TableCell><TableCell className="font-medium">{r.name}</TableCell><TableCell>{Number(r.quantity).toLocaleString()}</TableCell><TableCell className="font-mono text-xs">{r.batch_no}</TableCell><TableCell><Badge className={statusBadge(r.status)}>{r.status}</Badge></TableCell></TableRow>);
    } else if (metric === 'order-statistics') {
      headers = ['Period', 'Orders', 'Sales']; const s = data.orderStats?.series ?? []; count = s.length;
      rows = s.map((r: any, i: number) => <TableRow key={i}><TableCell className="font-medium">{r.bucket}</TableCell><TableCell>{r.orders.toLocaleString()}</TableCell><TableCell className="font-medium">{money(r.sales)}</TableCell></TableRow>);
    } else if (metric === 'delivery-rate') {
      const dr = data.deliveryRate; const arr = [{ k: 'On-time', v: dr.onTime }, { k: 'Delayed', v: dr.delayed }, { k: 'Failed', v: dr.failed }];
      headers = ['Outcome', 'Orders']; count = arr.length;
      rows = arr.map(r => <TableRow key={r.k}><TableCell className="font-medium">{r.k}</TableCell><TableCell>{r.v.toLocaleString()}</TableCell></TableRow>);
    } else if (metric === 'performance') {
      headers = ['Period', 'Fish', 'Birds', 'Grazing', 'Pigs']; const s = data.performance; count = s.labels.length;
      rows = s.labels.map((label: string, i: number) => <TableRow key={i}><TableCell className="font-medium">{label}</TableCell><TableCell>{s.series.fish[i]}</TableCell><TableCell>{s.series.birds[i]}</TableCell><TableCell>{s.series.grazing[i]}</TableCell><TableCell>{s.series.pigs[i]}</TableCell></TableRow>);
    } else if (metric === 'mortality' || metric === 'health') {
      headers = ['Category', 'Rate']; const arr = data[metric] ?? []; count = arr.length;
      rows = arr.map((r: any) => <TableRow key={r.category}><TableCell className="font-medium">{r.category}</TableCell><TableCell>{r.rate}%</TableCell></TableRow>);
    } else if (metric === 'sold-rate') {
      headers = ['Product', 'Sell-through']; const arr = data.soldRate?.perProduct ?? []; count = arr.length;
      rows = arr.map((r: any) => <TableRow key={r.name}><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.rate}%</TableCell></TableRow>);
    }
  }

  const cols = headers.length || 4;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/inventory/analytics')} aria-label="Back to inventory analytics" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{TITLES[metric] ?? 'Details'}</h1>
            {!isLoading && !isError && <p className="text-sm text-muted-foreground">{isDetail ? `${total} record${total !== 1 ? 's' : ''}` : `${count} row${count !== 1 ? 's' : ''}`}</p>}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>{(headers.length ? headers : Array.from({ length: cols }, () => '')).map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {isLoading ? <SkeletonRows cols={cols} /> : isError ? (
                  <TableRow><TableCell colSpan={cols} className="py-8"><div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"><p className="text-sm text-destructive">Couldn't load.</p><Button size="sm" variant="outline" onClick={() => refetch()} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></div></TableCell></TableRow>
                ) : count === 0 ? (
                  <TableRow><TableCell colSpan={cols} className="py-14 text-center"><Inbox className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" /><p className="text-sm text-muted-foreground">No data for this period.</p></TableCell></TableRow>
                ) : rows}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {isDetail && totalPages > 1 && (
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
