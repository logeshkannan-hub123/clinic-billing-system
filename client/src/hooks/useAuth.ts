import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { changePassword, deleteAdminAccount, fetchCurrentUser, fetchSetupStatus, login, logout, signup } from '../api/auth'
import { queryKeys } from '../api/queryKeys'

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

/** Powers the login screen's decision to offer first-time admin setup — only
 * relevant before anyone is authenticated, so it's fetched unauthenticated. */
export function useSetupStatus() {
  return useQuery({
    queryKey: queryKeys.setupStatus,
    queryFn: fetchSetupStatus,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      login(username, password),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.me, user)
    },
  })
}

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      signup(username, password),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.me, user)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Runs on success AND failure — including a 401 (the session was
      // already expired/invalid server-side by the time this request
      // arrived). Local auth state must be cleared either way: there is
      // nothing left server-side to "still be logged into", so leaving the
      // cache populated would just strand the user on a broken page.
      // Wipes all cached server state, not just `me` — avoids the next
      // person on a shared machine ever seeing a stale trace of this
      // session's data before their own queries refetch.
      queryClient.clear()
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      changePassword(currentPassword, newPassword),
  })
}

export function useDeleteAdminAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (password: string) => deleteAdminAccount(password),
    onSuccess: () => {
      queryClient.clear()
    },
  })
}
