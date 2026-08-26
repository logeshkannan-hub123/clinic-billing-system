import { apiClient } from './client'
import type {
  Medicine,
  MedicineCategory,
  MedicineInput,
  MedicineSearchResult,
  MedicineStatus,
  MedicineUpdateInput,
} from '../types/api'

export interface ListMedicinesParams {
  category?: MedicineCategory
  includeInactive?: boolean
}

function toQueryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value)
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function listMedicines(params: ListMedicinesParams = {}): Promise<Medicine[]> {
  const query = toQueryString({
    category: params.category,
    includeInactive: params.includeInactive === false ? 'false' : undefined,
  })
  return apiClient.get<Medicine[]>(`/medicines${query}`)
}

export function searchMedicines(q: string, category?: MedicineCategory): Promise<MedicineSearchResult[]> {
  const query = toQueryString({ q, category })
  return apiClient.get<MedicineSearchResult[]>(`/medicines/search${query}`)
}

export function createMedicine(input: MedicineInput): Promise<Medicine> {
  return apiClient.post<Medicine>('/medicines', input)
}

export function updateMedicine(id: string, patch: MedicineUpdateInput): Promise<Medicine> {
  return apiClient.patch<Medicine>(`/medicines/${id}`, patch)
}

export function setMedicineStatus(id: string, status: MedicineStatus): Promise<Medicine> {
  return apiClient.patch<Medicine>(`/medicines/${id}/status`, { status })
}

export function deleteMedicine(id: string): Promise<void> {
  return apiClient.delete<void>(`/medicines/${id}`)
}
