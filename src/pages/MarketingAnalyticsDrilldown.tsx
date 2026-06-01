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
import { ArrowLeft, RefreshCw, Package } from 'lucide-react';

interface OrderItem {
  id: string; order_id: string; item_name: string; quantity: number;
  quantity_unit?: string; amount: number; status: string; date: string;
}
interface Resp { status: string; page: number; pageSize: number; total: number; items: OrderItem[]; }

const TITLES: Record<string, string> = {
  pending: 'Pending Orders',
  'in-process': 'In-Process Orders',
  completed: 'Completed Orders',
};
const PAGE_SIZE = 25;

function statusBadge(s: string): string {
  if (s === 'completed' || s === 'delivered') return 'bg-success/20 text-success';
  if (s === 'processing' || s === 'in_process') return 'bg-purple-500/20 text-purple-400';
  if (s === 'en_route') return 'bg-blue-500/20 text-blue-500';
  return 'bg-warning/20 text-warning';
}

function SkeletonRows() {
  return (<>{Array.from({ length: 7 }, (_, i) => (
    <TableRow key={i} aria-hidden>{Array.from({ length: 6 }, (_, j) => (
      <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" style={{ width: j === 0 ? '90px' : '110px' }} /></TableCell>
    ))}</TableRow>
  ))}</>);
}

export default function MarketingAnalyticsDrilldown() {
  const { metric = '' } = useParams<{ metric: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<Resp>({
    queryKey: ['marketing-analytics-orders', metric, page],
    queryFn: () => api.get(`/marketing/analytics/orders/items?status=${metric}&page=${page}&pageSize=${PAGE_SIZE}`),
    enabled: !!metric,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const title = TITLES[metric] ?? 'Orders';
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/marketing/analytics')} aria-label="Back to analytics" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {!isLoading && !isError && <p className="text-sm text-muted-foreground">{total} order{total !== 1 ? 's' : ''}</p>}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead><TableHead>Item</TableHead><TableHead>Quantity</TableHead>
                  <TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <SkeletonRows /> : isError ? (
                  <TableRow><TableCell colSpan={6} className="py-8">
                    <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                      <p className="text-sm text-destructive">Failed to load orders.</p>
                      <Button size="sm" variant="outline" onClick={() => refetch()} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button>
                    </div>
                  </TableCell></TableRow>
                ) : !data?.items.length ? (
                  <TableRow><TableCell colSpan={6} className="py-14 text-center">
                    <Package className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" aria-hidden />
                    <p className="text-sm text-muted-foreground">No orders in this category.</p>
                  </TableCell></TableRow>
                ) : data.items.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-sm">{o.order_id}</TableCell>
                    <TableCell className="font-medium">{o.item_name}</TableCell>
                    <TableCell>{Number(o.quantity).toFixed(2)} {o.quantity_unit ?? ''}</TableCell>
                    <TableCell className="font-medium">${Number(o.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge className={statusBadge(o.status)}>{o.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{o.date ? format(new Date(o.date), 'MMM d, yyyy') : '-'}</TableCell>
                  </TableRow>
                ))}
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
