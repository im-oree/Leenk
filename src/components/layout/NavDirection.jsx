import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Tracks whether the last navigation was forward or back, so page
 * transitions slide the correct way (forward = in from right).
 */
const DirCtx = createContext({ direction: 1 })

export function NavDirectionProvider({ children }) {
  const location = useLocation()
  const navType = useNavigationType()
  const depth = useRef(location.pathname.split('/').filter(Boolean).length)
  const [direction, setDirection] = useState(1)

  useEffect(() => {
    const next = location.pathname.split('/').filter(Boolean).length
    if (navType === 'POP') setDirection(-1)
    else if (next < depth.current) setDirection(-1)
    else setDirection(1)
    depth.current = next
  }, [location.pathname, navType])

  return <DirCtx.Provider value={{ direction }}>{children}</DirCtx.Provider>
}

export const useNavDirection = () => useContext(DirCtx)
