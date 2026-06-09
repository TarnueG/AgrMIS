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

// Canonical livestock statuses. Legacy 'sick' maps to 'ill'.
const statusEnum = z.enum(['healthy', 'recovering', 'ill', 'dead', 'sick']).transform(s => (s === 'sick' ? 'ill' : s));
const normStatus = (s: any): string | null => (s == null ? null : s === 'sick' ? 'ill' : s);

// Recovering animals whose expected recovery date has arrived auto-heal back to
// 'healthy' (and thereby return to Inventory). Run at the top of read endpoints.
async function autoHealRecovered(farmId: string | undefined) {
  await prisma.$executeRaw`UPDATE pigs   SET status = 'healthy', updated_at = NOW()
    WHERE farm_id = ${farmId}::uuid AND status = 'recovering' AND expected_recovery_date IS NOT NULL AND expected_recovery_date <= CURRENT_DATE AND deleted_at IS NULL`;
  await prisma.$executeRaw`UPDATE cattle SET status = 'healthy', updated_at = NOW()
    WHERE farm_id = ${farmId}::uuid AND status = 'recovering' AND expected_recovery_date IS NOT NULL AND expected_recovery_date <= CURRENT_DATE AND deleted_at IS NULL`;
  await prisma.$executeRaw`UPDATE birds  SET status = 'healthy', updated_at = NOW()
    WHERE farm_id = ${farmId}::uuid AND status = 'recovering' AND expected_recovery_date IS NOT NULL AND expected_recovery_date <= CURRENT_DATE AND deleted_at IS NULL`;
}

// ─── PIGS ────────────────────────────────────────────────────────────────────

const pigSchema = z.object({
  pig_id: z.string().min(1),
  breed: z.string().optional(),
  gender: z.enum(['male', 'female', 'unknown']).default('unknown'),
  status: statusEnum.default('healthy'),
  weight_kg: z.number().nonnegative().optional(),
  pen_number: z.string().optional(),
  location: z.string().optional(),
  date_recorded: z.string().optional(),
});

router.get('/pigs', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    await autoHealRecovered(farmId);
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
      INSERT INTO pigs (farm_id, pig_id, breed, gender, status, weight_kg, pen_number, location, date_recorded, created_by)
      VALUES (${farmId}::uuid, ${d.pig_id}, ${d.breed ?? null}, ${d.gender}, ${d.status}, ${d.weight_kg ?? null},
              ${d.pen_number ?? null}, ${d.location ?? null},
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
  const { breed, gender, pen_number, weight_kg, location } = req.body;
  const mature_for_market = typeof req.body.mature_for_market === 'boolean' ? req.body.mature_for_market : null;
  const status = normStatus(req.body.status);
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT * FROM pigs WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Pig not found', code: 'NOT_FOUND' });

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
        weight_kg = COALESCE(${weight_kg ?? null}, weight_kg),
        pen_number = COALESCE(${pen_number ?? null}, pen_number),
        location = COALESCE(${location ?? null}, location),
        mature_for_market = COALESCE(${mature_for_market}, mature_for_market),
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
  gender: z.enum(['male', 'female']).optional(),
  status: statusEnum.default('healthy'),
  weight_kg: z.number().nonnegative().optional(),
  location: z.string().optional(),
  date_recorded: z.string().optional(),
});

