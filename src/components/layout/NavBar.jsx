import { motion, AnimatePresence } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import Icon from '../ui/Icon'
import { haptic } from '../../lib/haptics'
import { useStore } from '../../lib/store'
import { useNav } from './NavContext'

const TABS = [
  { to: '/app/discover', icon: 'flame', label: 'Discover' },
  { to: '/app/feed', icon: 'grid', label: 'Feed' },
  { to: '/app/explore', icon: 'compass', label: 'Explore' },
  { to: '/app/matches', icon: 'chat', label: 'Chats', badgeKey: 'chats' },
  { to: '/app/profile', icon: 'user', label: 'You' },
]

export default function NavBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { visible } = useNav()
  const { matches } = useStore()

  const badges = useMemo(
    () => ({ chats: matches.reduce((n, m) => n + (m.unread || 0) + (m.isNew ? 1 : 0), 0) }),
    [matches],
  )

  const activeIndex = TABS.findIndex((t) => pathname.startsWith(t.to))

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          initial={{ y: 110, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 110, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 38 }}
          className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none"
        >
          <div className="mx-auto max-w-[520px] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 pointer-events-auto">
            <div className="glass border hairline rounded-[26px] shadow-card px-1.5 py-1.5 flex items-center justify-between relative">
              {TABS.map((tab, i) => {
                const active = i === activeIndex
                return (
                  <button
                    key={tab.to}
                    onClick={() => { haptic('light'); navigate(tab.to) }}
                    aria-label={tab.label}
                    aria-current={active ? 'page' : undefined}
                    className="relative flex-1 h-[54px] rounded-[20px] flex flex-col items-center justify-center gap-[3px] outline-none"
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                        className="absolute inset-0 rounded-[20px] bg-brand-500/12"
                      />
                    )}
                    <span className="relative">
                      <motion.span
                        animate={active ? { y: -1, scale: 1.06 } : { y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                        className={`block transition-colors duration-200 ${active ? 'text-brand-500' : 'muted'}`}
                      >
                        <Icon name={tab.icon} size={22} strokeWidth={active ? 2 : 1.7} filled={false} />
                      </motion.span>
                      {badges[tab.badgeKey] > 0 && (
                        <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full brand-fill text-white text-[9.5px] font-bold grid place-items-center">
                          {badges[tab.badgeKey] > 9 ? '9+' : badges[tab.badgeKey]}
                        </span>
                      )}
                    </span>
                    <span
                      className={`relative text-[10px] font-medium tracking-tight transition-colors duration-200 ${
                        active ? 'text-brand-500' : 'muted'
                      }`}
                    >
                      {tab.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  )
}
