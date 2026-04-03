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
import { Plus, Leaf, Search, Trash2, Heart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const animalTypes = ['cattle', 'sheep', 'goat', 'pig', 'poultry', 'horse', 'other'];
const healthStatuses = ['healthy', 'sick', 'recovering', 'quarantine'];

export default function Livestock() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    animal_type: 'cattle',
    breed: '',
    quantity: 0,
    health_status: 'healthy',
    location: '',
    notes: '',
  });

  const { data: livestock } = useQuery({
    queryKey: ['livestock'],
    queryFn: async () => {
      const { data, error } = await supabase.from('livestock').select('*').order('animal_type');
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('livestock').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['livestock'] });
      toast({ title: 'Livestock added' });
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('livestock').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['livestock'] });
      toast({ title: 'Livestock deleted' });
    },
  });

  const resetForm = () => {
    setFormData({ animal_type: 'cattle', breed: '', quantity: 0, health_status: 'healthy', location: '', notes: '' });
  };

  const totalAnimals = livestock?.reduce((sum, l) => sum + (l.quantity || 0), 0) || 0;
  const healthyCount = livestock?.filter(l => l.health_status === 'healthy').reduce((sum, l) => sum + (l.quantity || 0), 0) || 0;

  const filteredLivestock = livestock?.filter(l =>
    l.animal_type.toLowerCase().includes(search.toLowerCase()) ||
    l.breed?.toLowerCase().includes(search.toLowerCase())
  );

  const getHealthColor = (status: string) => {
    const colors: Record<string, string> = {
      healthy: 'bg-success/20 text-success',
      sick: 'bg-destructive/20 text-destructive',
      recovering: 'bg-warning/20 text-warning',
      quarantine: 'bg-info/20 text-info',
    };
    return colors[status] || 'bg-muted';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Livestock</h1>
            <p className="text-muted-foreground">Manage farm animals and their health</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Livestock
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Livestock</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(formData); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Animal Type</Label>
                    <Select value={formData.animal_type} onValueChange={(v) => setFormData({ ...formData, animal_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {animalTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Breed</Label>
                    <Input value={formData.breed} onChange={(e) => setFormData({ ...formData, breed: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Health Status</Label>
                    <Select value={formData.health_status} onValueChange={(v) => setFormData({ ...formData, health_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {healthStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Barn A, Pasture 1..." />
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={addMutation.isPending}>Add Livestock</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/20"><Leaf className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Animals</p>
                <p className="text-2xl font-bold">{totalAnimals}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-success/10 border-success/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-success/20"><Heart className="h-6 w-6 text-success" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Healthy</p>
                <p className="text-2xl font-bold">{healthyCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-accent/10 border-accent/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent/20"><Leaf className="h-6 w-6 text-accent" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Groups</p>
                <p className="text-2xl font-bold">{livestock?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search livestock..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Breed</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLivestock?.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium capitalize">{l.animal_type}</TableCell>
                    <TableCell>{l.breed || '-'}</TableCell>
                    <TableCell>{l.quantity}</TableCell>
                    <TableCell><Badge className={getHealthColor(l.health_status)}>{l.health_status}</Badge></TableCell>
                    <TableCell>{l.location || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(l.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredLivestock?.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No livestock found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
