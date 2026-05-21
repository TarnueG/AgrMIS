import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AreaChart as AreaChartIcon,
  Beaker,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Factory,
  PackagePlus,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  XCircle,
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
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';

type BatchStatus = 'pending' | 'in_process' | 'quality_check' | 'passed' | 'rework' | 'declined';
type Sector = 'crop' | 'livestock' | 'aquaculture' | 'processing';

type ProductionBatch = {
  id: string;
  requestId: string | null;
  batchNumber: string;
  productName: string;
  sector: Sector;
  linkedSalesOrderId: string | null;
  linkedSalesOrderNumber: string | null;
  linkedCustomer: string | null;
  plannedQuantity: number;
  producedQuantity: number;
  wasteQuantity: number;
  unit: string;
  status: BatchStatus;
  startDate: string | null;
  expectedCompletion: string | null;
  actualCompletion: string | null;
  failureReason: string | null;
  requestedFromOrder: boolean;
  notes: string | null;
  location: string | null;
  passedToInventory: boolean;
  createdAt: string | null;
};

type RequestedOrder = {
  id: string;
  productName: string;
  plannedQuantity: number;
  unit: string;
  status: string;
  location: string | null;
  linkedSalesOrderId: string | null;
  linkedSalesOrderNumber: string | null;
  linkedCustomer: string | null;
  dueDate: string | null;
  rejectionReason: string | null;
  notes: string | null;
  batchCount: number;
  createdAt: string | null;
};

type InputConsumption = {
  id: string;
  batchId: string | null;
  batchNumber: string;
  productName: string;
  inputItem: string;
  quantityUsed: number;
  unit: string;
  sourceInventoryLocation: string;
  dateUsed: string;
  recordedBy: string;
  notes: string | null;
};

type QualityCheck = {
  id: string;
  batchId: string | null;
  batchNumber: string;
  productName: string;
  inspectionDate: string;
  result: 'passed' | 'rework' | 'failed';
  notes: string | null;
  checkedBy: string;
};

type DailyLog = {
  id: string;
  date: string;
  sector: Sector;
  activity: string;
  batchId: string | null;
  batchNumber: string | null;
  workersAssigned: string;
  equipmentUsed: string;
  notes: string | null;
  recordedBy: string;
};

type SalesOrderOption = {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  deliveryDate: string | null;
  items: {
    stockItemId: string;
    productName: string;
    unit: string;
    quantity: number;
  }[];
};

type StockItemOption = {
  id: string;
  name: string;
  unit: string;
  currentQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  location: string | null;
  category: string | null;
};

type CommandCenterPayload = {
  batches: ProductionBatch[];
  requestedOrders: RequestedOrder[];
  inputConsumptions: InputConsumption[];
  qualityChecks: QualityCheck[];
  dailyLogs: DailyLog[];
  salesOrders: SalesOrderOption[];
  stockItems: StockItemOption[];
};

type BatchForm = {
  productName: string;
  sector: Sector;
  plannedQuantity: number;
  unit: string;
  linkedSalesOrderId: string;
  stockItemId: string;
  location: string;
  startDate: string;
  expectedCompletion: string;
  notes: string;
};

type ConsumptionForm = {
  stockItemId: string;
  quantityUsed: number;
  usedAt: string;
  notes: string;
};

type QualityForm = {
  result: 'passed' | 'rework' | 'failed';
  producedQuantity: number;
  wasteQuantity: number;
  checkedAt: string;
  failureReason: string;
  notes: string;
};

type DailyLogForm = {
  batchId: string;
  sector: Sector;
  activity: string;
  logDate: string;
  workersAssigned: string;
  equipmentUsed: string;
  notes: string;
};

