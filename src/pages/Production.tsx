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
import { useToast } from '@/hooks/use-toast';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';

type ProdView = 'all' | 'pending' | 'in_process' | 'quality_check' | 'passed' | 'rework' | 'requested' | 'declined';

const BATCH_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  in_process: 'bg-info/20 text-info',
  quality_check: 'bg-purple-500/20 text-purple-400',
  passed: 'bg-success/20 text-success',
  rework: 'bg-orange-500/20 text-orange-400',
};

const REQ_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  accepted: 'bg-info/20 text-info',
  cancelled: 'bg-destructive/20 text-destructive',
  passed: 'bg-success/20 text-success',
};

function isDeclinedImmutable(r: any): boolean {
  if (!r.updated_at) return false;
  return (Date.now() - new Date(r.updated_at).getTime()) / 3600000 >= 24;
}

const BATCH_VIEWS: ProdView[] = ['all', 'pending', 'in_process', 'quality_check', 'passed', 'rework'];

export default function Production() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canCreate, canEdit, canDelete, canViewCard } = usePermissions();
  const [prodView, setProdView] = useState<ProdView>('all');
  const [search, setSearch] = useState('');
  const [batchDialogReqId, setBatchDialogReqId] = useState<string | null>(null);
  const [editQtyReqId, setEditQtyReqId] = useState<string | null>(null);
  const [editQtyValue, setEditQtyValue] = useState(0);
  const [batchForm, setBatchForm] = useState({ quantity: 0, status: 'pending' });
  const [qtyEditedIds, setQtyEditedIds] = useState<Set<string>>(new Set());

  const { data: allBatches = [] } = useQuery<any[]>({
    queryKey: ['prod-inv-batches'],
    queryFn: () => api.get('/inventory/prod-batches'),
  });

  const { data: prodRequests = [] } = useQuery<any[]>({
    queryKey: ['prod-requests'],
    queryFn: () => api.get('/inventory/prod-requests'),
  });

  const requestMap = Object.fromEntries(prodRequests.map((r: any) => [r.id, r]));

  const updateBatchStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/inventory/prod-batches/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prod-inv-batches'] });
      qc.invalidateQueries({ queryKey: ['prod-requests'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast({ title: 'Batch status updated' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const acceptRequest = useMutation({
    mutationFn: (id: string) => api.patch(`/inventory/prod-requests/${id}`, { status: 'accepted' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prod-requests'] }); toast({ title: 'Request accepted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const cancelRequest = useMutation({
    mutationFn: (id: string) => api.patch(`/inventory/prod-requests/${id}`, { status: 'cancelled' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prod-requests'] });
      toast({ title: 'Request declined and moved to Declined Orders' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const retrieveRequest = useMutation({
    mutationFn: (id: string) => api.patch(`/inventory/prod-requests/${id}`, { status: 'pending' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prod-requests'] });
      toast({ title: 'Request retrieved and restored to requested status' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const saveEditQty = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api.patch(`/inventory/prod-requests/${id}`, { quantity }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['prod-requests'] });
      toast({ title: 'Quantity updated' });
      setEditQtyReqId(null);
      setQtyEditedIds(prev => new Set([...prev, id]));
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createBatch = useMutation({
    mutationFn: ({ requestId, quantity, status }: { requestId: string; quantity: number; status: string }) =>
      api.post('/inventory/prod-batches', { requestId, quantity, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prod-inv-batches'] });
      qc.invalidateQueries({ queryKey: ['prod-requests'] });
      toast({ title: 'Batch created' });
      setBatchDialogReqId(null);
      setBatchForm({ quantity: 0, status: 'pending' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const pendingRequests = prodRequests.filter((r: any) => r.status === 'pending' || r.status === 'accepted');
  const declinedRequests = prodRequests.filter((r: any) => r.status === 'cancelled');

  function getBatchesForRequest(requestId: string) {
    return allBatches.filter((b: any) => b.request_id === requestId);
  }

  const displayBatches = (() => {
    const base =
      prodView === 'all' ? allBatches :
      prodView === 'pending' ? allBatches.filter((b: any) => b.status === 'pending') :
      prodView === 'in_process' ? allBatches.filter((b: any) => b.status === 'in_process') :
      prodView === 'quality_check' ? allBatches.filter((b: any) => b.status === 'quality_check') :
      prodView === 'passed' ? allBatches.filter((b: any) => b.status === 'passed') :
      prodView === 'rework' ? allBatches.filter((b: any) => b.status === 'rework') : [];
    return search
      ? base.filter((b: any) =>
          b.batch_number?.toLowerCase().includes(search.toLowerCase()) ||
          requestMap[b.request_id]?.product_name?.toLowerCase().includes(search.toLowerCase())
        )
      : base;
  })();

  function cardClass(v: ProdView) {
    return `cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${prodView === v ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`;
  }

  const CARDS = [
    { key: 'all' as ProdView, label: 'Production Batches', count: allBatches.length, color: 'bg-primary/10 border-primary/20 text-primary' },
    { key: 'pending' as ProdView, label: 'Pending', count: allBatches.filter((b: any) => b.status === 'pending').length, color: 'bg-warning/10 border-warning/20 text-warning' },
    { key: 'in_process' as ProdView, label: 'In Process', count: allBatches.filter((b: any) => b.status === 'in_process').length, color: 'bg-info/10 border-info/20 text-info' },
    { key: 'quality_check' as ProdView, label: 'Quality Check', count: allBatches.filter((b: any) => b.status === 'quality_check').length, color: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
    { key: 'passed' as ProdView, label: 'Passed', count: allBatches.filter((b: any) => b.status === 'passed').length, color: 'bg-success/10 border-success/20 text-success' },
    { key: 'rework' as ProdView, label: 'Rework', count: allBatches.filter((b: any) => b.status === 'rework').length, color: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
    { key: 'requested' as ProdView, label: 'Requested Orders', count: pendingRequests.length, color: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
    { key: 'declined' as ProdView, label: 'Declined Orders', count: declinedRequests.length, color: 'bg-destructive/10 border-destructive/20 text-destructive' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Production Execution</h1>
          <p className="text-muted-foreground">Manage production batches and inventory requests</p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CARDS.filter(({ key }) => canViewCard(`production.${key}`)).map(({ key, label, count, color }) => (
            <Card
              key={key}
              className={`border ${color} ${cardClass(key)}`}
              onClick={() => setProdView(key)}
            >
              <CardContent className="p-5">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-2xl font-bold">{count}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Batch Views */}
        {BATCH_VIEWS.includes(prodView) && (
          <Card>
            <div className="p-4 border-b">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search batches..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => setSearch('')}
                  className="pl-9 text-white placeholder:text-white/50"
                />
              </div>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch No.</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayBatches.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-sm">{b.batch_number ?? '-'}</TableCell>
                      <TableCell className="font-medium">{requestMap[b.request_id]?.product_name ?? '-'}</TableCell>
                      <TableCell>{Number(b.quantity ?? 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {prodView === 'passed' ? (
                          <Badge className="bg-success/20 text-success">Passed</Badge>
                        ) : canEdit('production') ? (
                          <select
                            value={b.status}
                            onChange={(e) => updateBatchStatus.mutate({ id: b.id, status: e.target.value })}
                            className={`h-8 rounded border border-input bg-background px-2 text-sm ${BATCH_STATUS_COLORS[b.status] ?? ''}`}
                          >
                            <option value="pending">Pending</option>
                            <option value="in_process">In Process</option>
                            <option value="quality_check">Quality Check</option>
                            <option value="passed">Passed</option>
                            <option value="rework">Rework</option>
                          </select>
                        ) : (
                          <Badge className={BATCH_STATUS_COLORS[b.status] ?? 'bg-muted'}>{b.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{b.created_at ? format(new Date(b.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                    </TableRow>
                  ))}
                  {!displayBatches.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No batches found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Requested Orders */}
        {prodView === 'requested' && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Link Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((r: any) => {
                    const batchExists = getBatchesForRequest(r.id).length > 0;
                    const qtyEdited = qtyEditedIds.has(r.id);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.product_name}</TableCell>
                        <TableCell>
                          {editQtyReqId === r.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={editQtyValue}
                                onChange={(e) => setEditQtyValue(Number(e.target.value))}
                                className="w-24 h-7 text-sm"
                              />
                              <Button size="sm" className="h-7 gradient-primary text-black text-xs" onClick={() => saveEditQty.mutate({ id: r.id, quantity: editQtyValue })}>Save</Button>
                              <Button size="sm" variant="outline" className="h-7 border border-input bg-background text-white text-xs" onClick={() => setEditQtyReqId(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <span>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</span>
                          )}
                        </TableCell>
                        <TableCell>{r.link_order ?? 'Make-to-Stock'}</TableCell>
                        <TableCell>
                          <Badge className={REQ_STATUS_COLORS[r.status ?? 'pending']}>{r.status ?? 'pending'}</Badge>
                        </TableCell>
                        <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            {r.status === 'pending' && (
                              <>
                                {canEdit('production') && <Button size="sm" className="gradient-primary text-black text-xs font-medium" onClick={() => acceptRequest.mutate(r.id)}>Accept</Button>}
                                {canEdit('production') && <Button size="sm" variant="outline" className="border border-input bg-background text-white text-xs" onClick={() => { if (confirm('Cancel this request? It will move to Declined Orders.')) cancelRequest.mutate(r.id); }}>Cancel</Button>}
                              </>
                            )}
                            {r.status === 'accepted' && !batchExists && !qtyEdited && canEdit('production') && (
                              <Button size="sm" variant="outline" className="border border-input bg-background text-white text-xs" onClick={() => { setEditQtyReqId(r.id); setEditQtyValue(Number(r.quantity)); }}>Edit Qty</Button>
                            )}
                            {r.status === 'accepted' && !batchExists && canCreate('production') && (
                              <Button size="sm" className="gradient-primary text-black text-xs font-medium" onClick={() => { setBatchDialogReqId(r.id); setBatchForm({ quantity: Number(r.quantity), status: 'pending' }); }}>Create Batch</Button>
                            )}
                            {r.status === 'accepted' && batchExists && (
                              <span className="text-xs text-muted-foreground">Batch created</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!pendingRequests.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No requested orders</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Declined Orders */}
        {prodView === 'declined' && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {declinedRequests.map((r: any) => {
                    const immutable = isDeclinedImmutable(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.product_name}</TableCell>
                        <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
                        <TableCell>{r.location || '-'}</TableCell>
                        <TableCell>
                          <Badge className="bg-destructive/20 text-destructive">Declined</Badge>
                        </TableCell>
                        <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>
                          {immutable ? (
                            <span className="text-xs text-muted-foreground">Expired</span>
                          ) : canEdit('production') ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border border-input bg-background text-white text-xs"
                              onClick={() => {
                                if (confirm('Retrieve this order and restore it to Requested Orders?'))
                                  retrieveRequest.mutate(r.id);
                              }}
                            >
                              Retrieve
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!declinedRequests.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No declined orders</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Create Batch Dialog */}
        {canCreate('production') && <Dialog open={!!batchDialogReqId} onOpenChange={(o) => !o && setBatchDialogReqId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Batch</DialogTitle></DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (batchDialogReqId) createBatch.mutate({ requestId: batchDialogReqId, ...batchForm });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={0}
                  value={batchForm.quantity}
                  onChange={(e) => setBatchForm({ ...batchForm, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={batchForm.status}
                  onChange={(e) => setBatchForm({ ...batchForm, status: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="pending">Pending</option>
                  <option value="in_process">In Process</option>
                  <option value="quality_check">Quality Check</option>
                  <option value="passed">Passed</option>
                  <option value="rework">Rework</option>
                </select>
              </div>
              <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={createBatch.isPending}>
                Create Batch
              </Button>
            </form>
          </DialogContent>
        </Dialog>}
      </div>
    </DashboardLayout>
  );
}
