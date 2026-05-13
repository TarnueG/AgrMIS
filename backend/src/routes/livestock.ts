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
  return requirePermission('livestock', action)(req, res, next);
});

const HOUR_MS = 60 * 60 * 1000;
function within24h(createdAt: Date | string) {
  return Date.now() - new Date(createdAt).getTime() < 24 * HOUR_MS;
}

// ─── PIGS ────────────────────────────────────────────────────────────────────

const pigSchema = z.object({
  pig_id: z.string().min(1),
  breed: z.string().optional(),
  gender: z.enum(['male', 'female', 'unknown']).default('unknown'),
  status: z.enum(['healthy', 'sick', 'dead']).default('healthy'),
  pen_number: z.string().optional(),
  date_recorded: z.string().optional(),
});

router.get('/pigs', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM pigs
      WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch pigs', code: 'DB_ERROR' });
  }
});

router.post('/pigs', async (req, res) => {
  const parsed = pigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO pigs (farm_id, pig_id, breed, gender, status, pen_number, date_recorded, created_by)
      VALUES (${farmId}::uuid, ${d.pig_id}, ${d.breed ?? null}, ${d.gender}, ${d.status}, ${d.pen_number ?? null},
              ${d.date_recorded ? new Date(d.date_recorded) : new Date()}::date, ${userId}::uuid)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: 'Pig ID already exists', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to create pig record', code: 'DB_ERROR' });
  }
});

router.patch('/pigs/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  const { id } = req.params;
  const { breed, gender, status, pen_number } = req.body;
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT * FROM pigs WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Pig not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Record cannot be modified after 24 hours', code: 'IMMUTABLE' });

    if (status === 'dead') {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO mortality_records (farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death, source_table, source_id, created_by)
          VALUES (${farmId}::uuid, 'pig', ${existing[0].breed ?? ''}, ${existing[0].pig_id}, ${existing[0].pen_number ?? ''},
                  ${req.body.cause_of_death ?? null}, 'pigs', ${id}::uuid, ${userId}::uuid)
        `;
        await tx.$executeRaw`UPDATE pigs SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${id}::uuid`;
      });
      return res.json({ migrated: true, message: 'Pig moved to mortality records' });
    }

    const rows = await prisma.$queryRaw<any[]>`
      UPDATE pigs SET
        breed = COALESCE(${breed ?? null}, breed),
        gender = COALESCE(${gender ?? null}, gender),
        status = COALESCE(${status ?? null}, status),
        pen_number = COALESCE(${pen_number ?? null}, pen_number),
        updated_at = NOW()
      WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid
      RETURNING *
    `;
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update pig', code: 'DB_ERROR' });
  }
});

router.delete('/pigs/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const { id } = req.params;
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT created_at FROM pigs WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Pig not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot delete after 24 hours', code: 'IMMUTABLE' });
    await prisma.$executeRaw`UPDATE pigs SET deleted_at = NOW() WHERE id = ${id}::uuid`;
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete pig', code: 'DB_ERROR' });
  }
});

// ─── CATTLE ──────────────────────────────────────────────────────────────────

const cattleSchema = z.object({
  cattle_id: z.string().min(1),
  cattle_type: z.enum(['goat', 'sheep', 'cow']),
  status: z.enum(['healthy', 'sick', 'dead']).default('healthy'),
  location: z.string().optional(),
  date_recorded: z.string().optional(),
});

router.get('/cattle', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM cattle WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL ORDER BY created_at DESC
    `;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch cattle', code: 'DB_ERROR' });
  }
});

router.post('/cattle', async (req, res) => {
  const parsed = cattleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO cattle (farm_id, cattle_id, cattle_type, status, location, date_recorded, created_by)
      VALUES (${farmId}::uuid, ${d.cattle_id}, ${d.cattle_type}, ${d.status}, ${d.location ?? null},
              ${d.date_recorded ? new Date(d.date_recorded) : new Date()}::date, ${userId}::uuid)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: 'Cattle ID already exists', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to create cattle record', code: 'DB_ERROR' });
  }
});

