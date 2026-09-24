export class ApiError extends Error {
  /** The whole parsed body: some refusals carry more than a code, e.g. the
   *  `problems[]` a 422 from publish uses to name the offending question. */
  constructor(readonly status: number, readonly code: string, readonly body?: Record<string, unknown>) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
}

/**
 * The one way this app talks to the API. `credentials: 'include'` on every call
 * because the session is an httpOnly cookie — there is no token in JavaScript to
 * forget to attach, and none for a stray script to read.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch {
    // A dropped connection is not a 500; the screens tell the two apart.
    throw new ApiError(0, 'network_error');
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!res.ok) throw new ApiError(res.status, String(body?.error ?? 'error'), body ?? undefined);
  return body as T;
}

export const apiSend = <T>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
