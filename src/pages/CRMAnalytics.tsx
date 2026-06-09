import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ShoppingBag, ShoppingCart, PieChart as PieIcon, ChevronRight, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';

// ── Types ──
interface CustSummary { total: number; active: number; deactivated: number; deltaPct: number; generatedAt: string; }
interface PurchSummary { totalValue: number; ordersSettled: number; deltaPct: number; }
interface CartSummary { itemCount: number; potentialValue: number; openCarts: number; }
interface Segments { total: number; segments: { type: string; count: number; pct: number }[]; }
interface TopCustomer { id: string; name: string; emailMasked: string; totalPurchase: number; trend: number[]; }
interface TopProducts { labels: string[]; products: { id: string; name: string; series: number[] }[]; }

const C = { lavender: '#6E74E0', peach: '#EF8B4E', mint: '#34B788', rose: '#C0445A', gold: '#C99A1E' };
const LINE_COLORS = [C.lavender, C.mint, C.peach, C.gold, C.rose];
const TOOLTIP = { contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }, itemStyle: { color: '#e5e7eb' }, labelStyle: { color: '#9ca3af', marginBottom: 4 } };
const money = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Number(n).toFixed(0)}`;
const moneyFull = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function SkeletonCard() {
  return <Card><CardContent className="p-5 animate-pulse"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-muted shrink-0" /><div className="flex-1 space-y-1.5"><div className="h-3 w-24 bg-muted rounded" /><div className="h-7 w-16 bg-muted rounded" /><div className="h-2.5 w-20 bg-muted rounded" /></div></div></CardContent></Card>;
}
function SkeletonWide({ height = 240 }: { height?: number }) {
  return <Card><CardContent className="p-5 animate-pulse"><div className="h-4 w-40 bg-muted rounded mb-4" /><div className="bg-muted rounded" style={{ height }} /></CardContent></Card>;
}
function CardError({ onRetry }: { onRetry: () => void }) {
  return <Card><CardContent className="p-5 flex items-center justify-between"><p className="text-sm text-destructive">Couldn't load</p><Button size="sm" variant="outline" onClick={onRetry} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></CardContent></Card>;
}

function DeltaPill({ pct }: { pct: number }) {
  const up = pct >= 0;
  return <span className={`inline-flex items-center text-xs font-medium ${up ? 'text-success' : 'text-destructive'}`}>{up ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}{Math.abs(pct)}%</span>;
}

function KpiShell({ children, onClick, label, cardClass }: { children: React.ReactNode; onClick: () => void; label: string; cardClass: string }) {
  return (
    <Card className={`${cardClass} group cursor-pointer transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} aria-label={`${label}. View details.`}>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

function useCrm<T>(key: string, url: string) {
  return useQuery<T>({ queryKey: ['crm-analytics', key], queryFn: () => api.get<T>(url), refetchInterval: 30_000, refetchOnWindowFocus: true, staleTime: 30_000 });
}

