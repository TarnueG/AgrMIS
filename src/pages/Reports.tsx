import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ClipboardList, DollarSign, Package, Truck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';

const COLORS = [
  'hsl(142, 70%, 50%)',
  'hsl(38, 95%, 55%)',
  'hsl(200, 90%, 50%)',
  'hsl(280, 70%, 55%)',
  'hsl(12, 88%, 58%)',
  'hsl(172, 65%, 45%)',
];

function monthKey(dateValue?: string | null) {
  const date = dateValue ? new Date(dateValue) : new Date();
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
}

function cardValueCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Reports() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-dashboard'],
    queryFn: async () => {
      const [inventory, procurement, marketingOrders, salesOrders] = await Promise.all([
        api.get<any[]>('/inventory/showcase-items').catch(() => []),
        api.get<any[]>('/procurement/showcase').catch(() => []),
        api.get<any[]>('/marketing/orders').catch(() => []),
        api.get<any[]>('/sales/orders').catch(() => []),
      ]);

      return { inventory, procurement, marketingOrders, salesOrders };
    },
  });

  const analytics = useMemo(() => {
    const inventory = data?.inventory ?? [];
    const procurement = data?.procurement ?? [];
    const marketingOrders = data?.marketingOrders ?? [];
    const salesOrders = data?.salesOrders ?? [];

    const inventoryValue = inventory.reduce(
      (sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0),
      0,
    );

    const openProcurementValue = procurement
      .filter((row: any) => row.status !== 'received')
      .reduce((sum: number, row: any) => sum + Number(row.total_cost || 0), 0);

    const activeOrders = [...marketingOrders, ...salesOrders].filter((order: any) => {
      const status = String(order.status || '').toLowerCase();
      return !['completed', 'delivered', 'cancelled', 'received'].includes(status);
    }).length;

    const lowStockCount = inventory.filter(
      (item: any) => Number(item.quantity || 0) <= Number(item.min_stock_level || 0),
    ).length;

    const months = Array.from({ length: 6 }).map((_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index));
      const label = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
      return { label, sales: 0, procurement: 0 };
    });

    const monthMap = new Map(months.map((month) => [month.label, month]));
    for (const order of marketingOrders) {
      const bucket = monthMap.get(monthKey(order.date));
      if (bucket) bucket.sales += Number(order.amount || 0);
    }
    for (const order of salesOrders) {
      const bucket = monthMap.get(monthKey(order.created_at || order.order_date));
      if (bucket) bucket.sales += Number(order.total_amount || 0);
    }
    for (const row of procurement) {
      const bucket = monthMap.get(monthKey(row.created_at || row.expected_date));
      if (bucket) bucket.procurement += Number(row.total_cost || 0);
    }

    const categoryMap = new Map<string, number>();
    for (const item of inventory) {
      const key = String(item.category || 'uncategorized')
        .split('_')
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      categoryMap.set(key, (categoryMap.get(key) || 0) + Number(item.quantity || 0));
    }

    const productMix = Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return {
      inventoryValue,
      openProcurementValue,
      activeOrders,
      lowStockCount,
      monthlyFlow: months,
      productMix,
    };
  }, [data]);

  const kpis = [
    { title: 'Inventory Value', value: cardValueCurrency(analytics.inventoryValue), icon: Package },
    { title: 'Open Procurement', value: cardValueCurrency(analytics.openProcurementValue), icon: Truck },
    { title: 'Active Orders', value: analytics.activeOrders, icon: ClipboardList },
    { title: 'Low Stock Items', value: analytics.lowStockCount, icon: BarChart3 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">Live operational snapshots from inventory, procurement, and sales data.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ title, value, icon: Icon }) => (
            <Card key={title}>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm text-muted-foreground">{title}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-3 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Sales vs Procurement Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={analytics.monthlyFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="label" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(220, 25%, 12%)',
                      border: '1px solid hsl(220, 20%, 20%)',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="sales" fill="hsl(142, 70%, 50%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="procurement" fill="hsl(38, 95%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Category Mix</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={analytics.productMix} cx="50%" cy="50%" outerRadius={110} dataKey="value" label>
                    {analytics.productMix.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(220, 25%, 12%)',
                      border: '1px solid hsl(220, 20%, 20%)',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Operations Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{isLoading ? 'Loading analytics…' : `Inventory currently tracks ${data?.inventory?.length ?? 0} active showcase items across stocked, low-stock, and held categories.`}</p>
              <p>{isLoading ? 'Loading analytics…' : `${data?.procurement?.length ?? 0} procurement rows are available, with ${analytics.lowStockCount} items already sitting at or below minimum levels.`}</p>
              <p>{isLoading ? 'Loading analytics…' : `Commercial activity combines ${(data?.marketingOrders?.length ?? 0) + (data?.salesOrders?.length ?? 0)} seeded orders from marketing and sales.`}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Financial Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p><DollarSign className="mr-2 inline h-4 w-4 text-success" />Inventory carrying value: {cardValueCurrency(analytics.inventoryValue)}</p>
              <p><Truck className="mr-2 inline h-4 w-4 text-warning" />Open procurement exposure: {cardValueCurrency(analytics.openProcurementValue)}</p>
              <p><ClipboardList className="mr-2 inline h-4 w-4 text-primary" />Operational order queue: {analytics.activeOrders} active orders</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
