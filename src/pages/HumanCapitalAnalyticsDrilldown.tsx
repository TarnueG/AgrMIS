import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, RefreshCw, Inbox } from 'lucide-react';

const TITLES: Record<string, string> = {
  workforce: 'Total Workforce', employees: 'Employees', 'daily-workers': 'Daily Workers',
  'top-performers': 'Top Performers', performance: 'Workforce Performance', 'job-position': 'Job Positions',
  demographics: 'Workforce Demographics', contractors: 'Contractors', attendance: 'Attendance (Last 30 Days)',
  tasks: 'Tasks', schedule: 'Scheduled Tasks',
};
const PAGE_SIZE = 25;
const cap = (s?: string | null) => s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '-';
function statusBadge(s: string): string {
  const v = String(s).toLowerCase();
  if (v === 'active' || v === 'present' || v === 'completed' || v === 'finished' || v === 'paid') return 'bg-success/20 text-success';
  if (v === 'in_progress' || v === 'half_day' || v === 'pending' || v === 'leave') return 'bg-amber-500/20 text-amber-400';
  if (v === 'inactive' || v === 'absent' || v === 'suspended') return 'bg-destructive/20 text-destructive';
  return 'bg-muted/50 text-muted-foreground';
}

function SkeletonRows({ cols }: { cols: number }) {
  return <>{Array.from({ length: 7 }, (_, i) => <TableRow key={i} aria-hidden>{Array.from({ length: cols }, (_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" style={{ width: j === 0 ? '110px' : '90px' }} /></TableCell>)}</TableRow>)}</>;
}

export default function HumanCapitalAnalyticsDrilldown() {
  const { metric = '' } = useParams<{ metric: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['hc-drilldown', metric, page],
    queryFn: () => api.get(`/hr/analytics/details/${metric}?page=${page}&pageSize=${PAGE_SIZE}`),
    enabled: !!metric,
    staleTime: 15_000,
  });

  const isPeople = ['workforce', 'employees', 'daily-workers', 'top-performers', 'performance', 'job-position', 'demographics'].includes(metric);
  const isContractors = metric === 'contractors';
  const isAttendance = metric === 'attendance';
  const isTasks = metric === 'tasks' || metric === 'schedule';

  const cols = isPeople ? 6 : isContractors ? 6 : isAttendance ? 5 : 6;
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const items: any[] = data?.items ?? [];

  let headers: string[] = [];
  let rows: React.ReactNode = null;
  if (data && !isLoading && !isError) {
    if (isPeople) {
      headers = ['Name', 'Code', 'Job Title', 'Sector', 'Type', 'Days Worked'];
      rows = items.map(e => <TableRow key={e.id}><TableCell className="font-medium">{e.name}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{e.code ?? '-'}</TableCell><TableCell>{e.jobTitle}</TableCell><TableCell>{cap(e.sector)}</TableCell><TableCell><Badge className={statusBadge(e.status)}>{cap(e.employmentType)}</Badge></TableCell><TableCell className="tabular-nums">{Number(e.daysWorked).toLocaleString()}</TableCell></TableRow>);
    } else if (isContractors) {
      headers = ['Name', 'Code', 'Contract', 'Sector', 'Status', 'Period'];
      rows = items.map(c => <TableRow key={c.id}><TableCell className="font-medium">{c.name}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{c.code ?? '-'}</TableCell><TableCell>{c.contractType}</TableCell><TableCell>{cap(c.sector)}</TableCell><TableCell><Badge className={statusBadge(c.status)}>{cap(c.status)}</Badge></TableCell><TableCell className="text-muted-foreground text-xs">{c.startDate ? format(new Date(c.startDate), 'MMM d') : '-'}{c.endDate ? ` – ${format(new Date(c.endDate), 'MMM d')}` : ''}</TableCell></TableRow>);
    } else if (isAttendance) {
      headers = ['Name', 'Job Title', 'Status', 'Hours', 'Date'];
      rows = items.map(l => <TableRow key={l.id}><TableCell className="font-medium">{l.name}</TableCell><TableCell>{l.jobTitle}</TableCell><TableCell><Badge className={statusBadge(l.status)}>{cap(l.status)}</Badge></TableCell><TableCell className="tabular-nums">{l.hours != null ? l.hours : '-'}</TableCell><TableCell className="text-muted-foreground">{l.date ? format(new Date(l.date), 'MMM d, yyyy') : '-'}</TableCell></TableRow>);
    } else if (isTasks) {
      headers = ['Task', 'Assignee', 'Equipment', 'Status', 'Start', 'End'];
      rows = items.map(t => <TableRow key={t.id}><TableCell className="font-medium">{t.title}</TableCell><TableCell>{t.assignee}</TableCell><TableCell>{t.equipment}</TableCell><TableCell><Badge className={statusBadge(t.status)}>{cap(t.status)}</Badge></TableCell><TableCell className="text-muted-foreground">{t.start ? format(new Date(t.start), 'MMM d, HH:mm') : '-'}</TableCell><TableCell className="text-muted-foreground">{t.due ? format(new Date(t.due), 'MMM d, HH:mm') : '-'}</TableCell></TableRow>);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/human-capital/analytics')} aria-label="Back to analytics" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{TITLES[metric] ?? 'Details'}</h1>
            {!isLoading && !isError && <p className="text-sm text-muted-foreground">{total} record{total !== 1 ? 's' : ''}</p>}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>{(headers.length ? headers : Array.from({ length: cols }, () => '')).map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {isLoading ? <SkeletonRows cols={cols} /> : isError ? (
                  <TableRow><TableCell colSpan={cols} className="py-8"><div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"><p className="text-sm text-destructive">Couldn't load.</p><Button size="sm" variant="outline" onClick={() => refetch()} className="border border-input bg-background text-white hover:bg-accent"><RefreshCw className="h-3 w-3 mr-1" />Retry</Button></div></TableCell></TableRow>
                ) : !items.length ? (
                  <TableRow><TableCell colSpan={cols} className="py-14 text-center"><Inbox className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" /><p className="text-sm text-muted-foreground">No records.</p></TableCell></TableRow>
                ) : rows}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="border border-input bg-background text-white hover:bg-accent">Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="border border-input bg-background text-white hover:bg-accent">Next</Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
