export function TextField({
  label = '',
  placeholder = '',
  icon = null,
  type = 'text',
  helperText = '',
  error = false,
  errorMessage = '',
  className = '',
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">
            {icon}
          </span>
        )}
        <input
          type={type}
          placeholder={placeholder}
          className={`w-full bg-surface-container-lowest border ${
            error ? 'border-error ring-1 ring-error/20' : 'border-outline-variant/40'
          } focus:border-primary focus:ring-2 focus:ring-primary/15 h-9 ${
            icon ? 'pl-10' : 'pl-3'
          } pr-3 text-sm rounded outline-none transition-all placeholder:text-outline`}
          {...props}
        />
      </div>
      {helperText && <p className="text-xs text-on-surface-variant">{helperText}</p>}
      {error && errorMessage && <span className="text-xs text-error">{errorMessage}</span>}
    </div>
  )
}

export function TextArea({
  label = '',
  placeholder = '',
  helperText = '',
  error = false,
  errorMessage = '',
  className = '',
  rows = 3,
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
          {label}
        </label>
      )}
      <textarea
        placeholder={placeholder}
        rows={rows}
        className={`w-full bg-surface-container-lowest border ${
          error ? 'border-error ring-1 ring-error/20' : 'border-outline-variant/40'
        } focus:border-primary focus:ring-2 focus:ring-primary/15 p-3 text-sm rounded outline-none transition-all font-mono placeholder:text-outline`}
        {...props}
      />
      {helperText && <p className="text-xs text-on-surface-variant">{helperText}</p>}
      {error && errorMessage && <span className="text-xs text-error">{errorMessage}</span>}
    </div>
  )
}

export function Select({
  label = '',
  options = [],
  placeholder = 'Select...',
  error = false,
  errorMessage = '',
  className = '',
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
          {label}
        </label>
      )}
      <select
        className={`w-full bg-surface-container-lowest border ${
          error ? 'border-error' : 'border-outline-variant/40'
        } focus:border-primary focus:ring-2 focus:ring-primary/15 h-9 px-3 text-sm rounded outline-none transition-all`}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && errorMessage && <span className="text-xs text-error">{errorMessage}</span>}
    </div>
  )
}
