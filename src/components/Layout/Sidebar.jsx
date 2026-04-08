import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'

const navItems = [
  { path: '/', label: 'Hosted Zones', icon: 'language', fillActive: true },
  { path: '/rules', label: 'Smart IP Rules', icon: 'rule', fillActive: false },
  { path: '/docs', label: 'API Docs', icon: 'terminal', fillActive: false },
]

export function Sidebar({ isCollapsed = false, onToggle = () => {} }) {
  const location = useLocation()
  const { isDarkMode, toggleTheme } = useTheme()

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/' || location.pathname.startsWith('/zones')
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      className={`bg-sidebar fixed left-0 top-0 z-50 flex h-screen flex-col overflow-y-auto border-r border-sidebar-border transition-[width] duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}
    >
      <div className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-start px-4'} py-5`}>
        <div className={`flex items-center min-w-0 ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span
              className="material-symbols-outlined text-on-primary text-lg"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              dns
            </span>
          </div>
          <div
            className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${
              isCollapsed ? 'ml-0 max-w-0 opacity-0 -translate-x-1' : 'ml-0 max-w-[140px] opacity-100 translate-x-0'
            }`}
          >
            <h1 className="text-lg font-black tracking-tighter text-on-surface leading-none">
              Sclera DNS
            </h1>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ path, label, icon, fillActive }) => {
          const active = isActive(path)
          return (
            <Link
              key={path}
              to={path}
              title={isCollapsed ? label : undefined}
              className={`flex items-center rounded-md px-3 py-2 text-sm tracking-tight transition-all duration-150 ${
                isCollapsed ? 'justify-center' : 'gap-3'
              } ${
                active
                  ? 'bg-sidebar-active-bg text-sidebar-active-text font-bold shadow-sm'
                  : 'text-sidebar-text font-medium hover:bg-surface-container-high/70 hover:text-sidebar-text-hover'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px] flex-shrink-0"
                style={active && fillActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {icon}
              </span>
              <span
                className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${
                  isCollapsed ? 'max-w-0 opacity-0 -translate-x-1' : 'max-w-[160px] opacity-100 translate-x-0'
                }`}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto px-3 pb-4 pt-4">
        <button
          type="button"
          onClick={toggleTheme}
          className={`mb-3 flex w-full items-center rounded-2xl border border-sidebar-border/70 bg-surface-container-lowest/80 text-sidebar-text shadow-sm transition-colors hover:bg-surface-container-low hover:text-sidebar-text-hover ${
            isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'
          }`}
          title={isCollapsed ? (isDarkMode ? 'Switch to light mode' : 'Switch to dark mode') : undefined}
        >
          <span className="material-symbols-outlined text-[20px]">
            {isDarkMode ? 'light_mode' : 'dark_mode'}
          </span>
          <span
            className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200 ${
              isCollapsed ? 'max-w-0 opacity-0 -translate-x-1' : 'max-w-[160px] opacity-100 translate-x-0'
            }`}
          >
            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggle}
          className={`flex w-full cursor-pointer items-center rounded-2xl border border-sidebar-border/70 bg-surface-container-lowest/80 text-sidebar-text shadow-sm transition-colors hover:bg-surface-container-low hover:text-sidebar-text-hover ${
            isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'
          }`}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="material-symbols-outlined text-[20px]">
            {isCollapsed ? 'right_panel_open' : 'left_panel_close'}
          </span>
          <span
            className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200 ${
              isCollapsed ? 'max-w-0 opacity-0 -translate-x-1' : 'max-w-[160px] opacity-100 translate-x-0'
            }`}
          >
            Collapse Sidebar
          </span>
        </button>
      </div>
    </aside>
  )
}
