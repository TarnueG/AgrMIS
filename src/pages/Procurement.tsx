import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  AreaChart as AreaChartIcon,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  PackagePlus,
  Plus,
  Search,
  ShieldAlert,
  Truck,
  UserPlus,
  Users,
  XCircle,
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
import api from '@/lib/api';

type InventoryItem = {
  id: string;
  item_name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  supplier_id: string | null;
};

type InventoryMovement = {
  id: string;
  inventory_id: string;
  movement_type: string;
  quantity: number;
  source_module: string | null;
  movement_date: string | null;
  notes: string | null;
  reference_id: string | null;
};

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  supplier_type: string | null;
  commodity: string | null;
  notes: string | null;
  deleted_at?: string | null;
};

type ProcurementRecord = {
  id: string;
  request_number: string | null;
  po_number: string | null;
  item_name: string;
  category: string | null;
  unit: string | null;
  supplier: string | null;
  supplier_id: string | null;
  inventory_id: string | null;
  quantity: number | null;
  received_quantity: number | null;
  unit_price: number | null;
  total_cost: number | null;
  status: string | null;
  expected_date: string | null;
  approved_at: string | null;
  received_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string | null;
};

type ProcurementFormData = {
  item_name: string;
  category: string;
  unit: string;
  inventory_id: string;
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
  supplier_type: string;
  commodity: string;
  phone: string;
  email: string;
  address: string;
  country: string;
  notes: string;
};

type ReceiptFormData = {
  received_quantity: number;
};

type ProcurementStatus = 'all' | 'pending' | 'approved' | 'ordered' | 'partially_received' | 'received' | 'rejected' | 'overdue';

const categoryOptions = [
  'supplies',
  'seeds',
  'fertilizer',
  'chemicals',
  'livestock_feed',
  'fish_feed',
  'feed',
  'tools',
  'equipment',
  'spare_parts',
  'packaging',
];

const unitOptions = ['kg', 'bags', 'pcs', 'rolls', 'kits', 'liters', 'canisters', 'crates'];

