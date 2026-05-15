import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentOrders } from '@/components/dashboard/RecentOrders';
import { InventoryAlerts } from '@/components/dashboard/InventoryAlerts';
import { usePermissions } from '@/hooks/usePermissions';
import {
  Wheat, Tractor, Package, DollarSign, Users,
  TrendingUp, Leaf, UserCog, ShoppingCart, ClipboardList,
  BarChart3, Wrench,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const productionData = [
  { name: 'Cocoa Beans', value: 400 },
  { name: 'Palm Oil',    value: 300 },
  { name: 'Dried Fish',  value: 200 },
  { name: 'Cattle',      value: 100 },
];
const COLORS = [
  'hsl(142, 70%, 50%)', 'hsl(38, 95%, 55%)',
  'hsl(200, 90%, 50%)', 'hsl(280, 70%, 55%)',
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'hsl(220, 25%, 12%)',
    border: '1px solid hsl(220, 20%, 20%)',
    borderRadius: '8px',
    color: '#ffffff',
  },
  labelStyle: { color: '#ffffff' },
  itemStyle: { color: '#ffffff' },
};

// ── Admin (full) dashboard ───────────────────────────────────────────────────

function AdminDashboard() {
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

      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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
      const totalRevenue = (marketingOrders as any[])
        .filter(o => ['completed', 'delivered'].includes(o.status))
        .reduce((s, o) => s + Number(o.amount || 0), 0);

      return { pigs: pigs.length, machinery: machinery.length, inStock, customers: customers.length, productionBatches: prodBatches.length, totalParcel: landParcels.length, revenue: totalRevenue, revenueData };
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Farm overview — all systems.</p>
      </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Revenue vs Expenses</CardTitle></CardHeader>
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
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(142, 70%, 50%)" fillOpacity={1} fill="url(#colorRevenue)" />
                <Area type="monotone" dataKey="expenses" stroke="hsl(38, 95%, 55%)" fillOpacity={1} fill="url(#colorExpenses)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Production Mix</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={productionData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {productionData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 justify-center mt-4">
              {productionData.map((e, i) => (
                <div key={e.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-sm text-white">{e.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RecentOrders />
        <InventoryAlerts />
        <QuickActions />
      </div>
    </div>
  );
}

// ── Mini dashboard helper ────────────────────────────────────────────────────

function MiniDashboard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

// ── Field Supervisor ─────────────────────────────────────────────────────────

function FieldSupervisorDashboard() {
  const navigate = useNavigate();
  const { data: employees } = useQuery({ queryKey: ['emp-mini'], queryFn: () => api.get<any[]>('/hr/employees').catch(() => []) });
  const { data: tasks } = useQuery({ queryKey: ['tasks-mini'], queryFn: () => api.get<any[]>('/hr/tasks').catch(() => []) });
  const { data: prodLogs } = useQuery({ queryKey: ['prodlog-mini'], queryFn: () => api.get<any[]>('/production/daily-logs').catch(() => []) });
  return (
    <MiniDashboard title="Field Supervisor" subtitle="Daily operations and team overview.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div onClick={() => navigate('/employees')} className="cursor-pointer">
          <StatCard title="Team Members" value={(employees as any[])?.length || 0} icon={Users} variant="primary" />
        </div>
        <div onClick={() => navigate('/employees')} className="cursor-pointer">
          <StatCard title="Pending Tasks" value={(tasks as any[])?.filter((t: any) => t.status === 'pending').length || 0} icon={ClipboardList} variant="warning" />
        </div>
        <div onClick={() => navigate('/production')} className="cursor-pointer">
          <StatCard title="Daily Logs" value={(prodLogs as any[])?.length || 0} icon={BarChart3} variant="accent" />
        </div>
      </div>
    </MiniDashboard>
  );
}

// ── Asset Manager ────────────────────────────────────────────────────────────

function AssetManagerDashboard() {
  const navigate = useNavigate();
  const { data: assets } = useQuery({ queryKey: ['assets-mini'], queryFn: () => api.get<any[]>('/assets').catch(() => []) });
  const { data: parcels } = useQuery({ queryKey: ['parcels-mini'], queryFn: () => api.get<any[]>('/land-parcels').catch(() => []) });
  const now = new Date();
  const maintenanceDue = (assets as any[])?.filter((a: any) => a.next_service_date && new Date(a.next_service_date) <= now).length || 0;
  return (
    <MiniDashboard title="Asset Manager" subtitle="Equipment and land parcel overview.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div onClick={() => navigate('/assets/machinery')} className="cursor-pointer">
          <StatCard title="Total Equipment" value={(assets as any[])?.length || 0} icon={Tractor} variant="primary" />
        </div>
        <div onClick={() => navigate('/assets/machinery')} className="cursor-pointer">
          <StatCard title="Maintenance Due" value={maintenanceDue} icon={Wrench} variant="warning" />
        </div>
        <div onClick={() => navigate('/assets/land')} className="cursor-pointer">
          <StatCard title="Land Parcels" value={(parcels as any[])?.length || 0} icon={Wheat} variant="accent" />
        </div>
      </div>
    </MiniDashboard>
  );
}

// ── Production Manager ───────────────────────────────────────────────────────

function ProductionManagerDashboard() {
  const navigate = useNavigate();
  const { data: livestock } = useQuery({ queryKey: ['liv-mini'], queryFn: () => api.get<any[]>('/livestock/pigs').catch(() => []) });
  const { data: batches } = useQuery({ queryKey: ['batch-mini'], queryFn: () => api.get<any[]>('/inventory/prod-batches').catch(() => []) });
  const { data: inventory } = useQuery({ queryKey: ['inv-mini'], queryFn: () => api.get<any[]>('/inventory/items').catch(() => []) });
  const lowStock = (inventory as any[])?.filter((i: any) => Number(i.quantity || 0) <= Number(i.threshold || 0)).length || 0;
  return (
    <MiniDashboard title="Production Manager" subtitle="Production and livestock overview.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div onClick={() => navigate('/assets/livestock')} className="cursor-pointer">
          <StatCard title="Livestock" value={(livestock as any[])?.length || 0} icon={Leaf} variant="primary" />
        </div>
        <div onClick={() => navigate('/production')} className="cursor-pointer">
          <StatCard title="Production Batches" value={(batches as any[])?.length || 0} icon={TrendingUp} variant="accent" />
        </div>
        <div onClick={() => navigate('/inventory')} className="cursor-pointer">
          <StatCard title="Low Stock Items" value={lowStock} icon={Package} variant="warning" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InventoryAlerts />
        <QuickActions />
      </div>
    </MiniDashboard>
  );
}

// ── Accounting ───────────────────────────────────────────────────────────────

function AccountingDashboard() {
  const navigate = useNavigate();
  const { data: orders } = useQuery({ queryKey: ['mkt-orders-mini'], queryFn: () => api.get<any[]>('/marketing/orders').catch(() => []) });
  const { data: wages } = useQuery({ queryKey: ['wages-mini'], queryFn: () => api.get<any[]>('/hr/wages').catch(() => []) });
  const revenue = (orders as any[])?.filter((o: any) => ['completed','delivered'].includes(o.status)).reduce((s: number, o: any) => s + Number(o.amount || 0), 0) || 0;
  const expenses = (wages as any[])?.filter((w: any) => w.payment_status === 'paid').reduce((s: number, w: any) => s + Number(w.amount || 0), 0) || 0;
  const pending = (orders as any[])?.filter((o: any) => o.payment_status === 'pending').length || 0;
  return (
    <MiniDashboard title="Finance" subtitle="Revenue, expenses, and payment overview.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div onClick={() => navigate('/finance')} className="cursor-pointer">
          <StatCard title="Total Revenue" value={`$${revenue.toLocaleString()}`} icon={DollarSign} variant="success" trend={{ value: 8.2, isPositive: true }} />
        </div>
        <div onClick={() => navigate('/finance')} className="cursor-pointer">
          <StatCard title="Total Expenses" value={`$${expenses.toLocaleString()}`} icon={DollarSign} variant="warning" />
        </div>
        <div onClick={() => navigate('/orders')} className="cursor-pointer">
          <StatCard title="Pending Payments" value={pending} icon={ClipboardList} variant="accent" />
        </div>
      </div>
    </MiniDashboard>
  );
}

// ── Marketing Manager ────────────────────────────────────────────────────────

function MarketingManagerDashboard() {
  const navigate = useNavigate();
  const { data: customers } = useQuery({ queryKey: ['cust-mini'], queryFn: () => api.get<any[]>('/sales/customers').catch(() => []) });
  const { data: orders } = useQuery({ queryKey: ['mkt-mini'], queryFn: () => api.get<any[]>('/marketing/orders').catch(() => []) });
  const active = (orders as any[])?.filter((o: any) => !['completed','cancelled','delivered'].includes(o.status)).length || 0;
  const revenue = (orders as any[])?.filter((o: any) => ['completed','delivered'].includes(o.status)).reduce((s: number, o: any) => s + Number(o.amount || 0), 0) || 0;
  return (
    <MiniDashboard title="Marketing" subtitle="Customer and sales order overview.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div onClick={() => navigate('/customers')} className="cursor-pointer">
          <StatCard title="Customers" value={(customers as any[])?.length || 0} icon={Users} variant="primary" />
        </div>
        <div onClick={() => navigate('/marketing')} className="cursor-pointer">
          <StatCard title="Active Orders" value={active} icon={ShoppingCart} variant="accent" />
        </div>
        <div onClick={() => navigate('/marketing')} className="cursor-pointer">
          <StatCard title="Sales Revenue" value={`$${revenue.toLocaleString()}`} icon={DollarSign} variant="success" trend={{ value: 5, isPositive: true }} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentOrders />
        <QuickActions />
      </div>
    </MiniDashboard>
  );
}

// ── Human Resource ───────────────────────────────────────────────────────────

function HumanResourceDashboard() {
  const navigate = useNavigate();
  const { data: employees } = useQuery({ queryKey: ['emp-hr-mini'], queryFn: () => api.get<any[]>('/hr/employees').catch(() => []) });
  const { data: tasks } = useQuery({ queryKey: ['tasks-hr-mini'], queryFn: () => api.get<any[]>('/hr/tasks').catch(() => []) });
  const { data: attendance } = useQuery({ queryKey: ['att-mini'], queryFn: () => api.get<any[]>('/hr/attendance').catch(() => []) });
  const today = new Date().toISOString().split('T')[0];
  const todayAtt = (attendance as any[])?.filter((a: any) => (a.log_date || a.date || '').startsWith(today)).length || 0;
  const pendingTasks = (tasks as any[])?.filter((t: any) => t.status === 'pending').length || 0;
  return (
    <MiniDashboard title="Human Capital" subtitle="Workforce and attendance overview.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div onClick={() => navigate('/employees')} className="cursor-pointer">
          <StatCard title="Total Employees" value={(employees as any[])?.length || 0} icon={UserCog} variant="primary" />
        </div>
        <div onClick={() => navigate('/employees')} className="cursor-pointer">
          <StatCard title="Today's Attendance" value={todayAtt} icon={ClipboardList} variant="accent" />
        </div>
        <div onClick={() => navigate('/employees')} className="cursor-pointer">
          <StatCard title="Pending Tasks" value={pendingTasks} icon={BarChart3} variant="warning" />
        </div>
      </div>
    </MiniDashboard>
  );
}

// ── Customer ─────────────────────────────────────────────────────────────────

function CustomerDashboard() {
  const navigate = useNavigate();
  const { data: orders } = useQuery({ queryKey: ['my-orders-mini'], queryFn: () => api.get<any[]>('/sales/orders').catch(() => []) });
  const pending = (orders as any[])?.filter((o: any) => o.status === 'pending').length || 0;
  const completed = (orders as any[])?.filter((o: any) => ['completed', 'delivered'].includes(o.status)).length || 0;
  const total = (orders as any[])?.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) || 0;
  return (
    <MiniDashboard title="My Dashboard" subtitle="Your orders and activity.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div onClick={() => navigate('/sales-order-points')} className="cursor-pointer">
          <StatCard title="Total Orders" value={(orders as any[])?.length || 0} icon={ShoppingCart} variant="primary" />
        </div>
        <div onClick={() => navigate('/sales-order-points')} className="cursor-pointer">
          <StatCard title="Pending Orders" value={pending} icon={ClipboardList} variant="warning" />
        </div>
        <div onClick={() => navigate('/sales-order-points')} className="cursor-pointer">
          <StatCard title="Order Value" value={`$${total.toLocaleString()}`} icon={DollarSign} variant="success" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Order Status</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Completed', count: completed, color: 'bg-green-500' },
                { label: 'Pending', count: pending, color: 'bg-yellow-500' },
                { label: 'Total', count: (orders as any[])?.length || 0, color: 'bg-blue-500' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${color}`} />
                    <span className="text-sm text-white">{label}</span>
                  </div>
                  <span className="text-sm font-medium text-white">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <QuickActions />
      </div>
    </MiniDashboard>
  );
}

// ── Router ───────────────────────────────────────────────────────────────────

const ROLE_DASHBOARD: Record<string, React.ComponentType> = {
  field_supervisor:   FieldSupervisorDashboard,
  asset_manager:      AssetManagerDashboard,
  production_manager: ProductionManagerDashboard,
  accountant:         AccountingDashboard,
  marketing_manager:  MarketingManagerDashboard,
  human_resource:     HumanResourceDashboard,
  customer:           CustomerDashboard,
};

export default function Dashboard() {
  const { role, isAdmin, isLoading } = usePermissions();

  const RoleDash = !isLoading && !isAdmin
    ? (ROLE_DASHBOARD[role.toLowerCase().replace(/ /g, '_')] ?? null)
    : null;

  return (
    <DashboardLayout>
      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>
      ) : isAdmin ? (
        <AdminDashboard />
      ) : RoleDash ? (
        <RoleDash />
      ) : (
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>
      )}
    </DashboardLayout>
  );
}
