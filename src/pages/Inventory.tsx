import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Search, Edit2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';

type InvView =
  | 'cocoa_beans' | 'palm_oil' | 'dried_fish' | 'livestock'
  | 'pesticides' | 'fertilizers' | 'livestock_feed' | 'aquaculture_feed'
  | 'in_stock' | 'low_stock' | 'alert' | 'stock_out' | 'failed'
  | null;

const RAW_MATERIAL_CARDS: { view: InvView; label: string; product: string; color: string }[] = [
  { view: 'cocoa_beans',    label: 'Cocoa Beans', product: 'Cocoa Beans', color: 'bg-amber-900/20 border-amber-900/30 text-amber-400' },
  { view: 'palm_oil',       label: 'Palm Oil',    product: 'Palm Oil',    color: 'bg-orange-500/20 border-orange-500/30 text-orange-400' },
  { view: 'dried_fish',     label: 'Dried Fish',  product: 'Dried Fish',  color: 'bg-info/20 border-info/30 text-info' },
  { view: 'livestock',      label: 'Livestock',   product: 'Livestock',   color: 'bg-accent/20 border-accent/30 text-accent' },
];

const CHEM_FEED_CARDS: { view: InvView; label: string; category: string; btnLabel: string; color: string }[] = [
  { view: 'pesticides',     label: 'Pesticides & Chemicals', category: 'pesticides_chemicals', btnLabel: 'Add Chemical',        color: 'bg-warning/20 border-warning/30 text-warning' },
  { view: 'fertilizers',    label: 'Fertilizers',            category: 'fertilizers',          btnLabel: 'Add Fertilizer',      color: 'bg-success/20 border-success/30 text-success' },
  { view: 'livestock_feed', label: 'Livestock Feed',         category: 'livestock_feed',       btnLabel: 'Add Livestock Feeds', color: 'bg-purple-500/20 border-purple-500/30 text-purple-400' },
  { view: 'aquaculture_feed', label: 'Aquaculture Feed',     category: 'aquaculture_feed',     btnLabel: 'Add Aquaculture Feed',color: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400' },
];

const STATUS_CARDS: { view: InvView; label: string; color: string }[] = [
  { view: 'in_stock',  label: 'In Stock',  color: 'bg-success/20 border-success/30 text-success' },
  { view: 'low_stock', label: 'Low Stock', color: 'bg-warning/20 border-warning/30 text-warning' },
  { view: 'alert',     label: 'Alert',     color: 'bg-destructive/20 border-destructive/30 text-destructive' },
  { view: 'stock_out', label: 'Stock Out', color: 'bg-gray-500/20 border-gray-500/30 text-gray-400' },
  { view: 'failed',    label: 'Failed Requests', color: 'bg-destructive/10 border-destructive/20 text-destructive' },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pending:       'bg-warning/20 text-warning',
    accepted:      'bg-info/20 text-info',
    passed:        'bg-success/20 text-success',
    cancelled:     'bg-destructive/20 text-destructive',
    failed:        'bg-gray-500/20 text-gray-400',
    received:      'bg-success/20 text-success',
    in_stock:      'bg-success/20 text-success',
    low_stock:     'bg-warning/20 text-warning',
    out_of_stock:  'bg-destructive/20 text-destructive',
    in_process:    'bg-info/20 text-info',
    quality_check: 'bg-purple-500/20 text-purple-400',
    rework:        'bg-orange-500/20 text-orange-400',
  };
  return map[s] ?? 'bg-muted text-muted-foreground';
};

function stockStatus(qty: number, threshold: number): string {
  if (qty === 0) return 'out_of_stock';
  if (qty <= threshold) return 'low_stock';
  return 'in_stock';
}

