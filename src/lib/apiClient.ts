const BASE = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Backend trả error dưới dạng `{"detail": "..."}`. Cố gắng parse JSON trước,
 * fallback về raw text để không nuốt thông tin debug.
 */
async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return res.statusText || `HTTP ${res.status}`;
  try {
    const data = JSON.parse(text);
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) return data.detail.map((d: { msg?: string }) => d.msg ?? '').join('; ');
  } catch { /* not JSON */ }
  return text;
}

export async function apiFetch(
  path: string,
  init: RequestInit,
  getToken: () => Promise<string>,
): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  return res;
}

export async function apiJson<T>(
  path: string, init: RequestInit, getToken: () => Promise<string>,
): Promise<T> {
  const r = await apiFetch(path, init, getToken);
  return r.json() as Promise<T>;
}