router.get('/cattle', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    await autoHealRecovered(farmId);
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
      INSERT INTO cattle (farm_id, cattle_id, cattle_type, gender, status, weight_kg, location, date_recorded, created_by)
      VALUES (${farmId}::uuid, ${d.cattle_id}, ${d.cattle_type}, ${d.gender ?? null}, ${d.status}, ${d.weight_kg ?? null}, ${d.location ?? null},
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
  const { cattle_type, location, weight_kg, gender } = req.body;
  const mature_for_market = typeof req.body.mature_for_market === 'boolean' ? req.body.mature_for_market : null;
  const status = normStatus(req.body.status);
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT * FROM cattle WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Cattle not found', code: 'NOT_FOUND' });

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
        gender = COALESCE(${gender ?? null}, gender),
        status = COALESCE(${status ?? null}, status),
        weight_kg = COALESCE(${weight_kg ?? null}, weight_kg),
        location = COALESCE(${location ?? null}, location),
        mature_for_market = COALESCE(${mature_for_market}, mature_for_market),
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

// Birds are individual records now (one row = one bird).
const birdSchema = z.object({
  bird_type: z.enum(['chicken', 'duck']),
  gender: z.enum(['male', 'female']).optional(),
  weight_kg: z.number().nonnegative().optional(),
  location: z.string().optional(),
  status: statusEnum.default('healthy'),
  date_recorded: z.string().optional(),
});

router.get('/birds', async (req, res) => {
  const farmId = req.user!.farmId;
  const type = req.query.type as string | undefined;
  try {
    await autoHealRecovered(farmId);
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
  const birdId = `BIRD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO birds (farm_id, bird_id, bird_type, gender, weight_kg, location, status, number_of_birds, date_recorded, created_by)
      VALUES (${farmId}::uuid, ${birdId}, ${d.bird_type}, ${d.gender ?? null}, ${d.weight_kg ?? null}, ${d.location ?? null},
              ${d.status}, 1, ${d.date_recorded ? new Date(d.date_recorded) : new Date()}::date, ${userId}::uuid)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create bird record', code: 'DB_ERROR' });
  }
});

router.patch('/birds/:id', async (req, res) => {
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  const { id } = req.params;
  const { bird_type, gender, weight_kg, location } = req.body;
  const mature_for_market = typeof req.body.mature_for_market === 'boolean' ? req.body.mature_for_market : null;
  const status = normStatus(req.body.status);
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT * FROM birds WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Bird record not found', code: 'NOT_FOUND' });

    if (status === 'dead') {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO mortality_records (farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death, source_table, source_id, created_by)
          VALUES (${farmId}::uuid, 'bird', ${existing[0].bird_type}, ${existing[0].bird_id ?? existing[0].batch_number ?? ''}, ${existing[0].location ?? ''},
                  ${req.body.cause_of_death ?? null}, 'birds', ${id}::uuid, ${userId}::uuid)
        `;
        await tx.$executeRaw`UPDATE birds SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${id}::uuid`;
      });
      return res.json({ migrated: true, message: 'Bird moved to mortality records' });
    }

    const rows = await prisma.$queryRaw<any[]>`
      UPDATE birds SET
        bird_type = COALESCE(${bird_type ?? null}, bird_type),
        gender = COALESCE(${gender ?? null}, gender),
        weight_kg = COALESCE(${weight_kg ?? null}, weight_kg),
        location = COALESCE(${location ?? null}, location),
        status = COALESCE(${status ?? null}, status),
        mature_for_market = COALESCE(${mature_for_market}, mature_for_market),
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
  batch_number: z.string().optional(), // auto-generated server-side (spec 6.3)
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

    // Batch number is server-issued and unique (spec 6.3).
    const batchNumber = (d.batch_number && d.batch_number.trim()) ? d.batch_number : `FISH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const [fish] = await prisma.$transaction(async (tx) => {
      const newCount = Number(pond[0].current_fish_count) + d.number_of_fish;
      const newStatus = newCount >= Number(pond[0].capacity) ? 'full' : 'available';
      const rows = await tx.$queryRaw<any[]>`
        INSERT INTO fish_stock (farm_id, pond_id, fish_type, batch_number, number_of_fish, date_recorded, created_by)
        VALUES (${farmId}::uuid, ${pondId}::uuid, ${d.fish_type}, ${batchNumber}, ${d.number_of_fish},
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

// ── Fresh Fish (spec 6.4) ────────────────────────────────────────────
router.get('/fresh-fish', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM fresh_fish WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL ORDER BY created_at DESC
    `;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch fresh fish', code: 'DB_ERROR' });
  }
});

const freshFishSchema = z.object({
  pondId: z.string().uuid(),
  fishType: z.string().min(1),
  amount: z.number().int().positive(),
});

// Move fish from a pond into Fresh Fish: decrement the pond's stock, aggregate into fresh_fish.
router.post('/fresh-fish', async (req, res) => {
  const parsed = freshFishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const { pondId, fishType, amount } = parsed.data;
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  try {
    await prisma.$transaction(async (tx) => {
      const stock = await tx.$queryRaw<any[]>`
        SELECT fs.id, fs.number_of_fish FROM fish_stock fs JOIN fish_ponds fp ON fp.id = fs.pond_id
        WHERE fs.pond_id = ${pondId}::uuid AND fp.farm_id = ${farmId}::uuid AND fs.fish_type = ${fishType}
          AND fs.deleted_at IS NULL AND fs.number_of_fish > 0 ORDER BY fs.created_at ASC
      `;
      const available = stock.reduce((s, r) => s + Number(r.number_of_fish), 0);
      if (available < amount) throw Object.assign(new Error(`Only ${available} ${fishType} available in this pond`), { status: 400 });
      // Decrement source batches FIFO.
      let remaining = amount;
      for (const row of stock) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(row.number_of_fish));
        await tx.$executeRaw`UPDATE fish_stock SET number_of_fish = number_of_fish - ${take}, updated_at = NOW() WHERE id = ${row.id}::uuid`;
        remaining -= take;
      }
      await tx.$executeRaw`
        UPDATE fish_ponds SET current_fish_count = GREATEST(0, current_fish_count - ${amount}),
          status = CASE WHEN current_fish_count - ${amount} >= capacity THEN 'full' ELSE 'available' END, updated_at = NOW()
        WHERE id = ${pondId}::uuid
      `;
      // Aggregate into an in-stock Fresh Fish row of this type.
      const existing = await tx.$queryRaw<any[]>`
        SELECT id FROM fresh_fish WHERE farm_id = ${farmId}::uuid AND fish_type = ${fishType} AND status = 'in_stock' AND deleted_at IS NULL LIMIT 1
      `;
      if (existing.length) {
        await tx.$executeRaw`UPDATE fresh_fish SET number_of_fish = number_of_fish + ${amount}, updated_at = NOW() WHERE id = ${existing[0].id}::uuid`;
      } else {
        await tx.$executeRaw`INSERT INTO fresh_fish (farm_id, fish_type, number_of_fish, status, created_by) VALUES (${farmId}::uuid, ${fishType}, ${amount}, 'in_stock', ${userId}::uuid)`;
      }
    });
    res.status(201).json({ message: 'Fresh fish added' });
  } catch (err: any) {
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message ?? 'Failed to add fresh fish', code: status === 400 ? 'VALIDATION_ERROR' : 'DB_ERROR' });
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
        const match = await prisma.$queryRaw<any[]>`SELECT id FROM birds WHERE (bird_id = ${d.record_id} OR batch_number = ${d.record_id}) AND farm_id = ${farmId}::uuid AND deleted_at IS NULL LIMIT 1`;
        if (match.length) { sourceId = match[0].id; sourceTable = 'birds'; }
      } else if (d.livestock_type === 'fish') {
        const match = await prisma.$queryRaw<any[]>`SELECT fs.id FROM fish_stock fs JOIN fish_ponds fp ON fp.id = fs.pond_id WHERE fs.batch_number = ${d.record_id} AND fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL LIMIT 1`;
        if (match.length) { sourceId = match[0].id; sourceTable = 'fish_stock'; }
      }
      // ID was supplied but no live record matched it
      if (!sourceId) return res.status(404).json({ error: 'Livestock does not exist', code: 'NOT_FOUND' });
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

