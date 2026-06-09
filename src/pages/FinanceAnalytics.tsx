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
import {
  DollarSign, Wallet, TrendingUp, TrendingDown, PiggyBank, Percent,
  ArrowUpRight, ArrowDownRight, RefreshCw, Users, HardHat, CreditCard, Smartphone,
} from 'lucide-react';

interface Kpi { revenue: number; expenses: number; netProfit: number; netMargin: number; currency: string; deltas: { revenue: number; expenses: number; profit: number }; sparklines: { revenue: number[]; expenses: number[]; profit: number[] }; }
interface SeriesPt { label: string; value: number; }
interface Overview {
  generatedAt: string; period: string; currency: string;
  kpis: Kpi;
  revenueExpenses: { label: string; revenue: number; expenses: number }[];
  profitTrend: SeriesPt[];
  invoiceSummary: { paid: { amount: number; count: number; deltaPct: number }; sold: { amount: number; count: number; deltaPct: number }; pending: { amount: number; count: number; deltaPct: number }; total: number };
  invoices: { id: string; number: string; date: string; customer: string; amount: number; status: string; balance: number }[];
  transactions: { id: string; type: string; label: string; timestamp: string; amount: number; direction: string; status: string }[];
  costAnalysis: { total: number; categories: { name: string; amount: number; pct: number; color: string }[] };
  financialHealth: { score: number; label: string; liquidity: number; runwayMonths: number; debtRatio: number };
  salesOverview: { gross: number; units: number; series: { label: string; sales: number }[] };
  topItems: { items: { id: string; name: string; units: number; revenue: number; pctOfMax: number }[]; combined: number };
  topCommodities: { items: { id: string; name: string; spend: number; pctOfMax: number }[]; combined: number };
  payrollWages: { total: number; deltaPct: number; headcount: number; series: SeriesPt[] };
  contractorPayments: { total: number; deltaPct: number; count: number; series: SeriesPt[] };
  purchaseMethods: { total: number; methods: { key: string; amount: number; pct: number }[] };
}

const TOOLTIP = { contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }, itemStyle: { color: '#e5e7eb' }, labelStyle: { color: '#9ca3af', marginBottom: 4 } };
const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtShort = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;

function Skel({ h = 120 }: { h?: number }) { return <Card><CardContent className="p-5 animate-pulse"><div className="h-3 w-24 bg-muted rounded mb-3" /><div className="bg-muted rounded" style={{ height: h }} /></CardContent></Card>; }
function CardErr({ onRetry }: { onRetry: () => void }) { return <Card><CardContent className="p-5 flex items-center justify-between"><p className="text-sm text-destructive">Couldn't load</p><Button size="sm" variant="outline" onClick={onRetry} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></CardContent></Card>; }
function Delta({ pct, invert }: { pct: number; invert?: boolean }) { const up = pct >= 0; const good = invert ? !up : up; return <span className={`inline-flex items-center text-xs font-medium ${good ? 'text-success' : 'text-destructive'}`}>{up ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}{Math.abs(pct)}%</span>; }
function Spark({ data, color }: { data: number[]; color: string }) { const d = data.map((v, i) => ({ i, v })); return <div className="h-9"><ResponsiveContainer width="100%" height="100%"><LineChart data={d}><Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>; }

function Clickable({ to, label, children, className }: { to: string; label: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  const go = () => { sessionStorage.setItem('fin-analytics-scroll', String(window.scrollY)); navigate(to); };
  return <Card className={`group cursor-pointer transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`} role="button" tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }} aria-label={label}>{children}</Card>;
}

