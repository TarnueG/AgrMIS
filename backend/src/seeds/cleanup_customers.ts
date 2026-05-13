import prisma from '../lib/prisma';

async function main() {
  // Soft-delete G Tarnue Gayflor
  const tarnue = await (prisma as any).customers.updateMany({
    where: { name: { contains: 'Tarnue', mode: 'insensitive' }, deleted_at: null },
    data: { deleted_at: new Date() },
  });
  console.log(`Removed Tarnue Gayflor: ${tarnue.count} record(s)`);

  // Soft-delete all deactivated customers
  const deactivated = await (prisma as any).customers.updateMany({
    where: { is_active: false, deleted_at: null },
    data: { deleted_at: new Date() },
  });
  console.log(`Cleared deactivated customers: ${deactivated.count} record(s)`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
