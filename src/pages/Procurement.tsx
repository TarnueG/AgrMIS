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
import { Plus, Truck, Search, Trash2, Package, Inbox, XCircle, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Reduced status set per spec: Pending (draft), Submitted, Paid, Cancel (cancelled)
const PO_STATUSES_MAP = [
  { value: 'draft', label: 'Pending' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancel' },
];

const poStatusColor: Record<string, string> = {
  draft: 'bg-warning/20 text-warning',
  submitted: 'bg-blue-500/20 text-blue-500',
  paid: 'bg-success/20 text-success',
  cancelled: 'bg-destructive/20 text-destructive',
};

const getPoLabel = (value: string) => PO_STATUSES_MAP.find(s => s.value === value)?.label ?? value.replace('_', ' ');

type DashView = null | 'total' | 'pending' | 'paid_orders' | 'pending_payment' | 'requested' | 'declined';

export default function Procurement() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canCreate, canEdit, canDelete, canViewCard } = usePermissions();
  const { openConfirm } = useConfirm();

  const [poSearch, setPoSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isAddPoOpen, setIsAddPoOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [dashView, setDashView] = useState<DashView>(null);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  // Track whether a PO creation was triggered by an Accept and then abandoned/failed
  const [pendingAcceptRequestId, setPendingAcceptRequestId] = useState<string | null>(null);

  const [poForm, setPoForm] = useState({ supplierId: '', totalAmount: '' as string | number, expectedDelivery: '', notes: '', status: 'draft', commodity: '', quantity: '' as string | number });
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

  // Suppliers filtered by selected commodity for linked selection
  const suppliersForCommodity = poForm.commodity
    ? suppliers.filter((s: any) => !s.commodity || s.commodity === poForm.commodity)
    : suppliers;

  const addPO = useMutation({
    mutationFn: (data: typeof poForm) => {
      const totalAmount = Number(data.totalAmount);
      const quantity = Number(data.quantity);
      if (!data.supplierId || !data.commodity || !totalAmount || !quantity || !data.expectedDelivery) {
        throw new Error('All fields except Notes are required');
      }
      return api.post('/procurement/purchase-orders', {
        supplierId: data.supplierId,
        totalAmount,
        expectedDelivery: data.expectedDelivery,
        notes: data.notes || undefined,
        status: data.status,
        commodity: data.commodity,
        quantity,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast({ title: 'Purchase order created' });
      setIsAddPoOpen(false);
      setPendingAcceptRequestId(null);
      setPoForm({ supplierId: '', totalAmount: '', expectedDelivery: '', notes: '', status: 'draft', commodity: '', quantity: '' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updatePOStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/procurement/purchase-orders/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['finance-purchase-orders'] });
      toast({ title: 'Status updated' });
    },
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
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['department-requests'] });
      qc.invalidateQueries({ queryKey: ['equipment-requests'] });
      qc.invalidateQueries({ queryKey: ['parcel-requests'] });
      qc.invalidateQueries({ queryKey: ['land-parcels'] });
      toast({ title: 'Request accepted — create a Purchase Order' });
      setPendingAcceptRequestId(id);
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

  const pendingPOs = purchaseOrders.filter(p => p.status === 'draft');
  const paidPOs = purchaseOrders.filter(p => p.payment_status === 'paid');
  const pendingPaymentPOs = purchaseOrders.filter(p => p.status === 'submitted' && p.payment_status !== 'paid');

  const filteredPOs = purchaseOrders.filter(p =>
    p.status !== 'cancelled' && (
      p.po_number?.toLowerCase().includes(poSearch.toLowerCase()) ||
      p.suppliers?.name?.toLowerCase().includes(poSearch.toLowerCase())
    )
  );

  const filteredSuppliers = suppliers.filter((s: any) =>
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

  // Close PO dialog handler — if abandoned after Accept, mark pendingAcceptRequestId
  function handlePoDialogClose(open: boolean) {
    if (!open) {
      // If dialog was opened via Accept and PO creation didn't succeed, keep pendingAcceptRequestId
      setIsAddPoOpen(false);
    } else {
      setIsAddPoOpen(true);
    }
  }

  const newPODialog = canCreate('procurement') ? (
    <Dialog open={isAddPoOpen} onOpenChange={handlePoDialogClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); addPO.mutate(poForm); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Commodity <span className="text-destructive">*</span></Label>
            <Input
              value={poForm.commodity}
              onChange={(e) => setPoForm({ ...poForm, commodity: e.target.value, supplierId: '' })}
              placeholder="Enter commodity name..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Supplier <span className="text-destructive">*</span></Label>
            <select
              value={poForm.supplierId}
              onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}
              required
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Select supplier...</option>
              {[...suppliersForCommodity].sort((a: any, b: any) => {
                const ac = (a.commodity ?? '').toLowerCase();
                const bc = (b.commodity ?? '').toLowerCase();
                if (ac !== bc) return ac.localeCompare(bc);
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
              }).map((s: any) => (
                <option key={s.id} value={s.id}>{s.commodity ? `${s.commodity} — ` : ''}{s.name}</option>
              ))}
            </select>
            {poForm.commodity && suppliersForCommodity.length === 0 && (
              <p className="text-xs text-warning">No suppliers for this commodity. Add a supplier first.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Total Amount ($) <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" min="0.01" value={poForm.totalAmount} onChange={(e) => setPoForm({ ...poForm, totalAmount: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Quantity <span className="text-destructive">*</span></Label>
              <Input type="number" min="0.01" step="0.01" value={poForm.quantity} onChange={(e) => setPoForm({ ...poForm, quantity: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Expected Delivery <span className="text-destructive">*</span></Label>
            <Input type="date" value={poForm.expectedDelivery} onChange={(e) => setPoForm({ ...poForm, expectedDelivery: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              value={poForm.status}
              onChange={(e) => setPoForm({ ...poForm, status: e.target.value })}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {PO_STATUSES_MAP.filter(s => s.value !== 'cancelled' && s.value !== 'paid').map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} />
          </div>
          <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addPO.isPending}>
            Create Purchase Order
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Procurement</h1>
            <p className="text-muted-foreground">Supply chain and demand forecast</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {canViewCard('procurement.total') && (
          <Card className={`bg-primary/10 border-primary/20 ${cardClass('total')}`} onClick={() => setDashView(dashView === 'total' ? null : 'total')}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20"><Package className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total POs</p>
                <p className="text-xl font-bold">{purchaseOrders.filter(p => p.status !== 'cancelled').length}</p>
              </div>
            </CardContent>
          </Card>
          )}
          {canViewCard('procurement.pending') && (
          <Card className={`bg-warning/10 border-warning/20 ${cardClass('pending')}`} onClick={() => setDashView(dashView === 'pending' ? null : 'pending')}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-warning/20"><Truck className="h-5 w-5 text-warning" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Orders</p>
                <p className="text-xl font-bold">{pendingPOs.length}</p>
              </div>
            </CardContent>
          </Card>
          )}
          {canViewCard('procurement.pending_payment') && (
          <Card className={`bg-blue-500/10 border-blue-500/20 ${cardClass('pending_payment')}`} onClick={() => setDashView(dashView === 'pending_payment' ? null : 'pending_payment')}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/20"><CreditCard className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Payment</p>
                <p className="text-xl font-bold">{pendingPaymentPOs.length}</p>
              </div>
            </CardContent>
          </Card>
          )}
          {canViewCard('procurement.received') && (
          <Card className={`bg-success/10 border-success/20 ${cardClass('paid_orders')}`} onClick={() => setDashView(dashView === 'paid_orders' ? null : 'paid_orders')}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-success/20"><Package className="h-5 w-5 text-success" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Paid Orders</p>
                <p className="text-xl font-bold">{paidPOs.length}</p>
              </div>
            </CardContent>
          </Card>
          )}
          {canViewCard('procurement.requested') && (
          <Card className={`bg-blue-500/10 border-blue-500/20 ${cardClass('requested')}`} onClick={() => { setDashView(dashView === 'requested' ? null : 'requested'); setDeptFilter(null); }}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/20"><Inbox className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Requested Orders</p>
                <p className="text-xl font-bold">{pendingRequests.length}</p>
              </div>
            </CardContent>
          </Card>
          )}
          {canViewCard('procurement.declined') && (
          <Card className={`bg-destructive/10 border-destructive/20 ${cardClass('declined')}`} onClick={() => { setDashView(dashView === 'declined' ? null : 'declined'); setDeptFilter(null); }}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-destructive/20"><XCircle className="h-5 w-5 text-destructive" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Declined Orders</p>
                <p className="text-xl font-bold">{declinedRequests.length}</p>
              </div>
            </CardContent>
          </Card>
          )}
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
                  {dashView === 'requested' && (canEdit('procurement') || canDelete('procurement')) && <TableHead>Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {getRequestListForView(dashView).map((r: any) => {
                  const wasAccepted = r.id === pendingAcceptRequestId;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <button className="text-primary underline hover:no-underline text-sm font-medium" onClick={() => setDeptFilter(deptFilter === r.department ? null : r.department)}>
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
                      {dashView === 'requested' && (canEdit('procurement') || canDelete('procurement')) && (
                        <TableCell>
                          <div className="flex gap-2">
                            {canEdit('procurement') && (
                              wasAccepted ? (
                                <Button size="sm" className="gradient-primary text-black" onClick={() => setIsAddPoOpen(true)}>
                                  Make Order
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="gradient-primary text-black"
                                  onClick={() => openConfirm({ title: 'Accept Request', message: 'Accept this request and create a Purchase Order?', type: 'success', confirmText: 'Accept', onConfirm: () => acceptRequest.mutate({ id: r.id, itemType: r.item_type }) })}
                                  disabled={acceptRequest.isPending}
                                >
                                  Accept
                                </Button>
                              )
                            )}
                            {canDelete('procurement') && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openConfirm({ title: 'Decline Request', message: 'Decline this request?', type: 'danger', confirmText: 'Decline', onConfirm: () => declineRequest.mutate({ id: r.id, itemType: r.item_type }) })}
                                disabled={declineRequest.isPending}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {!getRequestListForView(dashView).length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No requests found</TableCell></TableRow>
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
                      {po.payment_status === 'paid' ? (
                        <select disabled value="paid" className="h-8 rounded border border-input bg-background px-2 text-sm bg-success/20 text-success opacity-75 cursor-not-allowed">
                          <option value="paid">Paid</option>
                        </select>
                      ) : canEdit('procurement') ? (
                        <select
                          value={po.status}
                          onChange={(e) => updatePOStatus.mutate({ id: po.id, status: e.target.value })}
                          className={`h-8 rounded border border-input bg-background px-2 text-sm ${poStatusColor[po.status] ?? ''}`}
                        >
                          {PO_STATUSES_MAP.filter(s => s.value !== 'paid').map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      ) : (
                        <Badge className={poStatusColor[po.status] ?? ''}>{getPoLabel(po.status)}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canDelete('procurement') && (
                        po.payment_status === 'paid' ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0} className="inline-flex">
                                <Button variant="ghost" size="icon" disabled className="pointer-events-none opacity-30" aria-label="Paid orders can't be deleted">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Paid orders can't be deleted</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button variant="ghost" size="icon" onClick={() => openConfirm({ title: 'Cancel Order', message: 'Cancel this purchase order?', type: 'danger', confirmText: 'Cancel Order', onConfirm: () => deletePO.mutate(po.id) })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )
                      )}
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

        {/* Pending Payment View (submitted orders) */}
        {dashView === 'pending_payment' && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier Name</TableHead>
                  <TableHead>Commodity</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPaymentPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{po.suppliers?.name || '-'}</TableCell>
                    <TableCell>{po.commodity || '-'}</TableCell>
                    <TableCell>{po.quantity != null ? Number(po.quantity).toFixed(2) : '-'}</TableCell>
                    <TableCell>${Number(po.total_amount).toFixed(2)}</TableCell>
                    <TableCell className="capitalize">{po.suppliers?.payment_method?.replace('_', ' ') || '-'}</TableCell>
                    <TableCell>{po.suppliers?.account_number || '-'}</TableCell>
                    <TableCell><Badge className="bg-blue-500/20 text-blue-500">Submitted</Badge></TableCell>
                  </TableRow>
                ))}
                {!pendingPaymentPOs.length && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No orders pending payment</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Paid Orders View */}
        {dashView === 'paid_orders' && (
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search paid orders..."
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paidPOs.filter(p => p.po_number?.toLowerCase().includes(poSearch.toLowerCase()) || p.suppliers?.name?.toLowerCase().includes(poSearch.toLowerCase())).map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium text-white">{po.po_number}</TableCell>
                      <TableCell className="text-white">{po.suppliers?.name || '-'}</TableCell>
                      <TableCell className="text-white">{po.commodity || '-'}</TableCell>
                      <TableCell className="text-white">{format(new Date(po.order_date ?? po.created_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-white">{po.expected_delivery ? format(new Date(po.expected_delivery), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="text-white">{po.quantity != null ? Number(po.quantity).toFixed(2) : '-'}</TableCell>
                      <TableCell className="text-white">${Number(po.total_amount).toFixed(2)}</TableCell>
                      <TableCell><Badge className="bg-success/20 text-success">Paid</Badge></TableCell>
                    </TableRow>
                  ))}
                  {!paidPOs.length && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No paid orders found</TableCell></TableRow>
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
                {canCreate('procurement') && <Button className="gradient-primary text-black" onClick={() => setIsAddPoOpen(true)}><Plus className="h-4 w-4 mr-2" />New PO</Button>}
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
                          {po.payment_status === 'paid' ? (
                            <select disabled value="paid" className="h-8 rounded border border-input bg-background px-2 text-sm bg-success/20 text-success opacity-75 cursor-not-allowed">
                              <option value="paid">Paid</option>
                            </select>
                          ) : canEdit('procurement') ? (
                            <select
                              value={po.status}
                              onChange={(e) => updatePOStatus.mutate({ id: po.id, status: e.target.value })}
                              className={`h-8 rounded border border-input bg-background px-2 text-sm ${poStatusColor[po.status] ?? ''}`}
                            >
                              {PO_STATUSES_MAP.filter(s => s.value !== 'paid').map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          ) : (
                            <Badge className={poStatusColor[po.status] ?? ''}>{getPoLabel(po.status)}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canDelete('procurement') && (
                            po.payment_status === 'paid' ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span tabIndex={0} className="inline-flex">
                                    <Button variant="ghost" size="icon" disabled className="pointer-events-none opacity-30" aria-label="Paid orders can't be deleted">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Paid orders can't be deleted</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Button variant="ghost" size="icon" onClick={() => openConfirm({ title: 'Cancel Order', message: 'Cancel this purchase order?', type: 'danger', confirmText: 'Cancel Order', onConfirm: () => deletePO.mutate(po.id) })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )
                          )}
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
                {canCreate('procurement') && (
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
                        <Label>Commodity Supplied</Label>
                        <Input
                          value={supplierForm.commodity}
                          onChange={(e) => setSupplierForm({ ...supplierForm, commodity: e.target.value })}
                          placeholder="Enter commodity..."
                        />
                      </div>
                      <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addSupplier.isPending}>Add Supplier</Button>
                    </form>
                  </DialogContent>
                </Dialog>
                )}
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
                    {filteredSuppliers.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.phone || '-'}</TableCell>
                        <TableCell>{s.email || '-'}</TableCell>
                        <TableCell className="capitalize">{s.payment_method?.replace('_', ' ') || '-'}</TableCell>
                        <TableCell>{s.account_number || '-'}</TableCell>
                        <TableCell>{s.commodity || '-'}</TableCell>
                        <TableCell className="text-right">
                          {canDelete('procurement') && (
                            <Button variant="ghost" size="icon" onClick={() => openConfirm({ title: 'Remove Supplier', message: 'Remove this supplier?', type: 'danger', confirmText: 'Remove', onConfirm: () => deleteSupplier.mutate(s.id) })}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
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
