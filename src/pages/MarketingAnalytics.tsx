<<<<<<< HEAD
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Bell, CheckCircle2, ChevronRight, Clock3, RefreshCw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  createMarketingAnalyticsStream,
  marketingAnalyticsApi,
  type IncomeReport,
  type MarketingLiveState,
  type MarketingSummary,
  type OrderCounts,
  type OrderSummary,
  type RevenueBreakdown,
  type SalesReport,
  type SalesVsPurchase,
  type TopProducts,
} from '@/lib/marketingAnalytics';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';

type WidgetState<T> = { data?: T; loading: boolean; error: string | null; refreshing?: boolean };

const colors = {
  ink: '#181410',
  canvas: '#F4EEE2',
  paper: '#FFFCF6',
  line: '#E7DECC',
  muted: '#857c6c',
  tangerine: '#E2592A',
  emerald: '#1F7A5E',
  gold: '#C99A1E',
  violet: '#5C4B8C',
  rose: '#C0445A',
  tangerineSoft: '#F6D9C9',
  emeraldSoft: '#CDE6DC',
  goldSoft: '#F0E1B4',
  violetSoft: '#DAD3EC',
};

const chartTooltip = {
  contentStyle: {
    backgroundColor: '#231d17',
    borderRadius: 16,
    border: 'none',
    color: '#FFFCF6',
    boxShadow: '0 16px 36px rgba(0,0,0,0.18)',
  },
  labelStyle: { color: '#FFFCF6' },
  itemStyle: { color: '#FFFCF6' },
};

function widget<T>(): WidgetState<T> {
  return { loading: true, error: null };
}

function useAnimatedValue(value: number) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    let frame = 0;
    const start = display;
    const end = value;
    const begin = performance.now();
    const duration = 450;
    const tick = (time: number) => {
      const progress = Math.min((time - begin) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return display;
}

function fmtMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function fmtCompactMoney(value: number) {
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return fmtMoney(value);
}

function rangeButtonClass(active: boolean) {
  return cn(
    'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
    active ? 'text-white' : 'text-[#857c6c]',
  );
}

function CardFrame({
  title,
  subtitle,
  clickable,
  onClick,
  loading,
  error,
  onRetry,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  clickable?: boolean;
  onClick?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-[18px] border p-5 shadow-[0_10px_30px_rgba(24,20,16,0.05)]',
        clickable && 'cursor-pointer transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[0_16px_32px_rgba(24,20,16,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E2592A]',
        className,
      )}
      style={{ backgroundColor: colors.paper, borderColor: colors.line }}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      } : undefined}
      aria-label={clickable ? `${title} details` : undefined}
    >
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-4 w-36 rounded-full bg-[#efe6d6]" />
          <Skeleton className="h-10 w-52 rounded-2xl bg-[#efe6d6]" />
          <Skeleton className="h-52 w-full rounded-[14px] bg-[#efe6d6]" />
        </div>
      ) : error ? (
        <div className="flex min-h-52 flex-col justify-between">
          <div>
            <p className="font-semibold" style={{ color: colors.ink }}>{title}</p>
            {subtitle ? <p className="mt-1 text-sm" style={{ color: colors.muted }}>{subtitle}</p> : null}
            <p className="mt-8 text-sm text-destructive">Couldn't load this widget.</p>
          </div>
          <Button variant="ghost" size="sm" className="w-fit rounded-full" onClick={(event) => { event.stopPropagation(); onRetry?.(); }}>
            Retry
          </Button>
        </div>
      ) : children}
    </section>
  );
}

function SparkPulse() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1F7A5E] opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#1F7A5E]" />
    </span>
  );
}

