import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, ArrowUpCircle, ArrowDownCircle, CheckCircle2, TrendingUp, TrendingDown, ChevronRight, RefreshCw } from 'lucide-react';

interface Kpi { value: number; trend: number; spark: number[]; }
interface Overview {
  generatedAt: string; range: string;
  kpis: { totalProduced: Kpi; unitsToday: Kpi; declined: Kpi; passRate: Kpi };
  output: { labels: string[]; products: { name: string; series: number[] }[] };
  quality: { passed: number; rework: number; passRate: number };
  performance: { bucket: string; pending: number; inCheck: number; passed: number }[];
  resources: { name: string; quantity: number }[];
  activities: { id: string; product: string; batch: string; line: string; qty: number; progress: number; stage: string; updated: string }[];
}

const LINE = ['#3f9142', '#84cc16', '#e0a106', '#1f6b3b', '#7C9CB5'];
const TOOLTIP = { contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }, itemStyle: { color: '#e5e7eb' }, labelStyle: { color: '#9ca3af', marginBottom: 4 } };
function stageBadge(s: string): string {
  if (s === 'passed') return 'bg-success/20 text-success';
  if (s === 'rework') return 'bg-orange-500/20 text-orange-400';
  if (s === 'quality_check') return 'bg-amber-500/20 text-amber-400';
  return 'bg-warning/20 text-warning';
}
const stageLabel = (s: string) => s === 'quality_check' ? 'In Check' : s.charAt(0).toUpperCase() + s.slice(1);

function Skel({ h = 120 }: { h?: number }) { return <Card><CardContent className="p-5 animate-pulse"><div className="h-3 w-24 bg-muted rounded mb-3" /><div className="bg-muted rounded" style={{ height: h }} /></CardContent></Card>; }
function CardErr({ onRetry }: { onRetry: () => void }) { return <Card><CardContent className="p-5 flex items-center justify-between"><p className="text-sm text-destructive">Couldn't load</p><Button size="sm" variant="outline" onClick={onRetry} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></CardContent></Card>; }
function Delta({ pct, invert }: { pct: number; invert?: boolean }) { const up = pct >= 0; const good = invert ? !up : up; return <span className={`inline-flex items-center text-xs font-medium ${good ? 'text-success' : 'text-destructive'}`}>{up ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}{Math.abs(pct)}%</span>; }
function Spark({ data, color }: { data: number[]; color: string }) { const d = data.map((v, i) => ({ i, v })); return <div className="h-9"><ResponsiveContainer width="100%" height="100%"><LineChart data={d}><Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>; }

function Clickable({ to, label, children, className }: { to: string; label: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  const go = () => { sessionStorage.setItem('prod-analytics-scroll', String(window.scrollY)); navigate(to); };
  return <Card className={`group cursor-pointer transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`} role="button" tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }} aria-label={label}>{children}</Card>;
}

