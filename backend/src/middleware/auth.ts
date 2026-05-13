import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isUserActive } from '../lib/userStatus';
import { getPermissions } from '../lib/permissions';

export interface AuthUser {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName: string;
  farmId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser & { type: string };
    if (payload.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type', code: 'INVALID_TOKEN' });
    }
    const active = await isUserActive(payload.userId);
    if (!active) {
      return res.status(401).json({ error: 'Account has been deactivated', code: 'ACCOUNT_DEACTIVATED' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid', code: 'TOKEN_EXPIRED' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    if (!roles.includes(req.user.roleName)) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
    }
    next();
  };
}

export function requirePermission(subsystem: string, action: 'view' | 'create' | 'edit' | 'delete') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    // Admins bypass all CRUD permission checks
    if (req.user.roleName === 'admin') return next();

    try {
      const perms = await getPermissions(req.user.roleId, req.user.roleName, req.user.farmId);
      const p = perms[subsystem];
      const allowed =
        action === 'view'   ? p?.canView   :
        action === 'create' ? p?.canCreate :
        action === 'edit'   ? p?.canEdit   :
        p?.canDelete;
      if (!allowed) {
        return res.status(403).json({ error: 'Permission denied', code: 'FORBIDDEN' });
      }
      return next();
    } catch {
      return res.status(500).json({ error: 'Permission check failed', code: 'PERM_ERROR' });
    }
  };
}
