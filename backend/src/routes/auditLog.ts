import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AuditSeverity, CanonicalAuditEventType } from '../lib/audit';

const router = Router();
const prismaAny = prisma as any;

router.use(requireAuth);

type AuditEventResponse = {
  id: string;
  timestamp: string;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  eventType: CanonicalAuditEventType;
  subsystem: string | null;
  description: string;
  recordType: string | null;
  recordId: string | null;
  affectedRecord: string | null;
  severity: AuditSeverity;
  ipAddress: string | null;
  userAgent: string | null;
  browser: string;
  action: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  rawEventType: string | null;
};

const EVENT_TYPE_LABELS: Record<CanonicalAuditEventType, string> = {
  login: 'Login',
  logout: 'Logout',
  failed_login: 'Failed Login',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  approve: 'Approve',
  reject: 'Reject',
  export: 'Export',
  stock_movement: 'Stock Movement',
  payment_recorded: 'Payment Recorded',
  permission_change: 'Permission Change',
  password_change: 'Password Change',
  status_change: 'Status Change',
};

function parseBrowser(userAgent: string | null | undefined) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg')) return 'Edge';
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari')) return 'Safari';
  return 'Browser';
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function startOfYesterday() {
  const d = startOfToday();
  d.setDate(d.getDate() - 1);
  return d;
}

function startOfWeek() {
  const d = startOfToday();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function toCanonicalEventType(eventType: string, description: string, metadata?: Record<string, unknown> | null): CanonicalAuditEventType {
  const raw = (eventType || '').toLowerCase();
  const map: Record<string, CanonicalAuditEventType> = {
    login_success: 'login',
    login: 'login',
    logout: 'logout',
    login_failed: 'failed_login',
    failed_login: 'failed_login',
    profile_updated: 'update',
    profile_picture_updated: 'update',
    permission_changed: 'permission_change',
    permission_change: 'permission_change',
    role_changed: 'permission_change',
    failed_authorization: 'permission_change',
    settings_changed: 'update',
    account_created: 'create',
    user_deactivated: 'status_change',
    user_activated: 'status_change',
    customer_deactivated: 'status_change',
    customer_activated: 'status_change',
    asset_status_changed: 'status_change',
    labor_task_created: 'create',
    labor_task_updated: 'update',
    payroll_paid: 'payment_recorded',
    leave_updated: 'status_change',
    finance_transaction_created: 'create',
    finance_transaction_updated: 'update',
    finance_exported: 'export',
    report_exported: 'export',
    create: 'create',
    update: 'update',
    delete: 'delete',
    approve: 'approve',
    reject: 'reject',
    export: 'export',
    stock_movement: 'stock_movement',
    payment_recorded: 'payment_recorded',
    password_change: 'password_change',
    status_change: 'status_change',
  };

  if (map[raw]) return map[raw];

  const text = `${description || ''} ${String(metadata?.result || '')}`.toLowerCase();
  if (text.includes('password')) return 'password_change';
  if (text.includes('export')) return 'export';
  if (text.includes('approve')) return 'approve';
  if (text.includes('reject') || text.includes('declin')) return 'reject';
  if (text.includes('delete') || text.includes('remove')) return 'delete';
  if (text.includes('payment') || text.includes('paid')) return 'payment_recorded';
  if (text.includes('stock') || text.includes('receipt')) return 'stock_movement';
  if (text.includes('status')) return 'status_change';
  return 'update';
}

function toSeverity(eventType: CanonicalAuditEventType, metadata?: Record<string, unknown> | null): AuditSeverity {
  const severity = metadata?.severity;
  if (severity === 'info' || severity === 'warning' || severity === 'critical' || severity === 'security') {
    return severity;
  }
  if (eventType === 'failed_login' || eventType === 'permission_change') return 'security';
  if (eventType === 'delete' || eventType === 'reject' || eventType === 'password_change') return 'warning';
  if (eventType === 'export') return 'critical';
  return 'info';
}

function formatRecord(recordType: string | null, recordId: string | null, recordLabel: string | null) {
  if (recordLabel) return recordLabel;
  if (!recordType) return null;
  if (!recordId) return recordType.replace(/_/g, ' ');
  const suffix = recordId.length > 10 ? recordId.slice(0, 8) : recordId;
  return `${recordType.replace(/_/g, ' ')} ${suffix}`;
}

async function loadUsers(events: any[]) {
  const userIds = [...new Set(events.map((event) => event.actor_user_id).filter(Boolean))];
  if (!userIds.length) return new Map<string, any>();
  const users = await prisma.users.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      full_name: true,
      username: true,
      email: true,
      role: { select: { name: true } },
    },
  });
  return new Map(users.map((user) => [user.id, user]));
}

