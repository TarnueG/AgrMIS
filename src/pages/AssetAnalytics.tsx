import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wheat, Tractor, DollarSign, Wrench, TrendingUp, TrendingDown, ChevronRight, RefreshCw, MapPin } from 'lucide-react';

interface Overview {
  generatedAt: string;
  kpis: { totalArea: number; areaTrend: number; totalEquipment: number; equipmentTrend: number; totalValue: number; valueTrend: number; repairRate: number; repairTrend: number };
  soilDistribution: { label: string; hectares: number; pct: number }[];
  largestCrops: { crop: string; hectares: number; parcel: string }[];
  mostUsedEquipment: { id: string; name: string; type: string; tasks: number }[];
  mostUsedParcel: { name: string; soil: string; area: number; crop: string; location: string; machineHours: number; operations: number; utilization: number } | null;
  maintenance: { repairRate: number; scheduled: number; unscheduled: number; workOrders: number; avgDowntime: number; dueThisWeek: number };
  assetsTable: { id: string; name: string; type: string; location: string; condition: number; lastService: string | null; value: number; status: string; amount: number }[];
}

const PAL = ['#1F6F54', '#C2622E', '#D9A441', '#7C9CB5', '#6B5440', '#C0584B'];
const TOOLTIP = { contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }, itemStyle: { color: '#e5e7eb' }, labelStyle: { color: '#9ca3af', marginBottom: 4 } };
const money = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
function statusBadge(s: string): string {
  if (s === 'operational') return 'bg-success/20 text-success';
  if (s === 'under_maintenance') return 'bg-warning/20 text-warning';
  if (s === 'lost' || s === 'retired' || s === 'decommissioned') return 'bg-destructive/20 text-destructive';
  return 'bg-muted text-muted-foreground';
}
const condColor = (c: number) => c >= 80 ? '#2fa86a' : c >= 50 ? '#e0922f' : '#d2503a';

function Skel({ h = 120 }: { h?: number }) { return <Card><CardContent className="p-5 animate-pulse"><div className="h-3 w-24 bg-muted rounded mb-3" /><div className="bg-muted rounded" style={{ height: h }} /></CardContent></Card>; }
function CardErr({ onRetry }: { onRetry: () => void }) { return <Card><CardContent className="p-5 flex items-center justify-between"><p className="text-sm text-destructive">Couldn't load</p><Button size="sm" variant="outline" onClick={onRetry} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></CardContent></Card>; }
function Delta({ pct }: { pct: number }) { const up = pct >= 0; return <span className={`inline-flex items-center text-xs font-medium ${up ? 'text-success' : 'text-destructive'}`}>{up ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}{Math.abs(pct)}%</span>; }

function Clickable({ to, label, children, className }: { to: string; label: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  const go = () => { sessionStorage.setItem('asset-analytics-scroll', String(window.scrollY)); navigate(to); };
  return <Card className={`group cursor-pointer transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`} role="button" tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }} aria-label={label}>{children}</Card>;
}

