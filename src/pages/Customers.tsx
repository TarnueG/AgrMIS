import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Users, Search, Mail, Phone, Building2, User, ArrowLeft, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/usePermissions';
import { format } from 'date-fns';
import { useConfirm } from '@/contexts/ConfirmContext';

type CrmView = 'all' | 'business' | 'individual' | 'purchased';

function exportToCSV(rows: any[], columns: { key: string; label: string }[], filename: string) {
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(',')
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Customers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const { openConfirm } = useConfirm();
  // Default view = Total Customers (all)
  const [crmView, setCrmView] = useState<CrmView | null>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [expandedPurchasedId, setExpandedPurchasedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    county: '',
    customer_type: 'individual',
    notes: '',
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<any[]>('/sales/customers'),
  });

  const { data: customerOrders } = useQuery({
    queryKey: ['customer-orders', selectedCustomer?.id],
    queryFn: () => api.get<any[]>(`/sales/customers/${selectedCustomer!.id}/orders`),
    enabled: !!selectedCustomer,
  });

  // All marketing orders for the Purchased card
  const { data: allOrders = [] } = useQuery<any[]>({
    queryKey: ['crm-all-orders'],
    queryFn: () => api.get('/marketing/orders'),
  });

  const addMutation = useMutation({
    mutationFn: (data: typeof formData) => api.post('/sales/customers', {
      name: data.name,
      customerType: data.customer_type,
      phone: data.phone || undefined,
      email: data.email || undefined,
      address: data.address || undefined,
      county: data.county || undefined,
      notes: data.notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Customer added successfully' });
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: 'Error adding customer', description: error.message, variant: 'destructive' });
    },
  });

  // Activate/deactivate toggle — backend syncs the linked user account (spec 5.1).
  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/sales/customers/${id}/${active ? 'deactivate' : 'activate'}`, {}),
    onSuccess: (_d, { active }) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: active ? 'Customer deactivated' : 'Customer activated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof formData }) => api.patch(`/sales/customers/${id}`, {
      name: data.name,
      customerType: data.customer_type,
      phone: data.phone || undefined,
      email: data.email || undefined,
      address: data.address || undefined,
      county: data.county || undefined,
      notes: data.notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Customer updated' });
      setIsOpen(false);
      setEditCustomer(null);
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', address: '', county: '', customer_type: 'individual', notes: '' });
  };

  const openEdit = (c: any) => {
    setFormData({ name: c.name ?? '', email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', county: c.county ?? '', customer_type: c.customer_type ?? 'individual', notes: c.notes ?? '' });
    setEditCustomer(c);
    setIsOpen(true);
  };

  const handleCardClick = (v: CrmView) => {
    setCrmView(prev => prev === v ? null : v);
    setSelectedCustomer(null);
    setTypeFilter('all');
    setSearch('');
  };

  const cardClass = (v: CrmView) =>
    `cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${crmView === v ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`;

  const activeCustomers = (customers ?? []).filter(c => c.is_active !== false);

  // Table shows all customers (active + deactivated) so the toggle is reversible; the count cards stay active-only.
  const displayedCustomers = (customers ?? []).filter(c => {
    const typeMatch =
      crmView === 'business' ? c.customer_type === 'business' :
      crmView === 'individual' ? c.customer_type === 'individual' :
      typeFilter !== 'all' ? c.customer_type === typeFilter : true;
    const q = search.toLowerCase();
    const searchMatch = !q || c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
    return typeMatch && searchMatch;
  });

  const totalCount = activeCustomers.length;
  const businessCount = activeCustomers.filter(c => c.customer_type === 'business').length;
  const individualCount = activeCustomers.filter(c => c.customer_type === 'individual').length;

  const showActions = canEdit('crm') || canDelete('crm');

  // Build purchased summary per customer
  const completedOrders = allOrders.filter((o: any) => o.status === 'completed' || o.status === 'delivered');
  const customerOrderMap: Record<string, any[]> = {};
  completedOrders.forEach((o: any) => {
    const cid = o.customer_id ?? o.customerId;
    if (!cid) return;
    if (!customerOrderMap[cid]) customerOrderMap[cid] = [];
    customerOrderMap[cid].push(o);
  });

  const purchasedCustomers = activeCustomers
    .filter(c => customerOrderMap[c.id]?.length > 0)
    .map(c => {
      const orders = customerOrderMap[c.id] ?? [];
      const pendingOrders = allOrders.filter((o: any) => (o.customer_id ?? o.customerId) === c.id && o.status === 'pending');
      return {
        ...c,
        completedOrders: orders,
        pendingCount: pendingOrders.length,
        completedCount: orders.length,
        totalQty: orders.reduce((s: number, o: any) => s + Number(o.quantity ?? 0), 0),
        lastOrderDate: orders.sort((a: any, b: any) => new Date(b.date ?? b.created_at).getTime() - new Date(a.date ?? a.created_at).getTime())[0]?.date ?? null,
      };
    });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Customer Relationship Management</h1>
            <p className="text-muted-foreground">Manage your customers and contacts</p>
          </div>
          <div className="flex gap-2">
            {canCreate('crm') && (
              <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => exportToCSV(activeCustomers.map(c => ({ id: c.display_id ?? `CUST-${c.id.substring(0,6).toUpperCase()}`, name: c.name, email: c.email ?? '-', phone: c.phone ?? '-', type: c.customer_type, address: c.address ?? '-', date: new Date(c.created_at).toLocaleDateString() })), [{ key: 'id', label: 'Customer ID' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'type', label: 'Type' }, { key: 'address', label: 'Address' }, { key: 'date', label: 'Date' }], 'crm_customers.csv')}>
                <Download className="h-4 w-4 mr-1" />Export CSV
              </Button>
            )}
            {(canCreate('crm') || canEdit('crm')) && (
              <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) { setEditCustomer(null); resetForm(); } }}>
                {canCreate('crm') && (
                  <DialogTrigger asChild>
                    <Button className="gradient-primary text-black font-medium">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Customer
                    </Button>
                  </DialogTrigger>
                )}
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); if (editCustomer) editMutation.mutate({ id: editCustomer.id, data: formData }); else addMutation.mutate(formData); }} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Customer Name</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required className="text-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="text-white" />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="text-white" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <select
                          value={formData.customer_type}
                          onChange={(e) => setFormData({ ...formData, customer_type: e.target.value })}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                          <option value="individual">Individual</option>
                          <option value="business">Business</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>County</Label>
                        <Input value={formData.county} onChange={(e) => setFormData({ ...formData, county: e.target.value })} className="text-white" placeholder="e.g. Montserrado" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="text-white" />
                    </div>
                    <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addMutation.isPending || editMutation.isPending}>
                      {editCustomer ? 'Save Changes' : 'Add Customer'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* ── Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className={`bg-primary/10 border-primary/20 ${cardClass('all')}`} onClick={() => handleCardClick('all')}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/20"><Users className="h-6 w-6 text-primary" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Customers</p>
                  <p className="text-2xl font-bold">{totalCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-accent/10 border-accent/20 ${cardClass('business')}`} onClick={() => handleCardClick('business')}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-accent/20"><Building2 className="h-6 w-6 text-accent" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Business</p>
                  <p className="text-2xl font-bold">{businessCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-info/10 border-info/20 ${cardClass('individual')}`} onClick={() => handleCardClick('individual')}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-info/20"><User className="h-6 w-6 text-info" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Individual</p>
                  <p className="text-2xl font-bold">{individualCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-success/10 border-success/20 ${cardClass('purchased')}`} onClick={() => handleCardClick('purchased')}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-success/20"><Users className="h-6 w-6 text-success" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Purchased</p>
                  <p className="text-2xl font-bold">{purchasedCustomers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Customer Orders Drill-down ─────────────────────────── */}
        {selectedCustomer && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => setSelectedCustomer(null)}
                className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div>
                <p className="font-semibold">{selectedCustomer.name} — Orders</p>
                <p className="text-xs text-muted-foreground">{selectedCustomer.display_id}</p>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerOrders?.map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs font-medium">{o.order_number}</TableCell>
                        <TableCell className="text-sm">{new Date(o.order_date ?? o.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge className="bg-primary/20 text-primary text-xs capitalize">{o.status?.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                        <TableCell className="capitalize text-sm">{o.payment_status ?? '-'}</TableCell>
                        <TableCell className="font-medium">${Number(o.total_amount ?? 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {!customerOrders?.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No orders found for this customer</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Purchased Card View ────────────────────────────────── */}
        {crmView === 'purchased' && !selectedCustomer && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Customers with Completed Orders</p>
                <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => exportToCSV(purchasedCustomers.map(c => ({ customer_id: c.display_id ?? `CUST-${c.id.substring(0,6).toUpperCase()}`, name: c.name, completed: c.completedCount, pending: c.pendingCount, total_qty: c.totalQty.toFixed(2), date: c.lastOrderDate ? format(new Date(c.lastOrderDate), 'MMM d, yyyy') : '-' })), [{ key: 'customer_id', label: 'Customer ID' }, { key: 'name', label: 'Customer Name' }, { key: 'completed', label: 'Completed Orders' }, { key: 'pending', label: 'Pending Orders' }, { key: 'total_qty', label: 'Total Quantity' }, { key: 'date', label: 'Date' }], 'crm_purchased.csv')}>
                  <Download className="h-4 w-4 mr-1" />Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Completed Orders</TableHead>
                    <TableHead>Pending Orders</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchasedCustomers.map((c) => (
                    <>
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-accent/30"
                        onClick={() => setExpandedPurchasedId(expandedPurchasedId === c.id ? null : c.id)}
                      >
                        <TableCell>
                          {expandedPurchasedId === c.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{c.display_id ?? `CUST-${c.id.substring(0,6).toUpperCase()}`}</TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{c.completedOrders[0]?.order_id ?? '-'}</TableCell>
                        <TableCell>{c.completedCount}</TableCell>
                        <TableCell>{c.pendingCount}</TableCell>
                        <TableCell>{c.lastOrderDate ? format(new Date(c.lastOrderDate), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>{c.totalQty.toFixed(2)}</TableCell>
                      </TableRow>
                      {expandedPurchasedId === c.id && c.completedOrders.map((o: any) => (
                        <TableRow key={o.id} className="bg-muted/10">
                          <TableCell></TableCell>
                          <TableCell colSpan={2} className="pl-6 text-xs text-muted-foreground">↳ {o.order_id}</TableCell>
                          <TableCell className="text-xs">{o.item_name}</TableCell>
                          <TableCell className="text-xs">{Number(o.quantity).toFixed(2)} {o.quantity_unit}</TableCell>
                          <TableCell className="text-xs">${Number(o.amount).toFixed(2)}</TableCell>
                          <TableCell className="text-xs">{o.date ? format(new Date(o.date), 'MMM d, yyyy') : '-'}</TableCell>
                          <TableCell>
                            <Badge className="bg-success/20 text-success text-xs">Completed</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                  {!purchasedCustomers.length && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No customers with completed orders</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── CRM Card View Table ────────────────────────────────── */}
        {crmView && crmView !== 'purchased' && !selectedCustomer && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap gap-3 items-center justify-between">
                <div className="flex items-center gap-3">
                  {crmView === 'all' && (
                    <select
                      value={typeFilter}
                      onChange={e => setTypeFilter(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    >
                      <option value="all">All Types</option>
                      <option value="business">Business</option>
                      <option value="individual">Individual</option>
                    </select>
                  )}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search customers..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onBlur={() => setSearch('')}
                      className="pl-9 w-52 text-white placeholder:text-white/50"
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{displayedCustomers.length} records</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    {showActions && <TableHead className="text-center">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedCustomers.map((customer) => {
                    const active = customer.is_active !== false;
                    return (
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <TableCell className="font-mono text-xs font-medium">
                        {customer.display_id ?? `CUST-${customer.id.substring(0, 6).toUpperCase()}`}
                      </TableCell>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className="text-sm">{customer.email || '-'}</TableCell>
                      <TableCell className="text-sm">{customer.phone || '-'}</TableCell>
                      <TableCell>
                        <Badge className={customer.customer_type === 'business' ? 'bg-accent/20 text-accent' : 'bg-info/20 text-info'}>
                          {customer.customer_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{customer.county || '-'}</TableCell>
                      <TableCell>
                        <Badge className={active ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>{active ? 'Active' : 'Deactivated'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{new Date(customer.created_at).toLocaleDateString()}</TableCell>
                      {showActions && (
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-center gap-2">
                            {canEdit('crm') && (
                              <Button
                                size="sm"
                                variant="outline"
                                className={active ? 'border border-input bg-background text-white hover:bg-accent' : 'gradient-primary text-black font-medium'}
                                disabled={toggleActive.isPending}
                                onClick={() => openConfirm({ title: active ? 'Deactivate Customer' : 'Activate Customer', message: `${active ? 'Deactivate' : 'Activate'} ${customer.name}? This also ${active ? 'deactivates' : 'reactivates'} their linked user account.`, type: active ? 'warning' : 'info', confirmText: active ? 'Deactivate' : 'Activate', onConfirm: () => toggleActive.mutate({ id: customer.id, active }) })}
                              >
                                {active ? 'Deactivate' : 'Activate'}
                              </Button>
                            )}
                            {canEdit('crm') && (
                              <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => openEdit(customer)}>
                                Edit
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );})}
                  {!displayedCustomers.length && (
                    <TableRow>
                      <TableCell colSpan={showActions ? 9 : 8} className="text-center py-8 text-muted-foreground">No customers found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Default Table (no card selected) ──────────────────── */}
        {!crmView && !selectedCustomer && (
          <Card>
            <CardHeader>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => setSearch('')}
                  className="pl-9 text-white placeholder:text-white/50"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Address</TableHead>
                    {showActions && <TableHead className="text-center">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeCustomers.filter(c => {
                    const q = search.toLowerCase();
                    return !q || c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
                  }).map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {customer.email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-3 w-3" />{customer.email}
                            </div>
                          )}
                          {customer.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-3 w-3" />{customer.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={customer.customer_type === 'business' ? 'bg-accent/20 text-accent' : 'bg-info/20 text-info'}>
                          {customer.customer_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{customer.address || '-'}</TableCell>
                      {showActions && canEdit('crm') && (
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className={customer.is_active !== false ? 'border border-input bg-background text-white hover:bg-accent' : 'gradient-primary text-black font-medium'}
                              disabled={toggleActive.isPending}
                              onClick={() => { const active = customer.is_active !== false; openConfirm({ title: active ? 'Deactivate Customer' : 'Activate Customer', message: `${active ? 'Deactivate' : 'Activate'} ${customer.name}? This also ${active ? 'deactivates' : 'reactivates'} their linked user account.`, type: active ? 'warning' : 'info', confirmText: active ? 'Deactivate' : 'Activate', onConfirm: () => toggleActive.mutate({ id: customer.id, active }) }); }}
                            >
                              {customer.is_active !== false ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button size="sm" variant="outline" className="border border-input bg-background text-white hover:bg-accent" onClick={() => openEdit(customer)}>Edit</Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {!customers?.length && (
                    <TableRow>
                      <TableCell colSpan={showActions ? 5 : 4} className="text-center py-8 text-muted-foreground">No customers found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
