import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createReceptionist,
  deleteReceptionist,
  fetchDashboard,
  fetchTaxConfig,
  listReceptionists,
  resetReceptionistPassword,
  setReceptionistActive,
  updateTaxConfig,
} from '../api/admin'
import { queryKeys } from '../api/queryKeys'
import { fetchClinicSettings, fetchDisplaySettings, updateClinicSettings } from '../api/settings'
import type { ClinicSettings, ClinicSettingsPatch, DisplaySettings, TaxConfig } from '../types/api'

export function useDashboard(date?: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(date),
    queryFn: () => fetchDashboard(date),
  })
}

export function useTaxSettings() {
  return useQuery({
    queryKey: queryKeys.taxSettings,
    queryFn: fetchTaxConfig,
  })
}

export function useUpdateTaxSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TaxConfig) => updateTaxConfig(input),
    onSuccess: (config) => {
      queryClient.setQueryData(queryKeys.taxSettings, config)
    },
  })
}

export function useReceptionists() {
  return useQuery({
    queryKey: queryKeys.receptionists,
    queryFn: listReceptionists,
  })
}

export function useCreateReceptionist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { staffId: string; username: string; password: string }) =>
      createReceptionist(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receptionists })
    },
  })
}

export function useSetReceptionistActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setReceptionistActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receptionists })
    },
  })
}

export function useDeleteReceptionist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteReceptionist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receptionists })
    },
  })
}

export function useResetReceptionistPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetReceptionistPassword(id, password),
  })
}

/** Derived, not re-fetched — `ClinicSettings` is a strict superset of
 * `DisplaySettings`'s fields, so a successful clinic-settings save can update
 * both caches from the one response instead of triggering a second request. */
function toDisplaySettings(settings: ClinicSettings): DisplaySettings {
  return {
    clinic: settings.clinic,
    receipt: settings.receipt,
    payments: settings.payments,
    defaultConsultationFeeInPaise: settings.billing.defaultConsultationFeeInPaise,
  }
}

export function useClinicSettings() {
  return useQuery({
    queryKey: queryKeys.clinicSettings,
    queryFn: fetchClinicSettings,
  })
}

export function useUpdateClinicSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: ClinicSettingsPatch) => updateClinicSettings(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.clinicSettings, settings)
      queryClient.setQueryData(queryKeys.displaySettings, toDisplaySettings(settings))
    },
  })
}

/** Admin and Receptionist both use this — BillingPage, PaymentDialog,
 * ReceiptView, Sidebar/AppLayout. */
export function useDisplaySettings() {
  return useQuery({
    queryKey: queryKeys.displaySettings,
    queryFn: fetchDisplaySettings,
    staleTime: 5 * 60 * 1000,
  })
}
