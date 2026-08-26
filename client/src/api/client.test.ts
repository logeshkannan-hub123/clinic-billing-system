import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, ApiError } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status,
      ok: status >= 200 && status < 300,
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    })),
  )
}

describe('apiClient error handling', () => {
  it('surfaces the server-provided error message from a JSON error body', async () => {
    mockFetchOnce(400, { error: 'patientName is required' })

    await expect(apiClient.post('/bills', {})).rejects.toMatchObject({
      message: 'patientName is required',
      status: 400,
    })
  })

  it('falls back to a generic message when the error body has no `error` field', async () => {
    mockFetchOnce(500, { unexpected: 'shape' })

    await expect(apiClient.get('/bills')).rejects.toMatchObject({
      message: 'Request failed with status 500',
      status: 500,
    })
  })

  it('falls back gracefully when the response body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 502, ok: false, text: async () => '<html>Bad Gateway</html>' })),
    )

    await expect(apiClient.get('/dashboard')).rejects.toBeInstanceOf(ApiError)
  })

  it('treats 204 No Content as a successful empty response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 204, ok: true, text: async () => '' })))

    await expect(apiClient.post('/auth/logout')).resolves.toBeUndefined()
  })

  it('always sends credentials so the httpOnly session cookie is included', async () => {
    const fetchSpy = vi.fn(async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ ok: true }) }))
    vi.stubGlobal('fetch', fetchSpy)

    await apiClient.get('/auth/me')

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }))
  })
})
