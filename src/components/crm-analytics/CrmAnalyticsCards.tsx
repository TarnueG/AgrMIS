import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  AreaChart,
  Area,
} from 'recharts';
import { ArrowRight, RefreshCw, ShoppingBag, ShoppingCart, UsersRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CartsSummary, CustomersSummary, SegmentsSummary, TopCustomer, TopProduct, PurchasesSummary } from '@/lib/crmAnalytics';

export const CRM_ANALYTICS_COLORS = {
  page: '#F8F4EC',
  text: '#2B2F48',
  muted: '#8A8FA3',
  positive: '#2FA867',
  negative: '#E2574C',
  lavender: '#6E74E0',
  lavenderSoft: '#DADCF9',
  peach: '#EF8B4E',
  peachSoft: '#FBDCC4',
  mint: '#34B788',
  mintSoft: '#C6ECD8',
  white: '#FFFFFF',
  lineDark: '#2B2F48',
};

const tooltipStyle = {
  contentStyle: {
    background: '#fff',
    border: '1px solid rgba(43,47,72,0.08)',
    borderRadius: 16,
    boxShadow: '0 12px 30px rgba(43,47,72,0.10)',
    color: CRM_ANALYTICS_COLORS.text,
  },
};

function useAnimatedNumber(value: number) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const start = previous.current;
    const end = value;
    if (start === end) return;

    let frame = 0;
    const begin = performance.now();
    const duration = 450;

    const tick = (time: number) => {
      const progress = Math.min((time - begin) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = start + (end - start) * eased;
      setDisplay(next);
      previous.current = next;
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      previous.current = end;
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return display;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function DeltaPill({ value, suffix, positiveOverride }: { value: number; suffix: string; positiveOverride?: boolean }) {
  const positive = positiveOverride ?? value >= 0;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        color: positive ? CRM_ANALYTICS_COLORS.positive : CRM_ANALYTICS_COLORS.negative,
        backgroundColor: positive ? 'rgba(47,168,103,0.12)' : 'rgba(226,87,76,0.12)',
      }}
    >
      {positive ? '+' : ''}{value.toFixed(1)}% {suffix}
    </span>
  );
}

export function CardShell({
  title,
  subtitle,
  onClick,
  loading,
  error,
  onRetry,
  tint,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  onClick?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  tint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const interactive = !!onClick;

  return (
    <article
      className={cn(
        'rounded-[22px] border border-transparent p-6 shadow-[0_9px_24px_rgba(43,47,72,0.05)] transition-all duration-150',
        interactive && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(43,47,72,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        className,
      )}
      style={{ backgroundColor: tint ?? CRM_ANALYTICS_COLORS.white, color: CRM_ANALYTICS_COLORS.text }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      } : undefined}
    >
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-4 w-28 rounded-full bg-white/60" />
          <Skeleton className="h-10 w-32 rounded-2xl bg-white/60" />
          <Skeleton className="h-4 w-40 rounded-full bg-white/60" />
          <Skeleton className="h-28 w-full rounded-[18px] bg-white/60" />
        </div>
      ) : error ? (
        <div className="flex h-full min-h-40 flex-col justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {subtitle ? <p className="mt-1 text-xs" style={{ color: CRM_ANALYTICS_COLORS.muted }}>{subtitle}</p> : null}
            <p className="mt-6 text-sm" style={{ color: CRM_ANALYTICS_COLORS.negative }}>Couldn't load</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit rounded-full px-3"
            onClick={(event) => {
              event.stopPropagation();
              onRetry?.();
            }}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : (
        children
      )}
    </article>
  );
}

