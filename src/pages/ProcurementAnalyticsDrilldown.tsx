import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Search, RefreshCw, Package, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────

interface DrilldownItem {
  id: string;
  reference: string;
  supplier?: string;
  commodity?: string;
  department?: string;
  itemType?: string;
  amount?: number;
  status: string;
  date: string;
}

interface DrilldownResponse {
  metric: string;
  range: string;
  page: number;
  pageSize: number;
  total: number;
  items: DrilldownItem[];
}

// ── Config ────────────────────────────────────────────────────────

const METRIC_TITLES: Record<string, string> = {
  'purchase-orders':   'Purchase Orders',
  'paid-orders':       'Paid Orders',
  'payment-requests':  'Submitted for Payment',
  'requested-orders':  'Requested Orders',
  'accepted-requests': 'Requests Accepted',
  'declined-requests': 'Requests Declined',
  'suppliers':         'Suppliers',
};

const PO_METRICS       = new Set(['purchase-orders', 'paid-orders', 'payment-requests']);
const SUPPLIER_METRICS = new Set(['suppliers']);

const PO_STATUS_OPTIONS = [
  { value: 'draft',     label: 'Pending'   },
  { value: 'submitted', label: 'Submitted' },
  { value: 'cancelled', label: 'Cancel'    },
];

const PO_STATUS_COLORS: Record<string, string> = {
  draft:     'bg-warning/20 text-warning',
  submitted: 'bg-blue-500/20 text-blue-500',
  cancelled: 'bg-destructive/20 text-destructive',
};

function statusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'paid':      return 'bg-success/20 text-success';
    case 'accepted':  return 'bg-success/20 text-success';
    case 'declined':  return 'bg-destructive/20 text-destructive';
    case 'pending':   return 'bg-warning/20 text-warning';
    case 'submitted': return 'bg-blue-500/20 text-blue-500';
    default:          return 'bg-muted text-muted-foreground';
  }
}

