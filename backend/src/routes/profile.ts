import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { logAuditEvent, clientInfo } from '../lib/audit';

const router = Router();
router.use(requireAuth);

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp)'));
  },
});

function generateUsername(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const firstName = (parts[0] ?? 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
  const lastInitial = parts.length > 1 ? (parts[parts.length - 1][0] ?? '').toLowerCase() : '';
  return firstName + lastInitial;
}

// GET /api/v1/profile
router.get('/', async (req, res) => {
  try {
    const user = await (prisma as any).users.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        full_name: true,
        email: true,
        username: true,
        profile_picture_url: true,
        role: { select: { id: true, name: true } },
        employees: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' as const },
          take: 1,
          select: {
            job_title: true,
            department: true,
            sector: true,
            employment_type: true,
            personnel_id: true,
            date_hired: true,
            email: true,
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

    const employee = user.employees[0] ?? null;
    const defaultUsername = generateUsername(user.full_name);

    return res.json({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      username: user.username ?? defaultUsername,
      profilePictureUrl: user.profile_picture_url ?? null,
      role: user.role.name,
      roleId: user.role.id,
      employee: employee ? {
        jobTitle: employee.job_title,
        department: employee.department,
        sector: employee.sector,
        employmentType: employee.employment_type,
        personnelId: employee.personnel_id,
        dateHired: employee.date_hired,
        email: employee.email,
      } : null,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch profile', code: 'DB_ERROR' });
  }
});

// PATCH /api/v1/profile
router.patch('/', async (req, res) => {
  const schema = z.object({
    username: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/, 'Username must be lowercase letters, numbers, or underscores').optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });

  const { username } = parsed.data;
  try {
    if (username) {
      const conflict = await (prisma as any).users.findFirst({
        where: { username, id: { not: req.user!.userId }, deleted_at: null },
      });
      if (conflict) return res.status(409).json({ error: 'Username already taken', code: 'USERNAME_TAKEN' });
    }
    await (prisma as any).users.update({
      where: { id: req.user!.userId },
      data: { ...(username ? { username } : {}), updated_at: new Date() },
    });
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, eventType: 'profile_updated', subsystem: 'settings', description: username ? `Username changed to @${username}` : 'Profile updated', ipAddress: ip, userAgent });
    return res.json({ message: 'Profile updated' });
  } catch {
    return res.status(500).json({ error: 'Failed to update profile', code: 'DB_ERROR' });
  }
});

// POST /api/v1/profile/picture
router.post('/picture', upload.single('picture'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE' });
  try {
    const existing = await (prisma as any).users.findUnique({
      where: { id: req.user!.userId },
      select: { profile_picture_url: true },
    });
    if (existing?.profile_picture_url) {
      const oldFilename = path.basename(existing.profile_picture_url);
      const oldPath = path.join(UPLOADS_DIR, oldFilename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const pictureUrl = `/uploads/${req.file.filename}`;
    await (prisma as any).users.update({
      where: { id: req.user!.userId },
      data: { profile_picture_url: pictureUrl, updated_at: new Date() },
    });
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, eventType: 'profile_picture_updated', subsystem: 'settings', description: 'Profile picture updated', ipAddress: ip, userAgent });
    return res.json({ profilePictureUrl: pictureUrl });
  } catch {
    return res.status(500).json({ error: 'Failed to save picture', code: 'DB_ERROR' });
  }
});

export default router;
