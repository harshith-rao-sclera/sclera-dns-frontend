export function Modal({ isOpen, onClose, title = '', subtitle = '', children, footer = null, size = 'md' }) {
  if (!isOpen) return null

  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    xxl: 'max-w-5xl',
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-5 md:p-6">
        <div
          className={`bg-surface-container-lowest rounded-lg shadow-2xl flex flex-col max-h-[85vh] ${widths[size]} w-full`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {title && (
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-on-surface">{title}</h2>
                {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="ml-4 flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface-container-low/40">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  isLoading = false,
  children,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="text-center space-y-4">
        {isDangerous && (
          <div className="mx-auto w-12 h-12 rounded-full bg-error-container flex items-center justify-center">
            <span className="material-symbols-outlined text-error text-2xl">warning</span>
          </div>
        )}
        <h3 className="text-base font-bold text-on-surface">{title}</h3>
        {message && <p className="text-sm text-on-surface-variant">{message}</p>}
        {children}
      </div>
      <div className="flex items-center justify-center gap-3 mt-6">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition-colors"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className={`px-4 py-2 text-sm font-semibold rounded transition-all flex items-center gap-2 ${
            isDangerous
              ? 'bg-error text-on-error hover:bg-red-700'
              : 'bg-primary text-on-primary hover:brightness-110'
          } disabled:opacity-50`}
        >
          {isDangerous && <span className="material-symbols-outlined text-base">delete</span>}
          {isLoading ? 'Processing...' : confirmText}
        </button>
      </div>
    </Modal>
  )
}