const batchStatusOptions: { value: 'all' | BatchStatus; label: string }[] = [
  { value: 'all', label: 'All status' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_process', label: 'In Process' },
  { value: 'quality_check', label: 'Quality Check' },
  { value: 'passed', label: 'Passed' },
  { value: 'rework', label: 'Rework' },
  { value: 'declined', label: 'Declined' },
];

const sectorOptions: { value: 'all' | Sector; label: string }[] = [
  { value: 'all', label: 'All sectors' },
  { value: 'crop', label: 'Crop' },
  { value: 'livestock', label: 'Livestock' },
  { value: 'aquaculture', label: 'Aquaculture' },
  { value: 'processing', label: 'Processing' },
];

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

function isCurrentMonth(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function statusBadgeClass(status: string) {
  const styles: Record<string, string> = {
    pending: 'bg-warning/20 text-warning border-warning/20',
    in_process: 'bg-info/20 text-info border-info/20',
    quality_check: 'bg-primary/20 text-primary border-primary/20',
    passed: 'bg-success/20 text-success border-success/20',
    rework: 'bg-accent/20 text-accent border-accent/20',
    declined: 'bg-destructive/20 text-destructive border-destructive/20',
    failed: 'bg-destructive/20 text-destructive border-destructive/20',
  };
  return styles[status] || 'bg-muted text-muted-foreground border-border';
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
  icon: typeof Factory;
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

export default function Production() {
  const { toast } = useToast();
  const { canCreate, canEdit } = usePermissions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BatchStatus>('all');
  const [sectorFilter, setSectorFilter] = useState<'all' | Sector>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [consumptionBatch, setConsumptionBatch] = useState<ProductionBatch | null>(null);
  const [qualityBatch, setQualityBatch] = useState<ProductionBatch | null>(null);
  const [batchForm, setBatchForm] = useState<BatchForm>({
    productName: '',
    sector: 'processing',
    plannedQuantity: 0,
    unit: 'kg',
    linkedSalesOrderId: 'none',
    stockItemId: 'none',
    location: '',
    startDate: new Date().toISOString().slice(0, 10),
    expectedCompletion: '',
    notes: '',
  });
  const [consumptionForm, setConsumptionForm] = useState<ConsumptionForm>({
    stockItemId: 'none',
    quantityUsed: 0,
    usedAt: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [qualityForm, setQualityForm] = useState<QualityForm>({
    result: 'passed',
    producedQuantity: 0,
    wasteQuantity: 0,
    checkedAt: new Date().toISOString().slice(0, 10),
    failureReason: '',
    notes: '',
  });
  const [dailyLogForm, setDailyLogForm] = useState<DailyLogForm>({
    batchId: 'none',
    sector: 'processing',
    activity: '',
    logDate: new Date().toISOString().slice(0, 10),
    workersAssigned: '',
    equipmentUsed: '',
    notes: '',
  });

  const { data } = useQuery({
    queryKey: ['production-command-center'],
    queryFn: () => api.get<CommandCenterPayload>('/production/command-center'),
  });

  const batches = data?.batches || [];
  const requestedOrders = data?.requestedOrders || [];
  const inputConsumptions = data?.inputConsumptions || [];
  const qualityChecks = data?.qualityChecks || [];
  const dailyLogs = data?.dailyLogs || [];
  const salesOrders = data?.salesOrders || [];
  const stockItems = data?.stockItems || [];

  const selectedSalesOrder = useMemo(
    () => salesOrders.find((order) => order.id === batchForm.linkedSalesOrderId),
    [batchForm.linkedSalesOrderId, salesOrders],
  );

  const availableOrderItems = selectedSalesOrder?.items || [];

  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const searchValue = search.toLowerCase();
      const dateValue = batch.startDate ? new Date(batch.startDate).getTime() : batch.createdAt ? new Date(batch.createdAt).getTime() : null;
      const fromValue = dateFrom ? new Date(dateFrom).getTime() : null;
      const toValue = dateTo ? new Date(dateTo).getTime() : null;
      const matchesSearch =
        batch.batchNumber.toLowerCase().includes(searchValue) ||
        batch.productName.toLowerCase().includes(searchValue) ||
        (batch.linkedSalesOrderNumber || '').toLowerCase().includes(searchValue) ||
        (batch.linkedCustomer || '').toLowerCase().includes(searchValue);
      const matchesStatus = statusFilter === 'all' || batch.status === statusFilter;
      const matchesSector = sectorFilter === 'all' || batch.sector === sectorFilter;
      const matchesFrom = fromValue == null || dateValue == null || dateValue >= fromValue;
      const matchesTo = toValue == null || dateValue == null || dateValue <= toValue;
      return matchesSearch && matchesStatus && matchesSector && matchesFrom && matchesTo;
    });
  }, [batches, dateFrom, dateTo, search, sectorFilter, statusFilter]);

  const analytics = useMemo(() => {
    const batchCount = batches.length;
    const pending = batches.filter((batch) => batch.status === 'pending').length;
    const inProcess = batches.filter((batch) => batch.status === 'in_process').length;
    const qualityCheck = batches.filter((batch) => batch.status === 'quality_check').length;
    const passed = batches.filter((batch) => batch.status === 'passed').length;
    const rework = batches.filter((batch) => batch.status === 'rework').length;
    const declined = batches.filter((batch) => batch.status === 'declined').length;
    const outputThisMonth = batches
      .filter((batch) => batch.status === 'passed' && isCurrentMonth(batch.actualCompletion || batch.createdAt))
      .reduce((sum, batch) => sum + batch.producedQuantity, 0);
    const inputThisMonth = inputConsumptions
      .filter((row) => isCurrentMonth(row.dateUsed))
      .reduce((sum, row) => sum + row.quantityUsed, 0);

    const monthlyMap = new Map<string, { label: string; output: number }>();
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - index);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyMap.set(key, {
        label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date),
        output: 0,
      });
    }

    batches.forEach((batch) => {
      const baseDate = batch.actualCompletion || batch.createdAt;
      if (!baseDate) return;
      const date = new Date(baseDate);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = monthlyMap.get(key);
      if (bucket) bucket.output += batch.producedQuantity;
    });

    const sectorMap = new Map<string, number>();
    batches.forEach((batch) => {
      sectorMap.set(labelize(batch.sector), (sectorMap.get(labelize(batch.sector)) || 0) + batch.producedQuantity);
    });

    const wasteByProduct = batches
      .filter((batch) => batch.wasteQuantity > 0)
      .map((batch) => ({ name: batch.productName, waste: batch.wasteQuantity }))
      .sort((a, b) => b.waste - a.waste)
      .slice(0, 6);

    const statusDistribution = batchStatusOptions
      .filter((option) => option.value !== 'all')
      .map((option) => ({
        name: option.label,
        value: batches.filter((batch) => batch.status === option.value).length,
      }));

    return {
      batchCount,
      pending,
      inProcess,
      qualityCheck,
      passed,
      rework,
      declined,
      outputThisMonth,
      inputThisMonth,
      monthlyOutput: Array.from(monthlyMap.values()),
      outputBySector: Array.from(sectorMap.entries()).map(([name, value]) => ({ name, value })),
      wasteByProduct,
      statusDistribution,
    };
  }, [batches, inputConsumptions]);

  const createBatchMutation = useMutation({
    mutationFn: (payload: BatchForm) =>
      api.post('/production/batches', {
        productName: payload.productName,
        sector: payload.sector,
        plannedQuantity: payload.plannedQuantity,
        unit: payload.unit,
        linkedSalesOrderId: payload.linkedSalesOrderId === 'none' ? null : payload.linkedSalesOrderId,
        stockItemId: payload.stockItemId === 'none' ? null : payload.stockItemId,
        location: payload.location || null,
        startDate: payload.startDate || null,
        expectedCompletion: payload.expectedCompletion || null,
        notes: payload.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-command-center'] });
      toast({ title: 'Production batch created' });
      setIsBatchOpen(false);
      setBatchForm({
        productName: '',
        sector: 'processing',
        plannedQuantity: 0,
        unit: 'kg',
        linkedSalesOrderId: 'none',
        stockItemId: 'none',
        location: '',
        startDate: new Date().toISOString().slice(0, 10),
        expectedCompletion: '',
        notes: '',
      });
    },
    onError: (error) => {
      toast({ title: 'Error creating batch', description: error.message, variant: 'destructive' });
    },
  });

  const updateBatchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'pending' | 'in_process' | 'quality_check' }) =>
      api.patch(`/production/batches/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-command-center'] });
      toast({ title: 'Batch updated' });
    },
    onError: (error) => {
      toast({ title: 'Error updating batch', description: error.message, variant: 'destructive' });
    },
  });

  const consumeMutation = useMutation({
    mutationFn: ({ batchId, payload }: { batchId: string; payload: ConsumptionForm }) =>
      api.post(`/production/batches/${batchId}/consume`, {
        stockItemId: payload.stockItemId,
        quantityUsed: payload.quantityUsed,
        usedAt: payload.usedAt || null,
        notes: payload.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-command-center'] });
      toast({ title: 'Input consumption posted to inventory' });
      setConsumptionBatch(null);
      setConsumptionForm({
        stockItemId: 'none',
        quantityUsed: 0,
        usedAt: new Date().toISOString().slice(0, 10),
        notes: '',
      });
    },
    onError: (error) => {
      toast({ title: 'Error posting consumption', description: error.message, variant: 'destructive' });
    },
  });

  const qualityMutation = useMutation({
    mutationFn: ({ batchId, payload }: { batchId: string; payload: QualityForm }) =>
      api.post(`/production/batches/${batchId}/quality-check`, {
        result: payload.result,
        producedQuantity: payload.producedQuantity,
        wasteQuantity: payload.wasteQuantity,
        checkedAt: payload.checkedAt || null,
        failureReason: payload.failureReason || null,
        notes: payload.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-command-center'] });
      toast({ title: 'Quality check recorded' });
      setQualityBatch(null);
    },
    onError: (error) => {
      toast({ title: 'Error recording quality check', description: error.message, variant: 'destructive' });
    },
  });

  const logMutation = useMutation({
    mutationFn: (payload: DailyLogForm) =>
      api.post('/production/daily-logs', {
        batchId: payload.batchId === 'none' ? null : payload.batchId,
        sector: payload.sector,
        activity: payload.activity,
        logDate: payload.logDate || null,
        workersAssigned: payload.workersAssigned || null,
        equipmentUsed: payload.equipmentUsed || null,
        notes: payload.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-command-center'] });
      toast({ title: 'Daily production log added' });
      setIsLogOpen(false);
      setDailyLogForm({
        batchId: 'none',
        sector: 'processing',
        activity: '',
        logDate: new Date().toISOString().slice(0, 10),
        workersAssigned: '',
        equipmentUsed: '',
        notes: '',
      });
    },
    onError: (error) => {
      toast({ title: 'Error adding log', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary/15 text-primary border-primary/20">Production Command Center</Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {batches.length} active batches
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Production Management</h1>
              <p className="text-sm text-muted-foreground">
                Track production batches, input usage, quality results, daily execution logs, and inventory posting across crop, livestock, aquaculture, and processing.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!canCreate('production')}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Add Daily Log
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Daily Production Log</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    logMutation.mutate(dailyLogForm);
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Sector</Label>
                      <Select value={dailyLogForm.sector} onValueChange={(value) => setDailyLogForm({ ...dailyLogForm, sector: value as Sector })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {sectorOptions.filter((option) => option.value !== 'all').map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={dailyLogForm.logDate} onChange={(event) => setDailyLogForm({ ...dailyLogForm, logDate: event.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Batch</Label>
                    <Select value={dailyLogForm.batchId} onValueChange={(value) => setDailyLogForm({ ...dailyLogForm, batchId: value })}>
                      <SelectTrigger><SelectValue placeholder="Optional batch" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No batch link</SelectItem>
                        {batches.map((batch) => (
                          <SelectItem key={batch.id} value={batch.id}>{batch.batchNumber} - {batch.productName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Activity</Label>
                    <Input value={dailyLogForm.activity} onChange={(event) => setDailyLogForm({ ...dailyLogForm, activity: event.target.value })} required />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Workers Assigned</Label>
                      <Input value={dailyLogForm.workersAssigned} onChange={(event) => setDailyLogForm({ ...dailyLogForm, workersAssigned: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Equipment Used</Label>
                      <Input value={dailyLogForm.equipmentUsed} onChange={(event) => setDailyLogForm({ ...dailyLogForm, equipmentUsed: event.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={dailyLogForm.notes} onChange={(event) => setDailyLogForm({ ...dailyLogForm, notes: event.target.value })} />
                  </div>
                  <Button type="submit" className="w-full gradient-primary" disabled={logMutation.isPending || !canCreate('production')}>Save Daily Log</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isBatchOpen} onOpenChange={setIsBatchOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-black" disabled={!canCreate('production')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Batch
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Production Batch</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    createBatchMutation.mutate(batchForm);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label>Linked Sales Order</Label>
                    <Select
                      value={batchForm.linkedSalesOrderId}
                      onValueChange={(value) => {
                        const nextOrder = salesOrders.find((order) => order.id === value);
                        const firstItem = nextOrder?.items[0];
                        setBatchForm({
                          ...batchForm,
                          linkedSalesOrderId: value,
                          productName: firstItem?.productName || batchForm.productName,
                          stockItemId: firstItem?.stockItemId || 'none',
                          unit: firstItem?.unit || batchForm.unit,
                          plannedQuantity: firstItem?.quantity || batchForm.plannedQuantity,
                        });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Optional sales order" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Manual batch</SelectItem>
                        {salesOrders.map((order) => (
                          <SelectItem key={order.id} value={order.id}>{order.orderNumber} - {order.customerName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {batchForm.linkedSalesOrderId !== 'none' && availableOrderItems.length > 0 && (
                    <div className="space-y-2">
                      <Label>Order Product</Label>
                      <Select
                        value={batchForm.stockItemId}
                        onValueChange={(value) => {
                          const selectedItem = availableOrderItems.find((item) => item.stockItemId === value);
                          setBatchForm({
                            ...batchForm,
                            stockItemId: value,
                            productName: selectedItem?.productName || batchForm.productName,
                            unit: selectedItem?.unit || batchForm.unit,
                            plannedQuantity: selectedItem?.quantity || batchForm.plannedQuantity,
                          });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {availableOrderItems.map((item) => (
                            <SelectItem key={item.stockItemId} value={item.stockItemId}>{item.productName} ({item.quantity} {item.unit})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Product Name</Label>
                      <Input value={batchForm.productName} onChange={(event) => setBatchForm({ ...batchForm, productName: event.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Sector</Label>
                      <Select value={batchForm.sector} onValueChange={(value) => setBatchForm({ ...batchForm, sector: value as Sector })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {sectorOptions.filter((option) => option.value !== 'all').map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Planned Quantity</Label>
                      <Input type="number" min="0" value={batchForm.plannedQuantity} onChange={(event) => setBatchForm({ ...batchForm, plannedQuantity: Number(event.target.value) })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Input value={batchForm.unit} onChange={(event) => setBatchForm({ ...batchForm, unit: event.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Storage / Location</Label>
                      <Input value={batchForm.location} onChange={(event) => setBatchForm({ ...batchForm, location: event.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input type="date" value={batchForm.startDate} onChange={(event) => setBatchForm({ ...batchForm, startDate: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Expected Completion</Label>
                      <Input type="date" value={batchForm.expectedCompletion} onChange={(event) => setBatchForm({ ...batchForm, expectedCompletion: event.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={batchForm.notes} onChange={(event) => setBatchForm({ ...batchForm, notes: event.target.value })} />
                  </div>
                  <Button type="submit" className="w-full gradient-primary" disabled={createBatchMutation.isPending || !canCreate('production')}>Create Batch</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <DashboardKpi title="Total Production Batches" value={analytics.batchCount} detail="All active production runs" icon={Factory} tone="primary" />
          <DashboardKpi title="Pending" value={analytics.pending} detail="Awaiting execution start" icon={CalendarClock} tone="warning" />
          <DashboardKpi title="In Process" value={analytics.inProcess} detail="Currently consuming resources" icon={Activity} tone="info" />
          <DashboardKpi title="Quality Check" value={analytics.qualityCheck} detail="Awaiting QA release" icon={ShieldCheck} tone="primary" />
          <DashboardKpi title="Passed" value={analytics.passed} detail="Finished goods posted" icon={CheckCircle2} tone="success" />
          <DashboardKpi title="Rework" value={analytics.rework} detail="Held for corrective action" icon={Wrench} tone="warning" />
          <DashboardKpi title="Declined" value={analytics.declined} detail="Failed production batches" icon={XCircle} tone="danger" />
          <DashboardKpi title="Requested Orders" value={requestedOrders.length} detail="Open sales-order-driven requests" icon={ClipboardList} tone="info" />
          <DashboardKpi title="Output This Month" value={analytics.outputThisMonth.toLocaleString()} detail="Passed output quantity this month" icon={PackagePlus} tone="success" />
          <DashboardKpi title="Input Consumed This Month" value={analytics.inputThisMonth.toLocaleString()} detail="Inventory issued into production" icon={Beaker} tone="primary" />
        </div>

        <Card>
          <CardHeader className="space-y-2">
            <div>
              <CardTitle>Production Batch Register</CardTitle>
              <p className="text-xs text-muted-foreground">Batch execution, linked sales orders, expected completion, and quality disposition.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
              <div className="relative xl:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search batch, product, customer, or order..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
              </div>
              <Select value={sectorFilter} onValueChange={(value) => setSectorFilter(value as 'all' | Sector)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sectorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | BatchStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {batchStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch No.</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Linked Sales Order</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Produced</TableHead>
                    <TableHead className="text-right">Waste / Loss</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBatches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono text-xs">{batch.batchNumber}</TableCell>
                      <TableCell className="space-y-1">
                        <div className="font-medium">{batch.productName}</div>
                        {batch.failureReason && <div className="text-[11px] text-destructive">{batch.failureReason}</div>}
                      </TableCell>
                      <TableCell>{labelize(batch.sector)}</TableCell>
                      <TableCell>
                        <div>{batch.linkedSalesOrderNumber || '-'}</div>
                        <div className="text-[11px] text-muted-foreground">{batch.linkedCustomer || 'Internal demand'}</div>
                      </TableCell>
                      <TableCell className="text-right">{batch.plannedQuantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{batch.producedQuantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{batch.wasteQuantity.toLocaleString()}</TableCell>
                      <TableCell>{batch.unit}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={statusBadgeClass(batch.status)}>{labelize(batch.status)}</Badge>
                          {batch.passedToInventory && <Badge className="bg-success/10 text-success border-success/20">Posted</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(batch.startDate)}</TableCell>
                      <TableCell>{formatDate(batch.expectedCompletion)}</TableCell>
                      <TableCell>{formatDate(batch.actualCompletion)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {['pending', 'in_process'].includes(batch.status) && (
                            <Select
                              value={batch.status}
                              disabled={!canEdit('production')}
                              onValueChange={(value) => updateBatchMutation.mutate({ id: batch.id, status: value as 'pending' | 'in_process' | 'quality_check' })}
                            >
                              <SelectTrigger className="h-8 w-[148px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="in_process">In Process</SelectItem>
                                <SelectItem value="quality_check">Quality Check</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          {['pending', 'in_process', 'quality_check', 'rework'].includes(batch.status) && (
                            <Button variant="outline" size="sm" disabled={!canCreate('production')} onClick={() => {
                              setConsumptionBatch(batch);
                              setConsumptionForm({
                                stockItemId: 'none',
                                quantityUsed: 0,
                                usedAt: new Date().toISOString().slice(0, 10),
                                notes: '',
                              });
                            }}>
                              Consume Input
                            </Button>
                          )}
                          {['in_process', 'quality_check', 'rework'].includes(batch.status) && (
                            <Button variant="outline" size="sm" disabled={!canCreate('production')} onClick={() => {
                              setQualityBatch(batch);
                              setQualityForm({
                                result: 'passed',
                                producedQuantity: batch.producedQuantity || batch.plannedQuantity,
                                wasteQuantity: batch.wasteQuantity || 0,
                                checkedAt: new Date().toISOString().slice(0, 10),
                                failureReason: '',
                                notes: '',
                              });
                            }}>
                              Quality Check
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredBatches.length && (
                    <TableRow>
                      <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                        No production batches found for the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Input Consumption</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch No.</TableHead>
                      <TableHead>Input Item</TableHead>
                      <TableHead className="text-right">Quantity Used</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Source Inventory Location</TableHead>
                      <TableHead>Date Used</TableHead>
                      <TableHead>Recorded By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inputConsumptions.slice(0, 12).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.batchNumber}</TableCell>
                        <TableCell className="space-y-1">
                          <div className="font-medium">{row.inputItem}</div>
                          {row.notes && <div className="text-[11px] text-muted-foreground">{row.notes}</div>}
                        </TableCell>
                        <TableCell className="text-right">{row.quantityUsed.toLocaleString()}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell>{row.sourceInventoryLocation}</TableCell>
                        <TableCell>{formatDate(row.dateUsed)}</TableCell>
                        <TableCell>{row.recordedBy}</TableCell>
                      </TableRow>
                    ))}
                    {!inputConsumptions.length && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No production inputs consumed yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Requested Order Queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requestedOrders.slice(0, 5).map((request) => (
                <div key={request.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{request.productName}</p>
                      <p className="text-xs text-muted-foreground">{request.linkedSalesOrderNumber || 'Manual request'} {request.linkedCustomer ? `- ${request.linkedCustomer}` : ''}</p>
                    </div>
                    <Badge className={statusBadgeClass(request.status)}>{labelize(request.status)}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {request.plannedQuantity.toLocaleString()} {request.unit} requested
                    {request.dueDate ? ` · due ${formatDate(request.dueDate)}` : ''}
                  </div>
                </div>
              ))}
              {!requestedOrders.length && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No open requested orders.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quality Check Register</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch No.</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Inspection Date</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Checked By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qualityChecks.slice(0, 12).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.batchNumber}</TableCell>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell>{formatDate(row.inspectionDate)}</TableCell>
                      <TableCell><Badge className={statusBadgeClass(row.result)}>{labelize(row.result)}</Badge></TableCell>
                      <TableCell>{row.notes || '-'}</TableCell>
                      <TableCell>{row.checkedBy}</TableCell>
                    </TableRow>
                  ))}
                  {!qualityChecks.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No quality checks recorded yet.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily Production Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Workers Assigned</TableHead>
                    <TableHead>Equipment Used</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyLogs.slice(0, 12).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>{labelize(row.sector)}</TableCell>
                      <TableCell className="font-medium">{row.activity}</TableCell>
                      <TableCell>{row.batchNumber || '-'}</TableCell>
                      <TableCell>{row.workersAssigned}</TableCell>
                      <TableCell>{row.equipmentUsed}</TableCell>
                      <TableCell>{row.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {!dailyLogs.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No daily production logs available.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Production Output Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={analytics.monthlyOutput}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="label" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Area dataKey="output" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.25)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Output by Sector</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.outputBySector}>
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
            <CardHeader>
              <CardTitle>Waste / Loss by Product</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.wasteByProduct} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis type="number" stroke="hsl(220, 10%, 55%)" />
                  <YAxis type="category" dataKey="name" width={130} stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="waste" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Batch Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.statusDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                  <XAxis dataKey="name" stroke="hsl(220, 10%, 55%)" />
                  <YAxis stroke="hsl(220, 10%, 55%)" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 12%)', border: '1px solid hsl(220, 20%, 20%)', borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Dialog open={!!consumptionBatch} onOpenChange={(open) => { if (!open) setConsumptionBatch(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Consume Inventory Input</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!consumptionBatch || consumptionForm.stockItemId === 'none') return;
                consumeMutation.mutate({ batchId: consumptionBatch.id, payload: consumptionForm });
              }}
              className="space-y-4"
            >
              <div className="rounded-lg border border-border bg-card/60 p-3 text-sm text-muted-foreground">
                {consumptionBatch?.batchNumber} - {consumptionBatch?.productName}
              </div>
              <div className="space-y-2">
                <Label>Input Item</Label>
                <Select value={consumptionForm.stockItemId} onValueChange={(value) => setConsumptionForm({ ...consumptionForm, stockItemId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select inventory item" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select an input item</SelectItem>
                    {stockItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name} ({item.availableQuantity} {item.unit})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Quantity Used</Label>
                  <Input type="number" min="0" value={consumptionForm.quantityUsed} onChange={(event) => setConsumptionForm({ ...consumptionForm, quantityUsed: Number(event.target.value) })} required />
                </div>
                <div className="space-y-2">
                  <Label>Date Used</Label>
                  <Input type="date" value={consumptionForm.usedAt} onChange={(event) => setConsumptionForm({ ...consumptionForm, usedAt: event.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={consumptionForm.notes} onChange={(event) => setConsumptionForm({ ...consumptionForm, notes: event.target.value })} />
              </div>
              <Button type="submit" className="w-full gradient-primary" disabled={consumeMutation.isPending || !canCreate('production')}>
                Post Consumption
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!qualityBatch} onOpenChange={(open) => { if (!open) setQualityBatch(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Quality Check</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!qualityBatch) return;
                qualityMutation.mutate({ batchId: qualityBatch.id, payload: qualityForm });
              }}
              className="space-y-4"
            >
              <div className="rounded-lg border border-border bg-card/60 p-3 text-sm text-muted-foreground">
                {qualityBatch?.batchNumber} - {qualityBatch?.productName}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Result</Label>
                  <Select value={qualityForm.result} onValueChange={(value) => setQualityForm({ ...qualityForm, result: value as QualityForm['result'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passed">Passed</SelectItem>
                      <SelectItem value="rework">Rework</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Inspection Date</Label>
                  <Input type="date" value={qualityForm.checkedAt} onChange={(event) => setQualityForm({ ...qualityForm, checkedAt: event.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Produced Quantity</Label>
                  <Input type="number" min="0" value={qualityForm.producedQuantity} onChange={(event) => setQualityForm({ ...qualityForm, producedQuantity: Number(event.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Waste / Loss Quantity</Label>
                  <Input type="number" min="0" value={qualityForm.wasteQuantity} onChange={(event) => setQualityForm({ ...qualityForm, wasteQuantity: Number(event.target.value) })} />
                </div>
              </div>
              {qualityForm.result === 'failed' && (
                <div className="space-y-2">
                  <Label>Failure Reason</Label>
                  <Textarea value={qualityForm.failureReason} onChange={(event) => setQualityForm({ ...qualityForm, failureReason: event.target.value })} required />
                </div>
              )}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={qualityForm.notes} onChange={(event) => setQualityForm({ ...qualityForm, notes: event.target.value })} />
              </div>
              <Button type="submit" className="w-full gradient-primary" disabled={qualityMutation.isPending || !canCreate('production')}>
                Save Quality Result
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
