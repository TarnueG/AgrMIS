import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, Package } from 'lucide-react';

export default function Procurement() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div><h1 className="text-3xl font-bold">Procurement</h1><p className="text-muted-foreground">Supply chain and demand forecast</p></div>
        <Card><CardContent className="p-12 text-center text-muted-foreground"><Truck className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Procurement module - Add purchase orders and track suppliers</p></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
