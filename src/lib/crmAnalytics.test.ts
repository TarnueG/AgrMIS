import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn() },
  buildApiUrl: (path: string) => `/api/v1${path}`,
  buildHeaders: () => ({ Authorization: 'Bearer token' }),
}));

import api from '@/lib/api';
import { crmAnalyticsApi } from '@/lib/crmAnalytics';

describe('crmAnalyticsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crmAnalyticsApi.invalidate();
  });

  it('returns summary data on success', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ total: 14, deltaPct: 5.2, period: 'last month' });

    await expect(crmAnalyticsApi.getCustomersSummary()).resolves.toEqual({
      total: 14,
      deltaPct: 5.2,
      period: 'last month',
    });
    expect(api.get).toHaveBeenCalledWith('/crm/analytics/customers/summary', { signal: undefined });
  });

  it('propagates data layer errors', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom'));

    await expect(crmAnalyticsApi.getPurchasesSummary()).rejects.toThrow('boom');
  });

  it('passes abort signals through requests', async () => {
    const controller = new AbortController();
    vi.mocked(api.get).mockImplementationOnce(async (_path, options) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    const request = crmAnalyticsApi.getCartsSummary(controller.signal);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
