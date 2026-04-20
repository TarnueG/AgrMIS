import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, PackagePlus, Plus, Search, Truck, UserPlus } from 'lucide-react';

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

type InventoryItem = {
  id: string;
  item_name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  supplier_id: string | null;
};

type Supplier = {
  id: string;
  name: string;
};

type ProcurementRow = {
  id: string;
  item_name: string;
  supplier: string | null;
  supplier_id: string | null;
  inventory_id: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_cost: number | null;
  status: string | null;
  expected_date: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string | null;
};

type ProcurementFormData = {
  item_name: string;
  inventory_id: string;
  category: string;
  supplier_id: string;
  supplier: string;
  quantity: number;
  unit_price: number;
  expected_date: string;
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

const procurementStatuses = ['pending', 'approved', 'ordered', 'received'];

function labelize(value: string | null | undefined) {
  if (!value) return 'Unassigned';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function getStatusBadge(status: string | null) {
  const styles: Record<string, string> = {
    pending: 'bg-warning/20 text-warning border-warning/20',
    approved: 'bg-info/20 text-info border-info/20',
    ordered: 'bg-primary/20 text-primary border-primary/20',
    received: 'bg-success/20 text-success border-success/20',
  };

  return <Badge className={styles[status || 'pending'] || 'bg-muted text-muted-foreground'}>{labelize(status || 'pending')}</Badge>;
}

export default function Procurement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isProcurementOpen, setIsProcurementOpen] = useState(false);
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [formData, setFormData] = useState<ProcurementFormData>({
    item_name: '',
    inventory_id: 'none',
    category: 'supplies',
    supplier_id: 'none',
    supplier: '',
    quantity: 0,
    unit_price: 0,
    expected_date: '',
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

  const { data: procurement } = useQuery({
    queryKey: ['procurement'],
    queryFn: async () => {
      const { data, error } = await supabase.from('procurement').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as ProcurementRow[];
    },
  });

  const { data: inventory } = useQuery({
    queryKey: ['inventory-for-procurement'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory').select('id, item_name, category, quantity, unit, unit_cost, supplier_id').order('item_name');
      if (error) throw error;
      return data as InventoryItem[];
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

  const supplierMap = useMemo(() => new Map((suppliers || []).map((supplier) => [supplier.id, supplier.name])), [suppliers]);

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
      setSupplierForm({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
    },
    onError: (error) => {
      toast({ title: 'Error adding supplier', description: error.message, variant: 'destructive' });
    },
  });

  const addProcurementMutation = useMutation({
    mutationFn: async (data: ProcurementFormData) => {
      const selectedInventory = inventory?.find((item) => item.id === data.inventory_id);
      const selectedSupplierName = data.supplier_id === 'none' ? data.supplier : supplierMap.get(data.supplier_id) || data.supplier;
      const itemName = selectedInventory?.item_name || data.item_name;
      const totalCost = data.quantity * data.unit_price;

      const { error } = await supabase.from('procurement').insert([
        {
          item_name: itemName,
          inventory_id: data.inventory_id === 'none' ? null : data.inventory_id,
          supplier_id: data.supplier_id === 'none' ? null : data.supplier_id,
          supplier: selectedSupplierName || null,
          quantity: data.quantity,
          unit_price: data.unit_price,
          total_cost: totalCost,
          status: 'ordered',
          expected_date: data.expected_date || null,
          notes: data.notes || null,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
      toast({ title: 'Procurement order added' });
      setIsProcurementOpen(false);
      setFormData({
        item_name: '',
        inventory_id: 'none',
        category: 'supplies',
        supplier_id: 'none',
        supplier: '',
        quantity: 0,
        unit_price: 0,
        expected_date: '',
        notes: '',
      });
    },
    onError: (error) => {
      toast({ title: 'Error adding procurement order', description: error.message, variant: 'destructive' });
    },
  });

  const receiveProcurementMutation = useMutation({
    mutationFn: async (row: ProcurementRow) => {
      if (row.status === 'received') throw new Error('This procurement record has already been received.');
      const receiptQuantity = Number(row.quantity || 0);
      if (receiptQuantity <= 0) throw new Error('Receipt quantity must be greater than zero.');

      let inventoryItem = inventory?.find((item) => item.id === row.inventory_id);

      if (!inventoryItem) {
        inventoryItem = inventory?.find((item) => item.item_name.toLowerCase() === row.item_name.toLowerCase());
      }

      if (!inventoryItem) {
        const { data: createdInventory, error: createError } = await supabase
          .from('inventory')
          .insert([
            {
              item_name: row.item_name,
              category: 'supplies',
              quantity: 0,
              unit_cost: Number(row.unit_price || 0),
              supplier_id: row.supplier_id,
              notes: 'Created automatically from procurement receipt.',
            },
          ])
          .select('id, item_name, category, quantity, unit, unit_cost, supplier_id')
          .single();
        if (createError) throw createError;
        inventoryItem = createdInventory as InventoryItem;
      }

      const nextQuantity = Number(inventoryItem.quantity || 0) + receiptQuantity;
      const { error: inventoryError } = await supabase
        .from('inventory')
        .update({
          quantity: nextQuantity,
          unit_cost: Number(row.unit_price || inventoryItem.unit_cost || 0),
          supplier_id: row.supplier_id || inventoryItem.supplier_id,
        })
        .eq('id', inventoryItem.id);
      if (inventoryError) throw inventoryError;

      const receivedAt = new Date().toISOString();
      const { error: movementError } = await supabase.from('inventory_movements').insert([
        {
          inventory_id: inventoryItem.id,
          movement_type: 'received',
          quantity: receiptQuantity,
          unit_cost: Number(row.unit_price || 0),
          source_module: 'procurement',
          reference_id: row.id,
          movement_date: receivedAt,
          notes: `Procurement receipt for ${row.item_name}`,
        },
      ]);
      if (movementError) throw movementError;

      const { error: procurementError } = await supabase
        .from('procurement')
        .update({
          status: 'received',
          received_at: receivedAt,
          inventory_id: inventoryItem.id,
        })
        .eq('id', row.id);
      if (procurementError) throw procurementError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-for-procurement'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements-dashboard'] });
      toast({ title: 'Procurement receipt posted to inventory' });
    },
    onError: (error) => {
      toast({ title: 'Error receiving procurement', description: error.message, variant: 'destructive' });
    },
  });

  const filteredProcurement = (procurement || []).filter((row) => {
    const supplierName = row.supplier_id ? supplierMap.get(row.supplier_id) : row.supplier;
    return (
      row.item_name.toLowerCase().includes(search.toLowerCase()) ||
      (supplierName || '').toLowerCase().includes(search.toLowerCase()) ||
      (row.status || '').toLowerCase().includes(search.toLowerCase())
    );
  });

  const pendingCount = (procurement || []).filter((row) => row.status !== 'received').length;
  const receivedCount = (procurement || []).filter((row) => row.status === 'received').length;
  const pendingValue = (procurement || [])
    .filter((row) => row.status !== 'received')
    .reduce((sum, row) => sum + Number(row.total_cost || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Procurement</h1>
            <p className="text-muted-foreground">Purchase orders, supplier receipts, and inventory posting.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Dialog open={isSupplierOpen} onOpenChange={setIsSupplierOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
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
                    <Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input value={supplierForm.contact_person} onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full gradient-primary" disabled={addSupplierMutation.isPending}>Add Supplier</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isProcurementOpen} onOpenChange={setIsProcurementOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Purchase
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Procurement Order</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); addProcurementMutation.mutate(formData); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Link Inventory Item</Label>
                    <Select
                      value={formData.inventory_id}
                      onValueChange={(v) => {
                        const selected = inventory?.find((item) => item.id === v);
                        setFormData({ ...formData, inventory_id: v, item_name: selected?.item_name || formData.item_name });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Create or match by item name</SelectItem>
                        {inventory?.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.item_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Item Name</Label>
                    <Input
                      value={formData.item_name}
                      onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                      disabled={formData.inventory_id !== 'none'}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Supplier</Label>
                      <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Use supplier name below</SelectItem>
                          {suppliers?.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Supplier Name</Label>
                      <Input
                        value={formData.supplier}
                        onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                        disabled={formData.supplier_id !== 'none'}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input type="number" min="1" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Price</Label>
                      <Input type="number" min="0" step="0.01" value={formData.unit_price} onChange={(e) => setFormData({ ...formData, unit_price: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Date</Label>
                    <Input type="date" value={formData.expected_date} onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full gradient-primary" disabled={addProcurementMutation.isPending}>Add Purchase</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="bg-warning/10 border-warning/20">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Pending Receipts</p>
                <p className="text-3xl font-bold">{pendingCount}</p>
              </div>
              <CalendarClock className="h-6 w-6 text-warning" />
            </CardContent>
          </Card>
          <Card className="bg-success/10 border-success/20">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Received Orders</p>
                <p className="text-3xl font-bold">{receivedCount}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-success" />
            </CardContent>
          </Card>
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Open Procurement Value</p>
                <p className="text-3xl font-bold">{formatCurrency(pendingValue)}</p>
              </div>
              <Truck className="h-6 w-6 text-primary" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>Procurement Receipts</CardTitle>
              <p className="text-sm text-muted-foreground">Receiving a purchase posts quantity into inventory and creates a movement ledger row.</p>
            </div>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search item, supplier, or status..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProcurement.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.item_name}</TableCell>
                      <TableCell>{row.supplier_id ? supplierMap.get(row.supplier_id) || row.supplier || '-' : row.supplier || '-'}</TableCell>
                      <TableCell className="text-right">{Number(row.quantity || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(row.unit_price || 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(row.total_cost || 0))}</TableCell>
                      <TableCell>{formatDate(row.expected_date)}</TableCell>
                      <TableCell>{formatDate(row.received_at)}</TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={row.status === 'received' || receiveProcurementMutation.isPending}
                          onClick={() => receiveProcurementMutation.mutate(row)}
                        >
                          <PackagePlus className="mr-2 h-4 w-4" />
                          Receive
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredProcurement.length && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                        No procurement records found.
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
