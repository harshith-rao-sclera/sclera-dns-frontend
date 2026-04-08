import { Link } from 'react-router-dom'

function normalizeBreadcrumb(crumb) {
  if (typeof crumb === 'string') {
    return { label: crumb }
  }

  return crumb
}

export function TopBar({ breadcrumbs = [] }) {
  return (
    <header className="sticky top-0 z-40 flex h-12 w-full items-center border-b border-border bg-surface-container-lowest/80 px-6 backdrop-blur-md">
      <nav className="flex items-center text-xs tracking-wide uppercase text-on-surface-variant">
        {breadcrumbs.map((rawCrumb, idx) => {
          const crumb = normalizeBreadcrumb(rawCrumb)
          const isLast = idx === breadcrumbs.length - 1

          return (
            <span key={`${crumb.label}-${idx}`} className="flex items-center">
              {idx > 0 && (
                <span className="material-symbols-outlined mx-2 text-[10px] text-outline">
                  chevron_right
                </span>
              )}
              {crumb.to && !isLast ? (
                <Link
                  to={crumb.to}
                  className="text-on-surface-variant hover:text-primary transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}>
                  {crumb.label}
                </span>
              )}
            </span>
          )
        })}
      </nav>
    </header>
  )
}
