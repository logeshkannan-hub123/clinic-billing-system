import { apiClient } from './client'
import type {
  DashboardSummary,
  ReceptionistListItem,
  ReceptionistMutationResult,
  TaxConfig,
} from '../types/api'

export function fetchDashboard(date?: string): Promise<DashboardSummary> {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiClient.get<DashboardSummary>(`/admin/dashboard${query}`)
}

export function fetchTaxConfig(): Promise<TaxConfig> {
  return apiClient.get<TaxConfig>('/admin/settings')
}

export function updateTaxConfig(input: TaxConfig): Promise<TaxConfig> {
  return apiClient.patch<TaxConfig>('/admin/settings', input)
}

export function listReceptionists(): Promise<ReceptionistListItem[]> {
  return apiClient.get<ReceptionistListItem[]>('/admin/receptionists')
}

export function createReceptionist(input: {
  staffId: string
  username: string
  password: string
}): Promise<ReceptionistMutationResult> {
  return apiClient.post<ReceptionistMutationResult>('/admin/receptionists', input)
}

export function setReceptionistActive(
  id: string,
  isActive: boolean,
): Promise<ReceptionistMutationResult> {
  return apiClient.patch<ReceptionistMutationResult>(`/admin/receptionists/${id}`, { isActive })
}

export function resetReceptionistPassword(id: string, password: string): Promise<void> {
  return apiClient.patch<void>(`/admin/receptionists/${id}/password`, { password })
}

export function deleteReceptionist(id: string): Promise<void> {
  return apiClient.delete<void>(`/admin/receptionists/${id}`)
}
