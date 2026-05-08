const BASE = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
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
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''));
  return res;
}

export async function apiJson<T>(
  path: string, init: RequestInit, getToken: () => Promise<string>,
): Promise<T> {
  const r = await apiFetch(path, init, getToken);
  return r.json() as Promise<T>;
}
