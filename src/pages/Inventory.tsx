import { useState, useMemo } from 'react';
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
import { Plus, Trash2, Search, Edit2, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';

type InvView =
  | 'cocoa_beans' | 'palm_oil' | 'dried_fish'
  | 'pigs' | 'fresh_fish' | 'birds' | 'grazing'
  | 'pesticides' | 'fertilizers' | 'livestock_feed' | 'aquaculture_feed'
  | 'in_stock' | 'low_stock' | 'alert' | 'stock_out' | 'failed'
  | null;

const RAW_MATERIAL_CARDS: { view: InvView; label: string; product: string; color: string }[] = [
  { view: 'cocoa_beans',    label: 'Cocoa Beans', product: 'Cocoa Beans', color: 'bg-amber-900/20 border-amber-900/30 text-amber-400' },
  { view: 'palm_oil',       label: 'Palm Oil',    product: 'Palm Oil',    color: 'bg-orange-500/20 border-orange-500/30 text-orange-400' },
  { view: 'dried_fish',     label: 'Dry Fish',    product: 'Dry Fish',    color: 'bg-info/20 border-info/30 text-info' },
];

// Livestock cards read healthy stock from the livestock subsystem; Add creates a
// request routed to Production → Livestock Requested. Fresh Fish is a placeholder.
const LIVESTOCK_CARDS: { view: InvView; label: string; species: string; addLabel: string; color: string }[] = [
  { view: 'pigs',        label: 'Pigs',              species: 'pig',     addLabel: 'Request Pigs',              color: 'bg-pink-500/20 border-pink-500/30 text-pink-400' },
  { view: 'fresh_fish',  label: 'Fresh Fish',        species: 'fish',    addLabel: '',                          color: 'bg-blue-500/20 border-blue-500/30 text-blue-400' },
  { view: 'birds',       label: 'Birds',             species: 'bird',    addLabel: 'Request Birds',             color: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' },
  { view: 'grazing',     label: 'Grazing Livestock', species: 'grazing', addLabel: 'Request Grazing Livestock', color: 'bg-amber-500/20 border-amber-500/30 text-amber-400' },
];

const INV_STATUS_OPTIONS = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'ill', label: 'Ill' },
  { value: 'dead', label: 'Dead' },
  { value: 'sold', label: 'Sold' },
];

// Stock-level label from the healthy count on a livestock card
function livestockStockLevel(count: number): { label: string; cls: string } | null {
  if (count === 0) return { label: 'Out of Stock', cls: 'bg-gray-500/20 text-gray-400' };
  if (count < 5) return { label: 'Low Stock', cls: 'bg-warning/20 text-warning' };
  return null;
}

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

const STOCK_THRESHOLD = 30;
const ALERT_THRESHOLD = 10;

const CATEGORY_NAME_MAP: Record<string, string> = {
  pesticides_chemicals: 'pesticides & chemicals',
  fertilizers: 'fertilizers',
  livestock_feed: 'livestock feed',
  aquaculture_feed: 'aquaculture feed',
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pending:              'bg-warning/20 text-warning',
    accepted:             'bg-info/20 text-info',
    passed:               'bg-success/20 text-success',
    cancelled:            'bg-destructive/20 text-destructive',
    failed:               'bg-gray-500/20 text-gray-400',
    received:             'bg-success/20 text-success',
    in_stock:             'bg-success/20 text-success',
    low_stock:            'bg-warning/20 text-warning',
    alert:                'bg-destructive/20 text-destructive',
    stock_out:            'bg-gray-500/20 text-gray-400',
    out_of_stock:         'bg-gray-500/20 text-gray-400',
    out:                  'bg-gray-500/20 text-gray-400',
    marketing_deduction:  'bg-gray-500/20 text-gray-400',
    in_process:           'bg-info/20 text-info',
    quality_check:        'bg-purple-500/20 text-purple-400',
    rework:               'bg-orange-500/20 text-orange-400',
  };
  return map[s] ?? 'bg-muted text-muted-foreground';
};

const STATUS_LABELS: Record<string, string> = {
  in_stock:  'In Stock',
  low_stock: 'Low Stock',
  alert:     'Alert',
  stock_out: 'Stock Out',
  out:       'Out',
};

