import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function TextField({
  label = '',
  placeholder = '',
  icon = null,
  type = 'text',
  helperText = '',
  error = false,
  errorMessage = '',
  className = '',
  onClear = null,
  ...props
}) {
  const showClear = onClear && props.value
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
          } ${showClear ? 'pr-9' : 'pr-3'} text-sm rounded outline-none transition-all placeholder:text-outline`}
          {...props}
        />
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            title="Clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
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
  value,
  onChange = () => {},
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)

  const positionList = () => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
    const maxHeight = Math.max(160, Math.min(288, (openUp ? spaceAbove : spaceBelow) - 12))
    setCoords({
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    })
  }

  const toggle = () => {
    if (disabled) return
    if (!open) positionList()
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return undefined
    const onDocMouseDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return
      if (listRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    const close = () => setOpen(false)
    // Close when an outer container scrolls (the dropdown would detach from its
    // trigger), but ignore scrolling inside the dropdown list itself.
    const onScroll = (event) => {
      if (listRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const selected = options.find((opt) => opt.value === value)
  const choose = (val) => {
    onChange({ target: { value: val } })
    setOpen(false)
  }

  const renderOption = (optValue, optLabel) => {
    const isSelected = optValue === (value ?? '')
    return (
      <li key={optValue || '__placeholder'}>
        <button
          type="button"
          onClick={() => choose(optValue)}
          className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
            isSelected
              ? 'bg-primary/10 font-medium text-primary'
              : 'text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="truncate">{optLabel}</span>
          {isSelected && <span className="material-symbols-outlined text-[16px]">check</span>}
        </button>
      </li>
    )
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-2 bg-surface-container-lowest border ${
          error ? 'border-error ring-1 ring-error/20' : 'border-outline-variant/40'
        } ${open ? 'border-primary ring-2 ring-primary/15' : ''} h-9 pl-3 pr-2 text-sm rounded outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={`truncate ${selected ? 'text-on-surface' : 'text-outline'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className={`material-symbols-outlined shrink-0 text-[20px] text-outline transition-transform ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {error && errorMessage && <span className="text-xs text-error">{errorMessage}</span>}

      {open && coords && createPortal(
        <ul
          ref={listRef}
          style={{
            position: 'fixed',
            left: coords.left,
            width: coords.width,
            maxHeight: coords.maxHeight,
            ...(coords.top !== undefined ? { top: coords.top } : { bottom: coords.bottom }),
          }}
          className="custom-scrollbar z-[80] overflow-y-auto rounded-md border border-outline-variant/40 bg-surface-container-lowest py-1 shadow-2xl"
        >
          {placeholder && renderOption('', placeholder)}
          {options.map((opt) => renderOption(opt.value, opt.label))}
        </ul>,
        document.body,
      )}
    </div>
  )
}
