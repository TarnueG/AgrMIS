import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AreaChart as AreaChartIcon,
  BadgeAlert,
  Beef,
  Fish,
  HeartPulse,
  Plus,
  Search,
  ShieldPlus,
  Skull,
  Soup,
  Syringe,
  Wheat,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { refreshModuleData } from '@/lib/module-refresh';

type AnimalKind = 'pig' | 'cattle' | 'bird';
type ReferenceKind = 'pig' | 'cattle' | 'bird' | 'pond';

type CommandCenterPayload = {
  summary: {
    totalAnimals: number;
    pigs: number;
    cattle: number;
    birds: number;
    fishPonds: number;
    healthyAnimals: number;
    sickAnimals: number;
    mortalityThisMonth: number;
    feedConsumedThisMonth: number;
    upcomingHealthChecks: number;
  };
  charts: {
    speciesCounts: { name: string; value: number }[];
    healthStatuses: { name: string; value: number }[];
    feedAndMortalityTrend: { label: string; feed: number; mortality: number }[];
    pondComparison: { name: string; stocked: number; estimate: number }[];
  };
  animalRegister: {
    id: string;
    type: AnimalKind;
    animalId: string;
    species: string;
    breed: string;
    gender: string;
    ageOrDateAdded: string;
    location: string;
    healthStatus: string;
    weightOrGrowthStage: string;
    lastTreatment: string;
    feedType: string;
    notes: string;
  }[];
  fishPonds: {
    id: string;
    pondId: string;
    fishType: string;
    stockingQuantity: number;
    currentEstimate: number;
    feedUsed: number;
    mortalityCount: number;
    stockingDate: string | null;
    expectedHarvestDate: string | null;
    status: string;
    location: string;
  }[];
  healthLogs: {
    id: string;
    recordId: string;
    animalOrPondId: string;
    issue: string;
    treatment: string | null;
    medicineUsed: string | null;
    vetStaffResponsible: string | null;
    date: string;
    recoveryStatus: string | null;
    notes: string | null;
    referenceKind: ReferenceKind;
    staffName: string | null;
  }[];
  feedUsageLogs: {
    id: string;
    date: string;
    animalGroupOrPond: string;
    feedItem: string;
    quantityUsed: number;
    unit: string;
    inventorySource: string;
    recordedBy: string;
    referenceKind: ReferenceKind;
  }[];
  mortalityLogs: {
    id: string;
    date: string;
    animalOrPondId: string;
    species: string;
    cause: string;
    quantity: number;
    reportedBy: string;
    notes: string;
  }[];
  stockItems: {
    id: string;
    name: string;
    unit: string;
    location: string | null;
    currentQuantity: number;
    category: string | null;
  }[];
};

type AnimalForm = {
  kind: AnimalKind;
  recordId: string;
  breedOrType: string;
  gender: string;
  status: string;
  location: string;
  count: number;
  femaleCount: number;
  maleCount: number;
  dateRecorded: string;
};

type PondForm = {
  pondId: string;
  fishType: string;
  location: string;
  capacity: number;
  length: number;
  width: number;
  stockingDate: string;
  expectedHarvestDate: string;
};

type StockForm = {
  pondId: string;
  fishType: string;
  batchNumber: string;
  numberOfFish: number;
  dateRecorded: string;
  expectedHarvestDate: string;
};

type HealthForm = {
  referenceKind: ReferenceKind;
  referenceId: string;
  referenceCode: string;
  issue: string;
  treatment: string;
  medicineUsed: string;
  inventoryStockItemId: string;
  inventoryQuantityUsed: number;
  vetStaffResponsible: string;
  recoveryStatus: string;
  logDate: string;
  nextCheckDate: string;
  notes: string;
};

type FeedForm = {
  referenceKind: ReferenceKind;
  referenceId: string;
  referenceCode: string;
  groupName: string;
  feedStockItemId: string;
  feedItemName: string;
  quantityUsed: number;
  unit: string;
  inventorySource: string;
  logDate: string;
  notes: string;
};

type MortalityForm = {
  livestockType: 'pig' | 'cattle' | 'bird' | 'fish';
  breedOrType: string;
  recordId: string;
  penOrLocation: string;
  causeOfDeath: string;
  quantity: number;
  dateRecorded: string;
  sourceId: string;
};

