import { Request } from 'express';
import prisma from './prisma';

export type AuditEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
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
  | 'customer_activated';

interface AuditPayload {
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
}

export async function logAuditEvent(data: AuditPayload): Promise<void> {
  try {
    await (prisma as any).audit_events.create({
      data: {
        actor_user_id: data.actorUserId ?? null,
        event_type: data.eventType,
        subsystem: data.subsystem ?? null,
        card: data.card ?? null,
        action: data.action ?? null,
        target_user_id: data.targetUserId ?? null,
        description: data.description,
        ip_address: data.ipAddress ?? null,
        user_agent: data.userAgent ?? null,
        metadata: data.metadata ?? undefined,
      },
    });
  } catch {
    // Audit failures must never break the main request
  }
}

export function clientInfo(req: Request): { ip: string | null; userAgent: string | null } {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim()) ?? req.ip ?? null;
  return { ip, userAgent: req.headers['user-agent'] ?? null };
}
