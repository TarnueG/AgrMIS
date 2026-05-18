import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Clock3,
  DollarSign,
  Fuel,
  Gauge,
  MapPin,
  PackagePlus,
  Plus,
  ShieldAlert,
  Tractor,
  UserRound,
  Wrench,
} from 'lucide-react';
import { format, formatDistanceToNowStrict, isAfter, parseISO } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

type AssetBoardStatus = 'available' | 'assigned' | 'maintenance' | 'out_of_service' | 'retired';
type AssetStatus = 'operational' | 'active' | 'under_maintenance' | 'decommissioned' | 'retired' | 'lost' | 'sold';
type AssetCondition = 'excellent' | 'good' | 'fair' | 'critical';
type AssetCategory = 'tractor' | 'vehicle' | 'generator' | 'irrigation' | 'storage' | 'tool' | 'infrastructure';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type MaintenanceStatus = 'scheduled' | 'due soon' | 'overdue' | 'completed';
type WorkOrderStatus = 'open' | 'assigned' | 'in progress' | 'waiting parts' | 'completed' | 'cancelled';

type SummaryResponse = {
  cards: {
    totalAssets: number;
    availableNow: number;
    inUseToday: number;
    inMaintenance: number;
    maintenanceDue: number;
    openWorkOrders: number;
    downtimeHours: number;
    monthlyMaintenanceCost: number;
    retiredSold: number;
    lostDamaged: number;
  };
  charts: {
    statusDistribution: { name: string; value: number }[];
    maintenanceCostTrend: { month: string; cost: number }[];
    downtimeByAsset: { asset: string; hours: number }[];
    usageHoursByCategory: { category: string; hours: number }[];
    upcomingMaintenanceCount: { label: string; count: number }[];
  };
};

type AssetRow = {
  id: string;
  asset_code: string | null;
  name: string;
  asset_type: string;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  current_value: number | null;
  location: string | null;
  assigned_to: string | null;
  assigned_operator: { id: string; full_name: string; job_title: string | null } | null;
  condition: AssetCondition;
  status: AssetStatus;
  board_status: AssetBoardStatus;
  last_service_date: string | null;
  next_service_date: string | null;
  warranty_expiry_date: string | null;
  notes: string | null;
  usage_hours: number;
  latest_usage: {
    date: string;
    operator: string | null;
    sector: string | null;
    activity: string | null;
    location: string | null;
  } | null;
  open_usage_id: string | null;
  next_maintenance: {
    id: string;
    service_type: string;
    due_date: string;
    priority: Priority;
    technician: string | null;
    status: MaintenanceStatus;
  } | null;
  open_work_order_count: number;
};

type AvailabilityResponse = Record<AssetBoardStatus, AssetRow[]>;

type MaintenanceRow = {
  id: string;
  assetId: string;
  asset: string;
  assetCode: string | null;
  serviceType: string;
  dueDate: string;
  priority: Priority;
  technician: string | null;
  estimatedCost: number;
  status: MaintenanceStatus;
  notes: string | null;
  completedAt: string | null;
};

type WorkOrderRow = {
  id: string;
  workOrderId: string;
  assetId: string;
  asset: string;
  issueServiceType: string;
  priority: Priority;
  requestedBy: string | null;
  assignedTechnician: string | null;
  openedDate: string | null;
  dueDate: string | null;
  status: WorkOrderStatus;
  cost: number;
  estimatedCost: number;
  notes: string | null;
};

type RepairRow = {
  id: string;
  asset: string;
  issue: string;
  repairAction: string;
  partsUsed: string[];
  downtimeHours: number;
  cost: number;
  completedBy: string | null;
  completedDate: string | null;
  notes: string | null;
};

type UsageRow = {
  id: string;
  date: string;
  assetId: string;
  asset: string;
  operator: string;
  sector: string | null;
  activity: string | null;
  hoursUsed: number;
  fuelCost: number;
  location: string | null;
  notes: string | null;
  endTime: string | null;
};

type EmployeeRow = {
  id: string;
  fullName: string;
  full_name?: string;
  job_title?: string | null;
  department?: string | null;
  sector?: string | null;
  status?: string | null;
};

type AssetForm = {
  name: string;
  assetCode: string;
  assetType: 'equipment' | 'vehicle' | 'tool' | 'infrastructure' | 'other';
  category: AssetCategory;
  manufacturer: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  purchaseCost: string;
  currentValue: string;
  location: string;
  condition: AssetCondition;
  status: AssetStatus;
  nextServiceDate: string;
  warrantyExpiryDate: string;
  notes: string;
};

type AssignmentForm = {
  operatorId: string;
  sector: string;
  activity: string;
  location: string;
  purpose: string;
  startTime: string;
  notes: string;
};

type ReturnForm = {
  endTime: string;
  fuelCost: string;
  notes: string;
};

type MaintenanceForm = {
  assetId: string;
  serviceType: string;
  dueDate: string;
  priority: Priority;
  technician: string;
  estimatedCost: string;
  notes: string;
};

type WorkOrderForm = {
  assetId: string;
  issueServiceType: string;
  priority: Priority;
  assignedTechnician: string;
  dueDate: string;
  estimatedCost: string;
  notes: string;
};

const statusLaneOrder: AssetBoardStatus[] = ['available', 'assigned', 'maintenance', 'out_of_service', 'retired'];
const chartColors = ['#7dd3fc', '#34d399', '#f59e0b', '#f87171', '#a78bfa'];