function stockStatus(qty: number): string {
  if (qty === 0) return 'stock_out';
  if (qty <= ALERT_THRESHOLD) return 'alert';
  if (qty <= STOCK_THRESHOLD) return 'low_stock';
  return 'in_stock';
}

function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Inventory() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canCreate, canEdit, canDelete, canViewCard } = usePermissions();
  const [view, setView] = useState<InvView>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [editProcItem, setEditProcItem] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | '7' | '30' | '90' | '365'>('all');

  // Raw material form
  const [rmForm, setRmForm] = useState({ quantity: 0, location: '' });
  // Chemical/feed form
  const [cfForm, setCfForm] = useState({ item_name: '', quantity: 0 });
  // Edit dates form (for proc requests after received)
  const [datesForm, setDatesForm] = useState({ manufacture_date: '', expiration_date: '' });

  const { data: inventory = [] } = useQuery<any[]>({
    queryKey: ['inventory'],
    refetchInterval: 30000,
    staleTime: 0,
    queryFn: async () => {
      const items = await api.get<any[]>('/inventory/items');
      return items.map(item => ({
        id: item.id,
        item_name: item.name,
        category: item.item_categories?.name ?? '',
        quantity: Number(item.current_quantity),
        unit: item.unit_of_measure,
        location: item.storage_location ?? '',
        created_at: item.created_at,
      }));
    },
  });

  const { data: alerts = [] } = useQuery<any[]>({
    queryKey: ['inventory-alerts'],
    refetchInterval: 30000,
    queryFn: () => api.get('/inventory/alerts?status=open'),
  });

  const { data: prodRequests = [] } = useQuery<any[]>({
    queryKey: ['prod-requests'],
    refetchInterval: 30000,
    queryFn: () => api.get('/inventory/prod-requests'),
  });

  const { data: procRequests = [] } = useQuery<any[]>({
    queryKey: ['proc-requests'],
    refetchInterval: 30000,
    queryFn: () => api.get('/inventory/proc-requests'),
  });

  const { data: marketingDeductions = [] } = useQuery<any[]>({
    queryKey: ['marketing-deductions'],
    refetchInterval: 30000,
    staleTime: 0,
    queryFn: () => api.get('/inventory/marketing-deductions'),
  });

  const { data: healthyLivestock = [] } = useQuery<any[]>({
    queryKey: ['ls-by-status', 'healthy'],
    refetchInterval: 30000,
    queryFn: () => api.get('/livestock/by-status/healthy'),
  });

  // Only Healthy + "Mature for Market = Yes" livestock appears/counts in Inventory.
  const matureLivestock = healthyLivestock.filter((h: any) => h.mature_for_market);

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
      toast({ title: (editProcItem?.in_stock || editProcItem?.status === 'paid') ? 'Dates updated' : 'Item added to inventory' });
      setEditProcItem(null);
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const LS_SPECIES_PATH: Record<string, string> = { pig: 'pigs', grazing: 'cattle', bird: 'birds' };
  const editLivestock = useMutation({
    mutationFn: ({ species, id, ...d }: any) => api.patch(`/livestock/${LS_SPECIES_PATH[species]}/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ls-by-status'] }); toast({ title: 'Updated' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── Derived data ───────────────────────────────────────────────

  // Aggregate inventory by name so duplicate stock_item records are merged
  const groupedInventory = useMemo(() => {
    const groups: Record<string, any> = {};
    for (const i of inventory) {
      const key = i.item_name;
      if (!groups[key]) {
        groups[key] = { ...i, quantity: 0 };
      }
      groups[key].quantity += Number(i.quantity);
    }
    return Object.values(groups);
  }, [inventory]);

  const inStockItems  = groupedInventory.filter((i: any) => i.quantity > STOCK_THRESHOLD);
  const lowStockItems = groupedInventory.filter((i: any) => i.quantity > ALERT_THRESHOLD && i.quantity <= STOCK_THRESHOLD);
  const alertItems    = groupedInventory.filter((i: any) => i.quantity > 0 && i.quantity <= ALERT_THRESHOLD);
  const stockOutItems = groupedInventory.filter((i: any) => i.quantity === 0);
  const failedReqs    = prodRequests.filter(r => r.status === 'cancelled');

  function getProdReqsForProduct(product: string) {
    return prodRequests.filter(r => r.product_name === product);
  }
  function getProcReqsForCategory(cat: string) {
    return procRequests.filter(r => r.category === cat);
  }

  // ── Card counts ────────────────────────────────────────────────

  function cardCount(v: InvView): string | number {
    const rawCard = RAW_MATERIAL_CARDS.find(c => c.view === v);
    if (rawCard) {
      // Use live stock_items quantities (reflects marketing deductions)
      const group = groupedInventory.find((g: any) =>
        g.item_name.toLowerCase() === rawCard.product.toLowerCase()
      );
      const total = group?.quantity ?? 0;
      const unit = group?.unit ?? 'kg';
      return total > 0 ? `${Number(total).toFixed(2)} ${unit}` : '0';
    }
    const cfCard = CHEM_FEED_CARDS.find(c => c.view === v);
    if (cfCard) {
      const catName = CATEGORY_NAME_MAP[cfCard.category] ?? cfCard.category;
      const matching = groupedInventory.filter((g: any) =>
        g.category.toLowerCase() === catName.toLowerCase()
      );
      const total = matching.reduce((s: number, g: any) => s + Number(g.quantity ?? 0), 0);
      const unit = matching[0]?.unit ?? 'kg';
      return total > 0 ? `${Number(total).toFixed(2)} ${unit}` : '0';
    }
    const lsCard = LIVESTOCK_CARDS.find(c => c.view === v);
    if (lsCard) {
      if (lsCard.species === 'fish') return 0;
      return matureLivestock.filter((h: any) => h.species === lsCard.species).length;
    }
    if (v === 'in_stock') {
      const total = inStockItems.reduce((s: number, i: any) => s + Number(i.quantity), 0) + matureLivestock.length;
      return total > 0 ? Number(total.toFixed(2)) : 0;
    }
    if (v === 'low_stock') {
      const total = lowStockItems.reduce((s: number, i: any) => s + Number(i.quantity), 0);
      return total > 0 ? Number(total.toFixed(2)) : 0;
    }
    if (v === 'alert')     return alertItems.length;
    if (v === 'stock_out') return stockOutItems.length;
    if (v === 'failed')    return failedReqs.length;
    return 0;
  }

  // ── UI helpers ─────────────────────────────────────────────────

  function getButtonLabel(): string {
    const rawCard = RAW_MATERIAL_CARDS.find(c => c.view === view);
    if (rawCard) return `Add ${rawCard.label}`;
    const lsCard = LIVESTOCK_CARDS.find(c => c.view === view);
    if (lsCard) return lsCard.addLabel;
    const cfCard = CHEM_FEED_CARDS.find(c => c.view === view);
    if (cfCard) return cfCard.btnLabel;
    return 'Add Item';
  }

  function showAddButton(): boolean {
    // Livestock cards no longer have an add/request button; only raw materials & chem/feed do.
    if (LIVESTOCK_CARDS.find(c => c.view === view)) return false;
    return view !== null && view !== 'in_stock' && view !== 'low_stock' &&
           view !== 'stock_out' && view !== 'alert' && view !== 'failed';
  }

  function cardClass(v: InvView) {
    // Dynamic hover effects only for in_stock and low_stock — not for alert, stock_out, or failed
    const noDynamic = v === 'alert' || v === 'stock_out' || v === 'failed';
    const hoverCls = noDynamic ? '' : 'hover:scale-105 hover:shadow-lg';
    return `cursor-pointer transition-all duration-200 ${hoverCls} ${view === v ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`.trim();
  }

  function handleCardClick(v: InvView) {
    setView(view === v ? null : v);
    setSearch('');
    setDateFilter('all');
  }

  const DAYS_MAP: Record<string, number> = { '7': 7, '30': 30, '90': 90, '365': 365 };
  function withinDays(dateStr?: string): boolean {
    if (dateFilter === 'all') return true;
    if (!dateStr) return false;
    return Date.now() - new Date(dateStr).getTime() <= DAYS_MAP[dateFilter] * 24 * 60 * 60 * 1000;
  }

  // ── Render detail tables ───────────────────────────────────────

  function renderRawMaterialTable(product: string) {
    const allReqs = getProdReqsForProduct(product);
    const passedReqs = allReqs.filter(r =>
      r.status === 'passed' && withinDays(r.created_at) &&
      (!search || r.product_name.toLowerCase().includes(search.toLowerCase()) ||
        r.location?.toLowerCase().includes(search.toLowerCase()))
    );
    const activeReqs = allReqs.filter(r =>
      r.status !== 'passed' && r.status !== 'cancelled' && withinDays(r.created_at) &&
      (!search || r.product_name.toLowerCase().includes(search.toLowerCase()) ||
        r.location?.toLowerCase().includes(search.toLowerCase()))
    );

    // Marketing deductions for this product
    const deductions = (marketingDeductions as any[]).filter((d: any) =>
      d.product_name.toLowerCase() === product.toLowerCase() && withinDays(d.created_at)
    );

    const hasContent = passedReqs.length > 0 || activeReqs.length > 0 || deductions.length > 0;

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Individual in-stock rows — one per passed prod-request */}
          {passedReqs.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.product_name}</TableCell>
              <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
              <TableCell>{r.location || '-'}</TableCell>
              <TableCell><Badge className={statusBadge('in_stock')}>In Stock</Badge></TableCell>
              <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
            </TableRow>
          ))}
          {/* Active (pending/accepted/in-process) rows */}
          {activeReqs.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.product_name}</TableCell>
              <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
              <TableCell>{r.location || '-'}</TableCell>
              <TableCell><Badge className={statusBadge(r.status ?? 'pending')}>{r.status ?? 'pending'}</Badge></TableCell>
              <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
            </TableRow>
          ))}
          {/* Marketing deduction rows */}
          {deductions.map((d: any) => (
            <TableRow key={d.id} className="opacity-80">
              <TableCell className="font-medium">{d.product_name}</TableCell>
              <TableCell className="text-destructive">-{Number(d.quantity).toFixed(2)} {d.quantity_unit}</TableCell>
              <TableCell>-</TableCell>
              <TableCell><Badge className={statusBadge('out')}>Out</Badge></TableCell>
              <TableCell>{d.created_at ? format(new Date(d.created_at), 'MMM d, yyyy') : '-'}</TableCell>
            </TableRow>
          ))}
          {!hasContent && (
            <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No records</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    );
  }

  function renderChemFeedTable(category: string) {
    const allRows = getProcReqsForCategory(category);

    // Separate paid/in-stock from pending, filter by search
    const inStockRows = allRows.filter(r => (r.status === 'paid' || r.in_stock) &&
      withinDays(r.updated_at ?? r.created_at) &&
      (!search || r.item_name.toLowerCase().includes(search.toLowerCase())));
    const pendingRows = allRows.filter(r => r.status !== 'paid' && !r.in_stock &&
      withinDays(r.created_at) &&
      (!search || r.item_name.toLowerCase().includes(search.toLowerCase())));

    // Aggregate in-stock rows by item_name
    const grouped: Record<string, any> = {};
    for (const r of inStockRows) {
      if (!grouped[r.item_name]) {
        grouped[r.item_name] = { ...r, quantity: 0 };
      }
      grouped[r.item_name].quantity += Number(r.quantity ?? 0);
    }
    const aggregatedRows = Object.values(grouped);

    // Marketing deductions for items in this category
    const catName = CATEGORY_NAME_MAP[category] ?? category;
    const deductions = (marketingDeductions as any[]).filter((d: any) =>
      inventory.some((i: any) =>
        i.item_name.toLowerCase() === d.product_name.toLowerCase() &&
        i.category.toLowerCase() === catName.toLowerCase()
      )
    );

    const colSpan = canEdit('inventory') ? 7 : 6;
    const hasContent = aggregatedRows.length > 0 || pendingRows.length > 0 || deductions.length > 0;

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
            {canEdit('inventory') && <TableHead>Edit</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Aggregated in-stock rows (one per unique item name) */}
          {aggregatedRows.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.item_name}</TableCell>
              <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
              <TableCell>{r.updated_at ? format(new Date(r.updated_at), 'MMM d, yyyy') : '-'}</TableCell>
              <TableCell><Badge className={statusBadge('in_stock')}>In Stock</Badge></TableCell>
              <TableCell>{r.manufacture_date ? format(new Date(r.manufacture_date), 'MMM d, yyyy') : '-'}</TableCell>
              <TableCell>{r.expiration_date ? format(new Date(r.expiration_date), 'MMM d, yyyy') : '-'}</TableCell>
              {canEdit('inventory') && (
                <TableCell>
                  {/* In-stock rows are editable so empty fields can be filled in (spec). */}
                  <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => { setEditProcItem(r); setDatesForm({ manufacture_date: r.manufacture_date ? new Date(r.manufacture_date).toISOString().slice(0, 10) : '', expiration_date: r.expiration_date ? new Date(r.expiration_date).toISOString().slice(0, 10) : '' }); }}>
                    <Edit2 className="h-3 w-3 mr-1" />Edit
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
          {/* Pending rows with individual edit capability */}
          {pendingRows.map((r: any) => {
            const isPaid = r.status === 'paid' || r.status === 'received';
            const hasNoDates = !r.manufacture_date || !r.expiration_date;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.item_name}</TableCell>
                <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
                <TableCell>-</TableCell>
                <TableCell><Badge className={statusBadge(r.status ?? 'pending')}>{r.status ?? 'pending'}</Badge></TableCell>
                <TableCell>{r.manufacture_date ? format(new Date(r.manufacture_date), 'MMM d, yyyy') : <span className="text-muted-foreground text-xs">{isPaid ? 'Not set' : 'Locked'}</span>}</TableCell>
                <TableCell>{r.expiration_date ? format(new Date(r.expiration_date), 'MMM d, yyyy') : <span className="text-muted-foreground text-xs">{isPaid ? 'Not set' : 'Locked'}</span>}</TableCell>
                {canEdit('inventory') && (
                  <TableCell>
                    {isPaid && hasNoDates && (
                      <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => { setEditProcItem(r); setDatesForm({ manufacture_date: '', expiration_date: '' }); }}>
                        <Edit2 className="h-3 w-3 mr-1" />Edit
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {/* Marketing deduction rows */}
          {deductions.map((d: any) => (
            <TableRow key={d.id} className="opacity-80">
              <TableCell className="font-medium">{d.product_name}</TableCell>
              <TableCell className="text-destructive">-{Number(d.quantity).toFixed(2)} {d.quantity_unit}</TableCell>
              <TableCell>-</TableCell>
              <TableCell><Badge className={statusBadge('out')}>Out</Badge></TableCell>
              <TableCell>-</TableCell>
              <TableCell>-</TableCell>
              {canEdit('inventory') && <TableCell>-</TableCell>}
            </TableRow>
          ))}
          {!hasContent && (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center py-6 text-muted-foreground">No requests</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  }

  function renderStockTable(items: any[]) {
    // items are already aggregated (from groupedInventory-derived arrays); just filter by search
    const filtered = items.filter(i => withinDays(i.created_at) && (!search || i.item_name.toLowerCase().includes(search.toLowerCase())));
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map(i => {
            const s = stockStatus(i.quantity);
            return (
              <TableRow key={i.item_name}>
                <TableCell className="font-medium">{i.item_name}</TableCell>
                <TableCell>{Number(i.quantity).toFixed(2)} {i.unit}</TableCell>
                <TableCell>{i.location || '-'}</TableCell>
                <TableCell><Badge className={statusBadge(s)}>{statusLabel(s)}</Badge></TableCell>
                <TableCell>{i.created_at ? format(new Date(i.created_at), 'MMM d, yyyy') : '-'}</TableCell>
              </TableRow>
            );
          })}
          {!filtered.length && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No items</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  function renderAlertTable() {
    const filteredAlerts = alerts.filter((a: any) => withinDays(a.triggered_at));
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
          {filteredAlerts.map((a: any) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.stock_items?.name ?? '-'}</TableCell>
              <TableCell>{a.stock_items?.current_quantity ?? '-'}</TableCell>
              <TableCell>{a.stock_items?.reorder_threshold ?? '-'}</TableCell>
              <TableCell>{a.triggered_at ? format(new Date(a.triggered_at), 'MMM d, yyyy') : '-'}</TableCell>
            </TableRow>
          ))}
          {!filteredAlerts.length && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No alerts</TableCell></TableRow>}
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
          {failedReqs.filter((r: any) => withinDays(r.created_at)).map((r: any) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.product_name}</TableCell>
              <TableCell>{Number(r.quantity).toFixed(2)} {r.quantity_unit}</TableCell>
              <TableCell>{r.location || '-'}</TableCell>
              <TableCell><Badge className="bg-destructive/20 text-destructive">Failed</Badge></TableCell>
              <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
            </TableRow>
          ))}
          {!failedReqs.filter((r: any) => withinDays(r.created_at)).length && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No failed requests</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  function renderLivestockTable(species: string) {
    if (species === 'fish') {
      return <div className="py-10 text-center text-muted-foreground text-sm">Fresh Fish stock tracking coming soon.</div>;
    }
    const rows = matureLivestock.filter((h: any) =>
      h.species === species &&
      withinDays(h.date_recorded ?? h.created_at) &&
      (!search || (h.record_id ?? '').toLowerCase().includes(search.toLowerCase()) || (h.sub_type ?? '').toLowerCase().includes(search.toLowerCase()))
    );
    const cols = canEdit('inventory') ? 9 : 8;
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead><TableHead>ID</TableHead><TableHead>Breed / Type</TableHead><TableHead>Gender</TableHead>
            <TableHead>Weight (kg)</TableHead><TableHead>Status</TableHead><TableHead>Pen / Location</TableHead><TableHead>Date</TableHead>
            {canEdit('inventory') && <TableHead className="text-right">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h: any) => (
            <TableRow key={h.id}>
              <TableCell className="font-medium capitalize">{species === 'grazing' ? 'Grazing' : species}</TableCell>
              <TableCell className="font-mono text-xs">{h.record_id || '-'}</TableCell>
              <TableCell className="capitalize">{h.sub_type || '-'}</TableCell>
              <TableCell className="capitalize">{h.gender || '-'}</TableCell>
              <TableCell>
                {canEdit('inventory') ? (
                  <input type="number" step="0.01" min="0" defaultValue={h.weight_kg ?? ''}
                    className="h-8 w-20 rounded border border-input bg-background px-2 text-sm text-foreground"
                    onBlur={(e) => { const v = e.target.value; if (v !== '' && Number(v) !== Number(h.weight_kg)) editLivestock.mutate({ species: h.species, id: h.id, weight_kg: Number(v) }); }} />
                ) : (h.weight_kg != null ? Number(h.weight_kg).toFixed(2) : '-')}
              </TableCell>
              <TableCell><Badge className={h.status === 'healthy' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}>{h.status}</Badge></TableCell>
              <TableCell>{h.location || '-'}</TableCell>
              <TableCell>{h.date_recorded ? format(new Date(h.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
              {canEdit('inventory') && (
                <TableCell className="text-right">
                  <select value={h.status}
                    onChange={(e) => editLivestock.mutate({ species: h.species, id: h.id, status: e.target.value })}
                    className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                    {INV_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </TableCell>
              )}
            </TableRow>
          ))}
          {!rows.length && <TableRow><TableCell colSpan={cols} className="text-center py-6 text-muted-foreground">No healthy stock</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  function renderInStockLivestock() {
    const species = [
      { key: 'pig', label: 'Pigs' },
      { key: 'bird', label: 'Birds' },
      { key: 'grazing', label: 'Grazing Livestock' },
    ];
    const rows = species
      .map(s => ({ ...s, count: matureLivestock.filter((h: any) => h.species === s.key && withinDays(h.date_recorded ?? h.created_at)).length }))
      .filter(r => r.count > 0);
    if (!rows.length) return null;
    return (
      <div>
        <p className="text-xs text-muted-foreground uppercase font-semibold mb-2 mt-6">Livestock (Healthy = In-Stock)</p>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Livestock</TableHead><TableHead>Healthy Count</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell>{r.count}</TableCell>
                <TableCell><Badge className="bg-success/20 text-success">In Stock</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  function renderDetailContent() {
    if (!view) return null;
    const rawCard = RAW_MATERIAL_CARDS.find(c => c.view === view);
    if (rawCard) return renderRawMaterialTable(rawCard.product);
    const lsCard = LIVESTOCK_CARDS.find(c => c.view === view);
    if (lsCard) return renderLivestockTable(lsCard.species);
    const cfCard = CHEM_FEED_CARDS.find(c => c.view === view);
    if (cfCard) return renderChemFeedTable(cfCard.category);
    if (view === 'in_stock')  return <div className="space-y-2">{renderStockTable(inStockItems)}{renderInStockLivestock()}</div>;
    if (view === 'low_stock') return renderStockTable(lowStockItems);
    if (view === 'alert')     return renderStockTable(alertItems);
    if (view === 'stock_out') return renderStockTable(stockOutItems);
    if (view === 'failed')    return renderFailedTable();
    return null;
  }

  function getViewTitle(): string {
    const rawCard = RAW_MATERIAL_CARDS.find(c => c.view === view);
    if (rawCard) return rawCard.label;
    const lsCard = LIVESTOCK_CARDS.find(c => c.view === view);
    if (lsCard) return lsCard.label;
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
        {/* ── Dashboard: cards only ── */}
        {!view && (
          <>
            <div>
              <h1 className="text-3xl font-bold">Inventory Management</h1>
              <p className="text-muted-foreground">Farm inputs, raw materials, and stock tracking</p>
            </div>

            {/* Row 1 — Raw Materials (full width, above all others) */}
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Raw Materials</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {RAW_MATERIAL_CARDS.filter(c => canViewCard(`inventory.${c.view}`)).map(c => (
                  <Card key={c.view} className={`${c.color} border ${cardClass(c.view)}`} onClick={() => handleCardClick(c.view)}>
                    <CardContent className="p-5">
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-3xl font-bold mt-1">{cardCount(c.view)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Row 1b — Livestock */}
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Livestock</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {LIVESTOCK_CARDS.filter(c => canViewCard(`inventory.${c.view}`)).map(c => {
                  const count = Number(cardCount(c.view)) || 0;
                  const level = c.species !== 'fish' ? livestockStockLevel(count) : null;
                  return (
                    <Card key={c.view} className={`${c.color} border ${cardClass(c.view)}`} onClick={() => handleCardClick(c.view)}>
                      <CardContent className="p-4">
                        <p className="text-xs font-medium">{c.label}</p>
                        <p className="text-2xl font-bold mt-1">{cardCount(c.view)}</p>
                        {level && <Badge className={`mt-1 ${level.cls}`}>{level.label}</Badge>}
                      </CardContent>
                    </Card>
                  );
                })}
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
          </>
        )}

        {/* ── Detail page (back arrow + date filter + add button) ── */}
        {view && (
          <>
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => setView(null)} aria-label="Back to inventory" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold">{getViewTitle()}</h1>
                  <p className="text-muted-foreground text-sm">Inventory detail</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
                  {([
                    { v: 'all', label: 'All' },
                    { v: '7', label: '7d' },
                    { v: '30', label: '30d' },
                    { v: '90', label: '90d' },
                    { v: '365', label: '365d' },
                  ] as { v: typeof dateFilter; label: string }[]).map(o => (
                    <Button
                      key={o.v}
                      size="sm"
                      onClick={() => setDateFilter(o.v)}
                      aria-pressed={dateFilter === o.v}
                      className={dateFilter === o.v
                        ? 'gradient-primary text-black font-medium h-7 px-3 text-xs'
                        : 'border-0 bg-transparent text-white hover:bg-accent h-7 px-3 text-xs'}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
                {showAddButton() && canCreate('inventory') && (
                  <Button className="gradient-primary text-black font-medium" onClick={() => setIsOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {getButtonLabel()}
                  </Button>
                )}
              </div>
            </div>

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
          </>
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
                  <p className="text-xs text-muted-foreground">Status will be set to <strong>Pending</strong> and sent to Production. Card total updates when status becomes <strong>Passed</strong>.</p>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={cfForm.item_name} onChange={(e) => setCfForm({ ...cfForm, item_name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity ({['fertilizers', 'livestock_feed', 'aquaculture_feed'].includes(view as string) ? 'kg' : 'liters'})</Label>
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
              <DialogTitle>{(editProcItem?.in_stock || editProcItem?.status === 'paid') ? 'Edit Dates' : 'Add Dates'} — {editProcItem?.item_name}</DialogTitle>
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
              <p className="text-xs text-muted-foreground">{(editProcItem?.in_stock || editProcItem?.status === 'paid') ? 'Update the manufacture and expiration dates for this in-stock item.' : <>Providing both dates will add this item to inventory as <strong>In Stock</strong>.</>}</p>
              <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={saveDates.isPending}>
                {(editProcItem?.in_stock || editProcItem?.status === 'paid') ? 'Save Changes' : 'Add to Inventory'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>}
      </div>
    </DashboardLayout>
  );
}