export default function ProductionAnalytics() {
  const [range, setRange] = useState(() => sessionStorage.getItem('prod-analytics-range') || 'daily');
  const ov = useQuery<Overview>({ queryKey: ['prod-analytics', range], queryFn: () => api.get(`/production/analytics/overview?range=${range}`), refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 10_000 });

  useEffect(() => { sessionStorage.setItem('prod-analytics-range', range); }, [range]);
  useEffect(() => { const s = sessionStorage.getItem('prod-analytics-scroll'); if (s) { window.scrollTo({ top: Number(s), behavior: 'instant' as ScrollBehavior }); sessionStorage.removeItem('prod-analytics-scroll'); } }, []);

  const d = ov.data;
  const KPIS = d ? [
    { key: 'total-produced', label: 'Passed Orders', icon: CheckCircle, k: d.kpis.totalProduced, color: '#3f9142', invert: false },
    { key: 'units-today', label: 'Units Produced Today', icon: ArrowUpCircle, k: d.kpis.unitsToday, color: '#84cc16', invert: false },
    { key: 'declined', label: 'Products Declined', icon: ArrowDownCircle, k: d.kpis.declined, color: '#d97642', invert: true },
    { key: 'quality-rate', label: 'Quality Pass Rate', icon: CheckCircle2, k: d.kpis.passRate, color: '#e0a106', invert: false, suffix: '%' },
  ] : [];
  const donut = d ? [{ n: 'Passed', v: d.quality.passed }, { n: 'Rework', v: d.quality.rework }] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Production Analytics</h1>
            <p className="text-muted-foreground text-sm">Real-time overview of output, quality &amp; resource use</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-success" /></span>
            Live{d?.generatedAt && <span className="text-muted-foreground">· {format(new Date(d.generatedAt), 'HH:mm:ss')}</span>}{ov.isFetching && !ov.isLoading && <span className="text-muted-foreground">· updating…</span>}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ov.isLoading ? [0, 1, 2, 3].map(i => <Skel key={i} h={70} />) : ov.isError ? <CardErr onRetry={ov.refetch} /> : KPIS.map(({ key, label, icon: Icon, k, color, invert, suffix }) => (
            <Clickable key={key} to={`/production/analytics/${key}`} label={`${label}: ${k.value}`} className="border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}22` }}><Icon className="h-5 w-5" style={{ color }} /></div>
                  <Delta pct={k.trend} invert={invert} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{label}</p>
                <p className="text-2xl font-bold tabular-nums">{k.value.toLocaleString()}{suffix ?? ''}</p>
                <Spark data={k.spark} color={color} />
              </CardContent>
            </Clickable>
          ))}
        </div>

        {/* Output + Quality donut */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Card><CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">Most Products Produced</p>
                  <div className="flex flex-wrap gap-3">{d.output.products.map((p, i) => <span key={p.name} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-0.5 rounded" style={{ background: LINE[i % LINE.length] }} />{p.name}</span>)}</div>
                </div>
                {!d.output.products.length ? <p className="py-8 text-center text-sm text-muted-foreground">No output recorded</p> : (
                  <ResponsiveContainer width="100%" height={220} aria-label="Output by product">
                    <AreaChart data={d.output.labels.map((label, i) => { const row: any = { label }; d.output.products.forEach(p => { row[p.name] = p.series[i]; }); return row; })} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                      <defs>{d.output.products.map((p, i) => <linearGradient key={p.name} id={`g${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={LINE[i % LINE.length]} stopOpacity={0.3} /><stop offset="100%" stopColor={LINE[i % LINE.length]} stopOpacity={0} /></linearGradient>)}</defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}kg`} />
                      <Tooltip {...TOOLTIP} formatter={(v: any) => `${v} kg`} />
                      {d.output.products.map((p, i) => <Area key={p.name} type="monotone" dataKey={p.name} stroke={LINE[i % LINE.length]} strokeWidth={2} fill={`url(#g${i})`} />)}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent></Card>
            )}
          </div>
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/production/analytics/quality-rate" label="Quality check rate">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Quality Check Rate</p>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={160}><PieChart><Pie data={donut} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="v" strokeWidth={0} paddingAngle={2}><Cell fill="#14532d" /><Cell fill="#d97642" /></Pie><Tooltip {...TOOLTIP} /></PieChart></ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-xl font-bold tabular-nums">{d.quality.passRate}%</span><span className="text-xs text-muted-foreground">PASSED</span></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg bg-success/10 p-2 text-center"><p className="text-sm font-bold text-success tabular-nums">{d.quality.passed}</p><p className="text-[10px] text-muted-foreground">Passed</p></div>
                  <div className="rounded-lg bg-orange-500/10 p-2 text-center"><p className="text-sm font-bold text-orange-400 tabular-nums">{d.quality.rework}</p><p className="text-[10px] text-muted-foreground">Rework</p></div>
                </div>
              </CardContent>
            </Clickable>
          )}
        </div>

        {/* Performance + Chemicals */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/production/analytics/performance" label="Performance rate">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">Performance Rate</p>
                  <div className="flex gap-1 bg-muted/40 rounded-lg p-1" onClick={(e) => e.stopPropagation()}>
                    {[{ v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }, { v: 'monthly', l: 'Monthly' }].map(o => (
                      <Button key={o.v} size="sm" onClick={() => setRange(o.v)} aria-pressed={range === o.v} className={range === o.v ? 'gradient-primary text-black font-medium h-7 px-3 text-xs' : 'border-0 bg-transparent text-white hover:bg-accent h-7 px-3 text-xs'}>{o.l}</Button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200} aria-label="Performance rate">
                  <BarChart data={d.performance} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} />
                    <Bar dataKey="pending" name="Pending" stackId="a" fill="#84cc16" />
                    <Bar dataKey="inCheck" name="In Check" stackId="a" fill="#e0a106" />
                    <Bar dataKey="passed" name="Passed" stackId="a" fill="#14532d" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 justify-center mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#84cc16]" />Pending</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#e0a106]" />In Check</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#14532d]" />Passed</span>
                </div>
              </CardContent>
            </Clickable>
          )}
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/production/analytics/resources" label="Chemicals and feeds used">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Chemicals &amp; Feeds Used</p>
                {!d.resources.length ? <p className="py-8 text-center text-sm text-muted-foreground">No applications logged</p> : (
                  <ResponsiveContainer width="100%" height={200} aria-label="Chemicals and feeds">
                    <BarChart data={d.resources} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                      <Tooltip {...TOOLTIP} />
                      <Bar dataKey="quantity" name="Used" fill="#3f9142" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Clickable>
          )}
        </div>

        {/* Activities table */}
        {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
          <Card>
            <CardContent className="p-0">
              <div className="p-5 pb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Production Activities Overview</p>
                <Badge className="bg-success/20 text-success"><span className="relative flex h-1.5 w-1.5 mr-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" /></span>Auto-refresh</Badge>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Product / Batch</TableHead><TableHead>Line</TableHead><TableHead>Qty (kg)</TableHead><TableHead>Progress</TableHead><TableHead>Stage</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.activities.map(a => (
                    <TableRow key={a.id}>
                      <TableCell><span className="font-medium">{a.product}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{a.batch}</span></TableCell>
                      <TableCell>{a.line}</TableCell>
                      <TableCell className="tabular-nums">{a.qty.toLocaleString()}</TableCell>
                      <TableCell><div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${a.progress}%` }} /></div></TableCell>
                      <TableCell><Badge className={stageBadge(a.stage)}>{stageLabel(a.stage)}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{a.updated}</TableCell>
                    </TableRow>
                  ))}
                  {!d.activities.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No production activities</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center">Data streams in real time and recalculates automatically · Production Analytics v1.0</p>
      </div>
    </DashboardLayout>
  );
}
