import type { ClinicSettings, ClinicSettingsPatch, DisplaySettings } from '../types/api'

/** Mirrors the server's schema defaults (server/src/models/ClinicSettings.ts)
 * so section tests exercise the same "nothing configured yet" starting
 * point the real backend would return. */
export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  clinic: {
    name: 'VMF HEALTH CARE',
    doctorName: '',
    logoUrl: null,
    phone: '',
    email: '',
    website: '',
    address: '',
    registrationNumber: '',
    gstNumber: '',
  },
  billing: {
    invoicePrefix: 'INV',
    allowPartialPayments: true,
    duplicateWarningEnabled: true,
    defaultConsultationFeeInPaise: 0,
  },
  receipt: {
    showLogo: true,
    showClinicAddress: true,
    showClinicPhone: true,
    showDoctorName: true,
    showTax: true,
    showPaymentMethod: true,
    showPaymentHistory: true,
    paperSize: 'A4',
    footerText: '',
  },
  payments: { cashEnabled: true, upiEnabled: true },
  regional: { currencySymbol: '₹', dateFormat: 'DD/MM/YYYY', timeFormat: '12h' },
  security: { sessionTimeoutMinutes: 720 },
}

export function toDisplaySettings(settings: ClinicSettings): DisplaySettings {
  return {
    clinic: settings.clinic,
    receipt: settings.receipt,
    payments: settings.payments,
    defaultConsultationFeeInPaise: settings.billing.defaultConsultationFeeInPaise,
  }
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = toDisplaySettings(DEFAULT_CLINIC_SETTINGS)

/** Same shallow-per-section merge the real PATCH /api/admin/clinic-settings
 * performs — used by mocked PATCH handlers in tests. */
export function mergeClinicSettings(base: ClinicSettings, patch: ClinicSettingsPatch): ClinicSettings {
  return {
    clinic: patch.clinic ? { ...base.clinic, ...patch.clinic } : base.clinic,
    billing: patch.billing ? { ...base.billing, ...patch.billing } : base.billing,
    receipt: patch.receipt ? { ...base.receipt, ...patch.receipt } : base.receipt,
    payments: patch.payments ? { ...base.payments, ...patch.payments } : base.payments,
    regional: patch.regional ? { ...base.regional, ...patch.regional } : base.regional,
    security: patch.security ? { ...base.security, ...patch.security } : base.security,
  }
}
