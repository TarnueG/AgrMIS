import prisma from './prisma';
import { invalidateCache } from './permissions';

// In-memory cache of deactivated user IDs — refreshed every 30 seconds
const deactivatedSet = new Set<string>();
let lastRefresh = 0;
const REFRESH_MS = 30_000;

async function refreshIfStale(): Promise<void> {
  if (Date.now() - lastRefresh < REFRESH_MS) return;
  lastRefresh = Date.now();
  const rows = await prisma.users.findMany({
    where: { is_active: false, deleted_at: null },
    select: { id: true },
  });
  deactivatedSet.clear();
  for (const r of rows) deactivatedSet.add(r.id);
}

export async function isUserActive(userId: string): Promise<boolean> {
  await refreshIfStale();
  return !deactivatedSet.has(userId);
}

export async function deactivateUser(userId: string): Promise<void> {
  const user = await (prisma as any).users.findUnique({
    where: { id: userId },
    select: {
      role_id: true,
      linked_customer_id: true,
      employees: { select: { id: true, farm_id: true }, take: 1 },
    },
  });

  await prisma.users.update({
    where: { id: userId },
    data: { is_active: false, deactivated_at: new Date(), updated_at: new Date() },
  });
  await prisma.sessions.deleteMany({ where: { user_id: userId } });
  deactivatedSet.add(userId);

  if (user) {
    const farmId = user.employees[0]?.farm_id ?? null;
    invalidateCache(user.role_id, farmId);

    // Sync linked customer
    if (user.linked_customer_id) {
      await (prisma as any).customers.updateMany({
        where: { id: user.linked_customer_id, deleted_at: null },
        data: { is_active: false, deactivated_at: new Date() },
      });
    }

    // Sync linked employee — set inactive (not terminated)
    if (user.employees[0]) {
      await (prisma as any).employees.updateMany({
        where: { user_id: userId, deleted_at: null, status: { not: 'terminated' } },
        data: { status: 'inactive', updated_at: new Date() },
      });
    }
  }
}

export async function reactivateUser(userId: string): Promise<void> {
  const user = await (prisma as any).users.findUnique({
    where: { id: userId },
    select: {
      linked_customer_id: true,
      employees: { select: { id: true }, take: 1 },
    },
  });

  await prisma.users.update({
    where: { id: userId },
    data: { is_active: true, deactivated_at: null, updated_at: new Date() },
  });
  deactivatedSet.delete(userId);

  if (user) {
    // Sync linked customer
    if (user.linked_customer_id) {
      await (prisma as any).customers.updateMany({
        where: { id: user.linked_customer_id, deleted_at: null },
        data: { is_active: true, deactivated_at: null },
      });
    }

    // Restore linked employee to active only if they were set inactive (not terminated)
    if (user.employees[0]) {
      await (prisma as any).employees.updateMany({
        where: { user_id: userId, deleted_at: null, status: 'inactive' },
        data: { status: 'active', updated_at: new Date() },
      });
    }
  }
}

export async function findLinkedUserId(type: 'personnel' | 'customer', sourceId: string): Promise<string | null> {
  if (type === 'personnel') {
    const emp = await prisma.employees.findFirst({
      where: { id: sourceId, deleted_at: null },
      select: { user_id: true },
    });
    return (emp as any)?.user_id ?? null;
  }
  const user = await prisma.users.findFirst({
    where: { linked_customer_id: sourceId, deleted_at: null },
    select: { id: true },
  });
  return user?.id ?? null;
}
