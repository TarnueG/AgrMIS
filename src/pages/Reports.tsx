import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';

// Summary Reports and Analytics (spec A): CURATED — renders ONLY the listed widgets, each pulled
// from the same analytics endpoint its source subsystem page uses (data 1:1, no recomputation).
// Each section is its own component (own query + skeleton/error isolation).

const TOOLTIP = { contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }, itemStyle: { color: '#e5e7eb' }, labelStyle: { color: '#9ca3af', marginBottom: 4 } };
const money = (n: any) => `$${Math.round(Number(n || 0)).toLocaleString()}`;
const num = (n: any) => Math.round(Number(n || 0)).toLocaleString();
const PAL = ['#3f9142', '#675CB0', '#3B79A0', '#e0a106', '#BF5046', '#84cc16', '#8A6FE8', '#3DA5E0'];

function useOv(key: string, url: string) {
  return useQuery<any>({ queryKey: ['summary', key], queryFn: () => api.get<any>(url), refetchInterval: 60_000, staleTime: 30_000, retry: 1 });
}
const useGo = () => { const n = useNavigate(); return (to?: string) => { if (to) n(to); }; };

function Stat({ label, value, sub, to, onNav }: { label: string; value: string; sub?: string; to?: string; onNav: (to?: string) => void }) {
  return (
    <Card role={to ? 'button' : undefined} tabIndex={to ? 0 : undefined} onClick={() => onNav(to)} onKeyDown={(e: any) => { if (to && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onNav(to); } }}
      className={`${to ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''} transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg`}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
        {sub ? <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}
function Panel({ title, children }: { title: string; children: any }) {
  return <Card><CardContent className="p-5"><p className="text-sm font-semibold mb-3">{title}</p>{children}</CardContent></Card>;
}
function Skel() { return <Card><CardContent className="p-4 animate-pulse"><div className="h-3 w-20 bg-muted rounded mb-3" /><div className="h-5 w-16 bg-muted rounded" /></CardContent></Card>; }
function ErrCard({ onRetry }: { onRetry: () => void }) {
  return <Card className="col-span-full"><CardContent className="p-4 flex items-center justify-between"><p className="text-sm text-destructive">Couldn't load this section</p><Button size="sm" variant="outline" onClick={onRetry} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></CardContent></Card>;
}
function Shell({ title, children }: { title: string; children: any }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-primary">{title}</span><span className="h-px flex-1 bg-border" /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{children}</div>
    </section>
  );
}
function body(q: any, skel: number, render: () => any) {
  if (q.isLoading) return Array.from({ length: skel }, (_, i) => <Skel key={i} />);
  if (q.isError) return <ErrCard onRetry={q.refetch} />;
  return render();
}

function AssetSection() {
  const go = useGo(); const q = useOv('asset', '/assets/analytics/overview');
  return <Shell title="Asset Management">{body(q, 2, () => { const k = q.data?.kpis ?? {}; return <>
    <Stat label="Total Parcel Area" value={`${num(k.totalArea)} ha`} to="/assets/analytics/total-parcel-area" onNav={go} />
    <Stat label="Total Equipment" value={num(k.totalEquipment)} to="/assets/analytics/total-equipment" onNav={go} />
  </>; })}</Shell>;
}

function CrmSection() {
  const go = useGo(); const q = useOv('crm', '/sales/analytics/customers/summary'); const top = useOv('crm-top', '/sales/analytics/products/top');
  return <Shell title="CRM">{body(q, 2, () => <>
    <Stat label="Total Customer" value={num(q.data?.total)} to="/crm/analytics/customers" onNav={go} />
    <div className="md:col-span-2 xl:col-span-2">{body(top, 1, () => (
      <Panel title="Top Five Products">
        <ul className="space-y-2">
          {(top.data?.products ?? []).slice(0, 5).map((p: any, i: number) => (
            <li key={p.id ?? i} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="w-5 text-muted-foreground">{i + 1}.</span>{p.name}</span><span className="tabular-nums text-muted-foreground">{money((p.series ?? []).reduce((s: number, v: number) => s + Number(v || 0), 0) || p.value)}</span></li>
          ))}
          {(top.data?.products ?? []).length ? null : <li className="text-sm text-muted-foreground">No product data</li>}
        </ul>
      </Panel>
    ))}</div>
  </>)}</Shell>;
}

function MarketingSection() {
  const go = useGo(); const q = useOv('marketing', '/marketing/analytics/overview');
  return <Shell title="Marketing">{body(q, 3, () => { const d = q.data; const k = d?.kpis ?? {}; return <>
    <Stat label="Total Income Generated" value={money(k.totalIncome)} to="/marketing/analytics" onNav={go} />
    <Stat label="Pending Orders" value={num(k.pending?.value)} to="/marketing/analytics/orders/pending" onNav={go} />
    <Stat label="In-Processing Orders" value={num(k.inProcess?.value)} to="/marketing/analytics/orders/in_process" onNav={go} />
    <Stat label="Completed Orders" value={num(k.completed?.value)} to="/marketing/analytics/orders/completed" onNav={go} />
    <div className="xl:col-span-2 md:col-span-2"><Panel title="Total Revenue Summary">
      {(d?.revenueBreakdown ?? []).length ? (
        <div className="flex items-center gap-2">
          <ResponsiveContainer width="50%" height={150}><PieChart><Pie data={d.revenueBreakdown} cx="50%" cy="50%" innerRadius={42} outerRadius={62} dataKey="value" nameKey="name" strokeWidth={0}>{d.revenueBreakdown.map((_: any, i: number) => <Cell key={i} fill={PAL[i % PAL.length]} />)}</Pie><Tooltip {...TOOLTIP} formatter={(v: any) => money(v)} /></PieChart></ResponsiveContainer>
          <div className="flex-1 space-y-1">{d.revenueBreakdown.map((r: any, i: number) => <div key={r.name} className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PAL[i % PAL.length] }} />{r.name}</span><span className="tabular-nums">{r.pct}%</span></div>)}</div>
        </div>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">No revenue data</p>}
    </Panel></div>
    <div className="xl:col-span-3 md:col-span-2"><Panel title="Sales and Purchase">
      <ResponsiveContainer width="100%" height={170}><BarChart data={d?.salesVsPurchase ?? []} margin={{ top: 0, right: 8, bottom: 0, left: -16 }}><CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} /><XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip {...TOOLTIP} formatter={(v: any) => money(v)} /><Bar dataKey="sales" name="Sales" fill="#3f9142" radius={[3, 3, 0, 0]} /><Bar dataKey="purchase" name="Purchase" fill="#BF5046" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
    </Panel></div>
  </>; })}</Shell>;
}