const defaultAssetForm: AssetForm = {
  name: '',
  assetCode: '',
  assetType: 'equipment',
  category: 'tractor',
  manufacturer: '',
  model: '',
  serialNumber: '',
  purchaseDate: '',
  purchaseCost: '',
  currentValue: '',
  location: '',
  condition: 'good',
  status: 'operational',
  nextServiceDate: '',
  warrantyExpiryDate: '',
  notes: '',
};

const defaultAssignmentForm: AssignmentForm = {
  operatorId: '',
  sector: 'Field Operations',
  activity: 'Dispatch to production',
  location: '',
  purpose: 'Production assignment',
  startTime: new Date().toISOString().slice(0, 16),
  notes: '',
};

const defaultReturnForm: ReturnForm = {
  endTime: new Date().toISOString().slice(0, 16),
  fuelCost: '',
  notes: '',
};

const defaultMaintenanceForm: MaintenanceForm = {
  assetId: '',
  serviceType: '',
  dueDate: new Date().toISOString().slice(0, 10),
  priority: 'normal',
  technician: '',
  estimatedCost: '',
  notes: '',
};

const defaultWorkOrderForm: WorkOrderForm = {
  assetId: '',
  issueServiceType: '',
  priority: 'normal',
  assignedTechnician: '',
  dueDate: '',
  estimatedCost: '',
  notes: '',
};

