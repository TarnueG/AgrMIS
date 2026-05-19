import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

dotenv.config();

const prisma = new PrismaClient();
const prismaAny = prisma as any;

const FARM_ID = '00000000-0000-0000-0000-000000000001';

const USERS = {
  superAdmin: {
    userId: '00000000-0000-0000-0000-000000000002',
    employeeId: '00000000-0000-0000-0000-000000000003',
    email: process.env.ADMIN_EMAIL || 'admin@agritech.local',
    password: process.env.ADMIN_PASSWORD || 'Admin@1234',
    fullName: 'System Administrator',
    role: 'super_admin',
    username: 'admin',
    jobTitle: 'System Administrator',
    department: 'Administration',
    sector: 'admin',
    monthlySalary: 4800,
    bankId: 'BANK-ADM-001',
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
    sector: 'general',
    monthlySalary: 3200,
    bankId: 'BANK-MGR-001',
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
    sector: 'logistics',
    monthlySalary: 2300,
    bankId: 'BANK-SLS-001',
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

type StockTransactionSeed = {
  type: string;
  quantity: number;
  before: number;
  after: number;
  note: string;
};

type StockAlertSeed = {
  status: string;
  quantityAtTrigger: number;
  notes: string;
};

type StockItemSeed = {
  sku: string;
  name: string;
  category: string;
  unitName: string;
  unitSymbol: string;
  unitCategory: string;
  quantity: number;
  reservedQuantity: number;
  reorderThreshold: number;
  unitCost: number;
  storageLocation: string;
  description: string;
  transactions: StockTransactionSeed[];
  alert?: StockAlertSeed;
};

const STOCK_ITEMS: StockItemSeed[] = [
  {
    sku: 'SEED-MAIZE-350',
    name: 'Hybrid Maize Seed - FAO 350',
    category: 'Seeds',
    unitName: 'bag',
    unitSymbol: 'bag',
    unitCategory: 'count',
    quantity: 420,
    reservedQuantity: 75,
    reorderThreshold: 180,
    unitCost: 48.5,
    storageLocation: 'Seed Store A',
    description: 'Certified hybrid maize seed reserved for spring planting blocks.',
    transactions: [
      { type: 'purchase', quantity: 300, before: 0, after: 300, note: 'Opening certified seed receipt.' },
      { type: 'usage', quantity: 80, before: 300, after: 220, note: 'Issued to early planting block.' },
      { type: 'purchase', quantity: 200, before: 220, after: 420, note: 'Seasonal replenishment.' },
    ],
  },
  {
    sku: 'FERT-UREA-4600',
    name: 'Urea Fertilizer 46-0-0',
    category: 'Fertilizers',
    unitName: 'kilogram',
    unitSymbol: 'kg',
    unitCategory: 'mass',
    quantity: 1200,
    reservedQuantity: 350,
    reorderThreshold: 500,
    unitCost: 0.62,
    storageLocation: 'Fertilizer Shed 1',
    description: 'Nitrogen fertilizer allocated to maize and vegetable plots.',
    transactions: [
      { type: 'purchase', quantity: 900, before: 0, after: 900, note: 'Bulk fertilizer delivery.' },
      { type: 'usage', quantity: 360, before: 900, after: 540, note: 'Issued for maize top dressing.' },
      { type: 'purchase', quantity: 660, before: 540, after: 1200, note: 'Procurement replenishment.' },
    ],
  },
  {
    sku: 'FEED-BROILER-ST',
    name: 'Broiler Starter Feed',
    category: 'Livestock Feed',
    unitName: 'bag',
    unitSymbol: 'bag',
    unitCategory: 'count',
    quantity: 95,
    reservedQuantity: 30,
    reorderThreshold: 160,
    unitCost: 18.25,
    storageLocation: 'Feed Store A',
    description: 'Low stock feed for the next poultry cycle.',
    transactions: [
      { type: 'purchase', quantity: 160, before: 0, after: 160, note: 'Initial poultry feed intake.' },
      { type: 'usage', quantity: 65, before: 160, after: 95, note: 'Issued to broiler house.' },
    ],
    alert: { status: 'open', quantityAtTrigger: 95, notes: 'Below reorder threshold for upcoming poultry batch.' },
  },
  {
    sku: 'FEED-FISH-32',
    name: 'Floating Fish Feed 32% Protein',
    category: 'Aquaculture Feed',
    unitName: 'bag',
    unitSymbol: 'bag',
    unitCategory: 'count',
    quantity: 180,
    reservedQuantity: 45,
    reorderThreshold: 220,
    unitCost: 22,
    storageLocation: 'Feed Store B',
    description: 'Aquaculture feed nearing reorder threshold.',
    transactions: [
      { type: 'purchase', quantity: 240, before: 0, after: 240, note: 'Aquaculture feed receipt.' },
      { type: 'usage', quantity: 60, before: 240, after: 180, note: 'Issued to current pond cycle.' },
    ],
    alert: { status: 'open', quantityAtTrigger: 180, notes: 'Urgent replenishment required for pond feeding plan.' },
  },
  {
    sku: 'CHEM-COPPER-5L',
    name: 'Copper Fungicide 5L',
    category: 'Pesticides & Chemicals',
    unitName: 'piece',
    unitSymbol: 'pc',
    unitCategory: 'count',
    quantity: 42,
    reservedQuantity: 0,
    reorderThreshold: 30,
    unitCost: 31.8,
    storageLocation: 'Chemical Store',
    description: 'Chemical stock on quality hold pending inspection.',
    transactions: [
      { type: 'purchase', quantity: 42, before: 0, after: 42, note: 'Chemical receipt awaiting quality inspection.' },
    ],
  },
  {
    sku: 'RICE-FG-5KG',
    name: 'Packaged Rice 5kg',
    category: 'Crop Harvest',
    unitName: 'bag',
    unitSymbol: 'bag',
    unitCategory: 'count',
    quantity: 310,
    reservedQuantity: 95,
    reorderThreshold: 140,
    unitCost: 4.2,
    storageLocation: 'Finished Goods Store',
    description: 'Finished goods reserved for confirmed customer orders.',
    transactions: [
      { type: 'purchase', quantity: 420, before: 0, after: 420, note: 'Production output from packaging line.' },
      { type: 'sale', quantity: 110, before: 420, after: 310, note: 'Customer dispatches completed.' },
    ],
  },
  {
    sku: 'TOOLS-CRATE-2026',
    name: 'Reusable Harvest Crates',
    category: 'General Supplies',
    unitName: 'piece',
    unitSymbol: 'pc',
    unitCategory: 'count',
    quantity: 55,
    reservedQuantity: 0,
    reorderThreshold: 80,
    unitCost: 6.75,
    storageLocation: 'Packing Shed',
    description: 'Harvest crates damaged and below operating requirement.',
    transactions: [
      { type: 'purchase', quantity: 90, before: 0, after: 90, note: 'Harvest crate purchase.' },
      { type: 'waste', quantity: 35, before: 90, after: 55, note: 'Crates damaged during field handling.' },
    ],
    alert: { status: 'open', quantityAtTrigger: 55, notes: 'Crate stock short against harvest requirement.' },
  },
] as const;

function todayMinus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function todayPlus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function ensureRole(name: string) {
  let role = await prisma.roles.findFirst({ where: { name } });
  if (!role) {
    role = await prisma.roles.create({
      data: {
        name,
        description: `${name} seeded automatically for demo bootstrap`,
      },
    });
  }
  return role;
}

async function ensureFarm() {
  return prisma.farm_profiles.upsert({
    where: { id: FARM_ID },
    update: {
      name: 'Agri-Tech Default Farm',
      country: 'Liberia',
      region: 'Montserrado',
      operational_sectors: ['crop', 'livestock', 'aquaculture'],
      settings: {
        currency: 'USD',
        timezone: 'Africa/Monrovia',
      },
      updated_at: new Date(),
    },
    create: {
      id: FARM_ID,
      name: 'Agri-Tech Default Farm',
      country: 'Liberia',
      region: 'Montserrado',
      operational_sectors: ['crop', 'livestock', 'aquaculture'],
      settings: {
        currency: 'USD',
        timezone: 'Africa/Monrovia',
      },
    },
  });
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
  sector: string;
  monthlySalary: number;
  bankId: string;
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
      sector: config.sector,
      email: config.email,
      status: 'active',
      deleted_at: null,
      monthly_salary: config.monthlySalary,
      bank_id: config.bankId,
      date_hired: todayMinus(120),
      days_worked: 18,
      total_days_worked: 146,
      updated_at: new Date(),
    },
    create: {
      id: config.employeeId,
      user_id: user.id,
      farm_id: FARM_ID,
      full_name: config.fullName,
      employment_type: 'permanent',
      job_title: config.jobTitle,
      department: config.department,
      sector: config.sector,
      email: config.email,
      status: 'active',
      personnel_id: config.username.toUpperCase(),
      monthly_salary: config.monthlySalary,
      bank_id: config.bankId,
      date_hired: todayMinus(120),
      days_worked: 18,
      total_days_worked: 146,
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
      updated_at: new Date(),
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

async function ensureUnitsAndCategories() {
  const units = [
    { name: 'kilogram', symbol: 'kg', category: 'mass', conversion_to_base: 1 },
    { name: 'bag', symbol: 'bag', category: 'count', conversion_to_base: 1 },
    { name: 'piece', symbol: 'pc', category: 'count', conversion_to_base: 1 },
    { name: 'liter', symbol: 'L', category: 'volume', conversion_to_base: 1 },
  ];

  for (const unit of units) {
    await prisma.units_of_measure.upsert({
      where: { name: unit.name },
      update: {
        symbol: unit.symbol,
        category: unit.category,
        conversion_to_base: unit.conversion_to_base,
        is_active: true,
      },
      create: unit,
    });
  }

  const categories = [
    { name: 'Seeds', type: 'farm_input', description: 'Certified planting seeds and seedlings.' },
    { name: 'Fertilizers', type: 'farm_input', description: 'Soil nutrition and crop growth inputs.' },
    { name: 'Pesticides & Chemicals', type: 'farm_input', description: 'Crop protection chemicals and fungicides.' },
    { name: 'Livestock Feed', type: 'feed', description: 'Feed for poultry and livestock operations.' },
    { name: 'Aquaculture Feed', type: 'feed', description: 'Feed for fish ponds and aquaculture.' },
    { name: 'Crop Harvest', type: 'harvested_product', description: 'Harvested crop products ready for sale.' },
    { name: 'General Supplies', type: 'supply', description: 'Operational supplies and field consumables.' },
  ];

  for (const category of categories) {
    await prisma.item_categories.upsert({
      where: { name: category.name },
      update: {
        type: category.type,
        description: category.description,
        deleted_at: null,
      },
      create: category,
    });
  }
}

async function ensureSuppliers() {
  const suppliers = [
    {
      name: 'GreenSeed Agro Supply',
      supplier_type: 'seed',
      contact_person: 'Mara Ionescu',
      phone: '+40 721 100 501',
      email: 'orders@greenseed.example',
      address: 'Bucharest regional seed depot',
      country: 'Romania',
      payment_terms: '30 days',
      commodity: 'Seeds',
    },
    {
      name: 'AgroChem Inputs Ltd',
      supplier_type: 'agro_input',
      contact_person: 'Dan Popescu',
      phone: '+40 721 100 502',
      email: 'supply@agrochem.example',
      address: 'Timisoara agro-inputs hub',
      country: 'Romania',
      payment_terms: '21 days',
      commodity: 'Fertilizer & Chemicals',
    },
    {
      name: 'FeedWorks Cooperative',
      supplier_type: 'feed',
      contact_person: 'Elena Stan',
      phone: '+40 721 100 503',
      email: 'dispatch@feedworks.example',
      address: 'Cluj feed mill',
      country: 'Romania',
      payment_terms: '14 days',
      commodity: 'Feed',
    },
    {
      name: 'FarmParts Service Center',
      supplier_type: 'parts',
      contact_person: 'Radu Marin',
      phone: '+40 721 100 504',
      email: 'parts@farmparts.example',
      address: 'Constanta machinery service yard',
      country: 'Romania',
      payment_terms: '30 days',
      commodity: 'Tools & Spare Parts',
    },
  ];

  for (const supplier of suppliers) {
    const existing = await prisma.suppliers.findFirst({
      where: { farm_id: FARM_ID, name: supplier.name, deleted_at: null },
    });

    if (existing) {
      await prisma.suppliers.update({
        where: { id: existing.id },
        data: {
          ...supplier,
          farm_id: FARM_ID,
          updated_at: new Date(),
        },
      });
      continue;
    }

    await prisma.suppliers.create({
      data: {
        farm_id: FARM_ID,
        ...supplier,
      },
    });
  }
}

async function findSupplierId(name: string) {
  const supplier = await prisma.suppliers.findFirst({
    where: { farm_id: FARM_ID, name, deleted_at: null },
  });
  return supplier?.id ?? null;
}

async function ensureStockAndAlerts() {
  for (const item of STOCK_ITEMS) {
    const category = await prisma.item_categories.findUniqueOrThrow({ where: { name: item.category } });
    const unit = await prisma.units_of_measure.findUniqueOrThrow({ where: { name: item.unitName } });
    const supplierId =
      item.name.includes('Seed') ? await findSupplierId('GreenSeed Agro Supply')
      : item.name.includes('Fertilizer') || item.name.includes('Fungicide') ? await findSupplierId('AgroChem Inputs Ltd')
      : item.name.includes('Feed') ? await findSupplierId('FeedWorks Cooperative')
      : item.name.includes('Crates') ? await findSupplierId('FarmParts Service Center')
      : null;

    const stockItem = await prisma.stock_items.upsert({
      where: { sku: item.sku },
      update: {
        category_id: category.id,
        farm_id: FARM_ID,
        name: item.name,
        description: item.description,
        unit_of_measure_id: unit.id,
        unit_of_measure: unit.symbol,
        current_quantity: item.quantity,
        reserved_quantity: item.reservedQuantity,
        reorder_threshold: item.reorderThreshold,
        unit_cost: item.unitCost,
        storage_location: item.storageLocation,
        updated_at: new Date(),
      },
      create: {
        sku: item.sku,
        category_id: category.id,
        farm_id: FARM_ID,
        name: item.name,
        description: item.description,
        unit_of_measure_id: unit.id,
        unit_of_measure: unit.symbol,
        current_quantity: item.quantity,
        reserved_quantity: item.reservedQuantity,
        reorder_threshold: item.reorderThreshold,
        unit_cost: item.unitCost,
        storage_location: item.storageLocation,
      },
    });

    for (const txn of item.transactions) {
      const note = txn.note;
      const existingTxn = await prisma.stock_transactions.findFirst({
        where: {
          stock_item_id: stockItem.id,
          source_module: 'seed',
          notes: note,
        },
      });
      if (!existingTxn) {
        await prisma.stock_transactions.create({
          data: {
            stock_item_id: stockItem.id,
            performed_by: USERS.superAdmin.userId,
            transaction_type: txn.type,
            quantity: txn.quantity,
            quantity_before: txn.before,
            quantity_after: txn.after,
            source_module: 'seed',
            notes: note,
          },
        });
      }
    }

    if (item.alert) {
      const existingAlert = await prisma.reorder_alerts.findFirst({
        where: {
          stock_item_id: stockItem.id,
          status: item.alert.status,
          notes: item.alert.notes,
        },
      });
      if (!existingAlert) {
        await prisma.reorder_alerts.create({
          data: {
            stock_item_id: stockItem.id,
            status: item.alert.status,
            quantity_at_trigger: item.alert.quantityAtTrigger,
            notes: item.alert.notes,
          },
        });
      }
    }
  }
}

async function ensureCustomersAndSales() {
  const customers: Array<{
    id?: string;
    name: string;
    email: string;
    customer_type: string;
    phone: string;
    address: string;
    country: string;
  }> = [
    {
      id: USERS.customer.customerId,
      name: 'Demo Customer',
      email: 'customer@agritech.local',
      customer_type: 'retailer',
      phone: '+231 770 000 100',
      address: 'Monrovia retail district',
      country: 'Liberia',
    },
    {
      name: 'Harvest Foods Market',
      email: 'buying@harvestfoods.example',
      customer_type: 'business',
      phone: '+231 770 000 101',
      address: 'Paynesville wholesale market',
      country: 'Liberia',
    },
    {
      name: 'Atlantic Export Traders',
      email: 'procurement@atlanticexport.example',
      customer_type: 'exporter',
      phone: '+231 770 000 102',
      address: 'Freeport logistics corridor',
      country: 'Liberia',
    },
  ];

  const customerIds: string[] = [];
  for (const customer of customers) {
    const found = customer.id
      ? await prisma.customers.findUnique({ where: { id: customer.id } })
      : await prisma.customers.findFirst({
          where: { farm_id: FARM_ID, name: customer.name, deleted_at: null },
        });

    let saved;
    if (found) {
      saved = await prisma.customers.update({
        where: { id: found.id },
        data: {
          farm_id: FARM_ID,
          name: customer.name,
          email: customer.email,
          customer_type: customer.customer_type,
          phone: customer.phone,
          address: customer.address,
          country: customer.country,
          is_active: true,
          deleted_at: null,
          updated_at: new Date(),
        },
      });
    } else {
      saved = await prisma.customers.create({
        data: {
          ...(customer.id ? { id: customer.id } : {}),
          farm_id: FARM_ID,
          name: customer.name,
          email: customer.email,
          customer_type: customer.customer_type,
          phone: customer.phone,
          address: customer.address,
          country: customer.country,
          is_active: true,
        },
      });
    }

    customerIds.push(saved.id);
  }

  const rice = await prisma.stock_items.findUniqueOrThrow({ where: { sku: 'RICE-FG-5KG' } });
  const urea = await prisma.stock_items.findUniqueOrThrow({ where: { sku: 'FERT-UREA-4600' } });

  const salesOrders = [
    {
      order_number: 'SO-DEMO-001',
      customer_id: customerIds[1],
      status: 'delivered',
      payment_status: 'paid',
      total_amount: 2520,
      subtotal: 2400,
      tax_amount: 120,
      notes: 'Packaged rice delivery completed for retail chain.',
      item: { stock_item_id: rice.id, quantity: 60, unit_price: 42, line_total: 2520 },
    },
    {
      order_number: 'SO-DEMO-002',
      customer_id: customerIds[2],
      status: 'confirmed',
      payment_status: 'unpaid',
      total_amount: 860,
      subtotal: 860,
      tax_amount: 0,
      notes: 'Fertilizer order in production queue.',
      item: { stock_item_id: urea.id, quantity: 100, unit_price: 8.6, line_total: 860 },
    },
  ];

  for (const order of salesOrders) {
    let existing = await prisma.sales_orders.findFirst({
      where: { farm_id: FARM_ID, order_number: order.order_number },
    });

    if (!existing) {
      existing = await prisma.sales_orders.create({
        data: {
          farm_id: FARM_ID,
          customer_id: order.customer_id,
          created_by: USERS.salesOfficer.userId,
          updated_by: USERS.salesOfficer.userId,
          order_number: order.order_number,
          order_date: todayMinus(10),
          delivery_date: todayPlus(5),
          status: order.status,
          payment_status: order.payment_status,
          subtotal: order.subtotal,
          tax_amount: order.tax_amount,
          total_amount: order.total_amount,
          notes: order.notes,
        },
      });
    } else {
      await prisma.sales_orders.update({
        where: { id: existing.id },
        data: {
          customer_id: order.customer_id,
          updated_by: USERS.salesOfficer.userId,
          status: order.status,
          payment_status: order.payment_status,
          subtotal: order.subtotal,
          tax_amount: order.tax_amount,
          total_amount: order.total_amount,
          notes: order.notes,
        },
      });
    }

    const existingItem = await prisma.sales_order_items.findFirst({
      where: { sales_order_id: existing.id, stock_item_id: order.item.stock_item_id },
    });

    if (!existingItem) {
      await prisma.sales_order_items.create({
        data: {
          sales_order_id: existing.id,
          stock_item_id: order.item.stock_item_id,
          quantity: order.item.quantity,
          unit_price: order.item.unit_price,
          line_total: order.item.line_total,
        },
      });
    }
  }
}

async function ensureMarketing() {
  const prices = [
    { item_name: 'Packaged Rice 5kg', price_per_unit: 42, quantity_unit: 'bag' },
    { item_name: 'Hybrid Maize Seed - FAO 350', price_per_unit: 55, quantity_unit: 'bag' },
    { item_name: 'Floating Fish Feed 32% Protein', price_per_unit: 24, quantity_unit: 'bag' },
    { item_name: 'Broiler Starter Feed', price_per_unit: 19, quantity_unit: 'bag' },
    { item_name: 'Urea Fertilizer 46-0-0', price_per_unit: 8.6, quantity_unit: 'kg' },
    { item_name: 'Reusable Harvest Crates', price_per_unit: 9, quantity_unit: 'pc' },
    { item_name: 'Copper Fungicide 5L', price_per_unit: 39, quantity_unit: 'canister' },
  ];

  for (const price of prices) {
    const existing = await prismaAny.prices.findFirst({
      where: { farm_id: FARM_ID, item_name: price.item_name },
    });
    if (existing) {
      await prismaAny.prices.update({
        where: { id: existing.id },
        data: { ...price, updated_at: new Date() },
      });
    } else {
      await prismaAny.prices.create({
        data: { farm_id: FARM_ID, ...price },
      });
    }
  }

  const cartSeed = [
    { item_name: 'Packaged Rice 5kg', quantity: 12, unit_price: 42, total_amount: 504 },
    { item_name: 'Hybrid Maize Seed - FAO 350', quantity: 8, unit_price: 55, total_amount: 440 },
    { item_name: 'Floating Fish Feed 32% Protein', quantity: 14, unit_price: 24, total_amount: 336 },
    { item_name: 'Reusable Harvest Crates', quantity: 10, unit_price: 9, total_amount: 90 },
  ];

  for (const item of cartSeed) {
    const existing = await prismaAny.cart_items.findFirst({
      where: { farm_id: FARM_ID, item_name: item.item_name },
    });
    if (!existing) {
      await prismaAny.cart_items.create({
        data: { farm_id: FARM_ID, ...item },
      });
    }
  }

  const orders = [
    { order_id: 'ORD-DEMO001', item_name: 'Packaged Rice 5kg', quantity: 60, quantity_unit: 'bag', status: 'completed', amount: 2520, date: todayMinus(20) },
    { order_id: 'ORD-DEMO002', item_name: 'Hybrid Maize Seed - FAO 350', quantity: 25, quantity_unit: 'bag', status: 'delivered', amount: 1375, date: todayMinus(12) },
    { order_id: 'ORD-DEMO003', item_name: 'Floating Fish Feed 32% Protein', quantity: 40, quantity_unit: 'bag', status: 'processing', amount: 960, date: todayMinus(2) },
    { order_id: 'ORD-DEMO004', item_name: 'Broiler Starter Feed', quantity: 32, quantity_unit: 'bag', status: 'pending', amount: 608, date: todayMinus(1) },
    { order_id: 'ORD-DEMO005', item_name: 'Urea Fertilizer 46-0-0', quantity: 180, quantity_unit: 'kg', status: 'en_route', amount: 1548, date: todayMinus(5) },
    { order_id: 'ORD-DEMO006', item_name: 'Reusable Harvest Crates', quantity: 18, quantity_unit: 'pc', status: 'completed', amount: 162, date: todayMinus(9) },
  ];

  for (const order of orders) {
    const existing = await prismaAny.marketing_orders.findFirst({
      where: { farm_id: FARM_ID, order_id: order.order_id },
    });
    if (existing) {
      await prismaAny.marketing_orders.update({
        where: { id: existing.id },
        data: {
          item_name: order.item_name,
          quantity: order.quantity,
          quantity_unit: order.quantity_unit,
          status: order.status,
          amount: order.amount,
          date: order.date,
          updated_at: new Date(),
        },
      });
    } else {
      await prismaAny.marketing_orders.create({
        data: {
          farm_id: FARM_ID,
          payment_id: '11111111-1111-1111-1111-111111111111',
          ...order,
        },
      });
    }
  }
}

async function ensureEmployeesAndHr() {
  async function ensureEmployee(data: any) {
    const existing = await prisma.employees.findFirst({
      where: { farm_id: FARM_ID, full_name: data.full_name, deleted_at: null },
    });
    if (existing) {
      return prisma.employees.update({
        where: { id: existing.id },
        data: { ...data, updated_at: new Date() } as any,
      });
    }
    return prisma.employees.create({ data });
  }

  const dailyWorker = await ensureEmployee({
    farm_id: FARM_ID,
    full_name: 'James Kollie',
    employment_type: 'daily',
    sector: 'crop',
    job_title: 'Field Worker',
    department: 'Production',
    phone: '+231 770 000 201',
    date_hired: todayMinus(45),
    daily_wage: 22,
    bank_id: 'BANK-FLD-001',
    personnel_id: 'PER-JKOLLIE',
    status: 'active',
    days_worked: 12,
    total_days_worked: 28,
  } as any);

  const logistics = await ensureEmployee({
    farm_id: FARM_ID,
    full_name: 'Martha Dennis',
    employment_type: 'contract',
    sector: 'logistics',
    job_title: 'Storekeeper',
    department: 'Inventory',
    phone: '+231 770 000 202',
    date_hired: todayMinus(70),
    monthly_salary: 1450,
    bank_id: 'BANK-STO-001',
    personnel_id: 'PER-MDENNIS',
    status: 'active',
    days_worked: 20,
    total_days_worked: 63,
  } as any);

  const fieldSupervisor = await ensureEmployee({
    farm_id: FARM_ID,
    full_name: 'Abigail Swen',
    employment_type: 'supervisor',
    sector: 'crop',
    job_title: 'Field Supervisor',
    department: 'Operations',
    phone: '+231 770 000 203',
    date_hired: todayMinus(220),
    monthly_salary: 1850,
    bank_id: 'BANK-SUP-001',
    personnel_id: 'PER-ASWEN',
    status: 'active',
    days_worked: 21,
    total_days_worked: 102,
  } as any);

  const productionSupervisor = await ensureEmployee({
    farm_id: FARM_ID,
    full_name: 'Moses Kpadeh',
    employment_type: 'supervisor',
    sector: 'production',
    job_title: 'Production Supervisor',
    department: 'Processing',
    phone: '+231 770 000 204',
    date_hired: todayMinus(195),
    monthly_salary: 1980,
    bank_id: 'BANK-SUP-002',
    personnel_id: 'PER-MKPADEH',
    status: 'active',
    days_worked: 21,
    total_days_worked: 97,
  } as any);

  const cropWorker = await ensureEmployee({
    farm_id: FARM_ID,
    full_name: 'Ruth Zayzay',
    employment_type: 'permanent',
    sector: 'crop',
    job_title: 'Crop Technician',
    department: 'Field Operations',
    phone: '+231 770 000 205',
    date_hired: todayMinus(160),
    monthly_salary: 980,
    bank_id: 'BANK-CRP-001',
    personnel_id: 'PER-RZAYZAY',
    status: 'active',
    days_worked: 20,
    total_days_worked: 80,
  } as any);

  const livestockAttendant = await ensureEmployee({
    farm_id: FARM_ID,
    full_name: 'Sarah Toah',
    employment_type: 'permanent',
    sector: 'livestock',
    job_title: 'Livestock Attendant',
    department: 'Animal Care',
    phone: '+231 770 000 206',
    date_hired: todayMinus(190),
    monthly_salary: 1040,
    bank_id: 'BANK-LIV-001',
    personnel_id: 'PER-STOAH',
    status: 'active',
    days_worked: 19,
    total_days_worked: 88,
  } as any);

  const dailyWorkerTwo = await ensureEmployee({
    farm_id: FARM_ID,
    full_name: 'Peter Wolo',
    employment_type: 'daily',
    sector: 'production',
    job_title: 'Daily Processing Hand',
    department: 'Processing',
    phone: '+231 770 000 207',
    date_hired: todayMinus(28),
    daily_wage: 24,
    bank_id: 'BANK-DLY-002',
    personnel_id: 'PER-PWOLO',
    status: 'active',
    days_worked: 10,
    total_days_worked: 17,
  } as any);

  const contractorLiaison = await ensureEmployee({
    farm_id: FARM_ID,
    full_name: 'Daniel Kormah',
    employment_type: 'contract',
    sector: 'production',
    job_title: 'Cold Room Technician',
    department: 'Maintenance',
    phone: '+231 770 000 208',
    date_hired: todayMinus(84),
    monthly_salary: 1200,
    bank_id: 'BANK-CON-009',
    personnel_id: 'PER-DKORMAH',
    status: 'active',
    days_worked: 18,
    total_days_worked: 56,
  } as any);

  const suspendedWorker = await ensureEmployee({
    farm_id: FARM_ID,
    full_name: 'Bendu Konneh',
    employment_type: 'daily',
    sector: 'crop',
    job_title: 'Field Worker',
    department: 'Production',
    phone: '+231 770 000 209',
    date_hired: todayMinus(23),
    daily_wage: 20,
    bank_id: 'BANK-DLY-003',
    personnel_id: 'PER-BKONNEH',
    status: 'suspended',
    suspension_reason: 'No-show pending review',
    suspension_expires_at: todayPlus(3),
    days_worked: 6,
    total_days_worked: 9,
  } as any);

  const attendanceSeeds = [
    { employee_id: USERS.superAdmin.employeeId, date: todayMinus(0), status: 'present', clockIn: '08:10', clockOut: '17:00' },
    { employee_id: USERS.farmManager.employeeId, date: todayMinus(0), status: 'present', clockIn: '07:20', clockOut: '18:05' },
    { employee_id: fieldSupervisor.id, date: todayMinus(0), status: 'present', clockIn: '07:15', clockOut: '17:40' },
    { employee_id: productionSupervisor.id, date: todayMinus(0), status: 'present', clockIn: '07:35', clockOut: '17:15' },
    { employee_id: cropWorker.id, date: todayMinus(0), status: 'present', clockIn: '08:25', clockOut: '16:50' },
    { employee_id: dailyWorker.id, date: todayMinus(0), status: 'present', clockIn: '07:50', clockOut: '16:30' },
    { employee_id: dailyWorkerTwo.id, date: todayMinus(0), status: 'present', clockIn: '08:05', clockOut: '18:10' },
    { employee_id: logistics.id, date: todayMinus(0), status: 'present', clockIn: '07:55', clockOut: '17:00' },
    { employee_id: contractorLiaison.id, date: todayMinus(0), status: 'present', clockIn: '08:00', clockOut: '17:25' },
    { employee_id: USERS.salesOfficer.employeeId, date: todayMinus(0), status: 'leave' },
    { employee_id: livestockAttendant.id, date: todayMinus(0), status: 'absent' },
    { employee_id: fieldSupervisor.id, date: todayMinus(1), status: 'present', clockIn: '07:10', clockOut: '17:15' },
    { employee_id: cropWorker.id, date: todayMinus(1), status: 'present', clockIn: '07:58', clockOut: '16:55' },
    { employee_id: dailyWorker.id, date: todayMinus(1), status: 'present', clockIn: '08:12', clockOut: '16:18' },
    { employee_id: dailyWorkerTwo.id, date: todayMinus(1), status: 'half_day', clockIn: '08:00', clockOut: '12:10' },
    { employee_id: livestockAttendant.id, date: todayMinus(1), status: 'present', clockIn: '07:42', clockOut: '16:20' },
    { employee_id: logistics.id, date: todayMinus(1), status: 'present', clockIn: '07:48', clockOut: '16:42' },
    { employee_id: fieldSupervisor.id, date: todayMinus(2), status: 'present', clockIn: '07:12', clockOut: '17:12' },
    { employee_id: cropWorker.id, date: todayMinus(2), status: 'present', clockIn: '08:20', clockOut: '17:05' },
    { employee_id: dailyWorker.id, date: todayMinus(2), status: 'present', clockIn: '07:45', clockOut: '16:25' },
    { employee_id: livestockAttendant.id, date: todayMinus(2), status: 'present', clockIn: '07:50', clockOut: '16:10' },
    { employee_id: logistics.id, date: todayMinus(2), status: 'present', clockIn: '07:55', clockOut: '17:05' },
    { employee_id: fieldSupervisor.id, date: todayMinus(3), status: 'present', clockIn: '07:18', clockOut: '17:30' },
    { employee_id: cropWorker.id, date: todayMinus(3), status: 'present', clockIn: '07:58', clockOut: '16:40' },
    { employee_id: dailyWorker.id, date: todayMinus(3), status: 'absent' },
    { employee_id: livestockAttendant.id, date: todayMinus(3), status: 'present', clockIn: '07:44', clockOut: '16:00' },
    { employee_id: logistics.id, date: todayMinus(3), status: 'present', clockIn: '07:50', clockOut: '16:33' },
    { employee_id: fieldSupervisor.id, date: todayMinus(4), status: 'present', clockIn: '07:20', clockOut: '17:10' },
    { employee_id: cropWorker.id, date: todayMinus(4), status: 'present', clockIn: '08:08', clockOut: '16:58' },
    { employee_id: dailyWorker.id, date: todayMinus(4), status: 'present', clockIn: '07:49', clockOut: '16:05' },
    { employee_id: livestockAttendant.id, date: todayMinus(4), status: 'leave' },
    { employee_id: logistics.id, date: todayMinus(4), status: 'present', clockIn: '07:42', clockOut: '16:55' },
    { employee_id: fieldSupervisor.id, date: todayMinus(5), status: 'present', clockIn: '07:14', clockOut: '17:20' },
    { employee_id: cropWorker.id, date: todayMinus(5), status: 'present', clockIn: '07:54', clockOut: '16:44' },
    { employee_id: dailyWorker.id, date: todayMinus(5), status: 'present', clockIn: '08:03', clockOut: '16:14' },
    { employee_id: livestockAttendant.id, date: todayMinus(5), status: 'present', clockIn: '07:39', clockOut: '16:11' },
    { employee_id: logistics.id, date: todayMinus(5), status: 'present', clockIn: '07:51', clockOut: '16:40' },
    { employee_id: fieldSupervisor.id, date: todayMinus(6), status: 'present', clockIn: '07:25', clockOut: '17:05' },
    { employee_id: cropWorker.id, date: todayMinus(6), status: 'half_day', clockIn: '08:16', clockOut: '12:40' },
    { employee_id: dailyWorker.id, date: todayMinus(6), status: 'present', clockIn: '07:56', clockOut: '16:08' },
    { employee_id: livestockAttendant.id, date: todayMinus(6), status: 'present', clockIn: '07:47', clockOut: '16:14' },
    { employee_id: logistics.id, date: todayMinus(6), status: 'present', clockIn: '07:43', clockOut: '16:36' },
  ];

  for (const seed of attendanceSeeds) {
    const existingLog = await prisma.attendance_logs.findFirst({
      where: { employee_id: seed.employee_id, log_date: seed.date },
    });
    const clockIn = seed.clockIn ? new Date(`1970-01-01T${seed.clockIn}:00`) : null;
    const clockOut = seed.clockOut ? new Date(`1970-01-01T${seed.clockOut}:00`) : null;
    const hours = clockIn && clockOut ? (clockOut.getTime() - clockIn.getTime()) / 3600000 : null;
    if (existingLog) {
      await prisma.attendance_logs.update({
        where: { id: existingLog.id },
        data: {
          status: seed.status,
          clock_in: clockIn,
          clock_out: clockOut,
          hours_worked: hours,
        },
      });
    } else {
      await prisma.attendance_logs.create({
        data: {
          employee_id: seed.employee_id,
          recorded_by: USERS.farmManager.userId,
          log_date: seed.date,
          status: seed.status,
          clock_in: clockIn,
          clock_out: clockOut,
          hours_worked: hours,
        },
      });
    }
  }

  const taskSeed = [
    {
      employee_id: dailyWorker.id,
      task_title: 'Apply fertilizer to rice plot',
      description: 'Side-dress the lowland rice plot before 14:00 and record bag balance.',
      sector: 'crop',
      due_date: todayPlus(0),
      priority: 'high',
      status: 'assigned',
    },
    {
      employee_id: livestockAttendant.id,
      task_title: 'Feed broiler starter group',
      description: 'Issue starter feed to broiler pens A and B and report intake variance.',
      sector: 'livestock',
      due_date: todayPlus(0),
      priority: 'urgent',
      status: 'in_progress',
    },
    {
      employee_id: logistics.id,
      task_title: 'Load packaged rice for delivery',
      description: 'Prepare 120 bags for Monrovia route and confirm dispatch count.',
      sector: 'logistics',
      due_date: todayPlus(1),
      priority: 'high',
      status: 'assigned',
    },
    {
      employee_id: contractorLiaison.id,
      task_title: 'Clean cold room storage area',
      description: 'Sanitize holding area and confirm compressor readings after cleanup.',
      sector: 'production',
      due_date: todayPlus(1),
      priority: 'normal',
      status: 'assigned',
    },
    {
      employee_id: productionSupervisor.id,
      task_title: 'Inspect fish pond water level',
      description: 'Verify water loss and note any inlet blockage before feeding window.',
      sector: 'aquaculture',
      due_date: todayPlus(0),
      priority: 'normal',
      status: 'pending',
    },
    {
      employee_id: cropWorker.id,
      task_title: 'Service irrigation line',
      description: 'Replace cracked elbow at north line and test pressure.',
      sector: 'crop',
      due_date: todayMinus(1),
      priority: 'high',
      status: 'assigned',
    },
    {
      employee_id: dailyWorkerTwo.id,
      task_title: 'Reconcile seed store receipts',
      description: 'Confirm physical stock against issue log.',
      sector: 'production',
      due_date: todayMinus(2),
      priority: 'normal',
      status: 'completed',
      completed_at: todayMinus(1),
    },
  ];

  for (const task of taskSeed) {
    const existingTask = await prisma.task_assignments.findFirst({
      where: { farm_id: FARM_ID, task_title: task.task_title },
    });
    if (existingTask) {
      await prisma.task_assignments.update({
        where: { id: existingTask.id },
        data: {
          employee_id: task.employee_id,
          description: task.description,
          sector: task.sector,
          due_date: task.due_date,
          priority: task.priority,
          status: task.status,
          completed_at: task.completed_at ?? null,
          updated_at: new Date(),
        },
      });
    } else {
      await prisma.task_assignments.create({
        data: {
          farm_id: FARM_ID,
          assigned_by: USERS.farmManager.userId,
          employee_id: task.employee_id,
          task_title: task.task_title,
          description: task.description,
          sector: task.sector,
          due_date: task.due_date,
          priority: task.priority,
          status: task.status,
          completed_at: task.completed_at ?? null,
        },
      });
    }
  }

  const supervisorLinks = [
    { supervisor_id: fieldSupervisor.id, employee_id: dailyWorker.id, notes: 'Crop block A and B' },
    { supervisor_id: fieldSupervisor.id, employee_id: cropWorker.id, notes: 'Field fertiliser and irrigation line work' },
    { supervisor_id: fieldSupervisor.id, employee_id: suspendedWorker.id, notes: 'Temporary field labor pool' },
    { supervisor_id: productionSupervisor.id, employee_id: logistics.id, notes: 'Store and dispatch operations' },
    { supervisor_id: productionSupervisor.id, employee_id: dailyWorkerTwo.id, notes: 'Processing support shift' },
    { supervisor_id: productionSupervisor.id, employee_id: contractorLiaison.id, notes: 'Cold room and packhouse maintenance' },
    { supervisor_id: productionSupervisor.id, employee_id: livestockAttendant.id, notes: 'Livestock feed issue coordination' },
  ];

  try {
    for (const link of supervisorLinks) {
      const existingLink = await prismaAny.supervisor_assignments.findFirst({
        where: {
          farm_id: FARM_ID,
          supervisor_id: link.supervisor_id,
          employee_id: link.employee_id,
          released_at: null,
        },
      });
      if (existingLink) {
        await prismaAny.supervisor_assignments.update({
          where: { id: existingLink.id },
          data: { notes: link.notes, assigned_by: USERS.farmManager.userId },
        });
      } else {
        await prismaAny.supervisor_assignments.create({
          data: {
            farm_id: FARM_ID,
            supervisor_id: link.supervisor_id,
            employee_id: link.employee_id,
            assigned_by: USERS.farmManager.userId,
            notes: link.notes,
          },
        });
      }
    }
  } catch {
    // Optional table in some local snapshots.
  }

  const leaveSeeds = [
    {
      employee_id: livestockAttendant.id,
      leave_type: 'sick',
      start_date: todayMinus(0),
      end_date: todayPlus(1),
      approval_status: 'approved',
      notes: 'Veterinary clinic visit and rest day.',
    },
    {
      employee_id: USERS.salesOfficer.employeeId,
      leave_type: 'personal',
      start_date: todayMinus(0),
      end_date: todayMinus(0),
      approval_status: 'approved',
      notes: 'Customer engagement trip outside district.',
    },
    {
      employee_id: dailyWorkerTwo.id,
      leave_type: 'unpaid',
      start_date: todayMinus(8),
      end_date: todayMinus(7),
      approval_status: 'approved',
      notes: 'Requested unpaid absence for family obligation.',
    },
  ];

  try {
    for (const leave of leaveSeeds) {
      const existingLeave = await prismaAny.leave_requests.findFirst({
        where: {
          farm_id: FARM_ID,
          employee_id: leave.employee_id,
          leave_type: leave.leave_type,
          start_date: leave.start_date,
          end_date: leave.end_date,
        },
      });
      if (existingLeave) {
        await prismaAny.leave_requests.update({
          where: { id: existingLeave.id },
          data: {
            approval_status: leave.approval_status,
            notes: leave.notes,
            updated_at: new Date(),
          },
        });
      } else {
        await prismaAny.leave_requests.create({
          data: {
            farm_id: FARM_ID,
            employee_id: leave.employee_id,
            leave_type: leave.leave_type,
            start_date: leave.start_date,
            end_date: leave.end_date,
            approval_status: leave.approval_status,
            notes: leave.notes,
            created_by: USERS.farmManager.userId,
          },
        });
      }
    }
  } catch {
    // Optional table in some local snapshots.
  }

  const contractor = await prismaAny.contractors.findFirst({
    where: { farm_id: FARM_ID, contractor_name: 'Samuel Earthworks Ltd' },
  }) ?? await prismaAny.contractors.create({
    data: {
      farm_id: FARM_ID,
      contractor_id: 'CON-DEMO001',
      contractor_name: 'Samuel Earthworks Ltd',
      contract_type: 'Land preparation',
      sector: 'crops',
      amount_charged: 1800,
      description: 'Disc ploughing and land shaping for upland rice zone.',
      bank_id: 'BANK-CON-001',
      start_date: todayMinus(18),
      end_date: todayMinus(5),
      status: 'finished',
      payment_sent: true,
    },
  });

  const payment = await prismaAny.contractor_payments.findFirst({
    where: { farm_id: FARM_ID, contractor_name: 'Samuel Earthworks Ltd' },
  });
  if (!payment) {
    await prismaAny.contractor_payments.create({
      data: {
        farm_id: FARM_ID,
        contractor_id: contractor.id,
        contractor_name: contractor.contractor_name,
        contract_type: contractor.contract_type,
        sector: contractor.sector,
        amount: contractor.amount_charged,
        bank_id: contractor.bank_id,
        start_date: contractor.start_date,
        end_date: contractor.end_date,
      },
    });
  }

  const wages = [
    {
      employee_id: USERS.farmManager.employeeId,
      personnel_id: 'MANAGER',
      full_name: 'Farm Manager',
      employment_type: 'permanent',
      sector: 'general',
      pay_period: 'Current Month',
      days_worked: 20,
      amount: 3200,
      bank_id: 'BANK-MGR-001',
      payment_status: 'pending',
    },
    {
      employee_id: dailyWorker.id,
      personnel_id: 'PER-JKOLLIE',
      full_name: 'James Kollie',
      employment_type: 'daily',
      sector: 'crop',
      pay_period: 'Current Month',
      days_worked: 12,
      amount: 264,
      bank_id: 'BANK-FLD-001',
      payment_status: 'paid',
      paid_at: todayMinus(3),
      immutable: true,
    },
    {
      employee_id: fieldSupervisor.id,
      personnel_id: 'PER-ASWEN',
      full_name: 'Abigail Swen',
      employment_type: 'supervisor',
      sector: 'crop',
      pay_period: 'Current Month',
      days_worked: 21,
      amount: 1925,
      bank_id: 'BANK-SUP-001',
      payment_status: 'pending',
    },
    {
      employee_id: logistics.id,
      personnel_id: 'PER-MDENNIS',
      full_name: 'Martha Dennis',
      employment_type: 'contract',
      sector: 'logistics',
      pay_period: 'Current Month',
      days_worked: 20,
      amount: 1450,
      bank_id: 'BANK-STO-001',
      payment_status: 'approved',
    },
  ];

  for (const wage of wages) {
    const existingWage = await prismaAny.personnel_wages.findFirst({
      where: { farm_id: FARM_ID, employee_id: wage.employee_id, pay_period: wage.pay_period },
    });
    if (existingWage) {
      await prismaAny.personnel_wages.update({
        where: { id: existingWage.id },
        data: {
          ...wage,
          updated_at: new Date(),
        },
      });
    } else {
      await prismaAny.personnel_wages.create({
        data: {
          farm_id: FARM_ID,
          ...wage,
        },
      });
    }
  }
}

async function ensureAssetsAndLand() {
  const operators = await prisma.employees.findMany({
    where: {
      farm_id: FARM_ID,
      deleted_at: null,
      full_name: {
        in: [
          'Farm Manager',
          'Abigail Swen',
          'Moses Kpadeh',
          'Ruth Zayzay',
          'Daniel Kormah',
          'Martha Dennis',
          'James Kollie',
          'Peter Wolo',
        ],
      },
    },
    select: { id: true, full_name: true },
  });
  const employeeByName = new Map(operators.map((employee) => [employee.full_name, employee.id]));

  async function ensureAsset(data: any) {
    const existing = await prisma.assets.findFirst({
      where: { farm_id: FARM_ID, name: data.name, deleted_at: null },
    });
    if (existing) {
      return prisma.assets.update({
        where: { id: existing.id },
        data: { ...data, updated_at: new Date() },
      });
    }
    return prisma.assets.create({ data });
  }

  const assets = [
    {
      asset_code: 'AST-TRC-001',
      name: 'John Deere 5075E Tractor',
      asset_type: 'equipment',
      category: 'tractor',
      manufacturer: 'John Deere',
      model: '5075E',
      serial_number: 'JD5075E-2026-001',
      purchase_date: todayMinus(320),
      purchase_cost: 28500,
      current_value: 25200,
      location: 'North Field A',
      assigned_to: employeeByName.get('Abigail Swen') ?? USERS.farmManager.employeeId,
      condition: 'good',
      status: 'active',
      last_service_date: todayMinus(21),
      next_service_date: todayPlus(9),
      warranty_expiry_date: todayPlus(400),
      notes: 'Primary field tractor for ploughing, harrowing, and trailer haulage.',
    },
    {
      asset_code: 'AST-VEH-002',
      name: 'Massey Ferguson Field Truck',
      asset_type: 'vehicle',
      category: 'vehicle',
      manufacturer: 'Massey Ferguson',
      model: 'MF Utility 4x4',
      serial_number: 'MF-TRK-2104',
      purchase_date: todayMinus(510),
      purchase_cost: 19400,
      current_value: 16100,
      location: 'Input Warehouse Dock',
      assigned_to: employeeByName.get('Martha Dennis') ?? null,
      condition: 'good',
      status: 'operational',
      last_service_date: todayMinus(35),
      next_service_date: todayPlus(6),
      warranty_expiry_date: todayPlus(220),
      notes: 'Used for seed, feed, and spare part transport between warehouse and plots.',
    },
    {
      asset_code: 'AST-TIL-003',
      name: 'Kubota Power Tiller',
      asset_type: 'equipment',
      category: 'tractor',
      manufacturer: 'Kubota',
      model: 'RT140DI',
      serial_number: 'KB-RT140-887',
      purchase_date: todayMinus(240),
      purchase_cost: 7300,
      current_value: 6400,
      location: 'Vegetable Nursery Zone',
      assigned_to: employeeByName.get('James Kollie') ?? null,
      condition: 'fair',
      status: 'under_maintenance',
      last_service_date: todayMinus(68),
      next_service_date: todayMinus(3),
      warranty_expiry_date: todayPlus(180),
      notes: 'Two-wheel tiller used in vegetable blocks and nursery beds.',
    },
    {
      asset_code: 'AST-GEN-004',
      name: 'Cold Room Generator',
      asset_type: 'equipment',
      category: 'generator',
      manufacturer: 'Perkins',
      model: 'P22D',
      serial_number: 'GEN-COLD-22',
      purchase_date: todayMinus(620),
      purchase_cost: 12600,
      current_value: 9800,
      location: 'Cold Room Plant House',
      assigned_to: employeeByName.get('Daniel Kormah') ?? null,
      condition: 'good',
      status: 'operational',
      last_service_date: todayMinus(18),
      next_service_date: todayPlus(14),
      warranty_expiry_date: todayPlus(120),
      notes: 'Backup power for cold room and vaccine refrigeration loads.',
    },
    {
      asset_code: 'AST-IRR-005',
      name: 'Irrigation Pump',
      asset_type: 'equipment',
      category: 'irrigation',
      manufacturer: 'AquaFlow',
      model: '300HP Transfer',
      serial_number: 'IRR-300-51',
      purchase_date: todayMinus(410),
      purchase_cost: 8800,
      current_value: 7200,
      location: 'South Irrigation Block',
      assigned_to: employeeByName.get('Ruth Zayzay') ?? null,
      condition: 'critical',
      status: 'decommissioned',
      last_service_date: todayMinus(82),
      next_service_date: todayMinus(10),
      warranty_expiry_date: todayMinus(45),
      notes: 'Primary transfer pump currently shut down after seal and bearing failure.',
    },
    {
      asset_code: 'AST-MIX-006',
      name: 'Feed Mixer',
      asset_type: 'equipment',
      category: 'tool',
      manufacturer: 'AgriBlend',
      model: 'FM-150',
      serial_number: 'FM-150-114',
      purchase_date: todayMinus(300),
      purchase_cost: 5300,
      current_value: 4400,
      location: 'Livestock Feed Mill',
      assigned_to: employeeByName.get('Peter Wolo') ?? null,
      condition: 'good',
      status: 'operational',
      last_service_date: todayMinus(15),
      next_service_date: todayPlus(20),
      warranty_expiry_date: todayPlus(260),
      notes: 'Batch mixer for poultry and pig feed formulation.',
    },
    {
      asset_code: 'AST-STO-007',
      name: 'Cold Storage Unit',
      asset_type: 'infrastructure',
      category: 'storage',
      manufacturer: 'PolarFresh',
      model: 'CSU-12T',
      serial_number: 'COLD-STORE-12',
      purchase_date: todayMinus(720),
      purchase_cost: 36400,
      current_value: 29100,
      location: 'Postharvest Compound',
      assigned_to: employeeByName.get('Daniel Kormah') ?? null,
      condition: 'fair',
      status: 'operational',
      last_service_date: todayMinus(41),
      next_service_date: todayPlus(4),
      warranty_expiry_date: todayPlus(75),
      notes: 'Main produce cold room with monitored compressor runtime.',
    },
    {
      asset_code: 'AST-TOL-008',
      name: 'Weighing Scale',
      asset_type: 'tool',
      category: 'tool',
      manufacturer: 'Cardinal',
      model: 'CK-500',
      serial_number: 'SCL-500-202',
      purchase_date: todayMinus(170),
      purchase_cost: 950,
      current_value: 770,
      location: 'Sales Dispatch Bay',
      assigned_to: employeeByName.get('Martha Dennis') ?? null,
      condition: 'excellent',
      status: 'operational',
      last_service_date: todayMinus(10),
      next_service_date: todayPlus(30),
      warranty_expiry_date: todayPlus(330),
      notes: 'Used for outbound produce weighing and bag verification.',
    },
    {
      asset_code: 'AST-SPR-009',
      name: 'Sprayer',
      asset_type: 'equipment',
      category: 'tool',
      manufacturer: 'FieldMaster',
      model: 'BoomJet 600',
      serial_number: 'SPR-600-09',
      purchase_date: todayMinus(365),
      purchase_cost: 4700,
      current_value: 3920,
      location: 'Chemical Store',
      assigned_to: null,
      condition: 'fair',
      status: 'sold',
      last_service_date: todayMinus(115),
      next_service_date: todayMinus(50),
      warranty_expiry_date: todayMinus(20),
      notes: 'Disposed after replacing with a higher-capacity boom sprayer.',
    },
  ];

  const createdAssets = new Map<string, any>();
  for (const asset of assets) {
    const saved = await ensureAsset({
      farm_id: FARM_ID,
      ...asset,
    });
    createdAssets.set(saved.name, saved);
  }

  const assetSchedules = [
    {
      assetName: 'John Deere 5075E Tractor',
      service_type: '250-hour engine service',
      due_date: todayPlus(9),
      priority: 'high',
      technician_name: 'Daniel Kormah',
      estimated_cost: 480,
      status: 'scheduled',
      notes: 'Engine oil, hydraulic filter, and front axle inspection.',
    },
    {
      assetName: 'Massey Ferguson Field Truck',
      service_type: 'Brake and suspension inspection',
      due_date: todayPlus(6),
      priority: 'normal',
      technician_name: 'Workshop contractor',
      estimated_cost: 260,
      status: 'scheduled',
      notes: 'Prepare for field-to-market haulage cycle.',
    },
    {
      assetName: 'Kubota Power Tiller',
      service_type: 'Clutch overhaul',
      due_date: todayMinus(3),
      priority: 'urgent',
      technician_name: 'Daniel Kormah',
      estimated_cost: 620,
      status: 'scheduled',
      notes: 'Overdue. Unit should remain in workshop until torque test passes.',
    },
    {
      assetName: 'Cold Room Generator',
      service_type: 'Generator load-bank test',
      due_date: todayPlus(14),
      priority: 'normal',
      technician_name: 'PowerSystems Ltd',
      estimated_cost: 390,
      status: 'scheduled',
      notes: 'Quarterly backup power reliability check.',
    },
    {
      assetName: 'Irrigation Pump',
      service_type: 'Pump seal replacement',
      due_date: todayMinus(10),
      priority: 'urgent',
      technician_name: 'AquaFlow Service Crew',
      estimated_cost: 980,
      status: 'overdue',
      notes: 'Critical irrigation pump unavailable until rebuild is finished.',
    },
    {
      assetName: 'Cold Storage Unit',
      service_type: 'Compressor preventive service',
      due_date: todayPlus(4),
      priority: 'high',
      technician_name: 'Daniel Kormah',
      estimated_cost: 520,
      status: 'scheduled',
      notes: 'Check refrigerant pressure and evaporator fan vibration.',
    },
  ];

  for (const schedule of assetSchedules) {
    const asset = createdAssets.get(schedule.assetName);
    if (!asset) continue;
    const existing = await prismaAny.asset_maintenance_schedules.findFirst({
      where: {
        farm_id: FARM_ID,
        asset_id: asset.id,
        service_type: schedule.service_type,
        due_date: schedule.due_date,
      },
    });
    if (existing) {
      await prismaAny.asset_maintenance_schedules.update({
        where: { id: existing.id },
        data: { ...schedule, asset_id: asset.id, updated_at: new Date() },
      });
    } else {
      await prismaAny.asset_maintenance_schedules.create({
        data: {
          farm_id: FARM_ID,
          asset_id: asset.id,
          created_by: USERS.farmManager.userId,
          ...schedule,
        },
      });
    }
  }

  const workOrders = [
    {
      work_order_number: 'MWO-DEMO-001',
      assetName: 'Kubota Power Tiller',
      title: 'Clutch slipping during bed preparation',
      description: 'Operator reported poor engagement and vibration under load.',
      planned_start_date: todayMinus(2),
      planned_end_date: todayPlus(1),
      priority: 'urgent',
      requested_by_employee_id: employeeByName.get('James Kollie') ?? null,
      assigned_technician: 'Daniel Kormah',
      issue_type: 'Drivetrain repair',
      estimated_cost: 640,
      actual_cost: null,
      status: 'in progress',
      actual_outputs: { downtimeHours: 9, partsUsed: ['Clutch plate kit'] },
    },
    {
      work_order_number: 'MWO-DEMO-002',
      assetName: 'Irrigation Pump',
      title: 'Mechanical seal leak and bearing noise',
      description: 'Pump shut down after pressure loss in the south irrigation block.',
      planned_start_date: todayMinus(5),
      planned_end_date: todayMinus(1),
      priority: 'urgent',
      requested_by_employee_id: employeeByName.get('Ruth Zayzay') ?? null,
      assigned_technician: 'AquaFlow Service Crew',
      issue_type: 'Seal replacement',
      estimated_cost: 980,
      actual_cost: null,
      status: 'waiting parts',
      actual_outputs: { downtimeHours: 18, partsUsed: ['Mechanical seal', 'Bearing set'] },
    },
    {
      work_order_number: 'MWO-DEMO-003',
      assetName: 'Cold Storage Unit',
      title: 'Evaporator fan preventive service',
      description: 'PM order raised before peak harvest storage week.',
      planned_start_date: todayPlus(1),
      planned_end_date: todayPlus(4),
      priority: 'high',
      requested_by_employee_id: employeeByName.get('Daniel Kormah') ?? null,
      assigned_technician: 'Daniel Kormah',
      issue_type: 'Preventive maintenance',
      estimated_cost: 540,
      actual_cost: null,
      status: 'assigned',
      actual_outputs: { downtimeHours: 0, partsUsed: [] },
    },
    {
      work_order_number: 'MWO-DEMO-004',
      assetName: 'Cold Room Generator',
      title: 'Starter relay replacement',
      description: 'Generator hard-start issue resolved before cold chain inspection.',
      planned_start_date: todayMinus(16),
      planned_end_date: todayMinus(14),
      priority: 'normal',
      requested_by_employee_id: employeeByName.get('Daniel Kormah') ?? null,
      assigned_technician: 'PowerSystems Ltd',
      issue_type: 'Electrical repair',
      estimated_cost: 310,
      actual_cost: 295,
      status: 'completed',
      completed_at: todayMinus(14),
      actual_end_time: todayMinus(14),
      actual_outputs: { downtimeHours: 3, partsUsed: ['Starter relay'] },
    },
  ];

  for (const order of workOrders) {
    const asset = createdAssets.get(order.assetName);
    if (!asset) continue;
    const existing = await prisma.work_orders.findFirst({
      where: { farm_id: FARM_ID, work_order_number: order.work_order_number },
    });
    const payload = {
      farm_id: FARM_ID,
      asset_id: asset.id,
      title: order.title,
      description: order.description,
      planned_start_date: order.planned_start_date,
      planned_end_date: order.planned_end_date,
      priority: order.priority,
      requested_by_employee_id: order.requested_by_employee_id,
      assigned_technician: order.assigned_technician,
      issue_type: order.issue_type,
      estimated_cost: order.estimated_cost,
      actual_cost: order.actual_cost,
      completed_at: order.completed_at ?? null,
      actual_end_time: order.actual_end_time ?? null,
      status: order.status,
      planned_inputs: { module: 'machinery' },
      actual_outputs: order.actual_outputs,
      created_by: USERS.farmManager.userId,
    } as any;
    if (existing) {
      await prisma.work_orders.update({
        where: { id: existing.id },
        data: { ...payload, updated_at: new Date() },
      });
    } else {
      await prisma.work_orders.create({
        data: {
          work_order_number: order.work_order_number,
          ...payload,
        } as any,
      });
    }
  }

  const maintenanceLogs = [
    {
      assetName: 'John Deere 5075E Tractor',
      description: 'Quarterly service and filter replacement',
      maintenance_type: 'scheduled',
      cost: 420,
      service_provider: 'FarmParts Service Center',
      maintenance_date: todayMinus(12),
      next_service_date: todayPlus(21),
      downtime_hours: 4,
      outcome: 'Returned to service',
    },
    {
      assetName: 'Feed Mixer',
      description: 'Paddle alignment and gearbox oil change',
      maintenance_type: 'inspection',
      cost: 180,
      service_provider: 'Internal workshop',
      maintenance_date: todayMinus(15),
      next_service_date: todayPlus(20),
      downtime_hours: 2,
      outcome: 'Mixer cleared for feed batching.',
    },
  ];

  for (const log of maintenanceLogs) {
    const asset = createdAssets.get(log.assetName);
    if (!asset) continue;
    const existing = await prisma.asset_maintenance_logs.findFirst({
      where: { asset_id: asset.id, description: log.description, maintenance_date: log.maintenance_date },
    });
    if (!existing) {
      await prisma.asset_maintenance_logs.create({
        data: {
          asset_id: asset.id,
          performed_by: USERS.superAdmin.userId,
          ...log,
        },
      });
    }
  }

  const repairSeeds = [
    {
      assetName: 'Cold Room Generator',
      issue: 'Starter relay failure',
      repair_action: 'Replaced starter relay and tested standby startup cycle.',
      parts_used: ['Starter relay', 'Terminal lug set'],
      downtime_hours: 3,
      cost: 295,
      completed_by: 'PowerSystems Ltd',
      completed_date: todayMinus(14),
      notes: 'Generator returned to automatic standby mode.',
      work_order_number: 'MWO-DEMO-004',
    },
    {
      assetName: 'Massey Ferguson Field Truck',
      issue: 'Rear tire puncture and rim check',
      repair_action: 'Patched tube, reseated rim, and checked lug torque.',
      parts_used: ['Tube patch kit'],
      downtime_hours: 1.5,
      cost: 70,
      completed_by: 'Workshop attendant',
      completed_date: todayMinus(7),
      notes: 'Truck released for inbound fertilizer collection.',
      work_order_number: null,
    },
  ];

  for (const repair of repairSeeds) {
    const asset = createdAssets.get(repair.assetName);
    if (!asset) continue;
    const linkedOrder = repair.work_order_number
      ? await prisma.work_orders.findFirst({ where: { farm_id: FARM_ID, work_order_number: repair.work_order_number } })
      : null;
    const existing = await prismaAny.repair_records.findFirst({
      where: { farm_id: FARM_ID, asset_id: asset.id, issue: repair.issue, completed_date: repair.completed_date },
    });
    if (!existing) {
      await prismaAny.repair_records.create({
        data: {
          farm_id: FARM_ID,
          asset_id: asset.id,
          work_order_id: linkedOrder?.id ?? null,
          ...repair,
        },
      });
    }
  }

  const usageSeeds = [
    {
      assetName: 'John Deere 5075E Tractor',
      used_by: employeeByName.get('Abigail Swen') ?? USERS.farmManager.employeeId,
      purpose: 'Land preparation',
      sector: 'Crop production',
      activity: 'Disc harrow pass on North Field A',
      start_time: new Date(new Date().setHours(7, 0, 0, 0)),
      end_time: null,
      hours_used: null,
      fuel_cost: null,
      location: 'North Field A',
      notes: 'Open dispatch for this morning field pass.',
    },
    {
      assetName: 'Massey Ferguson Field Truck',
      used_by: employeeByName.get('Martha Dennis') ?? USERS.farmManager.employeeId,
      purpose: 'Warehouse transfer',
      sector: 'Logistics',
      activity: 'Delivered seed pallets to staging area',
      start_time: new Date(new Date().setDate(new Date().getDate() - 1)),
      end_time: new Date(new Date().setDate(new Date().getDate() - 1)),
      hours_used: 3.5,
      fuel_cost: 42,
      location: 'Input Warehouse Dock',
      notes: 'Completed inbound store movement.',
    },
    {
      assetName: 'Feed Mixer',
      used_by: employeeByName.get('Peter Wolo') ?? USERS.farmManager.employeeId,
      purpose: 'Feed production',
      sector: 'Livestock',
      activity: 'Mixed broiler starter ration',
      start_time: new Date(new Date().setDate(new Date().getDate() - 2)),
      end_time: new Date(new Date().setDate(new Date().getDate() - 2)),
      hours_used: 2.2,
      fuel_cost: 18,
      location: 'Livestock Feed Mill',
      notes: 'Batch mix aligned with poultry feeding plan.',
    },
    {
      assetName: 'Cold Room Generator',
      used_by: employeeByName.get('Daniel Kormah') ?? USERS.farmManager.employeeId,
      purpose: 'Cold room backup test',
      sector: 'Postharvest',
      activity: '30-minute load test',
      start_time: new Date(new Date().setDate(new Date().getDate() - 5)),
      end_time: new Date(new Date().setDate(new Date().getDate() - 5)),
      hours_used: 0.5,
      fuel_cost: 12,
      location: 'Cold Room Plant House',
      notes: 'Routine standby verification.',
    },
  ];

  for (const usage of usageSeeds) {
    const asset = createdAssets.get(usage.assetName);
    if (!asset || !usage.used_by) continue;
    const existing = await prisma.asset_usage_logs.findFirst({
      where: { asset_id: asset.id, purpose: usage.purpose, location: usage.location, notes: usage.notes },
    });
    if (!existing) {
      await prisma.asset_usage_logs.create({
        data: {
          asset_id: asset.id,
          authorized_by: USERS.farmManager.userId,
          ...usage,
        },
      });
    }
  }

  const equipmentRequest = await prismaAny.equipment_requests.findFirst({
    where: { farm_id: FARM_ID, name: 'Backup Irrigation Pump' },
  });
  if (!equipmentRequest) {
    await prismaAny.equipment_requests.create({
      data: {
        farm_id: FARM_ID,
        name: 'Backup Irrigation Pump',
        asset_type: 'equipment',
        model: 'AquaFlow 300',
        license: 'IRR-REQ-300',
        status: 'pending',
        notes: 'Requested for vegetable block redundancy.',
      },
    });
  }

  const parcel = await prismaAny.land_parcels.findFirst({
    where: { farm_id: FARM_ID, name: 'North Field A', deleted_at: null },
  }) ?? await prismaAny.land_parcels.create({
    data: {
      farm_id: FARM_ID,
      name: 'North Field A',
      size_hectares: 18.5,
      crop_type: 'Maize',
      soil_type: 'loamy',
      location: 'Northern production corridor',
      status: 'active',
      notes: 'Main maize production block.',
    },
  });

  const spareParcel = await prismaAny.land_parcels.findFirst({
    where: { farm_id: FARM_ID, name: 'Vegetable Nursery Zone', deleted_at: null },
  });
  if (!spareParcel) {
    await prismaAny.land_parcels.create({
      data: {
        farm_id: FARM_ID,
        name: 'Vegetable Nursery Zone',
        size_hectares: 3.2,
        crop_type: null,
        soil_type: 'sandy loam',
        location: 'South irrigation block',
        status: 'preparation',
        notes: 'Reserved for next vegetable cycle.',
      },
    });
  }

  const parcelRequest = await prismaAny.parcel_requests.findFirst({
    where: { farm_id: FARM_ID, name: 'West Expansion Plot' },
  });
  if (!parcelRequest) {
    await prismaAny.parcel_requests.create({
      data: {
        farm_id: FARM_ID,
        name: 'West Expansion Plot',
        size_hectares: 7.5,
        soil_type: 'clay loam',
        description: 'Requested parcel for cassava trial.',
        status: 'pending',
        location: 'Western boundary strip',
      },
    });
  }
}

async function ensureProductionAndProcurementRequests() {
  const prodRequest = await prismaAny.inventory_production_requests.findFirst({
    where: { farm_id: FARM_ID, product_name: 'Packaged Rice 5kg' },
  }) ?? await prismaAny.inventory_production_requests.create({
    data: {
      farm_id: FARM_ID,
      product_name: 'Packaged Rice 5kg',
      quantity: 320,
      quantity_unit: 'bag',
      location: 'Finished Goods Store',
      order_type: 'Make-to-Order',
      link_order: 'Make-to-Stock',
      status: 'accepted',
    },
  });

  const batch = await prismaAny.inventory_production_batches.findFirst({
    where: { farm_id: FARM_ID, request_id: prodRequest.id, batch_number: 'BATCH-DEMO-001' },
  });
  if (!batch) {
    await prismaAny.inventory_production_batches.create({
      data: {
        farm_id: FARM_ID,
        request_id: prodRequest.id,
        batch_number: 'BATCH-DEMO-001',
        quantity: 180,
        status: 'passed',
      },
    });
  }

  const procRequests = [
    {
      category: 'fertilizers',
      item_name: 'NPK Fertilizer 15-15-15',
      quantity: 900,
      quantity_unit: 'kg',
      status: 'pending',
    },
    {
      category: 'aquaculture_feed',
      item_name: 'Floating Fish Feed 32% Protein',
      quantity: 260,
      quantity_unit: 'bag',
      status: 'received',
      manufacture_date: todayMinus(60),
      expiration_date: todayPlus(120),
    },
  ];

  for (const request of procRequests) {
    const existing = await prismaAny.inventory_procurement_requests.findFirst({
      where: { farm_id: FARM_ID, item_name: request.item_name },
    });
    if (existing) {
      await prismaAny.inventory_procurement_requests.update({
        where: { id: existing.id },
        data: {
          ...request,
          in_stock: request.status === 'received' ? existing.in_stock ?? false : false,
          updated_at: new Date(),
        },
      });
    } else {
      await prismaAny.inventory_procurement_requests.create({
        data: {
          farm_id: FARM_ID,
          ...request,
          in_stock: false,
        },
      });
    }
  }
}

async function ensureManagerCoverage() {
  const stockItems = await prisma.stock_items.findMany({
    where: { farm_id: FARM_ID },
    select: { id: true, name: true, sku: true },
  });
  const stockByName = new Map(stockItems.map((item) => [item.name, item.id]));
  const stockBySku = new Map(stockItems.map((item) => [item.sku ?? '', item.id]));

  const extraCustomers = [
    {
      name: 'Sunrise Community Stores',
      email: 'orders@sunrisecommunity.example',
      customer_type: 'retailer',
      phone: '+231 770 000 103',
      address: 'Benson Street, central district',
      country: 'Liberia',
      notes: 'Weekly packaged staples buyer.',
    },
    {
      name: 'Green Plate Restaurants',
      email: 'purchasing@greenplate.example',
      customer_type: 'restaurant',
      phone: '+231 770 000 104',
      address: 'Tubman Boulevard hospitality strip',
      country: 'Liberia',
      notes: 'Requests frequent fresh produce and rice supply.',
    },
    {
      name: 'River Port Commodities',
      email: 'trade@riverport.example',
      customer_type: 'business',
      phone: '+231 770 000 105',
      address: 'Port logistics enclave',
      country: 'Liberia',
      notes: 'Bulk commodity and fertilizer buyer.',
    },
  ];

  const customerIds = new Map<string, string>();
  for (const customer of await prisma.customers.findMany({
    where: { farm_id: FARM_ID, deleted_at: null },
    select: { id: true, name: true },
  })) {
    customerIds.set(customer.name, customer.id);
  }

  for (const customer of extraCustomers) {
    const existing = await prisma.customers.findFirst({
      where: { farm_id: FARM_ID, name: customer.name, deleted_at: null },
    });
    const saved = existing
      ? await prisma.customers.update({
          where: { id: existing.id },
          data: { ...customer, is_active: true, updated_at: new Date() } as any,
        })
      : await prisma.customers.create({
          data: { farm_id: FARM_ID, is_active: true, ...customer } as any,
        });
    customerIds.set(saved.name, saved.id);
  }

  const extraSalesOrders = [
    {
      order_number: 'SO-DEMO-003',
      customer_name: 'Sunrise Community Stores',
      status: 'packed',
      payment_status: 'paid',
      order_date: todayMinus(7),
      delivery_date: todayPlus(1),
      subtotal: 1296,
      tax_amount: 64.8,
      total_amount: 1360.8,
      notes: 'Rice restock queued for morning dispatch.',
      items: [
        { stock_item_id: stockBySku.get('RICE-FG-5KG'), quantity: 24, unit_price: 54, line_total: 1296 },
      ],
    },
    {
      order_number: 'SO-DEMO-004',
      customer_name: 'Green Plate Restaurants',
      status: 'confirmed',
      payment_status: 'partial',
      order_date: todayMinus(4),
      delivery_date: todayPlus(2),
      subtotal: 540,
      tax_amount: 0,
      total_amount: 540,
      notes: 'Seed order bundled with agronomy support request.',
      items: [
        { stock_item_id: stockBySku.get('SEED-MAIZE-350'), quantity: 10, unit_price: 54, line_total: 540 },
      ],
    },
    {
      order_number: 'SO-DEMO-005',
      customer_name: 'River Port Commodities',
      status: 'delivered',
      payment_status: 'paid',
      order_date: todayMinus(16),
      delivery_date: todayMinus(10),
      subtotal: 1720,
      tax_amount: 0,
      total_amount: 1720,
      notes: 'Bulk fertilizer dispatch completed.',
      items: [
        { stock_item_id: stockBySku.get('FERT-UREA-4600'), quantity: 200, unit_price: 8.6, line_total: 1720 },
      ],
    },
    {
      order_number: 'SO-DEMO-006',
      customer_name: 'Harvest Foods Market',
      status: 'pending',
      payment_status: 'unpaid',
      order_date: todayMinus(1),
      delivery_date: todayPlus(6),
      subtotal: 1320,
      tax_amount: 0,
      total_amount: 1320,
      notes: 'Mixed feed and rice order awaiting approval.',
      items: [
        { stock_item_id: stockByName.get('Floating Fish Feed 32% Protein'), quantity: 20, unit_price: 24, line_total: 480 },
        { stock_item_id: stockBySku.get('RICE-FG-5KG'), quantity: 20, unit_price: 42, line_total: 840 },
      ],
    },
  ];

  for (const order of extraSalesOrders) {
    const customerId = customerIds.get(order.customer_name);
    if (!customerId) continue;

    let existing = await prisma.sales_orders.findFirst({
      where: { farm_id: FARM_ID, order_number: order.order_number },
    });

    if (existing) {
      existing = await prisma.sales_orders.update({
        where: { id: existing.id },
        data: {
          customer_id: customerId,
          updated_by: USERS.salesOfficer.userId,
          order_date: order.order_date,
          delivery_date: order.delivery_date,
          status: order.status,
          payment_status: order.payment_status,
          subtotal: order.subtotal,
          tax_amount: order.tax_amount,
          total_amount: order.total_amount,
          notes: order.notes,
        },
      });
    } else {
      existing = await prisma.sales_orders.create({
        data: {
          farm_id: FARM_ID,
          customer_id: customerId,
          created_by: USERS.salesOfficer.userId,
          updated_by: USERS.salesOfficer.userId,
          order_number: order.order_number,
          order_date: order.order_date,
          delivery_date: order.delivery_date,
          status: order.status,
          payment_status: order.payment_status,
          subtotal: order.subtotal,
          tax_amount: order.tax_amount,
          total_amount: order.total_amount,
          notes: order.notes,
        },
      });
    }

    for (const item of order.items) {
      if (!item.stock_item_id) continue;
      const existingItem = await prisma.sales_order_items.findFirst({
        where: { sales_order_id: existing.id, stock_item_id: item.stock_item_id },
      });
      if (existingItem) {
        await prisma.sales_order_items.update({
          where: { id: existingItem.id },
          data: item as any,
        });
      } else {
        await prisma.sales_order_items.create({
          data: { sales_order_id: existing.id, ...item } as any,
        });
      }
    }
  }

  const suppliers = await prisma.suppliers.findMany({
    where: { farm_id: FARM_ID, deleted_at: null },
    select: { id: true, name: true },
  });
  const supplierIds = new Map(suppliers.map((supplier) => [supplier.name, supplier.id]));

  const purchaseOrders = [
    {
      po_number: 'PO-DEMO-001',
      supplier_name: 'AgroChem Inputs Ltd',
      status: 'approved',
      payment_status: 'unpaid',
      expected_delivery: todayPlus(6),
      subtotal: 657,
      tax_amount: 0,
      total_amount: 657,
      commodity: 'NPK Fertilizer 15-15-15',
      quantity: 900,
      notes: 'Top-up for maize and vegetable nutrition program.',
      item: { stock_item_id: stockBySku.get('FERT-UREA-4600'), quantity_ordered: 900, quantity_received: 0, unit_price: 0.73, line_total: 657 },
    },
    {
      po_number: 'PO-DEMO-002',
      supplier_name: 'FeedWorks Cooperative',
      status: 'received',
      payment_status: 'paid',
      expected_delivery: todayMinus(9),
      subtotal: 5655,
      tax_amount: 0,
      total_amount: 5655,
      commodity: 'Floating Fish Feed 32% Protein',
      quantity: 260,
      notes: 'Emergency aquaculture feed replenishment completed.',
      item: { stock_item_id: stockByName.get('Floating Fish Feed 32% Protein'), quantity_ordered: 260, quantity_received: 260, unit_price: 21.75, line_total: 5655 },
    },
    {
      po_number: 'PO-DEMO-003',
      supplier_name: 'GreenSeed Agro Supply',
      status: 'submitted',
      payment_status: 'unpaid',
      expected_delivery: todayPlus(10),
      subtotal: 12792,
      tax_amount: 0,
      total_amount: 12792,
      commodity: 'Hybrid Maize Seed - FAO 350',
      quantity: 260,
      notes: 'Seasonal replenishment for expansion plots.',
      item: { stock_item_id: stockBySku.get('SEED-MAIZE-350'), quantity_ordered: 260, quantity_received: 0, unit_price: 49.2, line_total: 12792 },
    },
  ];

  for (const po of purchaseOrders) {
    const supplierId = supplierIds.get(po.supplier_name);
    const stockItemId = po.item.stock_item_id;
    if (!supplierId || !stockItemId) continue;

    let existing = await prisma.purchase_orders.findFirst({
      where: { farm_id: FARM_ID, po_number: po.po_number },
    });

    if (existing) {
      existing = await prisma.purchase_orders.update({
        where: { id: existing.id },
        data: {
          supplier_id: supplierId,
          status: po.status,
          payment_status: po.payment_status,
          expected_delivery: po.expected_delivery,
          subtotal: po.subtotal,
          tax_amount: po.tax_amount,
          total_amount: po.total_amount,
          commodity: po.commodity,
          quantity: po.quantity,
          notes: po.notes,
          updated_at: new Date(),
        } as any,
      });
    } else {
      existing = await prisma.purchase_orders.create({
        data: {
          farm_id: FARM_ID,
          supplier_id: supplierId,
          created_by: USERS.farmManager.userId,
          po_number: po.po_number,
          order_date: todayMinus(8),
          expected_delivery: po.expected_delivery,
          status: po.status,
          payment_status: po.payment_status,
          subtotal: po.subtotal,
          tax_amount: po.tax_amount,
          total_amount: po.total_amount,
          commodity: po.commodity,
          quantity: po.quantity,
          notes: po.notes,
        } as any,
      });
    }

    const existingItem = await prisma.purchase_order_items.findFirst({
      where: { purchase_order_id: existing.id, stock_item_id: stockItemId },
    });
    if (existingItem) {
      await prisma.purchase_order_items.update({
        where: { id: existingItem.id },
        data: {
          quantity_ordered: po.item.quantity_ordered,
          quantity_received: po.item.quantity_received,
          unit_price: po.item.unit_price,
          line_total: po.item.line_total,
        } as any,
      });
    } else {
      await prisma.purchase_order_items.create({
        data: {
          purchase_order_id: existing.id,
          stock_item_id: stockItemId,
          quantity_ordered: po.item.quantity_ordered,
          quantity_received: po.item.quantity_received,
          unit_price: po.item.unit_price,
          line_total: po.item.line_total,
        } as any,
      });
    }
  }

  const employeeSeeds = [
    {
      full_name: 'Olivia Freeman',
      employment_type: 'permanent',
      sector: 'crop',
      job_title: 'Production Supervisor',
      department: 'Production',
      phone: '+231 770 000 203',
      date_hired: todayMinus(220),
      monthly_salary: 1850,
      bank_id: 'BANK-PRD-001',
      personnel_id: 'PER-OFREEMAN',
      status: 'active',
      days_worked: 21,
      total_days_worked: 184,
    },
    {
      full_name: 'Peter Sumo',
      employment_type: 'contract',
      sector: 'logistics',
      job_title: 'Irrigation Technician',
      department: 'Maintenance',
      phone: '+231 770 000 204',
      date_hired: todayMinus(130),
      monthly_salary: 1320,
      bank_id: 'BANK-IRR-001',
      personnel_id: 'PER-PSUMO',
      status: 'active',
      days_worked: 18,
      total_days_worked: 101,
    },
    {
      full_name: 'Hawa Cooper',
      employment_type: 'daily',
      sector: 'livestock',
      job_title: 'Poultry Attendant',
      department: 'Livestock',
      phone: '+231 770 000 205',
      date_hired: todayMinus(52),
      daily_wage: 20,
      bank_id: 'BANK-PLT-001',
      personnel_id: 'PER-HCOOPER',
      status: 'active',
      days_worked: 14,
      total_days_worked: 34,
    },
  ];

  const employeesByName = new Map<string, any>();
  for (const employee of await prisma.employees.findMany({
    where: { farm_id: FARM_ID, deleted_at: null },
  })) {
    employeesByName.set(employee.full_name, employee);
  }

  for (const seed of employeeSeeds) {
    let employee = employeesByName.get(seed.full_name);
    if (employee) {
      employee = await prisma.employees.update({
        where: { id: employee.id },
        data: { ...seed, updated_at: new Date() } as any,
      });
    } else {
      employee = await prisma.employees.create({
        data: { farm_id: FARM_ID, ...seed } as any,
      });
    }
    employeesByName.set(seed.full_name, employee);
  }

  const attendanceSeeds = [
    { employee_name: 'Farm Manager', date: todayMinus(1), status: 'present', hours: 8.5, activity: 'Reviewed weekly farm operations.', sector: 'general' },
    { employee_name: 'Olivia Freeman', date: todayMinus(0), status: 'present', hours: 9, activity: 'Coordinated rice packaging line.', sector: 'crop' },
    { employee_name: 'Olivia Freeman', date: todayMinus(1), status: 'present', hours: 8, activity: 'Field inspection and yield estimation.', sector: 'crop' },
    { employee_name: 'Peter Sumo', date: todayMinus(0), status: 'present', hours: 7.5, activity: 'Checked pump pressure and drip lines.', sector: 'logistics' },
    { employee_name: 'Peter Sumo', date: todayMinus(2), status: 'present', hours: 8, activity: 'Serviced nursery irrigation valves.', sector: 'logistics' },
    { employee_name: 'Hawa Cooper', date: todayMinus(0), status: 'present', hours: 8, activity: 'Fed broiler house and monitored temperature.', sector: 'livestock' },
    { employee_name: 'Hawa Cooper', date: todayMinus(1), status: 'present', hours: 8, activity: 'Vaccination follow-up and litter check.', sector: 'livestock' },
    { employee_name: 'James Kollie', date: todayMinus(2), status: 'present', hours: 8, activity: 'Prepared cassava trial plot bunds.', sector: 'crop' },
    { employee_name: 'Martha Dennis', date: todayMinus(0), status: 'present', hours: 8, activity: 'Closed seed and input movement ledger.', sector: 'logistics' },
  ];

  for (const seed of attendanceSeeds) {
    const employee = employeesByName.get(seed.employee_name);
    if (!employee) continue;
    const existing = await prisma.attendance_logs.findFirst({
      where: { employee_id: employee.id, log_date: seed.date },
    });
    if (existing) {
      await prisma.attendance_logs.update({
        where: { id: existing.id },
        data: {
          status: seed.status,
          hours_worked: seed.hours,
          activity_description: seed.activity,
          sector: seed.sector,
          notes: seed.activity,
        } as any,
      });
    } else {
      await prisma.attendance_logs.create({
        data: {
          employee_id: employee.id,
          recorded_by: USERS.farmManager.userId,
          log_date: seed.date,
          status: seed.status,
          hours_worked: seed.hours,
          activity_description: seed.activity,
          sector: seed.sector,
          notes: seed.activity,
        } as any,
      });
    }
  }

  const taskSeeds = [
    { employee_name: 'Olivia Freeman', task_title: 'Verify maize stand count on North Field A', description: 'Complete stand count and flag thin spots for replanting.', sector: 'crop', due_date: todayPlus(1), priority: 'high', status: 'pending' },
    { employee_name: 'Peter Sumo', task_title: 'Inspect pump house backup generator', description: 'Confirm backup generator load test before rainy-week forecast.', sector: 'logistics', due_date: todayPlus(2), priority: 'normal', status: 'pending' },
    { employee_name: 'Hawa Cooper', task_title: 'Prepare broiler house for next intake', description: 'Wash, disinfect, and replace litter in House 3.', sector: 'livestock', due_date: todayPlus(3), priority: 'urgent', status: 'pending' },
    { employee_name: 'Martha Dennis', task_title: 'Close monthly input reconciliation', description: 'Finalize fertilizer and feed issue variance report.', sector: 'logistics', due_date: todayPlus(1), priority: 'high', status: 'in_progress' },
    { employee_name: 'James Kollie', task_title: 'Stake vegetable nursery expansion beds', description: 'Mark beds and drainage paths for transplanting.', sector: 'crop', due_date: todayPlus(4), priority: 'normal', status: 'completed', completed_at: todayMinus(0) },
  ];

  for (const task of taskSeeds) {
    const employee = employeesByName.get(task.employee_name);
    if (!employee) continue;
    const existing = await prisma.task_assignments.findFirst({
      where: { farm_id: FARM_ID, employee_id: employee.id, task_title: task.task_title },
    });
    if (existing) {
      await prisma.task_assignments.update({
        where: { id: existing.id },
        data: {
          description: task.description,
          sector: task.sector,
          due_date: task.due_date,
          priority: task.priority,
          status: task.status,
          completed_at: task.completed_at ?? null,
          updated_at: new Date(),
        } as any,
      });
    } else {
      await prisma.task_assignments.create({
        data: {
          farm_id: FARM_ID,
          assigned_by: USERS.farmManager.userId,
          employee_id: employee.id,
          task_title: task.task_title,
          description: task.description,
          sector: task.sector,
          due_date: task.due_date,
          priority: task.priority,
          status: task.status,
          completed_at: task.completed_at ?? null,
        } as any,
      });
    }
  }

  const contractorSeeds = [
    {
      contractor_id: 'CON-DEMO002',
      contractor_name: 'Delta Transport Services',
      contract_type: 'Harvest hauling',
      sector: 'logistics',
      amount_charged: 960,
      description: 'Short-haul rice movement from processing line to warehouse.',
      bank_id: 'BANK-CON-002',
      start_date: todayMinus(8),
      end_date: todayMinus(2),
      status: 'finished',
      payment_sent: false,
    },
  ];

  for (const seed of contractorSeeds) {
    const existing = await prismaAny.contractors.findFirst({
      where: { farm_id: FARM_ID, contractor_id: seed.contractor_id },
    });
    const contractor = existing
      ? await prismaAny.contractors.update({
          where: { id: existing.id },
          data: { ...seed, updated_at: new Date() },
        })
      : await prismaAny.contractors.create({
          data: { farm_id: FARM_ID, ...seed },
        });

    const existingPayment = await prismaAny.contractor_payments.findFirst({
      where: { farm_id: FARM_ID, contractor_id: contractor.id },
    });
    if (!existingPayment) {
      await prismaAny.contractor_payments.create({
        data: {
          farm_id: FARM_ID,
          contractor_id: contractor.id,
          contractor_name: contractor.contractor_name,
          contract_type: contractor.contract_type,
          sector: contractor.sector,
          amount: contractor.amount_charged,
          bank_id: contractor.bank_id,
          start_date: contractor.start_date,
          end_date: contractor.end_date,
          payment_status: seed.payment_sent ? 'paid' : 'pending',
        },
      });
    }
  }

  const wageSeeds = [
    { employee_name: 'Olivia Freeman', pay_period: 'Monthly', amount: 1850, days_worked: 21, payment_status: 'pending' },
    { employee_name: 'Peter Sumo', pay_period: 'Monthly', amount: 1320, days_worked: 18, payment_status: 'pending' },
    { employee_name: 'Hawa Cooper', pay_period: 'Every 15 days', amount: 280, days_worked: 14, payment_status: 'paid', paid_at: todayMinus(1) },
  ];

  for (const seed of wageSeeds) {
    const employee = employeesByName.get(seed.employee_name);
    if (!employee) continue;
    const existing = await prismaAny.personnel_wages.findFirst({
      where: { farm_id: FARM_ID, employee_id: employee.id, pay_period: seed.pay_period },
    });
    const data = {
      employee_id: employee.id,
      personnel_id: employee.personnel_id ?? employee.id,
      full_name: employee.full_name,
      employment_type: employee.employment_type,
      sector: employee.sector,
      pay_period: seed.pay_period,
      days_worked: seed.days_worked,
      amount: seed.amount,
      bank_id: employee.bank_id,
      payment_status: seed.payment_status,
      paid_at: seed.paid_at ?? null,
      immutable: seed.payment_status === 'paid',
    };
    if (existing) {
      await prismaAny.personnel_wages.update({
        where: { id: existing.id },
        data: { ...data, updated_at: new Date() },
      });
    } else {
      await prismaAny.personnel_wages.create({
        data: { farm_id: FARM_ID, ...data },
      });
    }
  }

  const assetSeeds = [
    {
      name: 'John Deere 5075E Tractor',
      asset_code: 'AST-TRC-001',
      asset_type: 'equipment',
      category: 'tractor',
      manufacturer: 'John Deere',
      model: '5075E',
      serial_number: 'JD5075E-2026-001',
      purchase_date: todayMinus(320),
      purchase_cost: 28500,
      current_value: 24800,
      location: 'North Field Dispatch',
      assigned_to_name: 'Olivia Freeman',
      condition: 'good',
      status: 'active',
      last_service_date: todayMinus(12),
      next_service_date: todayPlus(9),
      warranty_expiry_date: todayPlus(210),
      notes: 'Primary tractor for land preparation, seedbed finishing, and trailer tow work.',
      maintenance: {
        maintenance_type: 'scheduled',
        description: 'Quarterly service and filter replacement',
        cost: 420,
        service_provider: 'FarmParts Service Center',
        maintenance_date: todayMinus(12),
        next_service_date: todayPlus(9),
        downtime_hours: 4,
        outcome: 'Returned to service',
      },
    },
    {
      name: 'Massey Ferguson Field Truck',
      asset_code: 'AST-TRK-002',
      asset_type: 'vehicle',
      category: 'vehicle',
      manufacturer: 'Massey Ferguson',
      model: 'Rural Hauler 4x4',
      serial_number: 'MFTRK-2026-002',
      purchase_date: todayMinus(410),
      purchase_cost: 19400,
      current_value: 16850,
      location: 'Transport Bay',
      assigned_to_name: 'Peter Sumo',
      condition: 'good',
      status: 'operational',
      last_service_date: todayMinus(20),
      next_service_date: todayPlus(14),
      warranty_expiry_date: todayPlus(120),
      notes: 'Used for produce dispatch and input transfers.',
      maintenance: {
        maintenance_type: 'inspection',
        description: 'Brake inspection and tire rotation',
        cost: 180,
        service_provider: 'Highway Diesel Works',
        maintenance_date: todayMinus(20),
        next_service_date: todayPlus(14),
        downtime_hours: 2,
        outcome: 'Returned to dispatch rotation',
      },
    },
    {
      name: 'Kubota Power Tiller',
      asset_code: 'AST-TIL-003',
      asset_type: 'equipment',
      category: 'tractor',
      manufacturer: 'Kubota',
      model: 'KT-900',
      serial_number: 'KBT-900-003',
      purchase_date: todayMinus(180),
      purchase_cost: 8600,
      current_value: 7900,
      location: 'Workshop Bay 2',
      assigned_to_name: 'Olivia Freeman',
      condition: 'fair',
      status: 'under_maintenance',
      last_service_date: todayMinus(70),
      next_service_date: todayMinus(2),
      warranty_expiry_date: todayPlus(60),
      notes: 'Used on nursery beds and trial plots.',
      maintenance: {
        maintenance_type: 'corrective',
        description: 'Replaced drive chain and clutch cable',
        cost: 265,
        service_provider: 'FarmParts Service Center',
        maintenance_date: todayMinus(3),
        next_service_date: todayPlus(5),
        downtime_hours: 6,
        outcome: 'Awaiting final field test',
      },
    },
    {
      name: 'Cold Room Generator',
      asset_code: 'AST-GEN-004',
      asset_type: 'infrastructure',
      category: 'generator',
      manufacturer: 'Cummins',
      model: 'C55D5',
      serial_number: 'CMN-GEN-004',
      purchase_date: todayMinus(540),
      purchase_cost: 12600,
      current_value: 11100,
      location: 'Cold Storage Annex',
      assigned_to_name: 'Farm Manager',
      condition: 'good',
      status: 'active',
      last_service_date: todayMinus(15),
      next_service_date: todayPlus(30),
      warranty_expiry_date: todayPlus(45),
      notes: 'Backs up the cold room and processing annex.',
      maintenance: {
        maintenance_type: 'scheduled',
        description: 'Oil change and load bank test',
        cost: 310,
        service_provider: 'PowerCore Systems',
        maintenance_date: todayMinus(15),
        next_service_date: todayPlus(30),
        downtime_hours: 1.5,
        outcome: 'Stable under full cooling load',
      },
    },
    {
      name: 'Irrigation Pump',
      asset_code: 'AST-IRR-005',
      asset_type: 'equipment',
      category: 'irrigation',
      manufacturer: 'AquaFlow',
      model: 'AF-180',
      serial_number: 'AQUA-IRR-005',
      purchase_date: todayMinus(260),
      purchase_cost: 5400,
      current_value: 4880,
      location: 'Pump House',
      assigned_to_name: 'Peter Sumo',
      condition: 'good',
      status: 'operational',
      last_service_date: todayMinus(25),
      next_service_date: todayPlus(4),
      warranty_expiry_date: todayPlus(150),
      notes: 'Supplies the nursery and dripline network.',
      maintenance: {
        maintenance_type: 'inspection',
        description: 'Seal inspection and suction line flush',
        cost: 140,
        service_provider: 'AquaFlow Service Hub',
        maintenance_date: todayMinus(25),
        next_service_date: todayPlus(4),
        downtime_hours: 1,
        outcome: 'Pressure restored across nursery lines',
      },
    },
    {
      name: 'Feed Mixer',
      asset_code: 'AST-MIX-006',
      asset_type: 'equipment',
      category: 'tool',
      manufacturer: 'AgriBlend',
      model: 'FM-600',
      serial_number: 'AGR-FM-006',
      purchase_date: todayMinus(300),
      purchase_cost: 7600,
      current_value: 6900,
      location: 'Feed Shed',
      assigned_to_name: 'Hawa Cooper',
      condition: 'good',
      status: 'operational',
      last_service_date: todayMinus(18),
      next_service_date: todayPlus(11),
      warranty_expiry_date: todayPlus(180),
      notes: 'Daily feed blending for poultry and pig ration prep.',
      maintenance: {
        maintenance_type: 'scheduled',
        description: 'Bearing grease and paddle alignment check',
        cost: 95,
        service_provider: 'AgriBlend Support',
        maintenance_date: todayMinus(18),
        next_service_date: todayPlus(11),
        downtime_hours: 1.25,
        outcome: 'Mixer vibration reduced to normal band',
      },
    },
    {
      name: 'Cold Storage Unit',
      asset_code: 'AST-CLD-007',
      asset_type: 'infrastructure',
      category: 'storage',
      manufacturer: 'CoolChain',
      model: 'CSU-12',
      serial_number: 'CLD-STO-007',
      purchase_date: todayMinus(600),
      purchase_cost: 32100,
      current_value: 27750,
      location: 'Packhouse Cold Room',
      assigned_to_name: 'Farm Manager',
      condition: 'good',
      status: 'operational',
      last_service_date: todayMinus(40),
      next_service_date: todayPlus(6),
      warranty_expiry_date: todayPlus(300),
      notes: 'Temperature-controlled storage for fresh produce and vaccines.',
      maintenance: {
        maintenance_type: 'inspection',
        description: 'Evaporator coil cleaning and sensor calibration',
        cost: 360,
        service_provider: 'CoolChain Service',
        maintenance_date: todayMinus(40),
        next_service_date: todayPlus(6),
        downtime_hours: 2.5,
        outcome: 'Cooling delta back within safe storage threshold',
      },
    },
    {
      name: 'Weighing Scale',
      asset_code: 'AST-WGH-008',
      asset_type: 'tool',
      category: 'tool',
      manufacturer: 'ScalePro',
      model: 'SP-1500',
      serial_number: 'SCL-PRO-008',
      purchase_date: todayMinus(240),
      purchase_cost: 1450,
      current_value: 960,
      location: 'Loading Bay',
      assigned_to_name: 'Martha Dennis',
      condition: 'critical',
      status: 'decommissioned',
      last_service_date: todayMinus(90),
      next_service_date: todayMinus(20),
      warranty_expiry_date: todayMinus(10),
      notes: 'Main dispatch weigh scale with intermittent display fault.',
      maintenance: {
        maintenance_type: 'corrective',
        description: 'Load cell diagnosis and display board test',
        cost: 210,
        service_provider: 'ScalePro Field Team',
        maintenance_date: todayMinus(21),
        next_service_date: todayMinus(20),
        downtime_hours: 8,
        outcome: 'Board fault persisted; scale removed from active dispatch use',
      },
    },
    {
      name: 'Boom Sprayer',
      asset_code: 'AST-SPR-009',
      asset_type: 'equipment',
      category: 'tool',
      manufacturer: 'FieldJet',
      model: 'BJ-800',
      serial_number: 'FJET-SPR-009',
      purchase_date: todayMinus(210),
      purchase_cost: 6900,
      current_value: 6050,
      location: 'Chemical Store Yard',
      assigned_to_name: 'James Kollie',
      condition: 'fair',
      status: 'operational',
      last_service_date: todayMinus(31),
      next_service_date: todayPlus(2),
      warranty_expiry_date: todayPlus(90),
      notes: 'Used for foliar nutrition and crop protection rounds.',
      maintenance: {
        maintenance_type: 'inspection',
        description: 'Nozzle flow test and boom pressure check',
        cost: 150,
        service_provider: 'FieldJet Mobile Service',
        maintenance_date: todayMinus(31),
        next_service_date: todayPlus(2),
        downtime_hours: 1.75,
        outcome: 'Two nozzles flagged for replacement on next service',
      },
    },
    {
      name: 'Legacy Flatbed Trailer',
      asset_code: 'AST-RET-010',
      asset_type: 'vehicle',
      category: 'vehicle',
      manufacturer: 'HaulMaster',
      model: '14FT',
      serial_number: 'HM-TRAIL-010',
      purchase_date: todayMinus(980),
      purchase_cost: 4200,
      current_value: 0,
      location: 'Disposed Assets Yard',
      assigned_to_name: 'Peter Sumo',
      condition: 'critical',
      status: 'sold',
      last_service_date: todayMinus(180),
      next_service_date: null,
      warranty_expiry_date: null,
      notes: 'Disposed after repeated axle failures and replaced by contractor haulage.',
      maintenance: {
        maintenance_type: 'corrective',
        description: 'Final axle inspection before disposal',
        cost: 0,
        service_provider: 'Internal workshop',
        maintenance_date: todayMinus(190),
        next_service_date: null,
        downtime_hours: 0,
        outcome: 'Marked for sale and disposal',
      },
    },
  ];

  const assetsByName = new Map<string, any>();
  for (const seed of assetSeeds) {
    const assignedEmployee = employeesByName.get(seed.assigned_to_name);
    let asset = await prisma.assets.findFirst({
      where: {
        farm_id: FARM_ID,
        OR: [{ serial_number: seed.serial_number }, { asset_code: seed.asset_code }],
        deleted_at: null,
      },
    });
    const assetData = {
      farm_id: FARM_ID,
      asset_code: seed.asset_code,
      name: seed.name,
      asset_type: seed.asset_type,
      category: seed.category,
      manufacturer: seed.manufacturer,
      model: seed.model,
      serial_number: seed.serial_number,
      purchase_date: seed.purchase_date,
      purchase_cost: seed.purchase_cost,
      current_value: seed.current_value,
      location: seed.location,
      assigned_to: assignedEmployee?.id ?? null,
      condition: seed.condition,
      status: seed.status,
      last_service_date: seed.last_service_date,
      next_service_date: seed.next_service_date,
      warranty_expiry_date: seed.warranty_expiry_date,
      notes: seed.notes,
    };
    if (asset) {
      asset = await prisma.assets.update({
        where: { id: asset.id },
        data: { ...assetData, updated_at: new Date() } as any,
      });
    } else {
      asset = await prisma.assets.create({ data: assetData as any });
    }
    assetsByName.set(seed.name, asset);

    const existingLog = await prisma.asset_maintenance_logs.findFirst({
      where: { asset_id: asset.id, description: seed.maintenance.description },
    });
    if (!existingLog) {
      await prisma.asset_maintenance_logs.create({
        data: {
          asset_id: asset.id,
          performed_by: USERS.farmManager.userId,
          ...seed.maintenance,
        } as any,
      });
    }
  }

  const maintenanceSchedules = [
    { asset_name: 'John Deere 5075E Tractor', service_type: '250-hour engine and hydraulic service', due_date: todayPlus(9), priority: 'high', technician_name: 'Daniel Kormah', estimated_cost: 470, status: 'scheduled', notes: 'Service before land prep starts on the south paddies.' },
    { asset_name: 'Kubota Power Tiller', service_type: 'Post-repair field validation and clutch adjustment', due_date: todayMinus(2), priority: 'urgent', technician_name: 'Daniel Kormah', estimated_cost: 120, status: 'overdue', notes: 'Tiller remains blocked until validation run is completed.' },
    { asset_name: 'Cold Room Generator', service_type: 'Cooling backup runtime inspection', due_date: todayPlus(18), priority: 'normal', technician_name: 'PowerCore Systems', estimated_cost: 260, status: 'scheduled', notes: 'Run under evening cold room load.' },
    { asset_name: 'Irrigation Pump', service_type: 'Impeller wear check', due_date: todayPlus(4), priority: 'high', technician_name: 'Peter Sumo', estimated_cost: 115, status: 'due soon', notes: 'Inspect before peak irrigation demand.' },
    { asset_name: 'Feed Mixer', service_type: 'Mixer drum calibration', due_date: todayPlus(11), priority: 'normal', technician_name: 'Daniel Kormah', estimated_cost: 95, status: 'scheduled', notes: 'Align with poultry ration changeover.' },
    { asset_name: 'Cold Storage Unit', service_type: 'Refrigerant leak inspection', due_date: todayPlus(6), priority: 'high', technician_name: 'CoolChain Service', estimated_cost: 325, status: 'due soon', notes: 'Verify performance before next vegetable harvest window.' },
    { asset_name: 'Boom Sprayer', service_type: 'Nozzle kit replacement and pressure test', due_date: todayPlus(2), priority: 'high', technician_name: 'Peter Sumo', estimated_cost: 165, status: 'due soon', notes: 'Needed before foliar spray round in Block C.' },
  ];

  for (const seed of maintenanceSchedules) {
    const asset = assetsByName.get(seed.asset_name);
    if (!asset) continue;
    const existing = await prismaAny.asset_maintenance_schedules.findFirst({
      where: { asset_id: asset.id, service_type: seed.service_type, due_date: seed.due_date },
    }).catch(() => null);
    if (existing) {
      await prismaAny.asset_maintenance_schedules.update({
        where: { id: existing.id },
        data: { ...seed, farm_id: FARM_ID, asset_id: asset.id, created_by: USERS.farmManager.userId, updated_at: new Date() },
      });
    } else {
      await prismaAny.asset_maintenance_schedules.create({
        data: { ...seed, farm_id: FARM_ID, asset_id: asset.id, created_by: USERS.farmManager.userId },
      });
    }
  }

  const usageSeeds = [
    { asset_name: 'John Deere 5075E Tractor', operator_name: 'Olivia Freeman', purpose: 'Field cultivation shift', sector: 'crop', activity: 'Secondary tillage on North Field A', start_time: new Date(new Date().setHours(7, 15, 0, 0)), end_time: null, fuel_cost: null, location: 'North Field A', notes: 'Still on shift for afternoon bed shaping.' },
    { asset_name: 'Cold Room Generator', operator_name: 'Farm Manager', purpose: 'Utility backup run', sector: 'processing', activity: 'Cold room backup support during grid instability', start_time: new Date(new Date().setHours(9, 5, 0, 0)), end_time: null, fuel_cost: null, location: 'Cold Storage Annex', notes: 'Generator remains online due to unstable mains power.' },
    { asset_name: 'Massey Ferguson Field Truck', operator_name: 'Peter Sumo', purpose: 'Dispatch support', sector: 'logistics', activity: 'Moved packaging materials to warehouse dock', start_time: new Date(new Date().setHours(8, 0, 0, 0)), end_time: new Date(new Date().setHours(11, 30, 0, 0)), fuel_cost: 48, location: 'Warehouse Dock', notes: 'Completed one loading loop and returned to bay.' },
    { asset_name: 'Irrigation Pump', operator_name: 'Peter Sumo', purpose: 'Irrigation cycle', sector: 'crop', activity: 'Nursery line pressure boost', start_time: new Date(new Date().setHours(6, 40, 0, 0)), end_time: new Date(new Date().setHours(9, 10, 0, 0)), fuel_cost: 22, location: 'Pump House', notes: 'Morning nursery cycle completed without pressure drops.' },
    { asset_name: 'Feed Mixer', operator_name: 'Hawa Cooper', purpose: 'Feed preparation', sector: 'livestock', activity: 'Broiler starter ration mix', start_time: new Date(todayMinus(1).setHours(7, 30, 0, 0)), end_time: new Date(todayMinus(1).setHours(9, 0, 0, 0)), fuel_cost: 0, location: 'Feed Shed', notes: 'Mixed maize bran and concentrate lot 2.' },
    { asset_name: 'Boom Sprayer', operator_name: 'James Kollie', purpose: 'Crop protection round', sector: 'crop', activity: 'Foliar nutrient application on vegetable block', start_time: new Date(todayMinus(2).setHours(6, 50, 0, 0)), end_time: new Date(todayMinus(2).setHours(10, 20, 0, 0)), fuel_cost: 31, location: 'Vegetable Block C', notes: 'Stopped early because two nozzles lost pressure.' },
  ];

  for (const seed of usageSeeds) {
    const asset = assetsByName.get(seed.asset_name);
    const employee = employeesByName.get(seed.operator_name);
    if (!asset || !employee) continue;
    const existing = await prisma.asset_usage_logs.findFirst({
      where: { asset_id: asset.id, used_by: employee.id, purpose: seed.purpose, start_time: seed.start_time },
    });
    const hours = seed.end_time ? Number(((seed.end_time.getTime() - seed.start_time.getTime()) / 3600000).toFixed(2)) : null;
    if (existing) {
      await prisma.asset_usage_logs.update({
        where: { id: existing.id },
        data: {
          authorized_by: USERS.farmManager.userId,
          sector: seed.sector,
          activity: seed.activity,
          end_time: seed.end_time,
          hours_used: hours,
          fuel_cost: seed.fuel_cost,
          location: seed.location,
          notes: seed.notes,
        } as any,
      });
    } else {
      await prisma.asset_usage_logs.create({
        data: {
          asset_id: asset.id,
          used_by: employee.id,
          authorized_by: USERS.farmManager.userId,
          purpose: seed.purpose,
          sector: seed.sector,
          activity: seed.activity,
          start_time: seed.start_time,
          end_time: seed.end_time,
          hours_used: hours,
          fuel_cost: seed.fuel_cost,
          location: seed.location,
          notes: seed.notes,
        } as any,
      });
    }
  }

  const productionWorkOrderSeeds = [
    { work_order_number: 'MWO-240001', asset_name: 'Kubota Power Tiller', title: 'Starter motor relay replacement', issue_type: 'Electrical repair', description: 'Tiller failed to crank during morning nursery dispatch.', planned_start_date: todayMinus(1), planned_end_date: todayPlus(1), priority: 'urgent', requested_by_name: 'Olivia Freeman', assigned_technician: 'Daniel Kormah', estimated_cost: 145, actual_cost: null, status: 'in progress' },
    { work_order_number: 'MWO-240002', asset_name: 'Weighing Scale', title: 'Display board fault diagnosis', issue_type: 'Calibration repair', description: 'Loading bay scale display flickers and loses tare settings.', planned_start_date: todayMinus(4), planned_end_date: todayMinus(1), priority: 'high', requested_by_name: 'Martha Dennis', assigned_technician: 'ScalePro Field Team', estimated_cost: 210, actual_cost: 210, status: 'completed' },
    { work_order_number: 'MWO-240003', asset_name: 'Cold Storage Unit', title: 'Door seal inspection', issue_type: 'Preventive service', description: 'Seal wear observed during night temperature review.', planned_start_date: todayPlus(1), planned_end_date: todayPlus(3), priority: 'normal', requested_by_name: 'Farm Manager', assigned_technician: 'CoolChain Service', estimated_cost: 185, actual_cost: null, status: 'assigned' },
    { work_order_number: 'MWO-240004', asset_name: 'Boom Sprayer', title: 'Nozzle kit replacement', issue_type: 'Spray system repair', description: 'Two nozzles blocked and boom pressure fell below operating range.', planned_start_date: todayMinus(0), planned_end_date: todayPlus(2), priority: 'high', requested_by_name: 'James Kollie', assigned_technician: 'Peter Sumo', estimated_cost: 165, actual_cost: null, status: 'waiting parts' },
    { work_order_number: 'MWO-240005', asset_name: 'Massey Ferguson Field Truck', title: 'Brake line inspection', issue_type: 'Safety inspection', description: 'Pre-dispatch brake feel softened after last delivery loop.', planned_start_date: todayMinus(0), planned_end_date: todayPlus(1), priority: 'high', requested_by_name: 'Peter Sumo', assigned_technician: 'Daniel Kormah', estimated_cost: 95, actual_cost: null, status: 'open' },
    { work_order_number: 'MWO-240006', asset_name: 'Legacy Flatbed Trailer', title: 'Trailer frame review', issue_type: 'Disposal review', description: 'Inspection before sale handover.', planned_start_date: todayMinus(200), planned_end_date: todayMinus(190), priority: 'low', requested_by_name: 'Peter Sumo', assigned_technician: 'Internal workshop', estimated_cost: 0, actual_cost: 0, status: 'cancelled' },
  ];

  const workOrdersByNumber = new Map<string, any>();
  for (const seed of productionWorkOrderSeeds) {
    const asset = assetsByName.get(seed.asset_name);
    const requestedEmployee = employeesByName.get(seed.requested_by_name);
    if (!asset) continue;
    const existing = await prisma.work_orders.findFirst({
      where: { farm_id: FARM_ID, work_order_number: seed.work_order_number },
    });
    const data = {
      farm_id: FARM_ID,
      asset_id: asset.id,
      work_order_number: seed.work_order_number,
      title: seed.title,
      description: seed.description,
      planned_start_date: seed.planned_start_date,
      planned_end_date: seed.planned_end_date,
      priority: seed.priority,
      requested_by_employee_id: requestedEmployee?.id ?? null,
      assigned_technician: seed.assigned_technician,
      issue_type: seed.issue_type,
      estimated_cost: seed.estimated_cost,
      actual_cost: seed.actual_cost,
      status: seed.status,
      created_by: USERS.farmManager.userId,
      completed_at: seed.status === 'completed' ? todayMinus(1) : null,
      actual_end_time: seed.status === 'completed' ? todayMinus(1) : null,
      planned_inputs: { module: 'machinery' },
      actual_outputs: seed.status === 'completed'
        ? { repairAction: 'Fault isolated and repaired', partsUsed: ['Display board assembly'], downtimeHours: 8, completedBy: seed.assigned_technician }
        : null,
    };
    const workOrder = existing
      ? await prisma.work_orders.update({
          where: { id: existing.id },
          data: { ...data, updated_at: new Date() } as any,
        })
      : await prisma.work_orders.create({ data: data as any });
    workOrdersByNumber.set(seed.work_order_number, workOrder);
  }

  const repairSeeds = [
    { asset_name: 'Weighing Scale', work_order_number: 'MWO-240002', issue: 'Display board instability', repair_action: 'Replaced faulty display board and recalibrated tare memory', parts_used: ['Display board assembly', 'Calibration seal kit'], downtime_hours: 8, cost: 210, completed_by: 'ScalePro Field Team', completed_date: todayMinus(1), notes: 'Scale returned to test bench but still held out of active dispatch rotation pending verification.' },
    { asset_name: 'Kubota Power Tiller', work_order_number: null, issue: 'Drive chain failure', repair_action: 'Replaced drive chain and clutch cable, aligned transmission housing', parts_used: ['Drive chain', 'Clutch cable'], downtime_hours: 6, cost: 265, completed_by: 'FarmParts Service Center', completed_date: todayMinus(3), notes: 'Final field validation remains outstanding.' },
    { asset_name: 'Cold Room Generator', work_order_number: null, issue: 'Cooling backup readiness', repair_action: 'Performed oil service and load bank test', parts_used: ['Oil filter', 'Fuel filter'], downtime_hours: 1.5, cost: 310, completed_by: 'PowerCore Systems', completed_date: todayMinus(15), notes: 'Generator passed full load run.' },
  ];

  for (const seed of repairSeeds) {
    const asset = assetsByName.get(seed.asset_name);
    const workOrder = seed.work_order_number ? workOrdersByNumber.get(seed.work_order_number) : null;
    if (!asset) continue;
    const existing = await prismaAny.repair_records.findFirst({
      where: { asset_id: asset.id, issue: seed.issue, completed_date: seed.completed_date },
    }).catch(() => null);
    const data = {
      farm_id: FARM_ID,
      asset_id: asset.id,
      work_order_id: workOrder?.id ?? null,
      issue: seed.issue,
      repair_action: seed.repair_action,
      parts_used: seed.parts_used,
      downtime_hours: seed.downtime_hours,
      cost: seed.cost,
      completed_by: seed.completed_by,
      completed_date: seed.completed_date,
      notes: seed.notes,
    };
    if (existing) {
      await prismaAny.repair_records.update({
        where: { id: existing.id },
        data: { ...data, updated_at: new Date() },
      });
    } else {
      await prismaAny.repair_records.create({ data });
    }
  }

  const equipmentRequestSeeds = [
    { name: 'Rice Moisture Meter', asset_type: 'tool', model: 'GrainSafe X2', license: 'EQ-REQ-002', status: 'approved', notes: 'Needed for post-harvest quality checks.' },
    { name: 'Flatbed Delivery Trailer', asset_type: 'vehicle', model: 'HaulMaster 14ft', license: 'EQ-REQ-003', status: 'pending', notes: 'Supports bulk dispatch during peak harvest.' },
    { name: 'Nursery Water Pump', asset_type: 'equipment', model: 'AquaFlow 180', license: 'EQ-REQ-004', status: 'approved', notes: 'Requested for greenhouse backup line.' },
  ];
  for (const seed of equipmentRequestSeeds) {
    const existing = await prismaAny.equipment_requests.findFirst({
      where: { farm_id: FARM_ID, license: seed.license },
    });
    if (existing) {
      await prismaAny.equipment_requests.update({
        where: { id: existing.id },
        data: { ...seed, updated_at: new Date() },
      });
    } else {
      await prismaAny.equipment_requests.create({ data: { farm_id: FARM_ID, ...seed } });
    }
  }

  const landParcelSeeds = [
    { name: 'Cassava Trial Block', size_hectares: 6.4, crop_type: 'Cassava', soil_type: 'clay loam', location: 'Western boundary strip', status: 'active', notes: 'Expanded for varietal comparison.' },
    { name: 'Paddy South B', size_hectares: 11.8, crop_type: 'Rice', soil_type: 'silty loam', location: 'Southern lowland basin', status: 'active', notes: 'Second-cycle paddy under water control.' },
    { name: 'Feed Crop Strip', size_hectares: 4.1, crop_type: 'Sorghum', soil_type: 'loamy', location: 'Near livestock compound', status: 'active', notes: 'Dedicated to feed formulation trials.' },
  ];
  for (const seed of landParcelSeeds) {
    const existing = await prismaAny.land_parcels.findFirst({
      where: { farm_id: FARM_ID, name: seed.name, deleted_at: null },
    });
    if (existing) {
      await prismaAny.land_parcels.update({
        where: { id: existing.id },
        data: { ...seed, updated_at: new Date() },
      });
    } else {
      await prismaAny.land_parcels.create({ data: { farm_id: FARM_ID, ...seed } });
    }
  }

  const parcelRequestSeeds = [
    { name: 'East Nursery Extension', size_hectares: 2.6, soil_type: 'sandy loam', description: 'Additional protected nursery footprint.', status: 'approved', location: 'East irrigation lane' },
    { name: 'Poultry Litter Compost Lot', size_hectares: 1.9, soil_type: 'loamy', description: 'Composting and manure curing area.', status: 'pending', location: 'Behind livestock sheds' },
  ];
  for (const seed of parcelRequestSeeds) {
    const existing = await prismaAny.parcel_requests.findFirst({
      where: { farm_id: FARM_ID, name: seed.name },
    });
    if (existing) {
      await prismaAny.parcel_requests.update({
        where: { id: existing.id },
        data: { ...seed, updated_at: new Date() },
      });
    } else {
      await prismaAny.parcel_requests.create({ data: { farm_id: FARM_ID, ...seed } });
    }
  }

  const productionRequestSeeds = [
    {
      product_name: 'Broiler Starter Feed',
      quantity: 180,
      quantity_unit: 'bag',
      location: 'Feed Store A',
      order_type: 'Make-to-Stock',
      link_order: 'Internal Demand',
      status: 'accepted',
      notes: 'Feed mill blend for the next broiler cycle.',
      due_date: todayPlus(2),
      batch_number: 'BATCH-DEMO-002',
      batch_quantity: 90,
      batch_status: 'quality_check',
      sector: 'processing',
      planned_quantity: 90,
      produced_quantity: 84,
      waste_quantity: 3,
      start_date: todayMinus(2),
      expected_completion: todayPlus(1),
      actual_completion: null,
    },
    {
      product_name: 'Packaged Rice 5kg',
      quantity: 210,
      quantity_unit: 'bag',
      location: 'Finished Goods Store',
      order_type: 'Make-to-Order',
      link_order: 'SO-DEMO-003',
      status: 'pending',
      notes: 'Retail dispatch packing run for morning loading.',
      due_date: todayPlus(1),
      batch_number: 'BATCH-DEMO-003',
      batch_quantity: 120,
      batch_status: 'pending',
      sector: 'processing',
      planned_quantity: 120,
      produced_quantity: 0,
      waste_quantity: 0,
      start_date: todayPlus(0),
      expected_completion: todayPlus(1),
      actual_completion: null,
    },
    {
      product_name: 'Tilapia Harvest Pack',
      quantity: 65,
      quantity_unit: 'crate',
      location: 'Cold Room 1',
      order_type: 'Make-to-Order',
      link_order: 'SO-DEMO-006',
      status: 'accepted',
      notes: 'Harvest and grade tilapia for local wholesale demand.',
      due_date: todayPlus(4),
      batch_number: 'BATCH-DEMO-004',
      batch_quantity: 65,
      batch_status: 'in_process',
      sector: 'aquaculture',
      planned_quantity: 65,
      produced_quantity: 28,
      waste_quantity: 1,
      start_date: todayMinus(1),
      expected_completion: todayPlus(3),
      actual_completion: null,
    },
    {
      product_name: 'Cassava Chips 10kg',
      quantity: 48,
      quantity_unit: 'bag',
      location: 'Dry Goods Bay',
      order_type: 'Make-to-Stock',
      link_order: 'Warehouse Buffer',
      status: 'passed',
      notes: 'Shelf-stable processing run for wholesale bagging.',
      due_date: todayMinus(4),
      batch_number: 'BATCH-DEMO-005',
      batch_quantity: 48,
      batch_status: 'passed',
      sector: 'crop',
      planned_quantity: 48,
      produced_quantity: 44,
      waste_quantity: 2,
      start_date: todayMinus(8),
      expected_completion: todayMinus(5),
      actual_completion: todayMinus(4),
    },
    {
      product_name: 'Goat Manure Compost',
      quantity: 30,
      quantity_unit: 'bag',
      location: 'Compost Pad',
      order_type: 'Make-to-Stock',
      link_order: 'Organic Input Program',
      status: 'accepted',
      notes: 'Curing batch awaiting moisture correction and bagging.',
      due_date: todayPlus(5),
      batch_number: 'BATCH-DEMO-006',
      batch_quantity: 30,
      batch_status: 'rework',
      sector: 'livestock',
      planned_quantity: 30,
      produced_quantity: 18,
      waste_quantity: 4,
      start_date: todayMinus(6),
      expected_completion: todayPlus(2),
      actual_completion: null,
    },
    {
      product_name: 'Smoked Catfish Packs',
      quantity: 22,
      quantity_unit: 'crate',
      location: 'Processing Room 2',
      order_type: 'Make-to-Order',
      link_order: 'SO-DEMO-008',
      status: 'cancelled',
      notes: 'Rejected due to moisture and packaging seal failures.',
      due_date: todayMinus(2),
      batch_number: 'BATCH-DEMO-007',
      batch_quantity: 22,
      batch_status: 'declined',
      sector: 'aquaculture',
      planned_quantity: 22,
      produced_quantity: 10,
      waste_quantity: 6,
      start_date: todayMinus(5),
      expected_completion: todayMinus(3),
      actual_completion: todayMinus(2),
    },
  ];
  for (const seed of productionRequestSeeds) {
    let request = await prismaAny.inventory_production_requests.findFirst({
      where: { farm_id: FARM_ID, product_name: seed.product_name, location: seed.location },
    });
    if (request) {
      request = await prismaAny.inventory_production_requests.update({
        where: { id: request.id },
        data: {
          product_name: seed.product_name,
          quantity: seed.quantity,
          quantity_unit: seed.quantity_unit,
          location: seed.location,
          order_type: seed.order_type,
          link_order: seed.link_order,
          status: seed.status,
          stock_item_id: stockByName.get(seed.product_name) ?? null,
          notes: seed.notes,
          due_date: seed.due_date,
          updated_at: new Date(),
        },
      });
    } else {
      request = await prismaAny.inventory_production_requests.create({
        data: {
          farm_id: FARM_ID,
          product_name: seed.product_name,
          quantity: seed.quantity,
          quantity_unit: seed.quantity_unit,
          location: seed.location,
          order_type: seed.order_type,
          link_order: seed.link_order,
          status: seed.status,
          stock_item_id: stockByName.get(seed.product_name) ?? null,
          notes: seed.notes,
          due_date: seed.due_date,
        },
      });
    }

    const batch = await prismaAny.inventory_production_batches.findFirst({
      where: { farm_id: FARM_ID, request_id: request.id, batch_number: seed.batch_number },
    });
    if (batch) {
      await prismaAny.inventory_production_batches.update({
        where: { id: batch.id },
        data: {
          quantity: seed.batch_quantity,
          status: seed.batch_status === 'declined' ? 'failed' : seed.batch_status,
          sector: seed.sector,
          planned_quantity: seed.planned_quantity,
          produced_quantity: seed.produced_quantity,
          waste_quantity: seed.waste_quantity,
          quantity_unit: seed.quantity_unit,
          start_date: seed.start_date,
          expected_completion: seed.expected_completion,
          actual_completion: seed.actual_completion,
          failure_reason: seed.batch_status === 'declined' ? 'Moisture variance and seal quality failure.' : null,
          passed_to_inventory: seed.batch_status === 'passed',
          notes: seed.notes,
          updated_at: new Date(),
        },
      });
    } else {
      await prismaAny.inventory_production_batches.create({
        data: {
          farm_id: FARM_ID,
          request_id: request.id,
          batch_number: seed.batch_number,
          quantity: seed.batch_quantity,
          status: seed.batch_status === 'declined' ? 'failed' : seed.batch_status,
          sector: seed.sector,
          planned_quantity: seed.planned_quantity,
          produced_quantity: seed.produced_quantity,
          waste_quantity: seed.waste_quantity,
          quantity_unit: seed.quantity_unit,
          start_date: seed.start_date,
          expected_completion: seed.expected_completion,
          actual_completion: seed.actual_completion,
          failure_reason: seed.batch_status === 'declined' ? 'Moisture variance and seal quality failure.' : null,
          passed_to_inventory: seed.batch_status === 'passed',
          notes: seed.notes,
        },
      });
    }
  }

  const procurementRequestSeeds = [
    { category: 'livestock_feed', item_name: 'Broiler Finisher Feed', quantity: 180, quantity_unit: 'bag', status: 'approved' },
    { category: 'tools', item_name: 'Reusable Harvest Crates', quantity: 120, quantity_unit: 'pc', status: 'pending' },
    { category: 'chemicals', item_name: 'Copper Fungicide 5L', quantity: 18, quantity_unit: 'pc', status: 'received', manufacture_date: todayMinus(30), expiration_date: todayPlus(280), in_stock: true },
  ];
  for (const seed of procurementRequestSeeds) {
    const existing = await prismaAny.inventory_procurement_requests.findFirst({
      where: { farm_id: FARM_ID, item_name: seed.item_name },
    });
    const data = {
      category: seed.category,
      item_name: seed.item_name,
      quantity: seed.quantity,
      quantity_unit: seed.quantity_unit,
      status: seed.status,
      manufacture_date: seed.manufacture_date ?? null,
      expiration_date: seed.expiration_date ?? null,
      in_stock: seed.in_stock ?? false,
    };
    if (existing) {
      await prismaAny.inventory_procurement_requests.update({
        where: { id: existing.id },
        data: { ...data, updated_at: new Date() },
      });
    } else {
      await prismaAny.inventory_procurement_requests.create({
        data: { farm_id: FARM_ID, ...data },
      });
    }
  }

  const workOrderSeeds = [
    { work_order_number: 'WO-DEMO-001', title: 'Rice Packaging Run - Week 20', description: 'Pack and palletize finished rice for retail dispatch.', planned_start_date: todayMinus(2), planned_end_date: todayPlus(1), priority: 'high', status: 'in_progress' },
    { work_order_number: 'WO-DEMO-002', title: 'Nursery Dripline Retrofit', description: 'Replace damaged lateral lines in vegetable nursery.', planned_start_date: todayMinus(5), planned_end_date: todayMinus(1), priority: 'normal', status: 'completed' },
    { work_order_number: 'WO-DEMO-003', title: 'Pond Aeration Check', description: 'Inspect paddle-wheel aeration and electrical loads.', planned_start_date: todayPlus(1), planned_end_date: todayPlus(2), priority: 'normal', status: 'planned' },
  ];
  for (const seed of workOrderSeeds) {
    const existing = await prisma.work_orders.findFirst({
      where: { farm_id: FARM_ID, work_order_number: seed.work_order_number },
    });
    if (existing) {
      await prisma.work_orders.update({
        where: { id: existing.id },
        data: { ...seed, updated_at: new Date() } as any,
      });
    } else {
      await prisma.work_orders.create({
        data: { farm_id: FARM_ID, created_by: USERS.farmManager.userId, ...seed } as any,
      });
    }
  }

  const cropSeeds = [
    { crop_name: 'Rice', crop_type: 'Paddy', field_location: 'Paddy South B', area_planted: 11.8, planting_date: todayMinus(48), expected_harvest_date: todayPlus(34), quantity_harvested: null, unit_of_measure: 'bag', season: '2026 Wet Season', quality_grade: null, notes: 'Strong tillering observed after second nutrient application.' },
    { crop_name: 'Cassava', crop_type: 'Root Crop', field_location: 'Cassava Trial Block', area_planted: 6.4, planting_date: todayMinus(27), expected_harvest_date: todayPlus(220), quantity_harvested: null, unit_of_measure: 'tuber', season: '2026 Main Season', quality_grade: null, notes: 'Trial varieties separated by ridge number.' },
  ];
  for (const seed of cropSeeds) {
    const existing = await prismaAny.crop_production_records.findFirst({
      where: { farm_id: FARM_ID, crop_name: seed.crop_name, field_location: seed.field_location, season: seed.season, deleted_at: null },
    });
    if (existing) {
      await prismaAny.crop_production_records.update({
        where: { id: existing.id },
        data: { ...seed, updated_at: new Date() },
      });
    } else {
      await prismaAny.crop_production_records.create({
        data: { farm_id: FARM_ID, recorded_by: USERS.farmManager.userId, ...seed },
      });
    }
  }

  const aquacultureSeeds = [
    { pond_identifier: 'POND-01', species: 'Tilapia', stocking_date: todayMinus(40), initial_stock_count: 2500, current_stock_count: 2400, stocking_density: 2.5, pond_area_sqm: 1350, water_source: 'Borehole + reservoir', status: 'active', notes: 'Growth monitoring on weekly ration plan.' },
    { pond_identifier: 'POND-02', species: 'Catfish', stocking_date: todayMinus(18), initial_stock_count: 1800, current_stock_count: 1760, stocking_density: 3.0, pond_area_sqm: 960, water_source: 'Canal diversion', status: 'active', notes: 'New pond under phased feed conversion monitoring.' },
  ];
  for (const seed of aquacultureSeeds) {
    const existing = await prismaAny.aquaculture_records.findFirst({
      where: { farm_id: FARM_ID, pond_identifier: seed.pond_identifier, species: seed.species, deleted_at: null },
    });
    if (existing) {
      await prismaAny.aquaculture_records.update({
        where: { id: existing.id },
        data: { ...seed, updated_at: new Date() },
      });
    } else {
      await prismaAny.aquaculture_records.create({
        data: { farm_id: FARM_ID, recorded_by: USERS.farmManager.userId, ...seed },
      });
    }
  }

  const livestockRecordSeeds = [
    { animal_type: 'goat', breed: 'West African Dwarf', tag_id: 'LIV-GOAT-001', batch_number: null, date_acquired: todayMinus(70), acquisition_type: 'purchase', current_count: 18, status: 'active', notes: 'Managed on upland browse rotation.' },
    { animal_type: 'pig', breed: 'Large White', tag_id: 'LIV-PIG-002', batch_number: 'PIG-BATCH-A', date_acquired: todayMinus(32), acquisition_type: 'birth', current_count: 24, status: 'active', notes: 'Weaner group in Pen-02.' },
    { animal_type: 'bird', breed: 'Broiler', tag_id: 'LIV-BRD-003', batch_number: 'BROILER-W20', date_acquired: todayMinus(15), acquisition_type: 'purchase', current_count: 220, status: 'active', notes: 'Broiler cycle for June dispatch.' },
  ];
  for (const seed of livestockRecordSeeds) {
    const existing = await prismaAny.livestock_records.findFirst({
      where: { farm_id: FARM_ID, tag_id: seed.tag_id, deleted_at: null },
    });
    if (existing) {
      await prismaAny.livestock_records.update({
        where: { id: existing.id },
        data: { ...seed, updated_at: new Date() },
      });
    } else {
      await prismaAny.livestock_records.create({
        data: { farm_id: FARM_ID, recorded_by: USERS.farmManager.userId, ...seed },
      });
    }
  }

  const dailyLogSeeds = [
    { log_date: todayMinus(0), sector: 'crop', activity: 'Completed fertilizer side-dressing on maize plots', quantity: 180, unit: 'kg', stock_item_id: stockBySku.get('FERT-UREA-4600'), notes: 'North Field A and Feed Crop Strip covered.' },
    { log_date: todayMinus(0), sector: 'livestock', activity: 'Issued broiler starter feed to poultry unit', quantity: 12, unit: 'bag', stock_item_id: stockByName.get('Broiler Starter Feed'), notes: 'Feed conversion trend remains on target.' },
    { log_date: todayMinus(1), sector: 'aquaculture', activity: 'Fed tilapia ponds and checked dissolved oxygen', quantity: 8, unit: 'bag', stock_item_id: stockByName.get('Floating Fish Feed 32% Protein'), notes: 'Morning oxygen level stable after rain event.' },
    { log_date: todayMinus(1), sector: 'inventory', activity: 'Repacked finished rice for wholesale dispatch', quantity: 30, unit: 'bag', stock_item_id: stockBySku.get('RICE-FG-5KG'), notes: 'Prepared for Sunrise Community Stores.' },
    { log_date: todayMinus(2), sector: 'crop', activity: 'Marked cassava trial ridges and irrigation channels', quantity: 6.4, unit: 'ha', stock_item_id: null, notes: 'Field crew completed first-pass layout.' },
    { log_date: todayMinus(3), sector: 'machinery', activity: 'Serviced backup irrigation pump and trailer hitch', quantity: null, unit: null, stock_item_id: null, notes: 'Preventive maintenance before high-demand week.' },
  ];
  for (const seed of dailyLogSeeds) {
    const existing = await prisma.daily_production_logs.findFirst({
      where: {
        farm_id: FARM_ID,
        log_date: seed.log_date,
        sector: seed.sector,
        activity: seed.activity,
      },
    });
    if (!existing) {
      await prisma.daily_production_logs.create({
        data: {
          farm_id: FARM_ID,
          logged_by: USERS.farmManager.userId,
          ...seed,
        } as any,
      });
    }
  }

  const reportDefinitions = [
    {
      name: 'Weekly Operations Summary',
      report_type: 'summary',
      module: 'production',
      query_config: { source: 'daily_production_logs', groupBy: ['sector'], windowDays: 7 },
      is_system: true,
    },
    {
      name: 'Livestock Population Snapshot',
      report_type: 'inventory',
      module: 'livestock',
      query_config: { source: 'livestock_records', includeMortality: true },
      is_system: true,
    },
    {
      name: 'Procurement Pipeline Overview',
      report_type: 'pipeline',
      module: 'procurement',
      query_config: { source: 'purchase_orders', statuses: ['draft', 'submitted', 'approved', 'received'] },
      is_system: true,
    },
  ];

  const reportDefinitionIds = new Map<string, string>();
  for (const seed of reportDefinitions) {
    const existing = await prisma.report_definitions.findFirst({
      where: { name: seed.name, module: seed.module },
    });
    const report = existing
      ? await prisma.report_definitions.update({
          where: { id: existing.id },
          data: { ...seed, updated_at: new Date() } as any,
        })
      : await prisma.report_definitions.create({
          data: { created_by: USERS.superAdmin.userId, ...seed } as any,
        });
    reportDefinitionIds.set(seed.name, report.id);
  }

  const reportRuns = [
    { report_name: 'Weekly Operations Summary', status: 'completed', result_row_count: 6, file_url: '/reports/weekly-operations-summary.csv', started_at: todayMinus(1), completed_at: todayMinus(1), parameters: { dateFrom: todayMinus(7).toISOString().slice(0, 10), dateTo: new Date().toISOString().slice(0, 10) } },
    { report_name: 'Livestock Population Snapshot', status: 'completed', result_row_count: 5, file_url: '/reports/livestock-population-snapshot.csv', started_at: todayMinus(2), completed_at: todayMinus(2), parameters: { includeMortality: true } },
    { report_name: 'Procurement Pipeline Overview', status: 'completed', result_row_count: 8, file_url: '/reports/procurement-pipeline-overview.csv', started_at: todayMinus(0), completed_at: todayMinus(0), parameters: { includeApproved: true } },
  ];

  for (const seed of reportRuns) {
    const reportDefinitionId = reportDefinitionIds.get(seed.report_name);
    if (!reportDefinitionId) continue;
    const existing = await prisma.report_runs.findFirst({
      where: {
        report_definition_id: reportDefinitionId,
        status: seed.status,
        file_url: seed.file_url,
      },
    });
    if (existing) {
      await prisma.report_runs.update({
        where: { id: existing.id },
        data: {
          run_by: USERS.superAdmin.userId,
          parameters: seed.parameters as any,
          result_row_count: seed.result_row_count,
          started_at: seed.started_at,
          completed_at: seed.completed_at,
        } as any,
      });
    } else {
      await prisma.report_runs.create({
        data: {
          report_definition_id: reportDefinitionId,
          run_by: USERS.superAdmin.userId,
          parameters: seed.parameters as any,
          status: seed.status,
          result_row_count: seed.result_row_count,
          file_url: seed.file_url,
          started_at: seed.started_at,
          completed_at: seed.completed_at,
        } as any,
      });
    }
  }
}

async function ensureSalesCommandCenter() {
  const customerRows = await prisma.customers.findMany({
    where: { farm_id: FARM_ID, deleted_at: null },
    select: { id: true, name: true },
  });
  const customerMap = new Map(customerRows.map((customer) => [customer.name, customer.id]));

  const stockItems = await prisma.stock_items.findMany({
    where: { farm_id: FARM_ID, deleted_at: null },
    select: { id: true, sku: true, name: true },
  });
  const stockBySku = new Map(stockItems.map((item) => [item.sku ?? '', item]));

  const contractSeeds = [
    {
      contract_number: 'AGR-CON-001',
      customer_name: 'Atlantic Export Traders',
      contract_type: 'supply',
      start_date: todayMinus(60),
      end_date: todayPlus(120),
      total_value: 18500,
      status: 'active',
      terms: 'Quarterly packaged rice and maize seed fulfillment.',
    },
    {
      contract_number: 'AGR-CON-002',
      customer_name: 'Harvest Foods Market',
      contract_type: 'supply',
      start_date: todayMinus(20),
      end_date: todayPlus(90),
      total_value: 9200,
      status: 'active',
      terms: 'Retail staple replenishment with staged dispatches.',
    },
  ];

  for (const seed of contractSeeds) {
    const customerId = customerMap.get(seed.customer_name);
    if (!customerId) continue;

    const existing = await prisma.contracts.findFirst({
      where: { farm_id: FARM_ID, contract_number: seed.contract_number },
    });

    if (existing) {
      await prisma.contracts.update({
        where: { id: existing.id },
        data: {
          customer_id: customerId,
          contract_type: seed.contract_type,
          start_date: seed.start_date,
          end_date: seed.end_date,
          total_value: seed.total_value,
          status: seed.status,
          terms: seed.terms,
          updated_at: new Date(),
        } as any,
      });
    } else {
      await prisma.contracts.create({
        data: {
          farm_id: FARM_ID,
          customer_id: customerId,
          created_by: USERS.salesOfficer.userId,
          contract_number: seed.contract_number,
          contract_type: seed.contract_type,
          start_date: seed.start_date,
          end_date: seed.end_date,
          total_value: seed.total_value,
          status: seed.status,
          terms: seed.terms,
        } as any,
      });
    }
  }

  const salesOrders = [
    {
      order_number: 'SO-DEMO-001',
      customer_name: 'Harvest Foods Market',
      status: 'delivered',
      payment_status: 'paid',
      order_date: todayMinus(21),
      delivery_date: todayMinus(16),
      subtotal: 2400,
      tax_amount: 120,
      total_amount: 2520,
      notes: '[[type:direct_sale]] Packaged rice delivery completed for retail chain.',
      item: { stock_item_id: stockBySku.get('RICE-FG-5KG')?.id, quantity: 60, unit_price: 42, line_total: 2520 },
    },
    {
      order_number: 'SO-DEMO-002',
      customer_name: 'Atlantic Export Traders',
      status: 'confirmed',
      payment_status: 'unpaid',
      order_date: todayMinus(12),
      delivery_date: todayPlus(4),
      subtotal: 860,
      tax_amount: 0,
      total_amount: 860,
      notes: '[[type:production_order]] Fertilizer order in production queue.',
      item: { stock_item_id: stockBySku.get('FERT-UREA-4600')?.id, quantity: 100, unit_price: 8.6, line_total: 860 },
    },
    {
      order_number: 'SO-DEMO-003',
      customer_name: 'Sunrise Community Stores',
      status: 'packed',
      payment_status: 'paid',
      order_date: todayMinus(7),
      delivery_date: todayPlus(1),
      subtotal: 1296,
      tax_amount: 64.8,
      total_amount: 1360.8,
      notes: '[[type:direct_sale]] Rice restock queued for morning dispatch.',
      item: { stock_item_id: stockBySku.get('RICE-FG-5KG')?.id, quantity: 24, unit_price: 54, line_total: 1296 },
    },
    {
      order_number: 'SO-DEMO-004',
      customer_name: 'Green Plate Restaurants',
      status: 'confirmed',
      payment_status: 'partial',
      order_date: todayMinus(4),
      delivery_date: todayPlus(2),
      subtotal: 540,
      tax_amount: 0,
      total_amount: 540,
      notes: '[[type:production_order]] Seed order bundled with agronomy support request.',
      item: { stock_item_id: stockBySku.get('SEED-MAIZE-350')?.id, quantity: 10, unit_price: 54, line_total: 540 },
    },
    {
      order_number: 'SO-DEMO-005',
      customer_name: 'River Port Commodities',
      status: 'delivered',
      payment_status: 'paid',
      order_date: todayMinus(16),
      delivery_date: todayMinus(10),
      subtotal: 1720,
      tax_amount: 0,
      total_amount: 1720,
      notes: '[[type:contract]] Contract AGR-CON-001 bulk fertilizer dispatch completed.',
      item: { stock_item_id: stockBySku.get('FERT-UREA-4600')?.id, quantity: 200, unit_price: 8.6, line_total: 1720 },
    },
    {
      order_number: 'SO-DEMO-006',
      customer_name: 'Harvest Foods Market',
      status: 'pending',
      payment_status: 'unpaid',
      order_date: todayMinus(1),
      delivery_date: todayPlus(6),
      subtotal: 1320,
      tax_amount: 0,
      total_amount: 1320,
      notes: '[[type:direct_sale]] Mixed feed and rice order awaiting approval.',
      items: [
        { stock_item_id: stockBySku.get('RICE-FG-5KG')?.id, quantity: 20, unit_price: 42, line_total: 840 },
        { stock_item_id: stockBySku.get('FEED-FISH-32')?.id, quantity: 20, unit_price: 24, line_total: 480 },
      ],
    },
    {
      order_number: 'SO-DEMO-007',
      customer_name: 'Demo Customer',
      status: 'dispatched',
      payment_status: 'partial',
      order_date: todayMinus(3),
      delivery_date: todayPlus(1),
      subtotal: 342,
      tax_amount: 0,
      total_amount: 342,
      notes: '[[type:direct_sale]] Harvest crate and packaging dispatch in transit.',
      item: { stock_item_id: stockBySku.get('TOOLS-CRATE-2026')?.id, quantity: 38, unit_price: 9, line_total: 342 },
    },
    {
      order_number: 'SO-DEMO-008',
      customer_name: 'Atlantic Export Traders',
      status: 'cancelled',
      payment_status: 'unpaid',
      order_date: todayMinus(2),
      delivery_date: todayPlus(7),
      subtotal: 702,
      tax_amount: 0,
      total_amount: 702,
      notes: '[[type:contract]] Contract AGR-CON-001 fungicide order cancelled after spec change.',
      item: { stock_item_id: stockBySku.get('CHEM-COPPER-5L')?.id, quantity: 18, unit_price: 39, line_total: 702 },
    },
  ];

  for (const order of salesOrders) {
    const customerId = customerMap.get(order.customer_name);
    if (!customerId) continue;

    let existing = await prisma.sales_orders.findFirst({
      where: { farm_id: FARM_ID, order_number: order.order_number },
    });

    if (existing) {
      existing = await prisma.sales_orders.update({
        where: { id: existing.id },
        data: {
          customer_id: customerId,
          updated_by: USERS.salesOfficer.userId,
          order_date: order.order_date,
          delivery_date: order.delivery_date,
          status: order.status,
          payment_status: order.payment_status,
          subtotal: order.subtotal,
          tax_amount: order.tax_amount,
          total_amount: order.total_amount,
          notes: order.notes,
        },
      });
    } else {
      existing = await prisma.sales_orders.create({
        data: {
          farm_id: FARM_ID,
          customer_id: customerId,
          created_by: USERS.salesOfficer.userId,
          updated_by: USERS.salesOfficer.userId,
          order_number: order.order_number,
          order_date: order.order_date,
          delivery_date: order.delivery_date,
          status: order.status,
          payment_status: order.payment_status,
          subtotal: order.subtotal,
          tax_amount: order.tax_amount,
          total_amount: order.total_amount,
          notes: order.notes,
        },
      });
    }

    const items = 'items' in order ? order.items : [order.item];
    for (const item of items) {
      if (!item?.stock_item_id) continue;
      const existingItem = await prisma.sales_order_items.findFirst({
        where: { sales_order_id: existing.id, stock_item_id: item.stock_item_id },
      });

      if (existingItem) {
        await prisma.sales_order_items.update({
          where: { id: existingItem.id },
          data: {
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
          },
        });
      } else {
        await prisma.sales_order_items.create({
          data: {
            sales_order_id: existing.id,
            stock_item_id: item.stock_item_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
          },
        });
      }
    }
  }

  const distributionSeeds = [
    {
      order_number: 'SO-DEMO-001',
      dispatch_date: todayMinus(17),
      delivery_status: 'delivered',
      destination: 'Paynesville wholesale market',
      driver_name: 'Samuel Dixon',
      vehicle_ref: 'TRK-01',
      recipient_name: 'Harvest Foods Receiving',
      notes: 'Rice pallets delivered in full with signed receipt.',
    },
    {
      order_number: 'SO-DEMO-003',
      dispatch_date: todayMinus(1),
      delivery_status: 'ready_for_dispatch',
      destination: 'Benson Street retail cluster',
      driver_name: 'Martha Dennis',
      vehicle_ref: 'VAN-03',
      recipient_name: 'Sunrise Store Dispatch Desk',
      notes: 'Loaded and staged for first-run route.',
    },
    {
      order_number: 'SO-DEMO-005',
      dispatch_date: todayMinus(10),
      delivery_status: 'delivered',
      destination: 'Port logistics enclave',
      driver_name: 'Peter Sumo',
      vehicle_ref: 'TRK-02',
      recipient_name: 'River Port Receiving Team',
      notes: 'Bulk fertilizer delivered under contract AGR-CON-001.',
    },
    {
      order_number: 'SO-DEMO-007',
      dispatch_date: todayMinus(0),
      delivery_status: 'in_transit',
      destination: 'Monrovia retail district',
      driver_name: 'Internal Dispatch Team',
      vehicle_ref: 'AMIS-DELIVERY',
      recipient_name: 'Demo Customer',
      notes: 'Crates and packaging accessories on active route.',
    },
  ];

  for (const seed of distributionSeeds) {
    const order = await prisma.sales_orders.findFirst({
      where: { farm_id: FARM_ID, order_number: seed.order_number },
    });
    if (!order) continue;

    const existing = await prisma.distribution_logs.findFirst({
      where: { sales_order_id: order.id, notes: seed.notes },
    });

    if (existing) {
      await prisma.distribution_logs.update({
        where: { id: existing.id },
        data: {
          dispatch_date: seed.dispatch_date,
          delivery_status: seed.delivery_status,
          destination: seed.destination,
          driver_name: seed.driver_name,
          vehicle_ref: seed.vehicle_ref,
          recipient_name: seed.recipient_name,
          notes: seed.notes,
        },
      });
    } else {
      await prisma.distribution_logs.create({
        data: {
          sales_order_id: order.id,
          dispatched_by: USERS.salesOfficer.userId,
          dispatch_date: seed.dispatch_date,
          delivery_status: seed.delivery_status,
          destination: seed.destination,
          driver_name: seed.driver_name,
          vehicle_ref: seed.vehicle_ref,
          recipient_name: seed.recipient_name,
          notes: seed.notes,
        },
      });
    }
  }

  const productionSalesLinks = [
    { order_number: 'SO-DEMO-003', product_name: 'Packaged Rice 5kg', batch_number: 'BATCH-DEMO-003' },
    { order_number: 'SO-DEMO-006', product_name: 'Tilapia Harvest Pack', batch_number: 'BATCH-DEMO-004' },
    { order_number: 'SO-DEMO-008', product_name: 'Smoked Catfish Packs', batch_number: 'BATCH-DEMO-007' },
  ];

  for (const link of productionSalesLinks) {
    const order = await prisma.sales_orders.findFirst({
      where: { farm_id: FARM_ID, order_number: link.order_number },
    });
    const request = await prismaAny.inventory_production_requests.findFirst({
      where: { farm_id: FARM_ID, product_name: link.product_name },
    });
    const batch = await prismaAny.inventory_production_batches.findFirst({
      where: { farm_id: FARM_ID, batch_number: link.batch_number },
    });

    if (order && request) {
      await prismaAny.inventory_production_requests.update({
        where: { id: request.id },
        data: {
          sales_order_id: order.id,
          link_order: order.order_number,
          updated_at: new Date(),
        },
      });
    }

    if (order && batch) {
      await prismaAny.inventory_production_batches.update({
        where: { id: batch.id },
        data: {
          linked_sales_order_id: order.id,
          updated_at: new Date(),
        },
      });
    }
  }

  const productionConsumptionSeeds = [
    { batch_number: 'BATCH-DEMO-002', item_id: stockBySku.get('SEED-MAIZE-350')?.id, quantity: 6, notes: 'Premix additive lot consumed during feed blending.' },
    { batch_number: 'BATCH-DEMO-002', item_id: stockBySku.get('FERT-UREA-4600')?.id, quantity: 2, notes: 'Nutrient fortification consumed in feed mill trial.' },
    { batch_number: 'BATCH-DEMO-003', item_id: stockBySku.get('TOOLS-CRATE-2026')?.id, quantity: 14, notes: 'Packaging crates issued for bagged rice staging.' },
    { batch_number: 'BATCH-DEMO-004', item_id: stockBySku.get('FEED-FISH-32')?.id, quantity: 10, notes: 'Floating feed issued before harvest grading.' },
    { batch_number: 'BATCH-DEMO-005', item_id: stockBySku.get('SEED-MAIZE-350')?.id, quantity: 4, notes: 'Drying trays and seed-grade liners allocated to cassava line.' },
    { batch_number: 'BATCH-DEMO-006', item_id: stockBySku.get('FERT-UREA-4600')?.id, quantity: 3, notes: 'Nitrogen activator used during compost remediation.' },
  ];

  for (const seed of productionConsumptionSeeds) {
    if (!seed.item_id) continue;
    const batch = await prismaAny.inventory_production_batches.findFirst({
      where: { farm_id: FARM_ID, batch_number: seed.batch_number },
    });
    if (!batch) continue;

    const existing = await prisma.stock_transactions.findFirst({
      where: {
        reference_id: batch.id,
        stock_item_id: seed.item_id,
        transaction_type: 'production_consumption',
        notes: seed.notes,
      },
    });
    if (existing) continue;

    const stockItem = await prisma.stock_items.findUnique({ where: { id: seed.item_id } });
    if (!stockItem) continue;

    const before = Number(stockItem.current_quantity);
    const after = Math.max(before - seed.quantity, 0);

    await prisma.stock_transactions.create({
      data: {
        stock_item_id: seed.item_id,
        performed_by: USERS.farmManager.userId,
        transaction_type: 'production_consumption',
        quantity: seed.quantity,
        quantity_before: before,
        quantity_after: after,
        reference_id: batch.id,
        reference_table: 'inventory_production_batches',
        source_module: 'production',
        notes: seed.notes,
      },
    });

    await prisma.stock_items.update({
      where: { id: seed.item_id },
      data: { current_quantity: after, updated_at: new Date() },
    });
  }

  const productionOutputSeeds = [
    { batch_number: 'BATCH-DEMO-001', product_name: 'Packaged Rice 5kg', quantity: 180, date: todayMinus(12), notes: 'Finished output posted from legacy packaged rice run.' },
    { batch_number: 'BATCH-DEMO-005', product_name: 'Cassava Chips 10kg', quantity: 44, date: todayMinus(4), notes: 'Finished output posted from cassava processing line.' },
  ];

  for (const seed of productionOutputSeeds) {
    const batch = await prismaAny.inventory_production_batches.findFirst({
      where: { farm_id: FARM_ID, batch_number: seed.batch_number },
      include: { inventory_production_requests: true },
    });
    if (!batch) continue;

    let stockItem = await prisma.stock_items.findFirst({
      where: { farm_id: FARM_ID, deleted_at: null, name: seed.product_name },
    });
    if (!stockItem) {
      let category = await prisma.item_categories.findFirst({
        where: { name: { equals: 'finished goods', mode: 'insensitive' }, deleted_at: null },
      });
      if (!category) {
        category = await prisma.item_categories.create({
          data: { name: 'finished goods', type: 'product' },
        });
      }
      stockItem = await prisma.stock_items.create({
        data: {
          farm_id: FARM_ID,
          category_id: category.id,
          name: seed.product_name,
          unit_of_measure: batch.quantity_unit ?? batch.inventory_production_requests?.quantity_unit ?? 'bag',
          current_quantity: 0,
          reorder_threshold: 0,
          storage_location: batch.inventory_production_requests?.location ?? null,
        },
      });
    }

    const existing = await prisma.stock_transactions.findFirst({
      where: {
        reference_id: batch.id,
        stock_item_id: stockItem.id,
        transaction_type: 'production_output',
      },
    });
    if (existing) continue;

    const before = Number(stockItem.current_quantity);
    const after = before + seed.quantity;

    await prisma.stock_transactions.create({
      data: {
        stock_item_id: stockItem.id,
        performed_by: USERS.farmManager.userId,
        transaction_type: 'production_output',
        quantity: seed.quantity,
        quantity_before: before,
        quantity_after: after,
        reference_id: batch.id,
        reference_table: 'inventory_production_batches',
        source_module: 'production',
        notes: seed.notes,
        transacted_at: seed.date,
      },
    });

    await prisma.stock_items.update({
      where: { id: stockItem.id },
      data: { current_quantity: after, updated_at: new Date() },
    });

    if (batch.inventory_production_requests?.id) {
      await prismaAny.inventory_production_requests.update({
        where: { id: batch.inventory_production_requests.id },
        data: { stock_item_id: stockItem.id, updated_at: new Date() },
      });
    }
  }

  const productionQualitySeeds = [
    { batch_number: 'BATCH-DEMO-001', result: 'passed', notes: 'Packaging weight and seal integrity cleared.', date: todayMinus(12) },
    { batch_number: 'BATCH-DEMO-002', result: 'passed', notes: 'Granule consistency cleared for dispatch staging.', date: todayMinus(1) },
    { batch_number: 'BATCH-DEMO-006', result: 'rework', notes: 'Moisture profile above threshold. Return to curing pad.', date: todayMinus(1) },
    { batch_number: 'BATCH-DEMO-007', result: 'failed', notes: 'Smoke density and seal failure triggered rejection.', date: todayMinus(2) },
  ];

  for (const seed of productionQualitySeeds) {
    const batch = await prismaAny.inventory_production_batches.findFirst({
      where: { farm_id: FARM_ID, batch_number: seed.batch_number },
      include: { inventory_production_requests: true },
    });
    if (!batch) continue;

    const existing = await prisma.quality_checks.findFirst({
      where: {
        farm_id: FARM_ID,
        notes: seed.notes,
      },
    });
    if (existing) continue;

    await prisma.quality_checks.create({
      data: {
        farm_id: FARM_ID,
        checked_by: USERS.farmManager.userId,
        check_date: seed.date,
        grade: seed.result === 'passed' ? 'A' : seed.result === 'rework' ? 'B' : 'C',
        passed: seed.result === 'passed',
        notes: seed.notes,
        stock_item_id: batch.inventory_production_requests?.stock_item_id ?? null,
        sales_order_id: batch.linked_sales_order_id ?? batch.inventory_production_requests?.sales_order_id ?? null,
        parameters: {
          batchId: batch.id,
          batchNumber: batch.batch_number,
          productName: batch.inventory_production_requests?.product_name ?? seed.batch_number,
          result: seed.result,
          producedQuantity: Number(batch.produced_quantity ?? 0),
          wasteQuantity: Number(batch.waste_quantity ?? 0),
        },
      } as any,
    });
  }
}

async function ensureLivestock() {
  await prisma.$executeRawUnsafe(`
    INSERT INTO pigs (farm_id, pig_id, breed, gender, status, pen_number, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'PIG-1001', 'Large White', 'female', 'healthy', 'Pen-01', CURRENT_DATE, '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM pigs WHERE farm_id = '${FARM_ID}'::uuid AND pig_id = 'PIG-1001' AND deleted_at IS NULL)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO cattle (farm_id, cattle_id, cattle_type, status, location, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'CAT-2001', 'cow', 'healthy', 'Pasture A', CURRENT_DATE, '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM cattle WHERE farm_id = '${FARM_ID}'::uuid AND cattle_id = 'CAT-2001' AND deleted_at IS NULL)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO birds (farm_id, bird_type, batch_number, number_of_birds, number_of_female, number_of_male, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'chicken', 'BRD-3001', 180, 120, 60, CURRENT_DATE, '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM birds WHERE farm_id = '${FARM_ID}'::uuid AND batch_number = 'BRD-3001' AND deleted_at IS NULL)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO fish_ponds (farm_id, pond_id, length_m, width_m, location, capacity, current_fish_count, status, created_by)
    SELECT '${FARM_ID}'::uuid, 'POND-01', 45, 30, 'Eastern aquaculture block', 5000, 0, 'available', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM fish_ponds WHERE farm_id = '${FARM_ID}'::uuid AND pond_id = 'POND-01' AND deleted_at IS NULL)
  `);

  const pond = await prismaAny.fish_ponds.findFirst({
    where: { farm_id: FARM_ID, pond_id: 'POND-01', deleted_at: null },
  });

  if (pond) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO fish_stock (farm_id, pond_id, fish_type, batch_number, number_of_fish, date_recorded, created_by)
      SELECT '${FARM_ID}'::uuid, '${pond.id}'::uuid, 'Tilapia', 'FISH-4001', 2400, CURRENT_DATE, '${USERS.farmManager.userId}'::uuid
      WHERE NOT EXISTS (SELECT 1 FROM fish_stock WHERE farm_id = '${FARM_ID}'::uuid AND batch_number = 'FISH-4001' AND deleted_at IS NULL)
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE fish_ponds
      SET current_fish_count = 2400, status = 'available', updated_at = NOW()
      WHERE id = '${pond.id}'::uuid
    `);
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO mortality_records (farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'bird', 'chicken', 'BRD-LOSS-001', 'Brooder House 2', 'Heat stress during transit', CURRENT_DATE - INTERVAL '3 days', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM mortality_records WHERE farm_id = '${FARM_ID}'::uuid AND record_id = 'BRD-LOSS-001')
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO pigs (farm_id, pig_id, breed, gender, status, pen_number, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'PIG-1002', 'Landrace', 'male', 'healthy', 'Pen-02', CURRENT_DATE - INTERVAL '9 days', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM pigs WHERE farm_id = '${FARM_ID}'::uuid AND pig_id = 'PIG-1002' AND deleted_at IS NULL)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO pigs (farm_id, pig_id, breed, gender, status, pen_number, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'PIG-1003', 'Duroc Cross', 'female', 'quarantine', 'Pen-03', CURRENT_DATE - INTERVAL '4 days', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM pigs WHERE farm_id = '${FARM_ID}'::uuid AND pig_id = 'PIG-1003' AND deleted_at IS NULL)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO cattle (farm_id, cattle_id, cattle_type, status, location, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'CAT-2002', 'bull', 'healthy', 'Pasture B', CURRENT_DATE - INTERVAL '15 days', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM cattle WHERE farm_id = '${FARM_ID}'::uuid AND cattle_id = 'CAT-2002' AND deleted_at IS NULL)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO cattle (farm_id, cattle_id, cattle_type, status, location, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'CAT-2003', 'heifer', 'healthy', 'Holding Pen 1', CURRENT_DATE - INTERVAL '6 days', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM cattle WHERE farm_id = '${FARM_ID}'::uuid AND cattle_id = 'CAT-2003' AND deleted_at IS NULL)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO birds (farm_id, bird_type, batch_number, number_of_birds, number_of_female, number_of_male, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'chicken', 'BRD-3002', 220, 0, 0, CURRENT_DATE - INTERVAL '14 days', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM birds WHERE farm_id = '${FARM_ID}'::uuid AND batch_number = 'BRD-3002' AND deleted_at IS NULL)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO birds (farm_id, bird_type, batch_number, number_of_birds, number_of_female, number_of_male, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'turkey', 'BRD-3003', 48, 30, 18, CURRENT_DATE - INTERVAL '22 days', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM birds WHERE farm_id = '${FARM_ID}'::uuid AND batch_number = 'BRD-3003' AND deleted_at IS NULL)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO fish_ponds (farm_id, pond_id, length_m, width_m, location, capacity, current_fish_count, status, created_by)
    SELECT '${FARM_ID}'::uuid, 'POND-02', 32, 30, 'Northern aquaculture block', 3200, 1760, 'available', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM fish_ponds WHERE farm_id = '${FARM_ID}'::uuid AND pond_id = 'POND-02' AND deleted_at IS NULL)
  `);

  const pondTwo = await prismaAny.fish_ponds.findFirst({
    where: { farm_id: FARM_ID, pond_id: 'POND-02', deleted_at: null },
  });
  if (pondTwo) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO fish_stock (farm_id, pond_id, fish_type, batch_number, number_of_fish, date_recorded, created_by)
      SELECT '${FARM_ID}'::uuid, '${pondTwo.id}'::uuid, 'Catfish', 'FISH-4002', 1760, CURRENT_DATE - INTERVAL '18 days', '${USERS.farmManager.userId}'::uuid
      WHERE NOT EXISTS (SELECT 1 FROM fish_stock WHERE farm_id = '${FARM_ID}'::uuid AND batch_number = 'FISH-4002' AND deleted_at IS NULL)
    `);
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO mortality_records (farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'pig', 'Duroc Cross', 'PIG-LOSS-001', 'Pen-03', 'Respiratory infection during quarantine', CURRENT_DATE - INTERVAL '2 days', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM mortality_records WHERE farm_id = '${FARM_ID}'::uuid AND record_id = 'PIG-LOSS-001')
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO mortality_records (farm_id, livestock_type, breed_or_type, record_id, pen_or_location, cause_of_death, date_recorded, created_by)
    SELECT '${FARM_ID}'::uuid, 'fish', 'Catfish', 'FISH-LOSS-001', 'POND-02', 'Handling stress during grading', CURRENT_DATE - INTERVAL '5 days', '${USERS.farmManager.userId}'::uuid
    WHERE NOT EXISTS (SELECT 1 FROM mortality_records WHERE farm_id = '${FARM_ID}'::uuid AND record_id = 'FISH-LOSS-001')
  `);
}

async function ensureFrontendTables() {
  const statements = [
    `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
    `
      CREATE OR REPLACE FUNCTION public.update_updated_at()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$
    `,
    `
      CREATE TABLE IF NOT EXISTS public.inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity INTEGER DEFAULT 0,
        unit TEXT,
        min_stock_level INTEGER DEFAULT 0,
        location TEXT,
        expiry_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        reserved_quantity INTEGER DEFAULT 0,
        unit_cost DECIMAL(12, 2) DEFAULT 0,
        supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
        batch_no TEXT,
        quality_status TEXT DEFAULT 'available'
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS public.procurement (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_number TEXT,
        po_number TEXT,
        item_name TEXT NOT NULL,
        category TEXT DEFAULT 'supplies',
        unit TEXT,
        supplier TEXT,
        quantity INTEGER DEFAULT 0,
        received_quantity INTEGER DEFAULT 0,
        unit_price DECIMAL(10, 2),
        total_cost DECIMAL(12, 2),
        status TEXT DEFAULT 'pending',
        expected_date DATE,
        approved_at TIMESTAMPTZ,
        rejection_reason TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        inventory_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
        supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
        received_at TIMESTAMPTZ
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS public.inventory_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE NOT NULL,
        movement_type TEXT NOT NULL CHECK (movement_type IN ('received', 'dispatched', 'adjusted', 'reserved', 'released', 'damaged', 'expired')),
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        unit_cost DECIMAL(12, 2),
        source_module TEXT,
        reference_id UUID,
        movement_date TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT,
        created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_inventory_supplier_id ON public.inventory(supplier_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_quality_status ON public.inventory(quality_status)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_movements_inventory_id ON public.inventory_movements(inventory_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_movements_type_date ON public.inventory_movements(movement_type, movement_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_procurement_inventory_id ON public.procurement(inventory_id)`,
    `CREATE INDEX IF NOT EXISTS idx_procurement_supplier_id ON public.procurement(supplier_id)`,
    `ALTER TABLE public.procurement ADD COLUMN IF NOT EXISTS request_number TEXT`,
    `ALTER TABLE public.procurement ADD COLUMN IF NOT EXISTS po_number TEXT`,
    `ALTER TABLE public.procurement ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'supplies'`,
    `ALTER TABLE public.procurement ADD COLUMN IF NOT EXISTS unit TEXT`,
    `ALTER TABLE public.procurement ADD COLUMN IF NOT EXISTS received_quantity INTEGER DEFAULT 0`,
    `ALTER TABLE public.procurement ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
    `ALTER TABLE public.procurement ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
    `DROP TRIGGER IF EXISTS update_inventory_updated_at ON public.inventory`,
    `CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()`,
    `DROP TRIGGER IF EXISTS update_procurement_updated_at ON public.procurement`,
    `CREATE TRIGGER update_procurement_updated_at BEFORE UPDATE ON public.procurement FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()`,
    `DROP TRIGGER IF EXISTS update_suppliers_updated_at ON public.suppliers`,
    `CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()`,
    `ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.procurement DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.inventory_movements DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.suppliers DISABLE ROW LEVEL SECURITY`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO anon, authenticated, service_role`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement TO anon, authenticated, service_role`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO anon, authenticated, service_role`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO anon, authenticated, service_role`,
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function ensureFrontendShowcaseData() {
  const supplierMap = new Map<string, string>();
  const suppliers = await prisma.suppliers.findMany({
    where: { farm_id: FARM_ID, deleted_at: null },
    select: { id: true, name: true },
  });
  for (const supplier of suppliers) supplierMap.set(supplier.name, supplier.id);

  const inventoryRows = [
    {
      item_name: 'Hybrid Maize Seed - FAO 350',
      category: 'seeds',
      quantity: 420,
      unit: 'bags',
      min_stock_level: 180,
      location: 'Seed Store A',
      expiry_date: todayPlus(320),
      notes: 'Certified hybrid seed reserved for spring planting blocks.',
      reserved_quantity: 75,
      unit_cost: 48.5,
      supplier_id: supplierMap.get('GreenSeed Agro Supply') ?? null,
      batch_no: 'SEED-MZ-2026-A',
      quality_status: 'available',
    },
    {
      item_name: 'Urea Fertilizer 46-0-0',
      category: 'fertilizer',
      quantity: 1200,
      unit: 'kg',
      min_stock_level: 500,
      location: 'Fertilizer Shed 1',
      notes: 'Nitrogen fertilizer allocated to maize and vegetable plots.',
      reserved_quantity: 350,
      unit_cost: 0.62,
      supplier_id: supplierMap.get('AgroChem Inputs Ltd') ?? null,
      batch_no: 'FERT-UREA-APR26',
      quality_status: 'available',
    },
    {
      item_name: 'Floating Fish Feed 32% Protein',
      category: 'fish_feed',
      quantity: 180,
      unit: 'bags',
      min_stock_level: 220,
      location: 'Feed Store B',
      expiry_date: todayPlus(28),
      notes: 'Expiring soon; prioritize current pond cycle.',
      reserved_quantity: 45,
      unit_cost: 22,
      supplier_id: supplierMap.get('FeedWorks Cooperative') ?? null,
      batch_no: 'AQUA-FEED-0426',
      quality_status: 'available',
    },
    {
      item_name: 'Broiler Starter Feed',
      category: 'livestock_feed',
      quantity: 95,
      unit: 'bags',
      min_stock_level: 160,
      location: 'Feed Store A',
      expiry_date: todayPlus(75),
      notes: 'Low stock for next poultry batch.',
      reserved_quantity: 30,
      unit_cost: 18.25,
      supplier_id: supplierMap.get('FeedWorks Cooperative') ?? null,
      batch_no: 'BROIL-ST-2026-04',
      quality_status: 'available',
    },
    {
      item_name: 'Copper Fungicide 5L',
      category: 'chemicals',
      quantity: 42,
      unit: 'canisters',
      min_stock_level: 30,
      location: 'Chemical Store',
      expiry_date: todayPlus(19),
      notes: 'On quality hold pending label and seal inspection.',
      reserved_quantity: 0,
      unit_cost: 31.8,
      supplier_id: supplierMap.get('AgroChem Inputs Ltd') ?? null,
      batch_no: 'CHEM-COP-EXP26',
      quality_status: 'quarantine',
    },
    {
      item_name: 'Packaged Rice 5kg',
      category: 'finished_goods',
      quantity: 310,
      unit: 'bags',
      min_stock_level: 140,
      location: 'Finished Goods Store',
      expiry_date: todayPlus(540),
      notes: 'Finished goods reserved for confirmed customer orders.',
      reserved_quantity: 95,
      unit_cost: 4.2,
      supplier_id: null,
      batch_no: 'FG-RICE-5KG-26A',
      quality_status: 'available',
    },
    {
      item_name: 'Reusable Harvest Crates',
      category: 'tools',
      quantity: 55,
      unit: 'pcs',
      min_stock_level: 80,
      location: 'Packing Shed',
      notes: 'Damaged and short against harvest requirement; replace before next field pick.',
      reserved_quantity: 0,
      unit_cost: 6.75,
      supplier_id: supplierMap.get('FarmParts Service Center') ?? null,
      batch_no: 'TOOLS-CRATE-2026',
      quality_status: 'damaged',
    },
    {
      item_name: 'NPK Fertilizer 15-15-15',
      category: 'fertilizer',
      quantity: 860,
      unit: 'kg',
      min_stock_level: 400,
      location: 'Fertilizer Shed 2',
      notes: 'Balanced blend reserved for transplant establishment.',
      reserved_quantity: 180,
      unit_cost: 0.73,
      supplier_id: supplierMap.get('AgroChem Inputs Ltd') ?? null,
      batch_no: 'NPK-151515-0526',
      quality_status: 'available',
    },
    {
      item_name: 'Broiler Finisher Feed',
      category: 'livestock_feed',
      quantity: 140,
      unit: 'bags',
      min_stock_level: 180,
      location: 'Feed Store A',
      expiry_date: todayPlus(92),
      notes: 'Allocated to broiler cycle expected for June dispatch.',
      reserved_quantity: 24,
      unit_cost: 19.6,
      supplier_id: supplierMap.get('FeedWorks Cooperative') ?? null,
      batch_no: 'BROIL-FIN-2026-05',
      quality_status: 'available',
    },
    {
      item_name: 'Rice Bran Mash',
      category: 'feed',
      quantity: 210,
      unit: 'bags',
      min_stock_level: 90,
      location: 'Feed Blend Store',
      expiry_date: todayPlus(60),
      notes: 'Blend supplement for pigs and grower birds.',
      reserved_quantity: 32,
      unit_cost: 11.4,
      supplier_id: supplierMap.get('FeedWorks Cooperative') ?? null,
      batch_no: 'RBRAN-0526',
      quality_status: 'available',
    },
    {
      item_name: 'Drip Irrigation Tape',
      category: 'spare_parts',
      quantity: 36,
      unit: 'rolls',
      min_stock_level: 24,
      location: 'Irrigation Store',
      notes: 'Replacement stock for nursery and trial plots.',
      reserved_quantity: 8,
      unit_cost: 14.2,
      supplier_id: supplierMap.get('FarmParts Service Center') ?? null,
      batch_no: 'DRIP-ROLL-2026-01',
      quality_status: 'available',
    },
    {
      item_name: 'Pond Aerator Spare Kit',
      category: 'equipment',
      quantity: 8,
      unit: 'kits',
      min_stock_level: 6,
      location: 'Aquaculture Maintenance Rack',
      notes: 'Critical spares for paddle-wheel maintenance.',
      reserved_quantity: 2,
      unit_cost: 125,
      supplier_id: supplierMap.get('FarmParts Service Center') ?? null,
      batch_no: 'AER-SPR-2026',
      quality_status: 'available',
    },
    {
      item_name: 'Vegetable Seedlings Trays',
      category: 'tools',
      quantity: 120,
      unit: 'pcs',
      min_stock_level: 60,
      location: 'Nursery Store',
      notes: 'Reusable trays for tomato and pepper transplant batches.',
      reserved_quantity: 24,
      unit_cost: 3.8,
      supplier_id: supplierMap.get('GreenSeed Agro Supply') ?? null,
      batch_no: 'TRAY-NUR-2026-B',
      quality_status: 'available',
    },
  ];

  const inventoryIds = new Map<string, string>();

  for (const row of inventoryRows) {
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM public.inventory WHERE item_name = $1 LIMIT 1`,
      row.item_name,
    );

    if (existing.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE public.inventory
         SET category = $2, quantity = $3, unit = $4, min_stock_level = $5, location = $6,
             expiry_date = $7, notes = $8, reserved_quantity = $9, unit_cost = $10,
             supplier_id = $11::uuid, batch_no = $12, quality_status = $13, updated_at = NOW()
         WHERE id = $1::uuid`,
        existing[0].id,
        row.category,
        row.quantity,
        row.unit,
        row.min_stock_level,
        row.location,
        row.expiry_date,
        row.notes,
        row.reserved_quantity,
        row.unit_cost,
        row.supplier_id,
        row.batch_no,
        row.quality_status,
      );
      inventoryIds.set(row.item_name, existing[0].id);
    } else {
      const created = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO public.inventory (
           item_name, category, quantity, unit, min_stock_level, location, expiry_date, notes,
           reserved_quantity, unit_cost, supplier_id, batch_no, quality_status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, $12, $13)
         RETURNING id`,
        row.item_name,
        row.category,
        row.quantity,
        row.unit,
        row.min_stock_level,
        row.location,
        row.expiry_date,
        row.notes,
        row.reserved_quantity,
        row.unit_cost,
        row.supplier_id,
        row.batch_no,
        row.quality_status,
      );
      inventoryIds.set(row.item_name, created[0].id);
    }
  }

  const movementSeed = [
    ['Hybrid Maize Seed - FAO 350', 'received', 300, 48.5, 'showcase', todayMinus(150), 'Opening certified seed receipt.'],
    ['Hybrid Maize Seed - FAO 350', 'dispatched', 80, null, 'showcase', todayMinus(120), 'Issued to early planting block.'],
    ['Hybrid Maize Seed - FAO 350', 'received', 200, 49.2, 'showcase', todayMinus(50), 'Seasonal replenishment for expansion plots.'],
    ['Urea Fertilizer 46-0-0', 'received', 900, 0.61, 'showcase', todayMinus(140), 'Bulk fertilizer delivery.'],
    ['Urea Fertilizer 46-0-0', 'dispatched', 210, null, 'showcase', todayMinus(10), 'Issued to vegetable plots.'],
    ['Urea Fertilizer 46-0-0', 'dispatched', 150, null, 'showcase', todayMinus(3), 'Issued to maize top dressing cycle.'],
    ['Floating Fish Feed 32% Protein', 'received', 240, 22, 'showcase', todayMinus(55), 'Aquaculture feed receipt.'],
    ['Floating Fish Feed 32% Protein', 'dispatched', 35, null, 'showcase', todayMinus(4), 'Daily pond ration issue.'],
    ['Floating Fish Feed 32% Protein', 'dispatched', 25, null, 'showcase', todayMinus(1), 'Additional feed ration for Pond-02.'],
    ['Broiler Starter Feed', 'received', 160, 18.25, 'showcase', todayMinus(62), 'Initial poultry feed delivery.'],
    ['Broiler Starter Feed', 'dispatched', 65, null, 'showcase', todayMinus(8), 'Issued to broiler house.'],
    ['Broiler Finisher Feed', 'received', 180, 19.6, 'showcase', todayMinus(18), 'Finisher feed intake for current flock.'],
    ['Broiler Finisher Feed', 'dispatched', 40, null, 'showcase', todayMinus(2), 'Issued to grow-out sheds.'],
    ['NPK Fertilizer 15-15-15', 'received', 860, 0.73, 'showcase', todayMinus(24), 'Balanced fertilizer bulk receipt.'],
    ['NPK Fertilizer 15-15-15', 'dispatched', 120, null, 'showcase', todayMinus(6), 'Issued to transplant blocks.'],
    ['Packaged Rice 5kg', 'received', 420, 4.2, 'showcase', todayMinus(90), 'Production output from packaging line.'],
    ['Packaged Rice 5kg', 'dispatched', 45, null, 'showcase', todayMinus(2), 'Reserved order dispatch.'],
    ['Packaged Rice 5kg', 'dispatched', 65, null, 'showcase', todayMinus(1), 'Sunrise Community Stores dispatch.'],
    ['Rice Bran Mash', 'received', 210, 11.4, 'showcase', todayMinus(15), 'Feed blend ingredient received.'],
    ['Rice Bran Mash', 'dispatched', 26, null, 'showcase', todayMinus(3), 'Transferred to livestock feed mixing area.'],
    ['Reusable Harvest Crates', 'dispatched', 12, null, 'showcase', todayMinus(4), 'Field harvest picking allocation.'],
    ['Drip Irrigation Tape', 'received', 36, 14.2, 'showcase', todayMinus(12), 'Irrigation repair materials delivered.'],
    ['Pond Aerator Spare Kit', 'received', 8, 125, 'showcase', todayMinus(11), 'Critical aquaculture maintenance spare kit.'],
    ['Vegetable Seedlings Trays', 'received', 120, 3.8, 'showcase', todayMinus(30), 'Nursery tray replenishment.'],
  ] as const;

  for (const [itemName, movementType, quantity, unitCost, sourceModule, movementDate, notes] of movementSeed) {
    const inventoryId = inventoryIds.get(itemName);
    if (!inventoryId) continue;

    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM public.inventory_movements
       WHERE inventory_id = $1::uuid AND movement_type = $2 AND source_module = $3 AND notes = $4
       LIMIT 1`,
      inventoryId,
      movementType,
      sourceModule,
      notes,
    );

    if (!existing.length) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO public.inventory_movements (
           inventory_id, movement_type, quantity, unit_cost, source_module, movement_date, notes
         )
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
        inventoryId,
        movementType,
        quantity,
        unitCost,
        sourceModule,
        movementDate,
        notes,
      );
    }
  }

  const procurementRows = [
    {
      request_number: 'PR-DEMO-001',
      po_number: 'PO-DEMO-001',
      item_name: 'NPK Fertilizer 15-15-15',
      category: 'fertilizer',
      unit: 'kg',
      supplier: 'AgroChem Inputs Ltd',
      supplier_id: supplierMap.get('AgroChem Inputs Ltd') ?? null,
      inventory_id: inventoryIds.get('NPK Fertilizer 15-15-15') ?? null,
      quantity: 900,
      received_quantity: 0,
      unit_price: 0.73,
      total_cost: 657,
      status: 'ordered',
      expected_date: todayPlus(9),
      approved_at: todayMinus(1),
      received_at: null,
      rejection_reason: null,
      notes: 'Showcase pending replenishment order.',
    },
    {
      request_number: 'PR-DEMO-002',
      po_number: 'PO-DEMO-002',
      item_name: 'Floating Fish Feed 32% Protein',
      category: 'fish_feed',
      unit: 'bags',
      supplier: 'FeedWorks Cooperative',
      supplier_id: supplierMap.get('FeedWorks Cooperative') ?? null,
      inventory_id: inventoryIds.get('Floating Fish Feed 32% Protein') ?? null,
      quantity: 260,
      received_quantity: 0,
      unit_price: 21.75,
      total_cost: 5655,
      status: 'approved',
      expected_date: todayPlus(4),
      approved_at: todayMinus(2),
      received_at: null,
      rejection_reason: null,
      notes: 'Showcase urgent feed order.',
    },
    {
      request_number: 'PR-DEMO-003',
      po_number: 'PO-DEMO-003',
      item_name: 'Hybrid Maize Seed - FAO 350',
      category: 'seeds',
      unit: 'bags',
      supplier: 'GreenSeed Agro Supply',
      supplier_id: supplierMap.get('GreenSeed Agro Supply') ?? null,
      inventory_id: inventoryIds.get('Hybrid Maize Seed - FAO 350') ?? null,
      quantity: 260,
      received_quantity: 260,
      unit_price: 49.2,
      total_cost: 12792,
      status: 'received',
      expected_date: todayMinus(60),
      approved_at: todayMinus(65),
      received_at: todayMinus(50),
      rejection_reason: null,
      notes: 'Showcase received seed replenishment.',
    },
    {
      request_number: 'PR-DEMO-004',
      po_number: 'PO-DEMO-004',
      item_name: 'Broiler Finisher Feed',
      category: 'livestock_feed',
      unit: 'bags',
      supplier: 'FeedWorks Cooperative',
      supplier_id: supplierMap.get('FeedWorks Cooperative') ?? null,
      inventory_id: inventoryIds.get('Broiler Finisher Feed') ?? null,
      quantity: 180,
      received_quantity: 0,
      unit_price: 19.6,
      total_cost: 3528,
      status: 'ordered',
      expected_date: todayMinus(2),
      approved_at: todayMinus(7),
      received_at: null,
      rejection_reason: null,
      notes: 'Showcase finisher feed order for June flock cycle.',
    },
    {
      request_number: 'PR-DEMO-005',
      po_number: null,
      item_name: 'Drip Irrigation Tape',
      category: 'spare_parts',
      unit: 'rolls',
      supplier: 'FarmParts Service Center',
      supplier_id: supplierMap.get('FarmParts Service Center') ?? null,
      inventory_id: inventoryIds.get('Drip Irrigation Tape') ?? null,
      quantity: 24,
      received_quantity: 0,
      unit_price: 14.2,
      total_cost: 340.8,
      status: 'pending',
      expected_date: todayPlus(7),
      approved_at: null,
      received_at: null,
      rejection_reason: null,
      notes: 'Showcase irrigation line maintenance replenishment.',
    },
    {
      request_number: 'PR-DEMO-006',
      po_number: 'PO-DEMO-006',
      item_name: 'Vegetable Seedlings Trays',
      category: 'tools',
      unit: 'pcs',
      supplier: 'GreenSeed Agro Supply',
      supplier_id: supplierMap.get('GreenSeed Agro Supply') ?? null,
      inventory_id: inventoryIds.get('Vegetable Seedlings Trays') ?? null,
      quantity: 80,
      received_quantity: 0,
      unit_price: 3.8,
      total_cost: 304,
      status: 'approved',
      expected_date: todayPlus(3),
      approved_at: todayMinus(1),
      received_at: null,
      rejection_reason: null,
      notes: 'Showcase nursery tray replenishment for expansion.',
    },
    {
      request_number: 'PR-DEMO-007',
      po_number: 'PO-DEMO-007',
      item_name: 'Pond Aerator Spare Kit',
      category: 'equipment',
      unit: 'kits',
      supplier: 'FarmParts Service Center',
      supplier_id: supplierMap.get('FarmParts Service Center') ?? null,
      inventory_id: inventoryIds.get('Pond Aerator Spare Kit') ?? null,
      quantity: 4,
      received_quantity: 4,
      unit_price: 125,
      total_cost: 500,
      status: 'received',
      expected_date: todayMinus(14),
      approved_at: todayMinus(17),
      received_at: todayMinus(11),
      rejection_reason: null,
      notes: 'Showcase received aquaculture spare kit order.',
    },
    {
      request_number: 'PR-DEMO-008',
      po_number: 'PO-DEMO-008',
      item_name: 'Rice Bran Mash',
      category: 'feed',
      unit: 'bags',
      supplier: 'FeedWorks Cooperative',
      supplier_id: supplierMap.get('FeedWorks Cooperative') ?? null,
      inventory_id: inventoryIds.get('Rice Bran Mash') ?? null,
      quantity: 120,
      received_quantity: 70,
      unit_price: 11.4,
      total_cost: 1368,
      status: 'partially_received',
      expected_date: todayMinus(1),
      approved_at: todayMinus(5),
      received_at: todayMinus(0),
      rejection_reason: null,
      notes: 'Showcase partial delivery still awaiting balance.',
    },
    {
      request_number: 'PR-DEMO-009',
      po_number: null,
      item_name: 'Copper Fungicide 5L',
      category: 'chemicals',
      unit: 'canisters',
      supplier: 'AgroChem Inputs Ltd',
      supplier_id: supplierMap.get('AgroChem Inputs Ltd') ?? null,
      inventory_id: inventoryIds.get('Copper Fungicide 5L') ?? null,
      quantity: 18,
      received_quantity: 0,
      unit_price: 39,
      total_cost: 702,
      status: 'rejected',
      expected_date: todayPlus(6),
      approved_at: null,
      received_at: null,
      rejection_reason: 'Budget hold pending month-end cash flow review.',
      notes: 'Showcase rejected fungicide request.',
    },
  ];

  for (const row of procurementRows) {
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM public.procurement WHERE item_name = $1 AND notes = $2 LIMIT 1`,
      row.item_name,
      row.notes,
    );

    if (existing.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE public.procurement
         SET request_number = $2, po_number = $3, item_name = $4, category = $5, unit = $6,
             supplier = $7, supplier_id = $8::uuid, inventory_id = $9::uuid, quantity = $10,
             received_quantity = $11, unit_price = $12, total_cost = $13, status = $14,
             expected_date = $15, approved_at = $16, received_at = $17, rejection_reason = $18,
             notes = $19, updated_at = NOW()
         WHERE id = $1::uuid`,
        existing[0].id,
        row.request_number,
        row.po_number,
        row.item_name,
        row.category,
        row.unit,
        row.supplier,
        row.supplier_id,
        row.inventory_id,
        row.quantity,
        row.received_quantity,
        row.unit_price,
        row.total_cost,
        row.status,
        row.expected_date,
        row.approved_at,
        row.received_at,
        row.rejection_reason,
        row.notes,
      );
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO public.procurement (
           request_number, po_number, item_name, category, unit, supplier, supplier_id, inventory_id,
           quantity, received_quantity, unit_price, total_cost, status, expected_date, approved_at, received_at,
           rejection_reason, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        row.request_number,
        row.po_number,
        row.item_name,
        row.category,
        row.unit,
        row.supplier,
        row.supplier_id,
        row.inventory_id,
        row.quantity,
        row.received_quantity,
        row.unit_price,
        row.total_cost,
        row.status,
        row.expected_date,
        row.approved_at,
        row.received_at,
        row.rejection_reason,
        row.notes,
      );
    }
  }
}

async function ensureFinanceEntries() {
  async function ensureAccount(account_code: string, name: string, account_type: string) {
    const existing = await prismaAny.financial_accounts.findFirst({
      where: { farm_id: FARM_ID, account_code },
    });
    if (existing) {
      return prismaAny.financial_accounts.update({
        where: { id: existing.id },
        data: { name, account_type, is_active: true },
      });
    }
    return prismaAny.financial_accounts.create({
      data: {
        farm_id: FARM_ID,
        account_code,
        name,
        account_type,
        is_active: true,
      },
    });
  }

  const [cashAccount, receivableAccount, payableAccount, revenueAccount, expenseAccount] = await Promise.all([
    ensureAccount('AST-CASH', 'Farm Operating Cash', 'asset'),
    ensureAccount('AST-AR', 'Accounts Receivable', 'asset'),
    ensureAccount('LIA-AP', 'Accounts Payable', 'liability'),
    ensureAccount('REV-OTHER', 'Other Operating Income', 'revenue'),
    ensureAccount('EXP-OTHER', 'Other Operating Expense', 'expense'),
  ]);

  const manualEntries = [
    {
      reference: 'FIN-DEMO-001',
      entry_date: todayMinus(11),
      description: 'Packaging material expense\n@@finance-meta:{"transactionType":"expense","vendor":"PackRight Supplies","category":"packaging","linkedModule":"manual","amount":420,"paymentMethod":"bank transfer","paymentStatus":"paid","dueDate":"2026-05-07","paidAt":"2026-05-07","receiptUrl":"https://example.local/receipts/packaging-001.pdf","notes":"Rice sacks, labels, and sealing tape","sector":"Finished Goods / Processing"}',
      total_debit: 420,
      total_credit: 420,
      debit_account_id: expenseAccount.id,
      credit_account_id: cashAccount.id,
    },
    {
      reference: 'FIN-DEMO-002',
      entry_date: todayMinus(9),
      description: 'Farm utility expense\n@@finance-meta:{"transactionType":"expense","vendor":"Liberia Utilities Corp","category":"utilities","linkedModule":"manual","amount":310,"paymentMethod":"cash","paymentStatus":"paid","dueDate":"2026-05-09","paidAt":"2026-05-09","receiptUrl":"https://example.local/receipts/utilities-001.pdf","notes":"Cold room electricity and office power","sector":"Finished Goods / Processing"}',
      total_debit: 310,
      total_credit: 310,
      debit_account_id: expenseAccount.id,
      credit_account_id: cashAccount.id,
    },
    {
      reference: 'FIN-DEMO-003',
      entry_date: todayMinus(6),
      description: 'Transport and delivery expense\n@@finance-meta:{"transactionType":"expense","vendor":"Port Haulage Services","category":"transport","linkedModule":"distribution","amount":260,"paymentMethod":"mobile money","paymentStatus":"paid","dueDate":"2026-05-12","paidAt":"2026-05-12","receiptUrl":"https://example.local/receipts/transport-001.pdf","notes":"Market delivery run and cargo handling","sector":"Logistics / Distribution"}',
      total_debit: 260,
      total_credit: 260,
      debit_account_id: expenseAccount.id,
      credit_account_id: cashAccount.id,
    },
    {
      reference: 'FIN-DEMO-004',
      entry_date: todayMinus(4),
      description: 'Agronomy consulting income\n@@finance-meta:{"transactionType":"income","customer":"Green Plate Restaurants","sourceOrder":"CONS-AGRO-01","productService":"Agronomy advisory service","amount":540,"paymentMethod":"bank transfer","paymentStatus":"partially paid","dueDate":"2026-05-20","paidAt":null,"linkedModule":"manual","linkedRecordId":null,"receiptUrl":"https://example.local/receipts/agronomy-001.pdf","notes":"Soil fertility and crop planning advisory","sector":"Crop Production"}',
      total_debit: 540,
      total_credit: 540,
      debit_account_id: receivableAccount.id,
      credit_account_id: revenueAccount.id,
    },
    {
      reference: 'FIN-DEMO-005',
      entry_date: todayMinus(2),
      description: 'Cold room storage income\n@@finance-meta:{"transactionType":"income","customer":"Sunrise Community Stores","sourceOrder":"COLD-LEASE-01","productService":"Short-term cold storage rental","amount":380,"paymentMethod":"cash","paymentStatus":"paid","dueDate":"2026-05-16","paidAt":"2026-05-16","linkedModule":"manual","linkedRecordId":null,"receiptUrl":"https://example.local/receipts/storage-001.pdf","notes":"Three-day produce holding charge","sector":"Finished Goods / Processing"}',
      total_debit: 380,
      total_credit: 380,
      debit_account_id: cashAccount.id,
      credit_account_id: revenueAccount.id,
    },
    {
      reference: 'FIN-DEMO-006',
      entry_date: todayMinus(1),
      description: 'Veterinary chemical expense\n@@finance-meta:{"transactionType":"expense","vendor":"AgroChem Inputs Ltd","category":"chemical","linkedModule":"manual","amount":215,"paymentMethod":"credit","paymentStatus":"overdue","dueDate":"2026-05-15","paidAt":null,"receiptUrl":"https://example.local/receipts/chemical-001.pdf","notes":"Disinfectant and dip chemical top-up","sector":"Livestock"}',
      total_debit: 215,
      total_credit: 215,
      debit_account_id: expenseAccount.id,
      credit_account_id: payableAccount.id,
    },
  ];

  for (const entry of manualEntries) {
    const existing = await prismaAny.journal_entries.findFirst({
      where: { farm_id: FARM_ID, reference: entry.reference, source_module: 'finance' },
    });

    const saved = existing
      ? await prismaAny.journal_entries.update({
          where: { id: existing.id },
          data: {
            created_by: USERS.farmManager.userId,
            farm_id: FARM_ID,
            entry_date: entry.entry_date,
            description: entry.description,
            total_debit: entry.total_debit,
            total_credit: entry.total_credit,
            source_module: 'finance',
            status: 'posted',
          },
        })
      : await prismaAny.journal_entries.create({
          data: {
            farm_id: FARM_ID,
            created_by: USERS.farmManager.userId,
            entry_date: entry.entry_date,
            reference: entry.reference,
            source_module: 'finance',
            description: entry.description,
            total_debit: entry.total_debit,
            total_credit: entry.total_credit,
            status: 'posted',
          },
        });

    await prismaAny.journal_entry_lines.deleteMany({ where: { journal_entry_id: saved.id } });
    await prismaAny.journal_entry_lines.createMany({
      data: [
        {
          journal_entry_id: saved.id,
          account_id: entry.debit_account_id,
          debit_amount: entry.total_debit,
          credit_amount: 0,
          description: entry.reference,
        },
        {
          journal_entry_id: saved.id,
          account_id: entry.credit_account_id,
          debit_amount: 0,
          credit_amount: entry.total_credit,
          description: entry.reference,
        },
      ],
    });
  }
}

async function ensureAuditEvents() {
  const auditSeeds = [
    {
      eventType: 'failed_login',
      subsystem: 'settings',
      description: 'Failed login attempt for manager@agritech.local',
      occurredAt: todayMinus(0),
      actorUserId: null,
      metadata: {
        severity: 'security',
        actorName: 'Unknown user',
        actorRole: null,
        recordType: 'session',
        recordId: 'LOGIN-ATTEMPT-1',
        recordLabel: 'Manager account login',
        seedKey: 'audit-failed-login',
      },
      ipAddress: '10.10.0.51',
      userAgent: 'Mozilla/5.0 Chrome/124',
    },
    {
      eventType: 'login',
      subsystem: 'settings',
      description: 'Farm Manager logged in',
      occurredAt: todayMinus(0),
      actorUserId: USERS.farmManager.userId,
      metadata: { severity: 'info', actorName: USERS.farmManager.fullName, actorRole: USERS.farmManager.role, recordType: 'session', recordId: 'SESSION-001', recordLabel: 'Farm Manager session', seedKey: 'audit-login-success' },
      ipAddress: '10.10.0.12',
      userAgent: 'Mozilla/5.0 Chrome/124',
    },
    {
      eventType: 'permission_change',
      subsystem: 'settings',
      description: 'Permissions updated for Sales Customer Officer',
      occurredAt: todayMinus(1),
      actorUserId: USERS.superAdmin.userId,
      metadata: {
        severity: 'security',
        actorName: USERS.superAdmin.fullName,
        actorRole: USERS.superAdmin.role,
        recordType: 'role_permission',
        recordId: 'sales_customer_officer',
        recordLabel: 'Sales Customer Officer permissions',
        beforeValue: { reports: 'view' },
        afterValue: { reports: 'export' },
        seedKey: 'audit-permission-change',
      },
      ipAddress: '10.10.0.10',
      userAgent: 'Mozilla/5.0 Edge/124',
    },
    {
      eventType: 'approve',
      subsystem: 'procurement',
      description: 'Procurement approved for Floating Fish Feed 32% Protein',
      occurredAt: todayMinus(2),
      actorUserId: USERS.farmManager.userId,
      metadata: { severity: 'info', actorName: USERS.farmManager.fullName, actorRole: USERS.farmManager.role, recordType: 'procurement_request', recordId: 'PR-DEMO-002', recordLabel: 'Floating Fish Feed order', seedKey: 'audit-procurement-approved' },
      ipAddress: '10.10.0.12',
      userAgent: 'Mozilla/5.0 Chrome/124',
    },
    {
      eventType: 'stock_movement',
      subsystem: 'inventory',
      description: 'Stock received for Hybrid Maize Seed - FAO 350',
      occurredAt: todayMinus(2),
      actorUserId: USERS.superAdmin.userId,
      metadata: {
        severity: 'info',
        actorName: USERS.superAdmin.fullName,
        actorRole: USERS.superAdmin.role,
        recordType: 'stock_item',
        recordId: 'SEED-MAIZE-350',
        recordLabel: 'Hybrid Maize Seed - FAO 350',
        beforeValue: { quantity: 160 },
        afterValue: { quantity: 420, received: 260 },
        seedKey: 'audit-stock-received',
      },
      ipAddress: '10.10.0.10',
      userAgent: 'Mozilla/5.0 Chrome/124',
    },
    {
      eventType: 'status_change',
      subsystem: 'sales_order_points',
      description: 'Sales order completed for Sunrise Community Stores',
      occurredAt: todayMinus(3),
      actorUserId: USERS.salesOfficer.userId,
      metadata: { severity: 'info', actorName: USERS.salesOfficer.fullName, actorRole: USERS.salesOfficer.role, recordType: 'sales_order', recordId: 'SO-DEMO-101', recordLabel: 'Sunrise Community Stores order', beforeValue: { status: 'ready_for_dispatch' }, afterValue: { status: 'completed' }, seedKey: 'audit-sales-completed' },
      ipAddress: '10.10.0.22',
      userAgent: 'Mozilla/5.0 Firefox/126',
    },
    {
      eventType: 'approve',
      subsystem: 'production',
      description: 'Production batch passed quality check',
      occurredAt: todayMinus(4),
      actorUserId: USERS.farmManager.userId,
      metadata: { severity: 'info', actorName: USERS.farmManager.fullName, actorRole: USERS.farmManager.role, recordType: 'production_batch', recordId: 'PB-24051201', recordLabel: 'PB-24051201', beforeValue: { status: 'quality_check' }, afterValue: { status: 'passed' }, seedKey: 'audit-production-passed' },
      ipAddress: '10.10.0.12',
      userAgent: 'Mozilla/5.0 Chrome/124',
    },
    {
      eventType: 'payment_recorded',
      subsystem: 'human_capital',
      description: 'Payroll paid for April labor cycle',
      occurredAt: todayMinus(5),
      actorUserId: USERS.superAdmin.userId,
      metadata: { severity: 'info', actorName: USERS.superAdmin.fullName, actorRole: USERS.superAdmin.role, recordType: 'payroll_run', recordId: 'PAY-APR-2026', recordLabel: 'April 2026 payroll', seedKey: 'audit-payroll-paid' },
      ipAddress: '10.10.0.10',
      userAgent: 'Mozilla/5.0 Safari/17.4',
    },
    {
      eventType: 'status_change',
      subsystem: 'machinery',
      description: 'Asset maintenance completed for Tractor Unit 03',
      occurredAt: todayMinus(6),
      actorUserId: USERS.farmManager.userId,
      metadata: { severity: 'warning', actorName: USERS.farmManager.fullName, actorRole: USERS.farmManager.role, recordType: 'work_order', recordId: 'WO-TR-003', recordLabel: 'Tractor Unit 03 maintenance', beforeValue: { status: 'in_progress' }, afterValue: { status: 'completed' }, seedKey: 'audit-maintenance-complete' },
      ipAddress: '10.10.0.12',
      userAgent: 'Mozilla/5.0 Chrome/124',
    },
    {
      eventType: 'export',
      subsystem: 'reports',
      description: 'Security and audit report exported',
      occurredAt: todayMinus(6),
      actorUserId: USERS.superAdmin.userId,
      metadata: { severity: 'critical', actorName: USERS.superAdmin.fullName, actorRole: USERS.superAdmin.role, recordType: 'report', recordId: 'security-audit', recordLabel: 'Security & Audit Report', seedKey: 'audit-report-export' },
      ipAddress: '10.10.0.10',
      userAgent: 'Mozilla/5.0 Edge/124',
    },
  ];

  for (const seed of auditSeeds) {
    const existing = await prismaAny.audit_events.findFirst({
      where: {
        description: seed.description,
        event_type: seed.eventType,
      },
      select: { id: true },
    });

    if (existing) continue;

    await prismaAny.audit_events.create({
      data: {
        occurred_at: seed.occurredAt,
        actor_user_id: seed.actorUserId,
        event_type: seed.eventType,
        subsystem: seed.subsystem,
        action: seed.eventType,
        description: seed.description,
        ip_address: seed.ipAddress,
        user_agent: seed.userAgent,
        metadata: seed.metadata,
      },
    });
  }
}

async function main() {
  await ensureFarm();
  await upsertEmployeeUser(USERS.superAdmin);
  await upsertEmployeeUser(USERS.farmManager);
  await upsertEmployeeUser(USERS.salesOfficer);
  await upsertCustomerUser(USERS.customer);

  await ensureUnitsAndCategories();
  await ensureSuppliers();
  await ensureStockAndAlerts();
  await ensureCustomersAndSales();
  await ensureMarketing();
  await ensureEmployeesAndHr();
  await ensureAssetsAndLand();
  await ensureProductionAndProcurementRequests();
  await ensureManagerCoverage();
  await ensureFinanceEntries();
  await ensureAuditEvents();
  await ensureSalesCommandCenter();
  await ensureLivestock();
  await ensureFrontendTables();
  await ensureFrontendShowcaseData();

  console.log('\nDemo bootstrap complete.');
  console.log('Login credentials:');
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
