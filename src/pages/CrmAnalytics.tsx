import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  CardShell,
  CartsSummaryCard,
  CRM_ANALYTICS_COLORS,
  CustomersSummaryCard,
  LivePill,
  PurchasesSummaryCard,
  SegmentDonutCard,
  TopCustomersCard,
  TopProductsCard,
} from '@/components/crm-analytics/CrmAnalyticsCards';
import {
  createCrmAnalyticsStream,
  crmAnalyticsApi,
  type CartsSummary,
  type CustomersSummary,
  type LiveState,
  type PurchasesSummary,
  type SegmentsSummary,
  type TopCustomer,
  type TopProduct,
} from '@/lib/crmAnalytics';

type WidgetState<T> = {
  data?: T;
  loading: boolean;
  error: string | null;
};

function widget<T>(): WidgetState<T> {
  return { loading: true, error: null };
}

export default function CrmAnalytics() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [liveState, setLiveState] = useState<LiveState>('reconnecting');
  const [customers, setCustomers] = useState<WidgetState<CustomersSummary>>(widget());
  const [purchases, setPurchases] = useState<WidgetState<PurchasesSummary>>(widget());
  const [carts, setCarts] = useState<WidgetState<CartsSummary>>(widget());
  const [segments, setSegments] = useState<WidgetState<SegmentsSummary>>(widget());
  const [topCustomers, setTopCustomers] = useState<WidgetState<TopCustomer[]>>(widget());
  const [topProducts, setTopProducts] = useState<WidgetState<TopProduct[]>>(widget());

  const loadWidget = async <T,>(fetcher: (signal?: AbortSignal) => Promise<T>, setter: Dispatch<SetStateAction<WidgetState<T>>>, signal: AbortSignal) => {
    setter((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await fetcher(signal);
      setter({ data, loading: false, error: null });
    } catch (error) {
      if (signal.aborted) return;
      setter((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Request failed' }));
    }
  };

  useEffect(() => {
    const controllers = Array.from({ length: 6 }, () => new AbortController());
    void loadWidget(crmAnalyticsApi.getCustomersSummary, setCustomers, controllers[0].signal);
    void loadWidget(crmAnalyticsApi.getPurchasesSummary, setPurchases, controllers[1].signal);
    void loadWidget(crmAnalyticsApi.getCartsSummary, setCarts, controllers[2].signal);
    void loadWidget(crmAnalyticsApi.getSegments, setSegments, controllers[3].signal);
    void loadWidget(crmAnalyticsApi.getTopCustomers, setTopCustomers, controllers[4].signal);
    void loadWidget(crmAnalyticsApi.getTopProducts, setTopProducts, controllers[5].signal);

    const unsubscribe = createCrmAnalyticsStream({
      onStateChange: setLiveState,
      onSnapshot: (snapshot) => {
        if (snapshot.customers) setCustomers((current) => ({ ...current, data: { ...current.data, ...snapshot.customers } as CustomersSummary, loading: false, error: null }));
        if (snapshot.purchases) setPurchases((current) => ({ ...current, data: { ...current.data, ...snapshot.purchases } as PurchasesSummary, loading: false, error: null }));
        if (snapshot.carts) setCarts((current) => ({ ...current, data: { ...current.data, ...snapshot.carts } as CartsSummary, loading: false, error: null }));
        if (snapshot.segments) setSegments((current) => ({ ...current, data: snapshot.segments, loading: false, error: null }));
        if (snapshot.topCustomers) setTopCustomers((current) => ({ ...current, data: snapshot.topCustomers, loading: false, error: null }));
        if (snapshot.topProducts) setTopProducts((current) => ({ ...current, data: snapshot.topProducts, loading: false, error: null }));
      },
    });

    const saved = sessionStorage.getItem('crm-analytics-scroll');
    if (saved) {
      window.scrollTo({ top: Number(saved), behavior: 'auto' });
      sessionStorage.removeItem('crm-analytics-scroll');
    }

    return () => {
      controllers.forEach((controller) => controller.abort());
      unsubscribe();
    };
  }, []);

  const navigateTo = (path: string) => {
    sessionStorage.setItem('crm-analytics-scroll', String(window.scrollY));
    navigate(path);
  };

  const initials = useMemo(() => user?.fullName?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || user?.email?.slice(0, 2).toUpperCase() || 'U', [user]);

  return (
    <DashboardLayout>
      <div className="space-y-8 rounded-[32px] p-6 md:p-10" style={{ backgroundColor: CRM_ANALYTICS_COLORS.page, fontFamily: '"Poppins", sans-serif' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[40px] font-bold leading-none tracking-[-0.04em]" style={{ color: CRM_ANALYTICS_COLORS.text }}>CRM Analytics</h1>
            <LivePill state={liveState} />
          </div>
          <Avatar className="h-12 w-12">
            <AvatarFallback style={{ backgroundColor: '#ECE6D8', color: CRM_ANALYTICS_COLORS.text }}>{initials}</AvatarFallback>
          </Avatar>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-4 md:grid-cols-2">
          <CustomersSummaryCard data={customers.data} loading={customers.loading} error={customers.error} onRetry={() => void loadWidget(crmAnalyticsApi.getCustomersSummary, setCustomers, new AbortController().signal)} onClick={() => navigateTo('/crm/analytics/customers')} />
          <PurchasesSummaryCard data={purchases.data} loading={purchases.loading} error={purchases.error} onRetry={() => void loadWidget(crmAnalyticsApi.getPurchasesSummary, setPurchases, new AbortController().signal)} onClick={() => navigateTo('/crm/analytics/purchases')} />
          <CartsSummaryCard data={carts.data} loading={carts.loading} error={carts.error} onRetry={() => void loadWidget(crmAnalyticsApi.getCartsSummary, setCarts, new AbortController().signal)} onClick={() => navigateTo('/crm/analytics/carts')} />
          <SegmentDonutCard data={segments.data} loading={segments.loading} error={segments.error} onRetry={() => void loadWidget(crmAnalyticsApi.getSegments, setSegments, new AbortController().signal)} onClick={() => navigateTo('/crm/analytics/segments')} />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_1fr]">
          <TopCustomersCard
            data={topCustomers.data}
            loading={topCustomers.loading}
            error={topCustomers.error}
            onRetry={() => void loadWidget(crmAnalyticsApi.getTopCustomers, setTopCustomers, new AbortController().signal)}
            onClick={() => navigateTo('/crm/analytics/customers/top')}
            onRowClick={(customerId) => navigate(`/crm/analytics/customers/top?customerId=${customerId}`)}
          />
          <TopProductsCard
            data={topProducts.data}
            loading={topProducts.loading}
            error={topProducts.error}
            onRetry={() => void loadWidget(crmAnalyticsApi.getTopProducts, setTopProducts, new AbortController().signal)}
            onClick={() => navigateTo('/crm/analytics/products/top')}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <CardShell title="Coverage" tint="#FFFDF8">
            <div>
              <p className="text-sm font-semibold">Coverage</p>
              <p className="mt-2 text-[28px] font-bold">{segments.data?.total ?? 0}</p>
              <p className="mt-2 text-sm" style={{ color: CRM_ANALYTICS_COLORS.muted }}>Total visible customer records in the CRM scope.</p>
            </div>
          </CardShell>
          <CardShell title="Paid Orders" tint="#FFFDF8">
            <div>
              <p className="text-sm font-semibold">Paid Orders</p>
              <p className="mt-2 text-[28px] font-bold">{purchases.data?.ordersSettled ?? 0}</p>
              <p className="mt-2 text-sm" style={{ color: CRM_ANALYTICS_COLORS.muted }}>Settled orders feeding the purchase leaderboard.</p>
            </div>
          </CardShell>
          <CardShell title="Open Carts" tint="#FFFDF8">
            <div>
              <p className="text-sm font-semibold">Open Carts</p>
              <p className="mt-2 text-[28px] font-bold">{carts.data?.openCarts ?? 0}</p>
              <p className="mt-2 text-sm" style={{ color: CRM_ANALYTICS_COLORS.muted }}>Current carts that still represent conversion potential.</p>
            </div>
          </CardShell>
        </div>
      </div>
    </DashboardLayout>
  );
}
