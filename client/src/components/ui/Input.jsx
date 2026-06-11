export default function Input({
  label,
  error,
  className = '',
  type = 'text',
  ...props
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        type={type}
        className={`
          w-full px-3 py-2 border rounded-lg text-sm
          focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent
          transition-colors placeholder-gray-400
          ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}

export function Textarea({ label, error, className = '', rows = 3, ...props }) {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <textarea
        rows={rows}
        className={`
          w-full px-3 py-2 border rounded-lg text-sm resize-none
          focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent
          transition-colors placeholder-gray-400
          ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}

export function Select({ label, error, className = '', children, ...props }) {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select
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
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
