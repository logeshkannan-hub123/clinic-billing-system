import { useId } from 'react'
import { TextField } from './FormField'

interface PatientSelectorProps {
  name: string
  phone: string
  onNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  nameError?: string
  phoneError?: string
  disabled?: boolean
}

/**
 * Name/phone capture only — there is no patient-search API. The server's
 * `findOrCreatePatient` deduplicates by name+phone, so typing an existing
 * patient's details reuses their record automatically.
 */
export function PatientSelector({
  name,
  phone,
  onNameChange,
  onPhoneChange,
  nameError,
  phoneError,
  disabled,
}: PatientSelectorProps) {
  const nameId = useId()
  const phoneId = useId()

  return (
    <div className="form-grid">
      <TextField
        id={nameId}
        label="Patient name"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Full name"
        error={nameError}
        disabled={disabled}
        autoComplete="off"
        required
      />
      <TextField
        id={phoneId}
        label="Patient phone"
        type="tel"
        inputMode="numeric"
        value={phone}
        onChange={(event) => onPhoneChange(event.target.value.replace(/\D/g, '').slice(0, 10))}
        placeholder="10-digit mobile number"
        error={phoneError ?? (phone.length > 0 && phone.length < 10 ? `Enter all 10 digits (${phone.length}/10)` : undefined)}
        disabled={disabled}
        autoComplete="off"
        required
      />
    </div>
  )
}
