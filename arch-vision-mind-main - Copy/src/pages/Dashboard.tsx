import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  ShoppingCart,
  TrendingUp,
  Leaf,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const revenueData = [
  { month: 'Jan', revenue: 4000, expenses: 2400 },
  { month: 'Feb', revenue: 3000, expenses: 1398 },
  { month: 'Mar', revenue: 2000, expenses: 9800 },
  { month: 'Apr', revenue: 2780, expenses: 3908 },
  { month: 'May', revenue: 1890, expenses: 4800 },
  { month: 'Jun', revenue: 2390, expenses: 3800 },
];

const productionData = [
  { name: 'Corn', value: 400 },
  { name: 'Wheat', value: 300 },
  { name: 'Soybeans', value: 200 },
  { name: 'Rice', value: 100 },
];

const COLORS = ['hsl(142, 70%, 50%)', 'hsl(38, 95%, 55%)', 'hsl(200, 90%, 50%)', 'hsl(280, 70%, 55%)'];

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [livestock, land, machinery, inventory, customers, orders] = await Promise.all([
        supabase.from('livestock').select('quantity'),
        supabase.from('land_parcels').select('size_hectares'),
        supabase.from('machinery').select('id', { count: 'exact' }),
        supabase.from('inventory').select('quantity'),
        supabase.from('customers').select('id', { count: 'exact' }),
        supabase.from('orders').select('total_amount'),
      ]);

      const totalLivestock = livestock.data?.reduce((sum, l) => sum + (l.quantity || 0), 0) || 0;
      const totalLand = land.data?.reduce((sum, l) => sum + Number(l.size_hectares || 0), 0) || 0;
      const totalMachinery = machinery.count || 0;
      const totalInventory = inventory.data?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
      const totalCustomers = customers.count || 0;
      const totalRevenue = orders.data?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;

      return {
        livestock: totalLivestock,
        land: totalLand,
        machinery: totalMachinery,
        inventory: totalInventory,
        customers: totalCustomers,
        revenue: totalRevenue,
      };
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
          <StatCard
            title="Total Livestock"
            value={stats?.livestock || 0}
            icon={Leaf}
            variant="primary"
            trend={{ value: 12, isPositive: true }}
          />
          <StatCard
            title="Land (Hectares)"
            value={stats?.land?.toFixed(1) || 0}
            icon={Wheat}
            variant="accent"
            trend={{ value: 5, isPositive: true }}
          />
          <StatCard
            title="Machinery"
            value={stats?.machinery || 0}
            icon={Tractor}
            variant="default"
          />
          <StatCard
            title="Inventory Items"
            value={stats?.inventory || 0}
            icon={Package}
            variant="warning"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Customers"
            value={stats?.customers || 0}
            icon={Users}
            variant="default"
          />
          <StatCard
            title="Total Revenue"
            value={`$${(stats?.revenue || 0).toLocaleString()}`}
            icon={DollarSign}
            variant="success"
            trend={{ value: 8.2, isPositive: true }}
          />
          <StatCard
            title="Active Orders"
            value={12}
            icon={ShoppingCart}
            variant="primary"
          />
          <StatCard
            title="Production Output"
            value="1,234 kg"
            icon={TrendingUp}
            variant="accent"
            trend={{ value: 15, isPositive: true }}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Revenue vs Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueData}>
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
                    }}
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
                    }}
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
                    <span className="text-sm text-muted-foreground">{entry.name}</span>
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
