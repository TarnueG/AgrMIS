import { Link } from 'react-router-dom';
import { 
  Plus, 
  FileText, 
  TrendingUp, 
  Package,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const actions = [
  { 
    title: 'New Order', 
    icon: ShoppingCart, 
    path: '/orders',
    color: 'bg-primary hover:bg-primary/90' 
  },
  { 
    title: 'Add Inventory', 
    icon: Package, 
    path: '/inventory',
    color: 'bg-accent hover:bg-accent/90 text-accent-foreground' 
  },
  { 
    title: 'New Customer', 
    icon: Users, 
    path: '/customers',
    color: 'bg-info hover:bg-info/90' 
  },
  { 
    title: 'View Reports', 
    icon: TrendingUp, 
    path: '/reports',
    color: 'bg-secondary hover:bg-secondary/90' 
  },
];

export function QuickActions() {
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
                className={`w-full h-auto py-4 flex flex-col gap-2 ${action.color}`}
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