export function KpiCard({
  title,
  subtitle,
  value,
  caption,
  delta,
  tint,
  icon,
  onClick,
  loading,
  error,
  onRetry,
}: {
  title: string;
  subtitle: string;
  value: number;
  caption: string;
  delta: React.ReactNode;
  tint: string;
  icon: 'customers' | 'purchases' | 'carts';
  onClick: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const animatedValue = useAnimatedNumber(value);
  const Icon = icon === 'customers' ? UsersRound : icon === 'purchases' ? ShoppingBag : ShoppingCart;

  return (
    <CardShell title={title} subtitle={subtitle} onClick={onClick} loading={loading} error={error} onRetry={onRetry} tint={tint}>
      <div className="flex h-full flex-col justify-between gap-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs" style={{ color: CRM_ANALYTICS_COLORS.muted }}>{subtitle}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70">
            <Icon className="h-5 w-5" style={{ color: CRM_ANALYTICS_COLORS.text }} />
          </div>
        </div>
        <div>
          <p className="text-[2rem] font-bold leading-none tracking-[-0.03em]">
            {icon === 'purchases' ? formatCurrency(animatedValue) : Math.round(animatedValue).toLocaleString('en-US')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {delta}
          </div>
          <p className="mt-3 text-sm" style={{ color: CRM_ANALYTICS_COLORS.muted }}>{caption}</p>
        </div>
      </div>
    </CardShell>
  );
}

export function SegmentDonutCard({
  data,
  onClick,
  loading,
  error,
  onRetry,
}: {
  data?: SegmentsSummary;
  onClick: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const segments = data?.segments ?? [];
  const colors = [CRM_ANALYTICS_COLORS.lavender, CRM_ANALYTICS_COLORS.mint];

  return (
    <CardShell title="Customer Segments" subtitle="Business vs Individual" onClick={onClick} loading={loading} error={error} onRetry={onRetry}>
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold">Customer Segments</p>
            <p className="mt-1 text-xs" style={{ color: CRM_ANALYTICS_COLORS.muted }}>Business vs Individual</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{data?.total ?? 0}</span>
        </div>
        <div className="grid flex-1 grid-cols-[160px_1fr] items-center gap-4">
          <div className="relative h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={segments} dataKey="count" innerRadius={48} outerRadius={74} paddingAngle={3} strokeWidth={0}>
                  {segments.map((segment, index) => <Cell key={segment.type} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold">{data?.total ?? 0}</span>
              <span className="text-xs" style={{ color: CRM_ANALYTICS_COLORS.muted }}>Total</span>
            </div>
          </div>
          <div className="space-y-3">
            {segments.map((segment, index) => (
              <div key={segment.type} className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                    {segment.type}
                  </span>
                  <span className="font-semibold">{segment.count}</span>
                </div>
                <p className="mt-1 text-xs" style={{ color: CRM_ANALYTICS_COLORS.muted }}>{segment.pct}% of customers</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const data = values.map((value, index) => ({ index, value }));
  return (
    <div className="h-10 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#spark-${color.replace('#', '')})`} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopCustomersCard({
  data,
  onClick,
  onRowClick,
  loading,
  error,
  onRetry,
}: {
  data?: TopCustomer[];
  onClick: () => void;
  onRowClick: (customerId: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <CardShell title="Top 10 Customers" subtitle="Ranked by total purchases" onClick={onClick} loading={loading} error={error} onRetry={onRetry}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Top 10 Customers</h2>
            <p className="mt-1 text-sm" style={{ color: CRM_ANALYTICS_COLORS.muted }}>Ranked by total purchases</p>
          </div>
          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium">This month</div>
        </div>
        <div className="grid grid-cols-[56px_1.2fr_140px_140px] gap-4 px-1 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: CRM_ANALYTICS_COLORS.muted }}>
          <span>Rank</span>
          <span>Customer</span>
          <span>Trend</span>
          <span className="text-right">Purchases</span>
        </div>
        <div className="space-y-2">
          {data?.map((customer, index) => {
            const trendingUp = (customer.trend.at(-1) ?? 0) >= (customer.trend.at(0) ?? 0);
            const trendColor = trendingUp ? CRM_ANALYTICS_COLORS.positive : CRM_ANALYTICS_COLORS.negative;
            return (
              <button
                key={customer.id}
                type="button"
                className={cn(
                  'grid w-full grid-cols-[56px_1.2fr_140px_140px] items-center gap-4 rounded-[18px] px-3 py-3 text-left transition-colors',
                  index % 2 === 0 ? 'bg-[#F7F4ED]' : 'bg-white',
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onRowClick(customer.id);
                }}
              >
                <span className="text-lg font-bold">{index + 1}</span>
                <div className="flex items-center gap-3">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback style={{ backgroundColor: index % 2 === 0 ? '#E7E9FB' : '#E6F5EC', color: CRM_ANALYTICS_COLORS.text }}>
                      {initials(customer.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{customer.name}</p>
                    <p className="truncate text-xs" style={{ color: CRM_ANALYTICS_COLORS.muted }}>{customer.emailMasked}</p>
                  </div>
                </div>
                <Sparkline values={customer.trend} color={trendColor} />
                <div className="text-right text-lg font-bold">{formatCurrency(customer.totalPurchase)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </CardShell>
  );
}

export function TopProductsCard({
  data,
  onClick,
  loading,
  error,
  onRetry,
}: {
  data?: TopProduct[];
  onClick: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const chartData = useMemo(() => {
    const months = data?.[0]?.months ?? [];
    return months.map((month, index) => {
      const row: Record<string, string | number> = { month };
      data?.forEach((product) => { row[product.name] = product.series[index] ?? 0; });
      return row;
    });
  }, [data]);

  const yMax = Math.max(900, ...(data?.flatMap((product) => product.series) ?? [0]));
  const ticks = [0, Math.round(yMax / 3), Math.round((yMax * 2) / 3), yMax];

  return (
    <CardShell title="Top 5 Products" subtitle="Purchase volume · last 12 months" onClick={onClick} loading={loading} error={error} onRetry={onRetry}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Top 5 Products</h2>
            <p className="mt-1 text-sm" style={{ color: CRM_ANALYTICS_COLORS.muted }}>Purchase volume · last 12 months</p>
          </div>
          <ArrowRight className="h-5 w-5" style={{ color: CRM_ANALYTICS_COLORS.muted }} />
        </div>
        <div className="flex flex-wrap gap-3">
          {data?.map((product) => (
            <div key={product.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-medium">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: product.color }} />
              {product.name}
            </div>
          ))}
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: -24, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="#E8E2D6" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: CRM_ANALYTICS_COLORS.muted, fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: CRM_ANALYTICS_COLORS.muted, fontSize: 12 }} ticks={ticks} />
              <Tooltip {...tooltipStyle} />
              {data?.map((product) => (
                <Line
                  key={product.id}
                  type="monotone"
                  dataKey={product.name}
                  stroke={product.color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </CardShell>
  );
}

export function LivePill({ state }: { state: 'connected' | 'reconnecting' | 'offline' }) {
  const config = state === 'connected'
    ? { label: 'Live', bg: 'rgba(47,168,103,0.12)', fg: CRM_ANALYTICS_COLORS.positive }
    : state === 'reconnecting'
      ? { label: 'Reconnecting', bg: 'rgba(239,139,78,0.14)', fg: CRM_ANALYTICS_COLORS.peach }
      : { label: 'Offline', bg: 'rgba(138,143,163,0.16)', fg: CRM_ANALYTICS_COLORS.muted };

  return (
    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold" style={{ backgroundColor: config.bg, color: config.fg }}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: config.fg }} />
      {config.label}
    </span>
  );
}

export function CustomersSummaryCard(props: {
  data?: CustomersSummary;
  onClick: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <KpiCard
      title="Total Customers"
      subtitle="Connected CRM accounts"
      value={props.data?.total ?? 0}
      caption="Active accounts"
      delta={<><DeltaPill value={props.data?.deltaPct ?? 0} suffix="" /><span style={{ color: CRM_ANALYTICS_COLORS.muted }}>vs {props.data?.period ?? 'last month'}</span></>}
      tint={CRM_ANALYTICS_COLORS.lavenderSoft}
      icon="customers"
      {...props}
    />
  );
}

export function PurchasesSummaryCard(props: {
  data?: PurchasesSummary;
  onClick: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <KpiCard
      title="Total Purchases"
      subtitle="Paid revenue"
      value={props.data?.totalValue ?? 0}
      caption={`${props.data?.ordersSettled ?? 0} orders settled`}
      delta={<><DeltaPill value={props.data?.deltaPct ?? 0} suffix="" /><span style={{ color: CRM_ANALYTICS_COLORS.muted }}>vs {props.data?.period ?? 'last period'}</span></>}
      tint={CRM_ANALYTICS_COLORS.peachSoft}
      icon="purchases"
      {...props}
    />
  );
}

export function CartsSummaryCard(props: {
  data?: CartsSummary;
  onClick: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <KpiCard
      title="Cart Items"
      subtitle="Not yet ordered"
      value={props.data?.itemCount ?? 0}
      caption={`Across ${props.data?.openCarts ?? 0} open carts`}
      delta={<><span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: CRM_ANALYTICS_COLORS.text, backgroundColor: 'rgba(255,255,255,0.68)' }}>{formatCurrency(props.data?.potentialValue ?? 0)}</span><span style={{ color: CRM_ANALYTICS_COLORS.muted }}>potential value</span></>}
      tint={CRM_ANALYTICS_COLORS.mintSoft}
      icon="carts"
      {...props}
    />
  );
}

export function EmptyChartSummary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs" style={{ color: CRM_ANALYTICS_COLORS.muted }}>{formatCompact(value)}</div>
    </div>
  );
}
