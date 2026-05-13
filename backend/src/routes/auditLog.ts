import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);
const isAdmin = requireRole('admin');

// GET /api/v1/audit-log
// Query params: eventType, subsystem, dateRange (last7|last30|last90), page, limit, format=csv
router.get('/', isAdmin, async (req, res) => {
  const { eventType, subsystem, dateRange, page = '1', limit = '50', format } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = format === 'csv' ? 1000 : Math.min(100, Math.max(1, parseInt(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  const where: Record<string, unknown> = {};
  if (eventType && eventType !== 'all') where.event_type = eventType;
  if (subsystem && subsystem !== 'all') where.subsystem = subsystem;

  const now = new Date();
  if (dateRange === 'last7') {
    where.occurred_at = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
  } else if (dateRange === 'last30') {
    where.occurred_at = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
  } else if (dateRange === 'last90') {
    where.occurred_at = { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
  }

  try {
    const [total, events] = await Promise.all([
      (prisma as any).audit_events.count({ where }),
      (prisma as any).audit_events.findMany({
        where,
        orderBy: { occurred_at: 'desc' },
        skip: offset,
        take: limitNum,
      }),
    ]);

    const userIds = [
      ...new Set([
        ...events.map((e: any) => e.actor_user_id),
        ...events.map((e: any) => e.target_user_id),
      ].filter(Boolean)),
    ];

    const users = userIds.length
      ? await (prisma as any).users.findMany({
          where: { id: { in: userIds } },
          select: { id: true, full_name: true, username: true, email: true },
        })
      : [];

    const userMap: Record<string, any> = Object.fromEntries(users.map((u: any) => [u.id, u]));

    const enriched = events.map((e: any) => ({
      id: e.id,
      occurredAt: e.occurred_at,
      eventType: e.event_type,
      subsystem: e.subsystem,
      card: e.card,
      action: e.action,
      description: e.description,
      ipAddress: e.ip_address,
      userAgent: e.user_agent,
      metadata: e.metadata,
      actor: e.actor_user_id
        ? { id: e.actor_user_id, fullName: userMap[e.actor_user_id]?.full_name ?? 'Unknown', username: userMap[e.actor_user_id]?.username ?? null, email: userMap[e.actor_user_id]?.email ?? null }
        : null,
      target: e.target_user_id
        ? { id: e.target_user_id, fullName: userMap[e.target_user_id]?.full_name ?? 'Unknown', username: userMap[e.target_user_id]?.username ?? null }
        : null,
    }));

    if (format === 'csv') {
      const header = ['Timestamp', 'Actor', 'Event Type', 'Description', 'Subsystem', 'IP Address', 'User Agent'];
      const rows = enriched.map((e: any) => [
        new Date(e.occurredAt).toISOString(),
        e.actor?.fullName ?? 'System',
        e.eventType,
        e.description ?? '',
        e.subsystem ?? '',
        e.ipAddress ?? '',
        e.userAgent ?? '',
      ]);
      const csv = [header, ...rows]
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
      return res.send(csv);
    }

    return res.json({ total, page: pageNum, limit: limitNum, events: enriched });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch audit log', code: 'DB_ERROR' });
  }
});

export default router;