export default function Inventory() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canCreate, canEdit, canDelete, canViewCard } = usePermissions();
  const [view, setView] = useState<InvView>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [editProcItem, setEditProcItem] = useState<any | null>(null);
  const [search, setSearch] = useState('');

  // Raw material form
  const [rmForm, setRmForm] = useState({ quantity: 0, location: '' });
  // Chemical/feed form
  const [cfForm, setCfForm] = useState({ item_name: '', quantity: 0 });
  // Edit dates form (for proc requests after received)
  const [datesForm, setDatesForm] = useState({ manufacture_date: '', expiration_date: '' });

  const { data: inventory = [] } = useQuery<any[]>({
    queryKey: ['inventory'],
    queryFn: async () => {
      const items = await api.get<any[]>('/inventory/items');
      return items.map(item => ({
        id: item.id,
        item_name: item.name,
        category: item.item_categories?.name ?? '',
        quantity: Number(item.current_quantity),
        unit: item.unit_of_measure,
        threshold: Number(item.reorder_threshold ?? 10),
        location: item.storage_location ?? '',
        created_at: item.created_at,
      }));
    },
  });

  const { data: alerts = [] } = useQuery<any[]>({
    queryKey: ['inventory-alerts'],
    queryFn: () => api.get('/inventory/alerts?status=open'),
  });

  const { data: prodRequests = [] } = useQuery<any[]>({
    queryKey: ['prod-requests'],
    queryFn: () => api.get('/inventory/prod-requests'),
  });

  const { data: procRequests = [] } = useQuery<any[]>({
    queryKey: ['proc-requests'],
    queryFn: () => api.get('/inventory/proc-requests'),
  });

  // ── Mutations ──────────────────────────────────────────────────

  const addRawMaterial = useMutation({
    mutationFn: (product_name: string) =>
      api.post('/inventory/prod-requests', {
        product_name,
        quantity: rmForm.quantity,
        location: rmForm.location,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prod-requests'] });
      toast({ title: 'Request sent to Production as Pending' });
      setIsOpen(false);
      setRmForm({ quantity: 0, location: '' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const addChemFeed = useMutation({
    mutationFn: (category: string) =>
      api.post('/inventory/proc-requests', {
        category,
        item_name: cfForm.item_name,
        quantity: cfForm.quantity,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proc-requests'] });
      toast({ title: 'Request sent to Procurement as Pending' });
      setIsOpen(false);
      setCfForm({ item_name: '', quantity: 0 });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteProdReq = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/prod-requests/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prod-requests'] }); toast({ title: 'Request deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteProcReq = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/proc-requests/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proc-requests'] }); toast({ title: 'Request deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const saveDates = useMutation({
    mutationFn: ({ id, manufacture_date, expiration_date }: { id: string; manufacture_date: string; expiration_date: string }) =>
      api.patch(`/inventory/proc-requests/${id}`, { manufacture_date, expiration_date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proc-requests'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast({ title: 'Item added to inventory' });
      setEditProcItem(null);
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── Derived data ───────────────────────────────────────────────

  const inStockItems  = inventory.filter(i => i.quantity > i.threshold);
  const lowStockItems = inventory.filter(i => i.quantity > 0 && i.quantity <= i.threshold);
  const stockOutItems = inventory.filter(i => i.quantity === 0);
  const failedReqs    = prodRequests.filter(r => r.status === 'cancelled');

  function getProdReqsForProduct(product: string) {
    return prodRequests.filter(r => r.product_name === product);
  }
  function getProcReqsForCategory(cat: string) {
    return procRequests.filter(r => r.category === cat);
  }

  // ── Card counts ────────────────────────────────────────────────

  function cardCount(v: InvView): number {
    const rawCard = RAW_MATERIAL_CARDS.find(c => c.view === v);
    if (rawCard) return getProdReqsForProduct(rawCard.product).length;
    const cfCard = CHEM_FEED_CARDS.find(c => c.view === v);
    if (cfCard) return getProcReqsForCategory(cfCard.category).length;
    if (v === 'in_stock')  return inStockItems.length;
    if (v === 'low_stock') return lowStockItems.length;
    if (v === 'stock_out') return stockOutItems.length;
    if (v === 'alert')     return alerts.length;
    if (v === 'failed')    return failedReqs.length;
    return 0;
  }

  // ── UI helpers ─────────────────────────────────────────────────

  function getButtonLabel(): string {
    const rawCard = RAW_MATERIAL_CARDS.find(c => c.view === view);
    if (rawCard) return `Add ${rawCard.label}`;
    const cfCard = CHEM_FEED_CARDS.find(c => c.view === view);
    if (cfCard) return cfCard.btnLabel;
    return 'Add Item';
  }

  function showAddButton(): boolean {
    return view !== null && view !== 'in_stock' && view !== 'low_stock' &&
           view !== 'stock_out' && view !== 'alert' && view !== 'failed';
  }

  function cardClass(v: InvView) {
    return `cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${view === v ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`;
  }

  function handleCardClick(v: InvView) {
    setView(view === v ? null : v);
    setSearch('');
  }

  // ── Render detail tables ───────────────────────────────────────

  function renderRawMaterialTable(product: string) {
    const rows = getProdReqsForProduct(product).filter(r =>
      !search || r.product_name.toLowerCase().includes(search.toLowerCase()) ||
      r.location?.toLowerCase().includes(search.toLowerCase())
    );
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.product_name}</TableCell>
              <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
              <TableCell>{r.location || '-'}</TableCell>
              <TableCell><Badge className={statusBadge(r.status ?? 'pending')}>{r.status ?? 'pending'}</Badge></TableCell>
              <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
              <TableCell>-</TableCell>
            </TableRow>
          ))}
          {!rows.length && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No requests</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  function renderChemFeedTable(category: string) {
    const rows = getProcReqsForCategory(category).filter(r =>
      !search || r.item_name.toLowerCase().includes(search.toLowerCase())
    );
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Chemical Name</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Date In Stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Manufacture Date</TableHead>
            <TableHead>Expiration Date</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.item_name}</TableCell>
              <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
              <TableCell>{r.in_stock && r.created_at ? format(new Date(r.updated_at ?? r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
              <TableCell><Badge className={statusBadge(r.in_stock ? 'in_stock' : (r.status ?? 'pending'))}>{r.in_stock ? 'In Stock' : (r.status ?? 'pending')}</Badge></TableCell>
              <TableCell>{r.manufacture_date ? format(new Date(r.manufacture_date), 'MMM d, yyyy') : '-'}</TableCell>
              <TableCell>{r.expiration_date ? format(new Date(r.expiration_date), 'MMM d, yyyy') : '-'}</TableCell>
              <TableCell className="flex gap-2">
                {r.status === 'received' && !r.in_stock && canEdit('inventory') && (
                  <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => { setEditProcItem(r); setDatesForm({ manufacture_date: '', expiration_date: '' }); }}>
                    <Edit2 className="h-3 w-3 mr-1" />Edit
                  </Button>
                )}
                {r.status === 'pending' && canDelete('inventory') && (
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this request?')) deleteProcReq.mutate(r.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No requests</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  function renderStockTable(items: any[]) {
    const filtered = items.filter(i => !search || i.item_name.toLowerCase().includes(search.toLowerCase()));
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map(i => (
            <TableRow key={i.id}>
              <TableCell className="font-medium">{i.item_name}</TableCell>
              <TableCell>{i.quantity} {i.unit}</TableCell>
              <TableCell>{i.location || '-'}</TableCell>
              <TableCell><Badge className={statusBadge(stockStatus(i.quantity, i.threshold))}>{stockStatus(i.quantity, i.threshold).replace('_', ' ')}</Badge></TableCell>
              <TableCell>{i.created_at ? format(new Date(i.created_at), 'MMM d, yyyy') : '-'}</TableCell>
              <TableCell>-</TableCell>
            </TableRow>
          ))}
          {!filtered.length && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No items</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  function renderAlertTable() {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Current Qty</TableHead>
            <TableHead>Reorder Threshold</TableHead>
            <TableHead>Triggered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((a: any) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.stock_items?.name ?? '-'}</TableCell>
              <TableCell>{a.stock_items?.current_quantity ?? '-'}</TableCell>
              <TableCell>{a.stock_items?.reorder_threshold ?? '-'}</TableCell>
              <TableCell>{a.triggered_at ? format(new Date(a.triggered_at), 'MMM d, yyyy') : '-'}</TableCell>
            </TableRow>
          ))}
          {!alerts.length && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No alerts</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  function renderFailedTable() {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product Name</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {failedReqs.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.product_name}</TableCell>
              <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
              <TableCell>{r.location || '-'}</TableCell>
              <TableCell><Badge className="bg-destructive/20 text-destructive">Failed</Badge></TableCell>
              <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
            </TableRow>
          ))}
          {!failedReqs.length && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No failed requests</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  function renderDetailContent() {
    if (!view) return null;
    const rawCard = RAW_MATERIAL_CARDS.find(c => c.view === view);
    if (rawCard) return renderRawMaterialTable(rawCard.product);
    const cfCard = CHEM_FEED_CARDS.find(c => c.view === view);
    if (cfCard) return renderChemFeedTable(cfCard.category);
    if (view === 'in_stock')  return renderStockTable(inStockItems);
    if (view === 'low_stock') return renderStockTable(lowStockItems);
    if (view === 'stock_out') return renderStockTable(stockOutItems);
    if (view === 'alert')     return renderAlertTable();
    if (view === 'failed')    return renderFailedTable();
    return null;
  }

  function getViewTitle(): string {
    const rawCard = RAW_MATERIAL_CARDS.find(c => c.view === view);
    if (rawCard) return rawCard.label;
    const cfCard = CHEM_FEED_CARDS.find(c => c.view === view);
    if (cfCard) return cfCard.label;
    return STATUS_CARDS.find(c => c.view === view)?.label ?? '';
  }

  // ── Add item dialog ────────────────────────────────────────────

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rawCard = RAW_MATERIAL_CARDS.find(c => c.view === view);
    if (rawCard) { addRawMaterial.mutate(rawCard.product); return; }
    const cfCard = CHEM_FEED_CARDS.find(c => c.view === view);
    if (cfCard) { addChemFeed.mutate(cfCard.category); }
  }

  const isRawMaterial = !!RAW_MATERIAL_CARDS.find(c => c.view === view);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Inventory Management</h1>
            <p className="text-muted-foreground">Farm inputs, raw materials, and stock tracking</p>
          </div>
          {showAddButton() && canCreate('inventory') && (
            <Button className="gradient-primary text-black font-medium" onClick={() => setIsOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {getButtonLabel()}
            </Button>
          )}
        </div>

        {/* Row 1 — Raw Materials */}
        <div>
          <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Raw Materials</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {RAW_MATERIAL_CARDS.filter(c => canViewCard(`inventory.${c.view}`)).map(c => (
              <Card key={c.view} className={`${c.color} border ${cardClass(c.view)}`} onClick={() => handleCardClick(c.view)}>
                <CardContent className="p-4">
                  <p className="text-xs font-medium">{c.label}</p>
                  <p className="text-2xl font-bold mt-1">{cardCount(c.view)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Row 2 — Chemicals & Feeds */}
        <div>
          <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Chemicals & Feeds</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CHEM_FEED_CARDS.filter(c => canViewCard(`inventory.${c.view}`)).map(c => (
              <Card key={c.view} className={`${c.color} border ${cardClass(c.view)}`} onClick={() => handleCardClick(c.view)}>
                <CardContent className="p-4">
                  <p className="text-xs font-medium">{c.label}</p>
                  <p className="text-2xl font-bold mt-1">{cardCount(c.view)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Row 3 — Status Cards */}
        <div>
          <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Stock Status</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {STATUS_CARDS.filter(c => canViewCard(`inventory.${c.view}`)).map(c => (
              <Card key={c.view} className={`${c.color} border ${cardClass(c.view)}`} onClick={() => handleCardClick(c.view)}>
                <CardContent className="p-4">
                  <p className="text-xs font-medium">{c.label}</p>
                  <p className="text-2xl font-bold mt-1">{cardCount(c.view)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {view && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{getViewTitle()}</CardTitle>
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => setSearch('')}
                    className="pl-9 text-white placeholder:text-white/50"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderDetailContent()}
            </CardContent>
          </Card>
        )}

        {/* Add Item Dialog */}
        {canCreate('inventory') && <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{getButtonLabel()}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              {isRawMaterial ? (
                <>
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={RAW_MATERIAL_CARDS.find(c => c.view === view)?.product ?? ''} readOnly className="bg-muted" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quantity (kg)</Label>
                      <Input type="number" min={0} value={rmForm.quantity} onChange={(e) => setRmForm({ ...rmForm, quantity: Number(e.target.value) })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Order Type</Label>
                      <Input value="Make-to-Order" readOnly className="bg-muted" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input value={rmForm.location} onChange={(e) => setRmForm({ ...rmForm, location: e.target.value })} placeholder="Warehouse A" />
                  </div>
                  <p className="text-xs text-muted-foreground">Status will be set to <strong>Pending</strong> and sent to Production.</p>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={cfForm.item_name} onChange={(e) => setCfForm({ ...cfForm, item_name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity (liters)</Label>
                    <Input type="number" min={0} value={cfForm.quantity} onChange={(e) => setCfForm({ ...cfForm, quantity: Number(e.target.value) })} required />
                  </div>
                  <p className="text-xs text-muted-foreground">Status will be set to <strong>Pending</strong> and sent to Procurement.</p>
                </>
              )}
              <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addRawMaterial.isPending || addChemFeed.isPending}>
                {isRawMaterial ? 'Send to Production' : 'Send to Procurement'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>}

        {/* Edit Dates Dialog (procurement) */}
        {canEdit('inventory') && <Dialog open={!!editProcItem} onOpenChange={(o) => !o && setEditProcItem(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Dates — {editProcItem?.item_name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); if (!datesForm.manufacture_date || !datesForm.expiration_date) { toast({ title: 'Both dates are required', variant: 'destructive' }); return; } saveDates.mutate({ id: editProcItem.id, ...datesForm }); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Manufacture Date</Label>
                <Input type="date" value={datesForm.manufacture_date} onChange={(e) => setDatesForm({ ...datesForm, manufacture_date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input type="date" value={datesForm.expiration_date} onChange={(e) => setDatesForm({ ...datesForm, expiration_date: e.target.value })} required />
              </div>
              <p className="text-xs text-muted-foreground">Providing both dates will add this item to inventory as <strong>In Stock</strong>.</p>
              <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={saveDates.isPending}>
                Add to Inventory
              </Button>
            </form>
          </DialogContent>
        </Dialog>}
      </div>
    </DashboardLayout>
  );
}