export default function CRMAnalytics() {
  const navigate = useNavigate();
  const cust = useCrm<CustSummary>('customers', '/sales/analytics/customers/summary');
  const purch = useCrm<PurchSummary>('purchases', '/sales/analytics/purchases/summary');
  const carts = useCrm<CartSummary>('carts', '/sales/analytics/carts/abandoned');
  const seg = useCrm<Segments>('segments', '/sales/analytics/customers/segments');
  const top = useCrm<TopCustomer[]>('top-customers', '/sales/analytics/customers/top?limit=10');
  const prod = useCrm<TopProducts>('top-products', '/sales/analytics/products/top?limit=5');

  useEffect(() => {
    const s = sessionStorage.getItem('crm-analytics-scroll');
    if (s) { window.scrollTo({ top: Number(s), behavior: 'instant' as ScrollBehavior }); sessionStorage.removeItem('crm-analytics-scroll'); }
  }, []);

  const goto = (path: string) => { sessionStorage.setItem('crm-analytics-scroll', String(window.scrollY)); navigate(path); };

  const liveOk = !cust.isError && !purch.isError && !seg.isError;
  const segColors = [C.lavender, C.mint];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">CRM Analytics</h1>
            <p className="text-muted-foreground text-sm">Customers, purchases and segments</p>
          </div>
          <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${liveOk ? 'border-success/40 bg-success/10 text-success' : 'border-warning/40 bg-warning/10 text-warning'}`}>
            <span className="relative flex h-2 w-2"><span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${liveOk ? 'bg-success' : 'bg-warning'}`} /><span className={`relative inline-flex rounded-full h-2 w-2 ${liveOk ? 'bg-success' : 'bg-warning'}`} /></span>
            {liveOk ? 'Live' : 'Reconnecting'}{cust.data?.generatedAt && <span className="text-muted-foreground">· {format(new Date(cust.data.generatedAt), 'HH:mm:ss')}</span>}
          </div>
        </div>

        {/* Top row — 4 cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Total Customers */}
          {cust.isLoading ? <SkeletonCard /> : cust.isError ? <CardError onRetry={cust.refetch} /> : (
            <KpiShell label="Total Customers" cardClass="bg-[#6E74E0]/10 border-[#6E74E0]/20" onClick={() => goto('/crm/analytics/customers')}>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-[#6E74E0]/20 shrink-0"><Users className="h-5 w-5 text-[#8a8fe8]" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Total Customers</p>
                  <p className="text-2xl font-bold">{cust.data!.total}</p>
                  <p className="text-xs text-muted-foreground"><DeltaPill pct={cust.data!.deltaPct} /> vs last month · Active accounts</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground/30 group-hover:text-muted-foreground/70" />
              </div>
            </KpiShell>
          )}
          {/* Active customers (spec 5.4) */}
          {cust.isLoading ? <SkeletonCard /> : cust.isError ? <CardError onRetry={cust.refetch} /> : (
            <KpiShell label="Active Customers" cardClass="bg-success/10 border-success/20" onClick={() => goto('/crm/analytics/customers')}>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-success/20 shrink-0"><Users className="h-5 w-5 text-success" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold">{cust.data!.active}</p>
                  <p className="text-xs text-muted-foreground">Enabled accounts</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground/30 group-hover:text-muted-foreground/70" />
              </div>
            </KpiShell>
          )}
          {/* Deactivated customers (spec 5.4) */}
          {cust.isLoading ? <SkeletonCard /> : cust.isError ? <CardError onRetry={cust.refetch} /> : (
            <KpiShell label="Deactivated Customers" cardClass="bg-destructive/10 border-destructive/20" onClick={() => goto('/crm/analytics/customers')}>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-destructive/20 shrink-0"><Users className="h-5 w-5 text-destructive" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Deactivate</p>
                  <p className="text-2xl font-bold">{cust.data!.deactivated}</p>
                  <p className="text-xs text-muted-foreground">Disabled accounts</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground/30 group-hover:text-muted-foreground/70" />
              </div>
            </KpiShell>
          )}
          {/* Total Purchases */}
          {purch.isLoading ? <SkeletonCard /> : purch.isError ? <CardError onRetry={purch.refetch} /> : (
            <KpiShell label="Total Purchases" cardClass="bg-[#EF8B4E]/10 border-[#EF8B4E]/20" onClick={() => goto('/crm/analytics/purchases')}>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-[#EF8B4E]/20 shrink-0"><ShoppingBag className="h-5 w-5 text-[#EF8B4E]" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Total Purchases</p>
                  <p className="text-2xl font-bold">{moneyFull(purch.data!.totalValue)}</p>
                  <p className="text-xs text-muted-foreground"><DeltaPill pct={purch.data!.deltaPct} /> · {purch.data!.ordersSettled} orders settled</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground/30 group-hover:text-muted-foreground/70" />
              </div>
            </KpiShell>
          )}
          {/* Cart Items */}
          {carts.isLoading ? <SkeletonCard /> : carts.isError ? <CardError onRetry={carts.refetch} /> : (
            <KpiShell label="Cart Items" cardClass="bg-[#34B788]/10 border-[#34B788]/20" onClick={() => goto('/crm/analytics/carts')}>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-[#34B788]/20 shrink-0"><ShoppingCart className="h-5 w-5 text-[#34B788]" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Cart Items · not yet ordered</p>
                  <p className="text-2xl font-bold">{carts.data!.itemCount}</p>
                  <p className="text-xs text-muted-foreground"><span className="text-success font-medium">{money(carts.data!.potentialValue)}</span> potential · {carts.data!.openCarts} open carts</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground/30 group-hover:text-muted-foreground/70" />
              </div>
            </KpiShell>
          )}
          {/* Customer Segments (donut) */}
          {seg.isLoading ? <SkeletonCard /> : seg.isError ? <CardError onRetry={seg.refetch} /> : (
            <KpiShell label="Customer Segments" cardClass="bg-card border-border" onClick={() => goto('/crm/analytics/segments')}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><PieIcon className="h-3.5 w-3.5" />Customer Segments</p>
                <span className="text-xs font-bold">{seg.data!.total}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-[88px] h-[88px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={seg.data!.segments} cx="50%" cy="50%" innerRadius={28} outerRadius={42} dataKey="count" strokeWidth={0} paddingAngle={2} aria-label="Customer segments">
                        {seg.data!.segments.map((_, i) => <Cell key={i} fill={segColors[i % segColors.length]} />)}
                      </Pie>
                      <Tooltip {...TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm font-bold">{seg.data!.total}</div>
                </div>
                <ul className="space-y-1 text-xs flex-1">
                  {seg.data!.segments.map((s, i) => (
                    <li key={s.type} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: segColors[i % segColors.length] }} />{s.type}</span>
                      <span className="text-muted-foreground">{s.count} · {s.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </KpiShell>
          )}
        </div>

        {/* Bottom row — Top customers + Top products */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Top 10 Customers */}
          {top.isLoading ? <SkeletonWide /> : top.isError ? <CardError onRetry={top.refetch} /> : (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div><p className="text-sm font-semibold">Top 10 Customers</p><p className="text-xs text-muted-foreground">Ranked by total purchases</p></div>
                  <button onClick={() => goto('/crm/analytics/customers/top')} className="text-xs text-primary hover:underline">View all →</button>
                </div>
                {!top.data!.length ? <p className="py-8 text-center text-sm text-muted-foreground">No purchases yet</p> : (
                  <ul className="divide-y divide-border">
                    {top.data!.map((c, i) => {
                      const up = (c.trend[c.trend.length - 1] ?? 0) >= (c.trend[0] ?? 0);
                      const spark = c.trend.map((v, idx) => ({ i: idx, v }));
                      const initials = c.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                      return (
                        <li key={c.id} className="flex items-center gap-3 py-2.5">
                          <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                          <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}>{initials}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{c.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.emailMasked}</p>
                          </div>
                          <div className="w-20 h-8 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={spark}><Line type="monotone" dataKey="v" stroke={up ? C.mint : C.rose} strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart>
                            </ResponsiveContainer>
                          </div>
                          <span className="text-sm font-bold w-20 text-right shrink-0">{money(c.totalPurchase)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {/* Top 5 Products */}
          {prod.isLoading ? <SkeletonWide /> : prod.isError ? <CardError onRetry={prod.refetch} /> : (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div><p className="text-sm font-semibold">Top 5 Products</p><p className="text-xs text-muted-foreground">Purchase volume · last 12 months</p></div>
                  <button onClick={() => goto('/crm/analytics/products/top')} className="text-xs text-primary hover:underline">View all →</button>
                </div>
                <div className="flex flex-wrap gap-3 mb-2">
                  {prod.data!.products.map((p, i) => (
                    <span key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-0.5 rounded" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />{p.name}</span>
                  ))}
                </div>
                {!prod.data!.products.length ? <p className="py-8 text-center text-sm text-muted-foreground">No product sales yet</p> : (
                  <ResponsiveContainer width="100%" height={220} aria-label="Top products trend">
                    <LineChart data={prod.data!.labels.map((label, idx) => { const row: any = { label }; prod.data!.products.forEach(p => { row[p.id] = p.series[idx]; }); return row; })} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip {...TOOLTIP} />
                      {prod.data!.products.map((p, i) => <Line key={p.id} type="monotone" dataKey={p.id} name={p.name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} />)}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
