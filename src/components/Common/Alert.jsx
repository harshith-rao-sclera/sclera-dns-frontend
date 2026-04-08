export function Alert({ tone = 'error', title = '', children, className = '' }) {
  const tones = {
    error: 'border-error/30 bg-error-container/70 text-on-error-container',
    info: 'border-primary/20 bg-primary-container/50 text-on-primary-container',
  }

  return (
    <div className={`rounded-lg border px-4 py-3 ${tones[tone]} ${className}`}>
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className={`${title ? 'mt-1' : ''} text-sm`}>{children}</div>
    </div>
  )
}