function enrichEvents(events: any[], users: Map<string, any>): AuditEventResponse[] {
  return events.map((event) => {
    const metadata = (event.metadata || {}) as Record<string, unknown>;
    const actor = event.actor_user_id ? users.get(event.actor_user_id) : null;
    const eventType = toCanonicalEventType(event.event_type, event.description || '', metadata);
    const severity = toSeverity(eventType, metadata);
    const recordType = typeof metadata.recordType === 'string' ? metadata.recordType : null;
    const recordId = typeof metadata.recordId === 'string' ? metadata.recordId : null;
    const recordLabel = typeof metadata.recordLabel === 'string' ? metadata.recordLabel : null;
    const actorName =
      typeof metadata.actorName === 'string'
        ? metadata.actorName
        : actor?.full_name || actor?.username || actor?.email || 'System';
    const actorRole =
      typeof metadata.actorRole === 'string'
        ? metadata.actorRole
        : actor?.role?.name || null;

    return {
      id: event.id,
      timestamp: event.occurred_at instanceof Date ? event.occurred_at.toISOString() : new Date(event.occurred_at).toISOString(),
      actorId: event.actor_user_id ?? null,
      actorName,
      actorRole,
      eventType,
      subsystem: event.subsystem ?? null,
      description: event.description ?? `${EVENT_TYPE_LABELS[eventType]} event`,
      recordType,
      recordId,
      affectedRecord: formatRecord(recordType, recordId, recordLabel),
      severity,
      ipAddress: event.ip_address ?? null,
      userAgent: event.user_agent ?? null,
      browser: parseBrowser(event.user_agent),
      action: event.action ?? null,
      beforeValue: metadata.beforeValue ?? null,
      afterValue: metadata.afterValue ?? null,
      rawEventType: typeof metadata.rawEventType === 'string' ? metadata.rawEventType : event.event_type,
    };
  });
}

function matchesSearch(event: AuditEventResponse, search: string) {
  const needle = search.toLowerCase();
  return [
    event.description,
    event.affectedRecord || '',
    event.recordId || '',
    event.actorName,
    event.subsystem || '',
  ].some((value) => value.toLowerCase().includes(needle));
}

