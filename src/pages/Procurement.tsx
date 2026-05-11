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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Truck, Search, Trash2, Package, Inbox, XCircle } from 'lucide-react';
import { format } from 'date-fns';

const PO_STATUSES_MAP = [
  { value: 'draft', label: 'Pending' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

const poStatusColor: Record<string, string> = {
  draft: 'bg-warning/20 text-warning',
  submitted: 'bg-blue-500/20 text-blue-500',
  approved: 'bg-primary/20 text-primary',
  received: 'bg-success/20 text-success',
  partially_received: 'bg-warning/20 text-warning',
  cancelled: 'bg-destructive/20 text-destructive',
};

const getPoLabel = (value: string) => PO_STATUSES_MAP.find(s => s.value === value)?.label ?? value.replace('_', ' ');

type DashView = null | 'total' | 'pending' | 'received' | 'requested' | 'declined';

export default function Procurement() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [poSearch, setPoSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isAddPoOpen, setIsAddPoOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [dashView, setDashView] = useState<DashView>(null);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  const [poForm, setPoForm] = useState({ supplierId: '', totalAmount: 0, expectedDelivery: '', notes: '', status: 'draft', commodity: '', quantity: 0 });
  const [supplierForm, setSupplierForm] = useState({ name: '', supplierType: '', phone: '', email: '', address: '', paymentMethod: '', accountNumber: '', commodity: '' });

  const { data: purchaseOrders = [] } = useQuery<any[]>({
    queryKey: ['purchase-orders'],
    queryFn: () => api.get('/procurement/purchase-orders'),
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/procurement/suppliers'),
  });

  const { data: deptRequests = [] } = useQuery<any[]>({
    queryKey: ['department-requests'],
    queryFn: () => api.get('/procurement/department-requests'),
  });

  const addPO = useMutation({
    mutationFn: (data: typeof poForm) => api.post('/procurement/purchase-orders', {
      supplierId: data.supplierId, totalAmount: data.totalAmount,
      expectedDelivery: data.expectedDelivery || undefined,
      notes: data.notes || undefined,
      status: data.status,
      commodity: data.commodity || undefined,
      quantity: data.quantity > 0 ? data.quantity : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast({ title: 'Purchase order created' });
      setIsAddPoOpen(false);
      setPoForm({ supplierId: '', totalAmount: 0, expectedDelivery: '', notes: '', status: 'draft', commodity: '', quantity: 0 });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updatePOStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/procurement/purchase-orders/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast({ title: 'Status updated' }); },
  });

  const deletePO = useMutation({
    mutationFn: (id: string) => api.delete(`/procurement/purchase-orders/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast({ title: 'Purchase order cancelled' }); },
  });

  const addSupplier = useMutation({
    mutationFn: (data: typeof supplierForm) => api.post('/procurement/suppliers', {
      name: data.name, supplierType: data.supplierType || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined, address: data.address || undefined,
      paymentMethod: (data.paymentMethod as 'bank' | 'mobile_money') || undefined,
      accountNumber: data.accountNumber || undefined,
      commodity: data.commodity || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: 'Supplier added' });
      setIsAddSupplierOpen(false);
      setSupplierForm({ name: '', supplierType: '', phone: '', email: '', address: '', paymentMethod: '', accountNumber: '', commodity: '' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteSupplier = useMutation({
    mutationFn: (id: string) => api.delete(`/procurement/suppliers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast({ title: 'Supplier removed' }); },
  });

  const acceptRequest = useMutation({
    mutationFn: ({ id, itemType }: { id: string; itemType: string }) =>
      api.patch(`/procurement/department-requests/${id}/accept`, { itemType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['department-requests'] });
      qc.invalidateQueries({ queryKey: ['equipment-requests'] });
      qc.invalidateQueries({ queryKey: ['parcel-requests'] });
      qc.invalidateQueries({ queryKey: ['land-parcels'] });
      toast({ title: 'Request accepted' });
      setIsAddPoOpen(true);
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const declineRequest = useMutation({
    mutationFn: ({ id, itemType }: { id: string; itemType: string }) =>
      api.patch(`/procurement/department-requests/${id}/decline`, { itemType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['department-requests'] });
      qc.invalidateQueries({ queryKey: ['equipment-requests'] });
      qc.invalidateQueries({ queryKey: ['parcel-requests'] });
      toast({ title: 'Request declined' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const pendingRequests = deptRequests.filter((r: any) => r.status === 'pending');
  const declinedRequests = deptRequests.filter((r: any) => r.status === 'disapproved');

  const pendingPOs = purchaseOrders.filter(p => p.status === 'draft' || p.status === 'submitted');
  const receivedPOs = purchaseOrders.filter(p => p.status === 'received');
  const pending = pendingPOs.length;
  const received = receivedPOs.length;

  const filteredPOs = purchaseOrders.filter(p =>
    p.po_number?.toLowerCase().includes(poSearch.toLowerCase()) ||
    p.suppliers?.name?.toLowerCase().includes(poSearch.toLowerCase())
  );

  const filteredReceivedPOs = receivedPOs.filter(p =>
    p.po_number?.toLowerCase().includes(poSearch.toLowerCase()) ||
    p.suppliers?.name?.toLowerCase().includes(poSearch.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const departments = [...new Set(deptRequests.map((r: any) => r.department))];

  function getRequestListForView(view: DashView) {
    let list = view === 'declined' ? declinedRequests : pendingRequests;
    if (deptFilter) list = list.filter((r: any) => r.department === deptFilter);
    return list;
  }

  const cardClass = (view: DashView) =>
    `cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${dashView === view ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`;

  const showTabs = dashView === null || dashView === 'total';

  const newPODialog = (
    <Dialog open={isAddPoOpen} onOpenChange={setIsAddPoOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); addPO.mutate(poForm); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Supplier</Label>
            <select
              value={poForm.supplierId}
              onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Select supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Total Amount ($)</Label>
              <Input type="number" step="0.01" value={poForm.totalAmount} onChange={(e) => setPoForm({ ...poForm, totalAmount: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Expected Delivery</Label>
              <Input type="date" value={poForm.expectedDelivery} onChange={(e) => setPoForm({ ...poForm, expectedDelivery: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Commodity</Label>
              <select
                value={poForm.commodity}
                onChange={(e) => setPoForm({ ...poForm, commodity: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Select commodity...</option>
                <option value="Pesticide and Chemicals">Pesticide and Chemicals</option>
                <option value="Fertilizer">Fertilizer</option>
                <option value="Livestock Feed">Livestock Feed</option>
                <option value="Aquaculture Feeds">Aquaculture Feeds</option>
                <option value="Vehicle">Vehicle</option>
                <option value="Machines">Machines</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min="0" step="0.01" value={poForm.quantity} onChange={(e) => setPoForm({ ...poForm, quantity: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              value={poForm.status}
              onChange={(e) => setPoForm({ ...poForm, status: e.target.value })}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {PO_STATUSES_MAP.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} />
          </div>
          <Button type="submit" className="w-full gradient-primary" disabled={addPO.isPending || !poForm.supplierId}>
            Create Purchase Order
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Procurement</h1>
            <p className="text-muted-foreground">Supply chain and demand forecast</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className={`bg-primary/10 border-primary/20 ${cardClass('total')}`} onClick={() => setDashView(dashView === 'total' ? null : 'total')}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20"><Package className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total POs</p>
                <p className="text-xl font-bold">{purchaseOrders.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-warning/10 border-warning/20 ${cardClass('pending')}`} onClick={() => setDashView(dashView === 'pending' ? null : 'pending')}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-warning/20"><Truck className="h-5 w-5 text-warning" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Orders</p>
                <p className="text-xl font-bold">{pending}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-success/10 border-success/20 ${cardClass('received')}`} onClick={() => setDashView(dashView === 'received' ? null : 'received')}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-success/20"><Package className="h-5 w-5 text-success" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Received Orders</p>
                <p className="text-xl font-bold">{received}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-blue-500/10 border-blue-500/20 ${cardClass('requested')}`} onClick={() => { setDashView(dashView === 'requested' ? null : 'requested'); setDeptFilter(null); }}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/20"><Inbox className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Requested Orders</p>
                <p className="text-xl font-bold">{pendingRequests.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-destructive/10 border-destructive/20 ${cardClass('declined')}`} onClick={() => { setDashView(dashView === 'declined' ? null : 'declined'); setDeptFilter(null); }}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-destructive/20"><XCircle className="h-5 w-5 text-destructive" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Declined Orders</p>
                <p className="text-xl font-bold">{declinedRequests.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Department Requests Panel */}
        {(dashView === 'requested' || dashView === 'declined') && (
          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground">Filter by department:</span>
                <Button size="sm" variant={deptFilter === null ? 'default' : 'outline'} onClick={() => setDeptFilter(null)}>All</Button>
                {departments.map(d => (
                  <Button key={d as string} size="sm" variant={deptFilter === d ? 'default' : 'outline'} onClick={() => setDeptFilter(d as string)}>
                    {d as string}
                  </Button>
                ))}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>Requested Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  {dashView === 'requested' && <TableHead>Action</TableHead>}
                  <TableHead className="text-right">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getRequestListForView(dashView).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <button
                        className="text-primary underline hover:no-underline text-sm font-medium"
                        onClick={() => setDeptFilter(deptFilter === r.department ? null : r.department)}
                      >
                        {r.department}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="capitalize">{r.item_type}</TableCell>
                    <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell>
                      <Badge className={r.status === 'pending' ? 'bg-warning/20 text-warning' : r.status === 'approved' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    {dashView === 'requested' && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="gradient-primary text-black"
                            onClick={() => { if (confirm('Accept this request?')) acceptRequest.mutate({ id: r.id, itemType: r.item_type }); }}
                            disabled={acceptRequest.isPending}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => { if (confirm('Decline this request?')) declineRequest.mutate({ id: r.id, itemType: r.item_type }); }}
                            disabled={declineRequest.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" disabled={r.status !== 'pending'}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!getRequestListForView(dashView).length && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No requests found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Pending Orders View */}
        {dashView === 'pending' && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier Name</TableHead>
                  <TableHead>Commodity</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Expected Delivery</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{po.suppliers?.name || '-'}</TableCell>
                    <TableCell>{po.commodity || '-'}</TableCell>
                    <TableCell>{format(new Date(po.order_date ?? po.created_at), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{po.expected_delivery ? format(new Date(po.expected_delivery), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell>{po.quantity != null ? Number(po.quantity).toFixed(2) : '-'}</TableCell>
                    <TableCell>${Number(po.total_amount).toFixed(2)}</TableCell>
                    <TableCell>
                      <select
                        value={po.status}
                        onChange={(e) => updatePOStatus.mutate({ id: po.id, status: e.target.value })}
                        className={`h-8 rounded border border-input bg-background px-2 text-sm ${poStatusColor[po.status] ?? ''}`}
                      >
                        {PO_STATUSES_MAP.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deletePO.mutate(po.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!pendingPOs.length && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No pending orders found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Received Orders View */}
        {dashView === 'received' && (
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search received orders..."
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                onBlur={() => setPoSearch('')}
                className="pl-9 text-white placeholder:text-white/50"
              />
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Commodity</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Expected Delivery</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReceivedPOs.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium text-white">{po.po_number}</TableCell>
                      <TableCell className="text-white">{po.suppliers?.name || '-'}</TableCell>
                      <TableCell className="text-white">{po.commodity || '-'}</TableCell>
                      <TableCell className="text-white">{format(new Date(po.order_date ?? po.created_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-white">{po.expected_delivery ? format(new Date(po.expected_delivery), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="text-white">{po.quantity != null ? Number(po.quantity).toFixed(2) : '-'}</TableCell>
                      <TableCell className="text-white">${Number(po.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={poStatusColor[po.status]}>{getPoLabel(po.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => deletePO.mutate(po.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredReceivedPOs.length && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No received orders found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        {/* Normal Tabs View — shown for Total or no card selected */}
        {showTabs && (
          <Tabs defaultValue="orders">
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
              <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="space-y-4 mt-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search orders..." value={poSearch} onChange={(e) => setPoSearch(e.target.value)} onBlur={() => setPoSearch('')} className="pl-9 text-white placeholder:text-white/50" />
                </div>
                <Button className="gradient-primary text-black" onClick={() => setIsAddPoOpen(true)}><Plus className="h-4 w-4 mr-2" />New PO</Button>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Commodity</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Expected Delivery</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPOs.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.po_number}</TableCell>
                        <TableCell>{po.suppliers?.name || '-'}</TableCell>
                        <TableCell>{po.commodity || '-'}</TableCell>
                        <TableCell>{format(new Date(po.order_date ?? po.created_at), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{po.expected_delivery ? format(new Date(po.expected_delivery), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>{po.quantity != null ? Number(po.quantity).toFixed(2) : '-'}</TableCell>
                        <TableCell>${Number(po.total_amount).toFixed(2)}</TableCell>
                        <TableCell>
                          <select
                            value={po.status}
                            onChange={(e) => updatePOStatus.mutate({ id: po.id, status: e.target.value })}
                            className={`h-8 rounded border border-input bg-background px-2 text-sm ${poStatusColor[po.status] ?? ''}`}
                          >
                            {PO_STATUSES_MAP.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => deletePO.mutate(po.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filteredPOs.length && (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No purchase orders found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="suppliers" className="space-y-4 mt-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search suppliers..." value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} onBlur={() => setSupplierSearch('')} className="pl-9 text-white placeholder:text-white/50" />
                </div>
                <Dialog open={isAddSupplierOpen} onOpenChange={setIsAddSupplierOpen}>
                  <Button className="gradient-primary text-black" onClick={() => setIsAddSupplierOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Supplier</Button>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
                    <form onSubmit={(e) => { e.preventDefault(); addSupplier.mutate(supplierForm); }} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Supplier Full Name</Label>
                        <Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Payment Method</Label>
                          <select
                            value={supplierForm.paymentMethod}
                            onChange={(e) => setSupplierForm({ ...supplierForm, paymentMethod: e.target.value })}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                          >
                            <option value="">Select method...</option>
                            <option value="bank">Bank</option>
                            <option value="mobile_money">Mobile Money</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>Account Number</Label>
                          <Input value={supplierForm.accountNumber} onChange={(e) => setSupplierForm({ ...supplierForm, accountNumber: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Commodity</Label>
                        <select
                          value={supplierForm.commodity}
                          onChange={(e) => setSupplierForm({ ...supplierForm, commodity: e.target.value })}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                          <option value="">Select commodity...</option>
                          <option value="Pesticide and Chemicals">Pesticide and Chemicals</option>
                          <option value="Fertilizer">Fertilizer</option>
                          <option value="Livestock Feed">Livestock Feed</option>
                          <option value="Aquaculture Feeds">Aquaculture Feeds</option>
                          <option value="Vehicle">Vehicle</option>
                          <option value="Machines">Machines</option>
                        </select>
                      </div>
                      <Button type="submit" className="w-full gradient-primary" disabled={addSupplier.isPending}>Add Supplier</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Account Number</TableHead>
                      <TableHead>Commodity</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.phone || '-'}</TableCell>
                        <TableCell>{s.email || '-'}</TableCell>
                        <TableCell className="capitalize">{s.payment_method?.replace('_', ' ') || '-'}</TableCell>
                        <TableCell>{s.account_number || '-'}</TableCell>
                        <TableCell>{s.commodity || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => deleteSupplier.mutate(s.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filteredSuppliers.length && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No suppliers found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {newPODialog}
    </DashboardLayout>
  );
}
