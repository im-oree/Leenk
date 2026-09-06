import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ThemeCtx = createContext({ theme: 'light', setTheme: () => {}, toggle: () => {} })
const KEY = 'leenk.theme'

export function ThemeProvider({ children }) {
  // Default is LIGHT; onboarding lets the user pick.
  const [theme, setThemeState] = useState(() => {
    if (typeof localStorage === 'undefined') return 'light'
    return localStorage.getItem(KEY) || 'light'
  })

  useEffect(() => {
    const el = document.documentElement
    el.classList.toggle('dark', theme === 'dark')
    el.classList.toggle('light', theme !== 'dark')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#050506' : '#ffffff')
    localStorage.setItem(KEY, theme)
  }, [theme])

  const setTheme = useCallback((t) => setThemeState(t), [])
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>
}

export const useTheme = () => useContext(ThemeCtx)