// ─── LIVESTOCK REQUESTS (Inventory → Production fulfilment pipeline) ──────────

const lsRequestSchema = z.object({
  species: z.enum(['pig', 'bird', 'grazing']),
  name: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  location: z.string().optional(),
  boars: z.number().int().min(0).optional(),
  sows: z.number().int().min(0).optional(),
  sub_type: z.string().optional(),
  order_type: z.string().optional(),
});

router.get('/requests', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM livestock_requests WHERE farm_id = ${farmId}::uuid ORDER BY created_at DESC`;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch livestock requests', code: 'DB_ERROR' });
  }
});

router.post('/requests', async (req, res) => {
  const parsed = lsRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;
  const userId = req.user!.userId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO livestock_requests (farm_id, species, name, quantity, location, boars, sows, sub_type, order_type, created_by)
      VALUES (${farmId}::uuid, ${d.species}, ${d.name ?? null}, ${d.quantity}, ${d.location ?? null},
              ${d.boars ?? null}, ${d.sows ?? null}, ${d.sub_type ?? null}, ${d.order_type ?? 'Make to Order'}, ${userId}::uuid)
      RETURNING *`;
    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create livestock request', code: 'DB_ERROR' });
  }
});

router.patch('/requests/:id/accept', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      UPDATE livestock_requests SET status = 'accepted', updated_at = NOW()
      WHERE id = ${req.params.id}::uuid AND farm_id = ${farmId}::uuid AND status = 'pending' RETURNING *`;
    if (!rows.length) return res.status(404).json({ error: 'Pending request not found', code: 'NOT_FOUND' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to accept request', code: 'DB_ERROR' });
  }
});

router.patch('/requests/:id/decline', async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      UPDATE livestock_requests SET status = 'declined', updated_at = NOW()
      WHERE id = ${req.params.id}::uuid AND farm_id = ${farmId}::uuid AND status IN ('pending','accepted') RETURNING *`;
    if (!rows.length) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to decline request', code: 'DB_ERROR' });
  }
});

