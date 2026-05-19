import prisma from '../lib/prisma';

const prismaAny = prisma as any;

export type StockMovementType =
  | 'PROCUREMENT_RECEIPT'
  | 'SALES_DISPATCH'
  | 'PRODUCTION_INPUT'
  | 'PRODUCTION_OUTPUT'
  | 'RESERVATION'
  | 'RESERVATION_RELEASE'
  | 'LIVESTOCK_USAGE'
  | 'MEDICINE_USAGE';

function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

export async function getStockItemOrThrow(tx: any, stockItemId: string) {
  const item = await tx.stock_items.findFirst({
    where: { id: stockItemId, deleted_at: null },
  });
  if (!item) throw Object.assign(new Error('Inventory item not found'), { code: 'NOT_FOUND' });
  return item;
}

export function assertNonNegative(quantity: number, allowNegativeStock = false) {
  if (!allowNegativeStock && quantity < 0) {
    throw Object.assign(new Error('Insufficient stock'), { code: 'INSUFFICIENT_STOCK' });
  }
}

export async function recordStockMovement(tx: any, {
  stockItemId,
  performedBy,
  transactionType,
  quantity,
  quantityBefore,
  quantityAfter,
  sourceModule,
  referenceId,
  referenceTable,
  notes,
  transactedAt,
}: {
  stockItemId: string;
  performedBy: string;
  transactionType: StockMovementType | string;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  sourceModule: string;
  referenceId?: string | null;
  referenceTable?: string | null;
  notes: string;
  transactedAt?: Date;
}) {
  return tx.stock_transactions.create({
    data: {
      stock_item_id: stockItemId,
      performed_by: performedBy,
      transaction_type: String(transactionType).toLowerCase(),
      quantity,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      source_module: sourceModule,
      reference_id: referenceId ?? null,
      reference_table: referenceTable ?? null,
      notes,
      transacted_at: transactedAt ?? new Date(),
    },
  });
}

export async function addStock(tx: any, {
  stockItemId,
  performedBy,
  quantity,
  sourceModule,
  movementType,
  referenceId,
  referenceTable,
  notes,
}: {
  stockItemId: string;
  performedBy: string;
  quantity: number;
  sourceModule: string;
  movementType: StockMovementType | string;
  referenceId?: string | null;
  referenceTable?: string | null;
  notes: string;
}) {
  const item = await getStockItemOrThrow(tx, stockItemId);
  const before = toNumber(item.current_quantity);
  const after = before + quantity;
  const updated = await tx.stock_items.update({
    where: { id: stockItemId },
    data: { current_quantity: after, updated_at: new Date() },
  });
  await recordStockMovement(tx, {
    stockItemId,
    performedBy,
    transactionType: movementType,
    quantity,
    quantityBefore: before,
    quantityAfter: after,
    sourceModule,
    referenceId,
    referenceTable,
    notes,
  });
  return { item, updated, before, after };
}

export async function consumeStock(tx: any, {
  stockItemId,
  performedBy,
  quantity,
  sourceModule,
  movementType,
  referenceId,
  referenceTable,
  notes,
  allowNegativeStock = false,
}: {
  stockItemId: string;
  performedBy: string;
  quantity: number;
  sourceModule: string;
  movementType: StockMovementType | string;
  referenceId?: string | null;
  referenceTable?: string | null;
  notes: string;
  allowNegativeStock?: boolean;
}) {
  const item = await getStockItemOrThrow(tx, stockItemId);
  const before = toNumber(item.current_quantity);
  const after = before - quantity;
  assertNonNegative(after, allowNegativeStock);
  const updated = await tx.stock_items.update({
    where: { id: stockItemId },
    data: { current_quantity: after, updated_at: new Date() },
  });
  await recordStockMovement(tx, {
    stockItemId,
    performedBy,
    transactionType: movementType,
    quantity,
    quantityBefore: before,
    quantityAfter: after,
    sourceModule,
    referenceId,
    referenceTable,
    notes,
  });
  return { item, updated, before, after };
}

