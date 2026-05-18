import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();

router.use(requireAuth);
router.use(setFarmContext);
router.use((req, res, next) => {
  const action = req.method === 'GET' ? ('view' as const) : req.method === 'POST' ? ('create' as const) : req.method === 'DELETE' ? ('delete' as const) : ('edit' as const);
  return requirePermission('livestock', action)(req, res, next);
});

const HOUR_MS = 60 * 60 * 1000;

function within24h(createdAt: Date | string) {
  return Date.now() - new Date(createdAt).getTime() < 24 * HOUR_MS;
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function formatDateString(value: string | Date | null | undefined) {
  if (!value) return null;
  return new Date(value);
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const pigSchema = z.object({
  pig_id: z.string().min(1),
  breed: z.string().optional(),
  gender: z.enum(['male', 'female', 'unknown']).default('unknown'),
  status: z.string().default('healthy'),
  pen_number: z.string().optional(),
  date_recorded: z.string().optional(),
  notes: z.string().optional(),
});

const cattleSchema = z.object({
  cattle_id: z.string().min(1),
  cattle_type: z.string().min(1),
  status: z.string().default('healthy'),
  location: z.string().optional(),
  date_recorded: z.string().optional(),
  notes: z.string().optional(),
});

const birdSchema = z.object({
  bird_type: z.string().min(1),
  batch_number: z.string().min(1),
  number_of_birds: z.number().int().min(0),
  number_of_female: z.number().int().min(0),
  number_of_male: z.number().int().min(0),
  date_recorded: z.string().optional(),
  notes: z.string().optional(),
});

const pondSchema = z.object({
  pond_id: z.string().min(1),
  fish_type: z.string().optional(),
  length_m: z.number().positive().optional(),
  width_m: z.number().positive().optional(),
  location: z.string().optional(),
  capacity: z.number().int().positive().default(2000),
  status: z.string().default('available'),
  stocking_date: z.string().optional(),
  expected_harvest_date: z.string().optional(),
});

const fishSchema = z.object({
  fish_type: z.string().min(1),
  batch_number: z.string().min(1),
  number_of_fish: z.number().int().positive(),
  date_recorded: z.string().optional(),
  expected_harvest_date: z.string().optional(),
});

const healthLogSchema = z.object({
  reference_kind: z.enum(['pig', 'cattle', 'bird', 'pond']),
  reference_id: z.string().uuid().optional().nullable(),
  reference_code: z.string().optional().nullable(),
  issue: z.string().min(1),
  treatment: z.string().optional().nullable(),
  medicine_used: z.string().optional().nullable(),
  inventory_stock_item_id: z.string().uuid().optional().nullable(),
  inventory_quantity_used: z.number().nonnegative().optional().nullable(),
  vet_staff_responsible: z.string().optional().nullable(),
  recovery_status: z.string().optional().nullable(),
  log_date: z.string().optional().nullable(),
  next_check_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const feedUsageSchema = z.object({
  reference_kind: z.enum(['pig', 'cattle', 'bird', 'pond']),
  reference_id: z.string().uuid().optional().nullable(),
  reference_code: z.string().optional().nullable(),
  group_name: z.string().min(1),
  feed_stock_item_id: z.string().uuid().optional().nullable(),
  feed_item_name: z.string().min(1),
  quantity_used: z.number().positive(),
  unit: z.string().min(1),
  inventory_source: z.string().optional().nullable(),
  log_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const mortalitySchema = z.object({
  livestock_type: z.enum(['pig', 'cattle', 'fish', 'bird']),
  breed_or_type: z.string().optional().nullable(),
  record_id: z.string().optional().nullable(),
  pen_or_location: z.string().optional().nullable(),
  cause_of_death: z.string().optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  source_id: z.string().uuid().optional().nullable(),
  date_recorded: z.string().optional().nullable(),
});

async function postInventoryUsage(tx: any, {
  stockItemId,
  userId,
  quantity,
  transactionType,
  referenceTable,
  referenceId,
  notes,
}: {
  stockItemId: string;
  userId: string;
  quantity: number;
  transactionType: string;
  referenceTable: string;
  referenceId: string | null;
  notes: string;
}) {
  const item = await tx.stock_items.findFirst({
    where: { id: stockItemId, deleted_at: null },
  });
  if (!item) {
    throw Object.assign(new Error('Inventory item not found'), { code: 'INVENTORY_NOT_FOUND' });
  }

  const before = toNumber(item.current_quantity);
  const after = before - quantity;
  if (after < 0) {
    throw Object.assign(new Error('Insufficient stock'), { code: 'STOCK_LOW' });
  }

  await tx.stock_items.update({
    where: { id: stockItemId },
    data: { current_quantity: after, updated_at: new Date() },
  });

  await tx.stock_transactions.create({
    data: {
      stock_item_id: stockItemId,
      performed_by: userId,
      transaction_type: transactionType,
      quantity,
      quantity_before: before,
      quantity_after: after,
      reference_id: referenceId,
      reference_table: referenceTable,
      source_module: 'livestock',
      notes,
    },
  });

  return item;
}

async function getFarmOpsHealthLogs(farmId: string) {
  return prisma.$queryRaw<any[]>`
    SELECT
      h.*,
      u.full_name AS staff_name,
      si.name AS inventory_item_name
    FROM farm_ops_health_logs h
    LEFT JOIN users u ON u.id = h.created_by
    LEFT JOIN stock_items si ON si.id = h.inventory_stock_item_id
    WHERE h.farm_id = ${farmId}::uuid
    ORDER BY h.log_date DESC, h.created_at DESC
  `;
}

async function getFarmOpsFeedUsageLogs(farmId: string) {
  return prisma.$queryRaw<any[]>`
    SELECT
      f.*,
      u.full_name AS recorded_by_name,
      si.storage_location AS stock_location
    FROM farm_ops_feed_usage_logs f
    LEFT JOIN users u ON u.id = f.recorded_by
    LEFT JOIN stock_items si ON si.id = f.feed_stock_item_id
    WHERE f.farm_id = ${farmId}::uuid
    ORDER BY f.log_date DESC, f.created_at DESC
  `;
}

router.get('/command-center', async (req, res) => {
  const farmId = req.user!.farmId!;
  try {
    const [pigs, cattle, birds, ponds, fishStocks, mortality, healthLogs, feedUsageLogs, stockItems] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT * FROM pigs WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL ORDER BY created_at DESC`,
      prisma.$queryRaw<any[]>`SELECT * FROM cattle WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL ORDER BY created_at DESC`,
      prisma.$queryRaw<any[]>`SELECT * FROM birds WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL ORDER BY created_at DESC`,
      prisma.$queryRaw<any[]>`SELECT * FROM fish_ponds WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL ORDER BY created_at DESC`,
      prisma.$queryRaw<any[]>`
        SELECT
          fs.*,
          fp.pond_id AS pond_code,
          fp.location AS pond_location
        FROM fish_stock fs
        JOIN fish_ponds fp ON fp.id = fs.pond_id
        WHERE fs.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL
        ORDER BY fs.created_at DESC
      `,
      prisma.$queryRaw<any[]>`
        SELECT
          m.*,
          u.full_name AS reported_by_name
        FROM mortality_records m
        LEFT JOIN users u ON u.id = m.created_by
        WHERE m.farm_id = ${farmId}::uuid
        ORDER BY m.date_recorded DESC, m.created_at DESC
      `,
      getFarmOpsHealthLogs(farmId),
      getFarmOpsFeedUsageLogs(farmId),
      prisma.stock_items.findMany({
        where: { farm_id: farmId, deleted_at: null },
        include: {
          item_categories: { select: { name: true, type: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const latestHealthByKey = new Map<string, any>();
    for (const log of healthLogs) {
      const key = `${log.reference_kind}:${log.reference_code || log.reference_id || 'unknown'}`;
      if (!latestHealthByKey.has(key)) latestHealthByKey.set(key, log);
    }

    const latestFeedByKey = new Map<string, any>();
    for (const log of feedUsageLogs) {
      const key = `${log.reference_kind}:${log.reference_code || log.reference_id || 'unknown'}`;
      if (!latestFeedByKey.has(key)) latestFeedByKey.set(key, log);
    }

    const animalRows = [
      ...pigs.map((row) => {
        const key = `pig:${row.pig_id}`;
        const latestHealth = latestHealthByKey.get(key);
        const latestFeed = latestFeedByKey.get(key) || latestFeedByKey.get(`pig:${row.pen_number || row.pig_id}`);
        return {
          id: row.id,
          type: 'pig',
          animalId: row.pig_id,
          species: 'Pig',
          breed: row.breed || '-',
          gender: row.gender || '-',
          ageOrDateAdded: row.date_recorded,
          location: row.pen_number || '-',
          healthStatus: row.status || 'healthy',
          weightOrGrowthStage: latestHealth?.weight_kg ? `${latestHealth.weight_kg} kg` : 'Grower',
          lastTreatment: latestHealth?.treatment || latestHealth?.issue || '-',
          feedType: latestFeed?.feed_item_name || 'Starter ration',
          notes: latestHealth?.notes || '-',
        };
      }),
      ...cattle.map((row) => {
        const key = `cattle:${row.cattle_id}`;
        const latestHealth = latestHealthByKey.get(key);
        const latestFeed = latestFeedByKey.get(key) || latestFeedByKey.get(`cattle:${row.location || row.cattle_id}`);
        return {
          id: row.id,
          type: 'cattle',
          animalId: row.cattle_id,
          species: 'Cattle',
          breed: row.cattle_type || '-',
          gender: '-',
          ageOrDateAdded: row.date_recorded,
          location: row.location || '-',
          healthStatus: row.status || 'healthy',
          weightOrGrowthStage: latestHealth?.weight_kg ? `${latestHealth.weight_kg} kg` : 'Mature stock',
          lastTreatment: latestHealth?.treatment || latestHealth?.issue || '-',
          feedType: latestFeed?.feed_item_name || 'Pasture + supplement',
          notes: latestHealth?.notes || '-',
        };
      }),
      ...birds.map((row) => {
        const key = `bird:${row.batch_number}`;
        const latestHealth = latestHealthByKey.get(key);
        const latestFeed = latestFeedByKey.get(key);
        return {
          id: row.id,
          type: 'bird',
          animalId: row.batch_number,
          species: 'Bird',
          breed: row.bird_type || '-',
          gender: row.number_of_female || row.number_of_male ? `${row.number_of_female}/${row.number_of_male}` : '-',
          ageOrDateAdded: row.date_recorded,
          location: 'Poultry House',
          healthStatus: latestHealth?.recovery_status === 'under_treatment' ? 'under_treatment' : 'healthy',
          weightOrGrowthStage: `${row.number_of_birds} birds`,
          lastTreatment: latestHealth?.treatment || latestHealth?.issue || '-',
          feedType: latestFeed?.feed_item_name || 'Broiler ration',
          notes: latestHealth?.notes || '-',
        };
      }),
    ];

    const pondMortalityByLocation = mortality.reduce((map, row) => {
      if (row.livestock_type === 'fish' && row.pen_or_location) {
        map.set(row.pen_or_location, (map.get(row.pen_or_location) || 0) + Number(row.quantity || 1));
      }
      return map;
    }, new Map<string, number>());

    const pondFeedByCode = feedUsageLogs.reduce((map, row) => {
      if (row.reference_kind === 'pond') {
        const key = row.reference_code || row.group_name;
        map.set(key, (map.get(key) || 0) + Number(row.quantity_used || 0));
      }
      return map;
    }, new Map<string, number>());

    const latestFishBatchByPondId = new Map<string, any>();
    for (const row of fishStocks) {
      if (!latestFishBatchByPondId.has(row.pond_id)) latestFishBatchByPondId.set(row.pond_id, row);
    }

    const pondRows = ponds.map((pond) => {
      const latestBatch = latestFishBatchByPondId.get(pond.id);
      const latestHealth = latestHealthByKey.get(`pond:${pond.pond_id}`);
      return {
        id: pond.id,
        pondId: pond.pond_id,
        fishType: pond.fish_type || latestBatch?.fish_type || 'Mixed stock',
        stockingQuantity: latestBatch?.number_of_fish || pond.current_fish_count,
        currentEstimate: pond.current_fish_count,
        feedUsed: pondFeedByCode.get(pond.pond_id) || 0,
        mortalityCount: pondMortalityByLocation.get(pond.pond_id) || 0,
        stockingDate: pond.stocking_date || latestBatch?.date_recorded || null,
        expectedHarvestDate: pond.expected_harvest_date || null,
        status: latestHealth?.recovery_status === 'under_treatment' ? 'monitoring' : (pond.status || 'available'),
        location: pond.location || '-',
      };
    });

    const monthStart = startOfMonth().getTime();
    const mortalityThisMonth = mortality.filter((row) => new Date(row.date_recorded).getTime() >= monthStart)
      .reduce((sum, row) => sum + Number(row.quantity || 1), 0);
    const feedConsumedThisMonth = feedUsageLogs.filter((row) => new Date(row.log_date).getTime() >= monthStart)
      .reduce((sum, row) => sum + Number(row.quantity_used || 0), 0);
    const upcomingHealthChecks = healthLogs.filter((row) => {
      if (!row.next_check_date) return false;
      const date = new Date(row.next_check_date).getTime();
      return date >= Date.now() && date <= Date.now() + 14 * 24 * HOUR_MS;
    }).length;

    const sickAnimals = animalRows.filter((row) => ['sick', 'under_treatment', 'quarantine'].includes(String(row.healthStatus).toLowerCase())).length;
    const totalAnimals = pigs.length + cattle.length + birds.reduce((sum, row) => sum + Number(row.number_of_birds || 0), 0) + ponds.reduce((sum, row) => sum + Number(row.current_fish_count || 0), 0);
    const healthyAnimals = Math.max(totalAnimals - sickAnimals - mortalityThisMonth, 0);

    res.json({
      summary: {
        totalAnimals,
        pigs: pigs.length,
        cattle: cattle.length,
        birds: birds.reduce((sum, row) => sum + Number(row.number_of_birds || 0), 0),
        fishPonds: ponds.length,
        healthyAnimals,
        sickAnimals,
        mortalityThisMonth,
        feedConsumedThisMonth,
        upcomingHealthChecks,
      },
      animalRegister: animalRows,
      fishPonds: pondRows,
      healthLogs: healthLogs.map((row) => ({
        id: row.id,
        recordId: row.reference_code || row.reference_id,
        animalOrPondId: row.reference_code || row.reference_id,
        issue: row.issue,
        treatment: row.treatment,
        medicineUsed: row.medicine_used,
        vetStaffResponsible: row.vet_staff_responsible,
        date: row.log_date,
        recoveryStatus: row.recovery_status,
        notes: row.notes,
        referenceKind: row.reference_kind,
        staffName: row.staff_name,
      })),
      feedUsageLogs: feedUsageLogs.map((row) => ({
        id: row.id,
        date: row.log_date,
        animalGroupOrPond: row.group_name,
        feedItem: row.feed_item_name,
        quantityUsed: Number(row.quantity_used || 0),
        unit: row.unit,
        inventorySource: row.inventory_source || row.stock_location || '-',
        recordedBy: row.recorded_by_name,
        referenceKind: row.reference_kind,
      })),
      mortalityLogs: mortality.map((row) => ({
        id: row.id,
        date: row.date_recorded,
        animalOrPondId: row.record_id || row.pen_or_location || '-',
        species: row.livestock_type,
        cause: row.cause_of_death || '-',
        quantity: Number(row.quantity || 1),
        reportedBy: row.reported_by_name || 'Unknown',
        notes: row.breed_or_type || '-',
      })),
      stockItems: stockItems.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit_of_measure,
        location: item.storage_location,
        currentQuantity: toNumber(item.current_quantity),
        category: item.item_categories?.name || null,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch farm operations command center', code: 'DB_ERROR' });
  }
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
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT * FROM pigs WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Pig not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Record cannot be modified after 24 hours', code: 'IMMUTABLE' });

    if (req.body.status === 'dead') {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO mortality_records (farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death, quantity, source_table, source_id, created_by)
          VALUES (${farmId}::uuid, 'pig', ${existing[0].breed ?? ''}, ${existing[0].pig_id}, ${existing[0].pen_number ?? ''},
                  ${req.body.cause_of_death ?? null}, 1, 'pigs', ${id}::uuid, ${userId}::uuid)
        `;
        await tx.$executeRaw`UPDATE pigs SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${id}::uuid`;
      });
      return res.json({ migrated: true, message: 'Pig moved to mortality records' });
    }

    const rows = await prisma.$queryRaw<any[]>`
      UPDATE pigs SET
        breed = COALESCE(${req.body.breed ?? null}, breed),
        gender = COALESCE(${req.body.gender ?? null}, gender),
        status = COALESCE(${req.body.status ?? null}, status),
        pen_number = COALESCE(${req.body.pen_number ?? null}, pen_number),
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
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT * FROM cattle WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Cattle not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Record cannot be modified after 24 hours', code: 'IMMUTABLE' });

    if (req.body.status === 'dead') {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO mortality_records (farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death, quantity, source_table, source_id, created_by)
          VALUES (${farmId}::uuid, 'cattle', ${existing[0].cattle_type}, ${existing[0].cattle_id}, ${existing[0].location ?? ''},
                  ${req.body.cause_of_death ?? null}, 1, 'cattle', ${id}::uuid, ${userId}::uuid)
        `;
        await tx.$executeRaw`UPDATE cattle SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${id}::uuid`;
      });
      return res.json({ migrated: true, message: 'Cattle moved to mortality records' });
    }

    const rows = await prisma.$queryRaw<any[]>`
      UPDATE cattle SET
        cattle_type = COALESCE(${req.body.cattle_type ?? null}, cattle_type),
        status = COALESCE(${req.body.status ?? null}, status),
        location = COALESCE(${req.body.location ?? null}, location),
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
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT created_at FROM birds WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
    if (!existing.length) return res.status(404).json({ error: 'Bird record not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot modify after 24 hours', code: 'IMMUTABLE' });
    const rows = await prisma.$queryRaw<any[]>`
      UPDATE birds SET
        bird_type = COALESCE(${req.body.bird_type ?? null}, bird_type),
        batch_number = COALESCE(${req.body.batch_number ?? null}, batch_number),
        number_of_birds = COALESCE(${req.body.number_of_birds ?? null}, number_of_birds),
        number_of_female = COALESCE(${req.body.number_of_female ?? null}, number_of_female),
        number_of_male = COALESCE(${req.body.number_of_male ?? null}, number_of_male),
        updated_at = NOW()
      WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid
      RETURNING *
    `;
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update bird record', code: 'DB_ERROR' });
  }
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
      INSERT INTO fish_ponds (farm_id, pond_id, fish_type, length_m, width_m, location, capacity, status, stocking_date, expected_harvest_date, created_by)
      VALUES (${farmId}::uuid, ${d.pond_id}, ${d.fish_type ?? null}, ${d.length_m ?? null}, ${d.width_m ?? null}, ${d.location ?? null},
              ${d.capacity}, ${d.status}, ${d.stocking_date ? new Date(d.stocking_date) : null}::date, ${d.expected_harvest_date ? new Date(d.expected_harvest_date) : null}::date, ${userId}::uuid)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: 'Pond ID already exists', code: 'DUPLICATE' });
    res.status(500).json({ error: 'Failed to create fish pond', code: 'DB_ERROR' });
  }
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
        UPDATE fish_ponds SET
          fish_type = COALESCE(${d.fish_type}, fish_type),
          current_fish_count = ${newCount},
          status = ${newStatus},
          stocking_date = COALESCE(${d.date_recorded ? new Date(d.date_recorded) : null}::date, stocking_date),
          expected_harvest_date = COALESCE(${d.expected_harvest_date ? new Date(d.expected_harvest_date) : null}::date, expected_harvest_date),
          updated_at = NOW()
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
  try {
    const existing = await prisma.$queryRaw<any[]>`
      SELECT fs.*, fp.farm_id FROM fish_stock fs
      JOIN fish_ponds fp ON fp.id = fs.pond_id
      WHERE fs.id = ${id}::uuid AND fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL
    `;
    if (!existing.length) return res.status(404).json({ error: 'Fish record not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot modify after 24 hours', code: 'IMMUTABLE' });
    const rows = await prisma.$transaction(async (tx) => {
      const updatedFish = await tx.$queryRaw<any[]>`
        UPDATE fish_stock SET
          fish_type = COALESCE(${req.body.fish_type ?? null}, fish_type),
          batch_number = COALESCE(${req.body.batch_number ?? null}, batch_number),
          number_of_fish = COALESCE(${req.body.number_of_fish ?? null}::integer, number_of_fish),
          updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING *
      `;
      if (req.body.number_of_fish !== undefined) {
        const diff = Number(req.body.number_of_fish) - Number(existing[0].number_of_fish);
        await tx.$executeRaw`
          UPDATE fish_ponds
          SET current_fish_count = GREATEST(0, current_fish_count + ${diff}), updated_at = NOW()
          WHERE id = ${existing[0].pond_id}::uuid
        `;
      }
      return updatedFish;
    });
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
      SELECT fs.created_at, fs.number_of_fish, fs.pond_id
      FROM fish_stock fs
      JOIN fish_ponds fp ON fp.id = fs.pond_id
      WHERE fs.id = ${id}::uuid AND fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL
    `;
    if (!existing.length) return res.status(404).json({ error: 'Fish record not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot delete after 24 hours', code: 'IMMUTABLE' });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE fish_stock SET deleted_at = NOW() WHERE id = ${id}::uuid`;
      await tx.$executeRaw`
        UPDATE fish_ponds SET
          current_fish_count = GREATEST(0, current_fish_count - ${Number(existing[0].number_of_fish)}),
          updated_at = NOW()
        WHERE id = ${existing[0].pond_id}::uuid
      `;
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete fish record', code: 'DB_ERROR' });
  }
});

router.post('/health-logs', async (req, res) => {
  const parsed = healthLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  const farmId = req.user!.farmId!;
  const userId = req.user!.userId;
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (d.inventory_stock_item_id && d.inventory_quantity_used && d.inventory_quantity_used > 0) {
        await postInventoryUsage(tx, {
          stockItemId: d.inventory_stock_item_id,
          userId,
          quantity: d.inventory_quantity_used,
          transactionType: 'treatment_usage',
          referenceTable: 'farm_ops_health_logs',
          referenceId: null,
          notes: d.notes || `Treatment stock issued for ${d.reference_code || d.reference_kind}`,
        });
      }

      const rows = await tx.$queryRaw<any[]>`
        INSERT INTO farm_ops_health_logs (
          farm_id, reference_kind, reference_id, reference_code, issue, treatment, medicine_used,
          inventory_stock_item_id, inventory_quantity_used, vet_staff_responsible, recovery_status,
          log_date, next_check_date, notes, created_by
        )
        VALUES (
          ${farmId}::uuid, ${d.reference_kind}, ${d.reference_id ?? null}::uuid, ${d.reference_code ?? null},
          ${d.issue}, ${d.treatment ?? null}, ${d.medicine_used ?? null},
          ${d.inventory_stock_item_id ?? null}::uuid, ${d.inventory_quantity_used ?? null}, ${d.vet_staff_responsible ?? null},
          ${d.recovery_status ?? 'under_treatment'}, ${d.log_date ? new Date(d.log_date) : new Date()}::date,
          ${d.next_check_date ? new Date(d.next_check_date) : null}::date, ${d.notes ?? null}, ${userId}::uuid
        )
        RETURNING *
      `;

      if (d.reference_kind === 'pig' && d.reference_id) {
        await tx.$executeRaw`UPDATE pigs SET status = 'sick', updated_at = NOW() WHERE id = ${d.reference_id}::uuid`;
      }
      if (d.reference_kind === 'cattle' && d.reference_id) {
        await tx.$executeRaw`UPDATE cattle SET status = 'sick', updated_at = NOW() WHERE id = ${d.reference_id}::uuid`;
      }

      return rows[0];
    });

    res.status(201).json(result);
  } catch (error: any) {
    if (error?.code === 'INVENTORY_NOT_FOUND') return res.status(404).json({ error: 'Inventory item not found', code: 'NOT_FOUND' });
    if (error?.code === 'STOCK_LOW') return res.status(400).json({ error: 'Insufficient inventory for treatment', code: 'STOCK_LOW' });
    res.status(500).json({ error: 'Failed to create health log', code: 'DB_ERROR' });
  }
});

router.post('/feed-usage', async (req, res) => {
  const parsed = feedUsageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const d = parsed.data;
  const farmId = req.user!.farmId!;
  const userId = req.user!.userId;
  try {
    const result = await prisma.$transaction(async (tx) => {
      let sourceName = d.inventory_source ?? null;
      if (d.feed_stock_item_id) {
        const item = await postInventoryUsage(tx, {
          stockItemId: d.feed_stock_item_id,
          userId,
          quantity: d.quantity_used,
          transactionType: 'feed_usage',
          referenceTable: 'farm_ops_feed_usage_logs',
          referenceId: null,
          notes: d.notes || `Feed issued to ${d.group_name}`,
        });
        sourceName = sourceName || item.storage_location || item.name;
      }

      const rows = await tx.$queryRaw<any[]>`
        INSERT INTO farm_ops_feed_usage_logs (
          farm_id, reference_kind, reference_id, reference_code, group_name, feed_stock_item_id,
          feed_item_name, quantity_used, unit, inventory_source, log_date, notes, recorded_by
        )
        VALUES (
          ${farmId}::uuid, ${d.reference_kind}, ${d.reference_id ?? null}::uuid, ${d.reference_code ?? null},
          ${d.group_name}, ${d.feed_stock_item_id ?? null}::uuid, ${d.feed_item_name}, ${d.quantity_used},
          ${d.unit}, ${sourceName ?? null}, ${d.log_date ? new Date(d.log_date) : new Date()}::date, ${d.notes ?? null}, ${userId}::uuid
        )
        RETURNING *
      `;
      return rows[0];
    });
    res.status(201).json(result);
  } catch (error: any) {
    if (error?.code === 'INVENTORY_NOT_FOUND') return res.status(404).json({ error: 'Inventory item not found', code: 'NOT_FOUND' });
    if (error?.code === 'STOCK_LOW') return res.status(400).json({ error: 'Insufficient inventory for feed usage', code: 'STOCK_LOW' });
    res.status(500).json({ error: 'Failed to record feed usage', code: 'DB_ERROR' });
  }
});

router.get('/mortality', async (req, res) => {
  const farmId = req.user!.farmId;
  const type = req.query.type as string | undefined;
  try {
    const rows = type
      ? await prisma.$queryRaw<any[]>`
          SELECT m.*, u.full_name AS reported_by_name
          FROM mortality_records m
          LEFT JOIN users u ON u.id = m.created_by
          WHERE m.farm_id = ${farmId}::uuid AND m.livestock_type = ${type}
          ORDER BY m.created_at DESC
        `
      : await prisma.$queryRaw<any[]>`
          SELECT m.*, u.full_name AS reported_by_name
          FROM mortality_records m
          LEFT JOIN users u ON u.id = m.created_by
          WHERE m.farm_id = ${farmId}::uuid
          ORDER BY m.created_at DESC
        `;
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch mortality records', code: 'DB_ERROR' });
  }
});

router.post('/mortality', async (req, res) => {
  const parsed = mortalitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  const d = parsed.data;
  const farmId = req.user!.farmId!;
  const userId = req.user!.userId;
  const wordCount = (d.cause_of_death ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 50) return res.status(400).json({ error: 'Cause of death must be 50 words or fewer', code: 'VALIDATION_ERROR' });

  try {
    const rows = await prisma.$transaction(async (tx) => {
      let sourceId = d.source_id ?? null;
      let sourceTable: string | null = null;
      let breedOrType = d.breed_or_type ?? null;
      let recordCode = d.record_id ?? null;
      let location = d.pen_or_location ?? null;

      if (d.livestock_type === 'pig' && d.record_id) {
        const match = await tx.$queryRaw<any[]>`SELECT * FROM pigs WHERE pig_id = ${d.record_id} AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
        if (match.length) {
          sourceId = match[0].id;
          sourceTable = 'pigs';
          breedOrType = breedOrType || match[0].breed;
          location = location || match[0].pen_number;
          await tx.$executeRaw`UPDATE pigs SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${match[0].id}::uuid`;
        }
      } else if (d.livestock_type === 'cattle' && d.record_id) {
        const match = await tx.$queryRaw<any[]>`SELECT * FROM cattle WHERE cattle_id = ${d.record_id} AND farm_id = ${farmId}::uuid AND deleted_at IS NULL`;
        if (match.length) {
          sourceId = match[0].id;
          sourceTable = 'cattle';
          breedOrType = breedOrType || match[0].cattle_type;
          location = location || match[0].location;
          await tx.$executeRaw`UPDATE cattle SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${match[0].id}::uuid`;
        }
      } else if (d.livestock_type === 'bird' && d.record_id) {
        const match = await tx.$queryRaw<any[]>`SELECT * FROM birds WHERE batch_number = ${d.record_id} AND farm_id = ${farmId}::uuid AND deleted_at IS NULL LIMIT 1`;
        if (match.length) {
          sourceId = match[0].id;
          sourceTable = 'birds';
          breedOrType = breedOrType || match[0].bird_type;
          const remaining = Math.max(Number(match[0].number_of_birds) - d.quantity, 0);
          await tx.$executeRaw`
            UPDATE birds
            SET number_of_birds = ${remaining},
                deleted_at = CASE WHEN ${remaining} = 0 THEN NOW() ELSE deleted_at END,
                updated_at = NOW()
            WHERE id = ${match[0].id}::uuid
          `;
        }
      } else if (d.livestock_type === 'fish') {
        if (d.record_id) {
          const batchMatch = await tx.$queryRaw<any[]>`
            SELECT fs.*, fp.pond_id AS pond_code
            FROM fish_stock fs
            JOIN fish_ponds fp ON fp.id = fs.pond_id
            WHERE fs.batch_number = ${d.record_id} AND fp.farm_id = ${farmId}::uuid AND fs.deleted_at IS NULL
            LIMIT 1
          `;
          if (batchMatch.length) {
            sourceId = batchMatch[0].id;
            sourceTable = 'fish_stock';
            breedOrType = breedOrType || batchMatch[0].fish_type;
            location = location || batchMatch[0].pond_code;
            const remainingBatch = Math.max(Number(batchMatch[0].number_of_fish) - d.quantity, 0);
            await tx.$executeRaw`
              UPDATE fish_stock
              SET number_of_fish = ${remainingBatch},
                  deleted_at = CASE WHEN ${remainingBatch} = 0 THEN NOW() ELSE deleted_at END,
                  updated_at = NOW()
              WHERE id = ${batchMatch[0].id}::uuid
            `;
            await tx.$executeRaw`
              UPDATE fish_ponds
              SET current_fish_count = GREATEST(0, current_fish_count - ${d.quantity}),
                  updated_at = NOW()
              WHERE id = ${batchMatch[0].pond_id}::uuid
            `;
          }
        }
      }

      const inserted = await tx.$queryRaw<any[]>`
        INSERT INTO mortality_records (
          farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death,
          quantity, source_table, source_id, date_recorded, created_by
        )
        VALUES (
          ${farmId}::uuid, ${d.livestock_type}, ${breedOrType}, ${recordCode}, ${location},
          ${d.cause_of_death ?? null}, ${d.quantity}, ${sourceTable}, ${sourceId ?? null}::uuid,
          ${d.date_recorded ? new Date(d.date_recorded) : new Date()}::date, ${userId}::uuid
        )
        RETURNING *
      `;
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
  const wordCount = (req.body.cause_of_death ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 50) return res.status(400).json({ error: 'Cause of death must be 50 words or fewer', code: 'VALIDATION_ERROR' });
  try {
    const existing = await prisma.$queryRaw<any[]>`SELECT created_at FROM mortality_records WHERE id = ${id}::uuid AND farm_id = ${farmId}::uuid`;
    if (!existing.length) return res.status(404).json({ error: 'Record not found', code: 'NOT_FOUND' });
    if (!within24h(existing[0].created_at)) return res.status(403).json({ error: 'Cannot modify after 24 hours', code: 'IMMUTABLE' });
    const rows = await prisma.$queryRaw<any[]>`
      UPDATE mortality_records SET
        breed_or_type = COALESCE(${req.body.breed_or_type ?? null}, breed_or_type),
        record_id = COALESCE(${req.body.record_id ?? null}, record_id),
        pen_or_location = COALESCE(${req.body.pen_or_location ?? null}, pen_or_location),
        cause_of_death = COALESCE(${req.body.cause_of_death ?? null}, cause_of_death),
        quantity = COALESCE(${req.body.quantity ?? null}, quantity),
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
