import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, AuthUser } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
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

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid input', code: 'VALIDATION_ERROR' });
  }

  const { email, password } = result.data;

  const user = await prisma.users.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deleted_at: null },
    include: { role: true },
  });

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
  }

  const farmId = await getFarmId(user.id);

  const tokenPayload: AuthUser = {
    userId: user.id,
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
  return res.json({ message: 'Logged out' });
});

// POST /api/v1/auth/register
// Admin-only: creates a new user account
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

  const fieldStaffRole = await prisma.roles.findFirst({ where: { name: 'field_staff' } });
  if (!fieldStaffRole) {
    return res.status(500).json({ error: 'Roles not seeded', code: 'SETUP_REQUIRED' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.users.create({
    data: {
      role_id: fieldStaffRole.id,
      full_name: fullName,
      email,
      password_hash: passwordHash,
    },
    include: { role: true },
  });

  return res.status(201).json({
    user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role.name, farmId: null },
  });
});

export default router;
