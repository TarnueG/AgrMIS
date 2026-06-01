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
import { Search, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/contexts/ConfirmContext';

type ProdView = 'all' | 'pending' | 'in_process' | 'quality_check' | 'passed' | 'rework' | 'requested' | 'declined' | 'chemicals_feeds';
type DateFilter = 'all' | '7' | '30' | '90' | '365';

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

const CHEM_FEED_CATEGORY_NAMES = ['pesticides & chemicals', 'fertilizers', 'livestock feed', 'aquaculture feed'];

function isDeclinedImmutable(r: any): boolean {
  if (!r.updated_at) return false;
  return (Date.now() - new Date(r.updated_at).getTime()) / 3600000 >= 24;
}

function isExpiredPassed(b: any): boolean {
  return b.status === 'passed' && !!b.updated_at &&
    (Date.now() - new Date(b.updated_at).getTime()) > 24 * 60 * 60 * 1000;
}

function isInDateRange(date: string | null | undefined, filter: DateFilter): boolean {
  if (filter === 'all' || !date) return true;
  const cutoff = new Date(Date.now() - parseInt(filter) * 24 * 60 * 60 * 1000);
  return new Date(date) >= cutoff;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function exportToCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const BATCH_VIEWS: ProdView[] = ['all', 'pending', 'in_process', 'quality_check', 'passed', 'rework'];

export default function Production() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canCreate, canEdit, canDelete, canViewCard } = usePermissions();
  const { openConfirm } = useConfirm();
  const [prodView, setProdView] = useState<ProdView>('all');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [batchDialogReqId, setBatchDialogReqId] = useState<string | null>(null);
  const [editQtyReqId, setEditQtyReqId] = useState<string | null>(null);
  const [editQtyValue, setEditQtyValue] = useState(0);
  const [batchForm, setBatchForm] = useState({ quantity: 0, status: 'pending' });
  const [qtyEditedIds, setQtyEditedIds] = useState<Set<string>>(new Set());
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({ stockItemId: '', quantity: 0, description: '' });

  const { data: allBatches = [] } = useQuery<any[]>({
    queryKey: ['prod-inv-batches'],
    queryFn: () => api.get('/inventory/prod-batches'),
  });

  const { data: prodRequests = [] } = useQuery<any[]>({
    queryKey: ['prod-requests'],
    queryFn: () => api.get('/inventory/prod-requests'),
  });

  const { data: allInventoryItems = [] } = useQuery<any[]>({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/inventory/items'),
  });

  const chemFeedItems = allInventoryItems.filter(
    (item: any) =>
      CHEM_FEED_CATEGORY_NAMES.includes(item.item_categories?.name?.toLowerCase()) &&
      Number(item.current_quantity) > 0
  );

  const selectedApplyItem = chemFeedItems.find((i: any) => i.id === applyForm.stockItemId);
  const availableQty = selectedApplyItem ? Number(selectedApplyItem.current_quantity) : 0;

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
    onSuccess: (_, { id, quantity }) => {
      qc.setQueryData(['prod-requests'], (old: any) =>
        Array.isArray(old) ? old.map((r: any) => r.id === id ? { ...r, quantity } : r) : old
      );
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

  const applyChemFeed = useMutation({
    mutationFn: (data: { stockItemId: string; quantity: number; description: string }) =>
      api.post('/inventory/apply', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      toast({ title: 'Applied successfully' });
      setApplyOpen(false);
      setApplyForm({ stockItemId: '', quantity: 0, description: '' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const pendingRequests = prodRequests.filter((r: any) => r.status === 'pending' || r.status === 'accepted');
  const declinedRequests = prodRequests.filter((r: any) => r.status === 'cancelled');

  function getBatchesForRequest(requestId: string) {
    return allBatches.filter((b: any) => b.request_id === requestId);
  }

  const displayBatches = (() => {
    let base =
      prodView === 'all' ? allBatches.filter((b: any) => !isExpiredPassed(b)) :
      prodView === 'pending' ? allBatches.filter((b: any) => b.status === 'pending') :
      prodView === 'in_process' ? allBatches.filter((b: any) => b.status === 'in_process') :
      prodView === 'quality_check' ? allBatches.filter((b: any) => b.status === 'quality_check') :
      prodView === 'passed' ? allBatches.filter((b: any) => b.status === 'passed') :
      prodView === 'rework' ? allBatches.filter((b: any) => b.status === 'rework') : [];
    if (dateFilter !== 'all') {
      base = base.filter((b: any) => isInDateRange(b.created_at, dateFilter));
    }
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
    { key: 'all' as ProdView, label: 'Production Batches', count: allBatches.filter((b: any) => !isExpiredPassed(b)).length, color: 'bg-primary/10 border-primary/20 text-primary' },
    { key: 'pending' as ProdView, label: 'Pending', count: allBatches.filter((b: any) => b.status === 'pending').length, color: 'bg-warning/10 border-warning/20 text-warning' },
    { key: 'in_process' as ProdView, label: 'In Process', count: allBatches.filter((b: any) => b.status === 'in_process').length, color: 'bg-info/10 border-info/20 text-info' },
    { key: 'quality_check' as ProdView, label: 'Quality Check', count: allBatches.filter((b: any) => b.status === 'quality_check').length, color: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
    { key: 'passed' as ProdView, label: 'Passed', count: allBatches.filter((b: any) => b.status === 'passed').length, color: 'bg-success/10 border-success/20 text-success' },
    { key: 'rework' as ProdView, label: 'Rework', count: allBatches.filter((b: any) => b.status === 'rework').length, color: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
    { key: 'requested' as ProdView, label: 'Requested Orders', count: pendingRequests.length, color: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
    { key: 'declined' as ProdView, label: 'Declined Orders', count: declinedRequests.length, color: 'bg-destructive/10 border-destructive/20 text-destructive' },
    { key: 'chemicals_feeds' as ProdView, label: 'Chemicals & Feeds', count: chemFeedItems.length, color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  ];

  const handleExportCSV = () => {
    if (BATCH_VIEWS.includes(prodView)) {
      exportToCSV(`${prodView}-batches.csv`, displayBatches.map((b: any) => ({
        'Batch No': b.batch_number ?? '',
        'Product Name': requestMap[b.request_id]?.product_name ?? '',
        'Quantity': Number(b.quantity ?? 0).toFixed(2),
        'Status': b.status,
        'Date': b.created_at ? format(new Date(b.created_at), 'MMM d, yyyy') : '',
      })));
    } else if (prodView === 'requested') {
      exportToCSV('requested-orders.csv', pendingRequests.map((r: any) => ({
        'Product Name': r.product_name,
        'Quantity': `${Number(r.quantity).toFixed(2)} ${r.quantity_unit}`,
        'Link Order': r.link_order ?? 'Make-to-Stock',
        'Status': r.status,
        'Date': r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '',
      })));
    } else if (prodView === 'declined') {
      exportToCSV('declined-orders.csv', declinedRequests.map((r: any) => ({
        'Product Name': r.product_name,
        'Quantity': `${Number(r.quantity).toFixed(2)} ${r.quantity_unit}`,
        'Location': r.location ?? '',
        'Date': r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '',
      })));
    } else if (prodView === 'chemicals_feeds') {
      exportToCSV('chemicals-feeds.csv', chemFeedItems.map((i: any) => ({
        'Name': i.name,
        'Category': i.item_categories?.name ?? '',
        'Available Qty': Number(i.current_quantity).toFixed(2),
        'Unit': i.units_of_measure?.symbol ?? '',
      })));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Production Execution</h1>
            <p className="text-muted-foreground">Manage production batches and inventory requests</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />Export CSV
            </Button>
            {prodView === 'chemicals_feeds' && canCreate('production') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setApplyForm({ stockItemId: '', quantity: 0, description: '' }); setApplyOpen(true); }}>
                Add To Apply
              </Button>
            )}
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
            <div className="p-4 border-b flex flex-wrap items-center gap-3">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search batches..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => setSearch('')}
                  className="pl-9 text-white placeholder:text-white/50"
                />
              </div>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="all">All Time</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="365">Last 365 Days</option>
              </select>
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
                                {canEdit('production') && <Button size="sm" variant="outline" className="border border-input bg-background text-white text-xs" onClick={() => openConfirm({ title: 'Cancel Request', message: 'Cancel this request? It will move to Declined Orders.', type: 'danger', confirmText: 'Cancel Request', onConfirm: () => cancelRequest.mutate(r.id) })}>Cancel</Button>}
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
                                openConfirm({ title: 'Retrieve Request', message: 'Retrieve this order and restore it to Requested Orders?', type: 'warning', confirmText: 'Retrieve', onConfirm: () => retrieveRequest.mutate(r.id) });
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

        {/* Chemicals & Feeds View */}
        {prodView === 'chemicals_feeds' && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Available Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chemFeedItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="capitalize">{item.item_categories?.name ?? '-'}</TableCell>
                      <TableCell>{Number(item.current_quantity).toFixed(2)}</TableCell>
                      <TableCell>{item.units_of_measure?.symbol ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        {canCreate('production') && (
                          <Button
                            size="sm"
                            className="gradient-primary text-black text-xs font-medium"
                            onClick={() => { setApplyForm({ stockItemId: item.id, quantity: 0, description: '' }); setApplyOpen(true); }}
                          >
                            Add To Apply
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!chemFeedItems.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No chemicals or feeds in stock</TableCell>
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

        {/* Apply Chemical/Feed Dialog */}
        {canCreate('production') && (
          <Dialog open={applyOpen} onOpenChange={(o) => { setApplyOpen(o); if (!o) setApplyForm({ stockItemId: '', quantity: 0, description: '' }); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Apply Chemical / Feed</DialogTitle></DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (applyForm.quantity <= 0 || applyForm.quantity >= availableQty) {
                    toast({ title: 'Invalid quantity', description: 'Must be greater than 0 and less than available stock', variant: 'destructive' });
                    return;
                  }
                  if (applyForm.description && wordCount(applyForm.description) > 50) {
                    toast({ title: 'Description too long', description: 'Maximum 50 words allowed', variant: 'destructive' });
                    return;
                  }
                  applyChemFeed.mutate(applyForm);
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Item</Label>
                  <select
                    value={applyForm.stockItemId}
                    onChange={(e) => setApplyForm({ ...applyForm, stockItemId: e.target.value })}
                    required
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="">Select item</option>
                    {chemFeedItems.map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (Available: {Number(item.current_quantity).toFixed(2)} {item.units_of_measure?.symbol ?? ''})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity to Apply</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={applyForm.quantity || ''}
                    onChange={(e) => setApplyForm({ ...applyForm, quantity: Number(e.target.value) })}
                    required
                  />
                  {selectedApplyItem && (
                    <p className="text-xs text-muted-foreground">Available: {availableQty.toFixed(2)} {selectedApplyItem.units_of_measure?.symbol ?? ''}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Description <span className="text-muted-foreground text-xs">(max 50 words)</span></Label>
                  <Input
                    value={applyForm.description}
                    onChange={(e) => setApplyForm({ ...applyForm, description: e.target.value })}
                    placeholder="Describe the application..."
                  />
                  {applyForm.description && (
                    <p className={`text-xs ${wordCount(applyForm.description) > 50 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {wordCount(applyForm.description)}/50 words
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={applyChemFeed.isPending}>
                  {applyChemFeed.isPending ? 'Applying...' : 'Confirm Apply'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}
