import { useState } from 'react'

// The async Clipboard API only exists in secure contexts (HTTPS or localhost).
// Over plain HTTP on a LAN IP/host it's undefined, so fall back to a hidden
// textarea + execCommand('copy'), which works everywhere.
async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the legacy path
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    textarea.remove()
    return ok
  } catch {
    return false
  }
}

export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const ok = await copyToClipboard(text)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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
