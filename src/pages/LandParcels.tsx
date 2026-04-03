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
import { Plus, Wheat, Search, Trash2, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const soilTypes = ['loamy', 'clay', 'sandy', 'silty', 'peaty'];
const statuses = ['active', 'fallow', 'preparation', 'harvested'];

export default function LandParcels() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    size_hectares: 0,
    crop_type: '',
    soil_type: 'loamy',
    status: 'active',
    location: '',
    notes: '',
  });

  const { data: parcels } = useQuery({
    queryKey: ['land-parcels'],
    queryFn: async () => {
      const { data, error } = await supabase.from('land_parcels').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('land_parcels').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['land-parcels'] });
      toast({ title: 'Land parcel added' });
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('land_parcels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['land-parcels'] });
      toast({ title: 'Land parcel deleted' });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', size_hectares: 0, crop_type: '', soil_type: 'loamy', status: 'active', location: '', notes: '' });
  };

  const totalHectares = parcels?.reduce((sum, p) => sum + Number(p.size_hectares || 0), 0) || 0;
  const activeParcels = parcels?.filter(p => p.status === 'active').length || 0;

  const filteredParcels = parcels?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.crop_type?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-success/20 text-success',
      fallow: 'bg-warning/20 text-warning',
      preparation: 'bg-info/20 text-info',
      harvested: 'bg-accent/20 text-accent',
    };
    return colors[status] || 'bg-muted';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Land Parcels</h1>
            <p className="text-muted-foreground">Manage agricultural land and crops</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Parcel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Land Parcel</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(formData); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Size (Hectares)</Label>
                    <Input type="number" step="0.01" value={formData.size_hectares} onChange={(e) => setFormData({ ...formData, size_hectares: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Crop Type</Label>
                    <Input value={formData.crop_type} onChange={(e) => setFormData({ ...formData, crop_type: e.target.value })} placeholder="Corn, Wheat..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Soil Type</Label>
                    <Select value={formData.soil_type} onValueChange={(v) => setFormData({ ...formData, soil_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {soilTypes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={addMutation.isPending}>Add Parcel</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/20"><Wheat className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Land</p>
                <p className="text-2xl font-bold">{totalHectares.toFixed(1)} ha</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-success/10 border-success/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-success/20"><MapPin className="h-6 w-6 text-success" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Active Parcels</p>
                <p className="text-2xl font-bold">{activeParcels}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-accent/10 border-accent/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent/20"><Wheat className="h-6 w-6 text-accent" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Parcels</p>
                <p className="text-2xl font-bold">{parcels?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search parcels..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Crop</TableHead>
                  <TableHead>Soil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParcels?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{Number(p.size_hectares).toFixed(1)} ha</TableCell>
                    <TableCell>{p.crop_type || '-'}</TableCell>
                    <TableCell className="capitalize">{p.soil_type}</TableCell>
                    <TableCell><Badge className={getStatusColor(p.status)}>{p.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredParcels?.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No land parcels found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
