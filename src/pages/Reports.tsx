import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  Download,
  Factory,
  HardHat,
  Package,
  PiggyBank,
  RefreshCcw,
  ScanSearch,
  ShieldAlert,
  ShoppingCart,
  Tractor,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import api, { getAccessToken } from '@/lib/api';
import { formatCurrency, formatCurrencyPrecise, formatFinanceDate, formatPercent, titleize } from '@/lib/finance-format';

type Filters = {
  dateFrom: string;
  dateTo: string;
  sector: string;
  location: string;
  productCategory: string;
  department: string;
  reportType: string;
};

type SummaryResponse = {
  cards: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    inventoryValue: number;
    activeOrders: number;
    productionOutput: number;
    procurementSpend: number;
    laborCost: number;
    maintenanceCost: number;
    openAlerts: number;
  };
  reportCards: Array<{
    key: string;
    title: string;
    description: string;
    metric: string;
    lastGenerated: string;
    exportType: string;
  }>;
};

type AlertRow = {
  id: string;
  severity: string;
  subsystem: string;
  message: string;
  recommendedAction: string;
  route: string;
};

type FinanceTrend = {
  month: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  sales: number;
  procurement: number;
};

type ProductionTrend = {
  outputBySector: { sector: string; output: number }[];
  lowStockRisk: { month: string; count: number }[];
};

type LaborTrend = {
  month: string;
  laborCost: number;
  attendance: number;
};

type AssetTrend = {
  maintenanceDowntime: { month: string; downtimeHours: number }[];
  ordersByStatus: { status: string; count: number }[];
};

type ProductPerformance = {
  product: string;
  quantity: number;
  revenue: number;
  margin: number;
  trend: string;
};

type SupplierPerformance = {
  supplier: string;
  orders: number;
  lateDeliveries: number;
  totalSpend: number;
  reliability: number;
};

type WorkerPerformance = {
  worker: string;
  sector: string;
  attendance: number;
  tasksCompleted: number;
  hoursWorked: number;
  cost: number;
};

type AssetPerformance = {
  asset: string;
  downtimeHours: number;
  openWorkOrders: number;
  maintenanceCost: number;
};

type PreviewResponse = {
  title: string;
  dateRange: { from: string | null; to: string | null };
  summary: string;
  keyFindings: string[];
  tablePreview: Record<string, unknown>[];
};

const colors = ['#22c55e', '#38bdf8', '#f59e0b', '#f97316', '#a78bfa', '#ef4444'];

function severityClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === 'critical') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  if (normalized === 'high') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (normalized === 'medium') return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  return 'bg-slate-500/15 text-slate-200 border-slate-500/30';
}

function metricClass(value: number) {
  return value >= 0 ? 'text-emerald-300' : 'text-rose-300';
}

