import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

// Sets PostgreSQL session variable for Row-Level Security.
// Must run before any query on a tenant-scoped table.
export async function setFarmContext(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.farmId) return next();
  try {
    await prisma.$executeRaw`SELECT set_current_farm(${req.user.farmId}::uuid)`;
  } catch {
    // Non-fatal — admin role bypasses RLS at DB level
  }
  next();
}
