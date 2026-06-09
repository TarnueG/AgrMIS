import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, RefreshCw, Inbox, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { usePermissions } from '@/hooks/usePermissions';

const TITLES: Record<string, string> = {
  'total-parcel-area': 'Parcels', 'parcels': 'Parcels', 'soil-distribution': 'Parcels by Soil', 'most-used-parcel': 'Parcels',
  'total-equipment': 'Equipment', 'total-asset-value': 'Assets by Value', 'assets': 'All Assets',
  'largest-crops': 'Crops Planted', 'crops': 'Crops Planted', 'most-used-equipment': 'Equipment Usage',
  'maintenance': 'Maintenance & Repair', 'maintenance-repair-rate': 'Maintenance & Repair',
};
const PAGE_SIZE = 25;
const money = (n: number) => `$${Number(n).toLocaleString()}`;
function statusBadge(s: string): string {
  if (s === 'operational' || s === 'active') return 'bg-success/20 text-success';
  if (s === 'under_maintenance') return 'bg-warning/20 text-warning';
  if (s === 'lost' || s === 'retired' || s === 'decommissioned') return 'bg-destructive/20 text-destructive';
  return 'bg-muted text-muted-foreground';
}
const condColor = (c: number) => c >= 80 ? '#2fa86a' : c >= 50 ? '#e0922f' : '#d2503a';

function SkeletonRows({ cols }: { cols: number }) {
  return <>{Array.from({ length: 7 }, (_, i) => <TableRow key={i} aria-hidden>{Array.from({ length: cols }, (_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" style={{ width: j === 0 ? '90px' : '110px' }} /></TableCell>)}</TableRow>)}</>;
}

export default function AssetAnalyticsDrilldown() {
  const { metric = '' } = useParams<{ metric: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { openConfirm } = useConfirm();
  const { canDelete } = usePermissions();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['asset-drilldown', metric, page],
    queryFn: () => api.get(`/assets/analytics/details/${metric}?page=${page}&pageSize=${PAGE_SIZE}`),
    enabled: !!metric,
    staleTime: 30_000,
  });

  const deleteAsset = useMutation({
    mutationFn: (id: string) => api.delete(`/assets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asset-drilldown'] }); toast({ title: 'Equipment deleted' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const isAssets = metric === 'total-equipment' || metric === 'assets';
  const isAssetValue = metric === 'total-asset-value';
  const isParcels = metric === 'total-parcel-area' || metric === 'parcels' || metric === 'soil-distribution' || metric === 'most-used-parcel';
  const isCrops = metric === 'largest-crops' || metric === 'crops';
  const isEquip = metric === 'most-used-equipment';
  const isMaint = metric === 'maintenance' || metric === 'maintenance-repair-rate';

  const cols = isAssets ? 7 : isAssetValue ? 6 : isParcels ? 6 : isCrops ? 5 : isEquip ? 4 : 5;
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const items: any[] = data?.items ?? [];

  let headers: string[] = [];
  let rows: React.ReactNode = null;
  if (data && !isLoading && !isError) {
    if (isAssets) {
      headers = ['Asset', 'Type', 'Location', 'Condition', 'Last Service', 'Value', 'Status'];
      rows = items.map(a => <TableRow key={a.id}><TableCell className="font-medium">{a.name}</TableCell><TableCell className="capitalize">{a.type}</TableCell><TableCell>{a.location}</TableCell><TableCell><div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${a.condition}%`, backgroundColor: condColor(a.condition) }} /></div></TableCell><TableCell className="text-muted-foreground">{a.lastService ? format(new Date(a.lastService), 'MMM d, yyyy') : '-'}</TableCell><TableCell className="font-medium">{money(a.value)}</TableCell><TableCell><Badge className={statusBadge(a.status)}>{String(a.status).replace('_', ' ')}</Badge></TableCell></TableRow>);
    } else if (isAssetValue) {
      headers = ['Asset Name', 'Type', 'Condition', 'Value', 'Status', 'Amount'];
      rows = items.map(a => <TableRow key={a.id}><TableCell className="font-medium">{a.name}</TableCell><TableCell><Badge className={a.type === 'parcel' ? 'bg-[#1F6F54]/20 text-[#5fbf95]' : 'bg-[#C2622E]/20 text-[#e0a06f]'}>{a.type}</Badge></TableCell><TableCell><div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${a.condition}%`, backgroundColor: condColor(a.condition) }} /></div></TableCell><TableCell className="font-medium">{money(a.value)}</TableCell><TableCell><Badge className={statusBadge(a.status)}>{String(a.status).replace('_', ' ')}</Badge></TableCell><TableCell className="text-muted-foreground">{money(a.amount)}</TableCell></TableRow>);
    } else if (isParcels) {
      headers = ['Name', 'Soil', 'Area (ha)', 'Crop', 'Location', 'Status'];
      rows = items.map(p => <TableRow key={p.id}><TableCell className="font-medium">{p.name}</TableCell><TableCell className="capitalize">{p.soil}</TableCell><TableCell>{Number(p.area).toFixed(2)}</TableCell><TableCell>{p.crop}</TableCell><TableCell>{p.location}</TableCell><TableCell><Badge className={statusBadge(p.status)}>{p.status}</Badge></TableCell></TableRow>);
    } else if (isCrops) {
      headers = ['Crop', 'Parcel', 'Hectares', 'Soil', 'Location'];
      rows = items.map(c => <TableRow key={c.id}><TableCell className="font-medium">{c.crop}</TableCell><TableCell>{c.parcel}</TableCell><TableCell>{c.hectares} ha</TableCell><TableCell className="capitalize">{c.soil}</TableCell><TableCell>{c.location}</TableCell></TableRow>);
    } else if (isEquip) {
      headers = ['Equipment', 'Type', 'Tasks', 'Action'];
      rows = items.map(e => <TableRow key={e.id}><TableCell className="font-medium">{e.name}</TableCell><TableCell className="capitalize">{e.type}</TableCell><TableCell>{e.tasks}</TableCell><TableCell>{canDelete('machinery') && <Button variant="ghost" size="icon" onClick={() => openConfirm({ title: 'Delete Equipment', message: `Delete "${e.name}"?`, type: 'danger', confirmText: 'Delete', onConfirm: () => deleteAsset.mutate(e.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</TableCell></TableRow>);
    } else if (isMaint) {
      headers = ['Asset', 'Type', 'Cost', 'Downtime', 'Date'];
      rows = items.map(m => <TableRow key={m.id}><TableCell className="font-medium">{m.asset}</TableCell><TableCell className="capitalize">{m.type}</TableCell><TableCell>{money(m.cost)}</TableCell><TableCell>{m.downtime} hrs</TableCell><TableCell className="text-muted-foreground">{m.date ? format(new Date(m.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/assets/analytics')} aria-label="Back to asset analytics" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Button>
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
