import type { ReactNode } from 'react'

interface SwitchProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: ReactNode
  hint?: ReactNode
}

/** Material 3-style toggle switch. Native checkbox semantics underneath —
 * `role="switch"` on top of a real checkbox input, so checked state, keyboard
 * (Space toggles, native), and disabled state all come from the browser for
 * free rather than being reimplemented. The whole row is one <label>, so
 * clicking the hint text toggles it too, same as clicking the switch itself. */
export function Switch({ id, checked, onChange, disabled, label, hint }: SwitchProps) {
  return (
    <label className={`switch-field${disabled ? ' switch-field--disabled' : ''}`}>
      <span className="switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
        />
        <span className="switch__track" aria-hidden="true">
          <span className="switch__thumb" />
        </span>
      </span>
      <span className="switch-field__text">
        <span className="switch-field__label">{label}</span>
        {hint && <span className="switch-field__hint">{hint}</span>}
      </span>
    </label>
  )
}
