import api, { buildApiUrl, buildHeaders } from '@/lib/api';

export type CustomersSummary = {
  total: number;
  deltaPct: number;
  period: string;
};

export type PurchasesSummary = {
  totalValue: number;
  ordersSettled: number;
  deltaPct: number;
  period: string;
};

export type CartsSummary = {
  itemCount: number;
  potentialValue: number;
  openCarts: number;
  deltaPct: number;
};

export type SegmentItem = {
  type: string;
  count: number;
  pct: number;
};

export type SegmentsSummary = {
  total: number;
  segments: SegmentItem[];
};

export type TopCustomer = {
  id: string;
  name: string;
  emailMasked: string;
  totalPurchase: number;
  orderCount?: number;
  trend: number[];
};

export type TopProduct = {
  id: string;
  name: string;
  color: string;
  totalVolume: number;
  series: number[];
  months: string[];
};

export type PagedResponse<T> = {
  page?: number;
  pageSize?: number;
  total?: number;
  items: T[];
};

export type CustomerDetail = {
  id: string;
  name: string;
  type: string;
  emailMasked: string;
  isActive: boolean;
  createdAt: string;
};

export type PurchaseDetail = {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
};

export type CartDetail = {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  createdAt: string;
};

type CacheEntry<T> = {
  data: T;
  at: number;
};

const CACHE_TTL = 30_000;
const cache = new Map<string, CacheEntry<unknown>>();

async function fetchCached<T>(path: string, signal?: AbortSignal): Promise<T> {
  const hit = cache.get(path) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return hit.data;
  }

  const data = await api.get<T>(path, { signal });
  cache.set(path, { data, at: Date.now() });
  return data;
}

export const crmAnalyticsApi = {
  getCustomersSummary: (signal?: AbortSignal) =>
    fetchCached<CustomersSummary>('/crm/analytics/customers/summary', signal),
  getPurchasesSummary: (signal?: AbortSignal) =>
    fetchCached<PurchasesSummary>('/crm/analytics/purchases/summary', signal),
  getCartsSummary: (signal?: AbortSignal) =>
    fetchCached<CartsSummary>('/crm/analytics/carts/abandoned', signal),
  getSegments: (signal?: AbortSignal) =>
    fetchCached<SegmentsSummary>('/crm/analytics/customers/segments', signal),
  getTopCustomers: (signal?: AbortSignal) =>
    fetchCached<TopCustomer[]>('/crm/analytics/customers/top?limit=10&period=month', signal),
  getTopProducts: (signal?: AbortSignal) =>
    fetchCached<TopProduct[]>('/crm/analytics/products/top?limit=5&window=12m', signal),
  getCustomersDetail: (page = 1, pageSize = 25, signal?: AbortSignal) =>
    api.get<PagedResponse<CustomerDetail>>(`/crm/analytics/customers?page=${page}&pageSize=${pageSize}`, { signal }),
  getPurchasesDetail: (page = 1, pageSize = 25, signal?: AbortSignal) =>
    api.get<PagedResponse<PurchaseDetail>>(`/crm/analytics/purchases?page=${page}&pageSize=${pageSize}`, { signal }),
  getCartsDetail: (page = 1, pageSize = 25, signal?: AbortSignal) =>
    api.get<PagedResponse<CartDetail>>(`/crm/analytics/carts?page=${page}&pageSize=${pageSize}`, { signal }),
  getSegmentsDetail: (signal?: AbortSignal) =>
    api.get<SegmentsSummary>('/crm/analytics/segments', { signal }),
  getTopCustomersDetail: (signal?: AbortSignal) =>
    api.get<TopCustomer[]>('/crm/analytics/customers/top?limit=25&period=month', { signal }),
  getProductsDetail: (signal?: AbortSignal) =>
    api.get<{ items: TopProduct[] }>('/crm/analytics/products?limit=20', { signal }),
  invalidate(paths?: string[]) {
    if (!paths?.length) {
      cache.clear();
      return;
    }
    for (const path of paths) cache.delete(path);
  },
};

export type LiveState = 'connected' | 'reconnecting' | 'offline';

type SnapshotPayload = {
  customers?: Partial<CustomersSummary>;
  purchases?: Partial<PurchasesSummary>;
  carts?: Partial<CartsSummary>;
  segments?: SegmentsSummary;
  topCustomers?: TopCustomer[];
  topProducts?: TopProduct[];
};

type StreamListener = {
  onSnapshot: (payload: SnapshotPayload) => void;
  onStateChange: (state: LiveState) => void;
};

export function createCrmAnalyticsStream(listener: StreamListener) {
  let disposed = false;
  let reconnectDelay = 2_000;
  let pollingTimer: number | null = null;
  let reconnectTimer: number | null = null;
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
        crmAnalyticsApi.invalidate();
        const [customers, purchases, carts, segments, topCustomers, topProducts] = await Promise.all([
          crmAnalyticsApi.getCustomersSummary(),
          crmAnalyticsApi.getPurchasesSummary(),
          crmAnalyticsApi.getCartsSummary(),
          crmAnalyticsApi.getSegments(),
          crmAnalyticsApi.getTopCustomers(),
          crmAnalyticsApi.getTopProducts(),
        ]);
        listener.onSnapshot({ customers, purchases, carts, segments, topCustomers, topProducts });
      } catch {
        // Keep the existing state until the next retry succeeds.
      }
    }, 20_000);
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer !== null) return;
    listener.onStateChange('reconnecting');
    startPolling();
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      connect();
    }, reconnectDelay);
  };

  const connect = async () => {
    controller?.abort();
    controller = new AbortController();

    try {
      const response = await fetch(buildApiUrl('/crm/analytics/stream'), {
        method: 'GET',
        headers: buildHeaders(undefined),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        listener.onStateChange('offline');
        scheduleReconnect();
        return;
      }

      reconnectDelay = 2_000;
      stopPolling();
      listener.onStateChange('connected');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!disposed) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = rawEvent.split('\n');
          const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
          const dataLine = lines.find((line) => line.startsWith('data:'))?.slice(5).trim();

          if (eventName === 'snapshot' && dataLine) {
            listener.onSnapshot(JSON.parse(dataLine) as SnapshotPayload);
          }
          boundary = buffer.indexOf('\n\n');
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
