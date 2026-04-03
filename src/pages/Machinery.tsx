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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Tractor, Search, Trash2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const types = ['tractor', 'harvester', 'planter', 'sprayer', 'irrigation', 'other'];
const statuses = ['operational', 'maintenance', 'broken', 'retired'];

export default function Machinery() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'tractor',
    model: '',
    status: 'operational',
    notes: '',
  });

  const { data: machinery } = useQuery({
    queryKey: ['machinery'],
    queryFn: async () => {
      const { data, error } = await supabase.from('machinery').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('machinery').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machinery'] });
      toast({ title: 'Machinery added' });
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('machinery').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machinery'] });
      toast({ title: 'Machinery deleted' });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', type: 'tractor', model: '', status: 'operational', notes: '' });
  };

  const operational = machinery?.filter(m => m.status === 'operational').length || 0;
  const needsMaintenance = machinery?.filter(m => m.status === 'maintenance').length || 0;

  const filteredMachinery = machinery?.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.type.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      operational: 'bg-success/20 text-success',
      maintenance: 'bg-warning/20 text-warning',
      broken: 'bg-destructive/20 text-destructive',
      retired: 'bg-muted text-muted-foreground',
    };
    return colors[status] || 'bg-muted';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Machinery</h1>
            <p className="text-muted-foreground">Manage farm equipment and vehicles</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Machinery
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Machinery</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(formData); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={addMutation.isPending}>Add Machinery</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/20"><Tractor className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Equipment</p>
                <p className="text-2xl font-bold">{machinery?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-success/10 border-success/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-success/20"><Tractor className="h-6 w-6 text-success" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Operational</p>
                <p className="text-2xl font-bold">{operational}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-warning/10 border-warning/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-warning/20"><Wrench className="h-6 w-6 text-warning" /></div>
              <div>
                <p className="text-sm text-muted-foreground">In Maintenance</p>
                <p className="text-2xl font-bold">{needsMaintenance}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search machinery..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Maintenance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMachinery?.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="capitalize">{m.type}</TableCell>
                    <TableCell>{m.model || '-'}</TableCell>
                    <TableCell><Badge className={getStatusColor(m.status)}>{m.status}</Badge></TableCell>
                    <TableCell>{m.last_maintenance ? format(new Date(m.last_maintenance), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(m.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredMachinery?.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No machinery found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
