export interface CardDef {
  key: string;
  label: string;
}

export const CARD_REGISTRY: Record<string, CardDef[]> = {
  crm: [
    { key: 'total',      label: 'Total Customers' },
    { key: 'business',   label: 'Business' },
    { key: 'individual', label: 'Individual' },
  ],
  human_capital: [
    { key: 'contractor',      label: 'Contractor' },
    { key: 'suspension',      label: 'Suspension' },
    { key: 'active',          label: 'Active' },
    { key: 'inactive',        label: 'Inactive' },
    { key: 'employee',        label: 'Employee' },
    { key: 'daily',           label: 'Daily Workers' },
    { key: 'salary',          label: 'Salary' },
    { key: 'attendance_rate', label: 'Attendance Log' },
    { key: 'daily_log',       label: 'Daily Log' },
  ],
  inventory: [
    { key: 'cocoa_beans',      label: 'Cocoa Beans' },
    { key: 'palm_oil',         label: 'Palm Oil' },
    { key: 'dried_fish',       label: 'Dried Fish' },
    { key: 'livestock',        label: 'Livestock' },
    { key: 'pesticides',       label: 'Pesticides & Chemicals' },
    { key: 'fertilizers',      label: 'Fertilizers' },
    { key: 'livestock_feed',   label: 'Livestock Feed' },
    { key: 'aquaculture_feed', label: 'Aquaculture Feed' },
    { key: 'in_stock',         label: 'In Stock' },
    { key: 'low_stock',        label: 'Low Stock' },
    { key: 'alert',            label: 'Alert' },
    { key: 'stock_out',        label: 'Stock Out' },
    { key: 'failed',           label: 'Failed Requests' },
  ],
  livestock: [
    { key: 'pigs',      label: 'Pigs' },
    { key: 'fish',      label: 'Fish Ponds' },
    { key: 'health',    label: 'Health' },
    { key: 'mortality', label: 'Mortality' },
    { key: 'birds',     label: 'Birds' },
    { key: 'cattle',    label: 'Cattle' },
  ],
  machinery: [
    { key: 'total',       label: 'Total Equipment' },
    { key: 'active',      label: 'Active Equipments' },
    { key: 'operational', label: 'Operational' },
    { key: 'maintenance', label: 'In Maintenance' },
    { key: 'lost',        label: 'Lost Equipments' },
    { key: 'retired',     label: 'Retired Equipments' },
    { key: 'sold',        label: 'Sold Equipments' },
    { key: 'requests',    label: 'Pending Requests' },
  ],
  land_parcels: [
    { key: 'requested', label: 'Requested Parcel' },
    { key: 'active',    label: 'Active Parcel' },
    { key: 'inactive',  label: 'Inactive Parcel' },
    { key: 'total',     label: 'Total Parcel' },
  ],
  marketing: [
    { key: 'cart',       label: 'Shopping Cart' },
    { key: 'prices',     label: 'Prices' },
    { key: 'pending',    label: 'Pending' },
    { key: 'in_process', label: 'In Process' },
    { key: 'in_route',   label: 'In Route' },
    { key: 'completed',  label: 'Completed' },
  ],
  sales_order_points: [
    { key: 'pending',       label: 'Pending Order' },
    { key: 'processing',    label: 'Processing Order' },
    { key: 'en_route',      label: 'En Route' },
    { key: 'purchase',      label: 'Purchase Order' },
    { key: 'shopping_cart', label: 'Shopping Cart' },
  ],
  finance: [
    { key: 'income',            label: 'Total Income' },
    { key: 'expenses',          label: 'Total Expenses' },
    { key: 'profit',            label: 'Net Profit' },
    { key: 'purchase_requests', label: 'Purchase Requests' },
    { key: 'contractor',        label: 'Contractor Payment' },
    { key: 'wages',             label: 'Personnel Wages' },
  ],
  procurement: [
    { key: 'total',     label: 'Total POs' },
    { key: 'pending',   label: 'Pending Orders' },
    { key: 'received',  label: 'Received Orders' },
    { key: 'requested', label: 'Requested Orders' },
    { key: 'declined',  label: 'Declined Orders' },
  ],
  production: [
    { key: 'all',           label: 'Production Batches' },
    { key: 'pending',       label: 'Pending' },
    { key: 'in_process',    label: 'In Process' },
    { key: 'quality_check', label: 'Quality Check' },
    { key: 'passed',        label: 'Passed' },
    { key: 'rework',        label: 'Rework' },
    { key: 'requested',     label: 'Requested Orders' },
    { key: 'declined',      label: 'Declined Orders' },
  ],
};

export function allCardIds(subsystem: string): string[] {
  return (CARD_REGISTRY[subsystem] ?? []).map(c => `${subsystem}.${c.key}`);
}

export const ALL_CARD_IDS: string[] = Object.entries(CARD_REGISTRY).flatMap(
  ([sub, cards]) => cards.map(c => `${sub}.${c.key}`)
);