// Fulfil by confirming the selected healthy animals (already in inventory once healthy).
router.post('/requests/:id/fulfil', async (req, res) => {
  const farmId = req.user!.farmId;
  const animalIds: string[] = Array.isArray(req.body.animalIds) ? req.body.animalIds : [];
  if (!animalIds.length) return res.status(400).json({ error: 'Select at least one animal to fulfil', code: 'VALIDATION_ERROR' });
  try {
    const rows = await prisma.$queryRaw<any[]>`
      UPDATE livestock_requests SET status = 'fulfilled', updated_at = NOW()
      WHERE id = ${req.params.id}::uuid AND farm_id = ${farmId}::uuid AND status IN ('pending','accepted') RETURNING *`;
    if (!rows.length) return res.status(404).json({ error: 'Request not found', code: 'NOT_FOUND' });
    res.json({ ...rows[0], fulfilled_count: animalIds.length });
  } catch {
    res.status(500).json({ error: 'Failed to fulfil request', code: 'DB_ERROR' });
  }
});

// ─── STATUS AGGREGATION (Health / Ill / Recovering cards) ────────────────────

router.get('/by-status/:status', async (req, res) => {
  const farmId = req.user!.farmId;
  const status = normStatus(req.params.status);
  try {
    await autoHealRecovered(farmId);
    const [pigsR, cattleR, birdsR] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT id, pig_id AS record_id, 'pig' AS species, breed AS sub_type, gender, status, mature_for_market,
               COALESCE(location, pen_number) AS location, weight_kg, treatment_date, expected_recovery_date,
               date_recorded, created_at
        FROM pigs WHERE farm_id = ${farmId}::uuid AND status = ${status} AND deleted_at IS NULL`,
      prisma.$queryRaw<any[]>`
        SELECT id, cattle_id AS record_id, 'grazing' AS species, cattle_type AS sub_type, gender, status, mature_for_market,
               location, weight_kg, treatment_date, expected_recovery_date, date_recorded, created_at
        FROM cattle WHERE farm_id = ${farmId}::uuid AND status = ${status} AND deleted_at IS NULL`,
      prisma.$queryRaw<any[]>`
        SELECT id, bird_id AS record_id, 'bird' AS species, bird_type AS sub_type, gender, status, mature_for_market,
               location, weight_kg, treatment_date, expected_recovery_date, date_recorded, created_at
        FROM birds WHERE farm_id = ${farmId}::uuid AND status = ${status} AND deleted_at IS NULL`,
    ]);
    const all = [...pigsR, ...cattleR, ...birdsR].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    res.json(all);
  } catch {
    res.status(500).json({ error: 'Failed to fetch livestock by status', code: 'DB_ERROR' });
  }
});

// ─── TREATMENT (ill → recovering) ────────────────────────────────────────────

const treatmentSchema = z.object({
  species: z.enum(['pig', 'grazing', 'bird']),
  id: z.string().uuid(),
  description: z.string().optional(),
  treatment_date: z.string().optional(),
  location: z.string().optional(),
  weight_kg: z.number().nonnegative().optional(),
  expected_recovery_date: z.string().optional(),
});

router.post('/treatment', async (req, res) => {
  const parsed = treatmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId;

  const wc = (d.description ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (wc > 50) return res.status(400).json({ error: 'Treatment description must be 50 words or fewer', code: 'VALIDATION_ERROR' });

  const tDate = d.treatment_date ? new Date(d.treatment_date) : new Date();
  const rDate = d.expected_recovery_date ? new Date(d.expected_recovery_date) : null;
  try {
    let rows: any[] = [];
    if (d.species === 'pig') {
      rows = await prisma.$queryRaw<any[]>`
        UPDATE pigs SET status = 'recovering', treatment_description = ${d.description ?? null},
          treatment_date = ${tDate}::date, expected_recovery_date = ${rDate}::date,
          weight_kg = COALESCE(${d.weight_kg ?? null}, weight_kg), location = COALESCE(${d.location ?? null}, location), updated_at = NOW()
        WHERE id = ${d.id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL RETURNING *`;
    } else if (d.species === 'grazing') {
      rows = await prisma.$queryRaw<any[]>`
        UPDATE cattle SET status = 'recovering', treatment_description = ${d.description ?? null},
          treatment_date = ${tDate}::date, expected_recovery_date = ${rDate}::date,
          weight_kg = COALESCE(${d.weight_kg ?? null}, weight_kg), location = COALESCE(${d.location ?? null}, location), updated_at = NOW()
        WHERE id = ${d.id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL RETURNING *`;
    } else {
      rows = await prisma.$queryRaw<any[]>`
        UPDATE birds SET status = 'recovering', treatment_description = ${d.description ?? null},
          treatment_date = ${tDate}::date, expected_recovery_date = ${rDate}::date,
          weight_kg = COALESCE(${d.weight_kg ?? null}, weight_kg), location = COALESCE(${d.location ?? null}, location), updated_at = NOW()
        WHERE id = ${d.id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL RETURNING *`;
    }
    if (!rows.length) return res.status(404).json({ error: 'Livestock not found', code: 'NOT_FOUND' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to record treatment', code: 'DB_ERROR' });
  }
});

export default router;
