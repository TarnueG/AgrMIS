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

// Release a task's resources: equipment goes back to Operational and every assigned
// person is unassigned (spec 3.4). Used on completion (manual + auto).
async function releaseTask(tx: any, taskId: string) {
  await tx.$executeRaw`
    UPDATE assets SET status = 'operational', updated_at = NOW()
    WHERE status = 'active' AND id IN (SELECT asset_id FROM farm_task_equipment WHERE task_id = ${taskId}::uuid)
  `;
  await tx.$executeRaw`DELETE FROM farm_task_personnel WHERE task_id = ${taskId}::uuid`;
}

// Auto-complete any active task whose end date has fully passed, releasing its
// personnel/equipment back to the available pools.
async function autoCompleteDueTasks(farmId: string | undefined) {
  const due = await prisma.$queryRaw<any[]>`
    SELECT id FROM farm_tasks
    WHERE farm_id = ${farmId}::uuid AND status = 'active' AND end_date IS NOT NULL AND end_date < NOW()
  `;
  for (const t of due) {
    await prisma.$transaction(async (tx) => {
      await releaseTask(tx, t.id);
      await tx.$executeRaw`UPDATE farm_tasks SET status = 'completed', updated_at = NOW() WHERE id = ${t.id}::uuid`;
    });
  }
}

