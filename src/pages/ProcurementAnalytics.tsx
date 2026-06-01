import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Package, Truck, CheckCircle, XCircle, Building2, Inbox, RefreshCw, BarChart3, ChevronRight,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface Kpi { value: number; pct?: number; activeSuppliers?: number; }

interface AnalyticsResponse {
  range: string;
  generatedAt: string;
  kpis: {
    requestedOrdersReceived: Kpi;
    purchaseOrders: Kpi;
    paidOrders: Kpi;
    requestsAccepted: Kpi;
    requestsDeclined: Kpi;
    requestsSubmittedForPayment: Kpi;
  };
  orderRequestStatus: { status: string; count: number }[];
  finishedOrders: { label: string; count: number }[];
  requestsAcceptedSeries: { bucket: string; count: number }[];
  orderVolumeTrends: { bucket: string; purchaseOrders: number; paidOrders: number; unpaidOrders: number }[];
}

// ── Chart color palette (matches app theme tokens) ─────────────────

const C = {
  primary: '#22c55e',
  blue:    '#3b82f6',
  danger:  '#ef4444',
  warning: '#f59e0b',
  muted:   '#6b7280',
};

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 },
  itemStyle: { color: '#e5e7eb' },
  labelStyle: { color: '#9ca3af', marginBottom: 4 },
};

// ── Period selector ───────────────────────────────────────────────

const RANGES = ['Today', 'Week', 'Month', 'Quarter', 'Year'] as const;
type Range = typeof RANGES[number];

// ── Data hook ─────────────────────────────────────────────────────

function useProcurementAnalytics(range: Range) {
  return useQuery<AnalyticsResponse>({
    queryKey: ['procurement-analytics', range],
    queryFn: () => api.get<AnalyticsResponse>(`/procurement/analytics?range=${range.toLowerCase()}`),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

// ── Skeleton components ───────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-5 animate-pulse">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-muted shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-6 w-12 bg-muted rounded" />
            <div className="h-2.5 w-16 bg-muted rounded" />
          </div>
          <div className="w-3.5 h-3.5 bg-muted rounded mt-1 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonChart({ height = 220 }: { height?: number }) {
  return (
    <Card>
      <CardContent className="p-5 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-4" />
        <div className="bg-muted rounded" style={{ height }} />
      </CardContent>
    </Card>
  );
}

// ── Error / empty panels ──────────────────────────────────────────

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="col-span-full rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-center justify-between">
      <p className="text-sm text-destructive">Failed to load analytics data.</p>
      <Button
        size="sm"
        variant="outline"
        onClick={onRetry}
        className="border border-input bg-background text-white hover:bg-accent"
      >
        <RefreshCw className="h-3 w-3 mr-1" />
        Retry
      </Button>
    </div>
  );
}

function EmptyPanel() {
  return (
    <Card className="col-span-full">
      <CardContent className="py-16 text-center">
        <BarChart3 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" aria-hidden />
        <p className="text-sm text-muted-foreground">No data for this period.</p>
      </CardContent>
    </Card>
  );
}

// ── KPI card — clickable, keyboard-accessible, hover affordance ───

