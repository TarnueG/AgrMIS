import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { StatCard } from '@/components/dashboard/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { isCustomerRole } from '@/lib/roles';
import api from '@/lib/api';
import { ClipboardList, DollarSign, ShoppingCart } from 'lucide-react';

function CustomerPortalContent() {
  const navigate = useNavigate();
  const { data: orders } = useQuery({
    queryKey: ['customer-portal-orders'],
    queryFn: () => api.get<any[]>('/sales/orders').catch(() => []),
  });

  const pending = (orders ?? []).filter((order) => String(order.status || '').toLowerCase() === 'pending').length;
  const completed = (orders ?? []).filter((order) =>
    ['completed', 'delivered'].includes(String(order.status || '').toLowerCase())
  ).length;
  const totalValue = (orders ?? []).reduce(
    (sum, order) => sum + Number(order.total_amount || order.amount || 0),
    0
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Customer Portal</h1>
        <p className="text-muted-foreground">View your orders, order points, and account activity.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div onClick={() => navigate('/sales-order-points')} className="cursor-pointer">
          <StatCard title="Total Orders" value={orders?.length ?? 0} icon={ShoppingCart} variant="primary" />
        </div>
        <div onClick={() => navigate('/sales-order-points')} className="cursor-pointer">
          <StatCard title="Pending Orders" value={pending} icon={ClipboardList} variant="warning" />
        </div>
        <div onClick={() => navigate('/sales-order-points')} className="cursor-pointer">
          <StatCard title="Order Value" value={`$${totalValue.toLocaleString()}`} icon={DollarSign} variant="success" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Completed</span>
              <span>{completed}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Pending</span>
              <span>{pending}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Total</span>
              <span>{orders?.length ?? 0}</span>
            </div>
          </CardContent>
        </Card>
        <QuickActions />
      </div>
    </div>
  );
}

export default function CustomerPortal() {
  const { user } = useAuth();

  if (!isCustomerRole(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <CustomerPortalContent />
    </DashboardLayout>
  );
}
