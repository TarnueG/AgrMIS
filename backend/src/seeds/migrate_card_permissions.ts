import prisma from '../lib/prisma';
import { allCardIds, CARD_REGISTRY } from '../lib/cardRegistry';

async function main() {
  // 1 — create card_permissions table if it doesn't exist
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS card_permissions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      farm_id UUID NOT NULL,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT farm_role_card UNIQUE (farm_id, role_id, card_id)
    )
  `);
  console.log('card_permissions table ready');

  // 2 — for every existing subsystem_permissions row where can_view = true,
  //     grant all card IDs under that subsystem (idempotent via ON CONFLICT DO NOTHING)
  const rows = await (prisma as any).subsystem_permissions.findMany({
    where: { can_view: true },
  });

  let granted = 0;
  for (const row of rows) {
    const cardIds = allCardIds(row.subsystem as string);
    if (!cardIds.length) continue;
    for (const cardId of cardIds) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO card_permissions (farm_id, role_id, card_id)
         VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT ON CONSTRAINT farm_role_card DO NOTHING`,
        row.farm_id, row.role_id, cardId
      );
      granted++;
    }
  }
  console.log(`Granted ${granted} card permission(s) from existing subsystem grants`);

  // 3 — admin role gets all cards across all farms (handled at runtime by isAdmin bypass, but seed anyway)
  const adminRole = await prisma.roles.findFirst({ where: { name: 'admin' } });
  const farms: Array<{ id: string }> = await prisma.$queryRaw`SELECT DISTINCT farm_id AS id FROM subsystem_permissions`;
  if (adminRole) {
    const allIds = Object.keys(CARD_REGISTRY).flatMap(sub => allCardIds(sub));
    for (const farm of farms) {
      for (const cardId of allIds) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO card_permissions (farm_id, role_id, card_id)
           VALUES ($1::uuid, $2::uuid, $3)
           ON CONFLICT ON CONSTRAINT farm_role_card DO NOTHING`,
          farm.id, adminRole.id, cardId
        );
      }
    }
    console.log('Admin role card permissions seeded');
  }

  await prisma.$disconnect();
  console.log('Migration complete');
}

main().catch(e => { console.error(e.message); process.exit(1); });
