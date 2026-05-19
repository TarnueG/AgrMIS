import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileDown,
  Filter,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCircle2,
  Users,
  XCircle,
} from 'lucide-react';
import api, { getAccessToken } from '@/lib/api';
import { refreshModuleData } from '@/lib/module-refresh';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type AuditSummary = {
  cards: {
    eventsToday: number;
    failedLogins: number;
    permissionChanges: number;
    dataChanges: number;
    exports: number;
    criticalEvents: number;
    activeUsers: number;
    mostActiveModule: string;
  };
  timeline: Array<{
    key: string;
    label: string;
    items: AuditEvent[];
  }>;
};

type AuditEvent = {
  id: string;
  timestamp: string;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  eventType: string;
  subsystem: string | null;
  description: string;
  recordType: string | null;
  recordId: string | null;
  affectedRecord: string | null;
  severity: 'info' | 'warning' | 'critical' | 'security';
  ipAddress: string | null;
  userAgent: string | null;
  browser: string;
  action: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  rawEventType: string | null;
};

type AuditEventsResponse = {
  total: number;
  page: number;
  limit: number;
  events: AuditEvent[];
  filters: {
    actors: string[];
    roles: string[];
    subsystems: string[];
  };
};

type SuspiciousPayload = {
  repeatedFailedLogins: Array<{ actor: string; ipAddress: string | null; count: number; latestTimestamp: string }>;
  permissionChanges: AuditEvent[];
  deleteEvents: AuditEvent[];
  exportEvents: AuditEvent[];
  unusualHours: AuditEvent[];
};

const EVENT_OPTIONS = [
  'all',
  'login',
  'logout',
  'failed_login',
  'create',
  'update',
  'delete',
  'approve',
  'reject',
  'export',
  'stock_movement',
  'payment_recorded',
  'permission_change',
  'password_change',
  'status_change',
] as const;

const SEVERITY_OPTIONS = ['all', 'info', 'warning', 'critical', 'security'] as const;

const EVENT_LABELS: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  failed_login: 'Failed login',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  approve: 'Approve',
  reject: 'Reject',
  export: 'Export',
  stock_movement: 'Stock movement',
  payment_recorded: 'Payment recorded',
  permission_change: 'Permission change',
  password_change: 'Password change',
  status_change: 'Status change',
};