function buildParams(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.sector && filters.sector !== 'all') params.set('sector', filters.sector);
  if (filters.location.trim()) params.set('location', filters.location.trim());
  if (filters.productCategory && filters.productCategory !== 'all') params.set('productCategory', filters.productCategory);
  if (filters.department && filters.department !== 'all') params.set('department', filters.department);
  if (filters.reportType && filters.reportType !== 'all') params.set('reportType', filters.reportType);
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function exportReport(type: string, query: string) {
  const token = getAccessToken();
  const res = await fetch(`/api/v1/reports/export/${type}${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${type}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Wallet;
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

export default function Reports() {
  const { toast } = useToast();
  const { canExport } = usePermissions();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({
    dateFrom: '',
    dateTo: '',
    sector: 'all',
    location: '',
    productCategory: 'all',
    department: 'all',
    reportType: 'all',
  });
  const [activeReport, setActiveReport] = useState('operational-overview');

  const query = useMemo(() => buildParams(filters), [filters]);

  const { data: summary } = useQuery<SummaryResponse>({
    queryKey: ['reports-summary-v2', query],
    queryFn: () => api.get(`/reports/summary${query}`),
  });

  const { data: alerts = [] } = useQuery<AlertRow[]>({
    queryKey: ['reports-alerts', query],
    queryFn: () => api.get(`/reports/alerts${query}`),
  });

  const { data: financeTrend = [] } = useQuery<FinanceTrend[]>({
    queryKey: ['reports-trend-finance', query],
    queryFn: () => api.get(`/reports/trends/finance${query}`),
  });

  const { data: productionTrend } = useQuery<ProductionTrend>({
    queryKey: ['reports-trend-production', query],
    queryFn: () => api.get(`/reports/trends/production${query}`),
  });

  const { data: laborTrend = [] } = useQuery<LaborTrend[]>({
    queryKey: ['reports-trend-labor', query],
    queryFn: () => api.get(`/reports/trends/labor${query}`),
  });

  const { data: assetTrend } = useQuery<AssetTrend>({
    queryKey: ['reports-trend-assets', query],
    queryFn: () => api.get(`/reports/trends/assets${query}`),
  });

  const { data: topProducts = [] } = useQuery<ProductPerformance[]>({
    queryKey: ['reports-performance-products', query],
    queryFn: () => api.get(`/reports/performance/products${query}`),
  });

  const { data: supplierPerformance = [] } = useQuery<SupplierPerformance[]>({
    queryKey: ['reports-performance-suppliers', query],
    queryFn: () => api.get(`/reports/performance/suppliers${query}`),
  });

  const { data: workerPerformance = [] } = useQuery<WorkerPerformance[]>({
    queryKey: ['reports-performance-workers', query],
    queryFn: () => api.get(`/reports/performance/workers${query}`),
  });

  const { data: assetPerformance = [] } = useQuery<AssetPerformance[]>({
    queryKey: ['reports-performance-assets', query],
    queryFn: () => api.get(`/reports/performance/assets${query}`),
  });

  const { data: preview } = useQuery<PreviewResponse>({
    queryKey: ['reports-preview', activeReport, query],
    queryFn: () => api.get(`/reports/${activeReport}/preview${query}`),
    enabled: !!activeReport,
  });

  const filteredReportCards = useMemo(() => {
    const cards = summary?.reportCards ?? [];
    if (!filters.reportType || filters.reportType === 'all') return cards;
    return cards.filter((card) => card.key === filters.reportType);
  }, [filters.reportType, summary?.reportCards]);

  async function handleExport(type: string) {
    try {
      await exportReport(type, query);
    } catch (error: any) {
      toast({ title: error.message || 'Failed to export report', variant: 'destructive' });
    }
  }

  function refreshData() {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reports-summary-v2'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-alerts'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-trend-finance'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-trend-production'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-trend-labor'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-trend-assets'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-performance-products'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-performance-suppliers'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-performance-workers'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-performance-assets'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-preview'] }),
    ]);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.12),_transparent_24%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.95))] p-6">
          <div className="space-y-2">
            <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">Report Control Bar</Badge>
            <div>
              <h1 className="text-3xl font-semibold text-white">Reports &amp; Analytics</h1>
              <p className="text-slate-400">Executive insight, operational trends, alerts, and exportable AMIS reports.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
            <Field label="Date Range">
              <div className="grid gap-2 md:grid-cols-2">
                <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters((s) => ({ ...s, dateFrom: e.target.value }))} className="border-white/10 bg-white/5" />
                <Input type="date" value={filters.dateTo} onChange={(e) => setFilters((s) => ({ ...s, dateTo: e.target.value }))} className="border-white/10 bg-white/5" />
              </div>
            </Field>
            <Field label="Sector">
              <Select value={filters.sector} onValueChange={(value) => setFilters((s) => ({ ...s, sector: value }))}>
                <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['all', 'crop', 'livestock', 'aquaculture', 'processing', 'logistics'].map((value) => <SelectItem key={value} value={value}>{titleize(value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Location">
              <Input value={filters.location} onChange={(e) => setFilters((s) => ({ ...s, location: e.target.value }))} placeholder="Field, warehouse, cold room" className="border-white/10 bg-white/5" />
            </Field>
            <Field label="Product Category">
              <Select value={filters.productCategory} onValueChange={(value) => setFilters((s) => ({ ...s, productCategory: value }))}>
                <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['all', 'seeds', 'fertilizer', 'feed', 'chemicals', 'finished goods', 'livestock', 'aquaculture'].map((value) => <SelectItem key={value} value={value}>{titleize(value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Select value={filters.department} onValueChange={(value) => setFilters((s) => ({ ...s, department: value }))}>
                <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['all', 'operations', 'production', 'inventory', 'maintenance', 'sales', 'finance'].map((value) => <SelectItem key={value} value={value}>{titleize(value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Report Type">
              <Select value={filters.reportType} onValueChange={(value) => setFilters((s) => ({ ...s, reportType: value }))}>
                <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {(summary?.reportCards ?? []).map((card) => <SelectItem key={card.key} value={card.key}>{card.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap items-end gap-2 xl:justify-end">
              <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" disabled={!canExport('reports')} onClick={() => handleExport(activeReport)}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button variant="outline" className="border-white/10 bg-white/5 text-slate-400 hover:bg-white/10" disabled>
                <ClipboardList className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
              <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={refreshData}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh Data
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard title="Total Revenue" value={formatCurrency(summary?.cards.totalRevenue)} detail="Management-recognised revenue" icon={Wallet} />
          <KpiCard title="Total Expenses" value={formatCurrency(summary?.cards.totalExpenses)} detail="Cross-module operating cost" icon={PiggyBank} />
          <KpiCard title="Net Profit" value={formatCurrency(summary?.cards.netProfit)} detail="Decision-support profitability" icon={TrendingUp} />
          <KpiCard title="Inventory Value" value={formatCurrency(summary?.cards.inventoryValue)} detail="Current stock carrying value" icon={Package} />
          <KpiCard title="Active Orders" value={String(summary?.cards.activeOrders ?? 0)} detail="Open commercial pipeline" icon={ShoppingCart} />
          <KpiCard title="Production Output" value={String(summary?.cards.productionOutput ?? 0)} detail="Logged output in filtered range" icon={Factory} />
          <KpiCard title="Procurement Spend" value={formatCurrency(summary?.cards.procurementSpend)} detail="Purchase order exposure" icon={Wallet} />
          <KpiCard title="Labor Cost" value={formatCurrency(summary?.cards.laborCost)} detail="Payroll and productivity cost" icon={Users} />
          <KpiCard title="Maintenance Cost" value={formatCurrency(summary?.cards.maintenanceCost)} detail="Asset service and downtime cost" icon={HardHat} />
          <KpiCard title="Open Alerts" value={String(summary?.cards.openAlerts ?? 0)} detail="Prioritized action queue" icon={ShieldAlert} />
        </section>

        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Management Report Cards</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredReportCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => setActiveReport(card.key)}
                className={`rounded-2xl border p-4 text-left transition ${
                  activeReport === card.key
                    ? 'border-cyan-500/40 bg-cyan-500/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{card.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{card.description}</p>
                  </div>
                  <ScanSearch className="h-5 w-5 text-slate-300" />
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Key Metric</span>
                  <span className="text-cyan-300">{card.metric}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Last Generated</span>
                  <span className="text-slate-200">{formatFinanceDate(card.lastGenerated, 'MMM d, HH:mm')}</span>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button size="sm" variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10" disabled={!canExport('reports')} onClick={(event) => {
                    event.stopPropagation();
                    void handleExport(card.exportType);
                  }}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Operational Alerts Panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className={severityClass(alert.severity)}>{titleize(alert.severity)}</Badge>
                        <Badge className="border-white/10 bg-white/5 text-slate-300">{titleize(alert.subsystem)}</Badge>
                      </div>
                      <p className="mt-3 font-medium text-white">{alert.message}</p>
                      <p className="mt-1 text-sm text-slate-400">{alert.recommendedAction}</p>
                    </div>
                    <a href={alert.route} className="text-sm text-cyan-300 underline-offset-4 hover:underline">Open</a>
                  </div>
                </div>
              ))}
              {!alerts.length && <p className="py-6 text-center text-sm text-slate-500">No alerts for the current filter.</p>}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Report Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-lg font-medium text-white">{preview?.title || 'Select a report'}</p>
                <p className="mt-1 text-sm text-slate-400">{preview?.summary || 'Click a report card to see a management preview.'}</p>
              </div>
              {!!preview?.dateRange && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
                  Range: {preview.dateRange.from ? formatFinanceDate(preview.dateRange.from) : 'All time'} to {preview.dateRange.to ? formatFinanceDate(preview.dateRange.to) : 'Current'}
                </div>
              )}
              <div className="space-y-2">
                {(preview?.keyFindings ?? []).map((finding) => (
                  <div key={finding} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                    {finding}
                  </div>
                ))}
              </div>
              {!!preview?.tablePreview?.length && (
                <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                  <p className="mb-3 text-sm font-medium text-white">Table Preview</p>
                  <div className="space-y-2 text-xs text-slate-300">
                    {preview.tablePreview.slice(0, 4).map((row, index) => (
                      <div key={index} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                        {Object.entries(row).slice(0, 4).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">{titleize(key)}</span>
                            <span>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={!canExport('reports')} onClick={() => handleExport(activeReport)}>
                <Download className="mr-2 h-4 w-4" />
                Export This Report
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Revenue vs Expenses Over Time</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" tickFormatter={(value) => `$${value}`} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} formatter={(value: number) => formatCurrencyPrecise(value)} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" stroke="#22c55e" fill="#22c55e22" />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="#ef444422" />
                  <Line type="monotone" dataKey="netProfit" stroke="#38bdf8" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Sales vs Procurement Spend</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" tickFormatter={(value) => `$${value}`} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} formatter={(value: number) => formatCurrencyPrecise(value)} />
                  <Legend />
                  <Bar dataKey="sales" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="procurement" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Production Output by Sector</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productionTrend?.outputBySector ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="sector" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} />
                  <Bar dataKey="output" radius={[6, 6, 0, 0]}>
                    {(productionTrend?.outputBySector ?? []).map((row, index) => <Cell key={row.sector} fill={colors[index % colors.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Labor Cost Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={laborTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} formatter={(value: number, name: string) => name === 'laborCost' ? formatCurrencyPrecise(value) : value} />
                  <Area type="monotone" dataKey="laborCost" stroke="#a78bfa" fill="#a78bfa22" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Maintenance Downtime Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={assetTrend?.maintenanceDowntime ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} formatter={(value: number) => `${value.toFixed(1)}h`} />
                  <Area type="monotone" dataKey="downtimeHours" stroke="#f97316" fill="#f9731622" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-white">Orders by Status</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={assetTrend?.ordersByStatus ?? []} dataKey="count" nameKey="status" outerRadius={110} innerRadius={65}>
                    {(assetTrend?.ordersByStatus ?? []).map((row, index) => <Cell key={row.status} fill={colors[index % colors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70 xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-white">Low Stock Risk Over Time</CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productionTrend?.lowStockRisk ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }} />
                  <Bar dataKey="count" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader><CardTitle className="text-white">Top Products</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity Sold/Produced</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Margin</TableHead>
                    <TableHead>Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((row) => (
                    <TableRow key={row.product}>
                      <TableCell className="font-medium text-white">{row.product}</TableCell>
                      <TableCell>{row.quantity.toFixed(2)}</TableCell>
                      <TableCell>{formatCurrencyPrecise(row.revenue)}</TableCell>
                      <TableCell className={metricClass(row.margin)}>{formatPercent(row.margin)}</TableCell>
                      <TableCell><Badge className={row.trend === 'up' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}>{titleize(row.trend)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader><CardTitle className="text-white">Supplier Performance</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Late Deliveries</TableHead>
                    <TableHead>Total Spend</TableHead>
                    <TableHead>Reliability</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierPerformance.map((row) => (
                    <TableRow key={row.supplier}>
                      <TableCell className="font-medium text-white">{row.supplier}</TableCell>
                      <TableCell>{row.orders}</TableCell>
                      <TableCell>{row.lateDeliveries}</TableCell>
                      <TableCell>{formatCurrencyPrecise(row.totalSpend)}</TableCell>
                      <TableCell className={metricClass(row.reliability)}>{formatPercent(row.reliability)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader><CardTitle className="text-white">Worker Productivity</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker / Sector</TableHead>
                    <TableHead>Attendance</TableHead>
                    <TableHead>Tasks Completed</TableHead>
                    <TableHead>Hours Worked</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workerPerformance.map((row) => (
                    <TableRow key={row.worker}>
                      <TableCell className="font-medium text-white">{row.worker}<div className="text-xs text-slate-500">{row.sector}</div></TableCell>
                      <TableCell>{row.attendance}</TableCell>
                      <TableCell>{row.tasksCompleted}</TableCell>
                      <TableCell>{row.hoursWorked.toFixed(2)}</TableCell>
                      <TableCell>{formatCurrencyPrecise(row.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/70">
            <CardHeader><CardTitle className="text-white">Asset Downtime</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Downtime Hours</TableHead>
                    <TableHead>Open Work Orders</TableHead>
                    <TableHead>Maintenance Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetPerformance.map((row) => (
                    <TableRow key={row.asset}>
                      <TableCell className="font-medium text-white">{row.asset}</TableCell>
                      <TableCell>{row.downtimeHours.toFixed(2)}h</TableCell>
                      <TableCell>{row.openWorkOrders}</TableCell>
                      <TableCell>{formatCurrencyPrecise(row.maintenanceCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">{label}</Label>
      {children}
    </div>
  );
}