async function getFilteredEvents(req: any, opts?: { exportMode?: boolean }) {
  const {
    search,
    eventType = 'all',
    subsystem = 'all',
    actor = '',
    actorId = '',
    severity = 'all',
    role = 'all',
    dateFrom,
    dateTo,
    page = '1',
    limit = '25',
    dateRange,
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, Number.parseInt(page || '1', 10) || 1);
  const limitNum = opts?.exportMode ? 5000 : Math.min(100, Math.max(10, Number.parseInt(limit || '25', 10) || 25));

  const where: Record<string, unknown> = {};
  if (subsystem && subsystem !== 'all') where.subsystem = subsystem;

  const lowerEventType = eventType.toLowerCase();
  if (lowerEventType && lowerEventType !== 'all') {
    where.event_type = { in: [...new Set([lowerEventType, ...(lowerEventType === 'failed_login' ? ['login_failed'] : []), ...(lowerEventType === 'login' ? ['login_success'] : [])])] };
  }

  if (dateFrom || dateTo || dateRange) {
    const occurredAt: Record<string, Date> = {};
    if (dateRange === 'last7') occurredAt.gte = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (dateRange === 'last30') occurredAt.gte = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (dateRange === 'last90') occurredAt.gte = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    if (dateFrom) occurredAt.gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      occurredAt.lte = to;
    }
    where.occurred_at = occurredAt;
  }

  if (search) {
    where.description = { contains: search, mode: 'insensitive' };
  }

  let actorUserIds: string[] | undefined;
  if (actorId) {
    where.actor_user_id = actorId;
  } else if (actor || role !== 'all') {
    const matchingUsers = await prisma.users.findMany({
      where: {
        ...(actor
          ? {
              OR: [
                { full_name: { contains: actor, mode: 'insensitive' } },
                { username: { contains: actor, mode: 'insensitive' } },
                { email: { contains: actor, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(role !== 'all'
          ? {
              role: { name: { equals: role, mode: 'insensitive' } },
            }
          : {}),
      },
      select: { id: true },
    });
    actorUserIds = matchingUsers.map((user) => user.id);
    if (!actorUserIds.length) return { total: 0, page: pageNum, limit: limitNum, events: [], filters: { actors: [], roles: [], subsystems: [] } };
    where.actor_user_id = { in: actorUserIds };
  }

  const rawEvents = await prismaAny.audit_events.findMany({
    where,
    orderBy: { occurred_at: 'desc' },
    take: opts?.exportMode ? 5000 : 1500,
  });

  const users = await loadUsers(rawEvents);
  let events = enrichEvents(rawEvents, users);

  if (eventType && eventType !== 'all') {
    events = events.filter((event) => event.eventType === lowerEventType);
  }
  if (severity && severity !== 'all') {
    events = events.filter((event) => event.severity === severity);
  }
  if (search) {
    events = events.filter((event) => matchesSearch(event, search));
  }

  const filterActors = Array.from(new Set(events.map((event) => event.actorName).filter(Boolean))).slice(0, 50);
  const filterRoles = Array.from(new Set(events.map((event) => event.actorRole).filter(Boolean))) as string[];
  const filterSubsystems = Array.from(new Set(events.map((event) => event.subsystem).filter(Boolean))) as string[];

  const total = events.length;
  const paginated = opts?.exportMode ? events : events.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    events: paginated,
    filters: {
      actors: filterActors,
      roles: filterRoles.sort(),
      subsystems: filterSubsystems.sort(),
    },
  };
}

function buildTimeline(events: AuditEventResponse[]) {
  const now = Date.now();
  const today = startOfToday().getTime();
  const yesterday = startOfYesterday().getTime();
  const week = startOfWeek().getTime();

  const buckets = {
    just_now: [] as AuditEventResponse[],
    today: [] as AuditEventResponse[],
    yesterday: [] as AuditEventResponse[],
    this_week: [] as AuditEventResponse[],
  };

  for (const event of events) {
    const ts = new Date(event.timestamp).getTime();
    if (now - ts <= 60 * 60 * 1000) buckets.just_now.push(event);
    else if (ts >= today) buckets.today.push(event);
    else if (ts >= yesterday) buckets.yesterday.push(event);
    else if (ts >= week) buckets.this_week.push(event);
  }

  return [
    { key: 'just_now', label: 'Just now', items: buckets.just_now.slice(0, 4) },
    { key: 'today', label: 'Today', items: buckets.today.slice(0, 6) },
    { key: 'yesterday', label: 'Yesterday', items: buckets.yesterday.slice(0, 4) },
    { key: 'this_week', label: 'This week', items: buckets.this_week.slice(0, 6) },
  ].filter((group) => group.items.length > 0);
}

async function loadRecentEvents(req: any, max = 800) {
  const rawEvents = await prismaAny.audit_events.findMany({
    where: {
      occurred_at: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { occurred_at: 'desc' },
    take: max,
  });
  const users = await loadUsers(rawEvents);
  return enrichEvents(rawEvents, users);
}

router.get('/summary', (req, res, next) => requirePermission('audit_logs', 'view')(req, res, next), async (req, res) => {
  try {
    const events = await loadRecentEvents(req);
    const todayStart = startOfToday().getTime();
    const todayEvents = events.filter((event) => new Date(event.timestamp).getTime() >= todayStart);
    const activeUsers = new Set(todayEvents.map((event) => event.actorId).filter(Boolean)).size;
    const subsystemCounts = todayEvents.reduce<Record<string, number>>((acc, event) => {
      const key = event.subsystem || 'system';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const mostActiveModule = Object.entries(subsystemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'n/a';

    res.json({
      cards: {
        eventsToday: todayEvents.length,
        failedLogins: todayEvents.filter((event) => event.eventType === 'failed_login').length,
        permissionChanges: todayEvents.filter((event) => event.eventType === 'permission_change').length,
        dataChanges: todayEvents.filter((event) => ['create', 'update', 'delete', 'approve', 'reject', 'status_change'].includes(event.eventType)).length,
        exports: todayEvents.filter((event) => event.eventType === 'export').length,
        criticalEvents: todayEvents.filter((event) => event.severity === 'critical' || event.severity === 'security').length,
        activeUsers,
        mostActiveModule,
      },
      timeline: buildTimeline(events.slice(0, 30)),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load audit summary', code: 'DB_ERROR' });
  }
});

router.get('/events', (req, res, next) => requirePermission('audit_logs', 'view')(req, res, next), async (req, res) => {
  try {
    const payload = await getFilteredEvents(req);
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch audit events', code: 'DB_ERROR' });
  }
});

router.get('/events/:id', (req, res, next) => requirePermission('audit_logs', 'view')(req, res, next), async (req, res) => {
  try {
    const event = await prismaAny.audit_events.findUnique({ where: { id: req.params.id } });
    if (!event) return res.status(404).json({ error: 'Audit event not found', code: 'NOT_FOUND' });
    const users = await loadUsers([event]);
    const enriched = enrichEvents([event], users)[0];
    res.json(enriched);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch audit event details', code: 'DB_ERROR' });
  }
});

router.get('/suspicious', (req, res, next) => requirePermission('audit_logs', 'view')(req, res, next), async (_req, res) => {
  try {
    const events = await loadRecentEvents(_req);
    const repeatedFailedLogins = Object.values(
      events
        .filter((event) => event.eventType === 'failed_login')
        .reduce<Record<string, { actor: string; ipAddress: string | null; count: number; latestTimestamp: string }>>((acc, event) => {
          const key = `${event.actorName}|${event.ipAddress || 'unknown'}`;
          const current = acc[key] || {
            actor: event.actorName,
            ipAddress: event.ipAddress,
            count: 0,
            latestTimestamp: event.timestamp,
          };
          current.count += 1;
          current.latestTimestamp = event.timestamp;
          acc[key] = current;
          return acc;
        }, {}),
    )
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const permissionChanges = events.filter((event) => event.eventType === 'permission_change').slice(0, 6);
    const deleteEvents = events.filter((event) => event.eventType === 'delete').slice(0, 6);
    const exportEvents = events.filter((event) => event.eventType === 'export').slice(0, 6);
    const unusualHours = events
      .filter((event) => {
        const hour = new Date(event.timestamp).getHours();
        return hour < 6 || hour > 20;
      })
      .slice(0, 6);

    res.json({
      repeatedFailedLogins,
      permissionChanges,
      deleteEvents,
      exportEvents,
      unusualHours,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load suspicious activity', code: 'DB_ERROR' });
  }
});

async function sendCsvExport(req: any, res: any) {
  const payload = await getFilteredEvents(req, { exportMode: true });
  const header = ['Timestamp', 'Actor', 'Role', 'Event Type', 'Subsystem', 'Description', 'Affected Record', 'Severity', 'IP Address', 'Browser'];
  const rows = payload.events.map((event) => [
    event.timestamp,
    event.actorName,
    event.actorRole || '',
    event.eventType,
    event.subsystem || '',
    event.description,
    event.affectedRecord || '',
    event.severity,
    event.ipAddress || '',
    event.browser,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(csv);
}

router.get('/export', (req, res, next) => requirePermission('audit_logs', 'export')(req, res, next), async (req, res) => {
  try {
    await sendCsvExport(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to export audit events', code: 'DB_ERROR' });
  }
});

router.get('/', (req, res, next) => {
  const action = req.query.format === 'csv' ? 'export' : 'view';
  return requirePermission('audit_logs', action)(req, res, next);
}, async (req, res) => {
  try {
    if (req.query.format === 'csv') {
      return await sendCsvExport(req, res);
    }
    const payload = await getFilteredEvents(req);
    res.json({
      total: payload.total,
      page: payload.page,
      limit: payload.limit,
      events: payload.events.map((event) => ({
        id: event.id,
        occurredAt: event.timestamp,
        eventType: event.eventType,
        subsystem: event.subsystem,
        description: event.description,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        actor: event.actorId
          ? { id: event.actorId, fullName: event.actorName, username: null, email: null }
          : null,
        severity: event.severity,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch audit log', code: 'DB_ERROR' });
  }
});

export default router;
