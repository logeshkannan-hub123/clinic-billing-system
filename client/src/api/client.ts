// In production the frontend (Vercel) and backend (Render) are on different
// domains, so a relative "/api" path would resolve to the frontend's own
// origin and 404/405. VITE_API_URL must be set in Vercel's env vars to the
// Render backend's URL, e.g. https://clinic-billing-system.onrender.com/api.
// Falls back to "/api" for local dev, where Vite's dev server proxy (or a
// same-origin setup) can still handle it.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const value = (body as Record<string, unknown>).error
    if (typeof value === 'string') return value
  }
  return `Request failed with status ${status}`
}

// Paths where a 401 is an expected, *unauthenticated* response, not a sign
// that a previously-valid session just expired — e.g. login with a wrong
// password. The global session-expiry handler below must never fire for
// these, or a simple failed login attempt would look like a forced logout.
const AUTH_EXEMPT_PATHS = new Set(['/auth/login', '/auth/signup', '/auth/setup-status'])

// Set once, from a single place near the app root (see useSessionExpiry in
// App.tsx), so every API call — not just the ones a component happens to
// watch `isError` on — can trigger the same centralized "session expired"
// handling: clear stale cached auth state and redirect to /login. A plain
// module-level callback rather than a React context/event bus because
// `request()` here has no component tree to read from; this is the
// project's existing pattern (see queryKeys.ts / api/*.ts being plain
// modules with no React dependency of their own).
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !AUTH_EXEMPT_PATHS.has(path)) {
      unauthorizedHandler?.()
    }
    throw new ApiError(response.status, extractErrorMessage(body, response.status), body)
  }

  return body as T
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
}