import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'view' as const : req.method === 'POST' ? 'create' as const : req.method === 'DELETE' ? 'delete' as const : 'edit' as const;
  return requirePermission('human_capital', action)(req, res, next);
});

// Auto-complete any active task whose end date has fully passed, releasing its
// personnel/equipment back to the available pools (availability excludes resources
// tied to status='active' tasks, so completion frees them automatically).
async function autoCompleteDueTasks(farmId: string | undefined) {
  await prisma.$executeRaw`
    UPDATE farm_tasks SET status = 'completed', updated_at = NOW()
    WHERE farm_id = ${farmId}::uuid AND status = 'active'
      AND end_date IS NOT NULL AND end_date < CURRENT_DATE
  `;
}

router.get('/', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    await autoCompleteDueTasks(farmId);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT t.*, e.full_name AS personnel_name, e.personnel_id AS personnel_code,
             a.name AS equipment_name
      FROM farm_tasks t
      LEFT JOIN employees e ON e.id = t.personnel_id
      LEFT JOIN assets a ON a.id = t.equipment_id
      WHERE t.farm_id = ${farmId}::uuid AND t.status <> 'cancelled'
      ORDER BY t.created_at DESC
    `;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tasks', code: 'DB_ERROR' });
  }
});

// Personnel (daily + general/permanent, active, not on an active task) and
// operational equipment not currently tied to an active task.
router.get('/available', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    await autoCompleteDueTasks(farmId);
    const [personnel, equipment] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT id, full_name, personnel_id, employment_type, sector
        FROM employees
        WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL AND status = 'active'
          AND employment_type IN ('permanent', 'daily')
          AND id NOT IN (
            SELECT personnel_id FROM farm_tasks
            WHERE farm_id = ${farmId}::uuid AND status = 'active' AND personnel_id IS NOT NULL
          )
        ORDER BY full_name
      `,
      prisma.$queryRaw<any[]>`
        SELECT id, name, asset_type, model
        FROM assets
        WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL AND status = 'operational'
          AND id NOT IN (
            SELECT equipment_id FROM farm_tasks
            WHERE farm_id = ${farmId}::uuid AND status = 'active' AND equipment_id IS NOT NULL
          )
        ORDER BY name
      `,
    ]);
    res.json({ personnel, equipment });
  } catch {
    res.status(500).json({ error: 'Failed to fetch available resources', code: 'DB_ERROR' });
  }
});

const taskSchema = z.object({
  taskName: z.string().min(1),
  location: z.string().optional(),
  menRequired: z.number().int().min(1).default(1),
  personnelId: z.string().uuid().optional(),
  equipmentId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.post('/', async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO farm_tasks (farm_id, task_name, location, men_required, personnel_id, equipment_id, start_date, end_date, created_by)
      VALUES (${farmId}::uuid, ${d.taskName}, ${d.location ?? null}, ${d.menRequired},
              ${d.personnelId ?? null}::uuid, ${d.equipmentId ?? null}::uuid,
              ${d.startDate ? new Date(d.startDate) : null}::date,
              ${d.endDate ? new Date(d.endDate) : null}::date, ${userId}::uuid)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create task', code: 'DB_ERROR' });
  }
});

router.patch('/:id/complete', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      UPDATE farm_tasks SET status = 'completed', updated_at = NOW()
      WHERE id = ${req.params.id}::uuid AND farm_id = ${farmId}::uuid AND status = 'active'
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: 'Active task not found', code: 'NOT_FOUND' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to complete task', code: 'DB_ERROR' });
  }
});

export default router;