const statusOptions: { value: ProcurementStatus; label: string }[] = [
  { value: 'all', label: 'All status' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'partially_received', label: 'Partially received' },
  { value: 'received', label: 'Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'overdue', label: 'Overdue' },
];

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

function isPastDate(value: string | null) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function isCurrentMonth(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function getStatusBadge(row: ProcurementRecord) {
  const overdue =
    row.status !== 'received' &&
    row.status !== 'rejected' &&
    row.status !== 'partially_received' &&
    isPastDate(row.expected_date);

  const status = overdue ? 'overdue' : row.status || 'pending';
  const styles: Record<string, string> = {
    pending: 'bg-warning/20 text-warning border-warning/20',
    approved: 'bg-info/20 text-info border-info/20',
    ordered: 'bg-primary/20 text-primary border-primary/20',
    partially_received: 'bg-accent/20 text-accent border-accent/20',
    received: 'bg-success/20 text-success border-success/20',
    rejected: 'bg-destructive/20 text-destructive border-destructive/20',
    overdue: 'bg-destructive/20 text-destructive border-destructive/20',
  };

  return <Badge className={styles[status] || 'bg-muted text-muted-foreground'}>{labelize(status)}</Badge>;
}

function DashboardKpi({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'default',
  onClick,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: typeof Truck;
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'info' | 'success';
  onClick?: () => void;
}) {
  const tones = {
    default: 'bg-card border-border',
    primary: 'bg-primary/10 border-primary/25',
    warning: 'bg-warning/10 border-warning/25',
    danger: 'bg-destructive/10 border-destructive/25',
    info: 'bg-info/10 border-info/25',
    success: 'bg-success/10 border-success/25',
  };

  const iconTones = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/20 text-primary',
    warning: 'bg-warning/20 text-warning',
    danger: 'bg-destructive/20 text-destructive',
    info: 'bg-info/20 text-info',
    success: 'bg-success/20 text-success',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border text-left transition-all hover:border-primary/40 hover:bg-card/80 ${tones[tone]}`}
    >
      <div className="flex min-h-[84px] items-start justify-between gap-2 p-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="hidden text-[11px] leading-4 text-muted-foreground 2xl:block">{detail}</p>
        </div>
        <div className={`rounded-md p-2 ${iconTones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

export default function Procurement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<ProcurementStatus>('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [rejectingRow, setRejectingRow] = useState<ProcurementRecord | null>(null);
  const [receivingRow, setReceivingRow] = useState<ProcurementRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [requestForm, setRequestForm] = useState<ProcurementFormData>({
    item_name: '',
    category: 'supplies',
    unit: 'kg',
    inventory_id: 'none',
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
    supplier_type: 'general',
    commodity: '',
    phone: '',
    email: '',
    address: '',
    country: '',
    notes: '',
  });
  const [receiptForm, setReceiptForm] = useState<ReceiptFormData>({ received_quantity: 0 });

  const { data: procurement = [] } = useQuery({
    queryKey: ['procurement-command-center'],
    queryFn: () => api.get<ProcurementRecord[]>('/procurement/showcase'),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory-for-procurement-command-center'],
    queryFn: () => api.get<InventoryItem[]>('/inventory/showcase-items'),
  });

  const { data: movements = [] } = useQuery({
    queryKey: ['inventory-movements-for-procurement'],
    queryFn: () => api.get<InventoryMovement[]>('/inventory/showcase-movements'),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['procurement-suppliers-directory'],
    queryFn: () => api.get<Supplier[]>('/procurement/suppliers'),
  });

  const inventoryMap = useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory]);
  const inventoryByName = useMemo(
    () => new Map(inventory.map((item) => [item.item_name.toLowerCase(), item])),
    [inventory],
  );
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);

  const procurementRows = useMemo(() => {
    return procurement.map((row) => {
      const inventoryItem =
        (row.inventory_id ? inventoryMap.get(row.inventory_id) : undefined) ||
        inventoryByName.get(row.item_name.toLowerCase());
      const supplier = row.supplier_id ? supplierMap.get(row.supplier_id) : undefined;
      const quantity = Number(row.quantity || 0);
      const receivedQuantity = Number(row.received_quantity || 0);
      const outstandingQuantity = Math.max(quantity - receivedQuantity, 0);
      const unitPrice = Number(row.unit_price || 0);
      const isOverdue =
        row.status !== 'received' &&
        row.status !== 'rejected' &&
        row.status !== 'partially_received' &&
        isPastDate(row.expected_date);

      return {
        ...row,
        quantity,
        receivedQuantity,
        outstandingQuantity,
        unitPrice,
        totalCost: Number(row.total_cost || quantity * unitPrice),
        category: row.category || inventoryItem?.category || 'supplies',
        unit: row.unit || inventoryItem?.unit || 'unit',
        supplierName: supplier?.name || row.supplier || 'Unassigned supplier',
        supplierContact: supplier?.contact_person || 'Not set',
        isOverdue,
      };
    });
  }, [inventoryByName, inventoryMap, procurement, supplierMap]);

  const analytics = useMemo(() => {
    const pendingRequests = procurementRows.filter((row) => row.status === 'pending');
    const approvedPurchases = procurementRows.filter((row) => ['approved', 'ordered'].includes(row.status || ''));
    const pendingReceipts = procurementRows.filter((row) =>
      ['approved', 'ordered', 'partially_received'].includes(row.status || '') && row.outstandingQuantity > 0,
    );
    const receivedThisMonth = procurementRows.filter(
      (row) => row.received_at && isCurrentMonth(row.received_at),
    );
    const openProcurementValue = procurementRows
      .filter((row) => row.status !== 'received' && row.status !== 'rejected')
      .reduce((sum, row) => sum + row.outstandingQuantity * row.unitPrice, 0);
    const overdueDeliveries = procurementRows.filter((row) => row.isOverdue);
    const awaitingApprovalItems = new Set(pendingRequests.map((row) => row.item_name)).size;

    const monthlyMap = new Map<string, { label: string; value: number }>();
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - index);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyMap.set(key, {
        label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date),
        value: 0,
      });
    }
    procurementRows.forEach((row) => {
      const baseDate = row.received_at || row.approved_at || row.created_at;
      if (!baseDate) return;
      const date = new Date(baseDate);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = monthlyMap.get(key);
      if (bucket) bucket.value += row.totalCost;
    });

    const categoryMap = new Map<string, number>();
    procurementRows.forEach((row) => {
      categoryMap.set(labelize(row.category), (categoryMap.get(labelize(row.category)) || 0) + row.totalCost);
    });

    const supplierMetrics = suppliers.map((supplier) => {
      const rows = procurementRows.filter((row) => row.supplier_id === supplier.id || row.supplierName === supplier.name);
      const delivered = rows.filter((row) => row.received_at);
      const onTime = delivered.filter((row) => !row.expected_date || new Date(row.received_at!).getTime() <= new Date(row.expected_date).getTime());
      const reliabilityScore = delivered.length ? Math.round((onTime.length / delivered.length) * 100) : 0;
      const lastDelivery = delivered
        .map((row) => row.received_at)
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] || null;
      const overdueCount = rows.filter((row) => row.isOverdue).length;
      return {
        ...supplier,
        deliveryCount: delivered.length,
        reliabilityScore,
        lastDelivery,
        overdueCount,
        categorySupplied: supplier.commodity || supplier.supplier_type || 'General Supplies',
        statusLabel: reliabilityScore >= 80 ? 'active' : overdueCount > 0 ? 'at_risk' : 'monitor',
      };
    });

    const qtyByCategory = Array.from(
      procurementRows.reduce((map, row) => {
        const key = labelize(row.category);
        const current = map.get(key) || { category: key, expected: 0, received: 0 };
        current.expected += row.quantity;
        current.received += row.receivedQuantity;
        map.set(key, current);
        return map;
      }, new Map<string, { category: string; expected: number; received: number }>()),
    ).map(([, value]) => value);

    return {
      pendingRequests,
      approvedPurchases,
      pendingReceipts,
      receivedThisMonth,
      openProcurementValue,
      overdueDeliveries,
      awaitingApprovalItems,
      monthlyProcurementValue: Array.from(monthlyMap.values()),
      procurementByCategory: Array.from(categoryMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
      supplierMetrics,
      qtyByCategory,
    };
  }, [procurementRows, suppliers]);

  const filteredProcurement = useMemo(() => {
    return procurementRows.filter((row) => {
      const status = row.isOverdue ? 'overdue' : (row.status || 'pending');
      const rowDate = row.expected_date || row.created_at || null;
      const dateValue = rowDate ? new Date(rowDate).getTime() : null;
      const fromValue = dateFrom ? new Date(dateFrom).getTime() : null;
      const toValue = dateTo ? new Date(dateTo).getTime() : null;

      const matchesSearch =
        row.item_name.toLowerCase().includes(search.toLowerCase()) ||
        row.supplierName.toLowerCase().includes(search.toLowerCase()) ||
        (row.request_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (row.po_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (row.category || '').toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || row.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesSupplier = supplierFilter === 'all' || row.supplier_id === supplierFilter;
      const matchesFrom = fromValue == null || dateValue == null || dateValue >= fromValue;
      const matchesTo = toValue == null || dateValue == null || dateValue <= toValue;

      return matchesSearch && matchesCategory && matchesStatus && matchesSupplier && matchesFrom && matchesTo;
    });
  }, [categoryFilter, dateFrom, dateTo, procurementRows, search, statusFilter, supplierFilter]);

  const requestMutation = useMutation({
    mutationFn: (data: ProcurementFormData) =>
      api.post('/procurement/showcase', {
        item_name: data.item_name,
        category: data.category,
        unit: data.unit || null,
        inventory_id: data.inventory_id === 'none' ? null : data.inventory_id,
        supplier_id: data.supplier_id === 'none' ? null : data.supplier_id,
        supplier: data.supplier_id === 'none' ? data.supplier || null : supplierMap.get(data.supplier_id)?.name || null,
        quantity: data.quantity,
        unit_price: data.unit_price,
        expected_date: data.expected_date || null,
        notes: data.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-command-center'] });
      toast({ title: 'Purchase request created' });
      setIsRequestOpen(false);
      setRequestForm({
        item_name: '',
        category: 'supplies',
        unit: 'kg',
        inventory_id: 'none',
        supplier_id: 'none',
        supplier: '',
        quantity: 0,
        unit_price: 0,
        expected_date: '',
        notes: '',
      });
    },
    onError: (error) => {
      toast({ title: 'Error creating request', description: error.message, variant: 'destructive' });
    },
  });

  const addSupplierMutation = useMutation({
    mutationFn: (data: SupplierFormData) =>
      api.post('/procurement/suppliers', {
        name: data.name,
        contactPerson: data.contact_person || null,
        supplierType: data.supplier_type || null,
        commodity: data.commodity || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        country: data.country || null,
        notes: data.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-suppliers-directory'] });
      toast({ title: 'Supplier added' });
      setIsSupplierOpen(false);
      setSupplierForm({
        name: '',
        contact_person: '',
        supplier_type: 'general',
        commodity: '',
        phone: '',
        email: '',
        address: '',
        country: '',
        notes: '',
      });
    },
    onError: (error) => {
      toast({ title: 'Error adding supplier', description: error.message, variant: 'destructive' });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (row: ProcurementRecord) =>
      api.patch(`/procurement/showcase/${row.id}`, {
        status: 'approved',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-command-center'] });
      toast({ title: 'Purchase request approved' });
    },
    onError: (error) => {
      toast({ title: 'Approval failed', description: error.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ row, reason }: { row: ProcurementRecord; reason: string }) =>
      api.patch(`/procurement/showcase/${row.id}`, {
        status: 'rejected',
        rejection_reason: reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-command-center'] });
      toast({ title: 'Purchase request rejected' });
      setRejectingRow(null);
      setRejectionReason('');
    },
    onError: (error) => {
      toast({ title: 'Rejection failed', description: error.message, variant: 'destructive' });
    },
  });

  const receiveMutation = useMutation({
    mutationFn: ({ row, received_quantity }: { row: ProcurementRecord; received_quantity: number }) =>
      api.post(`/procurement/showcase/${row.id}/receive`, { received_quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-command-center'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-for-procurement-command-center'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements-for-procurement'] });
      toast({ title: 'Stock receipt posted to inventory' });
      setReceivingRow(null);
      setReceiptForm({ received_quantity: 0 });
    },
    onError: (error) => {
      toast({ title: 'Receipt failed', description: error.message, variant: 'destructive' });
    },
  });

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setSupplierFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary/15 text-primary border-primary/20">Procurement Command Center</Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {procurementRows.length} procurement records
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Procurement</h1>
              <p className="text-sm text-muted-foreground">
                Purchase requests, approvals, supplier oversight, receiving, and inventory posting in one operational view.
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
                    <Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input value={supplierForm.contact_person} onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Supplier Type</Label>
                      <Input value={supplierForm.supplier_type} onChange={(e) => setSupplierForm({ ...supplierForm, supplier_type: e.target.value })} placeholder="seed, feed, chemical..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Commodity</Label>
                      <Input value={supplierForm.commodity} onChange={(e) => setSupplierForm({ ...supplierForm, commodity: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Input value={supplierForm.country} onChange={(e) => setSupplierForm({ ...supplierForm, country: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full gradient-primary" disabled={addSupplierMutation.isPending}>
                    Add Supplier
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Request
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Purchase Request</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); requestMutation.mutate(requestForm); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Link Inventory Item</Label>
                    <Select
                      value={requestForm.inventory_id}
                      onValueChange={(value) => {
                        const selected = inventory.find((item) => item.id === value);
                        setRequestForm({
                          ...requestForm,
                          inventory_id: value,
                          item_name: selected?.item_name || requestForm.item_name,
                          category: selected?.category || requestForm.category,
                          unit: selected?.unit || requestForm.unit,
                          unit_price: selected?.unit_cost ? Number(selected.unit_cost) : requestForm.unit_price,
                          supplier_id: selected?.supplier_id || requestForm.supplier_id,
                        });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">New or unlinked item</SelectItem>
                        {inventory.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.item_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Item Name</Label>
                    <Input value={requestForm.item_name} onChange={(e) => setRequestForm({ ...requestForm, item_name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={requestForm.category} onValueChange={(value) => setRequestForm({ ...requestForm, category: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {categoryOptions.map((option) => (
                            <SelectItem key={option} value={option}>{labelize(option)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Select value={requestForm.unit} onValueChange={(value) => setRequestForm({ ...requestForm, unit: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {unitOptions.map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Supplier</Label>
                      <Select value={requestForm.supplier_id} onValueChange={(value) => setRequestForm({ ...requestForm, supplier_id: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Use supplier name below</SelectItem>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Manual Supplier Name</Label>
                      <Input
                        value={requestForm.supplier}
                        onChange={(e) => setRequestForm({ ...requestForm, supplier: e.target.value })}
                        disabled={requestForm.supplier_id !== 'none'}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input type="number" min="1" value={requestForm.quantity} onChange={(e) => setRequestForm({ ...requestForm, quantity: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Price</Label>
                      <Input type="number" min="0" step="0.01" value={requestForm.unit_price} onChange={(e) => setRequestForm({ ...requestForm, unit_price: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Delivery</Label>
                    <Input type="date" value={requestForm.expected_date} onChange={(e) => setRequestForm({ ...requestForm, expected_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={requestForm.notes} onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full gradient-primary" disabled={requestMutation.isPending}>
                    Create Request
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
          <DashboardKpi title="Pending Requests" value={analytics.pendingRequests.length} detail="Requests waiting for approval." icon={ClipboardList} tone="warning" onClick={() => setStatusFilter('pending')} />
          <DashboardKpi title="Approved Purchases" value={analytics.approvedPurchases.length} detail="Approved or ordered purchases in flight." icon={CheckCircle2} tone="info" onClick={() => setStatusFilter('approved')} />
          <DashboardKpi title="Pending Receipts" value={analytics.pendingReceipts.length} detail="Approved purchases not fully received." icon={CalendarClock} tone="primary" onClick={() => setStatusFilter('ordered')} />
          <DashboardKpi title="Received This Month" value={analytics.receivedThisMonth.length} detail="Receipts posted during the current month." icon={PackagePlus} tone="success" onClick={() => setStatusFilter('received')} />
          <DashboardKpi title="Open Value" value={formatCurrency(analytics.openProcurementValue)} detail="Outstanding committed procurement value." icon={Banknote} tone="primary" onClick={clearFilters} />
          <DashboardKpi title="Supplier Count" value={suppliers.length} detail="Active suppliers in the directory." icon={Users} tone="info" onClick={clearFilters} />
          <DashboardKpi title="Overdue Deliveries" value={analytics.overdueDeliveries.length} detail="Expected dates passed without full receipt." icon={AlertTriangle} tone="danger" onClick={() => setStatusFilter('overdue')} />
          <DashboardKpi title="Awaiting Approval" value={analytics.awaitingApprovalItems} detail="Distinct items pending purchasing signoff." icon={ShieldAlert} tone="warning" onClick={() => setStatusFilter('pending')} />
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>Procurement Register</CardTitle>
              <p className="text-sm text-muted-foreground">
                Requests, approvals, purchase orders, receipts, rejection history, and inventory-linked procurement records.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search item, supplier, request, PO..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {Array.from(new Set(procurementRows.map((row) => row.category))).map((category) => (
                    <SelectItem key={category || 'uncategorized'} value={category || 'supplies'}>{labelize(category)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ProcurementStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request / PO</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Unit</TableHead>
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
                      <TableCell className="space-y-1">
                        <div className="font-mono text-xs text-white">{row.request_number || `REQ-${row.id.slice(0, 8)}`}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{row.po_number || 'PO pending'}</div>
                      </TableCell>
                      <TableCell className="space-y-1">
                        <div className="font-medium">{row.item_name}</div>
                        {row.rejection_reason && <div className="text-[11px] text-destructive">{row.rejection_reason}</div>}
                      </TableCell>
                      <TableCell>{row.supplierName}</TableCell>
                      <TableCell>{labelize(row.category)}</TableCell>
                      <TableCell className="text-right">
                        <div>{row.quantity.toLocaleString()}</div>
                        {row.receivedQuantity > 0 && (
                          <div className="text-[11px] text-muted-foreground">Received {row.receivedQuantity.toLocaleString()}</div>
                        )}
                      </TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalCost)}</TableCell>
                      <TableCell>{formatDate(row.expected_date)}</TableCell>
                      <TableCell>{formatDate(row.received_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {getStatusBadge(row)}
                          {row.isOverdue && <Badge className="bg-destructive/20 text-destructive border-destructive/20">Late</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {row.status === 'pending' && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => approveMutation.mutate(row)} disabled={approveMutation.isPending}>
                                Approve
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => { setRejectingRow(row); setRejectionReason(row.rejection_reason || ''); }}>
                                Reject
                              </Button>
                            </>
                          )}
                          {['approved', 'ordered', 'partially_received'].includes(row.status || '') && row.outstandingQuantity > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReceivingRow(row);
                                setReceiptForm({ received_quantity: row.outstandingQuantity });
                              }}
                            >
                              Receive Stock
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredProcurement.length && (
                    <TableRow>
                      <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                        No procurement records found for the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Pending Receipts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.pendingReceipts.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.po_number || 'PO pending'}</TableCell>
                        <TableCell className="font-medium">{row.item_name}</TableCell>
                        <TableCell>{row.supplierName}</TableCell>
                        <TableCell className="text-right">{row.outstandingQuantity.toLocaleString()} {row.unit}</TableCell>
                        <TableCell>{formatDate(row.expected_date)}</TableCell>
                        <TableCell>{getStatusBadge(row)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReceivingRow(row);
                              setReceiptForm({ received_quantity: row.outstandingQuantity });
                            }}
                          >
                            <PackagePlus className="mr-2 h-4 w-4" />
                            Receive
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!analytics.pendingReceipts.length && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                          No pending receipts.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Posting Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{movements.filter((movement) => movement.source_module === 'procurement').length} inventory movement rows have been posted from procurement receipts.</p>
              <p>{procurementRows.filter((row) => row.inventory_id).length} procurement records are linked to inventory items.</p>
              <p>{analytics.overdueDeliveries.length} deliveries are currently overdue and require follow-up.</p>
              <p>{procurementRows.filter((row) => row.status === 'rejected').length} requests remain visible in history with rejection reasons.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Supplier Directory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Contact Person</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Category Supplied</TableHead>
                    <TableHead className="text-right">Reliability</TableHead>
                    <TableHead>Last Delivery</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.supplierMetrics.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>{supplier.contact_person || '-'}</TableCell>
                      <TableCell>{supplier.phone || '-'}</TableCell>
                      <TableCell>{supplier.email || '-'}</TableCell>
                      <TableCell>{supplier.categorySupplied}</TableCell>
                      <TableCell className="text-right">{supplier.reliabilityScore}%</TableCell>
                      <TableCell>{formatDate(supplier.lastDelivery)}</TableCell>
                      <TableCell>
                        <Badge className={
                          supplier.statusLabel === 'active'
                            ? 'bg-success/20 text-success border-success/20'
                            : supplier.statusLabel === 'at_risk'
                              ? 'bg-warning/20 text-warning border-warning/20'
                              : 'bg-info/20 text-info border-info/20'
                        }>
                          {labelize(supplier.statusLabel)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSupplierFilter(supplier.id)}>
                          View Records
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!analytics.supplierMetrics.length && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                        No suppliers available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Procurement Value</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={analytics.monthlyProcurementValue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="label" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Area dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.25)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Procurement by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.procurementByCategory.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis type="number" stroke="hsl(220, 10%, 55%)" />
                  <YAxis type="category" dataKey="name" width={120} stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="hsl(var(--info))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Supplier Reliability</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.supplierMetrics.map((supplier) => ({ name: supplier.name.split(' ')[0], score: supplier.reliabilityScore }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="name" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="score" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expected vs Received Quantity</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.qtyByCategory.slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="category" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="expected" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="received" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Dialog open={!!rejectingRow} onOpenChange={(open) => { if (!open) { setRejectingRow(null); setRejectionReason(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Purchase Request</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!rejectingRow) return;
                rejectMutation.mutate({ row: rejectingRow, reason: rejectionReason });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Rejection Reason</Label>
                <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" variant="destructive" disabled={rejectMutation.isPending}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject Request
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!receivingRow} onOpenChange={(open) => { if (!open) { setReceivingRow(null); setReceiptForm({ received_quantity: 0 }); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Receive Stock</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!receivingRow) return;
                receiveMutation.mutate({ row: receivingRow, received_quantity: receiptForm.received_quantity });
              }}
              className="space-y-4"
            >
              <div className="rounded-lg border border-border bg-card/60 p-3 text-sm text-muted-foreground">
                Outstanding: {receivingRow?.outstandingQuantity.toLocaleString()} {receivingRow?.unit}
              </div>
              <div className="space-y-2">
                <Label>Received Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  max={receivingRow?.outstandingQuantity || 1}
                  value={receiptForm.received_quantity}
                  onChange={(e) => setReceiptForm({ received_quantity: Number(e.target.value) })}
                  required
                />
              </div>
              <Button type="submit" className="w-full gradient-primary" disabled={receiveMutation.isPending}>
                <PackagePlus className="mr-2 h-4 w-4" />
                Post Receipt To Inventory
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
