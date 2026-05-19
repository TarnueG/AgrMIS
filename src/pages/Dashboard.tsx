import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  ClipboardCheck,
  Coins,
  Factory,
  FileBarChart2,
  HardHat,
  PackageCheck,
  ReceiptText,
  ShieldAlert,
  ShoppingCart,
  Tractor,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { isCustomerRole, normalizeRole } from '@/lib/roles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type DashboardOverview = {
  summary: {
    operationalHealth: number;
    todaysRevenue: number;
    todaysExpenses: number;
    netPosition: number;
    activeOrders: number;
    productionInProgress: number;
    workersPresent: number;
    assetsAvailable: number;
    criticalAlerts: number;
    pendingApprovals: number;
  };
  today: {
    productionScheduledToday: number;
    deliveriesDueToday: number;
    procurementReceiptsExpectedToday: number;
    workersAbsentToday: number;
    maintenanceDueToday: number;
    paymentsDueToday: number;
  };
  alerts: Array<{
    severity: 'info' | 'warning' | 'critical' | 'security' | string;
    subsystem: string;
    issue: string;
    recommendedAction: string;
    link: string;
  }>;
  flow: Array<{
    key: string;
    label: string;
    value: number;
    status: string;
    bottleneck: string;
  }>;
  activity: Array<{
    id: string;
    actor: string;
    action: string;
    module: string;
    time: string;
    severity: string;
    description: string;
  }>;
  charts: {
    revenueExpenses: Array<{ month: string; income: number; expenses: number; netProfit: number }>;
    productionOutputTrend: Array<{ week: string; output: number }>;
    ordersByStatus: Array<{ status: string; count: number }>;
    laborAttendanceWeek: Array<{ day: string; present: number; absent: number }>;
    maintenanceDueTrend: Array<{ week: string; due: number }>;
  };
};

const PIE_COLORS = ['#22c55e', '#38bdf8', '#f59e0b', '#f97316', '#e879f9', '#94a3b8'];

function currency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function healthTone(score: number) {
  if (score >= 85) return 'text-emerald-300';
  if (score >= 70) return 'text-cyan-300';
  if (score >= 55) return 'text-amber-300';
  return 'text-rose-300';
}

