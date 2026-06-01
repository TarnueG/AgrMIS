import api, { buildApiUrl, buildHeaders } from '@/lib/api';

export type MarketingSummary = {
  totalIncome: number;
  totalRevenue: number;
  totalRevenueSummary: number;
  pendingOrders: number;
  inProcessOrders: number;
  completedOrders: number;
  monthlyTarget: number;
  targetProgress: number;
  currentMonthIncome: number;
  revenueDeltaPct: number;
  updatedAt: string;
  updatedRelative: string;
};

export type IncomePoint = { label: string; income: number; forecast: number };
export type IncomeReport = { range: 'monthly' | 'weekly' | 'daily'; total: number; growthPct: number; subtitle: string; series: IncomePoint[] };
export type SalesPoint = { label: string; value: number };
export type SalesReport = { range: 'month' | 'weekly' | 'daily'; series: SalesPoint[] };
export type OrderSummaryPoint = { label: string; received: number; fulfilled: number };
export type OrderSummary = { series: OrderSummaryPoint[] };
export type OrderCount = { value: number; trendPct: number };
export type OrderCounts = { pending: OrderCount; inProcess: OrderCount; completed: OrderCount };
export type SalesVsPurchasePoint = { label: string; sales: number; purchase: number };
export type SalesVsPurchase = { series: SalesVsPurchasePoint[] };
export type RevenueBreakdownItem = { key: string; label: string; value: number; pct: number; color: string };
export type RevenueBreakdown = { total: number; items: RevenueBreakdownItem[] };
export type TopProduct = { rank: number; id: string; name: string; value: number; color: string; pct: number };
export type TopProducts = { items: TopProduct[] };
export type MarketingOrderDetail = { id: string; orderId: string; vendor: string; channel: string; date: string; amount: number; status: string };
export type MarketingOrderDetails = { page: number; pageSize: number; total: number; items: MarketingOrderDetail[] };
export type MarketingLiveState = 'connected' | 'reconnecting' | 'offline';

const CACHE_TTL = 30_000;
const cache = new Map<string, { data: unknown; at: number }>();

async function cachedGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return hit.data as T;
  }
  const data = await api.get<T>(path, { signal });
  cache.set(path, { data, at: Date.now() });
  return data;
}

export const marketingAnalyticsApi = {
  getSummary: (signal?: AbortSignal) => cachedGet<MarketingSummary>('/marketing/analytics/summary', signal),
  getIncome: (range: 'monthly' | 'weekly' | 'daily', signal?: AbortSignal) => api.get<IncomeReport>(`/marketing/analytics/income?range=${range}`, { signal }),
  getSales: (range: 'month' | 'weekly' | 'daily', signal?: AbortSignal) => api.get<SalesReport>(`/marketing/analytics/sales?range=${range}`, { signal }),
  getOrderSummary: (signal?: AbortSignal) => cachedGet<OrderSummary>('/marketing/analytics/orders/summary', signal),
  getOrderCounts: (signal?: AbortSignal) => cachedGet<OrderCounts>('/marketing/analytics/orders/counts', signal),
  getSalesVsPurchase: (signal?: AbortSignal) => cachedGet<SalesVsPurchase>('/marketing/analytics/sales-vs-purchase', signal),
  getRevenueBreakdown: (signal?: AbortSignal) => cachedGet<RevenueBreakdown>('/marketing/analytics/revenue-breakdown', signal),
  getTopProducts: (signal?: AbortSignal) => cachedGet<TopProducts>('/marketing/analytics/top-products', signal),
  getOrderDetails: (status: 'pending' | 'in_process' | 'completed', page = 1, pageSize = 20, signal?: AbortSignal) =>
    api.get<MarketingOrderDetails>(`/marketing/analytics/orders?status=${status}&page=${page}&pageSize=${pageSize}`, { signal }),
  invalidate(prefix?: string) {
    if (!prefix) {
      cache.clear();
      return;
    }
    Array.from(cache.keys()).forEach((key) => {
      if (key.includes(prefix)) cache.delete(key);
    });
  },
};

type LiveSnapshot = {
  summary?: MarketingSummary;
  revenueBreakdown?: RevenueBreakdownItem[];
  topProducts?: TopProduct[];
  salesVsPurchase?: SalesVsPurchasePoint[];
};

export function createMarketingAnalyticsStream(listener: {
  onStateChange: (state: MarketingLiveState) => void;
  onSnapshot: (snapshot: LiveSnapshot) => void;
}) {
  let disposed = false;
  let reconnectDelay = 2000;
  let reconnectTimer: number | null = null;
  let pollingTimer: number | null = null;
  let controller: AbortController | null = null;

  const stopPolling = () => {
    if (pollingTimer !== null) {
      window.clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };

  const startPolling = () => {
    if (pollingTimer !== null || disposed) return;
    pollingTimer = window.setInterval(async () => {
      try {
        marketingAnalyticsApi.invalidate();
        const [summary, revenueBreakdown, topProducts, salesVsPurchase] = await Promise.all([
          marketingAnalyticsApi.getSummary(),
          marketingAnalyticsApi.getRevenueBreakdown(),
          marketingAnalyticsApi.getTopProducts(),
          marketingAnalyticsApi.getSalesVsPurchase(),
        ]);
        listener.onSnapshot({ summary, revenueBreakdown: revenueBreakdown.items, topProducts: topProducts.items, salesVsPurchase: salesVsPurchase.series });
      } catch {
        // Keep previous UI state during polling failures.
      }
    }, 20000);
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer !== null) return;
    listener.onStateChange('reconnecting');
    startPolling();
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connect();
    }, reconnectDelay);
  };

  const connect = async () => {
    controller?.abort();
    controller = new AbortController();

    try {
      const response = await fetch(buildApiUrl('/marketing/analytics/stream'), {
        method: 'GET',
        headers: buildHeaders(undefined),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        listener.onStateChange('offline');
        scheduleReconnect();
        return;
      }

      reconnectDelay = 2000;
      stopPolling();
      listener.onStateChange('connected');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!disposed) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        let marker = buffer.indexOf('\n\n');
        while (marker >= 0) {
          const raw = buffer.slice(0, marker);
          buffer = buffer.slice(marker + 2);
          const eventName = raw.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
          const payload = raw.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
          if (eventName === 'snapshot' && payload) listener.onSnapshot(JSON.parse(payload) as LiveSnapshot);
          marker = buffer.indexOf('\n\n');
        }
      }

      if (!disposed) {
        listener.onStateChange('offline');
        scheduleReconnect();
      }
    } catch (error) {
      if (disposed || (error instanceof DOMException && error.name === 'AbortError')) return;
      listener.onStateChange('offline');
      scheduleReconnect();
    }
  };

  void connect();

  return () => {
    disposed = true;
    stopPolling();
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    controller?.abort();
  };
}
