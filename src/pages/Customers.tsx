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
import { Plus, Users, Search, Mail, Phone, Building2, User, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/usePermissions';

type CrmView = 'all' | 'business' | 'individual';

export default function Customers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [crmView, setCrmView] = useState<CrmView | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
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

  const addMutation = useMutation({
    mutationFn: (data: typeof formData) => api.post('/sales/customers', {
      name: data.name,
      customerType: data.customer_type,
      phone: data.phone || undefined,
      email: data.email || undefined,
      address: data.address || undefined,
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sales/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Customer deleted' });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', address: '', customer_type: 'individual', notes: '' });
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

  const displayedCustomers = activeCustomers.filter(c => {
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Customer Relationship Management</h1>
            <p className="text-muted-foreground">Manage your customers and contacts</p>
          </div>
          {canCreate('crm') && (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-black font-medium">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Customer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Customer</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(formData); }} className="space-y-4">
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
                    <Label>Address</Label>
                    <Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="text-white" />
                  </div>
                  <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addMutation.isPending}>
                    Add Customer
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* ── Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* ── CRM Card View Table ────────────────────────────────── */}
        {crmView && !selectedCustomer && (
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
                    <TableHead>Address</TableHead>
                    <TableHead>Date</TableHead>
                    {showActions && <TableHead className="text-center">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedCustomers.map((customer) => (
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
                      <TableCell className="max-w-xs truncate text-sm">{customer.address || '-'}</TableCell>
                      <TableCell className="text-sm">{new Date(customer.created_at).toLocaleDateString()}</TableCell>
                      {showActions && (
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          {canDelete('crm') && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => { if (confirm(`Delete ${customer.name}?`)) deleteMutation.mutate(customer.id); }}
                            >
                              Delete
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {!displayedCustomers.length && (
                    <TableRow>
                      <TableCell colSpan={showActions ? 8 : 7} className="text-center py-8 text-muted-foreground">No customers found</TableCell>
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
                      {showActions && (
                        <TableCell className="text-center">
                          {canDelete('crm') && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => { if (confirm(`Delete ${customer.name}?`)) deleteMutation.mutate(customer.id); }}
                            >
                              Delete
                            </Button>
                          )}
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
