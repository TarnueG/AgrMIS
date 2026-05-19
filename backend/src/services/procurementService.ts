import { findOrCreateLegacyInventoryFromProcurement } from './inventoryService';
import { createLinkedFinanceEntry } from './financeService';
import { recordAuditEvent } from './auditService';
import prisma from '../lib/prisma';

const prismaAny = prisma as any;

export async function receiveProcurementFlow({
  procurementId,
  receivedQuantity,
  actorUserId,
  farmId,
  req,
}: {
  procurementId: string;
  receivedQuantity?: number;
  actorUserId: string;
  farmId: string | undefined;
  req?: any;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<any[]>(
      `SELECT * FROM public.procurement WHERE id = $1::uuid LIMIT 1`,
      procurementId,
    );
    if (!rows.length) throw Object.assign(new Error('Procurement record not found'), { code: 'NOT_FOUND' });

    const row = rows[0];
    if (row.status === 'rejected') throw Object.assign(new Error('Rejected procurement cannot be received'), { code: 'INVALID_STATUS' });
    if (row.status === 'received') throw Object.assign(new Error('Procurement already received'), { code: 'ALREADY_RECEIVED' });

    const requestedQuantity = Number(row.quantity || 0);
    const alreadyReceived = Number(row.received_quantity || 0);
    const receiptQuantity = receivedQuantity && receivedQuantity > 0 ? receivedQuantity : requestedQuantity - alreadyReceived;
    if (receiptQuantity <= 0 || alreadyReceived + receiptQuantity > requestedQuantity) {
      throw Object.assign(new Error('Receipt quantity is invalid for this procurement record.'), { code: 'INVALID_QTY' });
    }

    let inventoryRows = row.inventory_id
      ? await tx.$queryRawUnsafe<any[]>(`SELECT * FROM public.inventory WHERE id = $1::uuid LIMIT 1`, row.inventory_id)
      : [];
    if (!inventoryRows.length) {
      const legacyItem = await findOrCreateLegacyInventoryFromProcurement(tx, {
        itemName: row.item_name,
        unitPrice: Number(row.unit_price || 0),
        supplierId: row.supplier_id ?? null,
      });
      inventoryRows = [legacyItem];
    }
    const inventoryItem = inventoryRows[0];
    const nextQuantity = Number(inventoryItem.quantity || 0) + receiptQuantity;
    const nextReceivedQuantity = alreadyReceived + receiptQuantity;
    const nextStatus = nextReceivedQuantity >= requestedQuantity ? 'received' : 'partially_received';
    const receivedAt = new Date();

    await tx.$executeRawUnsafe(
      `UPDATE public.inventory
       SET quantity = $2,
           unit_cost = $3,
           supplier_id = COALESCE($4::uuid, supplier_id),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      inventoryItem.id,
      nextQuantity,
      Number(row.unit_price || inventoryItem.unit_cost || 0),
      row.supplier_id ?? null,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO public.inventory_movements (
         inventory_id, movement_type, quantity, unit_cost, source_module, reference_id, movement_date, notes
       )
       VALUES ($1::uuid, 'procurement_receipt', $2, $3, 'procurement', $4::uuid, $5, $6)`,
      inventoryItem.id,
      receiptQuantity,
      Number(row.unit_price || 0),
      row.id,
      receivedAt,
      `Procurement receipt for ${row.item_name}`,
    );

    const updatedRows = await tx.$queryRawUnsafe<any[]>(
      `UPDATE public.procurement
       SET status = $2,
           received_quantity = $3,
           po_number = COALESCE(po_number, $4),
           approved_at = COALESCE(approved_at, NOW()),
           received_at = $5,
           inventory_id = $6::uuid,
           updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING *`,
      row.id,
      nextStatus,
      nextReceivedQuantity,
      row.po_number ?? `PO-${Date.now()}`,
      receivedAt,
      inventoryItem.id,
    );

    return {
      row,
      inventoryItem,
      updated: updatedRows[0],
      receiptQuantity,
      receivedAt,
      payableAmount: Number(row.unit_price || 0) * receiptQuantity,
    };
  });

  await createLinkedFinanceEntry({
    farmId,
    actorUserId,
    kind: 'expense',
    amount: result.payableAmount,
    description: `Procurement receipt for ${result.updated.item_name}`,
    linkedModule: 'procurement',
    linkedRecordId: result.updated.id,
    paymentStatus: 'unpaid',
    dueDate: result.updated.expected_date ?? result.receivedAt,
    vendor: result.updated.supplier ?? 'Supplier',
    category: 'procurement',
    productService: result.updated.item_name,
    notes: result.updated.notes ?? null,
    date: result.receivedAt,
  });

  await recordAuditEvent({
    req,
    actorUserId,
    eventType: 'stock_movement',
    subsystem: 'procurement',
    description: `Received stock for procurement ${result.updated.item_name}`,
    recordType: 'procurement_request',
    recordId: result.updated.id,
    recordLabel: result.updated.item_name,
    afterValue: {
      status: result.updated.status,
      receivedQuantity: Number(result.updated.received_quantity || 0),
      inventoryId: result.updated.inventory_id,
      financeAmount: result.payableAmount,
    },
  });

  return result.updated;
}