function severityBadgeClass(severity: string) {
  if (severity === 'security') return 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200';
  if (severity === 'critical') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (severity === 'warning') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'default',
  restricted = false,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: any;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  restricted?: boolean;
}) {
  const styles = {
    default: 'border-slate-800 bg-slate-950/85 text-white',
    success: 'border-emerald-500/20 bg-emerald-500/10 text-white',
    warning: 'border-amber-500/20 bg-amber-500/10 text-white',
    danger: 'border-rose-500/20 bg-rose-500/10 text-white',
    info: 'border-cyan-500/20 bg-cyan-500/10 text-white',
  };

  return (
    <Card className={cn('overflow-hidden', styles[tone], restricted && 'opacity-55')}>
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{restricted ? 'Restricted' : value}</p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-2 text-slate-200">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { canView } = usePermissions();

  if (isCustomerRole(user?.role)) {
    return <Navigate to="/customer" replace />;
  }

  return (
    <DashboardLayout>
      <DashboardContent
        role={normalizeRole(user?.role)}
        canView={canView}
      />
    </DashboardLayout>
  );
}

function DashboardContent({
  role,
  canView,
}: {
  role: string;
  canView: (subsystem: string) => boolean;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['amis-dashboard-overview'],
    queryFn: () => api.get<DashboardOverview>('/dashboard/overview'),
  });

  const visibility = useMemo(() => ({
    finance: canView('finance'),
    sales: canView('sales_order_points') || canView('crm') || canView('marketing'),
    procurement: canView('procurement'),
    inventory: canView('inventory'),
    production: canView('production'),
    hr: canView('human_capital'),
    assets: canView('machinery') || canView('land_parcels'),
    reports: canView('reports'),
    settings: canView('settings'),
    everything: role === 'super_admin' || role === 'admin',
  }), [canView, role]);

  const summaryCards = [
    {
      title: 'Farm Operational Health',
      value: `${data?.summary.operationalHealth ?? 0}/100`,
      detail: 'Weighted from live operational and governance risks.',
      icon: Activity,
      tone: data && data.summary.operationalHealth < 60 ? 'danger' : data && data.summary.operationalHealth < 75 ? 'warning' : 'success',
      restricted: false,
    },
    {
      title: 'Today’s Revenue',
      value: currency(data?.summary.todaysRevenue ?? 0),
      detail: 'Income booked today across sales and services.',
      icon: TrendingUp,
      tone: 'success',
      restricted: !visibility.finance,
    },
    {
      title: 'Today’s Expenses',
      value: currency(data?.summary.todaysExpenses ?? 0),
      detail: 'Expenses booked today across payroll, procurement, and operations.',
      icon: TrendingDown,
      tone: 'warning',
      restricted: !visibility.finance,
    },
    {
      title: 'Net Position',
      value: currency(data?.summary.netPosition ?? 0),
      detail: 'Revenue minus expense movement for today.',
      icon: Wallet,
      tone: (data?.summary.netPosition ?? 0) >= 0 ? 'info' : 'danger',
      restricted: !visibility.finance,
    },
    {
      title: 'Active Orders',
      value: data?.summary.activeOrders ?? 0,
      detail: 'Orders still moving through production, dispatch, or closure.',
      icon: ShoppingCart,
      tone: 'info',
      restricted: !visibility.sales,
    },
    {
      title: 'Production In Progress',
      value: data?.summary.productionInProgress ?? 0,
      detail: 'Open or currently running production batches.',
      icon: Factory,
      tone: 'info',
      restricted: !visibility.production,
    },
    {
      title: 'Workers Present',
      value: data?.summary.workersPresent ?? 0,
      detail: 'Attendance captured for today.',
      icon: Users,
      tone: 'default',
      restricted: !visibility.hr,
    },
    {
      title: 'Assets Available',
      value: data?.summary.assetsAvailable ?? 0,
      detail: 'Operational assets ready for deployment.',
      icon: Tractor,
      tone: 'default',
      restricted: !visibility.assets,
    },
    {
      title: 'Critical Alerts',
      value: data?.summary.criticalAlerts ?? 0,
      detail: 'High-severity issues requiring intervention now.',
      icon: ShieldAlert,
      tone: 'danger',
      restricted: false,
    },
    {
      title: 'Pending Approvals',
      value: data?.summary.pendingApprovals ?? 0,
      detail: 'Items waiting for governance or workflow signoff.',
      icon: ClipboardCheck,
      tone: 'warning',
      restricted: !(visibility.procurement || visibility.hr || visibility.everything),
    },
  ];

  const todayItems = [
    { title: 'Production batches scheduled today', value: data?.today.productionScheduledToday ?? 0, icon: Factory, restricted: !visibility.production },
    { title: 'Deliveries due today', value: data?.today.deliveriesDueToday ?? 0, icon: PackageCheck, restricted: !visibility.sales },
    { title: 'Procurement receipts expected today', value: data?.today.procurementReceiptsExpectedToday ?? 0, icon: ReceiptText, restricted: !visibility.procurement },
    { title: 'Workers absent today', value: data?.today.workersAbsentToday ?? 0, icon: HardHat, restricted: !visibility.hr },
    { title: 'Maintenance due today', value: data?.today.maintenanceDueToday ?? 0, icon: Wrench, restricted: !visibility.assets },
    { title: 'Payments due today', value: data?.today.paymentsDueToday ?? 0, icon: Coins, restricted: !visibility.finance },
  ];

  const quickActions = [
    { title: 'Create Sales Order', path: '/orders', icon: ShoppingCart, enabled: visibility.sales },
    { title: 'Add Purchase Request', path: '/procurement', icon: BriefcaseBusiness, enabled: visibility.procurement },
    { title: 'Receive Stock', path: '/inventory', icon: PackageCheck, enabled: visibility.inventory },
    { title: 'Create Production Batch', path: '/production', icon: Factory, enabled: visibility.production },
    { title: 'Assign Labor Task', path: '/employees', icon: Users, enabled: visibility.hr },
    { title: 'Record Maintenance', path: '/machinery', icon: Wrench, enabled: visibility.assets },
    { title: 'View Reports', path: '/reports', icon: FileBarChart2, enabled: visibility.reports || visibility.finance },
  ].filter((action) => action.enabled);

  return (
    <div className="space-y-6 animate-fade-in">
      {isError && (
        <Card className="border-rose-500/30 bg-rose-500/10 text-white">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-300" />
              <div>
                <p className="font-medium">Dashboard data could not be loaded.</p>
                <p className="text-sm text-rose-100/80">{error instanceof Error ? error.message : 'The dashboard API request failed.'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="overflow-hidden rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.15),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.15),_transparent_24%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.98))] p-6 shadow-[0_32px_90px_rgba(2,6,23,0.42)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-100">Executive Command Center</Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">AMIS Dashboard</h1>
              <p className="text-sm text-slate-300">Live operational overview across production, workforce, assets, sales, finance, and risk.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/55 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Operational Health</p>
            <p className={cn('mt-2 text-3xl font-semibold', healthTone(data?.summary.operationalHealth ?? 0))}>
              {isLoading ? '...' : `${data?.summary.operationalHealth ?? 0}/100`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <SummaryCard key={card.title} {...card} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <SectionHeader title="Today’s Operations Board" subtitle="What is happening today across the farm right now." />
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {todayItems.map((item) => (
              <div key={item.title} className={cn('rounded-2xl border border-slate-800 bg-slate-900/70 p-4', item.restricted && 'opacity-55')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-300">{item.title}</p>
                    <p className="mt-2 text-2xl font-semibold">{item.restricted ? 'Restricted' : item.value}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2 text-cyan-200">
                    <item.icon className="h-4 w-4" />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <SectionHeader title="Quick Actions" subtitle="Fast route to the next operational decision." />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link key={action.path} to={action.path}>
                <Button className="h-auto w-full flex-col gap-2 border border-slate-800 bg-slate-900 py-4 text-white hover:bg-slate-800">
                  <action.icon className="h-5 w-5" />
                  <span className="text-xs">{action.title}</span>
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <SectionHeader title="Priority Alerts" subtitle="The most important operational risks and recommended responses." />
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.alerts ?? []).map((alert, index) => (
              <div key={`${alert.issue}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn('border uppercase', severityBadgeClass(alert.severity))}>{alert.severity}</Badge>
                      <Badge className="border-slate-700 bg-slate-950 text-slate-300">{alert.subsystem}</Badge>
                    </div>
                    <p className="text-sm font-medium text-white">{alert.issue}</p>
                    <p className="text-sm text-slate-400">{alert.recommendedAction}</p>
                  </div>
                  <Link to={alert.link}>
                    <Button variant="outline" className="border-slate-700 bg-slate-950 text-white hover:bg-slate-800">
                      Open
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <SectionHeader title="Recent Activity Feed" subtitle="Latest cross-module actions from the audit trail." />
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.activity ?? []).map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-white">
                      <span className="font-medium">{item.actor}</span> · {item.action}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                    <p className="mt-2 text-xs text-slate-500">{item.module} · {formatTime(item.time)}</p>
                  </div>
                  <Badge className={cn('border uppercase', severityBadgeClass(item.severity))}>{item.severity}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-950 text-white">
        <CardHeader>
          <SectionHeader title="Cross-Module Flow" subtitle="Where work is moving and where it is getting stuck." />
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-5">
          {(data?.flow ?? []).map((step, index) => (
            <div key={step.key} className="relative rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              {index < (data?.flow.length ?? 0) - 1 && (
                <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 xl:block">
                  <ArrowRight className="h-5 w-5 text-slate-600" />
                </div>
              )}
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{step.label}</p>
              <p className="mt-3 text-2xl font-semibold">{step.key === 'finance' ? compactCurrency(step.value) : step.value}</p>
              <p className="mt-1 text-sm text-cyan-200">{step.status}</p>
              <p className="mt-3 text-sm text-slate-400">{step.bottleneck}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle>Revenue vs Expenses</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.charts.revenueExpenses ?? []}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Area type="monotone" dataKey="income" stroke="#22c55e" fill="#22c55e33" />
                <Area type="monotone" dataKey="expenses" stroke="#f97316" fill="#f9731633" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle>Production Output Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.charts.productionOutputTrend ?? []}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="week" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="output" fill="#38bdf8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle>Orders by Status</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.charts.ordersByStatus ?? []} dataKey="count" nameKey="status" innerRadius={55} outerRadius={90}>
                  {(data?.charts.ordersByStatus ?? []).map((entry, index) => (
                    <Cell key={entry.status} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle>Labor Attendance This Week</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.charts.laborAttendanceWeek ?? []}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="present" fill="#22c55e" radius={[8, 8, 0, 0]} />
                <Bar dataKey="absent" fill="#fb7185" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950 text-white xl:col-span-2">
          <CardHeader>
            <CardTitle>Maintenance Due Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.charts.maintenanceDueTrend ?? []}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="week" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="due" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b' }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
