import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ToastProvider } from '../components/Toast'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', queryClient = createTestQueryClient() }: { route?: string; queryClient?: QueryClient } = {},
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

interface MockRoute {
  method: string
  path: string | RegExp
  /** `requestPath` is the full matched path including its query string —
   * useful for routes whose behavior depends on query params (e.g. a list
   * endpoint filtered by category), without needing a second regex just to
   * extract them. */
  respond: (body?: unknown, requestPath?: string) => { status?: number; body?: unknown }
}

/**
 * Minimal fetch mock matching on method + path against the API layer's
 * `/api/...` calls — no real backend involved, per the architecture doc's
 * test strategy.
 */
export function mockApi(routes: MockRoute[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = (init?.method ?? 'GET').toUpperCase()
      const path = url.replace(/^https?:\/\/[^/]+/, '')

      const requestBody = init?.body ? JSON.parse(init.body as string) : undefined
      const match = routes.find(
        (route) => route.method === method && (typeof route.path === 'string' ? route.path === path : route.path.test(path)),
      )

      if (!match) {
        throw new Error(`Unmocked request: ${method} ${path}`)
      }

      const { status = 200, body } = match.respond(requestBody, path)
      const text = body === undefined ? '' : JSON.stringify(body)

      return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => text,
      } as Response
    }),
  )
}
