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
  'total-produced': 'Passed Orders', 'units-today': "Today's Batches", 'quality-rate': 'Quality (Passed vs Rework)',
  'performance': 'Performance Batches', 'declined': 'Declined Products', 'resources': 'Chemicals & Feeds Used',
};
const PAGE_SIZE = 25;
function stageBadge(s: string): string {
  if (s === 'passed') return 'bg-success/20 text-success';
  if (s === 'rework') return 'bg-orange-500/20 text-orange-400';
  if (s === 'quality_check') return 'bg-amber-500/20 text-amber-400';
  if (s === 'cancelled') return 'bg-destructive/20 text-destructive';
  return 'bg-warning/20 text-warning';
}
const stageLabel = (s: string) => s === 'quality_check' ? 'In Check' : s.charAt(0).toUpperCase() + s.slice(1);

function SkeletonRows({ cols }: { cols: number }) {
  return <>{Array.from({ length: 7 }, (_, i) => <TableRow key={i} aria-hidden>{Array.from({ length: cols }, (_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" style={{ width: j === 0 ? '90px' : '110px' }} /></TableCell>)}</TableRow>)}</>;
}

export default function ProductionAnalyticsDrilldown() {
  const { metric = '' } = useParams<{ metric: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['prod-drilldown', metric, page],
    queryFn: () => api.get(`/production/analytics/details/${metric}?page=${page}&pageSize=${PAGE_SIZE}`),
    enabled: !!metric,
    staleTime: 15_000,
  });

  const isBatch = ['total-produced', 'units-today', 'quality-rate', 'performance'].includes(metric);
  const isDeclined = metric === 'declined';
  const isResources = metric === 'resources';
  const cols = isBatch ? 5 : isDeclined ? 5 : 4;
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const items: any[] = data?.items ?? [];

  let headers: string[] = [];
  let rows: React.ReactNode = null;
  if (data && !isLoading && !isError) {
    if (isBatch) {
      headers = ['Batch', 'Product', 'Line', 'Quantity (kg)', 'Stage'];
      rows = items.map(b => <TableRow key={b.id}><TableCell className="font-mono text-xs">{b.batch}</TableCell><TableCell className="font-medium">{b.product}</TableCell><TableCell>{b.line}</TableCell><TableCell className="tabular-nums">{Number(b.quantity).toLocaleString()}</TableCell><TableCell><Badge className={stageBadge(b.status)}>{stageLabel(b.status)}</Badge></TableCell></TableRow>);
    } else if (isDeclined) {
      headers = ['Product', 'Quantity', 'Location', 'Status', 'Date'];
      rows = items.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.product}</TableCell><TableCell className="tabular-nums">{Number(r.quantity).toLocaleString()}</TableCell><TableCell>{r.location}</TableCell><TableCell><Badge className={stageBadge('cancelled')}>Declined</Badge></TableCell><TableCell className="text-muted-foreground">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    } else if (isResources) {
      headers = ['Material', 'Quantity', 'Notes', 'Date'];
      rows = items.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="tabular-nums">{Number(r.quantity).toFixed(2)}</TableCell><TableCell className="text-muted-foreground max-w-xs truncate">{r.notes}</TableCell><TableCell className="text-muted-foreground">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/production/analytics')} aria-label="Back to analytics" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Button>
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