// ── Skeleton table rows ───────────────────────────────────────────

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 7 }, (_, i) => (
        <TableRow key={i} aria-hidden>
          {Array.from({ length: cols }, (_, j) => (
            <TableCell key={j}>
              <div
                className="h-4 bg-muted rounded animate-pulse"
                style={{ width: j === 0 ? '80px' : j === cols - 1 ? '40px' : '110px' }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ── Sortable column header ────────────────────────────────────────

function SortHead({ field, current, onSort, children }: {
  field: string;
  current: string;
  onSort: (f: string) => void;
  children: React.ReactNode;
}) {
  const [f, d] = current.split(':');
  const active = f === field;
  return (
    <TableHead>
      <button
        className="flex items-center gap-0.5 hover:text-foreground transition-colors"
        onClick={() => onSort(field)}
      >
        {children}
        {active
          ? (d === 'asc'
              ? <ChevronUp className="h-3 w-3 text-primary ml-0.5" />
              : <ChevronDown className="h-3 w-3 text-primary ml-0.5" />)
          : <ChevronDown className="h-3 w-3 opacity-20 ml-0.5" />
        }
      </button>
    </TableHead>
  );
}

// ── Data hook — includes real-time refresh ────────────────────────

const PAGE_SIZE = 25;

function useMetricItems(
  metric: string,
  params: { range: string; page: number; sort: string; q: string },
) {
  const qs = new URLSearchParams({
    range: params.range.toLowerCase(),
    page: String(params.page),
    pageSize: String(PAGE_SIZE),
    sort: params.sort,
    ...(params.q ? { q: params.q } : {}),
  });
  return useQuery<DrilldownResponse>({
    queryKey: ['procurement-analytics-items', metric, params],
    queryFn: () => api.get<DrilldownResponse>(`/procurement/analytics/${metric}/items?${qs}`),
    enabled: !!metric,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

// ── Page ──────────────────────────────────────────────────────────

export default function ProcurementAnalyticsDrilldown() {
  const { metric = '' } = useParams<{ metric: string }>();
  const [searchParams] = useSearchParams();
  const range = searchParams.get('range') ?? 'Month';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('date:desc');

  const { data, isLoading, isError, refetch } = useMetricItems(metric, { range, page, sort, q });

  const deletePO = useMutation({
    mutationFn: (id: string) => api.delete(`/procurement/purchase-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-analytics-items'] });
      qc.invalidateQueries({ queryKey: ['procurement-analytics'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast({ title: 'Purchase order cancelled' });
    },
    onError: (e: any) => toast({ title: e.message ?? 'Failed to cancel order', variant: 'destructive' }),
  });

  const updatePOStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/procurement/purchase-orders/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-analytics-items'] });
      qc.invalidateQueries({ queryKey: ['procurement-analytics'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (e: any) => toast({ title: e.message ?? 'Failed to update status', variant: 'destructive' }),
  });

  const title  = METRIC_TITLES[metric] ?? 'Details';
  const isPO       = PO_METRICS.has(metric);
  const isSupplier = SUPPLIER_METRICS.has(metric);
  // PO: 7 cols | Supplier: 4 cols | Request: 5 cols
  const cols = isPO ? 7 : isSupplier ? 4 : 5;
  const total  = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleBack = () => navigate(`/procurement/analytics?range=${range}`);

  const toggleSort = (field: string) => {
    const [f, d] = sort.split(':');
    setSort(f === field ? `${field}:${d === 'asc' ? 'desc' : 'asc'}` : `${field}:desc`);
    setPage(1);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            aria-label="Back to analytics"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground capitalize">{range} period</p>
          </div>
        </div>

        {/* ── Search toolbar ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              onBlur={() => { setQ(''); setPage(1); }}
              placeholder="Search…"
              className="pl-9 text-white placeholder:text-white/50"
              aria-label="Search items"
            />
          </div>
          {!isLoading && !isError && (
            <p className="text-sm text-muted-foreground ml-auto" aria-live="polite">
              {total} item{total !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* ── Table ── */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                {isSupplier ? (
                  <TableRow>
                    <SortHead field="reference" current={sort} onSort={toggleSort}>Supplier Name</SortHead>
                    <TableHead>Commodity</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <SortHead field="date" current={sort} onSort={toggleSort}>Date Added</SortHead>
                  </TableRow>
                ) : isPO ? (
                  <TableRow>
                    <SortHead field="reference" current={sort} onSort={toggleSort}>PO Number</SortHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Commodity</TableHead>
                    <SortHead field="amount" current={sort} onSort={toggleSort}>Amount</SortHead>
                    <TableHead>Status</TableHead>
                    <SortHead field="date" current={sort} onSort={toggleSort}>Date</SortHead>
                    <TableHead className="w-12" />
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <SortHead field="date" current={sort} onSort={toggleSort}>Date</SortHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <SkeletonRows cols={cols} />
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={cols} className="py-8">
                      <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                        <p className="text-sm text-destructive">Failed to load items.</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => refetch()}
                          className="border border-input bg-background text-white hover:bg-accent"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : !data?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={cols} className="py-14 text-center">
                      <Package className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" aria-hidden />
                      <p className="text-sm text-muted-foreground">No items for this period.</p>
                    </TableCell>
                  </TableRow>
                ) : isSupplier ? (
                  data.items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.reference}</TableCell>
                      <TableCell>{item.commodity ?? '-'}</TableCell>
                      <TableCell className="capitalize">{item.itemType ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.date ? format(new Date(item.date), 'MMM d, yyyy') : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : isPO ? (
                  data.items.map(item => {
                    const isPaid = item.status === 'Paid';
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.reference}</TableCell>
                        <TableCell>{item.supplier ?? '-'}</TableCell>
                        <TableCell>{item.commodity ?? '-'}</TableCell>
                        <TableCell className="font-medium">
                          ${(item.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          {isPaid ? (
                            <select
                              disabled
                              value="paid"
                              className="h-8 rounded border border-input bg-background px-2 text-sm bg-success/20 text-success opacity-75 cursor-not-allowed"
                            >
                              <option value="paid">Paid</option>
                            </select>
                          ) : (
                            <select
                              value={item.status.toLowerCase()}
                              onChange={(e) => updatePOStatus.mutate({ id: item.id, status: e.target.value })}
                              className={`h-8 rounded border border-input bg-background px-2 text-sm ${PO_STATUS_COLORS[item.status.toLowerCase()] ?? ''}`}
                            >
                              {PO_STATUS_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.date ? format(new Date(item.date), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          {isPaid ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span tabIndex={0} className="inline-flex">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled
                                    className="pointer-events-none opacity-30"
                                    aria-label="Paid orders can't be deleted"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Paid orders can't be deleted</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deletePO.isPending}
                              onClick={() => {
                                if (confirm('Cancel this purchase order?')) deletePO.mutate(item.id);
                              }}
                              aria-label="Cancel purchase order"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  data.items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.reference}</TableCell>
                      <TableCell>{item.department ?? '-'}</TableCell>
                      <TableCell>{item.itemType ?? '-'}</TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(item.status)}>{item.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.date ? format(new Date(item.date), 'MMM d, yyyy') : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="border border-input bg-background text-white hover:bg-accent"
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="border border-input bg-background text-white hover:bg-accent"
              >
                Next
              </Button>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
