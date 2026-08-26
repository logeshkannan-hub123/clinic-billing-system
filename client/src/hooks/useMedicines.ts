import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createMedicine,
  deleteMedicine,
  listMedicines,
  searchMedicines,
  setMedicineStatus,
  updateMedicine,
  type ListMedicinesParams,
} from '../api/medicines'
import { queryKeys } from '../api/queryKeys'
import type { MedicineCategory, MedicineInput, MedicineStatus, MedicineUpdateInput } from '../types/api'

export function useMedicines(params: ListMedicinesParams = {}) {
  return useQuery({
    queryKey: queryKeys.medicines(params),
    queryFn: () => listMedicines(params),
  })
}

/** Idempotent/cacheable, unlike bill preview — a real `useQuery`, not a
 * mutation. `enabled` gates on a non-empty query so an empty/just-cleared
 * search box never fires a request. */
export function useMedicineSearch(query: string, category?: MedicineCategory) {
  return useQuery({
    queryKey: queryKeys.medicineSearch(query, category),
    queryFn: () => searchMedicines(query, category),
    enabled: query.trim().length > 0,
    staleTime: 30 * 1000,
  })
}

export function useCreateMedicine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MedicineInput) => createMedicine(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] })
    },
  })
}

export function useUpdateMedicine(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: MedicineUpdateInput) => updateMedicine(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] })
    },
  })
}

export function useSetMedicineStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MedicineStatus }) => setMedicineStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] })
    },
  })
}

export function useDeleteMedicine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteMedicine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] })
    },
  })
}
