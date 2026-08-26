import { fireEvent, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { mockApi, renderWithProviders } from '../test/testUtils'
import { LoginPage } from './LoginPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/bills" element={<div>Generated Bills Landing</div>} />
      <Route path="/dashboard" element={<div>Dashboard Landing</div>} />
    </Routes>,
    { route: '/login' },
  )
}

describe('LoginPage', () => {
  it('logs an admin in and navigates to the dashboard', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ status: 401, body: { error: 'Unauthenticated' } }) },
      { method: 'GET', path: '/api/auth/setup-status', respond: () => ({ body: { adminExists: true } }) },
      {
        method: 'POST',
        path: '/api/auth/login',
        respond: () => ({ body: { id: '1', username: 'admin', role: 'admin' } }),
      },
    ])
    renderLogin()

    await screen.findByLabelText(/username/i)
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Dashboard Landing')).toBeInTheDocument()
  })

  it('shows the server error message on a failed login without leaking auth internals', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ status: 401, body: { error: 'Unauthenticated' } }) },
      { method: 'GET', path: '/api/auth/setup-status', respond: () => ({ body: { adminExists: true } }) },
      {
        method: 'POST',
        path: '/api/auth/login',
        respond: () => ({ status: 401, body: { error: 'Invalid username or password' } }),
      },
    ])
    renderLogin()

    await screen.findByLabelText(/username/i)
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password')
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
  })

  it('toggles into first-time admin signup mode when no admin exists yet', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ status: 401, body: { error: 'Unauthenticated' } }) },
      { method: 'GET', path: '/api/auth/setup-status', respond: () => ({ body: { adminExists: false } }) },
    ])
    renderLogin()

    await screen.findByText(/first time setting up this clinic/i)
    fireEvent.click(screen.getByText(/first time setting up this clinic/i))

    expect(screen.getByRole('heading', { name: /create the admin account/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /create admin account/i })).toBeInTheDocument())
  })

  it('never offers first-time setup once an admin already exists', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ status: 401, body: { error: 'Unauthenticated' } }) },
      { method: 'GET', path: '/api/auth/setup-status', respond: () => ({ body: { adminExists: true } }) },
    ])
    renderLogin()

    await screen.findByLabelText(/username/i)
    expect(screen.queryByText(/first time setting up this clinic/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})
