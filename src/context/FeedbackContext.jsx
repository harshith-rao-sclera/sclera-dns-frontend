import { useCallback, useMemo, useState } from 'react'
import { FeedbackContext } from './FeedbackContextValue'

function ToastViewport({ toasts, dismissToast }) {
  return (
    <div className="fixed top-4 right-4 z-[120] flex w-full max-w-sm flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg backdrop-blur ${
            toast.type === 'error'
              ? 'border-error/30 bg-error-container text-on-error-container'
              : 'border-primary/20 bg-surface-container-lowest text-on-surface'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[18px]">
              {toast.type === 'error' ? 'error' : 'check_circle'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.message && <p className="mt-1 text-xs opacity-90">{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const nextToast = { id, type: 'success', title: '', message: '', ...toast }

    setToasts((current) => [...current, nextToast])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4000)
  }, [])

  const value = useMemo(
    () => ({
      showToast,
      showError: (message, title = 'Request failed') => showToast({ type: 'error', title, message }),
      showSuccess: (message, title = 'Success') => showToast({ type: 'success', title, message }),
    }),
    [showToast],
  )

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismissToast={dismissToast} />
    </FeedbackContext.Provider>
  )
}
