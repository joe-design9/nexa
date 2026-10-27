// Nexa – API-Client mit JWT-Access-Token, httpOnly-Refresh-Cookie
// (credentials:'include') und Single-Flight-Refresh bei 401.
import { dicts, fmt, getActiveLocale, localizedApiError } from './i18n';

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfter?: number;
  constructor(status: number, message: string, code?: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function apiBase(): string {
  if (typeof window !== 'undefined' && window.__NEXA_API_URL__) return window.__NEXA_API_URL__;
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
}

export function livekitUrl(): string {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
}

let refreshPromise: Promise<string | null> | null = null;

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem('nexa_access_token');
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) sessionStorage.setItem('nexa_access_token', token);
    else sessionStorage.removeItem('nexa_access_token');
  } catch {
    /* ignore */
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${apiBase()}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      const token = (data as Record<string, unknown>).accessToken ?? (data as Record<string, unknown>).token ?? (data as Record<string, unknown>).access_token;
      if (typeof token === 'string' && token) {
        setToken(token);
        return token;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  tokenOverride?: string | null;
  retry?: boolean;
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = options.tokenOverride !== undefined ? options.tokenOverride : getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && options.retry !== false && token) {
    const fresh = await refreshAccessToken();
    if (fresh) return api<T>(path, { ...options, tokenOverride: fresh, retry: false });
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const obj = (data && typeof data === 'object' ? (data as Record<string, unknown>) : {}) as Record<string, unknown>;
    const errObj = (obj.error && typeof obj.error === 'object' ? (obj.error as Record<string, unknown>) : null) as Record<string, unknown> | null;
    const errors = dicts[getActiveLocale()].errors;
    const rawMessage =
      (typeof obj.message === 'string' ? obj.message : undefined) ??
      (typeof errObj?.message === 'string' ? errObj.message : undefined) ??
      (typeof obj.error === 'string' ? obj.error : undefined) ??
      fmt(errors.REQUEST_FAILED, { status: res.status });
    const code = (typeof obj.code === 'string' ? obj.code : undefined) ?? (typeof errObj?.code === 'string' ? errObj.code : undefined);
    // Bekannte Fehlercodes werden clientseitig in die aktive Sprache
    // übersetzt; die Server-Meldung bleibt sonst unverändert erhalten.
    const message = localizedApiError(code, Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage);
    const retryRaw = (obj.retryAfter ?? obj.retry_after ?? errObj?.retryAfter) as number | undefined;
    throw new ApiError(res.status, message, code, typeof retryRaw === 'number' ? retryRaw : undefined);
  }
  return data as T;
}

export const get = <T = unknown>(path: string, opts?: Omit<ApiOptions, 'method' | 'body'>) => api<T>(path, { ...opts, method: 'GET' });
export const post = <T = unknown>(path: string, body?: unknown, opts?: Omit<ApiOptions, 'method' | 'body'>) => api<T>(path, { ...opts, method: 'POST', body });
export const patch = <T = unknown>(path: string, body?: unknown, opts?: Omit<ApiOptions, 'method' | 'body'>) => api<T>(path, { ...opts, method: 'PATCH', body });
export const del = <T = unknown>(path: string, opts?: Omit<ApiOptions, 'method' | 'body'>) => api<T>(path, { ...opts, method: 'DELETE' });
export const put = <T = unknown>(path: string, body?: unknown, opts?: Omit<ApiOptions, 'method' | 'body'>) => api<T>(path, { ...opts, method: 'PUT', body });

// Upload über Presign: POST /uploads/presign → PUT auf uploadUrl → Attachment-Objekt.
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<{ fileName: string; url: string; contentType: string; size: number }> {
  const presign = await post<{ uploadUrl: string; url?: string; key?: string; attachment?: { fileName: string; url: string; contentType: string; size: number } }>('/uploads/presign', {
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  });
  const target = presign.uploadUrl || presign.url;
  const errors = dicts[getActiveLocale()].errors;
  if (!target) throw new Error(errors.UPLOAD_TARGET_MISSING);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(fmt(errors.UPLOAD_FAILED, { status: xhr.status }))));
    xhr.onerror = () => reject(new Error(errors.UPLOAD_NETWORK));
    xhr.send(file);
  });
  if (presign.attachment) return presign.attachment;
  return { fileName: file.name, url: target.split('?')[0], contentType: file.type || 'application/octet-stream', size: file.size };
}
