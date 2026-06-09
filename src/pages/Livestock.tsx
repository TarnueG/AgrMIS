import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Trash2, Heart, AlertTriangle, Leaf, Package, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/contexts/ConfirmContext';

type LivestockView = 'pigs' | 'cattle' | 'birds' | 'fish' | 'mortality' | 'health' | 'ill' | 'recovering' | 'requested';

const isWithin24h = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    healthy: 'bg-success/20 text-success',
    recovering: 'bg-blue-500/20 text-blue-500',
    ill: 'bg-warning/20 text-warning',
    sick: 'bg-warning/20 text-warning',
    dead: 'bg-destructive/20 text-destructive',
    available: 'bg-success/20 text-success',
    full: 'bg-destructive/20 text-destructive',
  };
  return map[status] || 'bg-muted text-muted-foreground';
}

const BLANK_PIG = { pig_id: '', breed: '', gender: 'female', status: 'healthy', weight_kg: '' as string | number, pen_number: '', location: '', date_recorded: '' };
const BLANK_CATTLE = { cattle_id: '', cattle_type: 'cow', gender: 'female', status: 'healthy', weight_kg: '' as string | number, location: '', date_recorded: '' };

const genId = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
const BLANK_BIRD = { bird_type: 'chicken', gender: 'female', weight_kg: '' as string | number, location: '', status: 'healthy' };
const BLANK_POND = { pond_id: '', length_m: '', width_m: '', location: '', capacity: 2000, status: 'available' };
const BLANK_FISH = { fish_type: '', batch_number: '', number_of_fish: 0 };
const BLANK_MORTALITY = { livestock_type: 'pig', breed_or_type: '', record_id: '', pen_or_location: '', cause_of_death: '' };
const BLANK_TREATMENT = { species: 'pig', id: '', description: '', treatment_date: '', location: '', weight_kg: '' as string | number, expected_recovery_date: '' };

const STATUS_OPTIONS = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'recovering', label: 'Recovering' },
  { value: 'ill', label: 'Ill' },
  { value: 'dead', label: 'Dead' },
];

