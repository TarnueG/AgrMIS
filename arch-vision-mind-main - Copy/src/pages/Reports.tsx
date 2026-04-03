import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, DollarSign, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const salesData = [
  { month: 'Jan', sales: 4000 }, { month: 'Feb', sales: 3000 }, { month: 'Mar', sales: 5000 },
  { month: 'Apr', sales: 4500 }, { month: 'May', sales: 6000 }, { month: 'Jun', sales: 5500 },
];

const productData = [
  { name: 'Corn', value: 400 }, { name: 'Wheat', value: 300 }, { name: 'Soybeans', value: 200 }, { name: 'Rice', value: 100 },
];

const COLORS = ['hsl(142, 70%, 50%)', 'hsl(38, 95%, 55%)', 'hsl(200, 90%, 50%)', 'hsl(280, 70%, 55%)'];

export default function Reports() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">Business intelligence and insights</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Monthly Sales</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="month" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="sales" fill="hsl(142, 70%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Product Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={productData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
                    {productData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
