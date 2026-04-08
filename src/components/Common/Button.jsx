export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon = null,
  className = '',
  disabled = false,
  ...props
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded transition-all duration-150 cursor-pointer'

  const variants = {
    primary:
      'bg-gradient-to-br from-primary to-blue-800 text-on-primary shadow-sm hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed',
    secondary:
      'bg-surface-container-high text-on-surface hover:bg-surface-dim border border-border disabled:opacity-50 disabled:cursor-not-allowed',
    danger:
      'bg-error text-on-error hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed',
    ghost:
      'text-on-surface-variant hover:text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed',
  }

  const sizes = {
    sm: 'px-3 h-8 text-xs',
    md: 'px-4 h-9 text-sm',
    lg: 'px-5 h-10 text-sm',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="material-symbols-outlined text-lg">{icon}</span>}
      {children}
    </button>
  )
}
