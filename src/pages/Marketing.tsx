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
import { Tag, CheckCircle, Loader2, Plus, Clock, Navigation, Download, ShoppingCart, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';

type MarketingView = 'prices' | 'cart' | 'pending' | 'in_route' | 'in_process' | 'completed';

const PRICE_ITEMS = [
  'Cocoa Beans', 'Palm Oil', 'Fresh Fish', 'Dry Fish',
  'Goat', 'Sheep', 'Cow', 'Chicken', 'Duck', 'Pig', 'Piglet Pairs',
];

const UNITS = ['kg', 'ltr', 'pairs', 'units', 'bag', 'crate'];

const BLANK_PRICE = { itemName: '', pricePerUnit: 0, quantityUnit: 'kg' };
const BLANK_CART = { itemName: '', quantity: 1 };

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

export default function Marketing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canViewCard } = usePermissions();
  const [view, setView] = useState<MarketingView>('pending');
  const [priceOpen, setPriceOpen] = useState(false);
  const [editPrice, setEditPrice] = useState<any>(null);
  const [priceForm, setPriceForm] = useState({ ...BLANK_PRICE });
  const [cartOpen, setCartOpen] = useState(false);
  const [cartForm, setCartForm] = useState({ ...BLANK_CART });

  const { data: prices = [] } = useQuery<any[]>({
    queryKey: ['marketing-prices'],
    queryFn: () => api.get('/marketing/prices'),
  });

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ['marketing-orders'],
    queryFn: () => api.get('/marketing/orders'),
  });

  const { data: cartItems = [] } = useQuery<any[]>({
    queryKey: ['marketing-cart'],
    queryFn: () => api.get('/marketing/cart'),
  });

  const pendingOrders   = orders.filter((o: any) => o.status === 'pending');
  const enRouteOrders   = orders.filter((o: any) => o.status === 'en_route');
  const inProcessOrders = orders.filter((o: any) => o.status === 'in_process' || o.status === 'processing');
  const completedOrders = orders.filter((o: any) => o.status === 'completed' || o.status === 'delivered');

  const cartTotal = cartItems.reduce((sum: number, item: any) => {
    const price = prices.find((p: any) => p.item_name.toLowerCase() === item.item_name.toLowerCase());
    return sum + (price ? Number(price.price_per_unit) * Number(item.quantity) : 0);
  }, 0);

  const addToCart = useMutation({
    mutationFn: (data: typeof cartForm) => {
      const price = prices.find((p: any) => p.item_name.toLowerCase() === data.itemName.toLowerCase());
      const unitPrice = price ? Number(price.price_per_unit) : 0;
      return api.post('/marketing/cart', { itemName: data.itemName, quantity: data.quantity, unitPrice });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-cart'] });
      toast({ title: 'Added to cart' });
      setCartOpen(false);
      setCartForm({ ...BLANK_CART });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const removeFromCart = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/cart/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-cart'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const savePrice = useMutation({
    mutationFn: (data: typeof priceForm) => editPrice
      ? api.patch(`/marketing/prices/${editPrice.id}`, { pricePerUnit: data.pricePerUnit, quantityUnit: data.quantityUnit })
      : api.post('/marketing/prices', { itemName: data.itemName, pricePerUnit: data.pricePerUnit, quantityUnit: data.quantityUnit }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-prices'] });
      toast({ title: editPrice ? 'Price updated' : 'Price set' });
      setPriceOpen(false);
      setEditPrice(null);
      setPriceForm({ ...BLANK_PRICE });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateOrderStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/marketing/orders/${id}`, { status }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-orders'] });
      if (status === 'completed') {
        // Completed orders deduct from inventory — refresh inventory and dashboard
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        queryClient.invalidateQueries({ queryKey: ['marketing-deductions'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['ls-by-status'] });
      }
      toast({ title: 'Order status updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openEditPrice = (p: any) => {
    setEditPrice(p);
    setPriceForm({ itemName: p.item_name, pricePerUnit: Number(p.price_per_unit), quantityUnit: p.quantity_unit });
    setPriceOpen(true);
  };

  const CARDS = [
    { key: 'prices' as MarketingView, label: 'Prices', count: prices.length, Icon: Tag, color: 'bg-warning/10 border-warning/20 text-warning' },
    { key: 'cart' as MarketingView, label: 'Cart', count: cartItems.length, Icon: ShoppingCart, color: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
    { key: 'pending' as MarketingView, label: 'Pending', count: pendingOrders.length, Icon: Clock, color: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
    { key: 'in_route' as MarketingView, label: 'In Route', count: enRouteOrders.length, Icon: Navigation, color: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
    { key: 'in_process' as MarketingView, label: 'In Process', count: inProcessOrders.length, Icon: Loader2, color: 'bg-info/10 border-info/20 text-info' },
    { key: 'completed' as MarketingView, label: 'Completed', count: completedOrders.length, Icon: CheckCircle, color: 'bg-success/10 border-success/20 text-success' },
  ];

  const orderViewData: Record<string, any[]> = {
    pending: pendingOrders,
    in_route: enRouteOrders,
    in_process: inProcessOrders,
    completed: completedOrders,
  };

  const isOrderView = (['pending', 'in_route', 'in_process', 'completed'] as MarketingView[]).includes(view);

  const handleExportCSV = () => {
    if (view === 'prices') {
      exportToCSV('prices.csv', prices.map(p => ({
        'Item Name': p.item_name,
        'Quantity Unit': p.quantity_unit,
        'Price Per Unit': Number(p.price_per_unit).toFixed(2),
        'Last Updated': p.updated_at ? format(new Date(p.updated_at), 'MMM d, yyyy') : '',
      })));
    } else {
      const rows = orderViewData[view] ?? [];
      exportToCSV(`${view}-orders.csv`, rows.map(o => ({
        'Order ID': o.order_id,
        'Customer ID': o.payment_id ? o.payment_id.slice(0, 8).toUpperCase() : 'N/A',
        'Item Name': o.item_name,
        'Quantity': `${Number(o.quantity).toFixed(2)} ${o.quantity_unit ?? ''}`,
        'Amount': Number(o.amount).toFixed(2),
        'Date': o.date ? format(new Date(o.date), 'MMM d, yyyy') : '',
        'Status': o.status,
      })));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Marketing</h1>
            <p className="text-muted-foreground">Manage sales, pricing, and orders</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />Export CSV
            </Button>
            {view === 'prices' && canCreate('marketing') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditPrice(null); setPriceForm({ ...BLANK_PRICE }); setPriceOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Set Price
              </Button>
            )}
            {view === 'cart' && canCreate('marketing') && (
              <Button variant="outline" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => { setCartForm({ ...BLANK_CART }); setCartOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Item
              </Button>
            )}
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {CARDS.filter(({ key }) => canViewCard(`marketing.${key}`)).map(({ key, label, count, Icon, color }) => (
            <Card
              key={key}
              className={`border cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${color} ${view === key ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`}
              onClick={() => setView(key)}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <Icon className="h-6 w-6" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Prices View */}
        {view === 'prices' && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Quantity Unit</TableHead>
                    <TableHead>Price Per Unit</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.item_name}</TableCell>
                      <TableCell>{p.quantity_unit}</TableCell>
                      <TableCell>${Number(p.price_per_unit).toFixed(2)}</TableCell>
                      <TableCell>{p.updated_at ? format(new Date(p.updated_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="text-right">
                        {canEdit('marketing') && (
                          <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => openEditPrice(p)}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!prices.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No prices set yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Cart View — tracking only; payment happens at Sales & Order Points */}
        {view === 'cart' && (
          <div className="space-y-4">
            <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-300 font-medium">
              This cart tracks customer shopping carts only. Payment is processed at Sales &amp; Order Points.
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cartItems.map((item: any) => {
                      const price = prices.find((p: any) => p.item_name.toLowerCase() === item.item_name.toLowerCase());
                      const unitPrice = price ? Number(price.price_per_unit) : 0;
                      const lineTotal = unitPrice * Number(item.quantity);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.item_name}</TableCell>
                          <TableCell>{Number(item.quantity).toFixed(2)} {price?.quantity_unit ?? ''}</TableCell>
                          <TableCell>${unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${lineTotal.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => { if (confirm('Remove from cart?')) removeFromCart.mutate(item.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!cartItems.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cart is empty — add items from the Prices view</TableCell>
                      </TableRow>
                    )}
                    {cartItems.length > 0 && (
                      <TableRow className="border-t-2">
                        <TableCell colSpan={3} className="font-bold text-right">Total</TableCell>
                        <TableCell className="text-right font-bold text-lg">${cartTotal.toFixed(2)}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Order Views: Pending, In Route, In Process, Completed */}
        {isOrderView && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(orderViewData[view] ?? []).map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">{o.order_id}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{o.payment_id ? o.payment_id.slice(0, 8).toUpperCase() : 'N/A'}</TableCell>
                      <TableCell className="font-medium">{o.item_name}</TableCell>
                      <TableCell>{Number(o.quantity).toFixed(2)} {o.quantity_unit}</TableCell>
                      <TableCell>${Number(o.amount).toFixed(2)}</TableCell>
                      <TableCell>{o.date ? format(new Date(o.date), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>
                        {view === 'completed' ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-success/20 text-success">Completed</span>
                        ) : canEdit('marketing') ? (
                          <select
                            value={
                              o.status === 'processing' ? 'in_process' :
                              o.status === 'delivered' ? 'completed' :
                              o.status
                            }
                            onChange={(e) => updateOrderStatus.mutate({ id: o.id, status: e.target.value })}
                            className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground"
                          >
                            <option value="pending">Pending</option>
                            <option value="en_route">En Route</option>
                            <option value="in_process">In Process</option>
                            <option value="completed">Completed</option>
                          </select>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground capitalize">{o.status.replace('_', ' ')}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!(orderViewData[view] ?? []).length && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No orders</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Add to Cart Dialog */}
        {canCreate('marketing') && (
        <Dialog open={cartOpen} onOpenChange={(o) => { setCartOpen(o); if (!o) setCartForm({ ...BLANK_CART }); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Item to Cart</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addToCart.mutate(cartForm); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Item</Label>
                <select
                  value={cartForm.itemName}
                  onChange={(e) => setCartForm({ ...cartForm, itemName: e.target.value })}
                  required
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Select item</option>
                  {prices.map((p: any) => (
                    <option key={p.id} value={p.item_name}>{p.item_name} — ${Number(p.price_per_unit).toFixed(2)}/{p.quantity_unit}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cartForm.quantity}
                  onChange={(e) => setCartForm({ ...cartForm, quantity: Number(e.target.value) })}
                  required
                />
              </div>
              <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addToCart.isPending}>
                Add to Cart
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        )}

        {/* Set Price Dialog */}
        {(editPrice ? canEdit('marketing') : canCreate('marketing')) && (
        <Dialog open={priceOpen} onOpenChange={(o) => { setPriceOpen(o); if (!o) { setEditPrice(null); setPriceForm({ ...BLANK_PRICE }); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editPrice ? 'Edit Price' : 'Set Price'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); savePrice.mutate(priceForm); }} className="space-y-4">
              {!editPrice && (
                <div className="space-y-2">
                  <Label>Item Name</Label>
                  <select
                    value={priceForm.itemName}
                    onChange={(e) => setPriceForm({ ...priceForm, itemName: e.target.value })}
                    required
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="">Select item</option>
                    {PRICE_ITEMS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              )}
              {editPrice && (
                <div className="space-y-2">
                  <Label>Item Name</Label>
                  <Input value={editPrice.item_name} disabled className="bg-muted" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price Per Unit ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceForm.pricePerUnit}
                    onChange={(e) => setPriceForm({ ...priceForm, pricePerUnit: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quantity Unit</Label>
                  <select
                    value={priceForm.quantityUnit}
                    onChange={(e) => setPriceForm({ ...priceForm, quantityUnit: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={savePrice.isPending}>
                {editPrice ? 'Update Price' : 'Set Price'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}