export default function AssetAnalytics() {
  const ov = useQuery<Overview>({ queryKey: ['asset-analytics'], queryFn: () => api.get('/assets/analytics/overview'), refetchInterval: 30_000, refetchOnWindowFocus: true, staleTime: 30_000 });

  useEffect(() => {
    const s = sessionStorage.getItem('asset-analytics-scroll');
    if (s) { window.scrollTo({ top: Number(s), behavior: 'instant' as ScrollBehavior }); sessionStorage.removeItem('asset-analytics-scroll'); }
  }, []);

  const d = ov.data;
  const KPIS = d ? [
    { key: 'total-parcel-area', label: 'Total Parcel Area', icon: Wheat, value: `${d.kpis.totalArea.toLocaleString()} ha`, trend: d.kpis.areaTrend, sub: `${d.soilDistribution.length} soil types`, color: '#1F6F54' },
    { key: 'total-equipment', label: 'Total Equipment', icon: Tractor, value: d.kpis.totalEquipment.toLocaleString(), trend: d.kpis.equipmentTrend, sub: 'Registered assets', color: '#C2622E' },
    { key: 'total-asset-value', label: 'Total Asset Value', icon: DollarSign, value: money(d.kpis.totalValue), trend: d.kpis.valueTrend, sub: 'Current book value', color: '#D9A441' },
    { key: 'maintenance-repair-rate', label: 'Maintenance Repair Rate', icon: Wrench, value: `${d.kpis.repairRate}%`, trend: d.kpis.repairTrend, sub: 'Unscheduled share', color: '#C0584B' },
  ] : [];
  const ring = d ? [{ name: 'r', value: d.maintenance.repairRate }, { name: 'rest', value: 100 - d.maintenance.repairRate }] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Asset Management Analytics</h1>
            <p className="text-muted-foreground text-sm">Parcels, equipment, asset value &amp; maintenance</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-success" /></span>
            Live{d?.generatedAt && <span className="text-muted-foreground">· synced {format(new Date(d.generatedAt), 'HH:mm:ss')}</span>}{ov.isFetching && !ov.isLoading && <span className="text-muted-foreground">· updating…</span>}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ov.isLoading ? [0, 1, 2, 3].map(i => <Skel key={i} h={60} />) : ov.isError ? <CardErr onRetry={ov.refetch} /> : KPIS.map(({ key, label, icon: Icon, value, trend, sub, color }) => (
            <Clickable key={key} to={`/assets/analytics/${key}`} label={`${label}: ${value}`} className="border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}22` }}><Icon className="h-5 w-5" style={{ color }} /></div>
                  <Delta pct={trend} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </CardContent>
            </Clickable>
          ))}
        </div>

        {/* Soil donut + Largest crops */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/assets/analytics/soil-distribution" label="Parcel area by soil type">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Parcel Area by Soil Type</p>
                {!d.soilDistribution.length ? <p className="py-8 text-center text-sm text-muted-foreground">No parcels yet</p> : (
                  <div className="flex items-center gap-4">
                    <div className="relative w-[150px] h-[150px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={d.soilDistribution} cx="50%" cy="50%" innerRadius={48} outerRadius={70} dataKey="hectares" strokeWidth={0} paddingAngle={2}>{d.soilDistribution.map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}</Pie><Tooltip {...TOOLTIP} formatter={(v: any) => `${v} ha`} /></PieChart></ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-lg font-bold">{d.kpis.totalArea}</span><span className="text-xs text-muted-foreground">ha</span></div>
                    </div>
                    <ul className="flex-1 space-y-1.5 text-xs">
                      {d.soilDistribution.map((s, i) => <li key={s.label} className="flex items-center justify-between"><span className="flex items-center gap-2 capitalize"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: PAL[i % PAL.length] }} />{s.label}</span><span className="text-muted-foreground">{s.hectares} ha · {s.pct}%</span></li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Clickable>
          )}
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/assets/analytics/largest-crops" label="Largest crops planted">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Largest Crops Planted</p>
                {!d.largestCrops.length ? <p className="py-8 text-center text-sm text-muted-foreground">No crops recorded</p> : (
                  <ul className="space-y-2.5">
                    {d.largestCrops.map((c, i) => { const max = d.largestCrops[0].hectares || 1; return (
                      <li key={`${c.crop}-${c.parcel}`} className="space-y-1">
                        <div className="flex justify-between text-sm"><span className="font-medium truncate max-w-[160px]">{c.crop}</span><span className="text-muted-foreground">{c.hectares} ha · {c.parcel}</span></div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.hectares / max) * 100}%`, backgroundColor: PAL[i % PAL.length] }} /></div>
                      </li>
                    ); })}
                  </ul>
                )}
              </CardContent>
            </Clickable>
          )}
        </div>

        {/* Most used equipment + Most used parcel + Maintenance */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {ov.isLoading ? <Skel h={200} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/assets/analytics/most-used-equipment" label="Most used equipment">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Most Used Equipment</p>
                {!d.mostUsedEquipment.length ? <p className="py-8 text-center text-sm text-muted-foreground">No tasks logged</p> : (
                  <ResponsiveContainer width="100%" height={180} aria-label="Most used equipment">
                    <BarChart data={d.mostUsedEquipment} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip {...TOOLTIP} formatter={(v: any) => `${v} tasks`} />
                      <Bar dataKey="tasks" name="Tasks" fill="#C2622E" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Clickable>
          )}
          {ov.isLoading ? <Skel h={200} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/assets/analytics/most-used-parcel" label="Most used parcel" className="bg-[#16201a] border-[#1F6F54]/30">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3"><MapPin className="h-4 w-4 text-[#2fa86a]" /><p className="text-sm font-semibold">Most Used Parcel</p></div>
                {!d.mostUsedParcel ? <p className="py-8 text-center text-sm text-muted-foreground">No parcels yet</p> : (
                  <>
                    <p className="text-xl font-bold">{d.mostUsedParcel.name}</p>
                    <p className="text-xs text-muted-foreground capitalize mb-3">{d.mostUsedParcel.crop} · {d.mostUsedParcel.soil} · {d.mostUsedParcel.area} ha</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-lg font-bold">{d.mostUsedParcel.machineHours}</p><p className="text-[10px] text-muted-foreground">Machine hrs</p></div>
                      <div><p className="text-lg font-bold">{d.mostUsedParcel.operations}</p><p className="text-[10px] text-muted-foreground">Operations</p></div>
                      <div><p className="text-lg font-bold">{d.mostUsedParcel.utilization}%</p><p className="text-[10px] text-muted-foreground">Utilization</p></div>
                    </div>
                  </>
                )}
              </CardContent>
            </Clickable>
          )}
          {ov.isLoading ? <Skel h={200} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/assets/analytics/maintenance" label="Maintenance and repair">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-2">Maintenance &amp; Repair</p>
                <div className="flex items-center gap-3">
                  <div className="relative w-[88px] h-[88px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={ring} cx="50%" cy="50%" innerRadius={28} outerRadius={42} startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}><Cell fill="#C0584B" /><Cell fill="#2a2a2a" /></Pie></PieChart></ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm font-bold">{d.maintenance.repairRate}%</div>
                  </div>
                  <ul className="flex-1 space-y-1 text-xs">
                    <li className="flex justify-between"><span className="text-muted-foreground">Scheduled</span><span className="font-medium">{d.maintenance.scheduled}</span></li>
                    <li className="flex justify-between"><span className="text-muted-foreground">Unscheduled</span><span className="font-medium">{d.maintenance.unscheduled}</span></li>
                    <li className="flex justify-between"><span className="text-muted-foreground">Work orders</span><span className="font-medium">{d.maintenance.workOrders}</span></li>
                    <li className="flex justify-between"><span className="text-muted-foreground">Due this week</span><span className="font-medium text-warning">{d.maintenance.dueThisWeek}</span></li>
                  </ul>
                </div>
              </CardContent>
            </Clickable>
          )}
        </div>

        {/* All Assets table */}
        {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
          <Clickable to="/assets/analytics/assets" label="All assets overview">
            <CardContent className="p-0">
              <div className="p-5 pb-3 flex items-center justify-between"><p className="text-sm font-semibold">All Assets Overview</p><ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground" /></div>
              <Table>
                <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead>Condition</TableHead><TableHead>Last Service</TableHead><TableHead>Value</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.assetsTable.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="capitalize">{a.type}</TableCell>
                      <TableCell>{a.location}</TableCell>
                      <TableCell><div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${a.condition}%`, backgroundColor: condColor(a.condition) }} /></div></TableCell>
                      <TableCell className="text-muted-foreground">{a.lastService ? format(new Date(a.lastService), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="font-medium">{money(a.value)}</TableCell>
                      <TableCell><Badge className={statusBadge(a.status)}>{a.status.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{money(a.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {!d.assetsTable.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No assets yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Clickable>
        )}
      </div>
    </DashboardLayout>
  );
}
