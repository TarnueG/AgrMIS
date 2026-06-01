import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CRM_ANALYTICS_COLORS, Sparkline, formatCurrency, TopProductsCard } from '@/components/crm-analytics/CrmAnalyticsCards';
import { crmAnalyticsApi, type CartDetail, type CustomerDetail, type PurchaseDetail, type SegmentsSummary, type TopCustomer, type TopProduct } from '@/lib/crmAnalytics';

type DetailState<T> = {
  data?: T;
  loading: boolean;
  error: string | null;
};

type DetailFetcher = (page: number, signal?: AbortSignal) => Promise<any>;

const detailMap: Record<string, { title: string; paged: boolean; fetcher: DetailFetcher }> = {
  '/crm/analytics/customers': { title: 'Total Customers', paged: true, fetcher: (page, signal) => crmAnalyticsApi.getCustomersDetail(page, 25, signal) },
  '/crm/analytics/purchases': { title: 'Total Purchases', paged: true, fetcher: (page, signal) => crmAnalyticsApi.getPurchasesDetail(page, 25, signal) },
  '/crm/analytics/carts': { title: 'Cart Items', paged: true, fetcher: (page, signal) => crmAnalyticsApi.getCartsDetail(page, 25, signal) },
  '/crm/analytics/segments': { title: 'Customer Segments', paged: false, fetcher: (_page, signal) => crmAnalyticsApi.getSegmentsDetail(signal) },
  '/crm/analytics/customers/top': { title: 'Top Customers', paged: false, fetcher: (_page, signal) => crmAnalyticsApi.getTopCustomersDetail(signal) },
  '/crm/analytics/products/top': { title: 'Top Products', paged: false, fetcher: (_page, signal) => crmAnalyticsApi.getProductsDetail(signal) },
} as const;

export default function CrmAnalyticsDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [state, setState] = useState<DetailState<any>>({ loading: true, error: null });
  const detail = useMemo(() => detailMap[location.pathname], [location.pathname]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: null });
    detail.fetcher(page, controller.signal)
      .then((data: unknown) => setState({ data, loading: false, error: null }))
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, error: error.message });
      });

    return () => controller.abort();
  }, [detail, page]);

  useEffect(() => {
    setPage(1);
  }, [location.pathname]);

  const renderTable = () => {
    if (location.pathname === '/crm/analytics/customers') {
      const data = state.data?.items as CustomerDetail[] | undefined;
      return (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((item) => <TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell>{item.type}</TableCell><TableCell>{item.emailMasked}</TableCell><TableCell>{item.isActive ? 'Active' : 'Inactive'}</TableCell><TableCell>{format(new Date(item.createdAt), 'MMM d, yyyy')}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      );
    }

    if (location.pathname === '/crm/analytics/purchases') {
      const data = state.data?.items as PurchaseDetail[] | undefined;
      return (
        <Table>
          <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead>Payment</TableHead><TableHead>Total</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((item) => <TableRow key={item.id}><TableCell>{item.orderNumber}</TableCell><TableCell>{item.customerName}</TableCell><TableCell>{item.status}</TableCell><TableCell>{item.paymentStatus}</TableCell><TableCell>{formatCurrency(item.totalAmount)}</TableCell><TableCell>{format(new Date(item.createdAt), 'MMM d, yyyy')}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      );
    }

    if (location.pathname === '/crm/analytics/carts') {
      const data = state.data?.items as CartDetail[] | undefined;
      return (
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Unit Price</TableHead><TableHead>Total</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((item) => <TableRow key={item.id}><TableCell>{item.itemName}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{formatCurrency(item.unitPrice)}</TableCell><TableCell>{formatCurrency(item.totalAmount)}</TableCell><TableCell>{format(new Date(item.createdAt), 'MMM d, yyyy')}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      );
    }

    if (location.pathname === '/crm/analytics/segments') {
      const data = state.data as SegmentsSummary | undefined;
      return (
        <Table>
          <TableHeader><TableRow><TableHead>Segment</TableHead><TableHead>Customers</TableHead><TableHead>Share</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.segments.map((item) => <TableRow key={item.type}><TableCell>{item.type}</TableCell><TableCell>{item.count}</TableCell><TableCell>{item.pct}%</TableCell></TableRow>)}
          </TableBody>
        </Table>
      );
    }

    if (location.pathname === '/crm/analytics/customers/top') {
      const selectedCustomerId = searchParams.get('customerId');
      const allRows = (state.data as TopCustomer[] | undefined) ?? [];
      const data = selectedCustomerId ? allRows.filter((item) => item.id === selectedCustomerId) : allRows;
      return (
        <Table>
          <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Email</TableHead><TableHead>Orders</TableHead><TableHead>Trend</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((item) => <TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell>{item.emailMasked}</TableCell><TableCell>{item.orderCount ?? '-'}</TableCell><TableCell><Sparkline values={item.trend} color={CRM_ANALYTICS_COLORS.positive} /></TableCell><TableCell>{formatCurrency(item.totalPurchase)}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      );
    }

    const products = (state.data?.items ?? []) as TopProduct[];
    return <TopProductsCard data={products.slice(0, 5)} onClick={() => {}} />;
  };

  const totalPages = detail.paged && state.data?.total ? Math.max(1, Math.ceil(state.data.total / (state.data.pageSize ?? 25))) : 1;

  return (
    <DashboardLayout>
      <div className="space-y-6 rounded-[32px] p-6 md:p-10" style={{ backgroundColor: CRM_ANALYTICS_COLORS.page, fontFamily: '"Poppins", sans-serif' }}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate('/crm/analytics')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{detail.title}</h1>
            <p className="text-sm" style={{ color: CRM_ANALYTICS_COLORS.muted }}>Back returns to the analytics overview with prior scroll position.</p>
          </div>
        </div>

        <Card className="rounded-[24px] border-0 shadow-[0_9px_24px_rgba(43,47,72,0.05)]">
          <CardContent className="p-6">
            {state.loading ? <div className="h-80 animate-pulse rounded-[18px] bg-slate-100" /> : state.error ? <p className="text-sm text-destructive">Couldn't load this detail view.</p> : renderTable()}
          </CardContent>
        </Card>

        {detail.paged && totalPages > 1 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: CRM_ANALYTICS_COLORS.muted }}>Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
              <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
