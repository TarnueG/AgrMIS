import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function InventoryAlerts() {
  const { data: lowStockItems, isLoading } = useQuery({
    queryKey: ['low-stock-alerts'],
    queryFn: async () => {
      const alerts = await api.get<any[]>('/inventory/alerts?status=open');
      return alerts.slice(0, 5).map(a => ({
        id: a.id,
        item_name: a.stock_items?.name ?? '',
        category: a.stock_items?.unit_of_measure ?? '',
        quantity: Number(a.quantity_at_trigger),
        min_stock_level: Number(a.stock_items?.reorder_threshold ?? 0),
        unit: a.stock_items?.unit_of_measure ?? '',
      }));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Low Stock Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : lowStockItems && lowStockItems.length > 0 ? (
          <div className="space-y-3">
            {lowStockItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg bg-warning/10 border border-warning/20"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-warning/20">
                    <Package className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="font-medium">{item.item_name}</p>
                    <p className="text-sm text-muted-foreground">{item.category}</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
                  {item.quantity} / {item.min_stock_level} {item.unit}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            All inventory levels are healthy
          </p>
        )}
      </CardContent>
    </Card>
  );
}
