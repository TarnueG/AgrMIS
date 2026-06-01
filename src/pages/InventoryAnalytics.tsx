import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, ComposedChart,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Fish, Bird, Beef, PiggyBank, TrendingUp, TrendingDown, ChevronRight, RefreshCw, BarChart3 } from 'lucide-react';

// ── Types ──
interface Head { value: number; trend: number; spark: number[]; }
interface Overview {
  generatedAt: string; range: string;
  headcounts: { fish: Head; birds: Head; grazing: Head; pigs: Head };
  orderStats: { ordersThisMonth: number; salesThisMonth: number; ordersToday: number; avgOrderValue: number; series: { bucket: string; orders: number; sales: number }[] };
  deliveryRate: { rate: number; onTime: number; delayed: number; failed: number };
  performance: { labels: string[]; series: { fish: number[]; birds: number[]; grazing: number[]; pigs: number[] } };
  mostSold: { name: string; quantity: number }[];
  mortality: { category: string; rate: number }[];
  health: { category: string; rate: number }[];
  soldRate: { rate: number; sold: number; listed: number; perProduct: { name: string; rate: number }[] };
  topSelling: { name: string; sku: string; quantity: number; totalAmount: number; status: string }[];
  stockSummary: { totalSkus: number; inStock: number; lowStock: number; outOfStock: number };
  upcoming: { no: number; item_name: string; location: string; batch_no: string; quantity: number; status: string }[];
}

const CAT = { fish: '#2b94a8', birds: '#e0a32f', grazing: '#2f8f55', pigs: '#d57a8e' };
const TOOLTIP = { contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }, itemStyle: { color: '#e5e7eb' }, labelStyle: { color: '#9ca3af', marginBottom: 4 } };
const nfmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
const money = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
function statusBadge(s: string): string {
  const x = s.toLowerCase();
  if (x.includes('out') || x === 'failed' || x === 'delayed') return 'bg-destructive/20 text-destructive';
  if (x.includes('low') || x === 'scheduled') return 'bg-warning/20 text-warning';
  if (x === 'in transit') return 'bg-blue-500/20 text-blue-500';
  return 'bg-success/20 text-success';
}

function Skel({ h = 120 }: { h?: number }) { return <Card><CardContent className="p-5 animate-pulse"><div className="h-3 w-24 bg-muted rounded mb-3" /><div className="bg-muted rounded" style={{ height: h }} /></CardContent></Card>; }
function CardErr({ onRetry }: { onRetry: () => void }) { return <Card><CardContent className="p-5 flex items-center justify-between"><p className="text-sm text-destructive">Couldn't load</p><Button size="sm" variant="outline" onClick={onRetry} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></CardContent></Card>; }

function Clickable({ to, label, children, className }: { to: string; label: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  const go = () => { sessionStorage.setItem('inv-analytics-scroll', String(window.scrollY)); navigate(to); };
  return (
    <Card className={`group cursor-pointer transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`}
      role="button" tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }} aria-label={label}>
      {children}
    </Card>
  );
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const d = data.map((v, i) => ({ i, v }));
  return <div className="h-9"><ResponsiveContainer width="100%" height="100%"><LineChart data={d}><Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>;
}
function Delta({ pct }: { pct: number }) { const up = pct >= 0; return <span className={`inline-flex items-center text-xs font-medium ${up ? 'text-success' : 'text-destructive'}`}>{up ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}{Math.abs(pct)}%</span>; }
function Meter({ label, pct, color }: { label: string; pct: number; color: string }) {
  return <div className="space-y-1"><div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium">{pct}%</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} /></div></div>;
}

