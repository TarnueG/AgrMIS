import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function InventoryAlerts() {
  const { data: lowStockItems, isLoading } = useQuery({
    queryKey: ['low-stock-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('quantity', { ascending: true })
        .limit(5);
      
      if (error) throw error;
      return data?.filter(item => item.quantity <= item.min_stock_level) || [];
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
