export type ConnectedBusinessMetrics = {
  inventoryValue: number;
  salesRevenue: number;
  procurementExpenses: number;
  productionOutput: number;
  payrollCost: number;
  maintenanceCost: number;
  alerts: number;
  auditEvents: number;
};

export function summarizeConnectedMetrics(metrics: ConnectedBusinessMetrics) {
  return {
    ...metrics,
    netOperatingPosition: Number((metrics.salesRevenue - metrics.procurementExpenses - metrics.payrollCost - metrics.maintenanceCost).toFixed(2)),
  };
}