export default function FinanceAnalytics() {
  const navigate = useNavigate();
  const goTo = (to: string) => { sessionStorage.setItem('fin-analytics-scroll', String(window.scrollY)); navigate(to); };
  const [period, setPeriod] = useState(() => sessionStorage.getItem('fin-analytics-period') || 'monthly');
  const ov = useQuery<Overview>({ queryKey: ['fin-analytics', period], queryFn: () => api.get(`/finance/analytics/overview?period=${period}`), refetchInterval: 20_000, refetchOnWindowFocus: true, staleTime: 10_000 });

  useEffect(() => { sessionStorage.setItem('fin-analytics-period', period); }, [period]);
  useEffect(() => { const s = sessionStorage.getItem('fin-analytics-scroll'); if (s) { window.scrollTo({ top: Number(s), behavior: 'instant' as ScrollBehavior }); sessionStorage.removeItem('fin-analytics-scroll'); } }, []);

  const d = ov.data;
  const KPIS = d ? [
    { key: 'revenue', label: 'Total Revenue', icon: DollarSign, value: fmt(d.kpis.revenue), trend: d.kpis.deltas.revenue, spark: d.kpis.sparklines.revenue, color: '#3f9142', invert: false },
    { key: 'expenses', label: 'Total Expenses', icon: Wallet, value: fmt(d.kpis.expenses), trend: d.kpis.deltas.expenses, spark: d.kpis.sparklines.expenses, color: '#BF5046', invert: true },
    { key: 'net-profit', label: 'Net Profit', icon: PiggyBank, value: fmt(d.kpis.netProfit), trend: d.kpis.deltas.profit, spark: d.kpis.sparklines.profit, color: '#675CB0', invert: false },
    { key: 'net-profit', label: 'Net Margin', icon: Percent, value: `${d.kpis.netMargin}%`, trend: d.kpis.deltas.profit, spark: d.kpis.sparklines.profit, color: '#3B79A0', invert: false },
  ] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Finance Analytics</h1>
            <p className="text-muted-foreground text-sm">Revenue, expenses, profitability &amp; cash flow</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
              {[{ v: 'weekly', l: 'Weekly' }, { v: 'monthly', l: 'Monthly' }, { v: 'yearly', l: 'Yearly' }].map(o => (
                <Button key={o.v} size="sm" onClick={() => setPeriod(o.v)} aria-pressed={period === o.v} className={period === o.v ? 'gradient-primary text-black font-medium h-7 px-3 text-xs' : 'border-0 bg-transparent text-white hover:bg-accent h-7 px-3 text-xs'}>{o.l}</Button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-success" /></span>
              Live{d?.generatedAt && <span className="text-muted-foreground">· {format(new Date(d.generatedAt), 'HH:mm:ss')}</span>}{ov.isFetching && !ov.isLoading && <span className="text-muted-foreground">· updating…</span>}
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ov.isLoading ? [0, 1, 2, 3].map(i => <Skel key={i} h={70} />) : ov.isError ? <CardErr onRetry={ov.refetch} /> : KPIS.map(({ key, label, icon: Icon, value, trend, spark, color, invert }) => (
            <Clickable key={label} to={`/finance/analytics/${key}`} label={`${label}: ${value}`} className="border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}22` }}><Icon className="h-5 w-5" style={{ color }} /></div>
                  <Delta pct={trend} invert={invert} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{label}</p>
                <p className="text-2xl font-bold tabular-nums">{value}</p>
                <Spark data={spark} color={color} />
              </CardContent>
            </Clickable>
          ))}
        </div>

        {/* Revenue vs Expenses + Cost Analysis donut */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            {ov.isLoading ? <Skel h={240} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Card><CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">Revenue vs Expenses</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded bg-[#3f9142]" />Revenue</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded bg-[#BF5046]" />Expenses</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240} aria-label="Revenue versus expenses">
                  <AreaChart data={d.revenueExpenses} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="frev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3f9142" stopOpacity={0.35} /><stop offset="100%" stopColor="#3f9142" stopOpacity={0} /></linearGradient>
                      <linearGradient id="fexp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#BF5046" stopOpacity={0.3} /><stop offset="100%" stopColor="#BF5046" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                    <Tooltip {...TOOLTIP} formatter={(v: any) => fmt(Number(v))} />
                    <Area type="monotone" dataKey="revenue" stroke="#3f9142" strokeWidth={2} fill="url(#frev)" />
                    <Area type="monotone" dataKey="expenses" stroke="#BF5046" strokeWidth={2} fill="url(#fexp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent></Card>
            )}
          </div>
          {ov.isLoading ? <Skel h={240} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/finance/analytics/expenses" label="Cost analysis breakdown">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Cost Analysis</p>
                {!d.costAnalysis.total ? <p className="py-10 text-center text-sm text-muted-foreground">No expenses recorded</p> : (<>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={160}><PieChart><Pie data={d.costAnalysis.categories} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="amount" nameKey="name" strokeWidth={0} paddingAngle={2}>{d.costAnalysis.categories.map(c => <Cell key={c.name} fill={c.color} />)}</Pie><Tooltip {...TOOLTIP} formatter={(v: any) => fmt(Number(v))} /></PieChart></ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-base font-bold tabular-nums">{fmtShort(d.costAnalysis.total)}</span><span className="text-[10px] text-muted-foreground">TOTAL</span></div>
                  </div>
                  <div className="space-y-1.5 mt-3">
                    {d.costAnalysis.categories.map(c => (
                      <div key={c.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />{c.name}</span>
                        <span className="tabular-nums font-medium">{fmt(c.amount)} · {c.pct}%</span>
                      </div>
                    ))}
                  </div>
                </>)}
              </CardContent>
            </Clickable>
          )}
        </div>

        {/* Invoice summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ov.isLoading ? [0, 1, 2].map(i => <Skel key={i} h={70} />) : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && ([
            { key: 'invoices', label: 'Paid Invoices', s: d.invoiceSummary.paid, color: '#3f9142', icon: ArrowUpRight, invert: false },
            { key: 'sold', label: 'Sold (Completed)', s: d.invoiceSummary.sold, color: '#675CB0', icon: DollarSign, invert: false },
            { key: 'invoices', label: 'Pending Invoices', s: d.invoiceSummary.pending, color: '#e0a106', icon: ArrowDownRight, invert: true },
          ].map(({ key, label, s, color, icon: Icon, invert }) => (
            <Clickable key={label} to={`/finance/analytics/${key}`} label={`${label}: ${fmt(s.amount)}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}22` }}><Icon className="h-5 w-5" style={{ color }} /></div>
                  <Delta pct={s.deltaPct} invert={invert} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{label}</p>
                <p className="text-2xl font-bold tabular-nums">{fmt(s.amount)}</p>
                <p className="text-xs text-muted-foreground">{s.count} invoice{s.count !== 1 ? 's' : ''}</p>
              </CardContent>
            </Clickable>
          )))}
        </div>

        {/* Profit trend + Financial health */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Clickable to="/finance/analytics/net-profit" label="Net profit trend">
                <CardContent className="p-5">
                  <p className="text-sm font-semibold mb-3">Net Profit Trend</p>
                  <ResponsiveContainer width="100%" height={200} aria-label="Net profit trend">
                    <LineChart data={d.profitTrend} margin={{ top: 0, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                      <Tooltip {...TOOLTIP} formatter={(v: any) => fmt(Number(v))} />
                      <Line type="monotone" dataKey="value" stroke="#675CB0" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Clickable>
            )}
          </div>
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Card><CardContent className="p-5">
              <p className="text-sm font-semibold mb-3">Financial Health</p>
              <div className="flex items-center gap-4">
                <div className="relative h-24 w-24 shrink-0">
                  <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ v: d.financialHealth.score }, { v: 100 - d.financialHealth.score }]} cx="50%" cy="50%" innerRadius={32} outerRadius={44} dataKey="v" startAngle={90} endAngle={-270} strokeWidth={0}><Cell fill={d.financialHealth.score >= 70 ? '#3f9142' : d.financialHealth.score >= 40 ? '#e0a106' : '#BF5046'} /><Cell fill="#27272a" /></Pie></PieChart></ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-lg font-bold tabular-nums">{d.financialHealth.score}</span></div>
                </div>
                <div>
                  <Badge className={d.financialHealth.score >= 70 ? 'bg-success/20 text-success' : d.financialHealth.score >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-destructive/20 text-destructive'}>{d.financialHealth.label}</Badge>
                  <p className="text-xs text-muted-foreground mt-2">Liquidity</p>
                  <p className="text-sm font-bold tabular-nums">{fmt(d.financialHealth.liquidity)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="rounded-lg bg-muted/30 p-2 text-center"><p className="text-sm font-bold tabular-nums">{d.financialHealth.runwayMonths}</p><p className="text-[10px] text-muted-foreground">Runway (mo)</p></div>
                <div className="rounded-lg bg-muted/30 p-2 text-center"><p className="text-sm font-bold tabular-nums">{d.financialHealth.debtRatio}%</p><p className="text-[10px] text-muted-foreground">Cost Ratio</p></div>
              </div>
            </CardContent></Card>
          )}
        </div>

        {/* Top items + Top commodities */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/finance/analytics/sold" label="Top selling items">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Top Selling Items</p>
                {!d.topItems.items.length ? <p className="py-8 text-center text-sm text-muted-foreground">No sales recorded</p> : (
                  <div className="space-y-3">
                    {d.topItems.items.map(it => (
                      <div key={it.id}>
                        <div className="flex items-center justify-between text-sm mb-1"><span className="font-medium truncate">{it.name}</span><span className="tabular-nums text-muted-foreground">{fmt(it.revenue)}</span></div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-[#3f9142]" style={{ width: `${it.pctOfMax}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Clickable>
          )}
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/finance/analytics/purchases" label="Top commodities purchased">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Top Commodities Purchased</p>
                {!d.topCommodities.items.length ? <p className="py-8 text-center text-sm text-muted-foreground">No purchases recorded</p> : (
                  <ResponsiveContainer width="100%" height={200} aria-label="Top commodities">
                    <BarChart data={d.topCommodities.items} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                      <Tooltip {...TOOLTIP} formatter={(v: any) => fmt(Number(v))} />
                      <Bar dataKey="spend" name="Spend" fill="#BF5046" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Clickable>
          )}
        </div>

        {/* Payroll + Contractors + Purchase methods */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {ov.isLoading ? <Skel h={150} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/finance/analytics/wages" label="Payroll and wages">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl bg-[#3B79A0]/15"><Users className="h-5 w-5 text-[#3B79A0]" /></div>
                  <Delta pct={d.payrollWages.deltaPct} invert />
                </div>
                <p className="text-xs text-muted-foreground mt-3">Payroll & Wages</p>
                <p className="text-2xl font-bold tabular-nums">{fmt(d.payrollWages.total)}</p>
                <p className="text-xs text-muted-foreground mb-1">{d.payrollWages.headcount} staff paid</p>
                <div className="h-10"><ResponsiveContainer width="100%" height="100%"><AreaChart data={d.payrollWages.series}><Area type="monotone" dataKey="value" stroke="#3B79A0" strokeWidth={1.5} fill="#3B79A0" fillOpacity={0.15} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>
              </CardContent>
            </Clickable>
          )}
          {ov.isLoading ? <Skel h={150} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/finance/analytics/contractors" label="Contractor payments">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl bg-[#BF5046]/15"><HardHat className="h-5 w-5 text-[#BF5046]" /></div>
                  <Delta pct={d.contractorPayments.deltaPct} invert />
                </div>
                <p className="text-xs text-muted-foreground mt-3">Contractor Payments</p>
                <p className="text-2xl font-bold tabular-nums">{fmt(d.contractorPayments.total)}</p>
                <p className="text-xs text-muted-foreground mb-1">{d.contractorPayments.count} payment{d.contractorPayments.count !== 1 ? 's' : ''}</p>
                <div className="h-10"><ResponsiveContainer width="100%" height="100%"><AreaChart data={d.contractorPayments.series}><Area type="monotone" dataKey="value" stroke="#BF5046" strokeWidth={1.5} fill="#BF5046" fillOpacity={0.15} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>
              </CardContent>
            </Clickable>
          )}
          {ov.isLoading ? <Skel h={150} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Card><CardContent className="p-5">
              <p className="text-sm font-semibold mb-3">Purchase Methods</p>
              {!d.purchaseMethods.total ? <p className="py-6 text-center text-sm text-muted-foreground">No purchases paid</p> : (
                <div className="space-y-3">
                  {d.purchaseMethods.methods.map(m => (
                    <div key={m.key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-2 text-muted-foreground">{m.key === 'card' ? <CreditCard className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}{m.key === 'card' ? 'Card / Bank' : 'Mobile money'}</span>
                        <span className="tabular-nums font-medium">{fmt(m.amount)} · {m.pct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.key === 'card' ? '#675CB0' : '#3f9142' }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
          )}
        </div>

        {/* Recent invoices */}
        {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
          <Card>
            <CardContent className="p-0">
              <div className="p-5 pb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Recent Invoices</p>
                <Button size="sm" variant="outline" onClick={() => goTo('/finance/analytics/invoices')} className="border border-input bg-background text-white hover:bg-accent h-7 px-3 text-xs">View all</Button>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.invoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{inv.date ? format(new Date(inv.date), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>{inv.customer}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(inv.amount)}</TableCell>
                      <TableCell><Badge className={inv.status === 'Paid' ? 'bg-success/20 text-success' : inv.status === 'Sold' ? 'bg-[#675CB0]/20 text-[#a39be0]' : 'bg-amber-500/20 text-amber-400'}>{inv.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {!d.invoices.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No invoices</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Transactions feed */}
        {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
          <Card>
            <CardContent className="p-0">
              <div className="p-5 pb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Recent Transactions</p>
                <Button size="sm" variant="outline" onClick={() => goTo('/finance/analytics/transactions')} className="border border-input bg-background text-white hover:bg-accent h-7 px-3 text-xs">View all</Button>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>When</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.transactions.map(t => (
                    <TableRow key={t.id}>
                      <TableCell><Badge className={t.direction === 'in' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>{t.type}</Badge></TableCell>
                      <TableCell className="font-medium truncate max-w-xs">{t.label}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{t.timestamp ? format(new Date(t.timestamp), 'MMM d, HH:mm') : '-'}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${t.direction === 'in' ? 'text-success' : 'text-destructive'}`}>{t.direction === 'in' ? '+' : '−'}{fmt(t.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {!d.transactions.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No transactions</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center">Figures recalculate automatically from live finance data · Finance Analytics v1.0</p>
      </div>
    </DashboardLayout>
  );
}
