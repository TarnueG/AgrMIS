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
        </div>
      </div>
    </DashboardLayout>
  );
}