const SUBSYSTEM_LABELS: Record<string, string> = {
  settings: 'Access & Settings',
  inventory: 'Inventory',
  procurement: 'Procurement',
  sales_order_points: 'Sales',
  crm: 'CRM',
  production: 'Production',
  livestock: 'Livestock',
  finance: 'Finance',
  reports: 'Reports',
  human_capital: 'Human Capital',
  machinery: 'Machinery',
  land_parcels: 'Land Parcels',
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function iconForEvent(eventType: string) {
  switch (eventType) {
    case 'failed_login':
    case 'permission_change':
      return ShieldAlert;
    case 'export':
      return FileDown;
    case 'delete':
      return Trash2;
    case 'approve':
      return CheckCircle2;
    case 'reject':
      return XCircle;
    case 'stock_movement':
      return ArrowRightLeft;
    case 'password_change':
      return KeyRound;
    case 'login':
    case 'logout':
      return UserCircle2;
    default:
      return Clock3;
  }
}

function severityClass(severity: AuditEvent['severity']) {
  return {
    info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    critical: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    security: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200',
  }[severity];
}

function prettyModule(value: string | null) {
  if (!value) return 'System';
  return SUBSYSTEM_LABELS[value] ?? value.replace(/_/g, ' ');
}

function prettyJson(value: unknown) {
  if (value === null || value === undefined) return 'No value captured.';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AuditLogPanel({ prefilterUserId }: { prefilterUserId?: string }) {
  const { toast } = useToast();
  const { canExport } = usePermissions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState<(typeof EVENT_OPTIONS)[number]>('all');
  const [subsystem, setSubsystem] = useState('all');
  const [actor, setActor] = useState('');
  const [severity, setSeverity] = useState<(typeof SEVERITY_OPTIONS)[number]>('all');
  const [role, setRole] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const params = useMemo(() => {
    const query = new URLSearchParams({
      page: String(page),
      limit: '20',
      eventType,
      subsystem,
      actor,
      severity,
      role,
      search,
      actorId: prefilterUserId ?? '',
    });
    if (dateFrom) query.set('dateFrom', dateFrom);
    if (dateTo) query.set('dateTo', dateTo);
    return query.toString();
  }, [actor, dateFrom, dateTo, eventType, page, prefilterUserId, role, search, severity, subsystem]);

  const summaryQuery = useQuery({
    queryKey: ['audit-summary'],
    queryFn: () => api.get<AuditSummary>('/audit/summary'),
  });

  const eventsQuery = useQuery({
    queryKey: ['audit-events', params],
    queryFn: () => api.get<AuditEventsResponse>(`/audit/events?${params}`),
  });

  const suspiciousQuery = useQuery({
    queryKey: ['audit-suspicious'],
    queryFn: () => api.get<SuspiciousPayload>('/audit/suspicious'),
  });

  const detailQuery = useQuery({
    queryKey: ['audit-event', selectedEventId],
    queryFn: () => api.get<AuditEvent>(`/audit/events/${selectedEventId}`),
    enabled: !!selectedEventId,
  });

  const events = eventsQuery.data?.events ?? [];
  const total = eventsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (eventsQuery.data?.limit ?? 20)));

  const summaryCards = summaryQuery.data?.cards;
  const suspicious = suspiciousQuery.data;
  const selectedEvent = detailQuery.data;

  const handleExport = async () => {
    try {
      const token = getAccessToken();
      const response = await fetch(`/api/v1/audit/export?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'audit-log.csv';
      link.click();
      URL.revokeObjectURL(url);
      await refreshModuleData(queryClient, [['audit-summary'], ['audit-events'], ['audit-suspicious']]);
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const cardItems = [
    { title: 'Events Today', value: summaryCards?.eventsToday ?? 0, icon: ShieldCheck },
    { title: 'Failed Logins', value: summaryCards?.failedLogins ?? 0, icon: ShieldAlert },
    { title: 'Permission Changes', value: summaryCards?.permissionChanges ?? 0, icon: KeyRound },
    { title: 'Data Changes', value: summaryCards?.dataChanges ?? 0, icon: ArrowRightLeft },
    { title: 'Exports', value: summaryCards?.exports ?? 0, icon: FileDown },
    { title: 'Critical Events', value: summaryCards?.criticalEvents ?? 0, icon: AlertTriangle },
    { title: 'Active Users', value: summaryCards?.activeUsers ?? 0, icon: Users },
    { title: 'Most Active Module', value: prettyModule(summaryCards?.mostActiveModule ?? null), icon: Eye },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.98))] p-6 shadow-[0_30px_80px_rgba(2,6,23,0.45)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-100">Security Console</Badge>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-white">Audit Log</h2>
              <p className="text-sm text-slate-300">System activity, security events, and operational accountability.</p>
            </div>
          </div>
          <Button
            onClick={handleExport}
            disabled={!canExport('audit_logs')}
            className="border border-cyan-400/20 bg-slate-950/70 text-cyan-100 hover:bg-cyan-400/10"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cardItems.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="border-slate-800 bg-slate-950/45 text-white">
                <CardContent className="flex items-start justify-between p-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{card.title}</p>
                    <p className="mt-2 text-2xl font-semibold">{card.value}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-2 text-cyan-200">
                    <Icon className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="text-lg">Event Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {(summaryQuery.data?.timeline ?? []).map((group) => (
              <div key={group.key}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-800" />
                  <span className="text-xs uppercase tracking-[0.22em] text-slate-400">{group.label}</span>
                </div>
                <div className="space-y-3">
                  {group.items.map((item) => {
                    const Icon = iconForEvent(item.eventType);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedEventId(item.id)}
                        className="flex w-full items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-left transition hover:border-cyan-400/30 hover:bg-slate-900"
                      >
                        <div className="mt-0.5 rounded-xl border border-slate-700 bg-slate-950 p-2 text-cyan-200">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-white">{item.actorName}</span>
                            <span className="text-xs text-slate-500">{EVENT_LABELS[item.eventType] ?? item.eventType}</span>
                            <Badge className={cn('border text-[10px] uppercase', severityClass(item.severity))}>{item.severity}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-300">{item.description}</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                            <span>{prettyModule(item.subsystem)}</span>
                            <span>{item.affectedRecord ?? 'System scope'}</span>
                            <span>{formatDistanceToNowStrict(new Date(item.timestamp), { addSuffix: true })}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="text-lg">Suspicious Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Repeated Failed Logins</p>
              <div className="mt-3 space-y-3">
                {(suspicious?.repeatedFailedLogins ?? []).slice(0, 4).map((row) => (
                  <div key={`${row.actor}-${row.ipAddress}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{row.actor}</span>
                      <Badge className="border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200">{row.count} attempts</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{row.ipAddress ?? 'Unknown IP'} · {formatTimestamp(row.latestTimestamp)}</p>
                  </div>
                ))}
                {!suspiciousQuery.isLoading && !(suspicious?.repeatedFailedLogins ?? []).length && (
                  <p className="text-sm text-slate-500">No repeated login failures in the current window.</p>
                )}
              </div>
            </div>

            {[
              { title: 'Permission Changes', items: suspicious?.permissionChanges ?? [] },
              { title: 'Delete Events', items: suspicious?.deleteEvents ?? [] },
              { title: 'Export Events', items: suspicious?.exportEvents ?? [] },
              { title: 'Outside Normal Hours', items: suspicious?.unusualHours ?? [] },
            ].map((section) => (
              <div key={section.title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{section.title}</p>
                <div className="mt-3 space-y-2">
                  {section.items.slice(0, 3).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedEventId(event.id)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left transition hover:border-cyan-400/30"
                    >
                      <p className="text-sm text-white">{event.description}</p>
                      <p className="mt-1 text-xs text-slate-400">{event.actorName} · {formatTimestamp(event.timestamp)}</p>
                    </button>
                  ))}
                  {!suspiciousQuery.isLoading && !section.items.length && <p className="text-sm text-slate-500">No events flagged.</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-950 text-white">
        <CardHeader>
          <div className="flex items-center gap-2 text-slate-300">
            <Filter className="h-4 w-4" />
            <CardTitle className="text-lg">Filters</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search description or record ID" className="border-slate-800 bg-slate-900 text-white" />
          <select value={eventType} onChange={(e) => { setEventType(e.target.value as typeof eventType); setPage(1); }} className="h-10 rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-white">
            {EVENT_OPTIONS.map((option) => <option key={option} value={option}>{option === 'all' ? 'All event types' : EVENT_LABELS[option]}</option>)}
          </select>
          <select value={subsystem} onChange={(e) => { setSubsystem(e.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-white">
            <option value="all">All subsystems</option>
            {(eventsQuery.data?.filters.subsystems ?? []).map((value) => <option key={value} value={value}>{prettyModule(value)}</option>)}
          </select>
          <Input list="audit-actors" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} placeholder="Actor" className="border-slate-800 bg-slate-900 text-white" />
          <datalist id="audit-actors">
            {(eventsQuery.data?.filters.actors ?? []).map((value) => <option key={value} value={value} />)}
          </datalist>
          <select value={severity} onChange={(e) => { setSeverity(e.target.value as typeof severity); setPage(1); }} className="h-10 rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-white">
            {SEVERITY_OPTIONS.map((option) => <option key={option} value={option}>{option === 'all' ? 'All severities' : option}</option>)}
          </select>
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-white">
            <option value="all">All roles</option>
            {(eventsQuery.data?.filters.roles ?? []).map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
          </select>
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="border-slate-800 bg-slate-900 text-white" />
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="border-slate-800 bg-slate-900 text-white" />
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-950 text-white">
        <CardHeader>
          <CardTitle className="text-lg">Audit Table</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Subsystem</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Affected Record</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>IP / Browser</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsQuery.isLoading && (
                  <TableRow className="border-slate-800">
                    <TableCell colSpan={10} className="py-10 text-center text-slate-400">Loading audit events...</TableCell>
                  </TableRow>
                )}
                {!eventsQuery.isLoading && !events.length && (
                  <TableRow className="border-slate-800">
                    <TableCell colSpan={10} className="py-10 text-center text-slate-400">No audit events match the current filters.</TableCell>
                  </TableRow>
                )}
                {events.map((event) => (
                  <TableRow key={event.id} className="cursor-pointer border-slate-800 hover:bg-slate-900/70" onClick={() => setSelectedEventId(event.id)}>
                    <TableCell className="text-xs text-slate-300">{formatTimestamp(event.timestamp)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-white">{event.actorName}</p>
                        <p className="text-xs text-slate-500">{event.actorRole ? event.actorRole.replace(/_/g, ' ') : 'system'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-300">{event.actorRole ? event.actorRole.replace(/_/g, ' ') : 'System'}</TableCell>
                    <TableCell><Badge className="border-slate-700 bg-slate-900 text-slate-200">{EVENT_LABELS[event.eventType] ?? event.eventType}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-300">{prettyModule(event.subsystem)}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm text-slate-300">{event.description}</TableCell>
                    <TableCell className="text-sm text-slate-300">{event.affectedRecord ?? 'System scope'}</TableCell>
                    <TableCell><Badge className={cn('border uppercase', severityClass(event.severity))}>{event.severity}</Badge></TableCell>
                    <TableCell className="text-xs text-slate-400">{event.ipAddress ?? 'n/a'} / {event.browser}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="text-cyan-200 hover:bg-cyan-400/10 hover:text-cyan-100" onClick={(e) => { e.stopPropagation(); setSelectedEventId(event.id); }}>
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
            <span>{total} matching events</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="border-slate-800 bg-slate-900 text-white hover:bg-slate-800" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Previous
              </Button>
              <span>Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" className="border-slate-800 bg-slate-900 text-white hover:bg-slate-800" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selectedEventId} onOpenChange={(open) => !open && setSelectedEventId(null)}>
        <SheetContent side="right" className="w-full border-slate-800 bg-slate-950 text-white sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Event Details</SheetTitle>
            <SheetDescription className="text-slate-400">Who did what, where, when, and how risky it was.</SheetDescription>
          </SheetHeader>
          <ScrollArea className="mt-6 h-[calc(100vh-9rem)] pr-4">
            {!selectedEvent && detailQuery.isLoading && <p className="text-slate-400">Loading event details...</p>}
            {selectedEvent && (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ['Actor', selectedEvent.actorName],
                    ['Role', selectedEvent.actorRole ?? 'System'],
                    ['Subsystem', prettyModule(selectedEvent.subsystem)],
                    ['Event Type', EVENT_LABELS[selectedEvent.eventType] ?? selectedEvent.eventType],
                    ['Severity', selectedEvent.severity],
                    ['Timestamp', formatTimestamp(selectedEvent.timestamp)],
                    ['Affected Record', selectedEvent.affectedRecord ?? 'System scope'],
                    ['IP Address', selectedEvent.ipAddress ?? 'n/a'],
                    ['Browser', selectedEvent.browser],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
                      <p className="mt-2 text-sm text-slate-100">{value}</p>
                    </div>
                  ))}
                </div>

                <Card className="border-slate-800 bg-slate-900/70 text-white">
                  <CardHeader>
                    <CardTitle className="text-base">Description</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-300">{selectedEvent.description}</CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="border-slate-800 bg-slate-900/70 text-white">
                    <CardHeader>
                      <CardTitle className="text-base">Before Value JSON</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">{prettyJson(selectedEvent.beforeValue)}</pre>
                    </CardContent>
                  </Card>
                  <Card className="border-slate-800 bg-slate-900/70 text-white">
                    <CardHeader>
                      <CardTitle className="text-base">After Value JSON</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">{prettyJson(selectedEvent.afterValue)}</pre>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-slate-800 bg-slate-900/70 text-white">
                  <CardHeader>
                    <CardTitle className="text-base">User Agent</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-xs text-slate-200">{selectedEvent.userAgent ?? 'No user agent recorded.'}</pre>
                  </CardContent>
                </Card>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default AuditLogPanel;