export default function MarketingAnalytics() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = useMemo(() => user?.fullName?.split(' ')[0] ?? 'there', [user?.fullName]);

  const [liveState, setLiveState] = useState<MarketingLiveState>('reconnecting');
  const [summary, setSummary] = useState<WidgetState<MarketingSummary>>(widget());
  const [income, setIncome] = useState<WidgetState<IncomeReport>>(widget());
  const [revenue, setRevenue] = useState<WidgetState<RevenueBreakdown>>(widget());
  const [orderCounts, setOrderCounts] = useState<WidgetState<OrderCounts>>(widget());
  const [sales, setSales] = useState<WidgetState<SalesReport>>(widget());
  const [orderSummary, setOrderSummary] = useState<WidgetState<OrderSummary>>(widget());
  const [salesVsPurchase, setSalesVsPurchase] = useState<WidgetState<SalesVsPurchase>>(widget());
  const [topProducts, setTopProducts] = useState<WidgetState<TopProducts>>(widget());
  const [incomeRange, setIncomeRange] = useState<'monthly' | 'weekly' | 'daily'>('monthly');
  const [salesRange, setSalesRange] = useState<'month' | 'weekly' | 'daily'>('month');

  const load = async <T,>(setter: Dispatch<SetStateAction<WidgetState<T>>>, fetcher: (signal?: AbortSignal) => Promise<T>, signal: AbortSignal, refresh = false) => {
    setter((current) => ({ ...current, loading: !refresh, refreshing: refresh, error: null }));
    try {
      const data = await fetcher(signal);
      setter({ data, loading: false, refreshing: false, error: null });
    } catch (error) {
      if (signal.aborted) return;
      setter((current) => ({ ...current, loading: false, refreshing: false, error: error instanceof Error ? error.message : 'Request failed' }));
    }
  };

  useEffect(() => {
    const controllers = Array.from({ length: 8 }, () => new AbortController());
    void load(setSummary, marketingAnalyticsApi.getSummary, controllers[0].signal);
    void load(setIncome, (signal) => marketingAnalyticsApi.getIncome(incomeRange, signal), controllers[1].signal);
    void load(setRevenue, marketingAnalyticsApi.getRevenueBreakdown, controllers[2].signal);
    void load(setOrderCounts, marketingAnalyticsApi.getOrderCounts, controllers[3].signal);
    void load(setSales, (signal) => marketingAnalyticsApi.getSales(salesRange, signal), controllers[4].signal);
    void load(setOrderSummary, marketingAnalyticsApi.getOrderSummary, controllers[5].signal);
    void load(setSalesVsPurchase, marketingAnalyticsApi.getSalesVsPurchase, controllers[6].signal);
    void load(setTopProducts, marketingAnalyticsApi.getTopProducts, controllers[7].signal);

    const unsubscribe = createMarketingAnalyticsStream({
      onStateChange: setLiveState,
      onSnapshot: (snapshot) => {
        if (snapshot.summary) setSummary((current) => ({ ...current, data: snapshot.summary, loading: false, refreshing: false, error: null }));
        if (snapshot.revenueBreakdown) setRevenue((current) => ({ ...current, data: { total: snapshot.revenueBreakdown.reduce((sum, item) => sum + item.value, 0), items: snapshot.revenueBreakdown }, loading: false, refreshing: false, error: null }));
        if (snapshot.topProducts) setTopProducts((current) => ({ ...current, data: { items: snapshot.topProducts }, loading: false, refreshing: false, error: null }));
        if (snapshot.salesVsPurchase) setSalesVsPurchase((current) => ({ ...current, data: { series: snapshot.salesVsPurchase }, loading: false, refreshing: false, error: null }));
      },
    });

    const saved = sessionStorage.getItem('marketing-analytics-scroll');
    if (saved) {
      window.scrollTo({ top: Number(saved), behavior: 'auto' });
      sessionStorage.removeItem('marketing-analytics-scroll');
    }

    return () => {
      controllers.forEach((controller) => controller.abort());
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(setIncome, (signal) => marketingAnalyticsApi.getIncome(incomeRange, signal), controller.signal, true);
    return () => controller.abort();
  }, [incomeRange]);

  useEffect(() => {
    const controller = new AbortController();
    void load(setSales, (signal) => marketingAnalyticsApi.getSales(salesRange, signal), controller.signal, true);
    return () => controller.abort();
  }, [salesRange]);

  const goTo = (path: string) => {
    sessionStorage.setItem('marketing-analytics-scroll', String(window.scrollY));
    navigate(path);
  };

  const totalIncomeDisplay = useAnimatedValue(income.data?.total ?? 0);
  const totalRevenueDisplay = useAnimatedValue(revenue.data?.total ?? 0);

  const liveLabel = liveState === 'connected' ? 'Live' : liveState === 'reconnecting' ? 'Syncing' : 'Offline';
  const liveColor = liveState === 'connected' ? '#1F7A5E' : liveState === 'reconnecting' ? '#C99A1E' : '#857c6c';

  return (
    <DashboardLayout>
      <div
        className="space-y-6 rounded-[28px] p-5 md:p-8"
        style={
          {
            backgroundColor: colors.canvas,
            color: colors.ink,
            ['--mk-ink' as string]: colors.ink,
            ['--mk-canvas' as string]: colors.canvas,
            ['--mk-paper' as string]: colors.paper,
            ['--mk-line' as string]: colors.line,
            ['--mk-muted' as string]: colors.muted,
        } as CSSProperties
        }
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[36px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>Welcome back, {firstName}</h1>
              <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold" style={{ backgroundColor: `${liveColor}22`, color: liveColor }}>
                <SparkPulse />
                {liveLabel}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>
              Data syncing · updated {summary.data?.updatedRelative ?? 'just now'}
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: colors.muted }} />
              <Input className="h-11 rounded-2xl border pl-10" style={{ backgroundColor: colors.paper, borderColor: colors.line }} placeholder="Search analytics" />
            </div>
            <button className="relative flex h-11 w-11 items-center justify-center rounded-2xl border" style={{ backgroundColor: colors.paper, borderColor: colors.line }}>
              <Bell className="h-5 w-5" />
              <span className="absolute right-3 top-3 h-2 w-2 rounded-full" style={{ backgroundColor: colors.tangerine }} />
            </button>
            <Avatar className="h-11 w-11 rounded-2xl">
              <AvatarFallback className="rounded-2xl text-sm font-bold" style={{ backgroundColor: colors.ink, color: colors.paper }}>
                {user?.fullName?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() ?? 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <CardFrame title="Total Income Generated" subtitle="across the last 12 months" loading={income.loading} error={income.error} onRetry={() => {
            const controller = new AbortController();
            void load(setIncome, (signal) => marketingAnalyticsApi.getIncome(incomeRange, signal), controller.signal);
          }} className="xl:col-span-8">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>Total Income Generated</p>
                  <p className="mt-2 text-[42px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>{fmtMoney(totalIncomeDisplay)}</p>
                  <p className="mt-2 text-sm" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>{income.data?.subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(['monthly', 'weekly', 'daily'] as const).map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => setIncomeRange(range)}
                      className={rangeButtonClass(incomeRange === range)}
                      style={{ backgroundColor: incomeRange === range ? colors.ink : 'transparent' }}
                    >
                      {range[0].toUpperCase() + range.slice(1)}
                    </button>
                  ))}
                  <span className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: colors.tangerineSoft, color: colors.tangerine }}>
                    ▲ {income.data?.growthPct?.toFixed(1) ?? '0.0'}%
                  </span>
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={income.data?.series ?? []} margin={{ left: -12, right: 10, top: 8 }}>
                    <CartesianGrid stroke={colors.line} vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: colors.muted, fontSize: 12, fontFamily: 'Hanken Grotesk' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: colors.muted, fontSize: 12, fontFamily: 'Hanken Grotesk' }} />
                    <Tooltip {...chartTooltip} formatter={(value: number) => fmtCompactMoney(value)} />
                    <Bar dataKey="income" radius={[12, 12, 0, 0]} fill={colors.tangerine} />
                    <Line type="monotone" dataKey="forecast" stroke={colors.gold} strokeWidth={2} strokeDasharray="6 6" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-5 text-sm font-medium" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.tangerine }} />Income</span>
                <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: colors.gold, borderTop: `2px dashed ${colors.gold}` }} />Forecast</span>
              </div>
            </div>
          </CardFrame>

          <CardFrame title="Total Revenue Summary" loading={revenue.loading} error={revenue.error} onRetry={() => {
            const controller = new AbortController();
            void load(setRevenue, marketingAnalyticsApi.getRevenueBreakdown, controller.signal);
          }} className="xl:col-span-4">
            <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[1fr_1.1fr] xl:grid-cols-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>Total Revenue Summary</p>
                  <p className="mt-2 text-[30px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>{fmtMoney(totalRevenueDisplay)}</p>
                </div>
              </div>
              <div className="grid items-center gap-4 md:grid-cols-[180px_1fr] xl:grid-cols-[160px_1fr]">
                <div className="relative h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={revenue.data?.items ?? []} dataKey="value" innerRadius={52} outerRadius={76} strokeWidth={0} paddingAngle={2}>
                        {(revenue.data?.items ?? []).map((item) => <Cell key={item.key} fill={item.color} />)}
                      </Pie>
                      <Tooltip {...chartTooltip} formatter={(value: number) => fmtCompactMoney(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-2xl font-extrabold" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>{fmtCompactMoney(revenue.data?.total ?? 0)}</div>
                    <div className="text-xs font-semibold" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>TOTAL</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {revenue.data?.items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between rounded-2xl px-3 py-2" style={{ backgroundColor: `${item.color}18` }}>
                      <div className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: '"Hanken Grotesk", sans-serif' }}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.label}
                      </div>
                      <span className="text-sm font-bold">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardFrame>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            { key: 'pending', title: 'Pending Orders', subtitle: 'awaiting approval', icon: Clock3, tint: colors.goldSoft, fg: colors.gold, value: orderCounts.data?.pending.value ?? 0, trend: orderCounts.data?.pending.trendPct ?? 0 },
            { key: 'in_process', title: 'In-Process Orders', subtitle: 'being fulfilled', icon: RefreshCw, tint: colors.violetSoft, fg: colors.violet, value: orderCounts.data?.inProcess.value ?? 0, trend: orderCounts.data?.inProcess.trendPct ?? 0 },
            { key: 'completed', title: 'Completed Orders', subtitle: 'delivered & closed', icon: CheckCircle2, tint: colors.emeraldSoft, fg: colors.emerald, value: orderCounts.data?.completed.value ?? 0, trend: orderCounts.data?.completed.trendPct ?? 0 },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <CardFrame
                key={card.key}
                title={card.title}
                clickable
                onClick={() => goTo(`/marketing/analytics/orders/${card.key === 'in_process' ? 'in-process' : card.key}`)}
                loading={orderCounts.loading}
                error={orderCounts.error}
                onRetry={() => {
                  const controller = new AbortController();
                  void load(setOrderCounts, marketingAnalyticsApi.getOrderCounts, controller.signal);
                }}
                className="relative overflow-hidden"
              >
                <div className="absolute right-[-48px] top-[-48px] h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: `${card.fg}55` }} />
                <div className="relative flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: card.tint }}>
                      <Icon className="h-5 w-5" style={{ color: card.fg }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>{card.title}</p>
                    <p className="text-[34px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>{card.value}</p>
                    <p className="text-sm" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>{card.subtitle}</p>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: card.tint, color: card.fg }}>
                      {card.trend >= 0 ? '▲' : '▼'} {Math.abs(card.trend).toFixed(1)}%
                    </span>
                    <ChevronRight className="h-5 w-5" style={{ color: colors.muted }} />
                  </div>
                </div>
              </CardFrame>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <CardFrame title="Sales Report" loading={sales.loading} error={sales.error} onRetry={() => {
            const controller = new AbortController();
            void load(setSales, (signal) => marketingAnalyticsApi.getSales(salesRange, signal), controller.signal);
          }} className="xl:col-span-7">
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-extrabold tracking-[-0.03em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>Sales Report</p>
                  <p className="mt-1 text-sm" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>Unit movement by selected interval.</p>
                </div>
                <div className="flex gap-2">
                  {(['month', 'weekly', 'daily'] as const).map((range) => (
                    <button key={range} type="button" onClick={() => setSalesRange(range)} className={rangeButtonClass(salesRange === range)} style={{ backgroundColor: salesRange === range ? colors.ink : 'transparent' }}>
                      {range === 'month' ? 'Month' : range[0].toUpperCase() + range.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sales.data?.series ?? []} margin={{ left: -12, right: 10, top: 8 }}>
                    <defs>
                      <linearGradient id="sales-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colors.emerald} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={colors.emerald} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={colors.line} vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: colors.muted, fontSize: 12, fontFamily: 'Hanken Grotesk' }} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${value}k`} tick={{ fill: colors.muted, fontSize: 12, fontFamily: 'Hanken Grotesk' }} />
                    <Tooltip {...chartTooltip} />
                    <Area dataKey="value" type="monotone" stroke={colors.emerald} fill="url(#sales-area)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardFrame>

          <CardFrame title="Order Summary" loading={orderSummary.loading} error={orderSummary.error} onRetry={() => {
            const controller = new AbortController();
            void load(setOrderSummary, marketingAnalyticsApi.getOrderSummary, controller.signal);
          }} className="xl:col-span-5">
            <div className="space-y-4">
              <div>
                <p className="text-xl font-extrabold tracking-[-0.03em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>Order Summary</p>
                <p className="mt-1 text-sm" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>Received vs fulfilled orders.</p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={orderSummary.data?.series ?? []} margin={{ left: -12, right: 10, top: 8 }}>
                    <defs>
                      <linearGradient id="received-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colors.emerald} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={colors.emerald} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="fulfilled-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colors.tangerine} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={colors.tangerine} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={colors.line} vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: colors.muted, fontSize: 12, fontFamily: 'Hanken Grotesk' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: colors.muted, fontSize: 12, fontFamily: 'Hanken Grotesk' }} />
                    <Tooltip {...chartTooltip} />
                    <Area dataKey="received" type="monotone" stroke={colors.emerald} fill="url(#received-area)" strokeWidth={3} />
                    <Area dataKey="fulfilled" type="monotone" stroke={colors.tangerine} fill="url(#fulfilled-area)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardFrame>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <CardFrame title="Sales & Purchase" loading={salesVsPurchase.loading} error={salesVsPurchase.error} onRetry={() => {
            const controller = new AbortController();
            void load(setSalesVsPurchase, marketingAnalyticsApi.getSalesVsPurchase, controller.signal);
          }} className="xl:col-span-7">
            <div className="space-y-4">
              <div>
                <p className="text-xl font-extrabold tracking-[-0.03em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>Sales & Purchase</p>
                <p className="mt-1 text-sm" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>Monthly sales compared with price updates.</p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesVsPurchase.data?.series ?? []} margin={{ left: -12, right: 10, top: 8 }}>
                    <CartesianGrid stroke={colors.line} vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: colors.muted, fontSize: 12, fontFamily: 'Hanken Grotesk' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: colors.muted, fontSize: 12, fontFamily: 'Hanken Grotesk' }} />
                    <Tooltip {...chartTooltip} formatter={(value: number) => fmtCompactMoney(value)} />
                    <Bar dataKey="sales" radius={[10, 10, 0, 0]} fill={colors.ink} />
                    <Bar dataKey="purchase" radius={[10, 10, 0, 0]} fill={colors.gold} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardFrame>

          <CardFrame title="Most Purchased Products" loading={topProducts.loading} error={topProducts.error} onRetry={() => {
            const controller = new AbortController();
            void load(setTopProducts, marketingAnalyticsApi.getTopProducts, controller.signal);
          }} className="xl:col-span-5">
            <div className="space-y-4">
              <div>
                <p className="text-xl font-extrabold tracking-[-0.03em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>Most Purchased Products</p>
                <p className="mt-1 text-sm" style={{ color: colors.muted, fontFamily: '"Hanken Grotesk", sans-serif' }}>Ranked by total completed order value.</p>
              </div>
              <div className="space-y-4">
                {(topProducts.data?.items ?? []).map((product) => (
                  <div key={product.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold" style={{ backgroundColor: `${product.color}1A`, color: product.color }}>
                          {product.rank}
                        </span>
                        <div>
                          <p className="font-semibold" style={{ fontFamily: '"Hanken Grotesk", sans-serif' }}>{product.name}</p>
                          <p className="text-xs" style={{ color: colors.muted }}>{product.pct}% of lead product</p>
                        </div>
                      </div>
                      <span className="font-bold">{fmtCompactMoney(product.value)}</span>
                    </div>
                    <div className="h-2.5 rounded-full" style={{ backgroundColor: '#EFE6D8' }}>
                      <div className="h-2.5 rounded-full" style={{ width: `${product.pct}%`, backgroundColor: product.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardFrame>
=======
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
>>>>>>> 4a5051b8d808d34a3c2324862f447ea96d007414
        </div>
      </div>
    </DashboardLayout>
  );
}
