import { useState } from 'react'

export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — silently no-op
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
        copied
          ? 'text-emerald-600'
          : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
      } ${className}`}
      title={copied ? 'Copied' : 'Copy to clipboard'}
    >
      <span className="material-symbols-outlined text-[14px]">
        {copied ? 'check' : 'content_copy'}
      </span>
      {copied ? 'Copied' : label}
    </button>
  )
}