export default function Livestock() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { canCreate, canEdit, canDelete, canViewCard } = usePermissions();
  const { openConfirm } = useConfirm();
  const [selectedView, setSelectedView] = useState<LivestockView | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | '7' | '30' | '90' | '365'>('all');

  const [isPigOpen, setIsPigOpen] = useState(false);
  const [isCattleOpen, setIsCattleOpen] = useState(false);
  const [isBirdOpen, setIsBirdOpen] = useState(false);
  const [isPondOpen, setIsPondOpen] = useState(false);
  const [isFishOpen, setIsFishOpen] = useState(false);
  const [isFreshOpen, setIsFreshOpen] = useState(false);
  const [freshForm, setFreshForm] = useState({ pondId: '', fishType: '', amount: 0 });
  const [isMortalityOpen, setIsMortalityOpen] = useState(false);
  const [isTreatmentOpen, setIsTreatmentOpen] = useState(false);
  const [treatmentForm, setTreatmentForm] = useState({ ...BLANK_TREATMENT });
  const [fulfilReq, setFulfilReq] = useState<any | null>(null);
  const [fulfilSelected, setFulfilSelected] = useState<Set<string>>(new Set());
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
  const { data: illStock = [] } = useQuery<any[]>({ queryKey: ['ls-by-status', 'ill'], queryFn: () => api.get('/livestock/by-status/ill') });
  const { data: recoveringStock = [] } = useQuery<any[]>({ queryKey: ['ls-by-status', 'recovering'], queryFn: () => api.get('/livestock/by-status/recovering') });
  const { data: healthyStock = [] } = useQuery<any[]>({ queryKey: ['ls-by-status', 'healthy'], queryFn: () => api.get('/livestock/by-status/healthy') });
  const { data: lsRequests = [] } = useQuery<any[]>({ queryKey: ['ls-requests'], queryFn: () => api.get('/livestock/requests'), refetchInterval: 30_000 });
  // Fresh Fish (spec 6.4)
  const { data: freshFish = [] } = useQuery<any[]>({ queryKey: ['fresh-fish'], queryFn: () => api.get('/livestock/fresh-fish'), refetchInterval: 30_000 });
  const { data: freshPondFish = [] } = useQuery<any[]>({ queryKey: ['fresh-pond-fish', freshForm.pondId], queryFn: () => freshForm.pondId ? api.get(`/livestock/fish-ponds/${freshForm.pondId}/fish`) : Promise.resolve([]), enabled: !!freshForm.pondId });

  const numW = (v: any) => (v !== '' && v != null ? Number(v) : undefined);
  const pigAdd = useMutation({
    mutationFn: (d: typeof pigForm) => api.post('/livestock/pigs', { ...d, weight_kg: numW(d.weight_kg) }),
    onSuccess: () => { invalidateLivestock(); toast({ title: 'Pig added' }); setIsPigOpen(false); setPigForm({ ...BLANK_PIG }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const pigEdit = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/livestock/pigs/${id}`, { ...d, weight_kg: numW(d.weight_kg) }),
    onSuccess: (data: any) => { invalidateLivestock(); toast({ title: data?.migrated ? 'Pig moved to mortality' : 'Pig updated' }); setEditItem(null); setIsPigOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const pigDelete = useMutation({
    mutationFn: (id: string) => api.delete(`/livestock/pigs/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pigs'] }); toast({ title: 'Pig deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const cattleAdd = useMutation({
    mutationFn: (d: typeof cattleForm) => api.post('/livestock/cattle', { ...d, weight_kg: numW(d.weight_kg) }),
    onSuccess: () => { invalidateLivestock(); toast({ title: 'Grazing livestock added' }); setIsCattleOpen(false); setCattleForm({ ...BLANK_CATTLE }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const cattleEdit = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/livestock/cattle/${id}`, { ...d, weight_kg: numW(d.weight_kg) }),
    onSuccess: (data: any) => { invalidateLivestock(); toast({ title: data?.migrated ? 'Moved to mortality' : 'Updated' }); setEditItem(null); setIsCattleOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const cattleDelete = useMutation({
    mutationFn: (id: string) => api.delete(`/livestock/cattle/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cattle'] }); toast({ title: 'Cattle deleted' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const birdAdd = useMutation({
    mutationFn: (d: typeof birdForm) => api.post('/livestock/birds', { ...d, weight_kg: numW(d.weight_kg) }),
    onSuccess: () => { invalidateLivestock(); toast({ title: 'Bird added' }); setIsBirdOpen(false); setBirdForm({ ...BLANK_BIRD }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const birdEdit = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/livestock/birds/${id}`, { ...d, weight_kg: numW(d.weight_kg) }),
    onSuccess: (data: any) => { invalidateLivestock(); toast({ title: data?.migrated ? 'Moved to mortality' : 'Bird updated' }); setEditItem(null); setIsBirdOpen(false); },
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
  const addFreshFish = useMutation({
    mutationFn: (d: typeof freshForm) => api.post('/livestock/fresh-fish', { pondId: d.pondId, fishType: d.fishType, amount: Number(d.amount) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fresh-fish'] });
      qc.invalidateQueries({ queryKey: ['fish-ponds'] });
      qc.invalidateQueries({ queryKey: ['fresh-pond-fish', freshForm.pondId] });
      toast({ title: 'Fresh fish added' });
      setIsFreshOpen(false);
      setFreshForm({ pondId: '', fishType: '', amount: 0 });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
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

  const SPECIES_PATH: Record<string, string> = { pig: 'pigs', grazing: 'cattle', bird: 'birds' };
  function invalidateLivestock() {
    ['pigs', 'cattle', 'birds', 'mortality', 'ls-by-status'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  }

  // Action edit (status + weight) for the aggregated Health/Ill/Recovering rows
  const editAggregate = useMutation({
    mutationFn: ({ species, id, ...d }: any) => api.patch(`/livestock/${SPECIES_PATH[species]}/${id}`, d),
    onSuccess: () => { invalidateLivestock(); toast({ title: 'Updated' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const treatmentAdd = useMutation({
    mutationFn: (d: typeof treatmentForm) => api.post('/livestock/treatment', {
      species: d.species,
      id: d.id,
      description: d.description || undefined,
      treatment_date: d.treatment_date || undefined,
      location: d.location || undefined,
      weight_kg: d.weight_kg !== '' ? Number(d.weight_kg) : undefined,
      expected_recovery_date: d.expected_recovery_date || undefined,
    }),
    onSuccess: () => { invalidateLivestock(); toast({ title: 'Treatment recorded — status set to Recovering' }); setIsTreatmentOpen(false); setTreatmentForm({ ...BLANK_TREATMENT }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const acceptRequest = useMutation({
    mutationFn: (id: string) => api.patch(`/livestock/requests/${id}/accept`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ls-requests'] }); toast({ title: 'Request accepted — fulfil it next' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const declineRequest = useMutation({
    mutationFn: (id: string) => api.patch(`/livestock/requests/${id}/decline`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ls-requests'] }); toast({ title: 'Request declined' }); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const fulfilRequest = useMutation({
    mutationFn: ({ id, animalIds }: { id: string; animalIds: string[] }) => api.post(`/livestock/requests/${id}/fulfil`, { animalIds }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ls-requests'] }); toast({ title: 'Request fulfilled' }); setFulfilReq(null); setFulfilSelected(new Set()); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const DAYS_MAP: Record<string, number> = { '7': 7, '30': 30, '90': 90, '365': 365 };
  const withinDays = (dateStr?: string) => {
    if (dateFilter === 'all') return true;
    if (!dateStr) return false;
    return Date.now() - new Date(dateStr).getTime() <= DAYS_MAP[dateFilter] * 24 * 60 * 60 * 1000;
  };

  // Species cards show only that species' healthy stock; ill/recovering/dead live on their own cards.
  const filteredPigs = pigs.filter(p => p.status === 'healthy' && withinDays(p.date_recorded ?? p.created_at) && (p.pig_id?.toLowerCase().includes(search.toLowerCase()) || p.breed?.toLowerCase().includes(search.toLowerCase())));
  const filteredCattle = cattle.filter(c => c.status === 'healthy' && withinDays(c.date_recorded ?? c.created_at) && (c.cattle_id?.toLowerCase().includes(search.toLowerCase()) || c.cattle_type?.toLowerCase().includes(search.toLowerCase())));
  const filteredBirds = birds.filter(b => b.status === 'healthy' && withinDays(b.date_recorded ?? b.created_at) && (b.bird_id?.toLowerCase().includes(search.toLowerCase()) || b.bird_type?.toLowerCase().includes(search.toLowerCase())));
  const filteredFish = fish.filter(f => f.fish_type?.toLowerCase().includes(search.toLowerCase()) || f.batch_number?.toLowerCase().includes(search.toLowerCase()));
  const filteredMortality = mortality.filter(m => withinDays(m.date_recorded ?? m.created_at) && (m.record_id?.toLowerCase().includes(search.toLowerCase()) || m.breed_or_type?.toLowerCase().includes(search.toLowerCase())));

  const healthyPigs = pigs.filter(p => p.status === 'healthy');
  const healthyCattle = cattle.filter(c => c.status === 'healthy');
  const healthyBirds = birds.filter(b => b.status === 'healthy');

  const CARDS: Array<{ key: LivestockView; label: string; count: number; color: string; icon: any }> = [
    { key: 'health', label: 'Health', count: healthyStock.length, color: 'bg-success/10 border-success/20', icon: Heart },
    { key: 'ill', label: 'Ill', count: illStock.length, color: 'bg-warning/10 border-warning/20', icon: AlertTriangle },
    { key: 'recovering', label: 'Recovering', count: recoveringStock.length, color: 'bg-blue-500/10 border-blue-500/20', icon: Heart },
    { key: 'requested', label: 'Fresh Fish', count: freshFish.filter((f: any) => f.status === 'in_stock').reduce((s: number, f: any) => s + Number(f.number_of_fish), 0), color: 'bg-cyan-500/10 border-cyan-500/20', icon: Package },
    { key: 'mortality', label: 'Mortality', count: mortality.length, color: 'bg-destructive/10 border-destructive/20', icon: AlertTriangle },
    { key: 'pigs', label: 'Pigs', count: healthyPigs.length, color: 'bg-pink-500/10 border-pink-500/20', icon: Package },
    { key: 'cattle', label: 'Grazing Livestock', count: healthyCattle.length, color: 'bg-amber-500/10 border-amber-500/20', icon: Package },
    { key: 'birds', label: 'Birds', count: healthyBirds.length, color: 'bg-yellow-500/10 border-yellow-500/20', icon: Leaf },
    { key: 'fish', label: 'Fish Ponds', count: ponds.length, color: 'bg-blue-500/10 border-blue-500/20', icon: Package },
  ];

  function openEditPig(pig: any) { setPigForm({ pig_id: pig.pig_id, breed: pig.breed ?? '', gender: pig.gender, status: pig.status, weight_kg: pig.weight_kg ?? '', pen_number: pig.pen_number ?? '', location: pig.location ?? '', date_recorded: '' }); setEditItem(pig); setIsPigOpen(true); }
  function openEditCattle(c: any) { setCattleForm({ cattle_id: c.cattle_id, cattle_type: c.cattle_type, gender: c.gender ?? 'female', status: c.status, weight_kg: c.weight_kg ?? '', location: c.location ?? '', date_recorded: '' }); setEditItem(c); setIsCattleOpen(true); }
  function openEditBird(b: any) { setBirdForm({ bird_type: b.bird_type, gender: b.gender ?? 'female', weight_kg: b.weight_kg ?? '', location: b.location ?? '', status: b.status ?? 'healthy' }); setEditItem(b); setIsBirdOpen(true); }
  function openTreatment(species: string, id: string, location: string, weight: any) { setTreatmentForm({ ...BLANK_TREATMENT, species, id, location: location ?? '', weight_kg: weight ?? '' }); setIsTreatmentOpen(true); }
  // Empty source card → notify, auto-decline, move to Declined.
  function startFulfil(r: any) {
    const pool = healthyStock.filter((h: any) => h.species === r.species);
    if (!pool.length) {
      toast({ title: 'Livestock does not exist', description: 'No healthy stock available — request declined.', variant: 'destructive' });
      declineRequest.mutate(r.id);
      return;
    }
    setFulfilReq(r);
    setFulfilSelected(new Set());
  }
  function openEditFish(f: any) { setFishForm({ fish_type: f.fish_type, batch_number: f.batch_number, number_of_fish: f.number_of_fish }); setEditItem(f); setIsFishOpen(true); }
  function openEditMortality(m: any) { setMortalityForm({ livestock_type: m.livestock_type, breed_or_type: m.breed_or_type ?? '', record_id: m.record_id ?? '', pen_or_location: m.pen_or_location ?? '', cause_of_death: m.cause_of_death ?? '' }); setEditItem(m); setIsMortalityOpen(true); }

  // Shared table for the aggregated Health / Ill / Recovering cards
  function renderAgg(list: any[], recovering: boolean) {
    return (
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>ID</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Location</TableHead>
            {recovering
              ? (<><TableHead>Date of Treatment</TableHead><TableHead>Expected Recovery</TableHead></>)
              : (<TableHead>Last Treatment</TableHead>)}
            <TableHead>Weight (kg)</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.record_id || '-'}</TableCell>
                <TableCell className="capitalize">{r.sub_type || r.species}</TableCell>
                <TableCell><Badge className={statusBadge(r.status)}>{r.status}</Badge></TableCell>
                <TableCell>{r.location || '-'}</TableCell>
                {recovering ? (
                  <>
                    <TableCell>{r.treatment_date ? format(new Date(r.treatment_date), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell>{r.expected_recovery_date ? format(new Date(r.expected_recovery_date), 'MMM d, yyyy') : '-'}</TableCell>
                  </>
                ) : (
                  <TableCell>{r.expected_recovery_date ? format(new Date(r.expected_recovery_date), 'MMM d, yyyy') : '-'}</TableCell>
                )}
                <TableCell>
                  {canEdit('livestock') ? (
                    <input type="number" step="0.01" min="0" defaultValue={r.weight_kg ?? ''}
                      className="h-8 w-20 rounded border border-input bg-background px-2 text-sm text-foreground"
                      onBlur={(e) => { const v = e.target.value; if (v !== '' && Number(v) !== Number(r.weight_kg)) editAggregate.mutate({ species: r.species, id: r.id, weight_kg: Number(v) }); }} />
                  ) : (r.weight_kg != null ? Number(r.weight_kg).toFixed(2) : '-')}
                </TableCell>
                <TableCell className="text-right">
                  {canEdit('livestock') && (
                    <select value={r.status}
                      onChange={(e) => { const ns = e.target.value; if (ns === 'dead') { openConfirm({ title: 'Mark as Dead', message: 'Move to mortality records?', type: 'danger', confirmText: 'Mark Dead', onConfirm: () => editAggregate.mutate({ species: r.species, id: r.id, status: 'dead' }) }); } else editAggregate.mutate({ species: r.species, id: r.id, status: ns }); }}
                      className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!list.length && <TableRow><TableCell colSpan={recovering ? 8 : 7} className="text-center py-8 text-muted-foreground">No records</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center flex-wrap gap-3">
          {selectedView ? (
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setSelectedView(null); setDateFilter('all'); setSearch(''); }} aria-label="Back to livestock" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold">{CARDS.find(c => c.key === selectedView)?.label ?? 'Detail'}</h1>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl font-bold">Livestock</h1>
              <p className="text-muted-foreground">Manage farm animals, fish ponds, and mortality records</p>
            </div>
          )}
          <div className="flex gap-2 items-center">
            {selectedView && (
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                <option value="all">All time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last 365 days</option>
              </select>
            )}
            {selectedView === 'pigs' && canCreate('livestock') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditItem(null); setPigForm({ ...BLANK_PIG, pig_id: genId('PIG') }); setIsPigOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Pig
              </Button>
            )}
            {selectedView === 'cattle' && canCreate('livestock') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditItem(null); setCattleForm({ ...BLANK_CATTLE, cattle_id: genId('GRZ') }); setIsCattleOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Grazing Livestock
              </Button>
            )}
            {selectedView === 'birds' && canCreate('livestock') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditItem(null); setBirdForm({ ...BLANK_BIRD }); setIsBirdOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Bird
              </Button>
            )}
            {(selectedView === 'health' || selectedView === 'ill' || selectedView === 'recovering') && canEdit('livestock') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setTreatmentForm({ ...BLANK_TREATMENT }); setIsTreatmentOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Treatment
              </Button>
            )}
            {selectedView === 'fish' && (
              <>
                {canCreate('livestock') && (
                  <Button className="gradient-primary text-black font-medium" onClick={() => { setPondForm({ ...BLANK_POND }); setIsPondOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />Add Fishpond
                  </Button>
                )}
                {canCreate('livestock') && (
                  <Button variant="outline" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => { setEditItem(null); setFishForm({ ...BLANK_FISH }); setIsFishOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />Add Fish
                  </Button>
                )}
              </>
            )}
            {selectedView === 'mortality' && canCreate('livestock') && (
              <Button className="gradient-primary text-black font-medium" onClick={() => { setEditItem(null); setMortalityForm({ ...BLANK_MORTALITY }); setIsMortalityOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Dead Livestock
              </Button>
            )}
          </div>
        </div>

        {/* Cards — dashboard only */}
        {!selectedView && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CARDS.filter(({ key }) => canViewCard(`livestock.${key}`)).map(({ key, label, count, color, icon: Icon }) => (
              <Card key={key} onClick={() => setSelectedView(key)}
                className={`cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${color}`}>
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
        )}

        {/* Filters — only within a detail view */}
        {selectedView && (
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
        )}

        {/* PIGS TABLE */}
        {selectedView === 'pigs' && (
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Pig ID</TableHead><TableHead>Breed</TableHead><TableHead>Gender</TableHead>
                <TableHead>Weight (kg)</TableHead><TableHead>Status</TableHead><TableHead>Location</TableHead><TableHead>Date</TableHead>
                <TableHead>Mature for Market</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredPigs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.pig_id}</TableCell>
                    <TableCell>{p.breed || '-'}</TableCell>
                    <TableCell className="capitalize">{p.gender}</TableCell>
                    <TableCell>{p.weight_kg != null ? Number(p.weight_kg).toFixed(2) : '-'}</TableCell>
                    <TableCell>
                      <select value={p.status}
                        onChange={(e) => { const ns = e.target.value; if (ns === 'dead') { openConfirm({ title: 'Mark as Dead', message: 'Mark as dead? This pig will move to mortality records.', type: 'danger', confirmText: 'Mark Dead', onConfirm: () => pigEdit.mutate({ id: p.id, status: 'dead' }) }); } else pigEdit.mutate({ id: p.id, status: ns }); }}
                        className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>{p.pen_number || '-'}</TableCell>
                    <TableCell>{p.date_recorded ? format(new Date(p.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell>
                      {canEdit('livestock') ? (
                        <select value={p.mature_for_market ? 'yes' : 'no'}
                          onChange={(e) => pigEdit.mutate({ id: p.id, mature_for_market: e.target.value === 'yes' })}
                          className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                          <option value="no">No</option><option value="yes">Yes</option>
                        </select>
                      ) : (p.mature_for_market ? 'Yes' : 'No')}
                    </TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      {canEdit('livestock') && <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => openEditPig(p)}>Edit</Button>}
                      {canDelete('livestock') && <Button variant="ghost" size="icon" disabled={!isWithin24h(p.created_at)} onClick={() => openConfirm({ title: 'Delete Pig Record', message: 'Delete this pig record?', type: 'danger', confirmText: 'Delete', onConfirm: () => pigDelete.mutate(p.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredPigs.length && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No healthy pig records</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* CATTLE TABLE */}
        {selectedView === 'cattle' && (
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Type</TableHead><TableHead>ID</TableHead><TableHead>Weight (kg)</TableHead><TableHead>Status</TableHead>
                <TableHead>Location</TableHead><TableHead>Date</TableHead><TableHead>Mature for Market</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredCattle.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium capitalize">{c.cattle_type}</TableCell>
                    <TableCell>{c.cattle_id}</TableCell>
                    <TableCell>{c.weight_kg != null ? Number(c.weight_kg).toFixed(2) : '-'}</TableCell>
                    <TableCell>
                      <select value={c.status}
                        onChange={(e) => { const ns = e.target.value; if (ns === 'dead') { openConfirm({ title: 'Mark as Dead', message: 'Mark as dead? This animal will move to mortality records.', type: 'danger', confirmText: 'Mark Dead', onConfirm: () => cattleEdit.mutate({ id: c.id, status: 'dead' }) }); } else cattleEdit.mutate({ id: c.id, status: ns }); }}
                        className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>{c.location || '-'}</TableCell>
                    <TableCell>{c.date_recorded ? format(new Date(c.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell>
                      {canEdit('livestock') ? (
                        <select value={c.mature_for_market ? 'yes' : 'no'}
                          onChange={(e) => cattleEdit.mutate({ id: c.id, mature_for_market: e.target.value === 'yes' })}
                          className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                          <option value="no">No</option><option value="yes">Yes</option>
                        </select>
                      ) : (c.mature_for_market ? 'Yes' : 'No')}
                    </TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      {canEdit('livestock') && <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => openEditCattle(c)}>Edit</Button>}
                      {canDelete('livestock') && <Button variant="ghost" size="icon" disabled={!isWithin24h(c.created_at)} onClick={() => openConfirm({ title: 'Delete Record', message: 'Delete this record?', type: 'danger', confirmText: 'Delete', onConfirm: () => cattleDelete.mutate(c.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredCattle.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No healthy grazing livestock</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* BIRDS TABLE */}
        {selectedView === 'birds' && (
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Bird ID</TableHead><TableHead>Bird Type</TableHead><TableHead>Weight (kg)</TableHead>
                <TableHead>Status</TableHead><TableHead>Location</TableHead><TableHead>Gender</TableHead><TableHead>Date</TableHead>
                <TableHead>Mature for Market</TableHead><TableHead className="text-right">Action</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredBirds.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.bird_id || '-'}</TableCell>
                    <TableCell className="font-medium capitalize">{b.bird_type}</TableCell>
                    <TableCell>{b.weight_kg != null ? Number(b.weight_kg).toFixed(2) : '-'}</TableCell>
                    <TableCell>
                      <select value={b.status ?? 'healthy'}
                        onChange={(e) => { const ns = e.target.value; if (ns === 'dead') { openConfirm({ title: 'Mark as Dead', message: 'Mark as dead? This bird will move to mortality records.', type: 'danger', confirmText: 'Mark Dead', onConfirm: () => birdEdit.mutate({ id: b.id, status: 'dead' }) }); } else birdEdit.mutate({ id: b.id, status: ns }); }}
                        className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>{b.location || '-'}</TableCell>
                    <TableCell className="capitalize">{b.gender || '-'}</TableCell>
                    <TableCell>{b.date_recorded ? format(new Date(b.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell>
                      {canEdit('livestock') ? (
                        <select value={b.mature_for_market ? 'yes' : 'no'}
                          onChange={(e) => birdEdit.mutate({ id: b.id, mature_for_market: e.target.value === 'yes' })}
                          className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground">
                          <option value="no">No</option><option value="yes">Yes</option>
                        </select>
                      ) : (b.mature_for_market ? 'Yes' : 'No')}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit('livestock') && <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => openEditBird(b)}>Edit</Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredBirds.length && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No healthy bird records</TableCell></TableRow>}
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
                      {canEdit('livestock') && <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" onClick={() => openEditFish(f)}>Edit</Button>}
                      {isWithin24h(f.created_at) && canDelete('livestock') && (
                        <Button variant="ghost" size="icon" onClick={() => openConfirm({ title: 'Delete Fish Record', message: 'Delete this fish record?', type: 'danger', confirmText: 'Delete', onConfirm: () => fishDelete.mutate(f.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
                      {canEdit('livestock') && <Button variant="outline" size="sm" className="border border-input bg-background text-white hover:bg-accent hover:text-accent-foreground" disabled={!isWithin24h(m.created_at)} onClick={() => openEditMortality(m)}>Update</Button>}
                      {canDelete('livestock') && <Button variant="ghost" size="icon" onClick={() => openConfirm({ title: 'Cancel Mortality Record', message: 'Cancel this mortality record?', type: 'danger', confirmText: 'Cancel Record', onConfirm: () => mortalityCancel.mutate(m.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredMortality.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No mortality records</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* HEALTH / ILL / RECOVERING (aggregated across species) */}
        {selectedView === 'health' && renderAgg(healthyStock.filter((r: any) => withinDays(r.date_recorded ?? r.created_at)), false)}
        {selectedView === 'ill' && renderAgg(illStock.filter((r: any) => withinDays(r.date_recorded ?? r.created_at)), false)}
        {selectedView === 'recovering' && renderAgg(recoveringStock.filter((r: any) => withinDays(r.date_recorded ?? r.created_at)), true)}

        {/* LIVESTOCK REQUESTED (from Inventory) */}
        {selectedView === 'requested' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Fresh Fish</p>
                {canCreate('livestock') && (
                  <Button className="gradient-primary text-black font-medium" onClick={() => { setFreshForm({ pondId: '', fishType: '', amount: 0 }); setIsFreshOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />Add Fresh Fish
                  </Button>
                )}
              </div>
            </CardHeader>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Type of Fish</TableHead><TableHead>Number of Fish</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {freshFish.map((f: any) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.fish_type}</TableCell>
                    <TableCell>{Number(f.number_of_fish).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{f.date_recorded ? format(new Date(f.date_recorded), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell><Badge className={f.status === 'sold' ? 'bg-blue-500/20 text-blue-500' : f.status === 'out_stock' ? 'bg-destructive/20 text-destructive' : 'bg-success/20 text-success'}>{f.status === 'in_stock' ? 'In-stock' : f.status === 'out_stock' ? 'Out-stock' : 'Sold'}</Badge></TableCell>
                  </TableRow>
                ))}
                {!freshFish.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No fresh fish yet — use “Add Fresh Fish”.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}

      </div>

      {/* PIG DIALOG */}
      {(editItem ? canEdit('livestock') : canCreate('livestock')) && (
      <Dialog open={isPigOpen} onOpenChange={(o) => { setIsPigOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Edit Pig Record' : 'Add Pig'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!pigForm.gender) { toast({ title: 'Select a gender', variant: 'destructive' }); return; } editItem ? pigEdit.mutate({ id: editItem.id, ...pigForm }) : pigAdd.mutate(pigForm); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Pig ID (auto)</Label><Input value={pigForm.pig_id} readOnly className="bg-muted" /></div>
              <div className="space-y-2"><Label>Breed</Label><Input value={pigForm.breed} onChange={(e) => setPigForm({ ...pigForm, breed: e.target.value })} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <div className="flex gap-4 items-center h-10">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={pigForm.gender === 'male'} onChange={() => setPigForm({ ...pigForm, gender: 'male' })} className="h-4 w-4 accent-primary" />Male
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={pigForm.gender === 'female'} onChange={() => setPigForm({ ...pigForm, gender: 'female' })} className="h-4 w-4 accent-primary" />Female
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select value={pigForm.status} onChange={(e) => setPigForm({ ...pigForm, status: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Weight (kg)</Label><Input type="number" step="0.01" min="0" value={pigForm.weight_kg} onChange={(e) => setPigForm({ ...pigForm, weight_kg: e.target.value })} required /></div>
              {/* "Pig Pen Number" relabeled to "Location" per spec 6.2; still persisted via pen_number to avoid a data migration. */}
              <div className="space-y-2"><Label>Location</Label><Input value={pigForm.pen_number} onChange={(e) => setPigForm({ ...pigForm, pen_number: e.target.value })} placeholder="Block A01" required /></div>
            </div>
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={pigForm.date_recorded} onChange={(e) => setPigForm({ ...pigForm, date_recorded: e.target.value })} required /></div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={pigAdd.isPending || pigEdit.isPending}>{editItem ? 'Save Changes' : 'Add Pig'}</Button>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* CATTLE DIALOG */}
      {(editItem ? canEdit('livestock') : canCreate('livestock')) && (
      <Dialog open={isCattleOpen} onOpenChange={(o) => { setIsCattleOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Edit Grazing Livestock' : 'Add Grazing Livestock'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!cattleForm.gender) { toast({ title: 'Select a gender', variant: 'destructive' }); return; } editItem ? cattleEdit.mutate({ id: editItem.id, ...cattleForm }) : cattleAdd.mutate(cattleForm); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select value={cattleForm.cattle_type} onChange={(e) => setCattleForm({ ...cattleForm, cattle_type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <option value="cow">Cow</option><option value="goat">Goat</option><option value="sheep">Sheep</option>
                </select>
              </div>
              <div className="space-y-2"><Label>ID (auto)</Label><Input value={cattleForm.cattle_id} readOnly className="bg-muted" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <div className="flex gap-4 items-center h-10">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={cattleForm.gender === 'male'} onChange={() => setCattleForm({ ...cattleForm, gender: 'male' })} className="h-4 w-4 accent-primary" />Male
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={cattleForm.gender === 'female'} onChange={() => setCattleForm({ ...cattleForm, gender: 'female' })} className="h-4 w-4 accent-primary" />Female
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select value={cattleForm.status} onChange={(e) => setCattleForm({ ...cattleForm, status: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Weight (kg)</Label><Input type="number" step="0.01" min="0" value={cattleForm.weight_kg} onChange={(e) => setCattleForm({ ...cattleForm, weight_kg: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Location</Label><Input value={cattleForm.location} onChange={(e) => setCattleForm({ ...cattleForm, location: e.target.value })} required /></div>
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={cattleAdd.isPending || cattleEdit.isPending}>{editItem ? 'Save Changes' : 'Add Grazing Livestock'}</Button>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* BIRD DIALOG */}
      {(editItem ? canEdit('livestock') : canCreate('livestock')) && (
      <Dialog open={isBirdOpen} onOpenChange={(o) => { setIsBirdOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Edit Bird Record' : 'Add Bird'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); editItem ? birdEdit.mutate({ id: editItem.id, ...birdForm }) : birdAdd.mutate(birdForm); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bird Type</Label>
                <select value={birdForm.bird_type} onChange={(e) => setBirdForm({ ...birdForm, bird_type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <option value="chicken">Chicken</option><option value="duck">Duck</option>
                </select>
              </div>
              <div className="space-y-2"><Label>Bird Quantity</Label><Input value={1} readOnly className="bg-muted" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Weight (kg)</Label><Input type="number" step="0.01" min="0" value={birdForm.weight_kg} onChange={(e) => setBirdForm({ ...birdForm, weight_kg: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Location</Label><Input value={birdForm.location} onChange={(e) => setBirdForm({ ...birdForm, location: e.target.value })} required /></div>
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <div className="flex gap-4 items-center h-10">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={birdForm.gender === 'female'} onChange={() => setBirdForm({ ...birdForm, gender: 'female' })} className="h-4 w-4 accent-primary" />Female
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={birdForm.gender === 'male'} onChange={() => setBirdForm({ ...birdForm, gender: 'male' })} className="h-4 w-4 accent-primary" />Male
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <select value={birdForm.status} onChange={(e) => setBirdForm({ ...birdForm, status: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={birdAdd.isPending || birdEdit.isPending}>{editItem ? 'Save Changes' : 'Add Bird'}</Button>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* ADD FISHPOND DIALOG */}
      {canCreate('livestock') && (
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
      )}

      {/* ADD/EDIT FISH DIALOG */}
      {(editItem ? canEdit('livestock') : canCreate('livestock')) && (
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
              {/* Batch number is auto-generated server-side (spec 6.3) */}
              <div className="space-y-2"><Label>Batch Number</Label><Input value={editItem ? fishForm.batch_number : 'Auto-generated on save'} readOnly className="bg-muted text-muted-foreground" /></div>
            </div>
            <div className="space-y-2"><Label>Number of Fish</Label><Input type="number" value={fishForm.number_of_fish} onChange={(e) => setFishForm({ ...fishForm, number_of_fish: Number(e.target.value) })} /></div>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={fishAdd.isPending || fishEdit.isPending}>{editItem ? 'Save Changes' : 'Add Fish'}</Button>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* ADD FRESH FISH DIALOG (spec 6.4) */}
      {canCreate('livestock') && (
      <Dialog open={isFreshOpen} onOpenChange={(o) => { setIsFreshOpen(o); if (!o) setFreshForm({ pondId: '', fishType: '', amount: 0 }); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Fresh Fish</DialogTitle></DialogHeader>
          {(() => {
            // Aggregate the selected pond's fish by type.
            const byType: Record<string, number> = {};
            for (const f of freshPondFish) byType[f.fish_type] = (byType[f.fish_type] || 0) + Number(f.number_of_fish);
            const types = Object.entries(byType);
            const selectedMax = byType[freshForm.fishType] ?? 0;
            return (
              <form onSubmit={(e) => { e.preventDefault(); if (!freshForm.pondId || !freshForm.fishType) { toast({ title: 'Select a pond and fish type', variant: 'destructive' }); return; } if (freshForm.amount < 1 || freshForm.amount > selectedMax) { toast({ title: `Enter 1–${selectedMax} fish`, variant: 'destructive' }); return; } addFreshFish.mutate(freshForm); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Pond</Label>
                  <select value={freshForm.pondId} onChange={(e) => setFreshForm({ ...freshForm, pondId: e.target.value, fishType: '', amount: 0 })} required className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="">Choose a pond…</option>
                    {ponds.map((p: any) => <option key={p.id} value={p.id}>{p.pond_id} — {Number(p.current_fish_count).toLocaleString()} fish</option>)}
                  </select>
                </div>
                {freshForm.pondId && (
                  <div className="space-y-2">
                    <Label>Type of Fish</Label>
                    {!types.length ? <p className="text-xs text-muted-foreground">No fish in this pond.</p> : (
                      <div className="space-y-1 rounded-md border border-input bg-background p-2">
                        {types.map(([t, count]) => (
                          <label key={t} className="flex items-center justify-between gap-2 text-sm cursor-pointer px-1 py-0.5">
                            <span className="flex items-center gap-2"><input type="radio" name="freshType" checked={freshForm.fishType === t} onChange={() => setFreshForm({ ...freshForm, fishType: t, amount: 0 })} className="accent-primary" />{t}</span>
                            <span className="text-muted-foreground">{Number(count).toLocaleString()} available</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {freshForm.fishType && (
                  <div className="space-y-2">
                    <Label>Amount to Move to Fresh Fish <span className="text-muted-foreground text-xs">(max {selectedMax.toLocaleString()})</span></Label>
                    <Input type="number" min={1} max={selectedMax} value={freshForm.amount || ''} onChange={(e) => setFreshForm({ ...freshForm, amount: Number(e.target.value) })} required />
                  </div>
                )}
                <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={addFreshFish.isPending}>Move to Fresh Fish</Button>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>
      )}

      {/* MORTALITY DIALOG */}
      {(editItem ? canEdit('livestock') : canCreate('livestock')) && (
      <Dialog open={isMortalityOpen} onOpenChange={(o) => { setIsMortalityOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Update Mortality Record' : 'Add Dead Livestock'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); editItem ? mortalityEdit.mutate({ id: editItem.id, ...mortalityForm }) : mortalityAdd.mutate(mortalityForm); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Livestock Type</Label>
              <select value={mortalityForm.livestock_type} onChange={(e) => setMortalityForm({ ...mortalityForm, livestock_type: e.target.value })} disabled={!!editItem} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                <option value="pig">Pig</option><option value="cattle">Grazing Livestock</option><option value="fish">Fish</option><option value="bird">Bird</option>
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
      )}

      {/* TREATMENT DIALOG */}
      {canEdit('livestock') && (
      <Dialog open={isTreatmentOpen} onOpenChange={(o) => { setIsTreatmentOpen(o); if (!o) setTreatmentForm({ ...BLANK_TREATMENT }); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Treatment</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!treatmentForm.id) { toast({ title: 'Select a livestock', variant: 'destructive' }); return; } treatmentAdd.mutate(treatmentForm); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Select Livestock (ill only)</Label>
              <select
                value={treatmentForm.id ? `${treatmentForm.species}:${treatmentForm.id}` : ''}
                onChange={(e) => { const [sp, id] = e.target.value.split(':'); setTreatmentForm({ ...treatmentForm, species: sp || 'pig', id: id ?? '' }); }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Choose ill livestock...</option>
                {illStock.map((r: any) => (
                  <option key={r.id} value={`${r.species}:${r.id}`}>{r.record_id} — {r.sub_type || r.species}</option>
                ))}
              </select>
              {!illStock.length && <p className="text-xs text-warning">No ill livestock to treat.</p>}
            </div>
            <div className="space-y-2">
              <Label>Treatment Given (max 50 words)</Label>
              <Input value={treatmentForm.description}
                onChange={(e) => { const w = e.target.value.trim().split(/\s+/).filter(Boolean); if (w.length <= 50) setTreatmentForm({ ...treatmentForm, description: e.target.value }); }}
                placeholder="Describe treatment..." />
              <p className="text-xs text-muted-foreground">{treatmentForm.description.trim().split(/\s+/).filter(Boolean).length}/50 words</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Date of Treatment</Label><Input type="date" value={treatmentForm.treatment_date} onChange={(e) => setTreatmentForm({ ...treatmentForm, treatment_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Expected Recovery Date</Label><Input type="date" value={treatmentForm.expected_recovery_date} onChange={(e) => setTreatmentForm({ ...treatmentForm, expected_recovery_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Location</Label><Input value={treatmentForm.location} onChange={(e) => setTreatmentForm({ ...treatmentForm, location: e.target.value })} /></div>
              <div className="space-y-2"><Label>Weight (kg)</Label><Input type="number" step="0.01" min="0" value={treatmentForm.weight_kg} onChange={(e) => setTreatmentForm({ ...treatmentForm, weight_kg: e.target.value })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Saving sets status to <strong>Recovering</strong>. It auto-returns to <strong>Healthy</strong> on the recovery date.</p>
            <Button type="submit" className="w-full gradient-primary text-black font-medium" disabled={treatmentAdd.isPending}>Save Treatment</Button>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* FULFIL REQUEST DIALOG */}
      {canEdit('livestock') && (
      <Dialog open={!!fulfilReq} onOpenChange={(o) => { if (!o) { setFulfilReq(null); setFulfilSelected(new Set()); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fulfil Request{fulfilReq ? ` — ${fulfilReq.quantity} ${fulfilReq.species === 'grazing' ? 'grazing livestock' : fulfilReq.species}` : ''}</DialogTitle></DialogHeader>
          {fulfilReq && (() => {
            const pool = healthyStock.filter((h: any) => h.species === fulfilReq.species);
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Select up to {fulfilReq.quantity} healthy animal(s) to allocate to inventory. Only healthy stock is eligible.</p>
                <div className="max-h-64 overflow-y-auto border border-input rounded-md divide-y divide-border">
                  {pool.map((h: any) => {
                    const checked = fulfilSelected.has(h.id);
                    const atLimit = fulfilSelected.size >= fulfilReq.quantity;
                    return (
                      <label key={h.id} className="flex items-center gap-3 p-2 text-sm cursor-pointer hover:bg-accent/10">
                        <input type="checkbox" checked={checked} disabled={!checked && atLimit}
                          onChange={() => { const next = new Set(fulfilSelected); checked ? next.delete(h.id) : next.add(h.id); setFulfilSelected(next); }}
                          className="h-4 w-4 accent-primary" />
                        <span className="font-mono text-xs">{h.record_id}</span>
                        <span className="capitalize text-muted-foreground">{h.sub_type}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{h.weight_kg != null ? `${Number(h.weight_kg).toFixed(2)} kg` : ''}</span>
                      </label>
                    );
                  })}
                  {!pool.length && <p className="p-3 text-sm text-muted-foreground">No healthy stock available for this species.</p>}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{fulfilSelected.size}/{fulfilReq.quantity} selected</span>
                  <Button className="gradient-primary text-black font-medium" disabled={fulfilSelected.size === 0 || fulfilRequest.isPending}
                    onClick={() => fulfilRequest.mutate({ id: fulfilReq.id, animalIds: Array.from(fulfilSelected) })}>Fulfil</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      )}
    </DashboardLayout>
  );
}
