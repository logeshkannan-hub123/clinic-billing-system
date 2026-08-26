import type { ListBillsParams } from './bills'
import type { ListMedicinesParams } from './medicines'
import type { MedicineCategory } from '../types/api'

export const queryKeys = {
  me: ['me'] as const,
  setupStatus: ['setup-status'] as const,
  dashboard: (date?: string) => ['dashboard', date ?? 'today'] as const,
  bills: (params: ListBillsParams) => ['bills', params] as const,
  bill: (id: string) => ['bill', id] as const,
  taxSettings: ['settings', 'tax'] as const,
  receptionists: ['receptionists'] as const,
  clinicSettings: ['settings', 'clinic-settings'] as const,
  displaySettings: ['settings', 'display'] as const,
  medicines: (params: ListMedicinesParams = {}) => ['medicines', params] as const,
  medicineSearch: (q: string, category?: MedicineCategory) => ['medicines', 'search', q, category] as const,
}
