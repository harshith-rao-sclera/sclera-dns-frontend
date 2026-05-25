export function Badge({ children, variant = 'default', className = '', ...rest }) {
  const variants = {
    default: 'bg-gray-100 text-gray-600',
    primary: 'bg-primary-container text-on-primary-container',
    secondary: 'bg-secondary-container text-gray-700',
    success: 'bg-emerald-50 text-emerald-700',
    error: 'bg-error-container text-error',
    zone: 'bg-blue-50 text-blue-700',
  }

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ label, color = '#16a34a', className = '' }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-gray-50 rounded border border-border text-xs ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-bold uppercase tracking-wider text-on-surface-variant text-[10px]">
        {label}
      </span>
    </div>
  )
}