function fmtCurrency(value?: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function fmtDate(value?: string | null, pattern = 'MMM d, yyyy') {
  if (!value) return 'Not set';
  const date = parseISO(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return format(date, pattern);
}

function fmtDateTime(value?: string | null) {
  if (!value) return 'Open';
  const date = parseISO(value);
  if (Number.isNaN(date.getTime())) return 'Open';
  return format(date, 'MMM d, yyyy HH:mm');
}

function labelize(value?: string | null) {
  if (!value) return 'Unspecified';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function priorityClass(priority: Priority) {
  const map: Record<Priority, string> = {
    low: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    normal: 'bg-slate-500/15 text-slate-200 border-slate-500/30',
    high: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    urgent: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  return map[priority];
}

function conditionClass(condition: AssetCondition) {
  const map: Record<AssetCondition, string> = {
    excellent: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    good: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    fair: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  return map[condition];
}

function boardClass(status: AssetBoardStatus) {
  const map: Record<AssetBoardStatus, string> = {
    available: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    assigned: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    maintenance: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    out_of_service: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    retired: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  return map[status];
}

function maintenanceStatusClass(status: MaintenanceStatus) {
  const map: Record<MaintenanceStatus, string> = {
    scheduled: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    'due soon': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    overdue: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  };
  return map[status];
}

function workOrderStatusClass(status: WorkOrderStatus) {
  const map: Record<WorkOrderStatus, string> = {
    open: 'bg-slate-500/15 text-slate-200 border-slate-500/30',
    assigned: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    'in progress': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'waiting parts': 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    cancelled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  return map[status];
}

function toNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function StatTile({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: typeof Tractor;
}) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</p>
          <p className="text-2xl font-semibold text-white">{value}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <Icon className="h-4 w-4 text-slate-200" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-slate-950/50 p-6 text-center">
      <p className="font-medium text-slate-200">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

export default function Machinery() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assetSearch, setAssetSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState<'all' | AssetBoardStatus>('all');
  const [activeTab, setActiveTab] = useState('register');
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [workOrderDialogOpen, setWorkOrderDialogOpen] = useState(false);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);
  const [assetForm, setAssetForm] = useState<AssetForm>(defaultAssetForm);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(defaultAssignmentForm);
  const [returnForm, setReturnForm] = useState<ReturnForm>(defaultReturnForm);
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceForm>(defaultMaintenanceForm);
  const [workOrderForm, setWorkOrderForm] = useState<WorkOrderForm>(defaultWorkOrderForm);

  const { data: summary } = useQuery<SummaryResponse>({
    queryKey: ['assets-summary'],
    queryFn: () => api.get('/assets/summary'),
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery<AssetRow[]>({
    queryKey: ['assets-register'],
    queryFn: () => api.get('/assets'),
  });

  const { data: availability } = useQuery<AvailabilityResponse>({
    queryKey: ['assets-availability'],
    queryFn: () => api.get('/assets/availability'),
  });

  const { data: maintenance = [] } = useQuery<MaintenanceRow[]>({
    queryKey: ['assets-maintenance'],
    queryFn: () => api.get('/assets/maintenance'),
  });

  const { data: workOrders = [] } = useQuery<WorkOrderRow[]>({
    queryKey: ['assets-work-orders'],
    queryFn: () => api.get('/assets/work-orders'),
  });

  const { data: repairs = [] } = useQuery<RepairRow[]>({
    queryKey: ['assets-repairs'],
    queryFn: () => api.get('/assets/repairs'),
  });

  const { data: usageLogs = [] } = useQuery<UsageRow[]>({
    queryKey: ['assets-usage'],
    queryFn: () => api.get('/assets/usage'),
  });

  const { data: employees = [] } = useQuery<EmployeeRow[]>({
    queryKey: ['machinery-employees'],
    queryFn: () => api.get('/hr/employees'),
  });

  const invalidateAssets = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['assets-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['assets-register'] }),
      queryClient.invalidateQueries({ queryKey: ['assets-availability'] }),
      queryClient.invalidateQueries({ queryKey: ['assets-maintenance'] }),
      queryClient.invalidateQueries({ queryKey: ['assets-work-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['assets-repairs'] }),
      queryClient.invalidateQueries({ queryKey: ['assets-usage'] }),
    ]);

  const createAsset = useMutation({
    mutationFn: () =>
      api.post('/assets', {
        ...assetForm,
        assetCode: assetForm.assetCode || undefined,
        manufacturer: assetForm.manufacturer || undefined,
        model: assetForm.model || undefined,
        serialNumber: assetForm.serialNumber || undefined,
        purchaseDate: assetForm.purchaseDate || undefined,
        purchaseCost: toNumber(assetForm.purchaseCost),
        currentValue: toNumber(assetForm.currentValue),
        location: assetForm.location || undefined,
        nextServiceDate: assetForm.nextServiceDate || undefined,
        warrantyExpiryDate: assetForm.warrantyExpiryDate || undefined,
        notes: assetForm.notes || undefined,
      }),
    onSuccess: async () => {
      await invalidateAssets();
      setAssetDialogOpen(false);
      setAssetForm(defaultAssetForm);
      toast({ title: 'Asset added to register' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to add asset', variant: 'destructive' }),
  });

  const assignAsset = useMutation({
    mutationFn: () => {
      if (!selectedAsset) throw new Error('No asset selected');
      return api.post(`/assets/${selectedAsset.id}/assign`, {
        ...assignmentForm,
        location: assignmentForm.location || selectedAsset.location || undefined,
        startTime: assignmentForm.startTime || undefined,
        notes: assignmentForm.notes || undefined,
      });
    },
    onSuccess: async () => {
      await invalidateAssets();
      setAssignDialogOpen(false);
      setSelectedAsset(null);
      setAssignmentForm(defaultAssignmentForm);
      toast({ title: 'Asset dispatched to operations' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to assign asset', variant: 'destructive' }),
  });

  const returnAsset = useMutation({
    mutationFn: () => {
      if (!selectedAsset) throw new Error('No asset selected');
      return api.post(`/assets/${selectedAsset.id}/return`, {
        endTime: returnForm.endTime || undefined,
        fuelCost: toNumber(returnForm.fuelCost),
        notes: returnForm.notes || undefined,
      });
    },
    onSuccess: async () => {
      await invalidateAssets();
      setReturnDialogOpen(false);
      setSelectedAsset(null);
      setReturnForm(defaultReturnForm);
      toast({ title: 'Asset returned from field use' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to return asset', variant: 'destructive' }),
  });

  const scheduleMaintenance = useMutation({
    mutationFn: () =>
      api.post('/assets/maintenance', {
        assetId: maintenanceForm.assetId,
        serviceType: maintenanceForm.serviceType,
        dueDate: maintenanceForm.dueDate,
        priority: maintenanceForm.priority,
        technician: maintenanceForm.technician || undefined,
        estimatedCost: toNumber(maintenanceForm.estimatedCost),
        notes: maintenanceForm.notes || undefined,
      }),
    onSuccess: async () => {
      await invalidateAssets();
      setMaintenanceDialogOpen(false);
      setMaintenanceForm(defaultMaintenanceForm);
      toast({ title: 'Maintenance task scheduled' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to schedule maintenance', variant: 'destructive' }),
  });

  const completeMaintenance = useMutation({
    mutationFn: (row: MaintenanceRow) =>
      api.patch(`/assets/maintenance/${row.id}/complete`, {
        actualCost: row.estimatedCost || undefined,
        completedDate: new Date().toISOString(),
        nextServiceDate: selectedAsset?.next_service_date ?? addDaysString(30),
        serviceProvider: row.technician || undefined,
      }),
    onSuccess: async () => {
      await invalidateAssets();
      toast({ title: 'Maintenance marked complete' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to complete maintenance', variant: 'destructive' }),
  });

  const createWorkOrder = useMutation({
    mutationFn: () =>
      api.post('/assets/work-orders', {
        assetId: workOrderForm.assetId,
        issueServiceType: workOrderForm.issueServiceType,
        priority: workOrderForm.priority,
        assignedTechnician: workOrderForm.assignedTechnician || undefined,
        dueDate: workOrderForm.dueDate || undefined,
        estimatedCost: toNumber(workOrderForm.estimatedCost),
        notes: workOrderForm.notes || undefined,
      }),
    onSuccess: async () => {
      await invalidateAssets();
      setWorkOrderDialogOpen(false);
      setWorkOrderForm(defaultWorkOrderForm);
      toast({ title: 'Work order created' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to create work order', variant: 'destructive' }),
  });

  const closeWorkOrder = useMutation({
    mutationFn: (order: WorkOrderRow) =>
      api.patch(`/assets/work-orders/${order.id}`, {
        status: 'completed',
        actualCost: order.cost || order.estimatedCost || undefined,
        completedDate: new Date().toISOString(),
        repairAction: `Closed from machinery module: ${order.issueServiceType}`,
        downtimeHours: 2,
        completedBy: order.assignedTechnician || 'Workshop team',
        notes: order.notes || undefined,
      }),
    onSuccess: async () => {
      await invalidateAssets();
      toast({ title: 'Work order completed' });
    },
    onError: (error: any) => toast({ title: error.message || 'Failed to update work order', variant: 'destructive' }),
  });

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (assetFilter !== 'all' && asset.board_status !== assetFilter) return false;
      if (!assetSearch.trim()) return true;
      const haystack = [
        asset.asset_code,
        asset.name,
        asset.category,
        asset.model,
        asset.serial_number,
        asset.location,
        asset.assigned_operator?.full_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(assetSearch.trim().toLowerCase());
    });
  }, [assetFilter, assetSearch, assets]);

  const overdueAssets = useMemo(
    () => assets.filter((asset) => asset.next_maintenance?.status === 'overdue'),
    [assets],
  );

  const workshopAlerts = useMemo(
    () => workOrders.filter((order) => ['open', 'assigned', 'in progress', 'waiting parts'].includes(order.status)),
    [workOrders],
  );

  const operators = useMemo(
    () =>
      employees.filter((employee) =>
        (employee.status ?? 'active') !== 'inactive' &&
        isAfter(new Date(), new Date('2020-01-01')) &&
        /operator|driver|technician|supervisor|manager|worker|storekeeper/i.test(
          `${employee.job_title ?? ''} ${employee.department ?? ''} ${employee.sector ?? ''}`,
        ),
      ),
    [employees],
  );

  const topUsageAssets = useMemo(
    () =>
      [...assets]
        .sort((a, b) => b.usage_hours - a.usage_hours)
        .slice(0, 5),
    [assets],
  );

  function openAssign(asset: AssetRow) {
    setSelectedAsset(asset);
    setAssignmentForm({
      ...defaultAssignmentForm,
      location: asset.location || '',
    });
    setAssignDialogOpen(true);
  }

  function openReturn(asset: AssetRow) {
    setSelectedAsset(asset);
    setReturnForm(defaultReturnForm);
    setReturnDialogOpen(true);
  }

  function openSchedule(asset?: AssetRow) {
    setSelectedAsset(asset ?? null);
    setMaintenanceForm({
      ...defaultMaintenanceForm,
      assetId: asset?.id ?? '',
    });
    setMaintenanceDialogOpen(true);
  }

  function addDaysString(days: number) {
    const next = new Date();
    next.setDate(next.getDate() + days);
    return next.toISOString().slice(0, 10);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.15),_transparent_24%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.94))] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">Equipment Operations Header</Badge>
              <div>
                <h1 className="text-3xl font-semibold text-white">Machinery &amp; Assets</h1>
                <p className="text-slate-400">
                  Equipment availability, maintenance planning, usage logs, and asset lifecycle tracking.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                    <Plus className="mr-2 h-4 w-4" />
                    Register Asset
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add asset to machinery register</DialogTitle>
                    <DialogDescription>Create a production-ready equipment or infrastructure record.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Asset Name"><Input value={assetForm.name} onChange={(e) => setAssetForm((s) => ({ ...s, name: e.target.value }))} /></Field>
                    <Field label="Asset Code"><Input value={assetForm.assetCode} onChange={(e) => setAssetForm((s) => ({ ...s, assetCode: e.target.value }))} /></Field>
                    <Field label="Category">
                      <Select value={assetForm.category} onValueChange={(value: AssetCategory) => setAssetForm((s) => ({ ...s, category: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['tractor', 'vehicle', 'generator', 'irrigation', 'storage', 'tool', 'infrastructure'].map((category) => (
                            <SelectItem key={category} value={category}>{labelize(category)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Asset Type">
                      <Select value={assetForm.assetType} onValueChange={(value: AssetForm['assetType']) => setAssetForm((s) => ({ ...s, assetType: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equipment">Equipment</SelectItem>
                          <SelectItem value="vehicle">Vehicle</SelectItem>
                          <SelectItem value="tool">Tool</SelectItem>
                          <SelectItem value="infrastructure">Infrastructure</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Manufacturer"><Input value={assetForm.manufacturer} onChange={(e) => setAssetForm((s) => ({ ...s, manufacturer: e.target.value }))} /></Field>
                    <Field label="Model"><Input value={assetForm.model} onChange={(e) => setAssetForm((s) => ({ ...s, model: e.target.value }))} /></Field>
                    <Field label="Serial / License"><Input value={assetForm.serialNumber} onChange={(e) => setAssetForm((s) => ({ ...s, serialNumber: e.target.value }))} /></Field>
                    <Field label="Current Location"><Input value={assetForm.location} onChange={(e) => setAssetForm((s) => ({ ...s, location: e.target.value }))} /></Field>
                    <Field label="Purchase Date"><Input type="date" value={assetForm.purchaseDate} onChange={(e) => setAssetForm((s) => ({ ...s, purchaseDate: e.target.value }))} /></Field>
                    <Field label="Asset Value"><Input type="number" value={assetForm.currentValue} onChange={(e) => setAssetForm((s) => ({ ...s, currentValue: e.target.value }))} /></Field>
                    <Field label="Condition">
                      <Select value={assetForm.condition} onValueChange={(value: AssetCondition) => setAssetForm((s) => ({ ...s, condition: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['excellent', 'good', 'fair', 'critical'].map((condition) => (
                            <SelectItem key={condition} value={condition}>{labelize(condition)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Status">
                      <Select value={assetForm.status} onValueChange={(value: AssetStatus) => setAssetForm((s) => ({ ...s, status: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['operational', 'active', 'under_maintenance', 'decommissioned', 'retired', 'lost', 'sold'].map((status) => (
                            <SelectItem key={status} value={status}>{labelize(status)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Next Service"><Input type="date" value={assetForm.nextServiceDate} onChange={(e) => setAssetForm((s) => ({ ...s, nextServiceDate: e.target.value }))} /></Field>
                    <Field label="Warranty Expiry"><Input type="date" value={assetForm.warrantyExpiryDate} onChange={(e) => setAssetForm((s) => ({ ...s, warrantyExpiryDate: e.target.value }))} /></Field>
                    <Field label="Notes" className="md:col-span-2">
                      <Textarea rows={4} value={assetForm.notes} onChange={(e) => setAssetForm((s) => ({ ...s, notes: e.target.value }))} />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => createAsset.mutate()} disabled={createAsset.isPending || !assetForm.name.trim()}>
                      Save Asset
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={workOrderDialogOpen} onOpenChange={setWorkOrderDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                    <Wrench className="mr-2 h-4 w-4" />
                    New Work Order
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create maintenance work order</DialogTitle>
                    <DialogDescription>Track repairs, waiting parts, and workshop execution.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4">
                    <Field label="Asset">
                      <Select value={workOrderForm.assetId} onValueChange={(value) => setWorkOrderForm((s) => ({ ...s, assetId: value }))}>
                        <SelectTrigger><SelectValue placeholder="Choose asset" /></SelectTrigger>
                        <SelectContent>
                          {assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Issue / Service Type"><Input value={workOrderForm.issueServiceType} onChange={(e) => setWorkOrderForm((s) => ({ ...s, issueServiceType: e.target.value }))} /></Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Priority">
                        <Select value={workOrderForm.priority} onValueChange={(value: Priority) => setWorkOrderForm((s) => ({ ...s, priority: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['low', 'normal', 'high', 'urgent'].map((priority) => <SelectItem key={priority} value={priority}>{labelize(priority)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Assigned Technician"><Input value={workOrderForm.assignedTechnician} onChange={(e) => setWorkOrderForm((s) => ({ ...s, assignedTechnician: e.target.value }))} /></Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Due Date"><Input type="date" value={workOrderForm.dueDate} onChange={(e) => setWorkOrderForm((s) => ({ ...s, dueDate: e.target.value }))} /></Field>
                      <Field label="Estimated Cost"><Input type="number" value={workOrderForm.estimatedCost} onChange={(e) => setWorkOrderForm((s) => ({ ...s, estimatedCost: e.target.value }))} /></Field>
                    </div>
                    <Field label="Notes"><Textarea rows={3} value={workOrderForm.notes} onChange={(e) => setWorkOrderForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => createWorkOrder.mutate()} disabled={createWorkOrder.isPending || !workOrderForm.assetId || !workOrderForm.issueServiceType.trim()}>
                      Open Work Order
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => openSchedule()}>
                <CalendarClock className="mr-2 h-4 w-4" />
                Schedule Service
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatTile title="Total Assets" value={summary?.cards.totalAssets ?? 0} detail="Tracked equipment and infrastructure" icon={Tractor} />
            <StatTile title="Available Now" value={summary?.cards.availableNow ?? 0} detail="Ready for dispatch" icon={ShieldAlert} />
            <StatTile title="In Use Today" value={summary?.cards.inUseToday ?? 0} detail="Usage logs opened today" icon={Gauge} />
            <StatTile title="In Maintenance" value={summary?.cards.inMaintenance ?? 0} detail="Workshop and service bay" icon={Wrench} />
            <StatTile title="Maintenance Due" value={summary?.cards.maintenanceDue ?? 0} detail="Scheduled service still open" icon={CalendarClock} />
            <StatTile title="Open Work Orders" value={summary?.cards.openWorkOrders ?? 0} detail="Issues needing workshop action" icon={PackagePlus} />
            <StatTile title="Downtime Hours" value={summary?.cards.downtimeHours ?? 0} detail="Total logged downtime" icon={Clock3} />
            <StatTile title="Monthly Maintenance Cost" value={fmtCurrency(summary?.cards.monthlyMaintenanceCost)} detail="Repairs plus scheduled service" icon={DollarSign} />
            <StatTile title="Retired / Sold" value={summary?.cards.retiredSold ?? 0} detail="Off the active board" icon={BarChart3} />
            <StatTile title="Lost / Damaged" value={summary?.cards.lostDamaged ?? 0} detail="Needs investigation or disposal" icon={AlertTriangle} />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader className="flex flex-row items-end justify-between">
              <div>
                <CardTitle className="text-white">Asset Availability Board</CardTitle>
                <p className="mt-1 text-sm text-slate-400">Dispatch board grouped by current operating status.</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  placeholder="Search asset, code, operator, location"
                  className="w-72 border-white/10 bg-white/5"
                />
                <Select value={assetFilter} onValueChange={(value: 'all' | AssetBoardStatus) => setAssetFilter(value)}>
                  <SelectTrigger className="w-44 border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {statusLaneOrder.map((status) => <SelectItem key={status} value={status}>{labelize(status)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-5">
              {statusLaneOrder.map((status) => {
                const list = (availability?.[status] ?? []).filter((asset) => filteredAssets.some((row) => row.id === asset.id));
                return (
                  <div key={status} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">{labelize(status)}</p>
                        <p className="text-xs text-slate-500">{list.length} assets</p>
                      </div>
                      <Badge className={boardClass(status)}>{labelize(status)}</Badge>
                    </div>
                    <div className="space-y-3">
                      {list.map((asset) => (
                        <div key={asset.id} className="rounded-xl border border-white/10 bg-slate-900/80 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-white">{asset.name}</p>
                              <p className="text-xs text-slate-400">{labelize(asset.category || asset.asset_type)} • {asset.asset_code || 'No code'}</p>
                            </div>
                            <Badge className={conditionClass(asset.condition)}>{labelize(asset.condition)}</Badge>
                          </div>
                          <div className="mt-3 space-y-2 text-xs text-slate-400">
                            <div className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5" />{asset.assigned_operator?.full_name || 'Unassigned operator'}</div>
                            <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{asset.location || 'Location not set'}</div>
                            <div className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" />Next service {fmtDate(asset.next_maintenance?.due_date || asset.next_service_date)}</div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            {asset.board_status === 'available' ? (
                              <Button size="sm" className="flex-1" onClick={() => openAssign(asset)}>Assign</Button>
                            ) : asset.board_status === 'assigned' ? (
                              <Button size="sm" className="flex-1" onClick={() => openReturn(asset)}>Return</Button>
                            ) : (
                              <Button size="sm" variant="outline" className="flex-1 border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => openSchedule(asset)}>
                                Service
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {!list.length && <EmptyState title={`No ${labelize(status)} assets`} detail="Nothing in this lane for the current filter." />}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">Workshop Pulse</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overdueAssets.slice(0, 4).map((asset) => (
                  <div key={asset.id} className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
                    <p className="font-medium text-white">{asset.name}</p>
                    <p className="text-sm text-rose-200">{asset.next_maintenance?.service_type || 'Maintenance overdue'}</p>
                    <p className="mt-1 text-xs text-rose-300">Due {fmtDate(asset.next_maintenance?.due_date || asset.next_service_date)}</p>
                  </div>
                ))}
                {!overdueAssets.length && <EmptyState title="No overdue service" detail="All assets are within current maintenance windows." />}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">Open Workshop Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {workshopAlerts.slice(0, 5).map((order) => (
                  <div key={order.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-white">{order.asset}</p>
                        <p className="text-sm text-slate-400">{order.issueServiceType}</p>
                      </div>
                      <Badge className={workOrderStatusClass(order.status)}>{labelize(order.status)}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{order.assignedTechnician || 'No technician assigned'}</span>
                      <span>{fmtDate(order.dueDate)}</span>
                    </div>
                  </div>
                ))}
                {!workshopAlerts.length && <EmptyState title="No open work orders" detail="The workshop queue is currently clear." />}
              </CardContent>
            </Card>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 bg-slate-950/70">
            <TabsTrigger value="register">Asset Register</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="history">Repair & Usage</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="register" className="space-y-4">
            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">Asset Register Table</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Serial or License</TableHead>
                      <TableHead>Current Location</TableHead>
                      <TableHead>Assigned Operator</TableHead>
                      <TableHead>Usage Hours</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Purchase Date</TableHead>
                      <TableHead>Asset Value</TableHead>
                      <TableHead>Next Service</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell className="font-mono text-xs">{asset.asset_code || 'N/A'}</TableCell>
                        <TableCell className="font-medium text-white">{asset.name}</TableCell>
                        <TableCell>{labelize(asset.category || asset.asset_type)}</TableCell>
                        <TableCell>{asset.model || 'N/A'}</TableCell>
                        <TableCell>{asset.serial_number || 'N/A'}</TableCell>
                        <TableCell>{asset.location || 'N/A'}</TableCell>
                        <TableCell>{asset.assigned_operator?.full_name || 'Unassigned'}</TableCell>
                        <TableCell>{asset.usage_hours.toFixed(1)}h</TableCell>
                        <TableCell><Badge className={conditionClass(asset.condition)}>{labelize(asset.condition)}</Badge></TableCell>
                        <TableCell><Badge className={boardClass(asset.board_status)}>{labelize(asset.board_status)}</Badge></TableCell>
                        <TableCell>{fmtDate(asset.purchase_date)}</TableCell>
                        <TableCell>{fmtCurrency(asset.current_value)}</TableCell>
                        <TableCell>{fmtDate(asset.next_maintenance?.due_date || asset.next_service_date)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {asset.board_status === 'available' && <Button size="sm" onClick={() => openAssign(asset)}>Assign</Button>}
                            {asset.board_status === 'assigned' && <Button size="sm" onClick={() => openReturn(asset)}>Return</Button>}
                            {asset.board_status !== 'retired' && (
                              <Button size="sm" variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => openSchedule(asset)}>
                                Service
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filteredAssets.length && (
                      <TableRow>
                        <TableCell colSpan={14} className="py-8 text-center text-slate-500">
                          {assetsLoading ? 'Loading asset register...' : 'No assets match the current filter.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="maintenance" className="space-y-4">
            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">Preventive Maintenance Calendar</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  {maintenance.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-white">{row.asset}</p>
                          <p className="text-sm text-slate-400">{row.serviceType}</p>
                        </div>
                        <Badge className={maintenanceStatusClass(row.status)}>{labelize(row.status)}</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-400 md:grid-cols-2">
                        <span>Due Date: {fmtDate(row.dueDate)}</span>
                        <span>Priority: <span className="text-slate-200">{labelize(row.priority)}</span></span>
                        <span>Technician: {row.technician || 'Unassigned'}</span>
                        <span>Estimated Cost: {fmtCurrency(row.estimatedCost)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>{row.notes || 'No notes'}</span>
                        {row.status !== 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                            onClick={() => {
                              setSelectedAsset(assets.find((asset) => asset.id === row.assetId) ?? null);
                              completeMaintenance.mutate(row);
                            }}
                            disabled={completeMaintenance.isPending}
                          >
                            Complete
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!maintenance.length && <EmptyState title="No scheduled maintenance" detail="Create service tasks for tractors, pumps, generators, and storage assets." />}
                </div>
                <Card className="border-white/10 bg-slate-900/70">
                  <CardHeader>
                    <CardTitle className="text-white">Upcoming Service Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[380px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary?.charts.upcomingMaintenanceCount ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="label" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }}
                          formatter={(value: number) => [value, 'Count']}
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {(summary?.charts.upcomingMaintenanceCount ?? []).map((entry, index) => (
                            <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">Work Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Order ID</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Issue / Service Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Assigned Technician</TableHead>
                      <TableHead>Opened Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs">{order.workOrderId}</TableCell>
                        <TableCell className="font-medium text-white">{order.asset}</TableCell>
                        <TableCell>{order.issueServiceType}</TableCell>
                        <TableCell><Badge className={priorityClass(order.priority)}>{labelize(order.priority)}</Badge></TableCell>
                        <TableCell>{order.requestedBy || 'System'}</TableCell>
                        <TableCell>{order.assignedTechnician || 'Unassigned'}</TableCell>
                        <TableCell>{fmtDate(order.openedDate)}</TableCell>
                        <TableCell>{fmtDate(order.dueDate)}</TableCell>
                        <TableCell><Badge className={workOrderStatusClass(order.status)}>{labelize(order.status)}</Badge></TableCell>
                        <TableCell>{fmtCurrency(order.cost || order.estimatedCost)}</TableCell>
                        <TableCell>
                          {order.status !== 'completed' && order.status !== 'cancelled' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                              onClick={() => closeWorkOrder.mutate(order)}
                              disabled={closeWorkOrder.isPending}
                            >
                              Complete
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-500">Closed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!workOrders.length && (
                      <TableRow>
                        <TableCell colSpan={11} className="py-8 text-center text-slate-500">No work orders created yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">Repair History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Repair Action</TableHead>
                      <TableHead>Parts Used</TableHead>
                      <TableHead>Downtime Hours</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Completed By</TableHead>
                      <TableHead>Completed Date</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repairs.map((repair) => (
                      <TableRow key={repair.id}>
                        <TableCell className="font-medium text-white">{repair.asset}</TableCell>
                        <TableCell>{repair.issue}</TableCell>
                        <TableCell>{repair.repairAction}</TableCell>
                        <TableCell>{repair.partsUsed.length ? repair.partsUsed.join(', ') : 'None recorded'}</TableCell>
                        <TableCell>{repair.downtimeHours.toFixed(1)}h</TableCell>
                        <TableCell>{fmtCurrency(repair.cost)}</TableCell>
                        <TableCell>{repair.completedBy || 'Workshop team'}</TableCell>
                        <TableCell>{fmtDate(repair.completedDate)}</TableCell>
                        <TableCell>{repair.notes || 'No notes'}</TableCell>
                      </TableRow>
                    ))}
                    {!repairs.length && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-slate-500">No repair history logged yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">Usage Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Hours Used</TableHead>
                      <TableHead>Fuel Cost</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{fmtDateTime(log.date)}</TableCell>
                        <TableCell className="font-medium text-white">{log.asset}</TableCell>
                        <TableCell>{log.operator}</TableCell>
                        <TableCell>{log.sector || 'General'}</TableCell>
                        <TableCell>{log.activity || 'Field work'}</TableCell>
                        <TableCell>{log.hoursUsed ? `${log.hoursUsed.toFixed(1)}h` : 'Open log'}</TableCell>
                        <TableCell>{log.fuelCost ? fmtCurrency(log.fuelCost) : 'N/A'}</TableCell>
                        <TableCell>{log.location || 'N/A'}</TableCell>
                        <TableCell>{log.notes || 'No notes'}</TableCell>
                      </TableRow>
                    ))}
                    {!usageLogs.length && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-slate-500">No usage logs yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-white/10 bg-slate-950/70">
                <CardHeader>
                  <CardTitle className="text-white">Asset Status Distribution</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={summary?.charts.statusDistribution ?? []} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={4}>
                        {(summary?.charts.statusDistribution ?? []).map((entry, index) => (
                          <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-slate-950/70">
                <CardHeader>
                  <CardTitle className="text-white">Maintenance Cost Trend</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summary?.charts.maintenanceCostTrend ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" tickFormatter={(value) => `$${value}`} />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} formatter={(value: number) => [fmtCurrency(value), 'Cost']} />
                      <Line type="monotone" dataKey="cost" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-slate-950/70">
                <CardHeader>
                  <CardTitle className="text-white">Downtime by Asset</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary?.charts.downtimeByAsset ?? []} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis type="number" stroke="#94a3b8" />
                      <YAxis dataKey="asset" type="category" stroke="#94a3b8" width={120} />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} formatter={(value: number) => [`${value}h`, 'Downtime']} />
                      <Bar dataKey="hours" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-slate-950/70">
                <CardHeader>
                  <CardTitle className="text-white">Usage Hours by Asset Category</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary?.charts.usageHoursByCategory ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="category" stroke="#94a3b8" tickFormatter={(value) => labelize(String(value))} />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} formatter={(value: number) => [`${value.toFixed(1)}h`, 'Hours']} />
                      <Bar dataKey="hours" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="border-white/10 bg-slate-950/70">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-white">Top Utilized Assets</CardTitle>
                <Badge className="border-white/10 bg-white/5 text-slate-300">Usage hours</Badge>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-5">
                {topUsageAssets.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="font-medium text-white">{asset.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{labelize(asset.category || asset.asset_type)}</p>
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Usage</span>
                      <span className="font-semibold text-cyan-300">{asset.usage_hours.toFixed(1)}h</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Operator</span>
                      <span className="text-slate-200">{asset.assigned_operator?.full_name || asset.latest_usage?.operator || 'Unassigned'}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Last use</span>
                      <span className="text-slate-200">{asset.latest_usage?.date ? formatDistanceToNowStrict(parseISO(asset.latest_usage.date), { addSuffix: true }) : 'No usage yet'}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign asset</DialogTitle>
              <DialogDescription>{selectedAsset?.name} will be dispatched to an operator and sector.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Field label="Operator">
                <Select value={assignmentForm.operatorId} onValueChange={(value) => setAssignmentForm((s) => ({ ...s, operatorId: value }))}>
                  <SelectTrigger><SelectValue placeholder="Choose operator" /></SelectTrigger>
                  <SelectContent>
                    {operators.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>{employee.fullName || employee.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Sector"><Input value={assignmentForm.sector} onChange={(e) => setAssignmentForm((s) => ({ ...s, sector: e.target.value }))} /></Field>
                <Field label="Activity"><Input value={assignmentForm.activity} onChange={(e) => setAssignmentForm((s) => ({ ...s, activity: e.target.value }))} /></Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Location"><Input value={assignmentForm.location} onChange={(e) => setAssignmentForm((s) => ({ ...s, location: e.target.value }))} /></Field>
                <Field label="Start Time"><Input type="datetime-local" value={assignmentForm.startTime} onChange={(e) => setAssignmentForm((s) => ({ ...s, startTime: e.target.value }))} /></Field>
              </div>
              <Field label="Purpose"><Input value={assignmentForm.purpose} onChange={(e) => setAssignmentForm((s) => ({ ...s, purpose: e.target.value }))} /></Field>
              <Field label="Notes"><Textarea rows={3} value={assignmentForm.notes} onChange={(e) => setAssignmentForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => assignAsset.mutate()} disabled={assignAsset.isPending || !assignmentForm.operatorId}>Dispatch Asset</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Return asset from field use</DialogTitle>
              <DialogDescription>Close the active usage record and restore asset availability.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Field label="Return Time"><Input type="datetime-local" value={returnForm.endTime} onChange={(e) => setReturnForm((s) => ({ ...s, endTime: e.target.value }))} /></Field>
              <Field label="Fuel Cost"><Input type="number" value={returnForm.fuelCost} onChange={(e) => setReturnForm((s) => ({ ...s, fuelCost: e.target.value }))} /></Field>
              <Field label="Notes"><Textarea rows={3} value={returnForm.notes} onChange={(e) => setReturnForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => returnAsset.mutate()} disabled={returnAsset.isPending}>Return Asset</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={maintenanceDialogOpen} onOpenChange={setMaintenanceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule preventive maintenance</DialogTitle>
              <DialogDescription>Create a service task for equipment uptime and compliance.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Field label="Asset">
                <Select value={maintenanceForm.assetId} onValueChange={(value) => setMaintenanceForm((s) => ({ ...s, assetId: value }))}>
                  <SelectTrigger><SelectValue placeholder="Choose asset" /></SelectTrigger>
                  <SelectContent>
                    {assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Service Type"><Input value={maintenanceForm.serviceType} onChange={(e) => setMaintenanceForm((s) => ({ ...s, serviceType: e.target.value }))} /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Due Date"><Input type="date" value={maintenanceForm.dueDate} onChange={(e) => setMaintenanceForm((s) => ({ ...s, dueDate: e.target.value }))} /></Field>
                <Field label="Priority">
                  <Select value={maintenanceForm.priority} onValueChange={(value: Priority) => setMaintenanceForm((s) => ({ ...s, priority: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['low', 'normal', 'high', 'urgent'].map((priority) => <SelectItem key={priority} value={priority}>{labelize(priority)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Technician"><Input value={maintenanceForm.technician} onChange={(e) => setMaintenanceForm((s) => ({ ...s, technician: e.target.value }))} /></Field>
                <Field label="Estimated Cost"><Input type="number" value={maintenanceForm.estimatedCost} onChange={(e) => setMaintenanceForm((s) => ({ ...s, estimatedCost: e.target.value }))} /></Field>
              </div>
              <Field label="Notes"><Textarea rows={3} value={maintenanceForm.notes} onChange={(e) => setMaintenanceForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => scheduleMaintenance.mutate()} disabled={scheduleMaintenance.isPending || !maintenanceForm.assetId || !maintenanceForm.serviceType.trim()}>
                Create Schedule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}
