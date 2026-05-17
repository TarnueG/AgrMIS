import { Link } from 'react-router-dom';
import { Package, Settings, ShoppingCart, Users, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { isCustomerRole } from '@/lib/roles';

const internalActions = [
  { title: 'New Order', icon: ShoppingCart, path: '/orders' },
  { title: 'Add Inventory', icon: Package, path: '/inventory' },
  { title: 'New Customer', icon: Users, path: '/customers' },
  { title: 'View Reports', icon: TrendingUp, path: '/reports' },
];

const customerActions = [
  { title: 'Order Points', icon: ShoppingCart, path: '/sales-order-points' },
  { title: 'Marketing', icon: TrendingUp, path: '/marketing' },
  { title: 'Portal Home', icon: Users, path: '/customer' },
  { title: 'Settings', icon: Settings, path: '/settings' },
];

export function QuickActions() {
  const { user } = useAuth();
  const { canView } = usePermissions();
  const customerRole = isCustomerRole(user?.role);
  const actions = customerRole
    ? customerActions
    : internalActions.filter((action) => {
        if (action.path === '/inventory') return canView('inventory');
        if (action.path === '/customers') return canView('crm');
        if (action.path === '/reports') return canView('reports');
        return canView('sales_order_points') || canView('marketing');
      });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <Link key={action.path} to={action.path}>
              <Button
                variant="outline"
                className="w-full h-auto py-4 flex flex-col gap-2 text-white hover:text-white"
              >
                <action.icon className="h-5 w-5" />
                <span className="text-xs">{action.title}</span>
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
