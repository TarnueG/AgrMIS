import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users, UserCheck, UserCog, HardHat, TrendingUp, TrendingDown, RefreshCw,
  CheckCircle2, Circle, Clock, CalendarRange,
} from 'lucide-react';

interface Stat { value: number; trendPct: number; trendUp: boolean; spark: number[]; sub: string; }
interface Donut { name: string; count: number; pct: number; color: string; }
interface Overview {
  updatedAt: string; weekStart: string; todayIdx: number;
  kpis: { workforce: Stat; employees: Stat; dailyWorkers: Stat; contractors: Stat };
  performance: { labels: string[]; attendance: number[]; taskOnTime: number[]; todayIdx: number; todayRate: number };
  topPerformers: { id: string; name: string; jobTitle: string; ratePct: number; tasksDone: number; initials: string }[];
  tasks: { id: string; title: string; status: string; priority: string; due: string | null; assignee: string; progressPct: number }[];
  taskSummary: { total: number; completed: number };
  attendanceRate: { onTime: number; late: number; absent: number; presentPct: number; employees: { pct: number }; dailyWorkers: { pct: number } };
  jobPosition: Donut[];
  demographics: { employmentType: { caption: string; segments: Donut[] }; ageGroup: { caption: string; segments: Donut[] }; sector: { caption: string; segments: Donut[] } };
  schedule: { id: string; name: string; startDay: number; spanDays: number; progressPct: number; color: string; dueInWeek: boolean; men: number; equipment: number; crew: { id: string; initials: string; colorIndex: number }[] }[];
}

