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
import { ShoppingCart, Tag, CheckCircle, Loader2, Plus, Trash2, CreditCard, Smartphone, Clock, Navigation, Search } from 'lucide-react';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';

type MarketingView = 'cart' | 'prices' | 'pending' | 'in_route' | 'in_process' | 'completed';
type PaymentStep = 'none' | 'method' | 'form' | 'success';
type PaymentMethod = 'mastercard' | 'visa' | 'mtn' | null;

const PRICE_ITEMS = [
  'Cocoa Beans', 'Palm Oil', 'Fresh Fish', 'Dry Fish',
  'Goat', 'Sheep', 'Cow', 'Chicken', 'Duck', 'Pig', 'Piglet Pairs',
];

const UNITS = ['kg', 'ltr', 'pairs', 'units', 'bag', 'crate'];

const BLANK_PRICE = { itemName: '', pricePerUnit: 0, quantityUnit: 'kg' };
const BLANK_CART = { itemName: '', quantity: 0 };
const BLANK_PAYMENT = { name: '', cardNumber: '', cvv: '', expiry: '', totalAmount: 0 };

export default function Marketing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete, canViewCard } = usePermissions();
  const [view, setView] = useState<MarketingView>('cart');
  const [priceOpen, setPriceOpen] = useState(false);
  const [editPrice, setEditPrice] = useState<any>(null);
  const [priceForm, setPriceForm] = useState({ ...BLANK_PRICE });
  const [cartOpen, setCartOpen] = useState(false);
  const [cartForm, setCartForm] = useState({ ...BLANK_CART });
  const [payStep, setPayStep] = useState<PaymentStep>('none');
  const [payMethod, setPayMethod] = useState<PaymentMethod>(null);
  const [payForm, setPayForm] = useState({ ...BLANK_PAYMENT });
  const [cartSearch, setCartSearch] = useState('');

  const { data: cart = [] } = useQuery<any[]>({
    queryKey: ['marketing-cart'],
    queryFn: () => api.get('/marketing/cart'),
  });

  const { data: prices = [] } = useQuery<any[]>({
    queryKey: ['marketing-prices'],
    queryFn: () => api.get('/marketing/prices'),
  });

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ['marketing-orders'],
    queryFn: () => api.get('/marketing/orders'),
  });

  const { data: availableItems = [] } = useQuery<any[]>({
    queryKey: ['marketing-available-items'],
    queryFn: () => api.get('/marketing/available-items'),
  });

  const cartTotal = cart.reduce((s: number, i: any) => s + Number(i.total_amount), 0);

  const pendingOrders   = orders.filter((o: any) => o.status === 'pending');
  const enRouteOrders   = orders.filter((o: any) => o.status === 'en_route');
  const inProcessOrders = orders.filter((o: any) => o.status === 'in_process' || o.status === 'processing');
  const completedOrders = orders.filter((o: any) => o.status === 'completed' || o.status === 'delivered');

  const selectedItemPrice = prices.find((p: any) => p.item_name === cartForm.itemName);
  const calculatedCost = selectedItemPrice ? cartForm.quantity * Number(selectedItemPrice.price_per_unit) : 0;

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

  const checkout = useMutation({
    mutationFn: () => api.post('/marketing/checkout', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-cart'] });
      queryClient.invalidateQueries({ queryKey: ['marketing-orders'] });
      setPayStep('success');
    },
    onError: (e: any) => toast({ title: 'Checkout failed', description: e.message, variant: 'destructive' }),
  });

  const updateOrderStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/marketing/orders/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-orders'] });
      toast({ title: 'Order status updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openEditPrice = (p: any) => {
    setEditPrice(p);
    setPriceForm({ itemName: p.item_name, pricePerUnit: Number(p.price_per_unit), quantityUnit: p.quantity_unit });
    setPriceOpen(true);
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (payForm.totalAmount < cartTotal) {
      toast({ title: 'Amount mismatch', description: 'Paid amount is less than cart total', variant: 'destructive' });
      return;
    }
    checkout.mutate();
  };

  const CARDS = [
    { key: 'cart' as MarketingView, label: 'Shopping Cart', count: cart.length, Icon: ShoppingCart, color: 'bg-primary/10 border-primary/20 text-primary' },
    { key: 'prices' as MarketingView, label: 'Prices', count: prices.length, Icon: Tag, color: 'bg-warning/10 border-warning/20 text-warning' },
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

  const isOrderView = ['pending', 'in_route', 'in_process', 'completed'].includes(view);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Marketing</h1>
            <p className="text-muted-foreground">Manage sales, pricing, and orders</p>
          </div>
          {view === 'prices' ? (
            canCreate('marketing') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditPrice(null); setPriceForm({ ...BLANK_PRICE }); setPriceOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Set Price
              </Button>
            )
          ) : (
            canCreate('marketing') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setCartForm({ ...BLANK_CART }); setCartOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add to Cart
              </Button>
            )
          )}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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

        {/* Shopping Cart View */}
        {view === 'cart' && (
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
                        {canDelete('marketing') && (
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm('Remove from cart?')) removeFromCart.mutate(item.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
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
                <div className="p-4 border-t flex flex-col items-center gap-3">
                  <p className="text-lg font-bold">Total: ${cartTotal.toFixed(2)}</p>
                  {canEdit('marketing') && (
                    <Button
                      className="gradient-primary text-black font-medium px-8"
                      onClick={() => { setPayForm({ ...BLANK_PAYMENT, totalAmount: cartTotal }); setPayStep('method'); setPayMethod(null); }}
                    >
                      Pay
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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

        {/* Order Views: Pending, In Route, In Process, Completed */}
        {isOrderView && (
          <Card>
            <CardContent className="p-0">
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
                  {(orderViewData[view] ?? []).map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">{o.order_id}</TableCell>
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
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No orders</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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

        {/* Add to Cart Dialog */}
        {canCreate('marketing') && (
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
                  {!selectedItemPrice && <p className="text-warning text-xs">No price set for this item. Cost will be $0.00.</p>}
                </div>
              )}
              <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addToCart.isPending}>
                Add to Cart
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        )}

        {/* Payment Dialog — Method Selection */}
        {canEdit('marketing') && (
        <Dialog open={payStep === 'method'} onOpenChange={(o) => { if (!o) setPayStep('none'); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Select Payment Method</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-4 py-4">
              {([
                { key: 'mastercard', label: 'MasterCard', Icon: CreditCard },
                { key: 'visa', label: 'Visa', Icon: CreditCard },
                { key: 'mtn', label: 'MTN MoMo', Icon: Smartphone },
              ] as const).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setPayMethod(key); setPayStep('form'); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Icon className="h-8 w-8" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        )}

        {/* Payment Dialog — Form */}
        {canEdit('marketing') && (
        <Dialog open={payStep === 'form'} onOpenChange={(o) => { if (!o) setPayStep('none'); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{payMethod === 'mtn' ? 'MTN Mobile Money' : payMethod === 'visa' ? 'Visa Card' : 'MasterCard'} Payment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handlePaySubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Name on Card</Label>
                <Input value={payForm.name} onChange={(e) => setPayForm({ ...payForm, name: e.target.value })} required placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label>{payMethod === 'mtn' ? 'Phone Number' : 'Card Number'}</Label>
                <Input
                  value={payForm.cardNumber}
                  onChange={(e) => setPayForm({ ...payForm, cardNumber: e.target.value })}
                  required
                  placeholder={payMethod === 'mtn' ? '024XXXXXXX' : '•••• •••• •••• ••••'}
                  maxLength={payMethod === 'mtn' ? 15 : 19}
                />
              </div>
              {payMethod !== 'mtn' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CVV</Label>
                    <Input value={payForm.cvv} onChange={(e) => setPayForm({ ...payForm, cvv: e.target.value })} required placeholder="•••" maxLength={4} />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry Date</Label>
                    <Input value={payForm.expiry} onChange={(e) => setPayForm({ ...payForm, expiry: e.target.value })} required placeholder="MM/YY" maxLength={5} />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Total Amount ($)</Label>
                <Input type="number" value={payForm.totalAmount} readOnly className="bg-muted font-bold text-primary" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => setPayStep('method')}>
                  Back
                </Button>
                <Button type="submit" className="flex-1 gradient-primary text-black font-medium" disabled={checkout.isPending}>
                  {checkout.isPending ? 'Processing...' : 'Confirm Payment'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        )}

        {/* Payment Success Dialog */}
        <Dialog open={payStep === 'success'} onOpenChange={(o) => { if (!o) { setPayStep('none'); setView('pending'); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Payment Successful</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-success" />
              </div>
              <p className="text-center text-muted-foreground">Your payment has been processed. Orders have been created and are now pending.</p>
              <Button className="gradient-primary text-black font-medium px-8" onClick={() => { setPayStep('none'); setView('pending'); }}>
                View Orders
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
