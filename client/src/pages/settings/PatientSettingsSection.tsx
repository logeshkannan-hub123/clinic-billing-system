import { Card, CardHeader } from '../../components/Card'
import { Switch } from '../../components/Switch'

/**
 * Deliberately minimal — see docs/architecture/admin-settings.md, "Fields
 * I'm proposing NOT to implement as stated". `Patient.phone` is a required
 * schema field woven through dedup, search, and duplicate-bill detection;
 * making it optional would be a real breaking data-model change, not a
 * settings flip, so this is shown locked rather than as a working toggle.
 * There's no human-readable Patient ID anywhere in this app today, so a
 * `patientIdPrefix` setting is intentionally not offered either — it would
 * configure a feature that doesn't exist. Duplicate-patient warning is the
 * same underlying setting as Billing's "Duplicate Bill Warning" (there is
 * only one duplicate-detection mechanism, keyed on phone + amount), so it
 * isn't duplicated here — see the Billing section.
 */
export function PatientSettingsSection() {
  return (
    <Card>
      <CardHeader title="Patient Settings" />
      <div className="settings-form">
        <Switch
          id="patients-require-phone"
          checked
          disabled
          onChange={() => {}}
          label="Patient phone is required"
          hint="Always required — phone is part of the core patient record."
        />
        <p className="settings-note">
          Duplicate-patient detection uses the same setting as "Duplicate Bill Warning" on the
          Billing page — there's one duplicate check, not two.
        </p>
      </div>
    </Card>
  )
}
