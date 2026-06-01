// HTTP client for the AMIS backend.
// Access token lives in memory (XSS-safe). Refresh token lives in localStorage.
// On 401, silently refreshes then retries the original request once.

import { RefreshResponse } from '@/types/auth';

let _accessToken: string | null = null;
let _refreshInFlight: Promise<string> | null = null;

export const setAccessToken = (t: string) => { _accessToken = t; };
export const getAccessToken = () => _accessToken;

export function clearTokens() {
  _accessToken = null;
  localStorage.removeItem('amis_refresh_token');
}

async function silentRefresh(): Promise<string> {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem('amis_refresh_token');
    if (!refreshToken) throw new Error('No refresh token');

    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      window.location.href = '/auth';
      throw new Error('Refresh failed');
    }

    const data: RefreshResponse = await res.json();
    setAccessToken(data.accessToken);
    return data.accessToken;
  })().finally(() => { _refreshInFlight = null; });

  return _refreshInFlight;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type RequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

function buildApiUrl(path: string) {
  return path.startsWith('/api/') ? path : `/api/v1${path}`;
}

function buildHeaders(body: unknown, extra?: Record<string, string>) {
  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (_accessToken) headers.Authorization = `Bearer ${_accessToken}`;
  return { ...headers, ...extra };
}

async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, signal } = options;
  const headers = buildHeaders(body, extraHeaders);
  const isFormData = body instanceof FormData;

  const init: RequestInit = { method, headers, signal };
  if (body !== undefined) init.body = isFormData ? body : JSON.stringify(body);

  const url = buildApiUrl(path);
  let res = await fetch(url, init);

  if (res.status === 401) {
    try {
      const newToken = await silentRefresh();
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(url, { ...init, headers });
    } catch {
      throw new Error('Unauthorized');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText, code: 'UNKNOWN' }));
    throw Object.assign(new Error(err.error || 'Request failed'), { code: err.code });
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const api = {
  get:    <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  post:   <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...options, body }),
  patch:  <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PATCH', path, { ...options, body }),
  put:    <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PUT', path, { ...options, body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, options),
};

export default api;
export { buildApiUrl, buildHeaders };
