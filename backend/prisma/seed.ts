import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

dotenv.config();

const prisma = new PrismaClient();

const FARM_ID = '00000000-0000-0000-0000-000000000001';

const USERS = {
  superAdmin: {
    userId: '00000000-0000-0000-0000-000000000002',
    employeeId: '00000000-0000-0000-0000-000000000003',
    email: 'admin@agritech.local',
    password: 'password123',
    fullName: 'System Administrator',
    role: 'super_admin',
    username: 'admin',
    jobTitle: 'System Administrator',
    department: 'Administration',
  },
  farmManager: {
    userId: '00000000-0000-0000-0000-000000000004',
    employeeId: '00000000-0000-0000-0000-000000000005',
    email: 'manager@agritech.local',
    password: 'password123',
    fullName: 'Farm Manager',
    role: 'farm_manager',
    username: 'manager',
    jobTitle: 'Farm Manager',
    department: 'Operations',
  },
  salesOfficer: {
    userId: '00000000-0000-0000-0000-000000000006',
    employeeId: '00000000-0000-0000-0000-000000000007',
    email: 'sales@agritech.local',
    password: 'password123',
    fullName: 'Sales Officer',
    role: 'sales_customer_officer',
    username: 'sales',
    jobTitle: 'Sales Customer Officer',
    department: 'Sales',
  },
  customer: {
    userId: '00000000-0000-0000-0000-000000000008',
    customerId: '00000000-0000-0000-0000-000000000009',
    email: 'customer@agritech.local',
    password: 'password123',
    fullName: 'Demo Customer',
    role: 'customer',
    username: 'customer',
    customerType: 'retailer',
  },
} as const;

async function ensureRole(name: string) {
  const role = await prisma.roles.findFirst({ where: { name } });
  if (!role) {
    throw new Error(`Role '${name}' not found. Run the permission seed before backend/prisma/seed.ts.`);
  }
  return role;
}

async function upsertEmployeeUser(config: {
  userId: string;
  employeeId: string;
  email: string;
  password: string;
  fullName: string;
  role: string;
  username: string;
  jobTitle: string;
  department: string;
}) {
  const role = await ensureRole(config.role);
  const passwordHash = await bcrypt.hash(config.password, 12);

  const user = await prisma.users.upsert({
    where: { id: config.userId },
    update: {
      role_id: role.id,
      full_name: config.fullName,
      email: config.email,
      username: config.username,
      password_hash: passwordHash,
      is_active: true,
      deleted_at: null,
      deactivated_at: null,
    },
    create: {
      id: config.userId,
      role_id: role.id,
      full_name: config.fullName,
      email: config.email,
      username: config.username,
      password_hash: passwordHash,
    },
  });

  await prisma.employees.upsert({
    where: { id: config.employeeId },
    update: {
      user_id: user.id,
      farm_id: FARM_ID,
      full_name: config.fullName,
      employment_type: 'permanent',
      job_title: config.jobTitle,
      department: config.department,
      email: config.email,
      status: 'active',
      deleted_at: null,
    },
    create: {
      id: config.employeeId,
      user_id: user.id,
      farm_id: FARM_ID,
      full_name: config.fullName,
      employment_type: 'permanent',
      job_title: config.jobTitle,
      department: config.department,
      email: config.email,
      status: 'active',
      personnel_id: config.username.toUpperCase(),
    },
  });
}

async function upsertCustomerUser(config: {
  userId: string;
  customerId: string;
  email: string;
  password: string;
  fullName: string;
  role: string;
  username: string;
  customerType: string;
}) {
  const role = await ensureRole(config.role);
  const passwordHash = await bcrypt.hash(config.password, 12);

  await prisma.customers.upsert({
    where: { id: config.customerId },
    update: {
      farm_id: FARM_ID,
      name: config.fullName,
      email: config.email,
      customer_type: config.customerType,
      is_active: true,
      deleted_at: null,
      deactivated_at: null,
    },
    create: {
      id: config.customerId,
      farm_id: FARM_ID,
      name: config.fullName,
      email: config.email,
      customer_type: config.customerType,
      is_active: true,
    },
  });

  await prisma.users.upsert({
    where: { id: config.userId },
    update: {
      role_id: role.id,
      full_name: config.fullName,
      email: config.email,
      username: config.username,
      password_hash: passwordHash,
      linked_customer_id: config.customerId,
      is_active: true,
      deleted_at: null,
      deactivated_at: null,
    },
    create: {
      id: config.userId,
      role_id: role.id,
      full_name: config.fullName,
      email: config.email,
      username: config.username,
      password_hash: passwordHash,
      linked_customer_id: config.customerId,
    },
  });
}

async function main() {
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

  await upsertEmployeeUser(USERS.superAdmin);
  await upsertEmployeeUser(USERS.farmManager);
  await upsertEmployeeUser(USERS.salesOfficer);
  await upsertCustomerUser(USERS.customer);

  console.log('\nSeed complete.');
  console.log('Demo logins:');
  console.log(`  super_admin            ${USERS.superAdmin.email} / ${USERS.superAdmin.password}`);
  console.log(`  farm_manager           ${USERS.farmManager.email} / ${USERS.farmManager.password}`);
  console.log(`  sales_customer_officer ${USERS.salesOfficer.email} / ${USERS.salesOfficer.password}`);
  console.log(`  customer               ${USERS.customer.email} / ${USERS.customer.password}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
