import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface FormFieldWrapperProps {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}

export function FormFieldWrapper({ label, htmlFor, required, hint, error, children }: FormFieldWrapperProps) {
  return (
    <div className={`form-field${error ? ' form-field--error' : ''}`}>
      <label className="form-field__label" htmlFor={htmlFor}>
        {label}
        {required && (
          <>
            {' '}
            <span className="form-field__required" aria-hidden="true">
              *
            </span>
          </>
        )}
      </label>
      {children}
      {error ? (
        <span className="form-field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="form-field__hint">{hint}</span>
      ) : null}
    </div>
  )
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  hint?: string
  error?: string
}

export function TextField({ label, id, hint, error, required, className = '', ...rest }: TextFieldProps) {
  return (
    <FormFieldWrapper label={label} htmlFor={id} required={required} hint={hint} error={error}>
      <input
        id={id}
        className={`input ${className}`.trim()}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
    </FormFieldWrapper>
  )
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  id: string
  hint?: string
  error?: string
}

export function TextareaField({ label, id, hint, error, required, className = '', ...rest }: TextareaFieldProps) {
  return (
    <FormFieldWrapper label={label} htmlFor={id} required={required} hint={hint} error={error}>
      <textarea
        id={id}
        className={`textarea ${className}`.trim()}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
    </FormFieldWrapper>
  )
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  id: string
  hint?: string
  error?: string
  children: ReactNode
}

export function SelectField({ label, id, hint, error, required, className = '', children, ...rest }: SelectFieldProps) {
  return (
    <FormFieldWrapper label={label} htmlFor={id} required={required} hint={hint} error={error}>
      <select id={id} className={`select ${className}`.trim()} required={required} {...rest}>
        {children}
      </select>
    </FormFieldWrapper>
  )
}
