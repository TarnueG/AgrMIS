import { Request } from 'express';
import prisma from './prisma';

export type CanonicalAuditEventType =
  | 'login'
  | 'logout'
  | 'failed_login'
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'export'
  | 'stock_movement'
  | 'payment_recorded'
  | 'permission_change'
  | 'password_change'
  | 'status_change';

export type AuditEventType =
  | CanonicalAuditEventType
  | 'login_success'
  | 'login_failed'
  | 'profile_updated'
  | 'profile_picture_updated'
  | 'permission_changed'
  | 'role_changed'
  | 'settings_changed'
  | 'failed_authorization'
  | 'account_created'
  | 'user_deactivated'
  | 'user_activated'
  | 'customer_deactivated'
  | 'customer_activated'
  | 'asset_status_changed'
  | 'labor_task_created'
  | 'labor_task_updated'
  | 'payroll_paid'
  | 'leave_updated'
  | 'finance_transaction_created'
  | 'finance_transaction_updated'
  | 'finance_exported'
  | 'report_exported';

export type AuditSeverity = 'info' | 'warning' | 'critical' | 'security';

export interface AuditActor {
  id?: string | null;
  name?: string | null;
  role?: string | null;
}

interface AuditPayload {
  actor?: AuditActor | null;
  actorUserId?: string | null;
  eventType: AuditEventType;
  subsystem?: string | null;
  card?: string | null;
  action?: string | null;
  targetUserId?: string | null;
  description: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  severity?: AuditSeverity | null;
  recordType?: string | null;
  recordId?: string | null;
  recordLabel?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
  req?: Request | null;
}

const EVENT_TYPE_ALIASES: Record<string, CanonicalAuditEventType> = {
  login_success: 'login',
  login_failed: 'failed_login',
  login: 'login',
  logout: 'logout',
  profile_updated: 'update',
  profile_picture_updated: 'update',
  permission_changed: 'permission_change',
  permission_change: 'permission_change',
  role_changed: 'permission_change',
  settings_changed: 'update',
  failed_authorization: 'permission_change',
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
  failed_login: 'failed_login',
};

function normalizeEventType(eventType: AuditEventType, description: string, metadata?: Record<string, unknown> | null): CanonicalAuditEventType {
  if (EVENT_TYPE_ALIASES[eventType]) return EVENT_TYPE_ALIASES[eventType];

  const result = typeof metadata?.result === 'string' ? metadata.result.toLowerCase() : '';
  const status = typeof metadata?.status === 'string' ? metadata.status.toLowerCase() : '';
  const text = `${description} ${result} ${status}`.toLowerCase();

  if (text.includes('password')) return 'password_change';
  if (text.includes('export')) return 'export';
  if (text.includes('approve')) return 'approve';
  if (text.includes('reject') || text.includes('declin')) return 'reject';
  if (text.includes('delete') || text.includes('remove')) return 'delete';
  if (text.includes('payment') || text.includes('paid')) return 'payment_recorded';
  if (text.includes('stock') || text.includes('inventory movement') || text.includes('receipt')) return 'stock_movement';
  if (text.includes('status')) return 'status_change';
  return 'update';
}

function normalizeSeverity(eventType: CanonicalAuditEventType, provided?: AuditSeverity | null): AuditSeverity {
  if (provided) return provided;
  if (eventType === 'failed_login' || eventType === 'permission_change') return 'security';
  if (eventType === 'delete' || eventType === 'reject') return 'warning';
  if (eventType === 'password_change') return 'warning';
  if (eventType === 'export') return 'critical';
  return 'info';
}

export function clientInfo(req: Request): { ip: string | null; userAgent: string | null } {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim()) ?? req.ip ?? null;
  return { ip, userAgent: req.headers['user-agent'] ?? null };
}

export async function logAuditEvent(data: AuditPayload): Promise<void> {
  try {
    const reqUser = (data.req as any)?.user;
    const requestClient = data.req ? clientInfo(data.req) : { ip: null, userAgent: null };
    const actorId = data.actor?.id ?? data.actorUserId ?? reqUser?.userId ?? null;
    const actorName = data.actor?.name ?? reqUser?.fullName ?? null;
    const actorRole = data.actor?.role ?? reqUser?.roleName ?? null;
    const eventType = normalizeEventType(data.eventType, data.description, data.metadata);
    const severity = normalizeSeverity(eventType, data.severity);

    await (prisma as any).audit_events.create({
      data: {
        actor_user_id: actorId,
        event_type: eventType,
        subsystem: data.subsystem ?? null,
        card: data.card ?? null,
        action: data.action ?? eventType,
        target_user_id: data.targetUserId ?? null,
        description: data.description,
        ip_address: data.ipAddress ?? requestClient.ip ?? null,
        user_agent: data.userAgent ?? requestClient.userAgent ?? null,
        metadata: {
          ...(data.metadata ?? {}),
          severity,
          actorName,
          actorRole,
          recordType: data.recordType ?? null,
          recordId: data.recordId ?? null,
          recordLabel: data.recordLabel ?? null,
          beforeValue: data.beforeValue ?? null,
          afterValue: data.afterValue ?? null,
          rawEventType: data.eventType,
        },
      },
    });
  } catch {
    // Audit failures must never break the main request
  }
}