router.patch('/cattle/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  const { id } = req.params;
  const { cattle_type, status, location } = req.body;
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT * FROM cattle WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Cattle not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Record cannot be modified after 24 hours', code: 'IMMUTABLE' });

    if (status === 'dead') {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO mortality_records (farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death, source_table, source_id, created_by)
          VALUES (${farmId}::uuid, 'cattle', ${existing[0].cattle_type}, ${existing[0].cattle_id}, ${existing[0].location ?? ''},
                  ${req.body.cause_of_death ?? null}, 'cattle', ${id}::uuid, ${userId}::uuid)
        `;
        await tx.$executeRaw`UPDATE cattle SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${id}::uuid`;
      });
      return res.json({ migrated: true, message: 'Cattle moved to mortality records' });
    }

    const rows = await prisma.$queryRaw<any[]>`
      UPDATE cattle SET
        cattle_type = COALESCE(${cattle_type ?? null}, cattle_type),
        status = COALESCE(${status ?? null}, status),
        location = COALESCE(${location ?? null}, location),
        updated_at = NOW()
      WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid
      RETURNING *
    `;
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update cattle', code: 'DB_ERROR' });
  }
});

router.delete('/cattle/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const { id } = req.params;
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT created_at FROM cattle WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Cattle not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot delete after 24 hours', code: 'IMMUTABLE' });
    await prisma.$executeRaw`UPDATE cattle SET deleted_at = NOW() WHERE id = ${id}::uuid`;
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete cattle', code: 'DB_ERROR' });
  }
});

// ─── BIRDS ───────────────────────────────────────────────────────────────────

const birdSchema = z.object({
  bird_type: z.enum(['chicken', 'duck']),
  batch_number: z.string().min(1),
  number_of_birds: z.number().int().min(0),
  number_of_female: z.number().int().min(0),
  number_of_male: z.number().int().min(0),
  date_recorded: z.string().optional(),
});

router.get('/birds', async (req, res) => {
  const farmId = req.user!.farmId;
  const type = req.query.type as string | undefined;
  try {
    const rows = type
      ? await prisma.$queryRaw<any[]>`SELECT * FROM birds WHERE farm_id = ${farmId}::uuid AND bird_type = ${type} AND deleted_at IS NULL ORDER BY created_at DESC`
      : await prisma.$queryRaw<any[]>`SELECT * FROM birds WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL ORDER BY created_at DESC`;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch birds', code: 'DB_ERROR' });
  }
});

router.post('/birds', async (req, res) => {
  const parsed = birdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO birds (farm_id, bird_type, batch_number, number_of_birds, number_of_female, number_of_male, date_recorded, created_by)
      VALUES (${farmId}::uuid, ${d.bird_type}, ${d.batch_number}, ${d.number_of_birds}, ${d.number_of_female},
              ${d.number_of_male}, ${d.date_recorded ? new Date(d.date_recorded) : new Date()}::date, ${userId}::uuid)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create bird record', code: 'DB_ERROR' });
  }
});

router.patch('/birds/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const { id } = req.params;
  const { bird_type, batch_number, number_of_birds, number_of_female, number_of_male } = req.body;
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT created_at FROM birds WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Bird record not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot modify after 24 hours', code: 'IMMUTABLE' });
    const rows = await prisma.$queryRaw<any[]>`
      UPDATE birds SET
        bird_type = COALESCE(${bird_type ?? null}, bird_type),
        batch_number = COALESCE(${batch_number ?? null}, batch_number),
        number_of_birds = COALESCE(${number_of_birds ?? null}, number_of_birds),
        number_of_female = COALESCE(${number_of_female ?? null}, number_of_female),
        number_of_male = COALESCE(${number_of_male ?? null}, number_of_male),
        updated_at = NOW()
      WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid
      RETURNING *
    `;
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update bird record', code: 'DB_ERROR' });
  }
});

// ─── FISH PONDS ──────────────────────────────────────────────────────────────

const pondSchema = z.object({
  pond_id: z.string().min(1),
  length_m: z.number().positive().optional(),
  width_m: z.number().positive().optional(),
  location: z.string().optional(),
  capacity: z.number().int().positive().default(2000),
  status: z.enum(['available', 'full']).default('available'),
});

router.get('/fish-ponds', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM fish_ponds WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL ORDER BY created_at DESC
    `;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch fish ponds', code: 'DB_ERROR' });
  }
});

router.post('/fish-ponds', async (req, res) => {
  const parsed = pondSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO fish_ponds (farm_id, pond_id, length_m, width_m, location, capacity, status, created_by)
      VALUES (${farmId}::uuid, ${d.pond_id}, ${d.length_m ?? null}, ${d.width_m ?? null}, ${d.location ?? null},
              ${d.capacity}, ${d.status}, ${userId}::uuid)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: 'Pond ID already exists', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to create fish pond', code: 'DB_ERROR' });
  }
});

// ─── FISH STOCK ──────────────────────────────────────────────────────────────

const fishSchema = z.object({
  fish_type: z.string().min(1),
  batch_number: z.string().min(1),
  number_of_fish: z.number().int().positive(),
  date_recorded: z.string().optional(),
});

