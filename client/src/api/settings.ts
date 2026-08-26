import { apiClient } from './client'
import type { ClinicSettings, ClinicSettingsPatch, DisplaySettings } from '../types/api'

export function fetchClinicSettings(): Promise<ClinicSettings> {
  return apiClient.get<ClinicSettings>('/admin/clinic-settings')
}

export function updateClinicSettings(patch: ClinicSettingsPatch): Promise<ClinicSettings> {
  return apiClient.patch<ClinicSettings>('/admin/clinic-settings', patch)
}

export function fetchDisplaySettings(): Promise<DisplaySettings> {
  return apiClient.get<DisplaySettings>('/settings/display')
}
