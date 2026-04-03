import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { UserCog } from 'lucide-react';

export default function Employees() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div><h1 className="text-3xl font-bold">Human Capital</h1><p className="text-muted-foreground">Employee management</p></div>
        <Card><CardContent className="p-12 text-center text-muted-foreground"><UserCog className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>HR module - Manage employees and departments</p></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