router.get('/fish-ponds/:pondId/fish', async (req, res) => {
  const farmId = req.user!.farmId;
  const { pondId } = req.params;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT fs.* FROM fish_stock fs
      JOIN fish_ponds fp ON fp.id = fs.pond_id
      WHERE fs.pond_id = ${pondId}::uuid AND fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL
      ORDER BY fs.created_at DESC
    `;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch fish', code: 'DB_ERROR' });
  }
});

router.post('/fish-ponds/:pondId/fish', async (req, res) => {
  const parsed = fishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  const { pondId } = req.params;
  try {
    const pond = await prisma.$queryRaw<any[]>`SELECT * FROM fish_ponds WHERE id = ${pondId}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!pond.length) return res.status(404).json({ error: 'Pond not found', code: 'NOT_FOUND' });

    const [fish] = await prisma.$transaction(async (tx) => {
      const newCount = Number(pond[0].current_fish_count) + d.number_of_fish;
      const newStatus = newCount >= Number(pond[0].capacity) ? 'full' : 'available';
      const rows = await tx.$queryRaw<any[]>`
        INSERT INTO fish_stock (farm_id, pond_id, fish_type, batch_number, number_of_fish, date_recorded, created_by)
        VALUES (${farmId}::uuid, ${pondId}::uuid, ${d.fish_type}, ${d.batch_number}, ${d.number_of_fish},
                ${d.date_recorded ? new Date(d.date_recorded) : new Date()}::date, ${userId}::uuid)
        RETURNING *
      `;
      await tx.$executeRaw`
        UPDATE fish_ponds SET current_fish_count = ${newCount}, status = ${newStatus}, updated_at = NOW()
        WHERE id = ${pondId}::uuid
      `;
      return rows;
    });
    res.status(201).json(fish);
  } catch {
    res.status(500).json({ error: 'Failed to add fish', code: 'DB_ERROR' });
  }
});

router.patch('/fish/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const { id } = req.params;
  const { fish_type, batch_number, number_of_fish } = req.body;
  try {
    const existing = await prisma.$queryRaw<any[]>`
      SELECT fs.*, fp.farm_id FROM fish_stock fs
      JOIN fish_ponds fp ON fp.id = fs.pond_id
      WHERE fs.id = ${id}::uuid AND fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL
    `;
    if (!existing.length) return res.status(404).json({ error: 'Fish record not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot modify after 24 hours', code: 'IMMUTABLE' });
    const rows = await prisma.$queryRaw<any[]>`
      UPDATE fish_stock SET
        fish_type = COALESCE(${fish_type ?? null}, fish_type),
        batch_number = COALESCE(${batch_number ?? null}, batch_number),
        number_of_fish = COALESCE(${number_of_fish ?? null}::integer, number_of_fish),
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update fish record', code: 'DB_ERROR' });
  }
});

router.delete('/fish/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const { id } = req.params;
  try {
    const existing = await prisma.$queryRaw<any[]>`
      SELECT fs.created_at, fs.number_of_fish, fs.pond_id FROM fish_stock fs
      JOIN fish_ponds fp ON fp.id = fs.pond_id
      WHERE fs.id = ${id}::uuid AND fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL
    `;
    if (!existing.length) return res.status(404).json({ error: 'Fish record not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot delete after 24 hours', code: 'IMMUTABLE' });
    const pondId = existing[0].pond_id;
    const fishCount = Number(existing[0].number_of_fish);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE fish_stock SET deleted_at = NOW() WHERE id = ${id}::uuid`;
      await tx.$executeRaw`
        UPDATE fish_ponds SET
          current_fish_count = GREATEST(0, current_fish_count - ${fishCount}),
          status = CASE WHEN current_fish_count - ${fishCount} >= capacity THEN 'full' ELSE 'available' END,
          updated_at = NOW()
        WHERE id = ${pondId}::uuid
      `;
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete fish record', code: 'DB_ERROR' });
  }
});

// ─── MORTALITY ───────────────────────────────────────────────────────────────

const mortalitySchema = z.object({
  livestock_type: z.enum(['pig', 'cattle', 'fish', 'bird']),
  breed_or_type: z.string().optional(),
  record_id: z.string().optional(),
  pen_or_location: z.string().optional(),
  cause_of_death: z.string().optional(),
  date_recorded: z.string().optional(),
});

