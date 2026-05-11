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
import { Clock, Loader2, Navigation, PackageCheck, Search, ShoppingCart, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

type SOPView = 'pending' | 'processing' | 'en_route' | 'purchase' | 'shopping_cart';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  processing: 'bg-info/20 text-info',
  in_process: 'bg-info/20 text-info',
  en_route: 'bg-primary/20 text-primary',
  completed: 'bg-success/20 text-success',
  delivered: 'bg-success/20 text-success',
};

const UNITS = ['kg', 'ltr', 'pairs', 'units', 'bag', 'crate'];
const BLANK_CART = { itemName: '', quantity: 0 };

export default function SalesOrderPoints() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<SOPView>('pending');
  const [search, setSearch] = useState('');
  const [cartSearch, setCartSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [cartForm, setCartForm] = useState({ ...BLANK_CART });

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ['marketing-orders'],
    queryFn: () => api.get('/marketing/orders'),
  });

  const { data: cart = [] } = useQuery<any[]>({
    queryKey: ['marketing-cart'],
    queryFn: () => api.get('/marketing/cart'),
  });

  const { data: availableItems = [] } = useQuery<any[]>({
    queryKey: ['marketing-available-items'],
    queryFn: () => api.get('/marketing/available-items'),
  });

  const { data: prices = [] } = useQuery<any[]>({
    queryKey: ['marketing-prices'],
    queryFn: () => api.get('/marketing/prices'),
  });

  const cartTotal = cart.reduce((s: number, i: any) => s + Number(i.total_amount), 0);
  const selectedItemPrice = prices.find((p: any) => p.item_name === cartForm.itemName);
  const calculatedCost = selectedItemPrice ? cartForm.quantity * Number(selectedItemPrice.price_per_unit) : 0;

  const pendingOrders    = orders.filter((o: any) => o.status === 'pending');
  const processingOrders = orders.filter((o: any) => o.status === 'in_process' || o.status === 'processing');
  const enRouteOrders    = orders.filter((o: any) => o.status === 'en_route');
  const deliveredOrders  = orders.filter((o: any) => o.status === 'completed' || o.status === 'delivered');

  const viewOrders = (() => {
    switch (view) {
      case 'pending':       return pendingOrders;
      case 'processing':    return processingOrders;
      case 'en_route':      return enRouteOrders;
      case 'purchase':      return deliveredOrders;
      default:              return [];
    }
  })();

  const filtered = search
    ? viewOrders.filter((o: any) => o.item_name.toLowerCase().includes(search.toLowerCase()))
    : viewOrders;

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/marketing/orders/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-orders'] });
      toast({ title: 'Status updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const addToCart = useMutation({
    mutationFn: (data: { itemName: string; quantity: number; unitPrice: number }) =>
      api.post('/marketing/cart', data),
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
  });

  const CARDS = [
    { key: 'pending' as SOPView, label: 'Pending Order', count: pendingOrders.length, Icon: Clock, color: 'bg-warning/10 border-warning/20 text-warning' },
    { key: 'processing' as SOPView, label: 'Processing Order', count: processingOrders.length, Icon: Loader2, color: 'bg-info/10 border-info/20 text-info' },
    { key: 'en_route' as SOPView, label: 'En Route', count: enRouteOrders.length, Icon: Navigation, color: 'bg-primary/10 border-primary/20 text-primary' },
    { key: 'purchase' as SOPView, label: 'Purchase Order', count: deliveredOrders.length, Icon: PackageCheck, color: 'bg-success/10 border-success/20 text-success' },
    { key: 'shopping_cart' as SOPView, label: 'Shopping Cart', count: cart.length, Icon: ShoppingCart, color: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Sales & Order Points</h1>
            <p className="text-muted-foreground">Track and manage order fulfillment</p>
          </div>
          <Button className="gradient-primary text-black font-medium" onClick={() => { setCartForm({ ...BLANK_CART }); setCartOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Add to Cart
          </Button>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {CARDS.map(({ key, label, count, Icon, color }) => (
            <Card
              key={key}
              className={`border cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${color} ${view === key ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`}
              onClick={() => setView(key)}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <Icon className="h-7 w-7" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Shopping Cart View */}
        {view === 'shopping_cart' && (
          <Card>
            <div className="p-4 border-b">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by item name..."
                  value={cartSearch}
                  onChange={e => setCartSearch(e.target.value)}
                  onBlur={() => setCartSearch('')}
                  className="pl-9 text-white placeholder:text-white/50"
                />
              </div>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.filter((item: any) => !cartSearch || item.item_name.toLowerCase().includes(cartSearch.toLowerCase())).map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      <TableCell>{Number(item.quantity).toFixed(2)}</TableCell>
                      <TableCell>${Number(item.unit_price).toFixed(2)}</TableCell>
                      <TableCell className="font-medium">${Number(item.total_amount).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm('Remove from cart?')) removeFromCart.mutate(item.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!cart.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cart is empty</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {cart.length > 0 && (
                <div className="p-4 border-t text-right">
                  <p className="font-bold text-primary">Total: ${cartTotal.toFixed(2)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Orders Table (pending / processing / en_route / purchase) */}
        {view !== 'shopping_cart' && (
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter by item name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => setSearch('')}
                    className="pl-9 text-white placeholder:text-white/50"
                  />
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">{o.order_id}</TableCell>
                      <TableCell className="font-medium">{o.item_name}</TableCell>
                      <TableCell>{Number(o.quantity).toFixed(2)} {o.quantity_unit}</TableCell>
                      <TableCell>${Number(o.amount).toFixed(2)}</TableCell>
                      <TableCell>{o.date ? format(new Date(o.date), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>
                        {view === 'en_route' ? (
                          <select
                            value={o.status}
                            onChange={(e) => {
                              if (e.target.value === 'completed') {
                                if (confirm(`Mark order ${o.order_id} as Delivered?`)) {
                                  updateStatus.mutate({ id: o.id, status: 'completed' });
                                }
                              } else {
                                updateStatus.mutate({ id: o.id, status: e.target.value });
                              }
                            }}
                            className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground"
                          >
                            <option value="en_route">En Route</option>
                            <option value="completed">Deliver</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] ?? STATUS_COLORS[o.status === 'delivered' ? 'completed' : o.status] ?? ''}`}>
                            {o.status === 'en_route' ? 'En Route' :
                             (o.status === 'in_process' || o.status === 'processing') ? 'In Process' :
                             (o.status === 'completed' || o.status === 'delivered') ? 'Delivered' :
                             o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No orders found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Add to Cart Dialog */}
        <Dialog open={cartOpen} onOpenChange={(o) => { setCartOpen(o); if (!o) setCartForm({ ...BLANK_CART }); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Cart</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const unitPrice = selectedItemPrice ? Number(selectedItemPrice.price_per_unit) : 0;
                addToCart.mutate({ itemName: cartForm.itemName, quantity: cartForm.quantity, unitPrice });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Select Item (In Stock)</Label>
                <select
                  value={cartForm.itemName}
                  onChange={(e) => setCartForm({ ...cartForm, itemName: e.target.value })}
                  required
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Select inventory item</option>
                  {availableItems.map((item: any) => (
                    <option key={item.id} value={item.name}>
                      {item.name} (Stock: {Number(item.current_quantity).toFixed(2)} {item.units_of_measure?.symbol ?? ''})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cartForm.quantity || ''}
                  onChange={(e) => setCartForm({ ...cartForm, quantity: Number(e.target.value) })}
                  required
                />
              </div>
              {cartForm.itemName && (
                <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                  <p>Unit Price: <span className="font-medium">${selectedItemPrice ? Number(selectedItemPrice.price_per_unit).toFixed(2) : '0.00'} / {selectedItemPrice?.quantity_unit ?? 'unit'}</span></p>
                  <p>Total Cost: <span className="font-bold text-primary">${calculatedCost.toFixed(2)}</span></p>
                  {!selectedItemPrice && <p className="text-warning text-xs">No price set for this item.</p>}
                </div>
              )}
              <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addToCart.isPending}>
                Add to Cart
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
