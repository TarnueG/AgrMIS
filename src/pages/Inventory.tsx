import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  AreaChart as AreaChartIcon,
  Banknote,
  CheckCircle2,
  ClipboardPlus,
  Filter,
  LockKeyhole,
  MapPin,
  PackageCheck,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Warehouse,
  X,
  UserPlus,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  buildInventoryDashboard,
  formatCurrency,
  formatDate,
  formatQuantity,
  inventoryCategories,
  inventoryChartColors,
  inventoryQualityStatuses,
  inventoryStatusOptions,
  labelize,
  type InventoryItem,
  type InventoryMovement,
  type StockStatus,
  type Supplier,
} from '@/lib/inventory-dashboard';

type InventoryFormData = {
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
  min_stock_level: number;
  location: string;
  expiry_date: string;
  batch_no: string;
  quality_status: string;
  reserved_quantity: number;
  supplier_id: string;
  unit_cost: number;
};

type MovementFormData = {
  inventory_id: string;
  movement_type: 'received' | 'dispatched';
  quantity: number;
  unit_cost: number;
  movement_date: string;
  notes: string;
};

type SupplierFormData = {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const categoryColors: Record<string, string> = {
  seeds: 'bg-primary/20 text-primary border-primary/20',
  fertilizer: 'bg-success/20 text-success border-success/20',
  chemicals: 'bg-warning/20 text-warning border-warning/20',
  livestock_feed: 'bg-accent/20 text-accent border-accent/20',
  fish_feed: 'bg-info/20 text-info border-info/20',
  harvested_goods: 'bg-primary/10 text-primary border-primary/20',
  finished_goods: 'bg-info/20 text-info border-info/20',
  tools: 'bg-muted text-muted-foreground border-border',
  equipment: 'bg-secondary text-secondary-foreground border-border',
  spare_parts: 'bg-muted text-foreground border-border',
  feed: 'bg-accent/20 text-accent border-accent/20',
};

function getStatusBadge(status: StockStatus) {
  const styles: Record<StockStatus, string> = {
    in_stock: 'bg-success/20 text-success border-success/20',
    low_stock: 'bg-warning/20 text-warning border-warning/20',
    reorder: 'bg-destructive/20 text-destructive border-destructive/20',
    expiring_soon: 'bg-accent/20 text-accent border-accent/20',
    expired: 'bg-destructive text-destructive-foreground border-destructive',
    quality_hold: 'bg-info/20 text-info border-info/20',
  };

  const labels: Record<StockStatus, string> = {
    in_stock: 'In Stock',
    low_stock: 'Low Stock',
    reorder: 'Reorder',
    expiring_soon: 'Expiring Soon',
    expired: 'Expired',
    quality_hold: 'Quality Hold',
  };

  return <Badge className={styles[status]}>{labels[status]}</Badge>;
}

function DashboardKpi({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'default',
  onClick,
  active,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: typeof PackageCheck;
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'info';
  onClick?: () => void;
  active?: boolean;
}) {
  const tones = {
    default: 'bg-card border-border',
    primary: 'bg-primary/10 border-primary/25',
    warning: 'bg-warning/10 border-warning/25',
    danger: 'bg-destructive/10 border-destructive/25',
    info: 'bg-info/10 border-info/25',
  };

  const iconTones = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/20 text-primary',
    warning: 'bg-warning/20 text-warning',
    danger: 'bg-destructive/20 text-destructive',
    info: 'bg-info/20 text-info',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border text-left transition-all hover:border-primary/40 hover:bg-card/80 ${
        tones[tone]
      } ${active ? 'ring-1 ring-primary/60' : ''}`}
    >
      <div className="flex h-full min-h-[76px] items-start justify-between gap-2 p-2.5">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-xs text-muted-foreground">{title}</p>
          <p className="truncate text-2xl font-bold tracking-normal text-white">{value}</p>
          <p className="hidden truncate text-[11px] leading-4 text-muted-foreground 2xl:block">{detail}</p>
        </div>
        <div className={`rounded-md p-2 ${iconTones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

export default function Inventory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StockStatus>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [isMovementOpen, setIsMovementOpen] = useState(false);
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [formData, setFormData] = useState<InventoryFormData>({
    item_name: '',
    category: 'seeds',
    quantity: 0,
    unit: '',
    min_stock_level: 0,
    location: '',
    expiry_date: '',
    batch_no: '',
    quality_status: 'available',
    reserved_quantity: 0,
    supplier_id: 'none',
    unit_cost: 0,
  });
  const [movementForm, setMovementForm] = useState<MovementFormData>({
    inventory_id: '',
    movement_type: 'received',
    quantity: 0,
    unit_cost: 0,
    movement_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [supplierForm, setSupplierForm] = useState<SupplierFormData>({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory').select('*').order('item_name');
      if (error) throw error;
      return data as InventoryItem[];
    },
  });

  const { data: movements } = useQuery({
    queryKey: ['inventory-movements-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .order('movement_date', { ascending: false });
      if (error) throw error;
      return data as InventoryMovement[];
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ['inventory-suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('id, name').order('name');
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: InventoryFormData) => {
      const { error } = await supabase.from('inventory').insert([
        {
          item_name: data.item_name,
          category: data.category,
          quantity: data.quantity,
          unit: data.unit || null,
          min_stock_level: data.min_stock_level,
          location: data.location || null,
          expiry_date: data.expiry_date || null,
          batch_no: data.batch_no || null,
          quality_status: data.quality_status,
          reserved_quantity: data.reserved_quantity,
          supplier_id: data.supplier_id === 'none' ? null : data.supplier_id,
          unit_cost: data.unit_cost,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({ title: 'Item added successfully' });
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: 'Error adding item', description: error.message, variant: 'destructive' });
    },
  });

  const addSupplierMutation = useMutation({
    mutationFn: async (data: SupplierFormData) => {
      const { error } = await supabase.from('suppliers').insert([
        {
          name: data.name,
          contact_person: data.contact_person || null,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          notes: data.notes || null,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-suppliers'] });
      toast({ title: 'Supplier added' });
      setIsSupplierOpen(false);
      setSupplierForm({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
      });
    },
    onError: (error) => {
      toast({ title: 'Error adding supplier', description: error.message, variant: 'destructive' });
    },
  });

  const recordMovementMutation = useMutation({
    mutationFn: async (data: MovementFormData) => {
      const selectedItem = inventory?.find((item) => item.id === data.inventory_id);
      if (!selectedItem) throw new Error('Select an inventory item before recording movement.');
      if (data.quantity <= 0) throw new Error('Movement quantity must be greater than zero.');

      const currentQuantity = Number(selectedItem.quantity || 0);
      const nextQuantity =
        data.movement_type === 'received'
          ? currentQuantity + data.quantity
          : Math.max(currentQuantity - data.quantity, 0);

      const { error: movementError } = await supabase.from('inventory_movements').insert([
        {
          inventory_id: data.inventory_id,
          movement_type: data.movement_type,
          quantity: data.quantity,
          unit_cost: data.unit_cost || null,
          movement_date: data.movement_date ? new Date(data.movement_date).toISOString() : new Date().toISOString(),
          source_module: 'inventory',
          notes: data.notes || null,
        },
      ]);
      if (movementError) throw movementError;

      const updates: {
        quantity: number;
        unit_cost?: number;
      } = { quantity: nextQuantity };

      if (data.movement_type === 'received' && data.unit_cost > 0) {
        updates.unit_cost = data.unit_cost;
      }

      const { error: inventoryError } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', data.inventory_id);
      if (inventoryError) throw inventoryError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements-dashboard'] });
      toast({ title: 'Inventory movement recorded' });
      setIsMovementOpen(false);
      setMovementForm({
        inventory_id: '',
        movement_type: 'received',
        quantity: 0,
        unit_cost: 0,
        movement_date: new Date().toISOString().slice(0, 10),
        notes: '',
      });
    },
    onError: (error) => {
      toast({ title: 'Error recording movement', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({ title: 'Item deleted' });
    },
  });

  const resetForm = () => {
    setFormData({
      item_name: '',
      category: 'seeds',
      quantity: 0,
      unit: '',
      min_stock_level: 0,
      location: '',
      expiry_date: '',
      batch_no: '',
      quality_status: 'available',
      reserved_quantity: 0,
      supplier_id: 'none',
      unit_cost: 0,
    });
  };

  const dashboard = useMemo(() => {
    return buildInventoryDashboard({ inventory, movements, suppliers });
  }, [inventory, movements, suppliers]);

  const filteredInventory = useMemo(() => {
    return dashboard.enriched.filter((item) => {
      const matchesSearch =
        item.item_name.toLowerCase().includes(search.toLowerCase()) ||
        item.category.toLowerCase().includes(search.toLowerCase()) ||
        (item.location || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.supplier_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.batch_no || '').toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesLocation = locationFilter === 'all' || item.location === locationFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        item.status === statusFilter ||
        (statusFilter === 'low_stock' && item.status === 'reorder');

      return matchesSearch && matchesCategory && matchesLocation && matchesStatus;
    });
  }, [categoryFilter, dashboard.enriched, locationFilter, search, statusFilter]);

  const hasActiveFilters = search || categoryFilter !== 'all' || locationFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setLocationFilter('all');
    setStatusFilter('all');
  };

  const filterByStatus = (status: StockStatus) => {
    setStatusFilter(status);
    setCategoryFilter('all');
    setLocationFilter('all');
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary/15 text-primary border-primary/20">Inventory Command Center</Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {dashboard.enriched.length} active stock records
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Inventory Management</h1>
              <p className="text-sm text-muted-foreground">
                Operational visibility for seed, fertilizer, chemicals, feed, harvested goods, tools, and farm supplies.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
          <Dialog open={isSupplierOpen} onOpenChange={setIsSupplierOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Supplier
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Supplier</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addSupplierMutation.mutate(supplierForm); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Supplier Name</Label>
                  <Input
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Contact Person</Label>
                    <Input
                      value={supplierForm.contact_person}
                      onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={supplierForm.phone}
                      onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={supplierForm.address}
                    onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={supplierForm.notes}
                    onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={addSupplierMutation.isPending}>
                  Add Supplier
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isMovementOpen} onOpenChange={setIsMovementOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <ClipboardPlus className="mr-2 h-4 w-4" />
                Record Movement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Inventory Movement</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); recordMovementMutation.mutate(movementForm); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Inventory Item</Label>
                  <Select value={movementForm.inventory_id} onValueChange={(v) => setMovementForm({ ...movementForm, inventory_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                    <SelectContent>
                      {inventory?.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.item_name} ({formatQuantity(Number(item.quantity || 0), item.unit)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Movement Type</Label>
                    <Select
                      value={movementForm.movement_type}
                      onValueChange={(v) => setMovementForm({ ...movementForm, movement_type: v as 'received' | 'dispatched' })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="dispatched">Dispatched</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={movementForm.quantity}
                      onChange={(e) => setMovementForm({ ...movementForm, quantity: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Unit Cost</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={movementForm.unit_cost}
                      onChange={(e) => setMovementForm({ ...movementForm, unit_cost: Number(e.target.value) })}
                      disabled={movementForm.movement_type === 'dispatched'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Movement Date</Label>
                    <Input
                      type="date"
                      value={movementForm.movement_date}
                      onChange={(e) => setMovementForm({ ...movementForm, movement_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={movementForm.notes}
                    onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })}
                    placeholder="Receipt, dispatch, production issue, sales order reference..."
                  />
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={recordMovementMutation.isPending}>
                  Record Movement
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Inventory Item</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(formData); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Item Name</Label>
                  <Input
                    value={formData.item_name}
                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {inventoryCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{labelize(cat)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Input
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="kg, bags, liters, pcs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Quantity On Hand</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reorder Level</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.min_stock_level}
                      onChange={(e) => setFormData({ ...formData, min_stock_level: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Storage Location</Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="Seed Store, Cold Room, Shed A"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry Date</Label>
                    <Input
                      type="date"
                      value={formData.expiry_date}
                      onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Reserved Quantity</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.reserved_quantity}
                      onChange={(e) => setFormData({ ...formData, reserved_quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit Cost</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.unit_cost}
                      onChange={(e) => setFormData({ ...formData, unit_cost: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Batch / Lot No.</Label>
                    <Input
                      value={formData.batch_no}
                      onChange={(e) => setFormData({ ...formData, batch_no: e.target.value })}
                      placeholder="LOT-2026-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quality Status</Label>
                    <Select value={formData.quality_status} onValueChange={(v) => setFormData({ ...formData, quality_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {inventoryQualityStatuses.map((status) => (
                          <SelectItem key={status} value={status}>{labelize(status)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No supplier linked</SelectItem>
                      {suppliers?.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={addMutation.isPending}>
                  Add Item
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
          <DashboardKpi
            title="Stock On Hand"
            value={dashboard.totalQuantity.toLocaleString()}
            detail="Total recorded units across all farm stores."
            icon={PackageCheck}
            tone="primary"
            onClick={clearFilters}
          />
          <DashboardKpi
            title="Inventory Value"
            value={formatCurrency(dashboard.inventoryValue)}
            detail="Quantity multiplied by unit cost."
            icon={Banknote}
            tone="primary"
            onClick={clearFilters}
          />
          <DashboardKpi
            title="Reserved Stock"
            value={dashboard.reservedQuantity.toLocaleString()}
            detail="Stock allocated to production or orders."
            icon={LockKeyhole}
            tone="info"
            onClick={clearFilters}
          />
          <DashboardKpi
            title="Received This Month"
            value={dashboard.receivedThisMonth.toLocaleString()}
            detail="Inbound quantity from inventory movements."
            icon={AreaChartIcon}
            tone="primary"
            onClick={clearFilters}
          />
          <DashboardKpi
            title="Dispatched This Month"
            value={dashboard.dispatchedThisMonth.toLocaleString()}
            detail="Outbound quantity from inventory movements."
            icon={AreaChartIcon}
            tone="warning"
            onClick={clearFilters}
          />
          <DashboardKpi
            title="Low Stock"
            value={dashboard.lowStockItems.length}
            detail="Items at or near their operating threshold."
            icon={AlertTriangle}
            tone="warning"
            active={statusFilter === 'low_stock'}
            onClick={() => filterByStatus('low_stock')}
          />
          <DashboardKpi
            title="Reorder Risk"
            value={dashboard.reorderItems.length}
            detail="Items already below reorder level."
            icon={ShieldAlert}
            tone="danger"
            active={statusFilter === 'reorder'}
            onClick={() => filterByStatus('reorder')}
          />
          <DashboardKpi
            title="Quality Hold"
            value={dashboard.qualityHoldItems.length}
            detail="Quarantine, damaged, or spoiled stock."
            icon={Warehouse}
            tone="info"
            active={statusFilter === 'quality_hold'}
            onClick={() => filterByStatus('quality_hold')}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          <Card className="xl:col-span-2">
            <CardHeader className="px-4 pb-2 pt-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Stock Movement Trend</CardTitle>
                  <p className="hidden text-xs text-muted-foreground 2xl:block">Received vs dispatched quantity from the inventory movement ledger.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {dashboard.movementData.some((entry) => entry.received > 0 || entry.dispatched > 0) ? (
                <ResponsiveContainer width="100%" height={170}>
                  <AreaChart data={dashboard.movementData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="receivedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={inventoryChartColors.available} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={inventoryChartColors.available} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="dispatchedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={inventoryChartColors.dispatched} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={inventoryChartColors.dispatched} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="received"
                      name="Received"
                      stroke={inventoryChartColors.available}
                      fill="url(#receivedGradient)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="dispatched"
                      name="Dispatched"
                      stroke={inventoryChartColors.dispatched}
                      fill="url(#dispatchedGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[170px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  No inventory movements recorded yet. Received and dispatched trends will appear after movement entries are saved.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-base">Stock by Agricultural Class</CardTitle>
              <p className="hidden text-xs text-muted-foreground 2xl:block">Category concentration and risk by stock class.</p>
            </CardHeader>
            <CardContent className="space-y-1.5 px-4 pb-4">
              {dashboard.categoryData.length ? dashboard.categoryData.slice(0, 5).map((category) => (
                <button
                  type="button"
                  key={category.category}
                  onClick={() => setCategoryFilter(category.category)}
                  className="w-full rounded-md border border-transparent p-1.5 text-left transition hover:border-primary/30 hover:bg-muted/30"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{category.name}</p>
                      <p className="text-xs text-muted-foreground">{category.items} items</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{category.quantity.toLocaleString()}</p>
                      {category.risk > 0 && <p className="text-xs text-warning">{category.risk} at risk</p>}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-info"
                      style={{ width: `${Math.max((category.quantity / dashboard.maxCategoryQuantity) * 100, 4)}%` }}
                    />
                  </div>
                </button>
              )) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Category data appears after inventory items are added.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-base">Reorder Comparison</CardTitle>
              <p className="hidden text-xs text-muted-foreground 2xl:block">Available quantity against minimum stock.</p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {dashboard.reorderChartData.length ? (
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={dashboard.reorderChartData.slice(0, 4)} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} hide />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Bar dataKey="available" name="Available" fill={inventoryChartColors.available} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="reorder" name="Reorder Level" fill={inventoryChartColors.reorder} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[170px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  No reorder exposure.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card>
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-base">Low-Stock Priority</CardTitle>
              <p className="hidden text-xs text-muted-foreground 2xl:block">Items procurement or store officers should review first.</p>
            </CardHeader>
            <CardContent className="space-y-1.5 px-4 pb-4">
              {dashboard.lowStockItems.slice(0, 2).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setSearch(item.item_name);
                    setStatusFilter('low_stock');
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-2 py-1.5 text-left transition hover:border-warning/40 hover:bg-warning/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.item_name}</p>
                    <p className="text-xs text-muted-foreground">{labelize(item.category)} - {item.location || 'No location'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{formatQuantity(item.quantity, item.unit)}</p>
                    <p className="text-xs text-warning">min {item.min_stock_level.toLocaleString()}</p>
                  </div>
                </button>
              ))}
              {!dashboard.lowStockItems.length && (
                <div className="flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 p-3 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  No low-stock items based on current reorder levels.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-base">Expiry & Quality Watch</CardTitle>
              <p className="hidden text-xs text-muted-foreground 2xl:block">Perishable, chemical, feed, and seed batches needing attention.</p>
            </CardHeader>
            <CardContent className="space-y-1.5 px-4 pb-4">
              {dashboard.expiryItems.slice(0, 2).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setSearch(item.item_name);
                    setStatusFilter(item.daysUntilExpiry !== null && item.daysUntilExpiry < 0 ? 'expired' : 'expiring_soon');
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-2 py-1.5 text-left transition hover:border-accent/40 hover:bg-accent/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.item_name}</p>
                    <p className="text-xs text-muted-foreground">{labelize(item.category)} - {item.expiry_date}</p>
                  </div>
                  <Badge className={item.daysUntilExpiry !== null && item.daysUntilExpiry < 0 ? 'bg-destructive text-destructive-foreground' : 'bg-accent/20 text-accent'}>
                    {item.daysUntilExpiry !== null && item.daysUntilExpiry < 0 ? 'Expired' : `${item.daysUntilExpiry} days`}
                  </Badge>
                </button>
              ))}
              {!dashboard.expiryItems.length && (
                <div className="flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 p-3 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  No batches expiring within the next 45 days.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-base">Storage Footprint</CardTitle>
              <p className="hidden text-xs text-muted-foreground 2xl:block">Where stock is concentrated across farm storage points.</p>
            </CardHeader>
            <CardContent className="space-y-1.5 px-4 pb-4">
              {dashboard.locationData.slice(0, 2).map((location) => (
                <button
                  type="button"
                  key={location.location}
                  onClick={() => setLocationFilter(location.location)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-2 py-1.5 text-left transition hover:border-info/40 hover:bg-info/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-md bg-info/15 p-1.5 text-info">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{location.location}</p>
                      <p className="text-xs text-muted-foreground">{location.items} records - {location.quantity.toLocaleString()} units</p>
                    </div>
                  </div>
                  {location.risk > 0 && <Badge className="bg-warning/20 text-warning">{location.risk} risk</Badge>}
                </button>
              ))}
              {!dashboard.locationData.length && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Add locations to see storage footprint.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-2 px-4 pb-2 pt-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-base">Inventory Register</CardTitle>
                <p className="hidden text-xs text-muted-foreground xl:block">
                  Filter-linked operating table for available stock, reorder level, storage, and expiry.
                </p>
              </div>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <X className="mr-2 h-4 w-4" />
                  Clear filters
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
              <div className="relative xl:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search item, category, or location..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {dashboard.availableCategories.map((category) => (
                    <SelectItem key={category} value={category}>{labelize(category)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger>
                  <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {dashboard.locations.map((location) => (
                    <SelectItem key={location} value={location}>{location}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | StockStatus)}>
                <SelectTrigger>
                  <ShieldAlert className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryStatusOptions.map((status) => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="max-h-[280px] overflow-auto text-xs [&_td]:px-2 [&_td]:py-1.5 [&_th]:h-7 [&_th]:whitespace-nowrap [&_th]:px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[190px]">Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Reorder Level</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead className="text-right">Stock Value</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Last Movement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={15} className="py-8 text-center text-muted-foreground">
                        Loading inventory...
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && filteredInventory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div>
                          <p>{item.item_name}</p>
                          {item.notes && <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-muted-foreground">{item.notes}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={categoryColors[item.category] || 'bg-muted text-muted-foreground border-border'}>
                          {labelize(item.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{item.available_quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{item.reserved_quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{item.min_stock_level.toLocaleString()}</TableCell>
                      <TableCell>{item.unit || '-'}</TableCell>
                      <TableCell>{item.location || '-'}</TableCell>
                      <TableCell>{item.supplier_name || '-'}</TableCell>
                      <TableCell>{item.batch_no || '-'}</TableCell>
                      <TableCell>
                        {item.expiry_date ? (
                          <span className={item.daysUntilExpiry !== null && item.daysUntilExpiry <= 45 ? 'text-warning' : ''}>
                            {formatDate(item.expiry_date)}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(item.stock_value)}</TableCell>
                      <TableCell>{labelize(item.quality_status)}</TableCell>
                      <TableCell>
                        {item.last_movement ? (
                          <div>
                            <p className="text-xs capitalize">{item.last_movement.movement_type}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(item.last_movement.movement_date)}</p>
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && !filteredInventory.length && (
                    <TableRow>
                      <TableCell colSpan={15} className="py-8 text-center text-muted-foreground">
                        No inventory items match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