router.get('/', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    await autoCompleteDueTasks(farmId);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT t.*,
        COALESCE((SELECT json_agg(json_build_object('id', e.id, 'name', e.full_name) ORDER BY e.full_name) FROM farm_task_personnel ftp JOIN employees e ON e.id = ftp.employee_id WHERE ftp.task_id = t.id), '[]'::json) AS personnel,
        COALESCE((SELECT json_agg(json_build_object('id', a.id, 'name', a.name) ORDER BY a.name) FROM farm_task_equipment fte JOIN assets a ON a.id = fte.asset_id WHERE fte.task_id = t.id), '[]'::json) AS equipment
      FROM farm_tasks t
      WHERE t.farm_id = ${farmId}::uuid AND t.status <> 'cancelled'
      ORDER BY t.created_at DESC
    `;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tasks', code: 'DB_ERROR' });
  }
});

// Personnel (active, not on an active task) and operational equipment not on an active task.
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
            SELECT ftp.employee_id FROM farm_task_personnel ftp
            JOIN farm_tasks t ON t.id = ftp.task_id
            WHERE t.farm_id = ${farmId}::uuid AND t.status = 'active'
          )
        ORDER BY full_name
      `,
      prisma.$queryRaw<any[]>`
        SELECT id, name, asset_type, model
        FROM assets
        WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL AND status = 'operational'
          AND id NOT IN (
            SELECT fte.asset_id FROM farm_task_equipment fte
            JOIN farm_tasks t ON t.id = fte.task_id
            WHERE t.farm_id = ${farmId}::uuid AND t.status = 'active'
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
  equipmentRequired: z.number().int().min(0).default(0),
  personnelIds: z.array(z.string().uuid()).default([]),
  equipmentIds: z.array(z.string().uuid()).default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Selected personnel must equal men required; selected equipment must equal equipment required (spec 3.4).
function validateCounts(d: z.infer<typeof taskSchema>): string | null {
  if (d.personnelIds.length !== d.menRequired) return `Select exactly ${d.menRequired} personnel (${d.personnelIds.length} selected)`;
  if (d.equipmentIds.length !== d.equipmentRequired) return `Select exactly ${d.equipmentRequired} equipment (${d.equipmentIds.length} selected)`;
  return null;
}

async function setEquipmentStatus(tx: any, ids: string[], status: string) {
  for (const id of ids) {
    await tx.$executeRaw`UPDATE assets SET status = ${status}, updated_at = NOW() WHERE id = ${id}::uuid`;
  }
}

router.post('/', async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const countErr = validateCounts(d);
  if (countErr) return res.status(400).json({ error: countErr, code: 'VALIDATION_ERROR' });
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  try {
    const task = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`
        INSERT INTO farm_tasks (farm_id, task_name, location, men_required, equipment_required, personnel_id, equipment_id, start_date, end_date, created_by)
        VALUES (${farmId}::uuid, ${d.taskName}, ${d.location ?? null}, ${d.menRequired}, ${d.equipmentRequired},
                ${d.personnelIds[0] ?? null}::uuid, ${d.equipmentIds[0] ?? null}::uuid,
                ${d.startDate ? new Date(d.startDate) : null}::timestamptz,
                ${d.endDate ? new Date(d.endDate) : null}::timestamptz, ${userId}::uuid)
        RETURNING *
      `;
      const t = rows[0];
      for (const pid of d.personnelIds) await tx.$executeRaw`INSERT INTO farm_task_personnel (task_id, employee_id) VALUES (${t.id}::uuid, ${pid}::uuid) ON CONFLICT DO NOTHING`;
      for (const eid of d.equipmentIds) await tx.$executeRaw`INSERT INTO farm_task_equipment (task_id, asset_id) VALUES (${t.id}::uuid, ${eid}::uuid) ON CONFLICT DO NOTHING`;
      // Assigned equipment becomes Active while the task executes (spec 3.4).
      await setEquipmentStatus(tx, d.equipmentIds, 'active');
      return t;
    });
    res.status(201).json(task);
  } catch {
    res.status(500).json({ error: 'Failed to create task', code: 'DB_ERROR' });
  }
});

// Edit an active task (spec 3.5) — replaces personnel/equipment assignments.
router.patch('/:id', async (req, res) => {
  const parsed = taskSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  const taskId = req.params.id;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<any[]>`SELECT id FROM farm_tasks WHERE id = ${taskId}::uuid AND farm_id = ${farmId}::uuid AND status = 'active'`;
      if (!existing.length) return null;

      const men = d.menRequired;
      const equip = d.equipmentRequired;
      const personnelIds = d.personnelIds;
      const equipmentIds = d.equipmentIds;
      // When assignments are provided, enforce the exact-count rule.
      if (personnelIds !== undefined && men !== undefined && personnelIds.length !== men) throw Object.assign(new Error(`Select exactly ${men} personnel`), { code: 'VALIDATION_ERROR' });
      if (equipmentIds !== undefined && equip !== undefined && equipmentIds.length !== equip) throw Object.assign(new Error(`Select exactly ${equip} equipment`), { code: 'VALIDATION_ERROR' });

      const rows = await tx.$queryRaw<any[]>`
        UPDATE farm_tasks SET
          task_name          = COALESCE(${d.taskName ?? null}, task_name),
          location           = ${d.location ?? null},
          men_required       = COALESCE(${men ?? null}, men_required),
          equipment_required = COALESCE(${equip ?? null}, equipment_required),
          personnel_id       = ${personnelIds?.[0] ?? null}::uuid,
          equipment_id       = ${equipmentIds?.[0] ?? null}::uuid,
          start_date         = ${d.startDate ? new Date(d.startDate) : null}::timestamptz,
          end_date           = ${d.endDate ? new Date(d.endDate) : null}::timestamptz,
          updated_at         = NOW()
        WHERE id = ${taskId}::uuid
        RETURNING *
      `;

      if (personnelIds !== undefined) {
        await tx.$executeRaw`DELETE FROM farm_task_personnel WHERE task_id = ${taskId}::uuid`;
        for (const pid of personnelIds) await tx.$executeRaw`INSERT INTO farm_task_personnel (task_id, employee_id) VALUES (${taskId}::uuid, ${pid}::uuid) ON CONFLICT DO NOTHING`;
      }
      if (equipmentIds !== undefined) {
        const oldEquip = await tx.$queryRaw<any[]>`SELECT asset_id FROM farm_task_equipment WHERE task_id = ${taskId}::uuid`;
        const oldIds = oldEquip.map((e) => e.asset_id);
        const removed = oldIds.filter((id: string) => !equipmentIds.includes(id));
        await setEquipmentStatus(tx, removed, 'operational');
        await tx.$executeRaw`DELETE FROM farm_task_equipment WHERE task_id = ${taskId}::uuid`;
        for (const eid of equipmentIds) await tx.$executeRaw`INSERT INTO farm_task_equipment (task_id, asset_id) VALUES (${taskId}::uuid, ${eid}::uuid) ON CONFLICT DO NOTHING`;
        await setEquipmentStatus(tx, equipmentIds, 'active');
      }
      return rows[0];
    });
    if (!updated) return res.status(404).json({ error: 'Active task not found', code: 'NOT_FOUND' });
    res.json(updated);
  } catch (err: any) {
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    res.status(500).json({ error: 'Failed to update task', code: 'DB_ERROR' });
  }
});

router.patch('/:id/complete', async (req, res) => {
  const farmId = req.user!.farmId;
  const taskId = req.params.id;
  try {
    const ok = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`SELECT id FROM farm_tasks WHERE id = ${taskId}::uuid AND farm_id = ${farmId}::uuid AND status = 'active'`;
      if (!rows.length) return false;
      await releaseTask(tx, taskId);
      await tx.$executeRaw`UPDATE farm_tasks SET status = 'completed', updated_at = NOW() WHERE id = ${taskId}::uuid`;
      return true;
    });
    if (!ok) return res.status(404).json({ error: 'Active task not found', code: 'NOT_FOUND' });
    res.json({ message: 'Task completed' });
  } catch {
    res.status(500).json({ error: 'Failed to complete task', code: 'DB_ERROR' });
  }
});

export default router;
