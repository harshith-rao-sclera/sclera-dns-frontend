import { CopyButton } from './CopyButton'

export function CodeBlock({ code, label = '', className = '' }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-surface-container-lowest ${className}`}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
          {label}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="custom-scrollbar overflow-x-auto px-4 py-3 text-xs leading-6">
        <code className="font-mono text-on-surface whitespace-pre">{code}</code>
      </pre>
    </div>
  )
}
