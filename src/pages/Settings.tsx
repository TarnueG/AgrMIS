import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Settings as SettingsIcon, Shield } from 'lucide-react';

export function Settings() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div><h1 className="text-3xl font-bold">Settings</h1><p className="text-muted-foreground">System configuration</p></div>
        <Card><CardContent className="p-12 text-center text-muted-foreground"><SettingsIcon className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Configure system settings and preferences</p></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}

export function AccessControl() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div><h1 className="text-3xl font-bold">Access Control</h1><p className="text-muted-foreground">Security and permissions</p></div>
        <Card><CardContent className="p-12 text-center text-muted-foreground"><Shield className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Manage user roles and permissions</p></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
