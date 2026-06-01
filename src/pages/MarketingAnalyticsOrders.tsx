import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { marketingAnalyticsApi, type MarketingOrderDetails } from '@/lib/marketingAnalytics';

const statusLabelMap: Record<string, string> = {
  pending: 'Pending Orders',
  'in-process': 'In-Process Orders',
  completed: 'Completed Orders',
};

export default function MarketingAnalyticsOrders() {
  const navigate = useNavigate();
  const { status = 'pending' } = useParams<{ status: 'pending' | 'in-process' | 'completed' }>();
  const apiStatus = status === 'in-process' ? 'in_process' : status;
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ data?: MarketingOrderDetails; loading: boolean; error: string | null }>({ loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: null });
    marketingAnalyticsApi.getOrderDetails(apiStatus as 'pending' | 'in_process' | 'completed', page, 20, controller.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, error: error instanceof Error ? error.message : 'Request failed' });
      });
    return () => controller.abort();
  }, [apiStatus, page]);

  useEffect(() => {
    setPage(1);
  }, [apiStatus]);

  const totalPages = useMemo(() => {
    if (!state.data) return 1;
    return Math.max(1, Math.ceil(state.data.total / state.data.pageSize));
  }, [state.data]);

  return (
    <DashboardLayout>
      <div className="space-y-6 rounded-[28px] bg-[#F4EEE2] p-5 md:p-8 text-[#181410]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate('/marketing/analytics')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-[32px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>
              {statusLabelMap[status] ?? 'Order Details'}
            </h1>
            <p className="mt-1 text-sm text-[#857c6c]" style={{ fontFamily: '"Hanken Grotesk", sans-serif' }}>
              Filtered marketing analytics order detail.
            </p>
          </div>
        </div>

        <Card className="rounded-[18px] border border-[#E7DECC] bg-[#FFFCF6] shadow-[0_10px_30px_rgba(24,20,16,0.05)]">
          <CardContent className="p-0">
            {state.loading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 7 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-xl bg-[#efe6d6]" />)}
              </div>
            ) : state.error ? (
              <div className="p-6 text-sm text-destructive">Couldn't load this table.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.data?.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.orderId}</TableCell>
                      <TableCell>{item.vendor}</TableCell>
                      <TableCell>{item.channel}</TableCell>
                      <TableCell>{item.date ? format(new Date(item.date), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>${item.amount.toLocaleString('en-US')}</TableCell>
                      <TableCell className="capitalize">{item.status.replace('_', ' ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#857c6c]" style={{ fontFamily: '"Hanken Grotesk", sans-serif' }}>Page {page} of {totalPages}</p>
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
