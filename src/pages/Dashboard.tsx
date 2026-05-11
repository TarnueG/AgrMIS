import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentOrders } from '@/components/dashboard/RecentOrders';
import { InventoryAlerts } from '@/components/dashboard/InventoryAlerts';
import {
  Wheat,
  Tractor,
  Package,
  DollarSign,
  Users,
  TrendingUp,
  Leaf,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';


const productionData = [
  { name: 'Cocoa Beans', value: 400 },
  { name: 'Palm Oil', value: 300 },
  { name: 'Dried Fish', value: 200 },
  { name: 'Cattle', value: 100 },
];

const COLORS = ['hsl(142, 70%, 50%)', 'hsl(38, 95%, 55%)', 'hsl(200, 90%, 50%)', 'hsl(280, 70%, 55%)'];

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [pigs, machinery, inventoryItems, customers, prodBatches, landParcels, marketingOrders, wages, contractorPayments] = await Promise.all([
        api.get<any[]>('/livestock/pigs').catch(() => []),
        api.get<any[]>('/assets').catch(() => []),
        api.get<any[]>('/inventory/items').catch(() => []),
        api.get<any[]>('/sales/customers').catch(() => []),
        api.get<any[]>('/inventory/prod-batches').catch(() => []),
        api.get<any[]>('/land-parcels').catch(() => []),
        api.get<any[]>('/marketing/orders').catch(() => []),
        api.get<any[]>('/hr/wages').catch(() => []),
        api.get<any[]>('/hr/contractor-payments').catch(() => []),
      ]);

      const inStock = (inventoryItems as any[]).filter(i => Number(i.quantity || 0) > Number(i.threshold || 0)).length;

      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const now = new Date();
      const revenueMap: Record<string, { revenue: number; expenses: number }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        revenueMap[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = { revenue: 0, expenses: 0 };
      }
      for (const o of marketingOrders as any[]) {
        if (!['completed', 'delivered'].includes(o.status)) continue;
        const d = new Date(o.created_at || o.updated_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (revenueMap[key]) revenueMap[key].revenue += Number(o.amount || 0);
      }
      for (const w of wages as any[]) {
        if (w.payment_status !== 'paid') continue;
        const d = new Date(w.paid_at || w.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (revenueMap[key]) revenueMap[key].expenses += Number(w.amount || 0);
      }
      for (const cp of contractorPayments as any[]) {
        if (cp.payment_status !== 'paid') continue;
        const d = new Date(cp.paid_at || cp.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (revenueMap[key]) revenueMap[key].expenses += Number(cp.amount || 0);
      }
      const revenueData = Object.entries(revenueMap).map(([key, val]) => {
        const [, m] = key.split('-');
        return { month: MONTHS[parseInt(m) - 1], ...val };
      });

      const totalRevenue = (marketingOrders as any[]).filter(o => ['completed', 'delivered'].includes(o.status)).reduce((s, o) => s + Number(o.amount || 0), 0);

      return { pigs: pigs.length, machinery: machinery.length, inStock, customers: customers.length, productionBatches: prodBatches.length, totalParcel: landParcels.length, revenue: totalRevenue, revenueData };
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your farm overview.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div onClick={() => navigate('/assets/livestock')} className="cursor-pointer">
            <StatCard title="Pigs" value={stats?.pigs || 0} icon={Leaf} variant="primary" trend={{ value: 12, isPositive: true }} />
          </div>
          <div onClick={() => navigate('/assets/land')} className="cursor-pointer">
            <StatCard title="Total Parcel" value={stats?.totalParcel || 0} icon={Wheat} variant="accent" trend={{ value: 5, isPositive: true }} />
          </div>
          <div onClick={() => navigate('/assets/machinery')} className="cursor-pointer">
            <StatCard title="Total Equipment" value={stats?.machinery || 0} icon={Tractor} variant="default" />
          </div>
          <div onClick={() => navigate('/inventory')} className="cursor-pointer">
            <StatCard title="In-Stock" value={stats?.inStock || 0} icon={Package} variant="warning" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div onClick={() => navigate('/customers')} className="cursor-pointer">
            <StatCard title="Customers" value={stats?.customers || 0} icon={Users} variant="default" />
          </div>
          <div onClick={() => navigate('/orders')} className="cursor-pointer">
            <StatCard title="Total Revenue" value={`$${(stats?.revenue || 0).toLocaleString()}`} icon={DollarSign} variant="success" trend={{ value: 8.2, isPositive: true }} />
          </div>
          <div onClick={() => navigate('/production')} className="cursor-pointer">
            <StatCard title="Production Batches" value={stats?.productionBatches || 0} icon={TrendingUp} variant="accent" trend={{ value: 15, isPositive: true }} />
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Revenue vs Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={stats?.revenueData ?? []}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 70%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142, 70%, 50%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(38, 95%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(38, 95%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="month" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(220, 25%, 12%)',
                      border: '1px solid hsl(220, 20%, 20%)',
                      borderRadius: '8px',
                      color: '#ffffff',
                    }}
                    labelStyle={{ color: '#ffffff' }}
                    itemStyle={{ color: '#ffffff' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(142, 70%, 50%)"
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stroke="hsl(38, 95%, 55%)"
                    fillOpacity={1}
                    fill="url(#colorExpenses)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Production Mix</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={productionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {productionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(220, 25%, 12%)',
                      border: '1px solid hsl(220, 20%, 20%)',
                      borderRadius: '8px',
                      color: '#ffffff',
                    }}
                    labelStyle={{ color: '#ffffff' }}
                    itemStyle={{ color: '#ffffff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 justify-center mt-4">
                {productionData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index] }}
                    />
                    <span className="text-sm text-white">{entry.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <RecentOrders />
          <InventoryAlerts />
          <QuickActions />
        </div>
      </div>
    </DashboardLayout>
  );
}