function KpiCard({ label, value, secondary, icon: Icon, cardClass, iconBgClass, iconClass, metricKey, range }: {
  label: string;
  value: number;
  secondary: string;
  icon: React.ComponentType<{ className?: string }>;
  cardClass: string;
  iconBgClass: string;
  iconClass: string;
  metricKey: string;
  range: string;
}) {
  const navigate = useNavigate();

  const handleNav = () => {
    sessionStorage.setItem('analytics-scroll', String(window.scrollY));
    navigate(`/procurement/analytics/${metricKey}?range=${range}`);
  };

  return (
    <Card
      className={`${cardClass} group cursor-pointer transition-all duration-150 motion-safe:hover:shadow-lg motion-safe:hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      role="button"
      tabIndex={0}
      onClick={handleNav}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNav(); } }}
      aria-label={`${label}: ${value}. View details.`}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${iconBgClass}`} aria-hidden>
            <Icon className={`h-5 w-5 ${iconClass}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{secondary}</p>
          </div>
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground/30 transition-colors duration-150 group-hover:text-muted-foreground/70 group-focus-visible:text-muted-foreground/70"
            aria-hidden
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Donut chart ───────────────────────────────────────────────────

function DonutChart({ title, data, colors }: {
  title: string;
  data: { name: string; value: number }[];
  colors: string[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-semibold mb-3">{title}</p>
        <div className="relative">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={76}
                dataKey="value"
                strokeWidth={0}
                paddingAngle={data.length > 1 ? 2 : 0}
                aria-label={title}
              >
                {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
              </Pie>
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [v, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" aria-hidden>
            <span className="text-2xl font-bold">{total}</span>
            <span className="text-xs text-muted-foreground">Total</span>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5" aria-label={`${title} breakdown`}>
          {data.map((d, i) => (
            <li key={i} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} aria-hidden />
                <span className="text-muted-foreground">{d.name}</span>
              </span>
              <span className="font-medium">{d.value}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function ProcurementAnalytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<Range>(() => {
    const p = searchParams.get('range');
    return (RANGES as readonly string[]).includes(p ?? '') ? (p as Range) : 'Month';
  });

  // Restore scroll position when returning from a drill-down page
  useEffect(() => {
    const saved = sessionStorage.getItem('analytics-scroll');
    if (saved) {
      window.scrollTo({ top: Number(saved), behavior: 'instant' as ScrollBehavior });
      sessionStorage.removeItem('analytics-scroll');
    }
  }, []);

  const handleRangeChange = (r: Range) => {
    setRange(r);
    setSearchParams({ range: r }, { replace: true });
  };

  const { data, isLoading, isError, refetch } = useProcurementAnalytics(range);

  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const toggleLine = (key: string) =>
    setHiddenLines(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const hasData = !!data && (
    data.kpis.requestedOrdersReceived.value > 0 ||
    data.kpis.purchaseOrders.value > 0
  );

  const LINE_SERIES = [
    { key: 'purchaseOrders', label: 'Purchase Orders', color: C.primary },
    { key: 'paidOrders',     label: 'Paid Orders',     color: C.blue    },
    { key: 'unpaidOrders',   label: 'Unpaid Orders',   color: C.danger  },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Procurement Analytics</h1>
            <p className="text-muted-foreground text-sm">
              Order activity overview
              {data?.generatedAt && (
                <span className="ml-1">· Updated {format(new Date(data.generatedAt), 'MMM d, HH:mm')}</span>
              )}
            </p>
          </div>
          <div role="group" aria-label="Period" className="flex gap-1 bg-muted/40 rounded-lg p-1 flex-wrap">
            {RANGES.map(r => (
              <Button
                key={r}
                size="sm"
                onClick={() => handleRangeChange(r)}
                aria-pressed={r === range}
                className={
                  r === range
                    ? 'gradient-primary text-black font-medium h-7 px-3 text-xs'
                    : 'border-0 bg-transparent text-white hover:bg-accent h-7 px-3 text-xs'
                }
              >
                {r}
              </Button>
            ))}
          </div>
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
          ) : isError ? (
            <ErrorPanel onRetry={refetch} />
          ) : !hasData ? (
            <EmptyPanel />
          ) : (
            <>
              <KpiCard
                label="Requested Orders"
                value={data!.kpis.requestedOrdersReceived.value}
                secondary="100% of period"
                icon={Inbox}
                cardClass="bg-blue-500/10 border-blue-500/20"
                iconBgClass="bg-blue-500/20"
                iconClass="text-blue-500"
                metricKey="requested-orders"
                range={range}
              />
              <KpiCard
                label="Purchase Orders"
                value={data!.kpis.purchaseOrders.value}
                secondary={`${data!.kpis.purchaseOrders.activeSuppliers ?? 0} suppliers`}
                icon={Truck}
                cardClass="bg-primary/10 border-primary/20"
                iconBgClass="bg-primary/20"
                iconClass="text-primary"
                metricKey="purchase-orders"
                range={range}
              />
              <KpiCard
                label="Paid Orders"
                value={data!.kpis.paidOrders.value}
                secondary={`${data!.kpis.paidOrders.pct ?? 0}% of orders`}
                icon={CheckCircle}
                cardClass="bg-success/10 border-success/20"
                iconBgClass="bg-success/20"
                iconClass="text-success"
                metricKey="paid-orders"
                range={range}
              />
              <KpiCard
                label="Requests Accepted"
                value={data!.kpis.requestsAccepted.value}
                secondary={`${data!.kpis.requestsAccepted.pct ?? 0}% accepted`}
                icon={Package}
                cardClass="bg-primary/10 border-primary/20"
                iconBgClass="bg-primary/20"
                iconClass="text-primary"
                metricKey="accepted-requests"
                range={range}
              />
              <KpiCard
                label="Requests Declined"
                value={data!.kpis.requestsDeclined.value}
                secondary={`${data!.kpis.requestsDeclined.pct ?? 0}% declined`}
                icon={XCircle}
                cardClass="bg-destructive/10 border-destructive/20"
                iconBgClass="bg-destructive/20"
                iconClass="text-destructive"
                metricKey="declined-requests"
                range={range}
              />
              <KpiCard
                label="Suppliers"
                value={data!.kpis.purchaseOrders.activeSuppliers ?? 0}
                secondary="active suppliers"
                icon={Building2}
                cardClass="bg-primary/10 border-primary/20"
                iconBgClass="bg-primary/20"
                iconClass="text-primary"
                metricKey="suppliers"
                range={range}
              />
            </>
          )}
        </div>

        {/* ── Charts row 1 (donuts + bar) ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <SkeletonChart />
            <SkeletonChart />
            <div className="xl:col-span-2"><SkeletonChart height={260} /></div>
          </div>
        ) : isError || !hasData ? null : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

            <DonutChart
              title="Order Request Status"
              data={data!.orderRequestStatus.map(d => ({ name: d.status, value: d.count }))}
              colors={[C.blue, C.primary, C.danger, C.warning]}
            />

            <DonutChart
              title="Finished Orders"
              data={data!.finishedOrders.map(d => ({ name: d.label, value: d.count }))}
              colors={[C.primary, C.muted]}
            />

            <div className="xl:col-span-2">
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm font-semibold mb-4">Requests Accepted</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={data!.requestsAcceptedSeries}
                      margin={{ top: 0, right: 8, bottom: 0, left: -20 }}
                      aria-label="Requests accepted bar chart"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="count" name="Accepted" fill={C.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── Order Volume Trends (full-width line chart) ── */}
        {isLoading ? (
          <SkeletonChart height={280} />
        ) : isError || !hasData ? null : (
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <p className="text-sm font-semibold">Order Volume Trends</p>
                <div className="flex gap-4 flex-wrap" role="group" aria-label="Toggle trend lines">
                  {LINE_SERIES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => toggleLine(s.key)}
                      aria-pressed={!hiddenLines.has(s.key)}
                      className={`flex items-center gap-1.5 text-xs transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded ${hiddenLines.has(s.key) ? 'opacity-35' : ''}`}
                    >
                      <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: s.color }} aria-hidden />
                      <span className="text-muted-foreground">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260} aria-label="Order volume trends line chart">
                <LineChart data={data!.orderVolumeTrends} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  {LINE_SERIES.map(s =>
                    hiddenLines.has(s.key) ? null : (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    )
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardLayout>
  );
}
