export function BulkActionBar({ selectedCount = 0, onClose, label = 'selected', children }) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 ml-32 bg-surface-container-lowest/90 backdrop-blur-md ring-1 ring-outline-variant/20 shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 z-50">
      <div className="flex items-center gap-3 pr-6 border-r border-outline-variant/30">
        <span className="bg-primary text-on-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">
          {selectedCount}
        </span>
        <span className="text-sm font-medium text-on-surface">{label}</span>
      </div>
      <div className="flex items-center gap-4">{children}</div>
      <button onClick={onClose} className="ml-2 text-outline hover:text-on-surface p-1 transition-colors">
        <span className="material-symbols-outlined text-lg">close</span>
      </button>
    </div>
  )
}

export function BulkAction({ icon, label, onClick, variant = 'default' }) {
  return (
    <button
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-1.5 text-sm font-medium transition-colors ${
        variant === 'danger'
          ? 'text-error hover:text-red-700'
          : 'text-on-surface hover:text-primary'
      }`}
    >
      <span className="material-symbols-outlined text-lg">{icon}</span>
      {label}
    </button>
  )
}
