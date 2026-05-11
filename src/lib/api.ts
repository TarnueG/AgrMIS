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

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (_accessToken) headers.Authorization = `Bearer ${_accessToken}`;

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = isFormData ? body : JSON.stringify(body);

  let res = await fetch(`/api/v1${path}`, init);

  if (res.status === 401) {
    try {
      const newToken = await silentRefresh();
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`/api/v1${path}`, { ...init, headers });
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
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown)  => request<T>('POST',   path, body),
  patch:  <T>(path: string, body?: unknown)  => request<T>('PATCH',  path, body),
  put:    <T>(path: string, body?: unknown)  => request<T>('PUT',    path, body),
  delete: <T>(path: string)                  => request<T>('DELETE', path),
};

export default api;
