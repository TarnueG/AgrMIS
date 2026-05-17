import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentOrders } from '@/components/dashboard/RecentOrders';
import { InventoryAlerts } from '@/components/dashboard/InventoryAlerts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { isCustomerRole } from '@/lib/roles';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  DollarSign,
  Factory,
  Package,
  Tractor,
  Truck,
  UserCog,
  Users,
} from 'lucide-react';

type DashboardStats = {
  inventoryValue: number;
  lowStockItems: number;
  pendingProcurement: number;
  productionOutput: number;
  activeSalesOrders: number;
  customerCount: number;
  laborSummary: number;
  assetSummary: number;
  financeSummary: number;
  alertSummary: number;
};

function InternalDashboard() {
  const navigate = useNavigate();
  const { canView } = usePermissions();

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['internal-dashboard-stats'],
    queryFn: async () => {
      const [
        inventoryItems,
        procurementOrders,
        productionBatches,
        marketingOrders,
        customers,
        employees,
        assets,
        alerts,
      ] = await Promise.all([
        canView('inventory') ? api.get<any[]>('/inventory/items').catch(() => []) : Promise.resolve([]),
        canView('procurement') ? api.get<any[]>('/procurement/purchase-orders').catch(() => []) : Promise.resolve([]),
        canView('production') ? api.get<any[]>('/inventory/prod-batches').catch(() => []) : Promise.resolve([]),
        canView('sales_order_points') || canView('marketing') ? api.get<any[]>('/marketing/orders').catch(() => []) : Promise.resolve([]),
        canView('crm') ? api.get<any[]>('/sales/customers').catch(() => []) : Promise.resolve([]),
        canView('human_capital') ? api.get<any[]>('/hr/employees').catch(() => []) : Promise.resolve([]),
        canView('machinery') || canView('land_parcels') ? api.get<any[]>('/assets').catch(() => []) : Promise.resolve([]),
        canView('inventory') ? api.get<any[]>('/inventory/alerts?status=open').catch(() => []) : Promise.resolve([]),
      ]);

      const inventoryValue = (inventoryItems as any[]).reduce((sum, item) => {
        const quantity = Number(item.quantity || 0);
        const unitValue = Number(item.unit_price || item.cost_price || item.price || 0);
        return sum + quantity * unitValue;
      }, 0);

      const lowStockItems = (inventoryItems as any[]).filter(
        (item) => Number(item.quantity || 0) <= Number(item.threshold || 0)
      ).length;

      const pendingProcurement = (procurementOrders as any[]).filter((order) =>
        !['received', 'completed', 'cancelled'].includes(String(order.status || '').toLowerCase())
      ).length;

      const productionOutput = (productionBatches as any[]).reduce(
        (sum, batch) => sum + Number(batch.quantity || 0),
        0
      );

      const activeSalesOrders = (marketingOrders as any[]).filter((order) =>
        !['completed', 'delivered', 'cancelled'].includes(String(order.status || '').toLowerCase())
      ).length;

      const customerCount = (customers as any[]).filter((customer) => customer.is_active !== false).length;
      const laborSummary = (employees as any[]).filter((employee) => employee.deleted_at == null).length;

      const now = new Date();
      const assetSummary = (assets as any[]).filter((asset) => {
        if (!asset.next_service_date) return false;
        return new Date(asset.next_service_date) <= now;
      }).length;

      const financeSummary = (marketingOrders as any[]).reduce((sum, order) => {
        if (!['completed', 'delivered'].includes(String(order.status || '').toLowerCase())) return sum;
        return sum + Number(order.amount || order.total_amount || 0);
      }, 0);

      return {
        inventoryValue,
        lowStockItems,
        pendingProcurement,
        productionOutput,
        activeSalesOrders,
        customerCount,
        laborSummary,
        assetSummary,
        financeSummary,
        alertSummary: (alerts as any[]).length,
      };
    },
  });

  const cards = [
    canView('inventory') && {
      title: 'Inventory Value',
      value: `$${(stats?.inventoryValue ?? 0).toLocaleString()}`,
      icon: Package,
      variant: 'primary' as const,
      onClick: () => navigate('/inventory'),
    },
    canView('inventory') && {
      title: 'Low Stock Items',
      value: stats?.lowStockItems ?? 0,
      icon: AlertTriangle,
      variant: 'warning' as const,
      onClick: () => navigate('/inventory'),
    },
    canView('procurement') && {
      title: 'Pending Procurement',
      value: stats?.pendingProcurement ?? 0,
      icon: Truck,
      variant: 'accent' as const,
      onClick: () => navigate('/procurement'),
    },
    canView('production') && {
      title: 'Production Output',
      value: stats?.productionOutput ?? 0,
      icon: Factory,
      variant: 'success' as const,
      onClick: () => navigate('/production'),
    },
    (canView('sales_order_points') || canView('marketing')) && {
      title: 'Active Sales Orders',
      value: stats?.activeSalesOrders ?? 0,
      icon: ClipboardList,
      variant: 'default' as const,
      onClick: () => navigate('/orders'),
    },
    canView('crm') && {
      title: 'Customer Count',
      value: stats?.customerCount ?? 0,
      icon: Users,
      variant: 'default' as const,
      onClick: () => navigate('/customers'),
    },
    canView('human_capital') && {
      title: 'Labor Summary',
      value: stats?.laborSummary ?? 0,
      icon: UserCog,
      variant: 'accent' as const,
      onClick: () => navigate('/employees'),
    },
    (canView('machinery') || canView('land_parcels')) && {
      title: 'Assets Requiring Service',
      value: stats?.assetSummary ?? 0,
      icon: Tractor,
      variant: 'warning' as const,
      onClick: () => navigate('/assets/machinery'),
    },
    canView('finance') && {
      title: 'Revenue Summary',
      value: `$${(stats?.financeSummary ?? 0).toLocaleString()}`,
      icon: DollarSign,
      variant: 'success' as const,
      onClick: () => navigate('/finance'),
    },
    (canView('reports') || canView('inventory')) && {
      title: 'Reports / Alerts',
      value: stats?.alertSummary ?? 0,
      icon: BarChart3,
      variant: 'primary' as const,
      onClick: () => navigate(canView('reports') ? '/reports' : '/inventory'),
    },
  ].filter(Boolean) as Array<{
    title: string;
    value: string | number;
    icon: any;
    variant: 'primary' | 'warning' | 'accent' | 'success' | 'default';
    onClick: () => void;
  }>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">AMIS Dashboard</h1>
        <p className="text-muted-foreground">Operational overview across inventory, procurement, production, sales, labor, assets, finance, and alerts.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.title} onClick={card.onClick} className="cursor-pointer">
            <StatCard title={card.title} value={card.value} icon={card.icon} variant={card.variant} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {(canView('sales_order_points') || canView('marketing') || canView('crm')) && <RecentOrders />}
        {canView('inventory') && <InventoryAlerts />}
        <QuickActions />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Internal System Scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Dashboard remains the internal AMIS landing page for staff and administrators.</p>
            <p>Customer access is isolated to the customer portal and does not replace internal operations.</p>
            <p>Visible KPI blocks follow the current user’s subsystem permissions instead of collapsing the whole dashboard into a customer view.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Inventory alerts: {(stats?.alertSummary ?? 0).toLocaleString()}</p>
            <p>Pending procurement: {(stats?.pendingProcurement ?? 0).toLocaleString()}</p>
            <p>Active sales orders: {(stats?.activeSalesOrders ?? 0).toLocaleString()}</p>
            <p>Production output: {(stats?.productionOutput ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  if (isCustomerRole(user?.role)) {
    return <Navigate to="/customer" replace />;
  }

  return (
    <DashboardLayout>
      <InternalDashboard />
    </DashboardLayout>
  );
}
