import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, AreaChart, Area, BarChart,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, RefreshCw, CheckCircle, ChevronRight, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────
interface Overview {
  generatedAt: string;
  kpis: {
    totalIncome: number; incomeTrend: number;
    pending: { value: number }; inProcess: { value: number }; completed: { value: number };
  };
  revenueBreakdown: { name: string; value: number; pct: number }[];
  topProducts: { rank: number; name: string; value: number }[];
  salesVsPurchase: { bucket: string; sales: number; purchase: number }[];
  orderSummary: { bucket: string; received: number; fulfilled: number }[];
}
interface IncomeResp { granularity: string; total: number; growthPct: number; series: { bucket: string; income: number; forecast: number }[]; }
interface SalesResp { granularity: string; series: { bucket: string; units: number }[]; }

// ── Palette + helpers ──────────────────────────────────────────────
const C = { tangerine: '#E2592A', emerald: '#1F7A5E', gold: '#C99A1E', violet: '#5C4B8C', rose: '#C0445A', ink: '#9ca3af', muted: '#6b7280' };
const DONUT = [C.tangerine, C.emerald, C.gold, C.violet, C.muted];
const TOOLTIP = {
  contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 },
  itemStyle: { color: '#e5e7eb' }, labelStyle: { color: '#9ca3af', marginBottom: 4 },
};
const money = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Number(n).toFixed(0)}`;
const moneyFull = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// ── Skeletons ──────────────────────────────────────────────────────
function SkeletonCard() {
  return <Card><CardContent className="p-5 animate-pulse"><div className="flex items-start gap-3"><div className="w-9 h-9 rounded-xl bg-muted shrink-0" /><div className="flex-1 space-y-1.5"><div className="h-3 w-24 bg-muted rounded" /><div className="h-6 w-12 bg-muted rounded" /><div className="h-2.5 w-16 bg-muted rounded" /></div><div className="w-3.5 h-3.5 bg-muted rounded mt-1 shrink-0" /></div></CardContent></Card>;
}
function SkeletonChart({ title, height = 240 }: { title: string; height?: number }) {
  return <Card><CardContent className="p-5 animate-pulse"><div className="h-4 w-40 bg-muted rounded mb-4" />{title}<div className="bg-muted rounded mt-2" style={{ height }} /></CardContent></Card>;
}
function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-center justify-between"><p className="text-sm text-destructive">Failed to load.</p><Button size="sm" variant="outline" onClick={onRetry} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></div>;
}

// ── Hooks (each widget refetches independently) ────────────────────
function useOverview() {
  return useQuery<Overview>({ queryKey: ['marketing-analytics-overview'], queryFn: () => api.get('/marketing/analytics/overview'), refetchInterval: 30_000, refetchOnWindowFocus: true, staleTime: 30_000 });
}
function useIncome(g: string) {
  return useQuery<IncomeResp>({ queryKey: ['marketing-analytics-income', g], queryFn: () => api.get(`/marketing/analytics/income?granularity=${g}`), refetchInterval: 30_000, staleTime: 30_000 });
}
function useSales(g: string) {
  return useQuery<SalesResp>({ queryKey: ['marketing-analytics-sales', g], queryFn: () => api.get(`/marketing/analytics/sales?granularity=${g}`), refetchInterval: 30_000, staleTime: 30_000 });
}

// ── Segmented toggle ───────────────────────────────────────────────
function Toggle({ options, value, onChange }: { options: { v: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
      {options.map(o => (
        <Button key={o.v} size="sm" onClick={() => onChange(o.v)} aria-pressed={value === o.v}
          className={value === o.v ? 'gradient-primary text-black font-medium h-7 px-3 text-xs' : 'border-0 bg-transparent text-white hover:bg-accent h-7 px-3 text-xs'}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

// ── Clickable PO KPI card ──────────────────────────────────────────
function PoCard({ label, value, sub, icon: Icon, cardClass, iconBgClass, iconClass, metric }: {
  label: string; value: number; sub: string; icon: React.ComponentType<{ className?: string }>;
  cardClass: string; iconBgClass: string; iconClass: string; metric: string;
}) {
  const navigate = useNavigate();
  const go = () => { sessionStorage.setItem('mkt-analytics-scroll', String(window.scrollY)); navigate(`/marketing/analytics/orders/${metric}`); };
  return (
    <Card className={`${cardClass} group cursor-pointer transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      role="button" tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
      aria-label={`${label}: ${value}. View orders.`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${iconBgClass}`} aria-hidden><Icon className={`h-5 w-5 ${iconClass}`} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/70" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function MarketingAnalytics() {
  const [incomeG, setIncomeG] = useState('monthly');
  const [salesG, setSalesG] = useState('month');
  const ov = useOverview();
  const income = useIncome(incomeG);
  const sales = useSales(salesG);

  useEffect(() => {
    const saved = sessionStorage.getItem('mkt-analytics-scroll');
    if (saved) { window.scrollTo({ top: Number(saved), behavior: 'instant' as ScrollBehavior }); sessionStorage.removeItem('mkt-analytics-scroll'); }
  }, []);

  const k = ov.data?.kpis;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header + Live pill */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Marketing Analytics</h1>
            <p className="text-muted-foreground text-sm">Sales, revenue and order performance</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-success" /></span>
            Live{ov.data?.generatedAt && <span className="text-muted-foreground">· updated {format(new Date(ov.data.generatedAt), 'HH:mm:ss')}</span>}
          </div>
        </div>

        {/* Row 1: Income (bar+forecast) + Revenue donut */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            {income.isLoading ? <SkeletonChart title="" height={260} /> : income.isError ? <ErrorPanel onRetry={income.refetch} /> : (
              <Card><CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold">Total Income Generated</p>
                    <p className="text-2xl font-bold mt-1">{moneyFull(income.data!.total)}
                      <span className={`ml-2 inline-flex items-center text-xs font-medium ${income.data!.growthPct >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {income.data!.growthPct >= 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}{Math.abs(income.data!.growthPct)}%
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">across the selected period</p>
                  </div>
                  <Toggle value={incomeG} onChange={setIncomeG} options={[{ v: 'monthly', label: 'Monthly' }, { v: 'weekly', label: 'Weekly' }, { v: 'daily', label: 'Daily' }]} />
                </div>
                <ResponsiveContainer width="100%" height={240} aria-label="Income chart">
                  <ComposedChart data={income.data!.series} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => money(v)} />
                    <Tooltip {...TOOLTIP} formatter={(v: any) => moneyFull(Number(v))} />
                    <Bar dataKey="income" name="Income" fill={C.tangerine} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="forecast" name="Forecast" stroke={C.gold} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent></Card>
            )}
          </div>
          {ov.isLoading ? <SkeletonChart title="" /> : ov.isError ? <ErrorPanel onRetry={ov.refetch} /> : (
            <Card><CardContent className="p-5">
              <p className="text-sm font-semibold mb-3">Total Revenue Summary</p>
              <div className="relative">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={ov.data!.revenueBreakdown} cx="50%" cy="50%" innerRadius={52} outerRadius={76} dataKey="value" strokeWidth={0} paddingAngle={2} aria-label="Revenue by product">
                      {ov.data!.revenueBreakdown.map((_, i) => <Cell key={i} fill={DONUT[i % DONUT.length]} />)}
                    </Pie>
                    <Tooltip {...TOOLTIP} formatter={(v: any) => moneyFull(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" aria-hidden>
                  <span className="text-xl font-bold">{money(ov.data!.revenueBreakdown.reduce((s, d) => s + d.value, 0))}</span>
                  <span className="text-xs text-muted-foreground">TOTAL</span>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {ov.data!.revenueBreakdown.map((d, i) => (
                  <li key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DONUT[i % DONUT.length] }} /><span className="text-muted-foreground truncate max-w-[120px]">{d.name}</span></span>
                    <span className="font-medium">{d.pct}%</span>
                  </li>
                ))}
              </ul>
            </CardContent></Card>
          )}
        </div>

        {/* Row 2: 3 PO KPI cards (clickable) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ov.isLoading ? (<><SkeletonCard /><SkeletonCard /><SkeletonCard /></>) : ov.isError ? <ErrorPanel onRetry={ov.refetch} /> : k && (
            <>
              <PoCard label="Pending Orders" value={k.pending.value} sub="awaiting approval" icon={Clock} cardClass="bg-warning/10 border-warning/20" iconBgClass="bg-warning/20" iconClass="text-warning" metric="pending" />
              <PoCard label="In-Process Orders" value={k.inProcess.value} sub="being fulfilled" icon={RefreshCw} cardClass="bg-purple-500/10 border-purple-500/20" iconBgClass="bg-purple-500/20" iconClass="text-purple-400" metric="in-process" />
              <PoCard label="Completed Orders" value={k.completed.value} sub="delivered & closed" icon={CheckCircle} cardClass="bg-success/10 border-success/20" iconBgClass="bg-success/20" iconClass="text-success" metric="completed" />
            </>
          )}
        </div>

        {/* Row 3: Sales Report + Order Summary */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-7">
            {sales.isLoading ? <SkeletonChart title="" /> : sales.isError ? <ErrorPanel onRetry={sales.refetch} /> : (
              <Card><CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <p className="text-sm font-semibold">Sales Report</p>
                  <Toggle value={salesG} onChange={setSalesG} options={[{ v: 'month', label: 'Month' }, { v: 'weekly', label: 'Weekly' }, { v: 'daily', label: 'Daily' }]} />
                </div>
                <ResponsiveContainer width="100%" height={220} aria-label="Sales report">
                  <AreaChart data={sales.data!.series} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
                    <defs><linearGradient id="salesG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.emerald} stopOpacity={0.4} /><stop offset="100%" stopColor={C.emerald} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                    <Tooltip {...TOOLTIP} formatter={(v: any) => `${Number(v).toLocaleString()} units`} />
                    <Area type="monotone" dataKey="units" name="Units" stroke={C.emerald} strokeWidth={2} fill="url(#salesG)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent></Card>
            )}
          </div>
          <div className="xl:col-span-5">
            {ov.isLoading ? <SkeletonChart title="" /> : ov.isError ? <ErrorPanel onRetry={ov.refetch} /> : (
              <Card><CardContent className="p-5">
                <p className="text-sm font-semibold mb-4">Order Summary</p>
                <ResponsiveContainer width="100%" height={220} aria-label="Order summary">
                  <AreaChart data={ov.data!.orderSummary} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="recvG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.emerald} stopOpacity={0.35} /><stop offset="100%" stopColor={C.emerald} stopOpacity={0} /></linearGradient>
                      <linearGradient id="fulfG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.tangerine} stopOpacity={0.35} /><stop offset="100%" stopColor={C.tangerine} stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} />
                    <Area type="monotone" dataKey="received" name="Received" stroke={C.emerald} strokeWidth={2} fill="url(#recvG)" />
                    <Area type="monotone" dataKey="fulfilled" name="Fulfilled" stroke={C.tangerine} strokeWidth={2} fill="url(#fulfG)" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex gap-4 justify-center mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded" style={{ background: C.emerald }} />Received</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded" style={{ background: C.tangerine }} />Fulfilled</span>
                </div>
              </CardContent></Card>
            )}
          </div>
        </div>

        {/* Row 4: Sales & Purchase + Top products */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-7">
            {ov.isLoading ? <SkeletonChart title="" /> : ov.isError ? <ErrorPanel onRetry={ov.refetch} /> : (
              <Card><CardContent className="p-5">
                <p className="text-sm font-semibold mb-4">Sales &amp; Purchase</p>
                <ResponsiveContainer width="100%" height={220} aria-label="Sales and purchase">
                  <BarChart data={ov.data!.salesVsPurchase} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => money(v)} />
                    <Tooltip {...TOOLTIP} formatter={(v: any) => moneyFull(Number(v))} />
                    <Bar dataKey="sales" name="Sales" fill="#9ca3af" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="purchase" name="Purchase" fill={C.gold} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 justify-center mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#9ca3af]" />Sales</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.gold }} />Purchase</span>
                </div>
              </CardContent></Card>
            )}
          </div>
          <div className="xl:col-span-5">
            {ov.isLoading ? <SkeletonChart title="" /> : ov.isError ? <ErrorPanel onRetry={ov.refetch} /> : (
              <Card><CardContent className="p-5">
                <p className="text-sm font-semibold mb-4">Most Purchased Products</p>
                {!ov.data!.topProducts.length ? (
                  <div className="py-10 text-center text-muted-foreground text-sm"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />No sales yet</div>
                ) : (
                  <ul className="space-y-3">
                    {ov.data!.topProducts.map((p, i) => {
                      const max = ov.data!.topProducts[0].value || 1;
                      return (
                        <li key={p.rank} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2"><span className="text-xs text-muted-foreground w-4">{p.rank}</span><span className="font-medium truncate max-w-[140px]">{p.name}</span></span>
                            <span className="font-medium">{money(p.value)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(p.value / max) * 100}%`, backgroundColor: DONUT[i % DONUT.length] }} /></div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent></Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
