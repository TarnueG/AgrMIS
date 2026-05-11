import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const FARM_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000002';
const ADMIN_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000003';

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@agritech.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';

  // Roles are already seeded by amis_schema.sql — just verify
  const adminRole = await prisma.roles.findFirst({ where: { name: 'admin' } });
  if (!adminRole) {
    throw new Error('Admin role not found. Run docs/amis_schema.sql against AMIS_DB first.');
  }

  // Default farm
  await prisma.farm_profiles.upsert({
    where: { id: FARM_ID },
    update: {},
    create: {
      id: FARM_ID,
      name: 'Agri-Tech Default Farm',
      country: 'Liberia',
      operational_sectors: ['crop', 'livestock', 'aquaculture'],
    },
  });

  // Admin user
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.users.upsert({
    where: { id: ADMIN_USER_ID },
    update: {},
    create: {
      id: ADMIN_USER_ID,
      role_id: adminRole.id,
      full_name: 'System Administrator',
      email: adminEmail,
      password_hash: passwordHash,
    },
  });

  // Link admin to farm via employees so farm context resolves on login
  await prisma.employees.upsert({
    where: { id: ADMIN_EMPLOYEE_ID },
    update: {},
    create: {
      id: ADMIN_EMPLOYEE_ID,
      user_id: admin.id,
      farm_id: FARM_ID,
      full_name: 'System Administrator',
      employment_type: 'permanent',
      job_title: 'System Administrator',
      department: 'Administration',
    },
  });

  console.log('\nSeed complete.');
  console.log('Login with:');
  console.log('  Email   :', adminEmail);
  console.log('  Password:', adminPassword);
  console.log('\nChange the password after first login.\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