export async function reserveStock(tx: any, {
  stockItemId,
  performedBy,
  quantity,
  sourceModule,
  referenceId,
  referenceTable,
  notes,
  allowNegativeStock = false,
}: {
  stockItemId: string;
  performedBy: string;
  quantity: number;
  sourceModule: string;
  referenceId?: string | null;
  referenceTable?: string | null;
  notes: string;
  allowNegativeStock?: boolean;
}) {
  const item = await getStockItemOrThrow(tx, stockItemId);
  const current = toNumber(item.current_quantity);
  const reserved = toNumber(item.reserved_quantity);
  const available = current - reserved;
  assertNonNegative(available - quantity, allowNegativeStock);
  const updated = await tx.stock_items.update({
    where: { id: stockItemId },
    data: { reserved_quantity: reserved + quantity, updated_at: new Date() },
  });
  await recordStockMovement(tx, {
    stockItemId,
    performedBy,
    transactionType: 'RESERVATION',
    quantity,
    quantityBefore: reserved,
    quantityAfter: reserved + quantity,
    sourceModule,
    referenceId,
    referenceTable,
    notes,
  });
  return { item, updated, current, reserved };
}

export async function releaseReservedStock(tx: any, {
  stockItemId,
  performedBy,
  quantity,
  sourceModule,
  referenceId,
  referenceTable,
  notes,
}: {
  stockItemId: string;
  performedBy: string;
  quantity: number;
  sourceModule: string;
  referenceId?: string | null;
  referenceTable?: string | null;
  notes: string;
}) {
  const item = await getStockItemOrThrow(tx, stockItemId);
  const reserved = toNumber(item.reserved_quantity);
  const released = Math.min(reserved, quantity);
  const updated = await tx.stock_items.update({
    where: { id: stockItemId },
    data: { reserved_quantity: Math.max(reserved - released, 0), updated_at: new Date() },
  });
  await recordStockMovement(tx, {
    stockItemId,
    performedBy,
    transactionType: 'RESERVATION_RELEASE',
    quantity: released,
    quantityBefore: reserved,
    quantityAfter: Math.max(reserved - released, 0),
    sourceModule,
    referenceId,
    referenceTable,
    notes,
  });
  return { item, updated, reserved, released };
}

export async function dispatchReservedStock(tx: any, {
  stockItemId,
  performedBy,
  quantity,
  sourceModule,
  referenceId,
  referenceTable,
  notes,
  allowNegativeStock = false,
}: {
  stockItemId: string;
  performedBy: string;
  quantity: number;
  sourceModule: string;
  referenceId?: string | null;
  referenceTable?: string | null;
  notes: string;
  allowNegativeStock?: boolean;
}) {
  const item = await getStockItemOrThrow(tx, stockItemId);
  const current = toNumber(item.current_quantity);
  const reserved = toNumber(item.reserved_quantity);
  if (!allowNegativeStock && reserved < quantity) {
    throw Object.assign(new Error('Reserved stock is insufficient'), { code: 'INSUFFICIENT_RESERVED_STOCK' });
  }
  const nextCurrent = current - quantity;
  const nextReserved = Math.max(reserved - quantity, 0);
  assertNonNegative(nextCurrent, allowNegativeStock);
  const updated = await tx.stock_items.update({
    where: { id: stockItemId },
    data: {
      current_quantity: nextCurrent,
      reserved_quantity: nextReserved,
      updated_at: new Date(),
    },
  });
  await recordStockMovement(tx, {
    stockItemId,
    performedBy,
    transactionType: 'SALES_DISPATCH',
    quantity,
    quantityBefore: current,
    quantityAfter: nextCurrent,
    sourceModule,
    referenceId,
    referenceTable,
    notes,
  });
  return { item, updated, current, reserved, nextCurrent, nextReserved };
}

export async function findOrCreateLegacyInventoryFromProcurement(tx: any, {
  itemName,
  unitPrice,
  supplierId,
}: {
  itemName: string;
  unitPrice: number;
  supplierId?: string | null;
}) {
  let inventoryRows = await tx.$queryRawUnsafe(
    `SELECT * FROM public.inventory WHERE LOWER(item_name) = LOWER($1) LIMIT 1`,
    itemName,
  ) as any[];

  if (!inventoryRows.length) {
    inventoryRows = await tx.$queryRawUnsafe(
      `INSERT INTO public.inventory (
         item_name, category, quantity, unit_cost, supplier_id, notes
       )
       VALUES ($1, 'supplies', 0, $2, $3::uuid, 'Created automatically from connected business flow.')
       RETURNING *`,
      itemName,
      unitPrice,
      supplierId ?? null,
    ) as any[];
  }

  return inventoryRows[0];
}

export { prismaAny };
