import { useId } from 'react'

/**
 * Shared form controls.
 *
 * Every one of these generates its own id and points its <label> at it. They
 * used to render a bare <label> with no `for` and an <input> with no `id`, and
 * because nearly every admin form is built from them, that single omission was
 * responsible for the browser's whole list of form issues across the app —
 * labels attached to nothing, and controls a screen reader could not name.
 *
 * `useId` gives a stable value per instance that survives re-renders and does
 * not collide when the same field appears twice on a page. An explicit `id` or
 * `name` from the caller always wins.
 */
function useFieldIds({ id, name, error }) {
  const auto = useId()
  const fieldId = id || `fld-${auto}`
  return {
    fieldId,
    fieldName: name || fieldId,
    errorId: error ? `err-${auto}` : undefined,
  }
}

const Label = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
    {children}
  </label>
)

const ErrorText = ({ id, children }) => (
  <p id={id} className="text-xs text-red-600">{children}</p>
)

export default function Input({
  label,
  error,
  className = '',
  type = 'text',
  id,
  name,
  ...props
}) {
  const { fieldId, fieldName, errorId } = useFieldIds({ id, name, error })
  return (
    <div className={`space-y-1 ${className}`}>
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <input
        id={fieldId}
        name={fieldName}
        type={type}
        aria-label={label ? undefined : (props.placeholder || undefined)}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`
          w-full px-3 py-2 border rounded-lg text-sm
          focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent
          transition-colors placeholder-gray-400
          ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'}
        `}
        {...props}
      />
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  )
}

export function Textarea({ label, error, className = '', rows = 3, id, name, ...props }) {
  const { fieldId, fieldName, errorId } = useFieldIds({ id, name, error })
  return (
    <div className={`space-y-1 ${className}`}>
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <textarea
        id={fieldId}
        name={fieldName}
        rows={rows}
        aria-label={label ? undefined : (props.placeholder || undefined)}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`
          w-full px-3 py-2 border rounded-lg text-sm resize-none
          focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent
          transition-colors placeholder-gray-400
          ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'}
        `}
        {...props}
      />
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  )
}

export function Select({ label, error, className = '', children, id, name, ...props }) {
  const { fieldId, fieldName, errorId } = useFieldIds({ id, name, error })
  return (
    <div className={`space-y-1 ${className}`}>
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <select
        id={fieldId}
        name={fieldName}
        aria-label={label ? undefined : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`
          w-full px-3 py-2 border rounded-lg text-sm bg-white
          focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent
          transition-colors
          ${error ? 'border-red-300 bg-red-50' : 'border-gray-300'}
        `}
        {...props}
      >
        {children}
      </select>
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  )
}
