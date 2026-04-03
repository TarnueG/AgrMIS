import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Factory, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const statusColors: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  in_progress: 'bg-info/20 text-info',
  quality_check: 'bg-accent/20 text-accent',
  passed: 'bg-success/20 text-success',
  failed: 'bg-destructive/20 text-destructive',
  rework: 'bg-warning/20 text-warning',
};

export default function Production() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    product_name: '',
    quantity: 0,
    order_id: '',
    notes: '',
  });

  const { data: batches } = useQuery({
    queryKey: ['production-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('production_batches')
        .select('*, orders(id, customers(name))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ['orders-for-production'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customers(name)')
        .in('status', ['pending', 'in_production']);
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('production_batches').insert([{
        ...data,
        order_id: data.order_id || null,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-batches'] });
      toast({ title: 'Production batch created' });
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, quality_result }: { id: string; status: string; quality_result?: string }) => {
      const { error } = await supabase.from('production_batches').update({ status, quality_result }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-batches'] });
      toast({ title: 'Status updated' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('production_batches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-batches'] });
      toast({ title: 'Batch deleted' });
    },
  });

  const resetForm = () => {
    setFormData({
      product_name: '',
      quantity: 0,
      order_id: '',
      notes: '',
    });
  };

  const filteredBatches = batches?.filter(b =>
    b.product_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Production Execution</h1>
            <p className="text-muted-foreground">Manage production batches and quality control</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                New Batch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Production Batch</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(formData); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Product Name</Label>
                  <Input
                    value={formData.product_name}
                    onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Linked Order</Label>
                    <Select value={formData.order_id} onValueChange={(v) => setFormData({ ...formData, order_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        {orders?.map(o => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.customers?.name || 'Unknown'} - Order
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={addMutation.isPending}>
                  Create Batch
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {['pending', 'in_progress', 'quality_check', 'passed', 'failed', 'rework'].map(status => (
            <Card key={status} className={`${statusColors[status]} border`}>
              <CardContent className="p-4">
                <p className="text-xs capitalize">{status.replace('_', ' ')}</p>
                <p className="text-xl font-bold">{batches?.filter(b => b.status === status).length || 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search batches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Linked Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBatches?.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.product_name}</TableCell>
                    <TableCell>{batch.quantity}</TableCell>
                    <TableCell>{batch.orders?.customers?.name || '-'}</TableCell>
                    <TableCell>
                      <Select value={batch.status} onValueChange={(v) => updateStatus.mutate({ id: batch.id, status: v })}>
                        <SelectTrigger className={`w-32 ${statusColors[batch.status]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="quality_check">Quality Check</SelectItem>
                          <SelectItem value="passed">Passed</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="rework">Rework</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {batch.quality_result ? (
                        <Badge className={batch.quality_result === 'pass' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>
                          {batch.quality_result}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(batch.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredBatches?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No production batches found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
