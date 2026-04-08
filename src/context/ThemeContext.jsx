import { useEffect, useMemo, useRef, useState } from 'react'
import { ThemeContext } from './ThemeContextValue'

const THEME_STORAGE_KEY = 'sclera.theme'
const THEME_TRANSITION_CLASS = 'theme-transition'
const THEME_TRANSITION_DURATION_MS = 280

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)
  const transitionTimeoutRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(
    () => () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current)
      }
    },
    [],
  )

  const toggleTheme = () => {
    const root = document.documentElement

    root.classList.add(THEME_TRANSITION_CLASS)
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current)
    }

    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))

    transitionTimeoutRef.current = window.setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS)
      transitionTimeoutRef.current = null
    }, THEME_TRANSITION_DURATION_MS)
  }

  const value = useMemo(
    () => ({
      theme,
      isDarkMode: theme === 'dark',
      setTheme,
      toggleTheme,
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