const TOOLTIP = { contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 12 }, itemStyle: { color: '#e5e7eb' }, labelStyle: { color: '#9ca3af', marginBottom: 4 } };
const CREW = ['#3f9142', '#675CB0', '#3B79A0', '#e0a106', '#BF5046', '#84cc16', '#8A6FE8', '#3DA5E0'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Skel({ h = 120 }: { h?: number }) { return <Card><CardContent className="p-5 animate-pulse"><div className="h-3 w-24 bg-muted rounded mb-3" /><div className="bg-muted rounded" style={{ height: h }} /></CardContent></Card>; }
function CardErr({ onRetry }: { onRetry: () => void }) { return <Card><CardContent className="p-5 flex items-center justify-between"><p className="text-sm text-destructive">Couldn't load</p><Button size="sm" variant="outline" onClick={onRetry} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></CardContent></Card>; }
function Delta({ pct, up }: { pct: number; up: boolean }) { return <span className={`inline-flex items-center text-xs font-medium ${up ? 'text-success' : 'text-destructive'}`}>{up ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}{pct}%</span>; }
function Spark({ data, color }: { data: number[]; color: string }) { const d = data.map((v, i) => ({ i, v })); return <div className="h-9"><ResponsiveContainer width="100%" height="100%"><LineChart data={d}><Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>; }
function Avatar({ initials, colorIndex, ring }: { initials: string; colorIndex: number; ring?: boolean }) { return <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${ring ? 'ring-2 ring-background' : ''}`} style={{ background: CREW[colorIndex % CREW.length] }}>{initials}</span>; }

function Clickable({ to, label, children, className }: { to: string; label: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  const go = () => { sessionStorage.setItem('hc-analytics-scroll', String(window.scrollY)); navigate(to); };
  return <Card className={`group cursor-pointer transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`} role="button" tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }} aria-label={label}>{children}</Card>;
}

function DonutCard({ title, caption, segments, to }: { title: string; caption: string; segments: Donut[]; to: string }) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  return (
    <Clickable to={to} label={`${title} breakdown`}>
      <CardContent className="p-5">
        <p className="text-sm font-semibold mb-3">{title}</p>
        {!total ? <p className="py-10 text-center text-sm text-muted-foreground">No data</p> : (<>
          <div className="relative">
            <ResponsiveContainer width="100%" height={150}><PieChart><Pie data={segments} cx="50%" cy="50%" innerRadius={46} outerRadius={64} dataKey="count" nameKey="name" strokeWidth={0} paddingAngle={2}>{segments.map((s) => <Cell key={s.name} fill={s.color} />)}</Pie><Tooltip {...TOOLTIP} /></PieChart></ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-sm font-bold">{caption}</span></div>
          </div>
          <div className="space-y-1 mt-3">
            {segments.slice(0, 5).map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground truncate"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />{s.name}</span>
                <span className="tabular-nums font-medium">{s.pct}%</span>
              </div>
            ))}
          </div>
        </>)}
      </CardContent>
    </Clickable>
  );
}

const taskStatusBadge = (s: string) => s === 'completed' ? 'bg-success/20 text-success' : s === 'in_progress' ? 'bg-[#3B79A0]/20 text-[#7cc0e8]' : 'bg-amber-500/20 text-amber-400';

export default function HumanCapitalAnalytics() {
  const ov = useQuery<Overview>({ queryKey: ['hc-analytics'], queryFn: () => api.get('/hr/analytics/overview'), refetchInterval: 30_000, refetchOnWindowFocus: true, staleTime: 15_000 });

  useEffect(() => { const s = sessionStorage.getItem('hc-analytics-scroll'); if (s) { window.scrollTo({ top: Number(s), behavior: 'instant' as ScrollBehavior }); sessionStorage.removeItem('hc-analytics-scroll'); } }, []);

  const d = ov.data;
  const KPIS = d ? [
    { key: 'workforce', label: 'Total Workforce', icon: Users, k: d.kpis.workforce, color: '#0E8E7F' },
    { key: 'employees', label: 'Employees', icon: UserCheck, k: d.kpis.employees, color: '#675CB0' },
    { key: 'daily-workers', label: 'Daily Workers', icon: UserCog, k: d.kpis.dailyWorkers, color: '#3B79A0' },
    { key: 'contractors', label: 'Contractors', icon: HardHat, k: d.kpis.contractors, color: '#e0a106' },
  ] : [];
  const perfData = d ? d.performance.labels.map((label, i) => ({ label, attendance: d.performance.attendance[i], taskOnTime: d.performance.taskOnTime[i] })) : [];
  const attDonut = d ? [{ n: 'On-time', v: d.attendanceRate.onTime, c: '#3f9142' }, { n: 'Late/Leave', v: d.attendanceRate.late, c: '#e0a106' }, { n: 'Absent', v: d.attendanceRate.absent, c: '#BF5046' }] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Human Capital Analytics</h1>
            <p className="text-muted-foreground text-sm">Real-time workforce, attendance &amp; performance overview</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-success" /></span>
            Live{d?.updatedAt && <span className="text-muted-foreground">· {format(new Date(d.updatedAt), 'HH:mm:ss')}</span>}{ov.isFetching && !ov.isLoading && <span className="text-muted-foreground">· updating…</span>}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ov.isLoading ? [0, 1, 2, 3].map(i => <Skel key={i} h={70} />) : ov.isError ? <CardErr onRetry={ov.refetch} /> : KPIS.map(({ key, label, icon: Icon, k, color }) => (
            <Clickable key={key} to={`/human-capital/analytics/${key}`} label={`${label}: ${k.value}`} className="border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}22` }}><Icon className="h-5 w-5" style={{ color }} /></div>
                  <Delta pct={k.trendPct} up={k.trendUp} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{label}</p>
                <p className="text-2xl font-bold tabular-nums">{k.value.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mb-1">{k.sub}</p>
                <Spark data={k.spark} color={color} />
              </CardContent>
            </Clickable>
          ))}
        </div>

        {/* Performance + Task completion */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            {ov.isLoading ? <Skel h={240} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
              <Clickable to="/human-capital/analytics/performance" label="Worker performance rate">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div><p className="text-sm font-semibold">Worker Performance Rate</p><p className="text-xs text-muted-foreground">Attendance vs on-time task completion · this week</p></div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded bg-[#0E8E7F]" />Attendance</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded bg-[#e0a106]" style={{ borderTop: '1px dashed' }} />On-time tasks</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={230} aria-label="Performance rate">
                    <AreaChart data={perfData} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
                      <defs><linearGradient id="hcperf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0E8E7F" stopOpacity={0.3} /><stop offset="100%" stopColor="#0E8E7F" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip {...TOOLTIP} formatter={(v: any) => `${v}%`} />
                      {d.performance.todayIdx >= 0 && <ReferenceLine x={DAYS[d.performance.todayIdx]} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: 'Today', fill: '#9ca3af', fontSize: 10, position: 'top' }} />}
                      <Area type="monotone" dataKey="attendance" stroke="#0E8E7F" strokeWidth={2} fill="url(#hcperf)" />
                      <Line type="monotone" dataKey="taskOnTime" stroke="#e0a106" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: '#e0a106' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Clickable>
            )}
          </div>
          {ov.isLoading ? <Skel h={240} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/human-capital/analytics/tasks" label="Task completion">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">Task Completion</p>
                  <Badge className="bg-success/20 text-success">{d.taskSummary.completed}/{d.taskSummary.total}</Badge>
                </div>
                {!d.tasks.length ? <p className="py-8 text-center text-sm text-muted-foreground">No tasks assigned</p> : (
                  <div className="space-y-3">
                    {d.tasks.map(t => (
                      <div key={t.id} className="flex items-center gap-3">
                        {t.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : t.status === 'in_progress' ? <Clock className="h-4 w-4 text-[#3B79A0] shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${t.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</p>
                          <p className="text-[11px] text-muted-foreground">{t.due ? format(new Date(t.due), 'MMM d') : 'No due date'} · {t.assignee}</p>
                        </div>
                        <div className="relative h-9 w-9 shrink-0">
                          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ v: t.progressPct }, { v: 100 - t.progressPct }]} cx="50%" cy="50%" innerRadius={12} outerRadius={17} dataKey="v" startAngle={90} endAngle={-270} strokeWidth={0}><Cell fill="#0E8E7F" /><Cell fill="#27272a" /></Pie></PieChart></ResponsiveContainer>
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums">{t.progressPct}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Clickable>
          )}
        </div>

        {/* Top performers + Attendance + Job position */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/human-capital/analytics/top-performers" label="Top performers">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Top Performers</p>
                {!d.topPerformers.length ? <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p> : (
                  <div className="space-y-3">
                    {d.topPerformers.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3">
                        <Avatar initials={p.initials} colorIndex={i} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{p.jobTitle}</p>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1"><div className="h-full rounded-full" style={{ width: `${p.ratePct}%`, background: CREW[i % CREW.length] }} /></div>
                        </div>
                        <span className="text-sm font-bold tabular-nums">{p.tasksDone} {p.tasksDone === 1 ? 'task' : 'tasks'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Clickable>
          )}
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/human-capital/analytics/attendance" label="Attendance rate">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Attendance Rate</p>
                {!(d.attendanceRate.onTime + d.attendanceRate.late + d.attendanceRate.absent) ? <p className="py-8 text-center text-sm text-muted-foreground">No attendance logged</p> : (<>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={150}><PieChart><Pie data={attDonut} cx="50%" cy="50%" innerRadius={46} outerRadius={64} dataKey="v" nameKey="n" strokeWidth={0} paddingAngle={2}>{attDonut.map(s => <Cell key={s.n} fill={s.c} />)}</Pie><Tooltip {...TOOLTIP} /></PieChart></ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-xl font-bold tabular-nums">{d.attendanceRate.presentPct}%</span><span className="text-[10px] text-muted-foreground">PRESENT</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-lg bg-muted/30 p-2"><p className="text-[10px] text-muted-foreground">Employees</p><div className="flex items-center justify-between"><span className="text-sm font-bold tabular-nums">{d.attendanceRate.employees.pct}%</span></div><div className="h-1 w-full rounded-full bg-muted overflow-hidden mt-1"><div className="h-full rounded-full bg-[#675CB0]" style={{ width: `${d.attendanceRate.employees.pct}%` }} /></div></div>
                    <div className="rounded-lg bg-muted/30 p-2"><p className="text-[10px] text-muted-foreground">Daily Workers</p><div className="flex items-center justify-between"><span className="text-sm font-bold tabular-nums">{d.attendanceRate.dailyWorkers.pct}%</span></div><div className="h-1 w-full rounded-full bg-muted overflow-hidden mt-1"><div className="h-full rounded-full bg-[#3B79A0]" style={{ width: `${d.attendanceRate.dailyWorkers.pct}%` }} /></div></div>
                  </div>
                </>)}
              </CardContent>
            </Clickable>
          )}
          {ov.isLoading ? <Skel h={220} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
            <Clickable to="/human-capital/analytics/job-position" label="Job positions">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3">Job Position</p>
                {!d.jobPosition.length ? <p className="py-8 text-center text-sm text-muted-foreground">No roles set</p> : (
                  <div className="flex items-center gap-2">
                    <ResponsiveContainer width="55%" height={150}><PieChart><Pie data={d.jobPosition} cx="50%" cy="50%" outerRadius={64} dataKey="count" nameKey="name" strokeWidth={0}>{d.jobPosition.map(s => <Cell key={s.name} fill={s.color} />)}</Pie><Tooltip {...TOOLTIP} /></PieChart></ResponsiveContainer>
                    <div className="flex-1 space-y-1">
                      {d.jobPosition.map(s => (
                        <div key={s.name} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-muted-foreground truncate"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />{s.name}</span>
                          <span className="tabular-nums font-medium">{s.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Clickable>
          )}
        </div>

        {/* Demographics donuts */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {ov.isLoading ? [0, 1, 2].map(i => <Skel key={i} h={200} />) : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (<>
            <DonutCard title="Employment Type" caption={d.demographics.employmentType.caption} segments={d.demographics.employmentType.segments} to="/human-capital/analytics/demographics" />
            <DonutCard title="Age Group" caption={d.demographics.ageGroup.caption} segments={d.demographics.ageGroup.segments} to="/human-capital/analytics/demographics" />
            <DonutCard title="Sector" caption={d.demographics.sector.caption} segments={d.demographics.sector.segments} to="/human-capital/analytics/demographics" />
          </>)}
        </div>

        {/* Schedule / Gantt */}
        {ov.isLoading ? <Skel h={240} /> : ov.isError ? <CardErr onRetry={ov.refetch} /> : d && (
          <Clickable to="/human-capital/analytics/schedule" label="Task timeline">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Time Schedule — Task Timeline</p></div>
                <p className="text-xs text-muted-foreground">Week of {format(new Date(d.weekStart), 'MMM d')}</p>
              </div>
              {!d.schedule.length ? <p className="py-8 text-center text-sm text-muted-foreground">No scheduled tasks this week</p> : (
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-[160px_repeat(7,1fr)] gap-0 border-b border-border pb-2 mb-2">
                      <span className="text-[11px] text-muted-foreground">Task</span>
                      {DAYS.map((day, i) => <span key={day} className={`text-[11px] text-center ${i === d.todayIdx ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{day}</span>)}
                    </div>
                    <div className="space-y-2">
                      {d.schedule.map(t => (
                        <div key={t.id} className="grid grid-cols-[160px_repeat(7,1fr)] gap-0 items-center">
                          <div className="pr-2 min-w-0">
                            <p className="text-xs font-medium truncate">{t.name}</p>
                            <p className="text-[10px] text-muted-foreground">{t.men} {t.men === 1 ? 'man' : 'men'} · {t.equipment} equip</p>
                          </div>
                          <div className="col-span-7 relative h-7">
                            {/* faint track */}
                            <div className="absolute inset-y-1 rounded-md bg-muted/40" style={{ left: `${(t.startDay / 7) * 100}%`, width: `${(t.spanDays / 7) * 100}%` }} />
                            {/* progress fill */}
                            <div className="absolute inset-y-1 rounded-md flex items-center px-2 gap-1" style={{ left: `${(t.startDay / 7) * 100}%`, width: `${(t.spanDays / 7) * 100}%`, background: `${t.color}33`, borderLeft: `3px solid ${t.color}` }}>
                              <div className="flex -space-x-1.5">{t.crew.map(c => <Avatar key={c.id} initials={c.initials} colorIndex={c.colorIndex} ring />)}</div>
                              <span className="text-[10px] font-medium ml-auto" style={{ color: t.color }}>{t.spanDays}d</span>
                            </div>
                            {/* today line */}
                            {d.todayIdx >= 0 && <div className="absolute inset-y-0 border-l border-dashed border-muted-foreground/60" style={{ left: `${((d.todayIdx + 0.5) / 7) * 100}%` }} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Clickable>
        )}

        <p className="text-xs text-muted-foreground text-center">Aggregated from live HR records · counts &amp; rates only · Human Capital Analytics v1.0</p>
      </div>
    </DashboardLayout>
  );
}
