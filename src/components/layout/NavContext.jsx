import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const NavCtx = createContext({ visible: true, setVisible: () => {} })

export function NavProvider({ children }) {
  const [visible, setVisibleState] = useState(true)
  const setVisible = useCallback((v) => setVisibleState(v), [])
  const value = useMemo(() => ({ visible, setVisible }), [visible, setVisible])
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>
}

export const useNav = () => useContext(NavCtx)