router.get('/mortality', async (req, res) => {
  const farmId = req.user!.farmId;
  const type = req.query.type as string | undefined;
  try {
    const rows = type
      ? await prisma.$queryRaw<any[]>`SELECT * FROM mortality_records WHERE farm_id = ${farmId}::uuid AND livestock_type = ${type} ORDER BY created_at DESC`
      : await prisma.$queryRaw<any[]>`SELECT * FROM mortality_records WHERE farm_id = ${farmId}::uuid ORDER BY created_at DESC`;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch mortality records', code: 'DB_ERROR' });
  }
});

router.post('/mortality', async (req, res) => {
  const parsed = mortalitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;

  const wordCount = (d.cause_of_death ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 50) return res.status(400).json({ error: 'Cause of death must be 50 words or fewer', code: 'VALIDATION_ERROR' });

  try {
    let sourceId: string | null = null;
    let sourceTable: string | null = null;

    if (d.record_id) {
      if (d.livestock_type === 'pig') {
        const match = await prisma.$queryRaw<any[]>`SELECT id FROM pigs WHERE pig_id = ${d.record_id} AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
        if (match.length) { sourceId = match[0].id; sourceTable = 'pigs'; }
      } else if (d.livestock_type === 'cattle') {
        const match = await prisma.$queryRaw<any[]>`SELECT id FROM cattle WHERE cattle_id = ${d.record_id} AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
        if (match.length) { sourceId = match[0].id; sourceTable = 'cattle'; }
      } else if (d.livestock_type === 'bird') {
        const match = await prisma.$queryRaw<any[]>`SELECT id FROM birds WHERE batch_number = ${d.record_id} AND farm_id = ${farmId}::uuid AND deleted_at IS NULL LIMIT 1`;
        if (match.length) { sourceId = match[0].id; sourceTable = 'birds'; }
      } else if (d.livestock_type === 'fish') {
        const match = await prisma.$queryRaw<any[]>`SELECT fs.id FROM fish_stock fs JOIN fish_ponds fp ON fp.id = fs.pond_id WHERE fs.batch_number = ${d.record_id} AND fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL LIMIT 1`;
        if (match.length) { sourceId = match[0].id; sourceTable = 'fish_stock'; }
      }
    }

    const rows = await prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<any[]>`
        INSERT INTO mortality_records (farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death,
          source_table, source_id, date_recorded, created_by)
        VALUES (${farmId}::uuid, ${d.livestock_type}, ${d.breed_or_type ?? null}, ${d.record_id ?? null},
                ${d.pen_or_location ?? null}, ${d.cause_of_death ?? null}, ${sourceTable}, ${sourceId ? sourceId + '::uuid' : null},
                ${d.date_recorded ? new Date(d.date_recorded) : new Date()}::date, ${userId}::uuid)
        RETURNING *
      `;
      if (sourceId && sourceTable === 'pigs') await tx.$executeRaw`UPDATE pigs SET deleted_at = NOW() WHERE id = ${sourceId}::uuid`;
      if (sourceId && sourceTable === 'cattle') await tx.$executeRaw`UPDATE cattle SET deleted_at = NOW() WHERE id = ${sourceId}::uuid`;
      if (sourceId && sourceTable === 'birds') await tx.$executeRaw`UPDATE birds SET deleted_at = NOW() WHERE id = ${sourceId}::uuid`;
      if (sourceId && sourceTable === 'fish_stock') await tx.$executeRaw`UPDATE fish_stock SET deleted_at = NOW() WHERE id = ${sourceId}::uuid`;
      return inserted;
    });

    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create mortality record', code: 'DB_ERROR' });
  }
});

router.patch('/mortality/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const { id } = req.params;
  const { breed_or_type, record_id, pen_or_location, cause_of_death } = req.body;
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT created_at FROM mortality_records WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid`;
    if (!existing.length) return res.status(404).json({ error: 'Record not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot modify after 24 hours', code: 'IMMUTABLE' });
    const wordCount = (cause_of_death ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 50) return res.status(400).json({ error: 'Cause of death must be 50 words or fewer', code: 'VALIDATION_ERROR' });
    const rows = await prisma.$queryRaw<any[]>`
      UPDATE mortality_records SET
        breed_or_type = COALESCE(${breed_or_type ?? null}, breed_or_type),
        record_id = COALESCE(${record_id ?? null}, record_id),
        pen_or_location = COALESCE(${pen_or_location ?? null}, pen_or_location),
        cause_of_death = COALESCE(${cause_of_death ?? null}, cause_of_death),
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update mortality record', code: 'DB_ERROR' });
  }
});

router.delete('/mortality/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const { id } = req.params;
  try {
    await prisma.$executeRaw`DELETE FROM mortality_records WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid`;
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete mortality record', code: 'DB_ERROR' });
  }
});

export default router;
