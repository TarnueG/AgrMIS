import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Trash2, Heart, AlertTriangle, Leaf, Package } from 'lucide-react';
import { format } from 'date-fns';

type LivestockView = 'pigs' | 'cattle' | 'birds' | 'fish' | 'mortality' | 'health';

const isWithin24h = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    healthy: 'bg-success/20 text-success',
    sick: 'bg-warning/20 text-warning',
    dead: 'bg-destructive/20 text-destructive',
    available: 'bg-success/20 text-success',
    full: 'bg-destructive/20 text-destructive',
  };
  return map[status] || 'bg-muted text-muted-foreground';
}

const BLANK_PIG = { pig_id: '', breed: '', gender: 'unknown', status: 'healthy', pen_number: '', date_recorded: '' };
const BLANK_CATTLE = { cattle_id: '', cattle_type: 'cow', status: 'healthy', location: '' };
const BLANK_BIRD = { bird_type: 'chicken', batch_number: '', number_of_birds: 0, number_of_female: 0, number_of_male: 0 };
const BLANK_POND = { pond_id: '', length_m: '', width_m: '', location: '', capacity: 2000, status: 'available' };
const BLANK_FISH = { fish_type: '', batch_number: '', number_of_fish: 0 };
const BLANK_MORTALITY = { livestock_type: 'pig', breed_or_type: '', record_id: '', pen_or_location: '', cause_of_death: '' };

