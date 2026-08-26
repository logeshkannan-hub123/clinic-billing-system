import { useId, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { getErrorMessage } from '../components/Feedback'
import { TextField } from '../components/FormField'
import { CLINIC_MARK, CLINIC_NAME } from '../constants/clinic'
import { useCurrentUser, useLogin, useSetupStatus, useSignup } from '../hooks/useAuth'

export function LoginPage() {
  const { data: user, isLoading: isLoadingUser } = useCurrentUser()
  const { data: setupStatus } = useSetupStatus()
  const navigate = useNavigate()
  const loginMutation = useLogin()
  const signupMutation = useSignup()
  const usernameId = useId()
  const passwordId = useId()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  if (!isLoadingUser && user) {
    return <Navigate to={user.role === 'admin' ? '/dashboard' : '/bills'} replace />
  }

  // Only offer first-time admin setup while no admin exists yet. Hidden by
  // default (including while the check is still loading) — an admin has
  // already been created is the common case, and the toggle must never
  // flash into view for it.
  const canShowSignupOption = setupStatus?.adminExists === false
  const effectiveMode = canShowSignupOption ? mode : 'login'

  const activeMutation = effectiveMode === 'login' ? loginMutation : signupMutation

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const credentials = { username, password }
    const mutation = effectiveMode === 'login' ? loginMutation : signupMutation
    mutation.mutate(credentials, {
      onSuccess: (loggedInUser) => {
        navigate(loggedInUser.role === 'admin' ? '/dashboard' : '/bills', { replace: true })
      },
    })
  }

  return (
    <div className="auth-screen">
      <div className="auth-screen__brand">
        <span className="auth-screen__brand-mark" aria-hidden="true">
          {CLINIC_MARK}
        </span>
        <h1>{CLINIC_NAME}</h1>
        <p>
          A calm, accurate billing workspace for reception staff — clear totals, transparent tax and
          rounding, and a complete record of every bill and payment.
        </p>
      </div>

      <div className="auth-screen__form-side">
        <form className="auth-card" onSubmit={handleSubmit} noValidate>
          <div className="auth-card__heading">
            <h1>{effectiveMode === 'login' ? 'Sign in' : 'Create the Admin account'}</h1>
            <p className="auth-card__subtitle">
              {effectiveMode === 'login'
                ? 'Sign in to continue to the clinic workstation'
                : 'First-time setup for this clinic'}
            </p>
          </div>

          <TextField
            id={usernameId}
            label="Username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            required
          />

          <TextField
            id={passwordId}
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={effectiveMode === 'login' ? 'current-password' : 'new-password'}
            required
          />

          {activeMutation.isError && (
            <p className="inline-error" role="alert">
              {getErrorMessage(activeMutation.error, 'Something went wrong. Please try again.')}
            </p>
          )}

          <Button type="submit" fullWidth loading={activeMutation.isPending}>
            {effectiveMode === 'login' ? 'Log in' : 'Create Admin account'}
          </Button>

          {canShowSignupOption && (
            <Button
              type="button"
              variant="text"
              fullWidth
              onClick={() => setMode(effectiveMode === 'login' ? 'signup' : 'login')}
            >
              {effectiveMode === 'login' ? 'First time setting up this clinic?' : 'Already set up — log in instead'}
            </Button>
          )}
        </form>
      </div>
    </div>
  )
}
