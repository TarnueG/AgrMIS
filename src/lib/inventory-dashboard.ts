export type InventoryItem = {
  id: string;
  item_name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  min_stock_level: number | null;
  location: string | null;
  expiry_date: string | null;
  batch_no: string | null;
  notes: string | null;
  quality_status: string | null;
  created_at: string | null;
  reserved_quantity: number | null;
  supplier_id: string | null;
  unit_cost: number | null;
  updated_at: string | null;
};

export type InventoryMovement = {
  id: string;
  created_at: string | null;
  inventory_id: string;
  movement_type: string;
  quantity: number;
  movement_date: string | null;
  unit_cost: number | null;
  source_module: string | null;
  notes: string | null;
};

export type Supplier = {
  id: string;
  name: string;
};

export type StockStatus = 'in_stock' | 'low_stock' | 'reorder' | 'expiring_soon' | 'expired' | 'quality_hold';

export type EnrichedInventoryItem = InventoryItem & {
  quantity: number;
  min_stock_level: number;
  reserved_quantity: number;
  available_quantity: number;
  unit_cost: number;
  stock_value: number;
  status: StockStatus;
  daysUntilExpiry: number | null;
  coverage: number | null;
  supplier_name: string | null;
  last_movement: InventoryMovement | null;
};

export const inventoryCategories = [
  'seeds',
  'fertilizer',
  'chemicals',
  'livestock_feed',
  'fish_feed',
  'harvested_goods',
  'finished_goods',
  'tools',
  'equipment',
  'spare_parts',
  'feed',
];

export const inventoryStatusOptions: { value: 'all' | StockStatus; label: string }[] = [
  { value: 'all', label: 'All status' },
  { value: 'reorder', label: 'Below reorder' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'expiring_soon', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'quality_hold', label: 'Quality hold' },
  { value: 'in_stock', label: 'In stock' },
];

export const inventoryQualityStatuses = ['available', 'quality_hold', 'quarantine', 'damaged', 'spoiled'];

export const inventoryChartColors = {
  available: 'hsl(var(--primary))',
  reorder: 'hsl(var(--warning))',
  category: 'hsl(var(--info))',
  dispatched: 'hsl(var(--accent))',
};

const qualityHoldStatuses = ['quality_hold', 'quarantine', 'damaged', 'spoiled'];

