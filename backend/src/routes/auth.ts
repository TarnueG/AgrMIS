import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, AuthUser } from '../middleware/auth';
import { logAuditEvent, clientInfo } from '../lib/audit';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { getPermissions, VALID_ROLE_NAMES } from '../lib/permissions';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(payload: Omit<AuthUser, never>): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );
}

function signRefreshToken(userId: string): string {
  return jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  );
}

async function getFarmId(userId: string): Promise<string | null> {
  const employee = await prisma.employees.findFirst({
    where: { user_id: userId, deleted_at: null },
    select: { farm_id: true },
  });
  return employee?.farm_id ?? null;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('pbkdf2:')) return verifyPassword(password, stored);
  // Legacy bcrypt
  return bcrypt.compare(password, stored);
}

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid input', code: 'VALIDATION_ERROR' });
  }

  const { identifier, password } = result.data;

  const user = await prisma.users.findFirst({
    where: {
      deleted_at: null,
      OR: [
        { email: { equals: identifier, mode: 'insensitive' } },
        { username: { equals: identifier, mode: 'insensitive' } },
      ],
    },
    include: { role: true },
  });

  const valid = user ? await checkPassword(password, user.password_hash) : false;

  if (!user || !valid) {
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ eventType: 'login_failed', description: `Failed login attempt for ${identifier}`, ipAddress: ip, userAgent });
    return res.status(401).json({ error: 'Invalid username/email or password', code: 'INVALID_CREDENTIALS' });
  }

  if (!VALID_ROLE_NAMES.has(user.role.name)) {
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ eventType: 'login_failed', description: `Login rejected — unknown role '${user.role.name}' for ${identifier}`, ipAddress: ip, userAgent });
    return res.status(403).json({ error: 'Account role is not recognized. Contact your administrator.', code: 'INVALID_ROLE' });
  }

  const farmId = await getFarmId(user.id);

  const tokenPayload: AuthUser = {
    userId: user.id,
    username: user.username ?? '',
    fullName: user.full_name,
    email: user.email,
    roleId: user.role_id,
    roleName: user.role.name,
    farmId,
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(user.id);

  await prisma.sessions.create({
    data: {
      user_id: user.id,
      token_hash: hashToken(refreshToken),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ip_address: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
    },
  });

  await prisma.users.update({
    where: { id: user.id },
    data: { last_login: new Date() },
  });

  const { ip, userAgent } = clientInfo(req);
  logAuditEvent({ actorUserId: user.id, eventType: 'login_success', description: `${user.full_name} logged in`, ipAddress: ip, userAgent });

  return res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role.name, farmId },
  });
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required', code: 'TOKEN_REQUIRED' });
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { userId: string; type: string };
    if (payload.type !== 'refresh') throw new Error('Invalid type');

    const session = await prisma.sessions.findFirst({
      where: { token_hash: hashToken(refreshToken), expires_at: { gt: new Date() } },
      include: { user: { include: { role: true } } },
    });

    if (!session) {
      return res.status(401).json({ error: 'Session expired or not found', code: 'SESSION_EXPIRED' });
    }

    const farmId = await getFarmId(session.user_id);

    const tokenPayload: AuthUser = {
      userId: session.user.id,
      username: session.user.username ?? '',
      fullName: session.user.full_name,
      email: session.user.email,
      roleId: session.user.role_id,
      roleName: session.user.role.name,
      farmId,
    };

    return res.json({
      accessToken: signAccessToken(tokenPayload),
      user: { id: session.user.id, fullName: session.user.full_name, email: session.user.email, role: session.user.role.name, farmId },
    });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_TOKEN' });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await prisma.sessions.deleteMany({ where: { token_hash: hashToken(refreshToken) } });
  }
  const { ip, userAgent } = clientInfo(req);
  logAuditEvent({ actorUserId: req.user!.userId, eventType: 'logout', description: `${req.user!.fullName} logged out`, ipAddress: ip, userAgent });
  return res.json({ message: 'Logged out' });
});

// GET /api/v1/auth/permissions
router.get('/permissions', requireAuth, async (req, res) => {
  const { roleId, roleName, farmId } = req.user!;
  try {
    const permissions = await getPermissions(roleId, roleName, farmId);
    return res.json({ role: roleName, permissions });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch permissions', code: 'DB_ERROR' });
  }
});

// GET /api/v1/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

// POST /api/v1/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const { currentPassword, newPassword } = parsed.data;

  try {
    const user = await prisma.users.findUnique({
      where: { id: req.user!.userId },
      select: { password_hash: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

    const valid = await checkPassword(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect', code: 'INVALID_PASSWORD' });

    const newHash = hashPassword(newPassword);
    await prisma.users.update({
      where: { id: req.user!.userId },
      data: { password_hash: newHash, updated_at: new Date() },
    });

    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, eventType: 'settings_changed', subsystem: 'settings', description: 'Password changed', ipAddress: ip, userAgent });

    return res.json({ message: 'Password updated' });
  } catch {
    return res.status(500).json({ error: 'Failed to update password', code: 'DB_ERROR' });
  }
});

// POST /api/v1/auth/register (admin-only account creation fallback)
router.post('/register', async (req, res) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const { email, password, fullName } = result.data;

  const existing = await prisma.users.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (existing) {
    return res.status(409).json({ error: 'Email already registered', code: 'EMAIL_TAKEN' });
  }

  const customerRole = await prisma.roles.findFirst({ where: { name: 'customer' } });
  if (!customerRole) {
    return res.status(500).json({ error: 'Roles not seeded', code: 'SETUP_REQUIRED' });
  }

  const user = await prisma.users.create({
    data: {
      role_id: customerRole.id,
      full_name: fullName,
      email,
      password_hash: hashPassword(password),
    },
    include: { role: true },
  });

  return res.status(201).json({
    user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role.name, farmId: null },
  });
});

export default router;
