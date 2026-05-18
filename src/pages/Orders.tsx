import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  AreaChart as AreaChartIcon,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Factory,
  PackageCheck,
  Plus,
  Search,
  ShieldAlert,
  Truck,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  Cell,
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

type Customer = {
  id: string;
  name: string;
  customer_type: string;
  is_active?: boolean;
};

type InventoryProduct = {
  id: string;
  name: string;
  sku?: string | null;
  unit_of_measure: string;
  current_quantity: number | null;
  reserved_quantity: number | null;
  unit_cost: number | null;
  item_categories?: { name: string } | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  order_date: string | null;
  created_at: string | null;
  delivery_date: string | null;
  status: string;
  payment_status: string;
  total_amount: number;
  order_type: 'direct_sale' | 'production_order' | 'contract';
  product_name: string;
  product_category: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  notes: string;
  customer_id: string;
  customers: { name: string } | null;
};

type DistributionLog = {
  id: string;
  delivery_id: string;
  order_id: string;
  order_number: string;
  customer: string;
  product: string;
  quantity: number;
  unit: string | null;
  dispatch_date: string | null;
  delivery_status: string;
  destination: string | null;
  driver_name: string | null;
  notes: string | null;
};

type OrderFormData = {
  customerId: string;
  stockItemId: string;
  quantity: number;
  unitPrice: number;
  orderType: 'direct_sale' | 'production_order' | 'contract';
  stockMode: 'available' | 'production_required';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  deliveryDate: string;
  notes: string;
};

type DispatchFormData = {
  status: 'ready_for_dispatch' | 'completed';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  dispatchDate: string;
  deliveryStatus: string;
  destination: string;
  driverName: string;
  vehicleRef: string;
  recipientName: string;
  notes: string;
};

const salesStatuses = ['pending', 'in_production', 'quality_check', 'ready_for_dispatch', 'completed', 'rejected'] as const;
const paymentStatuses = ['all', 'unpaid', 'partial', 'paid'] as const;
const chartColors = ['hsl(var(--primary))', 'hsl(var(--warning))', 'hsl(var(--info))', 'hsl(var(--success))', 'hsl(var(--accent))', 'hsl(var(--destructive))'];

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

function labelize(value: string | null | undefined) {
  if (!value) return 'Unassigned';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: 'bg-warning/20 text-warning border-warning/20',
    in_production: 'bg-info/20 text-info border-info/20',
    quality_check: 'bg-accent/20 text-accent border-accent/20',
    ready_for_dispatch: 'bg-primary/20 text-primary border-primary/20',
    completed: 'bg-success/20 text-success border-success/20',
    rejected: 'bg-destructive/20 text-destructive border-destructive/20',
  };
  return <Badge className={styles[status] || 'bg-muted text-muted-foreground'}>{labelize(status)}</Badge>;
}