export default function InventoryAnalytics() {
  const [range, setRange] = useState(() => sessionStorage.getItem('inv-analytics-range') || 'monthly');
  const ov = useQuery<Overview>({ queryKey: ['inv-analytics', range], queryFn: () => api.get(`/inventory/analytics/overview?range=${range}`), refetchInterval: 45_000, refetchOnWindowFocus: true, staleTime: 30_000 });

  useEffect(() => { sessionStorage.setItem('inv-analytics-range', range); }, [range]);
  useEffect(() => {
    const s = sessionStorage.getItem('inv-analytics-scroll');
    if (s) { window.scrollTo({ top: Number(s), behavior: 'instant' as ScrollBehavior }); sessionStorage.removeItem('inv-analytics-scroll'); }
  }, []);

  const d = ov.data;
  const HEADS = d ? [
    { key: 'total-fish', label: 'Total Fish', icon: Fish, color: CAT.fish, h: d.headcounts.fish, sub: 'Across ponds & cold stores' },
    { key: 'total-birds', label: 'Total Birds', icon: Bird, color: CAT.birds, h: d.headcounts.birds, sub: 'Chickens & ducks' },
    { key: 'total-grazing-livestock', label: 'Total Grazing Livestock', icon: Beef, color: CAT.grazing, h: d.headcounts.grazing, sub: 'Cows, goats & sheep' },
    { key: 'total-pigs', label: 'Total Pigs', icon: PiggyBank, color: CAT.pigs, h: d.headcounts.pigs, sub: 'Boars & sows' },
  ] : [];

  const gaugeData = d ? [{ name: 'rate', value: d.deliveryRate.rate }, { name: 'rest', value: 100 - d.deliveryRate.rate }] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Inventory &amp; Livestock Analytics</h1>
            <p className="text-muted-foreground text-sm">Real-time overview of stock, orders, livestock health &amp; fulfilment</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-success" /></span>
              Live{d?.generatedAt && <span className="text-muted-foreground">· synced {format(new Date(d.generatedAt), 'HH:mm:ss')}</span>}
              {ov.isFetching && !ov.isLoading && <span className="text-muted-foreground">· updating…</span>}
            </div>
            <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
              {[{ v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }, { v: 'monthly', l: 'Monthly' }].map(o => (
                <Button key={o.v} size="sm" onClick={() => setRange(o.v)} aria-pressed={range === o.v} className={range === o.v ? 'gradient-primary text-black font-medium h-7 px-3 text-xs' : 'border-0 bg-transparent text-white hover:bg-accent h-7 px-3 text-xs'}>{o.l}</Button>
              ))}
            </div>
          </div>
        </div>

        {/* Headcount KPI cards */}
        <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Livestock Headcount</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ov.isLoading ? [0, 1, 2, 3].map(i => <Skel key={i} h={70} />) : ov.isError ? <CardErr onRetry={ov.refetch} /> : HEADS.map(({ key, label, icon: Icon, color, h, sub }) => (
            <Clickable key={key} to={`/inventory/analytics/${key}`} label={`${label}: ${h.value}`} className={`border`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}22` }}><Icon className="h-5 w-5" style={{ color }} /></div>
                  <Delta pct={h.trend} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{label}</p>
                <p className="text-2xl font-bold">{h.value.toLocaleString()}</p>
                <Spark data={h.spark} color={color} />
                <p className="text-xs text-muted-foreground">{sub}</p>
              </CardContent>
            </Clickable>
          ))}
        </div>

        {/* Order Statistics + Delivery Rate */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8">
            {ov.isLoading ? <Skel h={240} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Clickable to="/inventory/analytics/order-statistics" label="Order statistics">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3"><p className="text-sm font-semibold">Order Statistics</p><ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground" /></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[
                      { l: 'Orders this month', v: d.orderStats.ordersThisMonth.toLocaleString() },
                      { l: 'Sales this month', v: money(d.orderStats.salesThisMonth) },
                      { l: 'Orders today', v: d.orderStats.ordersToday.toLocaleString() },
                      { l: 'Avg order value', v: money(d.orderStats.avgOrderValue) },
                    ].map(c => <div key={c.l} className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{c.l}</p><p className="text-lg font-bold">{c.v}</p></div>)}
                  </div>
                  <ResponsiveContainer width="100%" height={200} aria-label="Orders vs sales">
                    <ComposedChart data={d.orderStats.series} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP} />
                      <Bar dataKey="orders" name="Orders" fill="#9ca3af" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="sales" name="Sales ($)" fill={CAT.grazing} radius={[4, 4, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Clickable>
            )}
          </div>
          <div className="xl:col-span-4">
            {ov.isLoading ? <Skel h={240} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Clickable to="/inventory/analytics/delivery-rate" label="Delivery rate">
                <CardContent className="p-5">
                  <p className="text-sm font-semibold mb-3">Delivery Rate</p>
                  <div className="relative mx-auto" style={{ width: 160, height: 120 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={gaugeData} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius={60} outerRadius={80} dataKey="value" strokeWidth={0}>
                        <Cell fill={CAT.grazing} /><Cell fill="#2a2a2a" />
                      </Pie></PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 pointer-events-none"><span className="text-2xl font-bold">{d.deliveryRate.rate}%</span><span className="text-xs text-muted-foreground">on-time</span></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="rounded-lg bg-success/10 p-2"><p className="text-sm font-bold text-success">{d.deliveryRate.onTime}</p><p className="text-[10px] text-muted-foreground">On-time</p></div>
                    <div className="rounded-lg bg-warning/10 p-2"><p className="text-sm font-bold text-warning">{d.deliveryRate.delayed}</p><p className="text-[10px] text-muted-foreground">Delayed</p></div>
                    <div className="rounded-lg bg-destructive/10 p-2"><p className="text-sm font-bold text-destructive">{d.deliveryRate.failed}</p><p className="text-[10px] text-muted-foreground">Failed</p></div>
                  </div>
                </CardContent>
              </Clickable>
            )}
          </div>
        </div>

        {/* Performance + Most Sold */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-7">
            {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Clickable to="/inventory/analytics/performance" label="Livestock performance">
                <CardContent className="p-5">
                  <p className="text-sm font-semibold mb-1">Livestock Performance Overview</p>
                  <div className="flex flex-wrap gap-3 mb-2">{Object.entries(CAT).map(([k, c]) => <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground capitalize"><span className="w-2.5 h-0.5 rounded" style={{ background: c }} />{k}</span>)}</div>
                  <ResponsiveContainer width="100%" height={200} aria-label="Livestock performance">
                    <LineChart data={d.performance.labels.map((label, i) => ({ label, fish: d.performance.series.fish[i], birds: d.performance.series.birds[i], grazing: d.performance.series.grazing[i], pigs: d.performance.series.pigs[i] }))} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP} />
                      <Line type="monotone" dataKey="fish" stroke={CAT.fish} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="birds" stroke={CAT.birds} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="grazing" stroke={CAT.grazing} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="pigs" stroke={CAT.pigs} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Clickable>
            )}
          </div>
          <div className="xl:col-span-5">
            {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Clickable to="/inventory/analytics/most-sold" label="Most sold products">
                <CardContent className="p-5">
                  <p className="text-sm font-semibold mb-3">Most Sold Products</p>
                  {!d.mostSold.length ? <p className="py-8 text-center text-sm text-muted-foreground">No sales yet</p> : (
                    <ul className="space-y-2.5">
                      {d.mostSold.map((p, i) => { const max = d.mostSold[0].quantity || 1; return (
                        <li key={p.name} className="space-y-1">
                          <div className="flex justify-between text-sm"><span className="font-medium truncate max-w-[160px]">{p.name}</span><span className="font-medium">{nfmt(p.quantity)}</span></div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(p.quantity / max) * 100}%`, backgroundColor: Object.values(CAT)[i % 4] }} /></div>
                        </li>
                      ); })}
                    </ul>
                  )}
                </CardContent>
              </Clickable>
            )}
          </div>
        </div>

        {/* Mortality / Health / Sold Rate */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ov.isLoading ? [0, 1, 2].map(i => <Skel key={i} h={140} />) : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <>
              <Clickable to="/inventory/analytics/mortality" label="Mortality rate"><CardContent className="p-5"><p className="text-sm font-semibold mb-3">Mortality Rate</p><div className="space-y-2.5">{d.mortality.map(m => <Meter key={m.category} label={m.category} pct={m.rate} color={m.rate > 10 ? '#d2503a' : m.rate > 3 ? '#e0922f' : '#2fa86a'} />)}</div></CardContent></Clickable>
              <Clickable to="/inventory/analytics/health" label="Health condition rate"><CardContent className="p-5"><p className="text-sm font-semibold mb-3">Health Condition Rate</p><div className="space-y-2.5">{d.health.map(m => <Meter key={m.category} label={m.category} pct={m.rate} color={CAT.grazing} />)}</div></CardContent></Clickable>
              <Clickable to="/inventory/analytics/sold-rate" label="Sold items and sold rate"><CardContent className="p-5">
                <p className="text-sm font-semibold mb-1">Sold Items &amp; Sold Rate</p>
                <p className="text-2xl font-bold">{d.soldRate.rate}%</p>
                <p className="text-xs text-muted-foreground mb-3">{d.soldRate.sold} of {d.soldRate.listed} listed</p>
                <div className="space-y-2.5">{d.soldRate.perProduct.map(p => <Meter key={p.name} label={p.name} pct={p.rate} color={CAT.fish} />)}</div>
              </CardContent></Clickable>
            </>
          )}
        </div>

        {/* Top Selling + Stock Summary */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8">
            {ov.isLoading ? <Skel h={240} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Clickable to="/inventory/analytics/top-selling" label="Top selling products">
                <CardContent className="p-0">
                  <div className="p-5 pb-3 flex items-center justify-between"><p className="text-sm font-semibold">Top Selling Products</p><ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground" /></div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Item Name</TableHead><TableHead>SKU</TableHead><TableHead>Quantity</TableHead><TableHead>Total Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {d.topSelling.map(t => (
                        <TableRow key={t.name}><TableCell className="font-medium">{t.name}</TableCell><TableCell className="font-mono text-xs">{t.sku}</TableCell><TableCell>{t.quantity.toLocaleString()}</TableCell><TableCell className="font-medium">{money(t.totalAmount)}</TableCell><TableCell><Badge className={statusBadge(t.status)}>{t.status}</Badge></TableCell></TableRow>
                      ))}
                      {!d.topSelling.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No sales yet</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Clickable>
            )}
          </div>
          <div className="xl:col-span-4">
            {ov.isLoading ? <Skel h={240} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Clickable to="/inventory/analytics/stock-summary" label="Stock summary">
                <CardContent className="p-5">
                  <p className="text-sm font-semibold mb-3">Stock Summary</p>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart><Pie data={[{ n: 'In stock', v: d.stockSummary.inStock }, { n: 'Low stock', v: d.stockSummary.lowStock }, { n: 'Out of stock', v: d.stockSummary.outOfStock }]} cx="50%" cy="50%" innerRadius={45} outerRadius={66} dataKey="v" strokeWidth={0} paddingAngle={2}>
                        <Cell fill="#2fa86a" /><Cell fill="#e0922f" /><Cell fill="#d2503a" />
                      </Pie><Tooltip {...TOOLTIP} /></PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-xl font-bold">{d.stockSummary.totalSkus}</span><span className="text-xs text-muted-foreground">SKUs</span></div>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-xs">
                    <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-success" />In stock</span><span className="font-medium">{d.stockSummary.inStock}</span></li>
                    <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-warning" />Low stock</span><span className="font-medium">{d.stockSummary.lowStock}</span></li>
                    <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-destructive" />Out of stock</span><span className="font-medium">{d.stockSummary.outOfStock}</span></li>
                  </ul>
                </CardContent>
              </Clickable>
            )}
          </div>
        </div>

        {/* Upcoming Items */}
        {ov.isLoading ? <Skel h={180} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
          <Clickable to="/inventory/analytics/upcoming" label="Upcoming items">
            <CardContent className="p-0">
              <div className="p-5 pb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Upcoming Items</p>
                <Badge className="bg-success/20 text-success">{d.upcoming.length} inbound</Badge>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>No</TableHead><TableHead>Item Name</TableHead><TableHead>Location</TableHead><TableHead>Batch No</TableHead><TableHead>Quantity</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.upcoming.map(u => (
                    <TableRow key={u.batch_no}><TableCell>{u.no}</TableCell><TableCell className="font-medium">{u.item_name}</TableCell><TableCell>{u.location}</TableCell><TableCell className="font-mono text-xs">{u.batch_no}</TableCell><TableCell>{u.quantity.toLocaleString()}</TableCell><TableCell><Badge className={statusBadge(u.status)}>{u.status}</Badge></TableCell></TableRow>
                  ))}
                  {!d.upcoming.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No inbound items</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Clickable>
        )}
      </div>
    </DashboardLayout>
  );
}