export function labelize(value: string | null | undefined) {
  if (!value) return 'Unassigned';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getDaysUntil(date: string | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getStockStatus(item: InventoryItem): StockStatus {
  const quantity = Number(item.quantity || 0);
  const minStock = Number(item.min_stock_level || 0);
  const daysUntilExpiry = getDaysUntil(item.expiry_date);
  const qualityStatus = item.quality_status || 'available';

  if (qualityHoldStatuses.includes(qualityStatus)) return 'quality_hold';
  if (daysUntilExpiry !== null && daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry !== null && daysUntilExpiry <= 45) return 'expiring_soon';
  if (minStock > 0 && quantity <= minStock) return 'reorder';
  if (minStock > 0 && quantity <= minStock * 1.5) return 'low_stock';
  return 'in_stock';
}

export function formatQuantity(value: number, unit?: string | null) {
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export function buildInventoryDashboard({
  inventory,
  movements,
  suppliers,
}: {
  inventory?: InventoryItem[];
  movements?: InventoryMovement[];
  suppliers?: Supplier[];
}) {
  const items = inventory || [];
  const movementRows = movements || [];
  const supplierMap = new Map((suppliers || []).map((supplier) => [supplier.id, supplier.name]));
  const latestMovementByItem = new Map<string, InventoryMovement>();

  movementRows.forEach((movement) => {
    const existing = latestMovementByItem.get(movement.inventory_id);
    const movementTime = new Date(movement.movement_date || movement.created_at || 0).getTime();
    const existingTime = existing ? new Date(existing.movement_date || existing.created_at || 0).getTime() : 0;
    if (!existing || movementTime > existingTime) {
      latestMovementByItem.set(movement.inventory_id, movement);
    }
  });

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const reservedQuantity = items.reduce((sum, item) => sum + Number(item.reserved_quantity || 0), 0);
  const inventoryValue = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
  const qualityHoldItems = items.filter((item) => qualityHoldStatuses.includes(item.quality_status || ''));
  const locations = Array.from(new Set(items.map((item) => item.location).filter(Boolean) as string[])).sort();
  const availableCategories = Array.from(new Set(items.map((item) => item.category))).sort();

  const enriched: EnrichedInventoryItem[] = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const minStock = Number(item.min_stock_level || 0);
    const reserved = Number(item.reserved_quantity || 0);
    const unitCost = Number(item.unit_cost || 0);
    const daysUntilExpiry = getDaysUntil(item.expiry_date);
    const status = getStockStatus(item);
    const coverage = minStock > 0 ? quantity / minStock : null;
    const lastMovement = latestMovementByItem.get(item.id) || null;

    return {
      ...item,
      quantity,
      min_stock_level: minStock,
      reserved_quantity: reserved,
      available_quantity: Math.max(quantity - reserved, 0),
      unit_cost: unitCost,
      stock_value: quantity * unitCost,
      status,
      daysUntilExpiry,
      coverage,
      supplier_name: item.supplier_id ? supplierMap.get(item.supplier_id) || 'Linked supplier' : null,
      last_movement: lastMovement,
    };
  });

  const reorderItems = enriched
    .filter((item) => item.min_stock_level > 0 && item.quantity <= item.min_stock_level)
    .sort((a, b) => (a.coverage || 0) - (b.coverage || 0));
  const lowStockItems = enriched
    .filter((item) => item.min_stock_level > 0 && item.quantity <= item.min_stock_level * 1.5)
    .sort((a, b) => (a.coverage || 0) - (b.coverage || 0));
  const expiryItems = enriched
    .filter((item) => item.daysUntilExpiry !== null && item.daysUntilExpiry <= 45)
    .sort((a, b) => (a.daysUntilExpiry || 0) - (b.daysUntilExpiry || 0));

  const categoryData = availableCategories
    .map((category) => {
      const categoryItems = enriched.filter((item) => item.category === category);
      const quantity = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
      const risk = categoryItems.filter((item) => item.status === 'reorder' || item.status === 'low_stock').length;

      return {
        category,
        name: labelize(category),
        quantity,
        items: categoryItems.length,
        risk,
      };
    })
    .sort((a, b) => b.quantity - a.quantity);

  const maxCategoryQuantity = Math.max(...categoryData.map((item) => item.quantity), 1);

  const reorderChartData = lowStockItems.slice(0, 6).map((item) => ({
    name: item.item_name.length > 18 ? `${item.item_name.slice(0, 18)}...` : item.item_name,
    available: item.quantity,
    reorder: item.min_stock_level,
    unit: item.unit || '',
  }));

  const locationData = locations
    .map((location) => {
      const locationItems = enriched.filter((item) => item.location === location);
      return {
        location,
        items: locationItems.length,
        quantity: locationItems.reduce((sum, item) => sum + item.quantity, 0),
        risk: locationItems.filter((item) => item.status !== 'in_stock').length,
      };
    })
    .sort((a, b) => b.items - a.items);

  // The six-month movement window is a UI aggregation boundary only.
  // Replacing it with a backend view/RPC later will not change the dashboard contract.
  const movementMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date),
      received: 0,
      dispatched: 0,
    };
  });

  movementRows.forEach((movement) => {
    const movementDate = new Date(movement.movement_date || '');
    if (Number.isNaN(movementDate.getTime())) return;

    const key = `${movementDate.getFullYear()}-${String(movementDate.getMonth() + 1).padStart(2, '0')}`;
    const month = movementMonths.find((entry) => entry.key === key);
    if (!month) return;

    if (movement.movement_type === 'received') month.received += Number(movement.quantity || 0);
    if (movement.movement_type === 'dispatched') month.dispatched += Number(movement.quantity || 0);
  });

  const currentMonth = new Date();
  const receivedThisMonth = movementRows
    .filter((movement) => {
      const movementDate = new Date(movement.movement_date || '');
      return (
        movement.movement_type === 'received' &&
        movementDate.getMonth() === currentMonth.getMonth() &&
        movementDate.getFullYear() === currentMonth.getFullYear()
      );
    })
    .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);

  const dispatchedThisMonth = movementRows
    .filter((movement) => {
      const movementDate = new Date(movement.movement_date || '');
      return (
        movement.movement_type === 'dispatched' &&
        movementDate.getMonth() === currentMonth.getMonth() &&
        movementDate.getFullYear() === currentMonth.getFullYear()
      );
    })
    .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);

  return {
    enriched,
    totalQuantity,
    reservedQuantity,
    inventoryValue,
    qualityHoldItems,
    receivedThisMonth,
    dispatchedThisMonth,
    locations,
    availableCategories,
    lowStockItems,
    reorderItems,
    expiryItems,
    categoryData,
    maxCategoryQuantity,
    reorderChartData,
    locationData,
    movementData: movementMonths,
  };
}
