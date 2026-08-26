import { apiClient } from './client'
import type { CurrentUser, SetupStatus } from '../types/api'

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiClient.get<CurrentUser>('/auth/me')
}

export function fetchSetupStatus(): Promise<SetupStatus> {
  return apiClient.get<SetupStatus>('/auth/setup-status')
}

export function login(username: string, password: string): Promise<CurrentUser> {
  return apiClient.post<CurrentUser>('/auth/login', { username, password })
}

export function signup(username: string, password: string): Promise<CurrentUser> {
  return apiClient.post<CurrentUser>('/auth/signup', { username, password })
}

export function logout(): Promise<void> {
  return apiClient.post<void>('/auth/logout')
}

export function deleteAdminAccount(password: string): Promise<void> {
  return apiClient.delete<void>('/admin/account', { password })
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiClient.patch<void>('/auth/password', { currentPassword, newPassword })
}
