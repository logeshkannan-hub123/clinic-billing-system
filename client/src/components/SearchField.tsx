import type { InputHTMLAttributes } from 'react'
import { Icon } from './icons'
import { IconButton } from './Button'

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (value: string) => void
  label: string
}

export function SearchField({ value, onChange, label, placeholder = 'Search…', ...rest }: SearchFieldProps) {
  return (
    <div className="search-field">
      <Icon name="search" size={18} />
      <label className="visually-hidden" htmlFor="search-field-input">
        {label}
      </label>
      <input
        id="search-field-input"
        type="search"
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
      {value && (
        <span className="search-field__clear">
          <IconButton label="Clear search" size="sm" onClick={() => onChange('')}>
            <Icon name="close" size={16} />
          </IconButton>
        </span>
      )}
    </div>
  )
}
