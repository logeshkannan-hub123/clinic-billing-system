import { useEffect } from 'react'

const CONFIRM_MESSAGE = 'You have unsaved changes. Leave without saving?'

/**
 * Tab close / refresh / external navigation: the browser's native
 * `beforeunload` prompt, which works regardless of router setup.
 *
 * In-app navigation (e.g. switching Settings sections): this app uses a
 * plain `<BrowserRouter>` (declarative mode), not a data router, so React
 * Router's `useBlocker` isn't available here — it only works with routers
 * created via `createBrowserRouter`. `confirmNavigation()` is the
 * router-agnostic substitute: call it from a link's `onClick` and call
 * `event.preventDefault()` if it returns false. See `SettingsNav.tsx` for
 * the one place this app actually needs that (switching between Settings
 * sections mid-edit).
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  function confirmNavigation(): boolean {
    if (!isDirty) return true
    return window.confirm(CONFIRM_MESSAGE)
  }

  return { confirmNavigation }
}