function FinanceSection() {
  const go = useGo(); const q = useOv('finance', '/finance/analytics/overview');
  return <Shell title="Finance">{body(q, 3, () => { const d = q.data; const k = d?.kpis ?? {}; return <>
    <Stat label="Total Expenses" value={money(k.expenses)} to="/finance/analytics/expenses" onNav={go} />
    <Stat label="Net Profit" value={money(k.netProfit)} to="/finance/analytics/net-profit" onNav={go} />
    <Stat label="Net Margin" value={`${k.netMargin ?? 0}%`} to="/finance/analytics" onNav={go} />
    <div className="xl:col-span-2 md:col-span-2"><Panel title="Revenue vs Expenses">
      <ResponsiveContainer width="100%" height={170}><AreaChart data={d?.revenueExpenses ?? []} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}><defs><linearGradient id="srev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3f9142" stopOpacity={0.35} /><stop offset="100%" stopColor="#3f9142" stopOpacity={0} /></linearGradient><linearGradient id="sexp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#BF5046" stopOpacity={0.3} /><stop offset="100%" stopColor="#BF5046" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip {...TOOLTIP} formatter={(v: any) => money(v)} /><Area type="monotone" dataKey="revenue" stroke="#3f9142" fill="url(#srev)" strokeWidth={2} /><Area type="monotone" dataKey="expenses" stroke="#BF5046" fill="url(#sexp)" strokeWidth={2} /></AreaChart></ResponsiveContainer>
    </Panel></div>
    <div className="md:col-span-2 xl:col-span-1"><Panel title="Top Selling Items">
      {(d?.topItems?.items ?? []).length ? (
        <ul className="space-y-2">{d.topItems.items.slice(0, 5).map((it: any) => <li key={it.id}><div className="flex justify-between text-sm"><span className="font-medium truncate">{it.name}</span><span className="tabular-nums text-muted-foreground">{money(it.revenue)}</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1"><div className="h-full rounded-full bg-[#3f9142]" style={{ width: `${it.pctOfMax}%` }} /></div></li>)}</ul>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">No sales</p>}
    </Panel></div>
  </>; })}</Shell>;
}

function InventorySection() {
  const q = useOv('inventory', '/inventory/analytics/overview');
  return <Shell title="Inventory & Livestock">{body(q, 3, () => { const d = q.data; return <>
    <Panel title="Livestock Performance Overview">
      {(d?.performance?.labels ?? []).length ? (
        <ResponsiveContainer width="100%" height={160}><LineChart data={d.performance.labels.map((label: string, i: number) => ({ label, fish: d.performance.series.fish[i], birds: d.performance.series.birds[i], grazing: d.performance.series.grazing[i], pigs: d.performance.series.pigs[i] }))} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip {...TOOLTIP} /><Line type="monotone" dataKey="fish" stroke="#3DA5E0" dot={false} /><Line type="monotone" dataKey="birds" stroke="#e0a106" dot={false} /><Line type="monotone" dataKey="grazing" stroke="#BF5046" dot={false} /><Line type="monotone" dataKey="pigs" stroke="#8A6FE8" dot={false} /></LineChart></ResponsiveContainer>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">No data</p>}
    </Panel>
    <Panel title="Top Selling Products">
      <Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>{(d?.topSelling ?? []).slice(0, 5).map((t: any) => <TableRow key={t.name}><TableCell className="font-medium">{t.name}</TableCell><TableCell>{num(t.quantity)}</TableCell><TableCell>{money(t.totalAmount)}</TableCell></TableRow>)}{(d?.topSelling ?? []).length ? null : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No sales</TableCell></TableRow>}</TableBody></Table>
    </Panel>
    <div className="md:col-span-2 xl:col-span-1"><Panel title="Upcoming Items">
      <Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{(d?.upcoming ?? []).slice(0, 6).map((u: any) => <TableRow key={`${u.no}-${u.batch_no}`}><TableCell className="font-medium">{u.item_name}</TableCell><TableCell>{num(u.quantity)}</TableCell><TableCell><Badge className={u.status === 'Cancel' ? 'bg-destructive/20 text-destructive' : u.status === 'Processing' ? 'bg-blue-500/20 text-blue-500' : 'bg-warning/20 text-warning'}>{u.status}</Badge></TableCell></TableRow>)}{(d?.upcoming ?? []).length ? null : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No inbound items</TableCell></TableRow>}</TableBody></Table>
    </Panel></div>
  </>; })}</Shell>;
}

function ProcurementSection() {
  const q = useOv('procurement', '/procurement/analytics');
  return <Shell title="Procurement">{body(q, 2, () => { const d = q.data; const fin = d?.finishedOrders ?? []; return <>
    <div className="xl:col-span-2 md:col-span-2"><Panel title="Order Volume Trends">
      <ResponsiveContainer width="100%" height={170}><BarChart data={d?.orderVolumeTrends ?? []} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} /><XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip {...TOOLTIP} /><Bar dataKey="purchaseOrders" name="POs" fill="#675CB0" radius={[3, 3, 0, 0]} /><Bar dataKey="paidOrders" name="Paid" fill="#3f9142" radius={[3, 3, 0, 0]} /><Bar dataKey="unpaidOrders" name="Unpaid" fill="#e0a106" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
    </Panel></div>
    <Panel title="Finish Order">
      <div className="space-y-2">{fin.map((f: any) => <div key={f.label} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{f.label}</span><span className="font-bold tabular-nums">{num(f.count)}</span></div>)}{fin.length ? null : <p className="text-sm text-muted-foreground">No orders</p>}</div>
    </Panel>
  </>; })}</Shell>;
}

function ProductionSection() {
  const go = useGo(); const q = useOv('production', '/production/analytics/overview?range=daily');
  return <Shell title="Production">{body(q, 4, () => { const d = q.data; const k = d?.kpis ?? {}; return <>
    <Stat label="Units Produced Today" value={num(k.unitsToday?.value)} to="/production/analytics/units-today" onNav={go} />
    <Stat label="Quality Pass Rate" value={`${k.passRate?.value ?? 0}%`} to="/production/analytics/quality-rate" onNav={go} />
    <Panel title="Quality Check Rate">
      <div className="relative"><ResponsiveContainer width="100%" height={130}><PieChart><Pie data={[{ n: 'Passed', v: d?.quality?.passed ?? 0 }, { n: 'Rework', v: d?.quality?.rework ?? 0 }]} cx="50%" cy="50%" innerRadius={40} outerRadius={56} dataKey="v" strokeWidth={0}><Cell fill="#14532d" /><Cell fill="#d97642" /></Pie><Tooltip {...TOOLTIP} /></PieChart></ResponsiveContainer><div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-lg font-bold tabular-nums">{d?.quality?.passRate ?? 0}%</span></div></div>
    </Panel>
    <div className="xl:col-span-3 md:col-span-2"><Panel title="Most Products Produced">
      {(d?.output?.products ?? []).length ? (
        <ResponsiveContainer width="100%" height={170}><AreaChart data={(d.output.labels ?? []).map((label: string, i: number) => { const row: any = { label }; d.output.products.forEach((p: any) => { row[p.name] = p.series[i]; }); return row; })} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip {...TOOLTIP} />{d.output.products.map((p: any, i: number) => <Area key={p.name} type="monotone" dataKey={p.name} stroke={PAL[i % PAL.length]} fill={PAL[i % PAL.length]} fillOpacity={0.15} strokeWidth={2} />)}</AreaChart></ResponsiveContainer>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">No output</p>}
    </Panel></div>
  </>; })}</Shell>;
}

function HrSection() {
  const go = useGo(); const q = useOv('hr', '/hr/analytics/overview');
  return <Shell title="Human Capital">{body(q, 3, () => { const d = q.data; const k = d?.kpis ?? {}; return <>
    <Stat label="Total Work Force" value={num(k.workforce?.value)} to="/human-capital/analytics/workforce" onNav={go} />
    <Stat label="Attendance Rate" value={`${d?.attendanceRate?.presentPct ?? 0}%`} sub={`On-time ${d?.attendanceRate?.onTime ?? 0} · Absent ${d?.attendanceRate?.absent ?? 0}`} to="/human-capital/analytics/attendance" onNav={go} />
    <Stat label="Task Completion" value={`${d?.taskSummary?.completed ?? 0}/${d?.taskSummary?.total ?? 0}`} to="/human-capital/analytics/tasks" onNav={go} />
    <div className="xl:col-span-2 md:col-span-2"><Panel title="Worker Performance Rate">
      <ResponsiveContainer width="100%" height={160}><LineChart data={(d?.performance?.labels ?? []).map((label: string, i: number) => ({ label, attendance: d.performance.attendance[i], taskOnTime: d.performance.taskOnTime[i] }))} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip {...TOOLTIP} formatter={(v: any) => `${v}%`} /><Line type="monotone" dataKey="attendance" name="Attendance" stroke="#0E8E7F" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="taskOnTime" name="On-time tasks" stroke="#e0a106" strokeWidth={2} strokeDasharray="5 4" dot={false} /></LineChart></ResponsiveContainer>
    </Panel></div>
    <Panel title="Job Position">
      {(d?.jobPosition ?? []).length ? (
        <div className="flex items-center gap-2"><ResponsiveContainer width="50%" height={140}><PieChart><Pie data={d.jobPosition} cx="50%" cy="50%" outerRadius={56} dataKey="count" nameKey="name" strokeWidth={0}>{d.jobPosition.map((s: any) => <Cell key={s.name} fill={s.color} />)}</Pie><Tooltip {...TOOLTIP} /></PieChart></ResponsiveContainer><div className="flex-1 space-y-1">{d.jobPosition.slice(0, 5).map((s: any) => <div key={s.name} className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-muted-foreground truncate"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />{s.name}</span><span className="tabular-nums">{s.pct}%</span></div>)}</div></div>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">No roles</p>}
    </Panel>
    <div className="xl:col-span-3 md:col-span-2"><Panel title="Time Schedule — Task Timeline">
      {(d?.schedule ?? []).length ? (
        <div className="space-y-2">{d.schedule.map((t: any) => (
          <div key={t.id} className="grid grid-cols-[160px_1fr] gap-2 items-center">
            <div className="min-w-0"><p className="text-xs font-medium truncate">{t.name}</p><p className="text-[10px] text-muted-foreground">{t.men} men · {t.equipment} equip</p></div>
            <div className="relative h-5"><div className="absolute inset-y-1 rounded-md" style={{ left: `${(t.startDay / 7) * 100}%`, width: `${(t.spanDays / 7) * 100}%`, background: `${t.color}55`, borderLeft: `3px solid ${t.color}` }} /></div>
          </div>
        ))}</div>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">No scheduled tasks</p>}
    </Panel></div>
  </>; })}</Shell>;
}

export default function Reports() {
  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Summary Reports and Analytics</h1>
          <p className="text-muted-foreground">A curated selection of key analytics from each subsystem</p>
        </div>
        <AssetSection />
        <CrmSection />
        <MarketingSection />
        <FinanceSection />
        <InventorySection />
        <ProcurementSection />
        <ProductionSection />
        <HrSection />
        <p className="text-xs text-muted-foreground text-center">Curated from each subsystem's live analytics endpoints · Summary Reports and Analytics v2.0</p>
      </div>
    </DashboardLayout>
  );
}