export default function Livestock() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedView, setSelectedView] = useState<LivestockView>('pigs');
  const [search, setSearch] = useState('');

  const [isPigOpen, setIsPigOpen] = useState(false);
  const [isCattleOpen, setIsCattleOpen] = useState(false);
  const [isBirdOpen, setIsBirdOpen] = useState(false);
  const [isPondOpen, setIsPondOpen] = useState(false);
  const [isFishOpen, setIsFishOpen] = useState(false);
  const [isMortalityOpen, setIsMortalityOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);

  const [birdFilter, setBirdFilter] = useState('');
  const [mortalityFilter, setMortalityFilter] = useState('');
  const [selectedPondId, setSelectedPondId] = useState('');

  const [pigForm, setPigForm] = useState({ ...BLANK_PIG });
  const [cattleForm, setCattleForm] = useState({ ...BLANK_CATTLE });
  const [birdForm, setBirdForm] = useState({ ...BLANK_BIRD });
  const [pondForm, setPondForm] = useState<any>({ ...BLANK_POND });
  const [fishForm, setFishForm] = useState({ ...BLANK_FISH });
  const [mortalityForm, setMortalityForm] = useState({ ...BLANK_MORTALITY });

  const { data: pigs = [] } = useQuery<any[]>({ queryKey: ['pigs'], queryFn: () => api.get('/livestock/pigs') });
  const { data: cattle = [] } = useQuery<any[]>({ queryKey: ['cattle'], queryFn: () => api.get('/livestock/cattle') });
  const { data: birds = [] } = useQuery<any[]>({ queryKey: ['birds', birdFilter], queryFn: () => api.get(`/livestock/birds${birdFilter ? '?type=' + birdFilter : ''}`) });
  const { data: ponds = [] } = useQuery<any[]>({ queryKey: ['fish-ponds'], queryFn: () => api.get('/livestock/fish-ponds') });
  const { data: fish = [] } = useQuery<any[]>({ queryKey: ['fish-stock', selectedPondId], queryFn: () => selectedPondId ? api.get(`/livestock/fish-ponds/${selectedPondId}/fish`) : Promise.resolve([]), enabled: !!selectedPondId });
  const { data: mortality = [] } = useQuery<any[]>({ queryKey: ['mortality', mortalityFilter], queryFn: () => api.get(`/livestock/mortality${mortalityFilter ? '?type=' + mortalityFilter : ''}`) });

  const pigAdd = useMutation({
    mutationFn: (d: typeof pigForm) => api.post('/livestock/pigs', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pigs'] }); toast({ title: 'Pig added' }); setIsPigOpen(false); setPigForm({ ...BLANK_PIG }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const pigEdit = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/livestock/pigs/${id}`, d),
    onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ['pigs'] }); qc.invalidateQueries({ queryKey: ['mortality'] }); toast({ title: data?.migrated ? 'Pig moved to mortality' : 'Pig updated' }); setEditItem(null); setIsPigOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const pigDelete = useMutation({
    mutationFn: (id: string) => api.delete(`/livestock/pigs/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pigs'] }); toast({ title: 'Pig deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const cattleAdd = useMutation({
    mutationFn: (d: typeof cattleForm) => api.post('/livestock/cattle', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cattle'] }); toast({ title: 'Cattle added' }); setIsCattleOpen(false); setCattleForm({ ...BLANK_CATTLE }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const cattleEdit = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/livestock/cattle/${id}`, d),
    onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ['cattle'] }); qc.invalidateQueries({ queryKey: ['mortality'] }); toast({ title: data?.migrated ? 'Cattle moved to mortality' : 'Cattle updated' }); setEditItem(null); setIsCattleOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const cattleDelete = useMutation({
    mutationFn: (id: string) => api.delete(`/livestock/cattle/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cattle'] }); toast({ title: 'Cattle deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const birdAdd = useMutation({
    mutationFn: (d: typeof birdForm) => api.post('/livestock/birds', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['birds'] }); toast({ title: 'Birds batch added' }); setIsBirdOpen(false); setBirdForm({ ...BLANK_BIRD }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const birdEdit = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/livestock/birds/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['birds'] }); toast({ title: 'Birds updated' }); setEditItem(null); setIsBirdOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const pondAdd = useMutation({
    mutationFn: (d: any) => api.post('/livestock/fish-ponds', { ...d, length_m: d.length_m ? Number(d.length_m) : undefined, width_m: d.width_m ? Number(d.width_m) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fish-ponds'] }); toast({ title: 'Fish pond added' }); setIsPondOpen(false); setPondForm({ ...BLANK_POND }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const fishAdd = useMutation({
    mutationFn: (d: typeof fishForm) => api.post(`/livestock/fish-ponds/${selectedPondId}/fish`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fish-stock', selectedPondId] }); qc.invalidateQueries({ queryKey: ['fish-ponds'] }); toast({ title: 'Fish added' }); setIsFishOpen(false); setFishForm({ ...BLANK_FISH }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const fishEdit = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/livestock/fish/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fish-stock', selectedPondId] }); toast({ title: 'Fish updated' }); setEditItem(null); setIsFishOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const fishDelete = useMutation({
    mutationFn: (id: string) => api.delete(`/livestock/fish/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fish-stock', selectedPondId] }); qc.invalidateQueries({ queryKey: ['fish-ponds'] }); toast({ title: 'Fish record deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const mortalityAdd = useMutation({
    mutationFn: (d: typeof mortalityForm) => api.post('/livestock/mortality', d),
    onSuccess: () => { ['mortality', 'pigs', 'cattle', 'birds', 'fish-stock'].forEach(k => qc.invalidateQueries({ queryKey: [k] })); toast({ title: 'Mortality record added' }); setIsMortalityOpen(false); setMortalityForm({ ...BLANK_MORTALITY }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const mortalityEdit = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/livestock/mortality/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mortality'] }); toast({ title: 'Record updated' }); setEditItem(null); setIsMortalityOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const mortalityCancel = useMutation({
    mutationFn: (id: string) => api.delete(`/livestock/mortality/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mortality'] }); toast({ title: 'Record cancelled' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const filteredPigs = pigs.filter(p => p.pig_id?.toLowerCase().includes(search.toLowerCase()) || p.breed?.toLowerCase().includes(search.toLowerCase()));
  const filteredCattle = cattle.filter(c => c.cattle_id?.toLowerCase().includes(search.toLowerCase()) || c.cattle_type?.toLowerCase().includes(search.toLowerCase()));
  const filteredBirds = birds.filter(b => b.batch_number?.toLowerCase().includes(search.toLowerCase()));
  const filteredFish = fish.filter(f => f.fish_type?.toLowerCase().includes(search.toLowerCase()) || f.batch_number?.toLowerCase().includes(search.toLowerCase()));
  const filteredMortality = mortality.filter(m => m.record_id?.toLowerCase().includes(search.toLowerCase()) || m.breed_or_type?.toLowerCase().includes(search.toLowerCase()));

  const CARDS: Array<{ key: LivestockView; label: string; count: number; color: string; icon: any }> = [
    { key: 'pigs', label: 'Pigs', count: pigs.length, color: 'bg-pink-500/10 border-pink-500/20', icon: Package },
    { key: 'fish', label: 'Fish Ponds', count: ponds.length, color: 'bg-blue-500/10 border-blue-500/20', icon: Package },
    { key: 'health', label: 'Health', count: 0, color: 'bg-success/10 border-success/20', icon: Heart },
    { key: 'mortality', label: 'Mortality', count: mortality.length, color: 'bg-destructive/10 border-destructive/20', icon: AlertTriangle },
    { key: 'birds', label: 'Birds', count: birds.length, color: 'bg-yellow-500/10 border-yellow-500/20', icon: Leaf },
    { key: 'cattle', label: 'Cattle', count: cattle.length, color: 'bg-amber-500/10 border-amber-500/20', icon: Package },
  ];

  function openEditPig(pig: any) { setPigForm({ pig_id: pig.pig_id, breed: pig.breed ?? '', gender: pig.gender, status: pig.status, pen_number: pig.pen_number ?? '', date_recorded: '' }); setEditItem(pig); setIsPigOpen(true); }
  function openEditCattle(c: any) { setCattleForm({ cattle_id: c.cattle_id, cattle_type: c.cattle_type, status: c.status, location: c.location ?? '' }); setEditItem(c); setIsCattleOpen(true); }
  function openEditBird(b: any) { setBirdForm({ bird_type: b.bird_type, batch_number: b.batch_number, number_of_birds: b.number_of_birds, number_of_female: b.number_of_female, number_of_male: b.number_of_male }); setEditItem(b); setIsBirdOpen(true); }
  function openEditFish(f: any) { setFishForm({ fish_type: f.fish_type, batch_number: f.batch_number, number_of_fish: f.number_of_fish }); setEditItem(f); setIsFishOpen(true); }
  function openEditMortality(m: any) { setMortalityForm({ livestock_type: m.livestock_type, breed_or_type: m.breed_or_type ?? '', record_id: m.record_id ?? '', pen_or_location: m.pen_or_location ?? '', cause_of_death: m.cause_of_death ?? '' }); setEditItem(m); setIsMortalityOpen(true); }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Livestock</h1>
            <p className="text-muted-foreground">Manage farm animals, fish ponds, and mortality records</p>
          </div>
          <div className="flex gap-2">
            {selectedView === 'pigs' && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditItem(null); setPigForm({ ...BLANK_PIG }); setIsPigOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Pigs
              </Button>
            )}
            {selectedView === 'cattle' && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditItem(null); setCattleForm({ ...BLANK_CATTLE }); setIsCattleOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Cattle
              </Button>
            )}
            {selectedView === 'birds' && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditItem(null); setBirdForm({ ...BLANK_BIRD }); setIsBirdOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Birds
              </Button>
            )}
            {selectedView === 'fish' && (
              <>
                <Button className="gradient-primary text-black font-medium" onClick={() => { setPondForm({ ...BLANK_POND }); setIsPondOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />Add Fishpond
                </Button>
                <Button variant="outline" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => { setEditItem(null); setFishForm({ ...BLANK_FISH }); setIsFishOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />Add Fish
                </Button>
              </>
            )}
            {selectedView === 'mortality' && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditItem(null); setMortalityForm({ ...BLANK_MORTALITY }); setIsMortalityOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Dead Livestock
              </Button>
            )}
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {CARDS.map(({ key, label, count, color, icon: Icon }) => (
            <Card key={key} onClick={() => setSelectedView(key)}
              className={`cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${color} ${selectedView === key ? 'ring-2 ring-primary shadow-lg scale-105' : ''}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/10"><Icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">{count}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => setSearch('')} className="pl-9 text-white placeholder:text-white/50" />
          </div>
          {selectedView === 'birds' && (
            <select value={birdFilter} onChange={(e) => setBirdFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
              <option value="">All Birds</option>
              <option value="chicken">Chickens</option>
              <option value="duck">Ducks</option>
            </select>
          )}
          {selectedView === 'mortality' && (
            <select value={mortalityFilter} onChange={(e) => setMortalityFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
              <option value="">All Types</option>
              <option value="pig">Pigs</option>
              <option value="cattle">Cattle</option>
              <option value="fish">Fish</option>
              <option value="bird">Birds</option>
            </select>
          )}
          {selectedView === 'fish' && (
            <select value={selectedPondId} onChange={(e) => setSelectedPondId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
              <option value="">Show all ponds</option>
              {ponds.map((p: any) => <option key={p.id} value={p.id}>{p.pond_id} ({p.status})</option>)}
            </select>
          )}
        </div>

        {/* PIGS TABLE */}
        {selectedView === 'pigs' && (
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Pig ID</TableHead><TableHead>Breed</TableHead><TableHead>Gender</TableHead>
                <TableHead>Status</TableHead><TableHead>Pen Number</TableHead><TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredPigs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.pig_id}</TableCell>
                    <TableCell>{p.breed || '-'}</TableCell>
                    <TableCell className="capitalize">{p.gender}</TableCell>
                    <TableCell>
                      <select value={p.status} disabled={!isWithin24h(p.created_at)}
                        onChange={(e) => { const ns = e.target.value; if (ns === 'dead') { if (confirm('Mark as dead? This pig will move to mortality records.')) pigEdit.mutate({ id: p.id, status: 'dead' }); } else pigEdit.mutate({ id: p.id, status: ns }); }}
                        className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                        <option value="healthy">Healthy</option><option value="sick">Sick</option><option value="dead">Dead</option>
                      </select>
                    </TableCell>
                    <TableCell>{p.pen_number || '-'}</TableCell>
                    <TableCell>{p.date_recorded ? format(new Date(p.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" disabled={!isWithin24h(p.created_at)} onClick={() => openEditPig(p)}>Edit</Button>
                      <Button variant="ghost" size="icon" disabled={!isWithin24h(p.created_at)} onClick={() => { if (confirm('Delete this pig record?')) pigDelete.mutate(p.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredPigs.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No pig records found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* CATTLE TABLE */}
        {selectedView === 'cattle' && (
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Type</TableHead><TableHead>Cattle ID</TableHead><TableHead>Status</TableHead>
                <TableHead>Location</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredCattle.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium capitalize">{c.cattle_type}</TableCell>
                    <TableCell>{c.cattle_id}</TableCell>
                    <TableCell>
                      <select value={c.status} disabled={!isWithin24h(c.created_at)}
                        onChange={(e) => { const ns = e.target.value; if (ns === 'dead') { if (confirm('Mark as dead? This cattle will move to mortality records.')) cattleEdit.mutate({ id: c.id, status: 'dead' }); } else cattleEdit.mutate({ id: c.id, status: ns }); }}
                        className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                        <option value="healthy">Healthy</option><option value="sick">Sick</option><option value="dead">Dead</option>
                      </select>
                    </TableCell>
                    <TableCell>{c.location || '-'}</TableCell>
                    <TableCell>{c.date_recorded ? format(new Date(c.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" disabled={!isWithin24h(c.created_at)} onClick={() => openEditCattle(c)}>Edit</Button>
                      <Button variant="ghost" size="icon" disabled={!isWithin24h(c.created_at)} onClick={() => { if (confirm('Delete this cattle record?')) cattleDelete.mutate(c.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredCattle.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No cattle records found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* BIRDS TABLE */}
        {selectedView === 'birds' && (
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Type</TableHead><TableHead>Batch Number</TableHead><TableHead>Total Birds</TableHead>
                <TableHead>Female</TableHead><TableHead>Male</TableHead><TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredBirds.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium capitalize">{b.bird_type}</TableCell>
                    <TableCell>{b.batch_number}</TableCell>
                    <TableCell>{b.number_of_birds}</TableCell>
                    <TableCell>{b.number_of_female}</TableCell>
                    <TableCell>{b.number_of_male}</TableCell>
                    <TableCell>{b.date_recorded ? format(new Date(b.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" disabled={!isWithin24h(b.created_at)} onClick={() => openEditBird(b)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredBirds.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No bird records found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* FISH — POND LIST */}
        {selectedView === 'fish' && !selectedPondId && (
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Pond ID</TableHead><TableHead>Length (m)</TableHead><TableHead>Width (m)</TableHead>
                <TableHead>Location</TableHead><TableHead>Capacity</TableHead><TableHead>Fish Count</TableHead>
                <TableHead>Status</TableHead><TableHead>Date</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ponds.map((p: any) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-accent/10" onClick={() => setSelectedPondId(p.id)}>
                    <TableCell className="font-medium">{p.pond_id}</TableCell>
                    <TableCell>{p.length_m ?? '-'}</TableCell>
                    <TableCell>{p.width_m ?? '-'}</TableCell>
                    <TableCell>{p.location || '-'}</TableCell>
                    <TableCell>{p.capacity}</TableCell>
                    <TableCell>{p.current_fish_count}</TableCell>
                    <TableCell><Badge className={statusBadge(p.status)}>{p.status}</Badge></TableCell>
                    <TableCell>{p.created_at ? format(new Date(p.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                  </TableRow>
                ))}
                {!ponds.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No fish ponds yet — click "Add Fishpond" to create one</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* FISH — STOCK IN SELECTED POND */}
        {selectedView === 'fish' && !!selectedPondId && (
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fish Type</TableHead><TableHead>Batch Number</TableHead>
                <TableHead>Number of Fish</TableHead><TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredFish.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.fish_type}</TableCell>
                    <TableCell>{f.batch_number}</TableCell>
                    <TableCell>{f.number_of_fish}</TableCell>
                    <TableCell>{f.date_recorded ? format(new Date(f.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => openEditFish(f)}>Edit</Button>
                      {isWithin24h(f.created_at) && (
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this fish record?')) fishDelete.mutate(f.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredFish.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No fish records in this pond</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* MORTALITY TABLE */}
        {selectedView === 'mortality' && (
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Type</TableHead><TableHead>Breed / Type</TableHead><TableHead>ID / Batch</TableHead>
                <TableHead>Pen / Location</TableHead><TableHead>Cause of Death</TableHead>
                <TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredMortality.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium capitalize">{m.livestock_type}</TableCell>
                    <TableCell>{m.breed_or_type || '-'}</TableCell>
                    <TableCell>{m.record_id || '-'}</TableCell>
                    <TableCell>{m.pen_or_location || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{m.cause_of_death || '-'}</TableCell>
                    <TableCell><Badge className="bg-destructive/20 text-destructive">{m.status}</Badge></TableCell>
                    <TableCell>{m.date_recorded ? format(new Date(m.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" disabled={!isWithin24h(m.created_at)} onClick={() => openEditMortality(m)}>Update</Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm('Cancel this mortality record?')) mortalityCancel.mutate(m.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredMortality.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No mortality records</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* HEALTH PLACEHOLDER */}
        {selectedView === 'health' && (
          <Card>
            <CardContent className="py-16 flex flex-col items-center justify-center gap-4">
              <Heart className="h-12 w-12 text-success/50" />
              <p className="text-muted-foreground text-center">Health monitoring module coming in a future phase.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* PIG DIALOG */}
      <Dialog open={isPigOpen} onOpenChange={(o) => { setIsPigOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Edit Pig Record' : 'Add Pig'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); editItem ? pigEdit.mutate({ id: editItem.id, ...pigForm }) : pigAdd.mutate(pigForm); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Pig ID</Label><Input value={pigForm.pig_id} onChange={(e) => setPigForm({ ...pigForm, pig_id: e.target.value })} required disabled={!!editItem} /></div>
              <div className="space-y-2"><Label>Breed</Label><Input value={pigForm.breed} onChange={(e) => setPigForm({ ...pigForm, breed: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <select value={pigForm.gender} onChange={(e) => setPigForm({ ...pigForm, gender: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <option value="unknown">Unknown</option><option value="male">Male</option><option value="female">Female</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select value={pigForm.status} onChange={(e) => setPigForm({ ...pigForm, status: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <option value="healthy">Healthy</option><option value="sick">Sick</option><option value="dead">Dead</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Pig Pen Number</Label><Input value={pigForm.pen_number} onChange={(e) => setPigForm({ ...pigForm, pen_number: e.target.value })} placeholder="Block A01" /></div>
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={pigForm.date_recorded} onChange={(e) => setPigForm({ ...pigForm, date_recorded: e.target.value })} /></div>
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={pigAdd.isPending || pigEdit.isPending}>{editItem ? 'Save Changes' : 'Add Pig'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* CATTLE DIALOG */}
      <Dialog open={isCattleOpen} onOpenChange={(o) => { setIsCattleOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Edit Cattle Record' : 'Add Cattle'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); editItem ? cattleEdit.mutate({ id: editItem.id, ...cattleForm }) : cattleAdd.mutate(cattleForm); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select value={cattleForm.cattle_type} onChange={(e) => setCattleForm({ ...cattleForm, cattle_type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <option value="cow">Cow</option><option value="goat">Goat</option><option value="sheep">Sheep</option>
                </select>
              </div>
              <div className="space-y-2"><Label>Cattle ID</Label><Input value={cattleForm.cattle_id} onChange={(e) => setCattleForm({ ...cattleForm, cattle_id: e.target.value })} required disabled={!!editItem} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <select value={cattleForm.status} onChange={(e) => setCattleForm({ ...cattleForm, status: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <option value="healthy">Healthy</option><option value="sick">Sick</option><option value="dead">Dead</option>
                </select>
              </div>
              <div className="space-y-2"><Label>Location</Label><Input value={cattleForm.location} onChange={(e) => setCattleForm({ ...cattleForm, location: e.target.value })} /></div>
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={cattleAdd.isPending || cattleEdit.isPending}>{editItem ? 'Save Changes' : 'Add Cattle'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* BIRD DIALOG */}
      <Dialog open={isBirdOpen} onOpenChange={(o) => { setIsBirdOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Edit Bird Record' : 'Add Birds'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); editItem ? birdEdit.mutate({ id: editItem.id, ...birdForm }) : birdAdd.mutate(birdForm); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bird Type</Label>
                <select value={birdForm.bird_type} onChange={(e) => setBirdForm({ ...birdForm, bird_type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <option value="chicken">Chicken</option><option value="duck">Duck</option>
                </select>
              </div>
              <div className="space-y-2"><Label>Batch Number</Label><Input value={birdForm.batch_number} onChange={(e) => setBirdForm({ ...birdForm, batch_number: e.target.value })} required /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Total Birds</Label><Input type="number" value={birdForm.number_of_birds} onChange={(e) => setBirdForm({ ...birdForm, number_of_birds: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>Female</Label><Input type="number" value={birdForm.number_of_female} onChange={(e) => setBirdForm({ ...birdForm, number_of_female: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>Male</Label><Input type="number" value={birdForm.number_of_male} onChange={(e) => setBirdForm({ ...birdForm, number_of_male: Number(e.target.value) })} /></div>
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={birdAdd.isPending || birdEdit.isPending}>{editItem ? 'Save Changes' : 'Add Birds'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ADD FISHPOND DIALOG */}
      <Dialog open={isPondOpen} onOpenChange={setIsPondOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Fishpond</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); pondAdd.mutate(pondForm); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Fishpond ID</Label><Input value={pondForm.pond_id} onChange={(e) => setPondForm({ ...pondForm, pond_id: e.target.value })} placeholder="Pond A1" required /></div>
              <div className="space-y-2"><Label>Location</Label><Input value={pondForm.location} onChange={(e) => setPondForm({ ...pondForm, location: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Length (m)</Label><Input type="number" step="0.01" value={pondForm.length_m} onChange={(e) => setPondForm({ ...pondForm, length_m: e.target.value })} /></div>
              <div className="space-y-2"><Label>Width (m)</Label><Input type="number" step="0.01" value={pondForm.width_m} onChange={(e) => setPondForm({ ...pondForm, width_m: e.target.value })} /></div>
              <div className="space-y-2"><Label>Capacity</Label><Input type="number" value={pondForm.capacity} onChange={(e) => setPondForm({ ...pondForm, capacity: Number(e.target.value) })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <select value={pondForm.status} onChange={(e) => setPondForm({ ...pondForm, status: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                <option value="available">Available</option><option value="full">Full</option>
              </select>
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={pondAdd.isPending}>Add Fishpond</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ADD/EDIT FISH DIALOG */}
      <Dialog open={isFishOpen} onOpenChange={(o) => { setIsFishOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Edit Fish Record' : 'Add Fish'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); editItem ? fishEdit.mutate({ id: editItem.id, ...fishForm }) : fishAdd.mutate(fishForm); }} className="space-y-4">
            {!editItem && (
              <div className="space-y-2">
                <Label>Select Fishpond</Label>
                <select value={selectedPondId} onChange={(e) => setSelectedPondId(e.target.value)} required className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <option value="">Choose pond...</option>
                  {ponds.map((p: any) => <option key={p.id} value={p.id}>{p.pond_id}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Type of Fish</Label><Input value={fishForm.fish_type} onChange={(e) => setFishForm({ ...fishForm, fish_type: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Batch Number</Label><Input value={fishForm.batch_number} onChange={(e) => setFishForm({ ...fishForm, batch_number: e.target.value })} required /></div>
            </div>
            <div className="space-y-2"><Label>Number of Fish</Label><Input type="number" value={fishForm.number_of_fish} onChange={(e) => setFishForm({ ...fishForm, number_of_fish: Number(e.target.value) })} /></div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={fishAdd.isPending || fishEdit.isPending}>{editItem ? 'Save Changes' : 'Add Fish'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* MORTALITY DIALOG */}
      <Dialog open={isMortalityOpen} onOpenChange={(o) => { setIsMortalityOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Update Mortality Record' : 'Add Dead Livestock'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); editItem ? mortalityEdit.mutate({ id: editItem.id, ...mortalityForm }) : mortalityAdd.mutate(mortalityForm); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Livestock Type</Label>
              <select value={mortalityForm.livestock_type} onChange={(e) => setMortalityForm({ ...mortalityForm, livestock_type: e.target.value })} disabled={!!editItem} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                <option value="pig">Pig</option><option value="cattle">Cattle</option><option value="fish">Fish</option><option value="bird">Bird</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {mortalityForm.livestock_type === 'pig' && (
                <>
                  <div className="space-y-2"><Label>Breed</Label><Input value={mortalityForm.breed_or_type} onChange={(e) => setMortalityForm({ ...mortalityForm, breed_or_type: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Pen Number</Label><Input value={mortalityForm.pen_or_location} onChange={(e) => setMortalityForm({ ...mortalityForm, pen_or_location: e.target.value })} placeholder="Block A01" /></div>
                </>
              )}
              {mortalityForm.livestock_type === 'cattle' && (
                <>
                  <div className="space-y-2">
                    <Label>Cattle Type</Label>
                    <select value={mortalityForm.breed_or_type} onChange={(e) => setMortalityForm({ ...mortalityForm, breed_or_type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                      <option value="">Select...</option><option value="cow">Cow</option><option value="goat">Goat</option><option value="sheep">Sheep</option>
                    </select>
                  </div>
                  <div className="space-y-2"><Label>Location</Label><Input value={mortalityForm.pen_or_location} onChange={(e) => setMortalityForm({ ...mortalityForm, pen_or_location: e.target.value })} /></div>
                </>
              )}
              {mortalityForm.livestock_type === 'fish' && (
                <>
                  <div className="space-y-2"><Label>Fish Type</Label><Input value={mortalityForm.breed_or_type} onChange={(e) => setMortalityForm({ ...mortalityForm, breed_or_type: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Pond Number</Label><Input value={mortalityForm.pen_or_location} onChange={(e) => setMortalityForm({ ...mortalityForm, pen_or_location: e.target.value })} /></div>
                </>
              )}
              {mortalityForm.livestock_type === 'bird' && (
                <>
                  <div className="space-y-2">
                    <Label>Bird Type</Label>
                    <select value={mortalityForm.breed_or_type} onChange={(e) => setMortalityForm({ ...mortalityForm, breed_or_type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                      <option value="">Select...</option><option value="chicken">Chicken</option><option value="duck">Duck</option>
                    </select>
                  </div>
                  <div className="space-y-2"><Label>Batch / Bird ID</Label><Input value={mortalityForm.pen_or_location} onChange={(e) => setMortalityForm({ ...mortalityForm, pen_or_location: e.target.value })} /></div>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>ID / Batch Number (looks up existing record to migrate)</Label>
              <Input value={mortalityForm.record_id} onChange={(e) => setMortalityForm({ ...mortalityForm, record_id: e.target.value })} placeholder="Leave blank for manual entry" />
            </div>
            <div className="space-y-2">
              <Label>Cause of Death (max 50 words)</Label>
              <Input value={mortalityForm.cause_of_death}
                onChange={(e) => { const w = e.target.value.trim().split(/\s+/).filter(Boolean); if (w.length <= 50) setMortalityForm({ ...mortalityForm, cause_of_death: e.target.value }); }}
                placeholder="Describe cause of death..." />
              <p className="text-xs text-muted-foreground">{mortalityForm.cause_of_death.trim().split(/\s+/).filter(Boolean).length}/50 words</p>
            </div>
            <p className="text-xs text-muted-foreground">Status is automatically set to <strong>Dead</strong>.</p>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={mortalityAdd.isPending || mortalityEdit.isPending}>
              {editItem ? 'Save Changes' : 'Add Mortality Record'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