function paymentBadge(status: string) {
  const styles: Record<string, string> = {
    unpaid: 'bg-destructive/20 text-destructive border-destructive/20',
    partial: 'bg-warning/20 text-warning border-warning/20',
    paid: 'bg-success/20 text-success border-success/20',
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

export default function Orders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | typeof salesStatuses[number]>('all');
  const [paymentFilter, setPaymentFilter] = useState<typeof paymentStatuses[number]>('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [dispatchingOrder, setDispatchingOrder] = useState<OrderRow | null>(null);
  const [orderForm, setOrderForm] = useState<OrderFormData>({
    customerId: '',
    stockItemId: '',
    quantity: 0,
    unitPrice: 0,
    orderType: 'direct_sale',
    stockMode: 'available',
    paymentStatus: 'unpaid',
    deliveryDate: '',
    notes: '',
  });
  const [dispatchForm, setDispatchForm] = useState<DispatchFormData>({
    status: 'ready_for_dispatch',
    paymentStatus: 'unpaid',
    dispatchDate: new Date().toISOString().slice(0, 10),
    deliveryStatus: 'in_transit',
    destination: '',
    driverName: '',
    vehicleRef: '',
    recipientName: '',
    notes: '',
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['sales-orders-command-center'],
    queryFn: () => api.get<OrderRow[]>('/sales/orders'),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['sales-customers-command-center'],
    queryFn: () => api.get<Customer[]>('/sales/customers'),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['sales-products-command-center'],
    queryFn: () => api.get<InventoryProduct[]>('/inventory/items'),
  });

  const { data: distributionLogs = [] } = useQuery({
    queryKey: ['sales-distribution-logs'],
    queryFn: () => api.get<DistributionLog[]>('/sales/distribution-logs'),
  });

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.name])), [customers]);

  const enrichedOrders = useMemo(() => {
    return orders.map((order) => {
      const customerName = order.customers?.name || customerMap.get(order.customer_id) || 'Walk-in';
      return {
        ...order,
        customerName,
        totalAmount: Number(order.total_amount || 0),
        quantityValue: Number(order.quantity || 0),
        unitPriceValue: Number(order.unit_price || 0),
      };
    });
  }, [customerMap, orders]);

  const analytics = useMemo(() => {
    const pendingOrders = enrichedOrders.filter((order) => order.status === 'pending');
    const inProductionOrders = enrichedOrders.filter((order) => order.status === 'in_production');
    const qualityOrders = enrichedOrders.filter((order) => order.status === 'quality_check');
    const readyOrders = enrichedOrders.filter((order) => order.status === 'ready_for_dispatch');
    const completedOrders = enrichedOrders.filter((order) => order.status === 'completed');
    const rejectedOrders = enrichedOrders.filter((order) => order.status === 'rejected');
    const totalSalesRevenue = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const outstandingPayments = enrichedOrders
      .filter((order) => order.payment_status !== 'paid' && order.status !== 'rejected')
      .reduce((sum, order) => sum + order.totalAmount, 0);

    const customerSpend = new Map<string, { name: string; revenue: number; orders: number; pending: number }>();
    for (const order of enrichedOrders) {
      const current = customerSpend.get(order.customer_id) || {
        name: order.customerName,
        revenue: 0,
        orders: 0,
        pending: 0,
      };
      current.orders += 1;
      if (order.status !== 'rejected') current.revenue += order.totalAmount;
      if (['pending', 'in_production', 'quality_check', 'ready_for_dispatch'].includes(order.status)) current.pending += 1;
      customerSpend.set(order.customer_id, current);
    }

    const repeatCustomers = Array.from(customerSpend.values()).filter((entry) => entry.orders > 1).length;
    const topCustomer = Array.from(customerSpend.values()).sort((a, b) => b.revenue - a.revenue)[0] || null;
    const customersWithPendingOrders = Array.from(customerSpend.values()).filter((entry) => entry.pending > 0).length;

    const monthlySalesMap = new Map<string, { label: string; revenue: number }>();
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - index);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthlySalesMap.set(key, {
        label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date),
        revenue: 0,
      });
    }
    enrichedOrders.forEach((order) => {
      const sourceDate = order.created_at || order.order_date;
      if (!sourceDate) return;
      const date = new Date(sourceDate);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = monthlySalesMap.get(key);
      if (bucket) bucket.revenue += order.totalAmount;
    });

    const salesByCategory = Array.from(
      enrichedOrders.reduce((map, order) => {
        const key = order.product_category || 'Uncategorized';
        map.set(key, (map.get(key) || 0) + order.totalAmount);
        return map;
      }, new Map<string, number>()),
    ).map(([name, value]) => ({ name, value }));

    const ordersByStatus = salesStatuses.map((status) => ({
      name: labelize(status),
      value: enrichedOrders.filter((order) => order.status === status).length,
    }));

    const topCustomers = Array.from(customerSpend.values())
      .map((entry) => ({ name: entry.name, revenue: entry.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      pendingOrders,
      inProductionOrders,
      qualityOrders,
      readyOrders,
      completedOrders,
      rejectedOrders,
      totalSalesRevenue,
      outstandingPayments,
      totalCustomers: customers.length,
      repeatCustomers,
      topCustomer,
      customersWithPendingOrders,
      monthlySales: Array.from(monthlySalesMap.values()),
      salesByCategory,
      ordersByStatus,
      topCustomers,
    };
  }, [customers.length, enrichedOrders]);

  const filteredOrders = useMemo(() => {
    return enrichedOrders.filter((order) => {
      const sourceDate = order.order_date || order.created_at;
      const orderTime = sourceDate ? new Date(sourceDate).getTime() : null;
      const fromTime = dateFrom ? new Date(dateFrom).getTime() : null;
      const toTime = dateTo ? new Date(dateTo).getTime() : null;
      const matchesSearch =
        order.order_number.toLowerCase().includes(search.toLowerCase()) ||
        order.customerName.toLowerCase().includes(search.toLowerCase()) ||
        order.product_name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesPayment = paymentFilter === 'all' || order.payment_status === paymentFilter;
      const matchesCustomer = customerFilter === 'all' || order.customer_id === customerFilter;
      const matchesFrom = fromTime == null || orderTime == null || orderTime >= fromTime;
      const matchesTo = toTime == null || orderTime == null || orderTime <= toTime;
      return matchesSearch && matchesStatus && matchesPayment && matchesCustomer && matchesFrom && matchesTo;
    });
  }, [customerFilter, dateFrom, dateTo, enrichedOrders, paymentFilter, search, statusFilter]);

  const createOrderMutation = useMutation({
    mutationFn: (data: OrderFormData) =>
      api.post('/sales/orders', {
        customerId: data.customerId,
        stockItemId: data.stockItemId,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        orderType: data.orderType,
        productionRequired: data.stockMode === 'production_required',
        paymentStatus: data.paymentStatus,
        deliveryDate: data.deliveryDate || undefined,
        notes: data.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders-command-center'] });
      queryClient.invalidateQueries({ queryKey: ['recent-orders'] });
      toast({ title: 'Order created successfully' });
      setIsOrderOpen(false);
      setOrderForm({
        customerId: '',
        stockItemId: '',
        quantity: 0,
        unitPrice: 0,
        orderType: 'direct_sale',
        stockMode: 'available',
        paymentStatus: 'unpaid',
        deliveryDate: '',
        notes: '',
      });
    },
    onError: (error) => {
      toast({ title: 'Error creating order', description: error.message, variant: 'destructive' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, paymentStatus }: { id: string; status: string; paymentStatus?: string }) =>
      api.patch(`/sales/orders/${id}`, { status, paymentStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders-command-center'] });
      queryClient.invalidateQueries({ queryKey: ['recent-orders'] });
      toast({ title: 'Order updated' });
    },
    onError: (error) => {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: ({ order, data }: { order: OrderRow; data: DispatchFormData }) =>
      api.patch(`/sales/orders/${order.id}`, {
        status: data.status,
        paymentStatus: data.paymentStatus,
        dispatchDate: data.dispatchDate,
        deliveryStatus: data.deliveryStatus,
        destination: data.destination,
        driverName: data.driverName,
        vehicleRef: data.vehicleRef,
        recipientName: data.recipientName,
        notes: data.notes || order.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders-command-center'] });
      queryClient.invalidateQueries({ queryKey: ['sales-distribution-logs'] });
      queryClient.invalidateQueries({ queryKey: ['recent-orders'] });
      toast({ title: 'Dispatch log posted' });
      setDispatchingOrder(null);
    },
    onError: (error) => {
      toast({ title: 'Dispatch failed', description: error.message, variant: 'destructive' });
    },
  });

  const selectedProduct = orderForm.stockItemId ? productMap.get(orderForm.stockItemId) : null;
  const availableQuantity = selectedProduct
    ? Number(selectedProduct.current_quantity || 0) - Number(selectedProduct.reserved_quantity || 0)
    : 0;
  const calculatedTotal = Number(orderForm.quantity || 0) * Number(orderForm.unitPrice || 0);

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary/15 text-primary border-primary/20">Sales Pipeline Command Center</Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {enrichedOrders.length} active sales records
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Sales & Orders</h1>
              <p className="text-sm text-muted-foreground">
                Customer orders, production-driven fulfillment, dispatch tracking, and revenue visibility in one page.
              </p>
            </div>
          </div>

          <Dialog open={isOrderOpen} onOpenChange={setIsOrderOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                New Order
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Order</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createOrderMutation.mutate(orderForm); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select value={orderForm.customerId} onValueChange={(value) => setOrderForm({ ...orderForm, customerId: value })}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select
                    value={orderForm.stockItemId}
                    onValueChange={(value) => {
                      const product = productMap.get(value);
                      setOrderForm({
                        ...orderForm,
                        stockItemId: value,
                        unitPrice: Number(product?.unit_cost || 0),
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({Number(product.current_quantity || 0)} {product.unit_of_measure})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedProduct && (
                  <div className="rounded-lg border border-border bg-card/60 p-3 text-sm text-muted-foreground">
                    Available stock: {availableQuantity.toLocaleString()} {selectedProduct.unit_of_measure}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input type="number" min="1" value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit Price</Label>
                    <Input type="number" min="0" step="0.01" value={orderForm.unitPrice} onChange={(e) => setOrderForm({ ...orderForm, unitPrice: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Order Type</Label>
                    <Select value={orderForm.orderType} onValueChange={(value) => setOrderForm({ ...orderForm, orderType: value as OrderFormData['orderType'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct_sale">Direct Sale</SelectItem>
                        <SelectItem value="production_order">Production Order</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Inventory / Production</Label>
                    <Select value={orderForm.stockMode} onValueChange={(value) => setOrderForm({ ...orderForm, stockMode: value as OrderFormData['stockMode'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Use Available Stock</SelectItem>
                        <SelectItem value="production_required">Production Required</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Payment Status</Label>
                    <Select value={orderForm.paymentStatus} onValueChange={(value) => setOrderForm({ ...orderForm, paymentStatus: value as OrderFormData['paymentStatus'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Delivery</Label>
                    <Input type="date" value={orderForm.deliveryDate} onChange={(e) => setOrderForm({ ...orderForm, deliveryDate: e.target.value })} />
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card/60 p-3 text-sm text-muted-foreground">
                  Calculated total: {formatCurrency(calculatedTotal)}
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} />
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={createOrderMutation.isPending}>
                  Create Order
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
          <DashboardKpi title="Pending Orders" value={analytics.pendingOrders.length} detail="Orders waiting for action." icon={ClipboardList} tone="warning" onClick={() => setStatusFilter('pending')} />
          <DashboardKpi title="In Production" value={analytics.inProductionOrders.length} detail="Orders requiring production output." icon={Factory} tone="info" onClick={() => setStatusFilter('in_production')} />
          <DashboardKpi title="Quality Check" value={analytics.qualityOrders.length} detail="Orders in post-production review." icon={ShieldAlert} tone="info" onClick={() => setStatusFilter('quality_check')} />
          <DashboardKpi title="Ready For Dispatch" value={analytics.readyOrders.length} detail="Orders staged for outbound delivery." icon={Truck} tone="primary" onClick={() => setStatusFilter('ready_for_dispatch')} />
          <DashboardKpi title="Completed" value={analytics.completedOrders.length} detail="Delivered revenue-generating orders." icon={CheckCircle2} tone="success" onClick={() => setStatusFilter('completed')} />
          <DashboardKpi title="Rejected" value={analytics.rejectedOrders.length} detail="Cancelled or rejected orders." icon={XCircle} tone="danger" onClick={() => setStatusFilter('rejected')} />
          <DashboardKpi title="Sales Revenue" value={formatCurrency(analytics.totalSalesRevenue)} detail="Completed order revenue." icon={Banknote} tone="success" />
          <DashboardKpi title="Outstanding" value={formatCurrency(analytics.outstandingPayments)} detail="Orders with unpaid or partial payment." icon={AlertTriangle} tone="warning" />
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>Order Management</CardTitle>
              <p className="text-sm text-muted-foreground">
                Orders reserve stock when available, trigger production when needed, and feed dispatch completion workflow.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search order, customer, product..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {salesStatuses.map((status) => (
                    <SelectItem key={status} value={status}>{labelize(status)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={(value) => setPaymentFilter(value as typeof paymentFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentStatuses.map((status) => (
                    <SelectItem key={status} value={status}>{labelize(status)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
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
                    <TableHead>Order ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Expected Delivery</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">{order.order_number}</TableCell>
                      <TableCell>{formatDate(order.order_date || order.created_at)}</TableCell>
                      <TableCell className="font-medium">{order.customerName}</TableCell>
                      <TableCell>{order.product_name}</TableCell>
                      <TableCell className="text-right">{order.quantityValue.toLocaleString()}</TableCell>
                      <TableCell>{order.unit || '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.unitPriceValue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge className="bg-muted text-foreground border-border">{labelize(order.order_type)}</Badge>
                      </TableCell>
                      <TableCell>{statusBadge(order.status)}</TableCell>
                      <TableCell>{paymentBadge(order.payment_status)}</TableCell>
                      <TableCell>{formatDate(order.delivery_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {order.status !== 'completed' && order.status !== 'rejected' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setDispatchingOrder(order);
                                setDispatchForm({
                                  status: order.status === 'ready_for_dispatch' ? 'completed' : 'ready_for_dispatch',
                                  paymentStatus: order.payment_status as DispatchFormData['paymentStatus'],
                                  dispatchDate: new Date().toISOString().slice(0, 10),
                                  deliveryStatus: order.status === 'ready_for_dispatch' ? 'delivered' : 'in_transit',
                                  destination: order.customerName,
                                  driverName: '',
                                  vehicleRef: '',
                                  recipientName: order.customerName,
                                  notes: order.notes,
                                });
                              }}
                            >
                              {order.status === 'ready_for_dispatch' ? 'Complete' : 'Dispatch'}
                            </Button>
                          )}
                          {order.status !== 'completed' && order.status !== 'rejected' && (
                            <Button variant="outline" size="sm" onClick={() => statusMutation.mutate({ id: order.id, status: 'rejected' })}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredOrders.length && (
                    <TableRow>
                      <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                        No orders found for the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Total Customers</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{analytics.totalCustomers}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Repeat Customers</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{analytics.repeatCustomers}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">{analytics.topCustomer?.name || 'N/A'}</div>
              <div className="text-sm text-muted-foreground">{analytics.topCustomer ? formatCurrency(analytics.topCustomer.revenue) : 'No revenue yet'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Customers With Pending</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{analytics.customersWithPendingOrders}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Distribution / Delivery Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delivery ID</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Dispatch Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Driver / Handler</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distributionLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">{log.delivery_id.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">{log.order_number}</TableCell>
                      <TableCell>{log.customer}</TableCell>
                      <TableCell>{log.product}</TableCell>
                      <TableCell className="text-right">{log.quantity.toLocaleString()} {log.unit || ''}</TableCell>
                      <TableCell>{formatDate(log.dispatch_date)}</TableCell>
                      <TableCell><Badge className="bg-primary/20 text-primary border-primary/20">{labelize(log.delivery_status)}</Badge></TableCell>
                      <TableCell>{log.destination || '-'}</TableCell>
                      <TableCell>{log.driver_name || '-'}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{log.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {!distributionLogs.length && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                        No delivery logs recorded yet.
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
              <CardTitle>Monthly Sales Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={analytics.monthlySales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="label" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Area dataKey="revenue" stroke="hsl(var(--success))" fill="hsl(var(--success) / 0.25)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sales By Product / Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.salesByCategory.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis type="number" stroke="hsl(220, 10%, 55%)" />
                  <YAxis type="category" dataKey="name" width={120} stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Orders By Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={analytics.ordersByStatus} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
                    {analytics.ordersByStatus.map((_, index) => (
                      <Cell key={`status-${index}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.topCustomers}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="name" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="revenue" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Dialog open={!!dispatchingOrder} onOpenChange={(open) => { if (!open) setDispatchingOrder(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dispatchForm.status === 'completed' ? 'Complete Delivery' : 'Create Dispatch Log'}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!dispatchingOrder) return;
                dispatchMutation.mutate({ order: dispatchingOrder, data: dispatchForm });
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Next Status</Label>
                  <Select value={dispatchForm.status} onValueChange={(value) => setDispatchForm({ ...dispatchForm, status: value as DispatchFormData['status'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ready_for_dispatch">Ready For Dispatch</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Payment Status</Label>
                  <Select value={dispatchForm.paymentStatus} onValueChange={(value) => setDispatchForm({ ...dispatchForm, paymentStatus: value as DispatchFormData['paymentStatus'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Dispatch Date</Label>
                  <Input type="date" value={dispatchForm.dispatchDate} onChange={(e) => setDispatchForm({ ...dispatchForm, dispatchDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Delivery Status</Label>
                  <Input value={dispatchForm.deliveryStatus} onChange={(e) => setDispatchForm({ ...dispatchForm, deliveryStatus: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Destination</Label>
                  <Input value={dispatchForm.destination} onChange={(e) => setDispatchForm({ ...dispatchForm, destination: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Driver / Handler</Label>
                  <Input value={dispatchForm.driverName} onChange={(e) => setDispatchForm({ ...dispatchForm, driverName: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vehicle Ref</Label>
                  <Input value={dispatchForm.vehicleRef} onChange={(e) => setDispatchForm({ ...dispatchForm, vehicleRef: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Recipient Name</Label>
                  <Input value={dispatchForm.recipientName} onChange={(e) => setDispatchForm({ ...dispatchForm, recipientName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={dispatchForm.notes} onChange={(e) => setDispatchForm({ ...dispatchForm, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full gradient-primary" disabled={dispatchMutation.isPending}>
                {dispatchForm.status === 'completed' ? 'Complete Order' : 'Create Dispatch Log'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
