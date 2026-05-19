import type { QueryClient, QueryKey } from '@tanstack/react-query';

const SHARED_QUERY_KEYS: QueryKey[] = [
  ['amis-dashboard-overview'],
  ['reports-summary-v2'],
  ['reports-alerts'],
  ['reports-trend-finance'],
  ['reports-trend-production'],
  ['reports-trend-labor'],
  ['reports-trend-assets'],
  ['reports-performance-products'],
  ['reports-performance-suppliers'],
  ['reports-performance-workers'],
  ['reports-performance-assets'],
  ['reports-preview'],
  ['audit-summary'],
  ['audit-events'],
  ['audit-suspicious'],
];

export function refreshModuleData(queryClient: QueryClient, moduleKeys: QueryKey[] = []) {
  return Promise.all(
    [...moduleKeys, ...SHARED_QUERY_KEYS].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
