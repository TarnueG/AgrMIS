import { Request } from 'express';
import { logAuditEvent, type AuditSeverity, type AuditEventType } from '../lib/audit';

type AuditOptions = {
  req?: Request | null;
  actorUserId?: string | null;
  eventType: AuditEventType;
  subsystem: string;
  description: string;
  severity?: AuditSeverity;
  recordType?: string | null;
  recordId?: string | null;
  recordLabel?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
  metadata?: Record<string, unknown> | null;
  action?: string | null;
  card?: string | null;
};

export async function recordAuditEvent(options: AuditOptions) {
  await logAuditEvent({
    req: options.req ?? null,
    actorUserId: options.actorUserId ?? null,
    eventType: options.eventType,
    subsystem: options.subsystem,
    description: options.description,
    severity: options.severity ?? 'info',
    recordType: options.recordType ?? null,
    recordId: options.recordId ?? null,
    recordLabel: options.recordLabel ?? null,
    beforeValue: options.beforeValue,
    afterValue: options.afterValue,
    metadata: options.metadata ?? null,
    action: options.action ?? null,
    card: options.card ?? null,
  });
}