function labelize(value: string | null | undefined) {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function statusBadgeClass(status: string) {
  const value = status.toLowerCase();
  if (['healthy', 'available', 'active'].includes(value)) return 'bg-success/20 text-success border-success/20';
  if (['sick', 'under_treatment', 'monitoring', 'quarantine'].includes(value)) return 'bg-warning/20 text-warning border-warning/20';
  if (['dead', 'declined'].includes(value)) return 'bg-destructive/20 text-destructive border-destructive/20';
  return 'bg-info/20 text-info border-info/20';
}

function DashboardKpi({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'info' | 'success';
}) {
  const tones = {
    default: 'bg-card border-border',
    primary: 'bg-primary/10 border-primary/25',
    warning: 'bg-warning/10 border-warning/25',
    danger: 'bg-destructive/10 border-destructive/25',
    info: 'bg-info/10 border-info/25',
    success: 'bg-success/10 border-success/25',
  };
  const iconTones = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/20 text-primary',
    warning: 'bg-warning/20 text-warning',
    danger: 'bg-destructive/20 text-destructive',
    info: 'bg-info/20 text-info',
    success: 'bg-success/20 text-success',
  };
  return (
    <div className={`rounded-lg border ${tones[tone]}`}>
      <div className="flex min-h-[84px] items-start justify-between gap-2 p-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="hidden text-[11px] leading-4 text-muted-foreground 2xl:block">{detail}</p>
        </div>
        <div className={`rounded-md p-2 ${iconTones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export default function Livestock() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const refreshLivestockData = () => refreshModuleData(queryClient, [['farm-ops-command-center']]);
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<'all' | AnimalKind>('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [isAnimalOpen, setIsAnimalOpen] = useState(false);
  const [isPondOpen, setIsPondOpen] = useState(false);
  const [isStockOpen, setIsStockOpen] = useState(false);
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const [isMortalityOpen, setIsMortalityOpen] = useState(false);
  const [animalForm, setAnimalForm] = useState<AnimalForm>({
    kind: 'pig',
    recordId: '',
    breedOrType: '',
    gender: 'unknown',
    status: 'healthy',
    location: '',
    count: 1,
    femaleCount: 0,
    maleCount: 0,
    dateRecorded: new Date().toISOString().slice(0, 10),
  });
  const [pondForm, setPondForm] = useState<PondForm>({
    pondId: '',
    fishType: '',
    location: '',
    capacity: 2000,
    length: 30,
    width: 25,
    stockingDate: new Date().toISOString().slice(0, 10),
    expectedHarvestDate: '',
  });
  const [stockForm, setStockForm] = useState<StockForm>({
    pondId: '',
    fishType: '',
    batchNumber: '',
    numberOfFish: 0,
    dateRecorded: new Date().toISOString().slice(0, 10),
    expectedHarvestDate: '',
  });
  const [healthForm, setHealthForm] = useState<HealthForm>({
    referenceKind: 'pig',
    referenceId: '',
    referenceCode: '',
    issue: '',
    treatment: '',
    medicineUsed: '',
    inventoryStockItemId: 'none',
    inventoryQuantityUsed: 0,
    vetStaffResponsible: '',
    recoveryStatus: 'under_treatment',
    logDate: new Date().toISOString().slice(0, 10),
    nextCheckDate: '',
    notes: '',
  });
  const [feedForm, setFeedForm] = useState<FeedForm>({
    referenceKind: 'pig',
    referenceId: '',
    referenceCode: '',
    groupName: '',
    feedStockItemId: 'none',
    feedItemName: '',
    quantityUsed: 0,
    unit: 'bag',
    inventorySource: '',
    logDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [mortalityForm, setMortalityForm] = useState<MortalityForm>({
    livestockType: 'pig',
    breedOrType: '',
    recordId: '',
    penOrLocation: '',
    causeOfDeath: '',
    quantity: 1,
    dateRecorded: new Date().toISOString().slice(0, 10),
    sourceId: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['farm-ops-command-center'],
    queryFn: () => api.get<CommandCenterPayload>('/livestock/command-center'),
  });
  const summary = data?.summary;
  const fishPonds = data?.fishPonds ?? [];
  const healthLogs = data?.healthLogs ?? [];
  const feedUsageLogs = data?.feedUsageLogs ?? [];
  const mortalityLogs = data?.mortalityLogs ?? [];

  const feedInventory = useMemo(
    () => (data?.stockItems ?? []).filter((item) => /feed|bran|ration/i.test(`${item.name} ${item.category || ''}`)),
    [data?.stockItems],
  );

  const medicineInventory = useMemo(
    () => (data?.stockItems ?? []).filter((item) => /medicine|vaccine|drug|fungicide|chemical/i.test(`${item.name} ${item.category || ''}`)),
    [data?.stockItems],
  );

  const filteredAnimals = useMemo(() => (data?.animalRegister ?? []).filter((row) => {
    const matchesSearch =
      row.animalId.toLowerCase().includes(search.toLowerCase()) ||
      row.species.toLowerCase().includes(search.toLowerCase()) ||
      row.breed.toLowerCase().includes(search.toLowerCase()) ||
      row.location.toLowerCase().includes(search.toLowerCase());
    const matchesSpecies = speciesFilter === 'all' || row.type === speciesFilter;
    const matchesHealth = healthFilter === 'all' || row.healthStatus.toLowerCase() === healthFilter;
    return matchesSearch && matchesSpecies && matchesHealth;
  }), [data?.animalRegister, healthFilter, search, speciesFilter]);

  const analytics = useMemo(() => ({
    speciesCounts: data?.charts.speciesCounts ?? [],
    healthStatuses: data?.charts.healthStatuses ?? [],
    feedTrend: data?.charts.feedAndMortalityTrend ?? [],
    pondComparison: data?.charts.pondComparison ?? [],
  }), [data?.charts]);

  const createAnimalMutation = useMutation({
    mutationFn: (form: AnimalForm) => {
      if (form.kind === 'pig') {
        return api.post('/livestock/pigs', {
          pig_id: form.recordId,
          breed: form.breedOrType,
          gender: form.gender,
          status: form.status,
          pen_number: form.location,
          date_recorded: form.dateRecorded,
        });
      }
      if (form.kind === 'cattle') {
        return api.post('/livestock/cattle', {
          cattle_id: form.recordId,
          cattle_type: form.breedOrType,
          status: form.status,
          location: form.location,
          date_recorded: form.dateRecorded,
        });
      }
      return api.post('/livestock/birds', {
        bird_type: form.breedOrType,
        batch_number: form.recordId,
        number_of_birds: form.count,
        number_of_female: form.femaleCount,
        number_of_male: form.maleCount,
        date_recorded: form.dateRecorded,
      });
    },
    onSuccess: () => {
      void refreshLivestockData();
      toast({ title: 'Animal record added' });
      setIsAnimalOpen(false);
    },
    onError: (error) => toast({ title: 'Error adding animal', description: error.message, variant: 'destructive' }),
  });

  const createPondMutation = useMutation({
    mutationFn: (form: PondForm) => api.post('/livestock/fish-ponds', {
      pond_id: form.pondId,
      fish_type: form.fishType || null,
      location: form.location || null,
      capacity: form.capacity,
      length_m: form.length,
      width_m: form.width,
      stocking_date: form.stockingDate || null,
      expected_harvest_date: form.expectedHarvestDate || null,
    }),
    onSuccess: () => {
      void refreshLivestockData();
      toast({ title: 'Fish pond added' });
      setIsPondOpen(false);
    },
    onError: (error) => toast({ title: 'Error adding fish pond', description: error.message, variant: 'destructive' }),
  });

  const stockPondMutation = useMutation({
    mutationFn: (form: StockForm) => api.post(`/livestock/fish-ponds/${form.pondId}/fish`, {
      fish_type: form.fishType,
      batch_number: form.batchNumber,
      number_of_fish: form.numberOfFish,
      date_recorded: form.dateRecorded || null,
      expected_harvest_date: form.expectedHarvestDate || null,
    }),
    onSuccess: () => {
      void refreshLivestockData();
      toast({ title: 'Fish stock added to pond' });
      setIsStockOpen(false);
    },
    onError: (error) => toast({ title: 'Error stocking pond', description: error.message, variant: 'destructive' }),
  });

  const healthMutation = useMutation({
    mutationFn: (form: HealthForm) => api.post('/livestock/health-logs', {
      reference_kind: form.referenceKind,
      reference_id: form.referenceId || null,
      reference_code: form.referenceCode || null,
      issue: form.issue,
      treatment: form.treatment || null,
      medicine_used: form.medicineUsed || null,
      inventory_stock_item_id: form.inventoryStockItemId === 'none' ? null : form.inventoryStockItemId,
      inventory_quantity_used: form.inventoryQuantityUsed || null,
      vet_staff_responsible: form.vetStaffResponsible || null,
      recovery_status: form.recoveryStatus,
      log_date: form.logDate || null,
      next_check_date: form.nextCheckDate || null,
      notes: form.notes || null,
    }),
    onSuccess: () => {
      void refreshLivestockData();
      toast({ title: 'Health log recorded' });
      setIsHealthOpen(false);
    },
    onError: (error) => toast({ title: 'Error recording health log', description: error.message, variant: 'destructive' }),
  });

  const feedMutation = useMutation({
    mutationFn: (form: FeedForm) => api.post('/livestock/feed-usage', {
      reference_kind: form.referenceKind,
      reference_id: form.referenceId || null,
      reference_code: form.referenceCode || null,
      group_name: form.groupName,
      feed_stock_item_id: form.feedStockItemId === 'none' ? null : form.feedStockItemId,
      feed_item_name: form.feedItemName,
      quantity_used: form.quantityUsed,
      unit: form.unit,
      inventory_source: form.inventorySource || null,
      log_date: form.logDate || null,
      notes: form.notes || null,
    }),
    onSuccess: () => {
      void refreshLivestockData();
      toast({ title: 'Feed usage recorded' });
      setIsFeedOpen(false);
    },
    onError: (error) => toast({ title: 'Error recording feed usage', description: error.message, variant: 'destructive' }),
  });

  const mortalityMutation = useMutation({
    mutationFn: (form: MortalityForm) => api.post('/livestock/mortality', {
      livestock_type: form.livestockType,
      breed_or_type: form.breedOrType || null,
      record_id: form.recordId || null,
      pen_or_location: form.penOrLocation || null,
      cause_of_death: form.causeOfDeath || null,
      quantity: form.quantity,
      source_id: form.sourceId || null,
      date_recorded: form.dateRecorded || null,
    }),
    onSuccess: () => {
      void refreshLivestockData();
      toast({ title: 'Mortality logged' });
      setIsMortalityOpen(false);
    },
    onError: (error) => toast({ title: 'Error logging mortality', description: error.message, variant: 'destructive' }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary/15 text-primary border-primary/20">Farm Operations Command Center</Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {isLoading ? 'Loading...' : `${summary?.totalAnimals?.toLocaleString() ?? 0} live animal units tracked`}
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Livestock / Farm Ops</h1>
              <p className="text-sm text-muted-foreground">
                Monitor pigs, cattle, poultry, fish ponds, health checks, feed usage, mortality, and operational activity from one screen.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Dialog open={isAnimalOpen} onOpenChange={setIsAnimalOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-black"><Plus className="mr-2 h-4 w-4" />Add Animal</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Animal / Bird Group</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createAnimalMutation.mutate(animalForm); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={animalForm.kind} onValueChange={(value) => setAnimalForm({ ...animalForm, kind: value as AnimalKind })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pig">Pig</SelectItem>
                        <SelectItem value="cattle">Cattle</SelectItem>
                        <SelectItem value="bird">Bird Group</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{animalForm.kind === 'bird' ? 'Batch Number' : 'Animal ID'}</Label>
                      <Input value={animalForm.recordId} onChange={(e) => setAnimalForm({ ...animalForm, recordId: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{animalForm.kind === 'cattle' ? 'Type / Breed' : animalForm.kind === 'bird' ? 'Bird Type' : 'Breed'}</Label>
                      <Input value={animalForm.breedOrType} onChange={(e) => setAnimalForm({ ...animalForm, breedOrType: e.target.value })} required />
                    </div>
                  </div>
                  {animalForm.kind !== 'bird' ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>{animalForm.kind === 'pig' ? 'Gender' : 'Status'}</Label>
                        <Input value={animalForm.kind === 'pig' ? animalForm.gender : animalForm.status} onChange={(e) => animalForm.kind === 'pig'
                          ? setAnimalForm({ ...animalForm, gender: e.target.value })
                          : setAnimalForm({ ...animalForm, status: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>{animalForm.kind === 'pig' ? 'Status' : 'Location'}</Label>
                        <Input value={animalForm.kind === 'pig' ? animalForm.status : animalForm.location} onChange={(e) => animalForm.kind === 'pig'
                          ? setAnimalForm({ ...animalForm, status: e.target.value })
                          : setAnimalForm({ ...animalForm, location: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>{animalForm.kind === 'pig' ? 'Pen Number' : 'Date Added'}</Label>
                        {animalForm.kind === 'pig' ? (
                          <Input value={animalForm.location} onChange={(e) => setAnimalForm({ ...animalForm, location: e.target.value })} />
                        ) : (
                          <Input type="date" value={animalForm.dateRecorded} onChange={(e) => setAnimalForm({ ...animalForm, dateRecorded: e.target.value })} />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Total Birds</Label>
                        <Input type="number" value={animalForm.count} onChange={(e) => setAnimalForm({ ...animalForm, count: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Female</Label>
                        <Input type="number" value={animalForm.femaleCount} onChange={(e) => setAnimalForm({ ...animalForm, femaleCount: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Male</Label>
                        <Input type="number" value={animalForm.maleCount} onChange={(e) => setAnimalForm({ ...animalForm, maleCount: Number(e.target.value) })} />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Date Added</Label>
                    <Input type="date" value={animalForm.dateRecorded} onChange={(e) => setAnimalForm({ ...animalForm, dateRecorded: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full gradient-primary" disabled={createAnimalMutation.isPending}>Save Animal Record</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isPondOpen} onOpenChange={setIsPondOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Fish className="mr-2 h-4 w-4" />Add Pond</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Fish Pond</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createPondMutation.mutate(pondForm); }} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Pond ID</Label><Input value={pondForm.pondId} onChange={(e) => setPondForm({ ...pondForm, pondId: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Fish Type</Label><Input value={pondForm.fishType} onChange={(e) => setPondForm({ ...pondForm, fishType: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2"><Label>Length</Label><Input type="number" value={pondForm.length} onChange={(e) => setPondForm({ ...pondForm, length: Number(e.target.value) })} /></div>
                    <div className="space-y-2"><Label>Width</Label><Input type="number" value={pondForm.width} onChange={(e) => setPondForm({ ...pondForm, width: Number(e.target.value) })} /></div>
                    <div className="space-y-2"><Label>Capacity</Label><Input type="number" value={pondForm.capacity} onChange={(e) => setPondForm({ ...pondForm, capacity: Number(e.target.value) })} /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Stocking Date</Label><Input type="date" value={pondForm.stockingDate} onChange={(e) => setPondForm({ ...pondForm, stockingDate: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Expected Harvest</Label><Input type="date" value={pondForm.expectedHarvestDate} onChange={(e) => setPondForm({ ...pondForm, expectedHarvestDate: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2"><Label>Location</Label><Input value={pondForm.location} onChange={(e) => setPondForm({ ...pondForm, location: e.target.value })} /></div>
                  <Button type="submit" className="w-full gradient-primary" disabled={createPondMutation.isPending}>Save Pond</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isStockOpen} onOpenChange={setIsStockOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Soup className="mr-2 h-4 w-4" />Stock Pond</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Stock Fish Pond</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); stockPondMutation.mutate(stockForm); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pond</Label>
                    <Select value={stockForm.pondId} onValueChange={(value) => setStockForm({ ...stockForm, pondId: value })}>
                      <SelectTrigger><SelectValue placeholder="Select pond" /></SelectTrigger>
                      <SelectContent>
                        {fishPonds.map((pond) => (
                          <SelectItem key={pond.id} value={pond.id}>{pond.pondId}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Fish Type</Label><Input value={stockForm.fishType} onChange={(e) => setStockForm({ ...stockForm, fishType: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Batch Number</Label><Input value={stockForm.batchNumber} onChange={(e) => setStockForm({ ...stockForm, batchNumber: e.target.value })} required /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2"><Label>Stocking Qty</Label><Input type="number" value={stockForm.numberOfFish} onChange={(e) => setStockForm({ ...stockForm, numberOfFish: Number(e.target.value) })} required /></div>
                    <div className="space-y-2"><Label>Stocking Date</Label><Input type="date" value={stockForm.dateRecorded} onChange={(e) => setStockForm({ ...stockForm, dateRecorded: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Expected Harvest</Label><Input type="date" value={stockForm.expectedHarvestDate} onChange={(e) => setStockForm({ ...stockForm, expectedHarvestDate: e.target.value })} /></div>
                  </div>
                  <Button type="submit" className="w-full gradient-primary" disabled={stockPondMutation.isPending}>Post Stocking</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isHealthOpen} onOpenChange={setIsHealthOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Syringe className="mr-2 h-4 w-4" />Log Health</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Health / Treatment Log</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); healthMutation.mutate(healthForm); }} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Reference Type</Label>
                      <Select value={healthForm.referenceKind} onValueChange={(value) => setHealthForm({ ...healthForm, referenceKind: value as ReferenceKind })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pig">Pig</SelectItem>
                          <SelectItem value="cattle">Cattle</SelectItem>
                          <SelectItem value="bird">Bird Group</SelectItem>
                          <SelectItem value="pond">Fish Pond</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Animal / Pond ID</Label><Input value={healthForm.referenceCode} onChange={(e) => setHealthForm({ ...healthForm, referenceCode: e.target.value })} required /></div>
                  </div>
                  <div className="space-y-2"><Label>Issue</Label><Input value={healthForm.issue} onChange={(e) => setHealthForm({ ...healthForm, issue: e.target.value })} required /></div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Treatment</Label><Input value={healthForm.treatment} onChange={(e) => setHealthForm({ ...healthForm, treatment: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Medicine Used</Label><Input value={healthForm.medicineUsed} onChange={(e) => setHealthForm({ ...healthForm, medicineUsed: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Medicine Inventory Item</Label>
                      <Select value={healthForm.inventoryStockItemId} onValueChange={(value) => setHealthForm({ ...healthForm, inventoryStockItemId: value })}>
                        <SelectTrigger><SelectValue placeholder="Optional inventory item" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No inventory posting</SelectItem>
                          {medicineInventory.map((item) => (
                            <SelectItem key={item.id} value={item.id}>{item.name} ({item.currentQuantity} {item.unit})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Qty Used</Label><Input type="number" value={healthForm.inventoryQuantityUsed} onChange={(e) => setHealthForm({ ...healthForm, inventoryQuantityUsed: Number(e.target.value) })} /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2"><Label>Staff / Vet</Label><Input value={healthForm.vetStaffResponsible} onChange={(e) => setHealthForm({ ...healthForm, vetStaffResponsible: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Log Date</Label><Input type="date" value={healthForm.logDate} onChange={(e) => setHealthForm({ ...healthForm, logDate: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Next Check</Label><Input type="date" value={healthForm.nextCheckDate} onChange={(e) => setHealthForm({ ...healthForm, nextCheckDate: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Recovery Status</Label>
                    <Select value={healthForm.recoveryStatus} onValueChange={(value) => setHealthForm({ ...healthForm, recoveryStatus: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="under_treatment">Under Treatment</SelectItem>
                        <SelectItem value="monitoring">Monitoring</SelectItem>
                        <SelectItem value="recovered">Recovered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Notes</Label><Textarea value={healthForm.notes} onChange={(e) => setHealthForm({ ...healthForm, notes: e.target.value })} /></div>
                  <Button type="submit" className="w-full gradient-primary" disabled={healthMutation.isPending}>Save Health Log</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isFeedOpen} onOpenChange={setIsFeedOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Wheat className="mr-2 h-4 w-4" />Log Feed</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Feed Usage Log</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); feedMutation.mutate(feedForm); }} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Reference Type</Label>
                      <Select value={feedForm.referenceKind} onValueChange={(value) => setFeedForm({ ...feedForm, referenceKind: value as ReferenceKind })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pig">Pig</SelectItem>
                          <SelectItem value="cattle">Cattle</SelectItem>
                          <SelectItem value="bird">Bird Group</SelectItem>
                          <SelectItem value="pond">Fish Pond</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Animal Group / Pond</Label><Input value={feedForm.groupName} onChange={(e) => setFeedForm({ ...feedForm, groupName: e.target.value, referenceCode: e.target.value })} required /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Feed Inventory Item</Label>
                      <Select
                        value={feedForm.feedStockItemId}
                        onValueChange={(value) => {
                          const selected = feedInventory.find((item) => item.id === value);
                          setFeedForm({
                            ...feedForm,
                            feedStockItemId: value,
                            feedItemName: selected?.name || feedForm.feedItemName,
                            unit: selected?.unit || feedForm.unit,
                            inventorySource: selected?.location || feedForm.inventorySource,
                          });
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select feed item" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No inventory posting</SelectItem>
                          {feedInventory.map((item) => (
                            <SelectItem key={item.id} value={item.id}>{item.name} ({item.currentQuantity} {item.unit})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Feed Item Name</Label><Input value={feedForm.feedItemName} onChange={(e) => setFeedForm({ ...feedForm, feedItemName: e.target.value })} required /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <div className="space-y-2"><Label>Qty Used</Label><Input type="number" value={feedForm.quantityUsed} onChange={(e) => setFeedForm({ ...feedForm, quantityUsed: Number(e.target.value) })} required /></div>
                    <div className="space-y-2"><Label>Unit</Label><Input value={feedForm.unit} onChange={(e) => setFeedForm({ ...feedForm, unit: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Inventory Source</Label><Input value={feedForm.inventorySource} onChange={(e) => setFeedForm({ ...feedForm, inventorySource: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Date</Label><Input type="date" value={feedForm.logDate} onChange={(e) => setFeedForm({ ...feedForm, logDate: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2"><Label>Notes</Label><Textarea value={feedForm.notes} onChange={(e) => setFeedForm({ ...feedForm, notes: e.target.value })} /></div>
                  <Button type="submit" className="w-full gradient-primary" disabled={feedMutation.isPending}>Save Feed Usage</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isMortalityOpen} onOpenChange={setIsMortalityOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Skull className="mr-2 h-4 w-4" />Log Mortality</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Mortality Log</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); mortalityMutation.mutate(mortalityForm); }} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={mortalityForm.livestockType} onValueChange={(value) => setMortalityForm({ ...mortalityForm, livestockType: value as MortalityForm['livestockType'] })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pig">Pig</SelectItem>
                          <SelectItem value="cattle">Cattle</SelectItem>
                          <SelectItem value="bird">Bird</SelectItem>
                          <SelectItem value="fish">Fish</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Animal / Batch / Pond ID</Label><Input value={mortalityForm.recordId} onChange={(e) => setMortalityForm({ ...mortalityForm, recordId: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2"><Label>Breed / Type</Label><Input value={mortalityForm.breedOrType} onChange={(e) => setMortalityForm({ ...mortalityForm, breedOrType: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Pen / Pond / Location</Label><Input value={mortalityForm.penOrLocation} onChange={(e) => setMortalityForm({ ...mortalityForm, penOrLocation: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Quantity</Label><Input type="number" min="1" value={mortalityForm.quantity} onChange={(e) => setMortalityForm({ ...mortalityForm, quantity: Number(e.target.value) })} /></div>
                  </div>
                  <div className="space-y-2"><Label>Cause</Label><Textarea value={mortalityForm.causeOfDeath} onChange={(e) => setMortalityForm({ ...mortalityForm, causeOfDeath: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={mortalityForm.dateRecorded} onChange={(e) => setMortalityForm({ ...mortalityForm, dateRecorded: e.target.value })} /></div>
                  <Button type="submit" className="w-full gradient-primary" disabled={mortalityMutation.isPending}>Save Mortality Record</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <DashboardKpi title="Total Animals" value={isLoading ? '...' : summary?.totalAnimals?.toLocaleString() ?? 0} detail="Current live units across all farm operations" icon={Activity} tone="primary" />
          <DashboardKpi title="Pigs" value={isLoading ? '...' : summary?.pigs ?? 0} detail="Tagged pig records" icon={BadgeAlert} tone="info" />
          <DashboardKpi title="Cattle" value={isLoading ? '...' : summary?.cattle ?? 0} detail="Active cattle records" icon={Beef} tone="warning" />
          <DashboardKpi title="Birds / Poultry" value={isLoading ? '...' : summary?.birds?.toLocaleString() ?? 0} detail="Bird count across active flocks" icon={Wheat} tone="success" />
          <DashboardKpi title="Fish Ponds" value={isLoading ? '...' : summary?.fishPonds ?? 0} detail="Tracked aquaculture ponds" icon={Fish} tone="info" />
          <DashboardKpi title="Healthy" value={isLoading ? '...' : summary?.healthyAnimals?.toLocaleString() ?? 0} detail="Operationally healthy units" icon={HeartPulse} tone="success" />
          <DashboardKpi title="Sick / Under Treatment" value={isLoading ? '...' : summary?.sickAnimals ?? 0} detail="Needs treatment follow-up" icon={ShieldPlus} tone="warning" />
          <DashboardKpi title="Mortality This Month" value={isLoading ? '...' : summary?.mortalityThisMonth ?? 0} detail="Losses recorded in current month" icon={Skull} tone="danger" />
          <DashboardKpi title="Feed Consumed This Month" value={isLoading ? '...' : summary?.feedConsumedThisMonth?.toLocaleString() ?? 0} detail="Feed issued from inventory" icon={Soup} tone="primary" />
          <DashboardKpi title="Upcoming Health Checks" value={isLoading ? '...' : summary?.upcomingHealthChecks ?? 0} detail="Due within the next 14 days" icon={Syringe} tone="info" />
        </div>

        <Card>
          <CardHeader className="space-y-2">
            <div>
              <CardTitle>Animal Register</CardTitle>
              <p className="text-xs text-muted-foreground">Unified register across pigs, cattle, and bird groups.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div className="relative xl:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search animal ID, species, breed, or location..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={speciesFilter} onValueChange={(value) => setSpeciesFilter(value as 'all' | AnimalKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All species</SelectItem>
                  <SelectItem value="pig">Pigs</SelectItem>
                  <SelectItem value="cattle">Cattle</SelectItem>
                  <SelectItem value="bird">Birds</SelectItem>
                </SelectContent>
              </Select>
              <Select value={healthFilter} onValueChange={setHealthFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All health</SelectItem>
                  <SelectItem value="healthy">Healthy</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="under_treatment">Under Treatment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Animal ID</TableHead>
                    <TableHead>Species</TableHead>
                    <TableHead>Breed</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Age / Date Added</TableHead>
                    <TableHead>Pen / Location</TableHead>
                    <TableHead>Health Status</TableHead>
                    <TableHead>Weight / Growth Stage</TableHead>
                    <TableHead>Last Treatment</TableHead>
                    <TableHead>Feed Type</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAnimals.map((row) => (
                    <TableRow key={`${row.type}-${row.id}`}>
                      <TableCell className="font-medium">{row.animalId}</TableCell>
                      <TableCell>{row.species}</TableCell>
                      <TableCell>{row.breed}</TableCell>
                      <TableCell>{row.gender}</TableCell>
                      <TableCell>{formatDate(row.ageOrDateAdded)}</TableCell>
                      <TableCell>{row.location}</TableCell>
                      <TableCell><Badge className={statusBadgeClass(row.healthStatus)}>{labelize(row.healthStatus)}</Badge></TableCell>
                      <TableCell>{row.weightOrGrowthStage}</TableCell>
                      <TableCell>{row.lastTreatment}</TableCell>
                      <TableCell>{row.feedType}</TableCell>
                      <TableCell>{row.notes}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setHealthForm({
                                ...healthForm,
                                referenceKind: row.type,
                                referenceId: row.id,
                                referenceCode: row.animalId,
                                vetStaffResponsible: '',
                                issue: '',
                                treatment: '',
                                notes: '',
                              });
                              setIsHealthOpen(true);
                            }}
                          >
                            Health
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMortalityForm({
                                ...mortalityForm,
                                livestockType: row.type,
                                breedOrType: row.breed,
                                recordId: row.animalId,
                                penOrLocation: row.location,
                                quantity: row.type === 'bird' ? 1 : 1,
                                sourceId: row.id,
                                causeOfDeath: '',
                              });
                              setIsMortalityOpen(true);
                            }}
                          >
                            Mortality
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredAnimals.length && (
                    <TableRow>
                      <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">No animal records match the current filters.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fish Pond Register</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pond ID</TableHead>
                    <TableHead>Fish Type</TableHead>
                    <TableHead className="text-right">Stocking Quantity</TableHead>
                    <TableHead className="text-right">Current Estimate</TableHead>
                    <TableHead className="text-right">Feed Used</TableHead>
                    <TableHead className="text-right">Mortality Count</TableHead>
                    <TableHead>Stocking Date</TableHead>
                    <TableHead>Expected Harvest</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fishPonds.map((pond) => (
                    <TableRow key={pond.id}>
                      <TableCell className="font-medium">{pond.pondId}</TableCell>
                      <TableCell>{pond.fishType}</TableCell>
                      <TableCell className="text-right">{pond.stockingQuantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{pond.currentEstimate.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{pond.feedUsed.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{pond.mortalityCount.toLocaleString()}</TableCell>
                      <TableCell>{formatDate(pond.stockingDate)}</TableCell>
                      <TableCell>{formatDate(pond.expectedHarvestDate)}</TableCell>
                      <TableCell><Badge className={statusBadgeClass(pond.status)}>{labelize(pond.status)}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setStockForm({
                                ...stockForm,
                                pondId: pond.id,
                                fishType: pond.fishType,
                                expectedHarvestDate: pond.expectedHarvestDate || '',
                              });
                              setIsStockOpen(true);
                            }}
                          >
                            Stock
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setHealthForm({
                                ...healthForm,
                                referenceKind: 'pond',
                                referenceId: pond.id,
                                referenceCode: pond.pondId,
                                issue: '',
                                treatment: '',
                                notes: '',
                              });
                              setIsHealthOpen(true);
                            }}
                          >
                            Health
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!fishPonds.length && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">No fish ponds available.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Health and Treatment Log</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Record ID</TableHead>
                      <TableHead>Animal / Pond ID</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Treatment</TableHead>
                      <TableHead>Medicine Used</TableHead>
                      <TableHead>Vet / Staff Responsible</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Recovery Status</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {healthLogs.slice(0, 10).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.recordId}</TableCell>
                        <TableCell>{row.animalOrPondId}</TableCell>
                        <TableCell className="font-medium">{row.issue}</TableCell>
                        <TableCell>{row.treatment || '-'}</TableCell>
                        <TableCell>{row.medicineUsed || '-'}</TableCell>
                        <TableCell>{row.vetStaffResponsible || row.staffName || '-'}</TableCell>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell><Badge className={statusBadgeClass(row.recoveryStatus || 'monitoring')}>{labelize(row.recoveryStatus)}</Badge></TableCell>
                        <TableCell>{row.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {!healthLogs.length && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">No health logs recorded yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Feed Usage Log</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Animal Group / Pond</TableHead>
                      <TableHead>Feed Item</TableHead>
                      <TableHead className="text-right">Quantity Used</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Inventory Source</TableHead>
                      <TableHead>Recorded By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedUsageLogs.slice(0, 10).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell className="font-medium">{row.animalGroupOrPond}</TableCell>
                        <TableCell>{row.feedItem}</TableCell>
                        <TableCell className="text-right">{row.quantityUsed.toLocaleString()}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell>{row.inventorySource}</TableCell>
                        <TableCell>{row.recordedBy}</TableCell>
                      </TableRow>
                    ))}
                    {!feedUsageLogs.length && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No feed usage logged yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Mortality Log</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Animal / Pond ID</TableHead>
                    <TableHead>Species</TableHead>
                    <TableHead>Cause</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Reported By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mortalityLogs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell className="font-medium">{row.animalOrPondId}</TableCell>
                      <TableCell>{labelize(row.species)}</TableCell>
                      <TableCell>{row.cause}</TableCell>
                      <TableCell className="text-right">{row.quantity}</TableCell>
                      <TableCell>{row.reportedBy}</TableCell>
                      <TableCell>{row.notes}</TableCell>
                    </TableRow>
                  ))}
                  {!mortalityLogs.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No mortality records recorded.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Animal Count by Species</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.speciesCounts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="name" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Health Status Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.healthStatuses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="name" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Feed Consumption Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={analytics.feedTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="label" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Area dataKey="feed" stroke="hsl(var(--warning))" fill="hsl(var(--warning) / 0.25)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Mortality Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.feedTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="label" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="mortality" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>Fish Pond Stocking vs Harvest Estimate</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.pondComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="name" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="stocked" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="estimate" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
