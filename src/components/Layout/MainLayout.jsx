import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const SIDEBAR_STORAGE_KEY = 'sclera.sidebar.collapsed'

export function MainLayout({ children, breadcrumbs = [] }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  const toggleSidebar = () => {
    setIsSidebarCollapsed((current) => !current)
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={toggleSidebar} />
      <main className={`flex-1 flex flex-col min-h-screen transition-[margin] duration-300 ${isSidebarCollapsed ? 'ml-20' : 'ml-64'}`}>
        <TopBar breadcrumbs={breadcrumbs} />
        <div className="flex-1">{children}</div>
      </main>
    </div>
  )
}
