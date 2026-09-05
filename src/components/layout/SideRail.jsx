import { motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import Icon from '../ui/Icon'
import Tooltip from '../ui/Tooltip'
import Avatar from '../ui/Avatar'
import { LogoMark, Wordmark } from '../brand/Logo'
import { haptic } from '../../lib/haptics'
import { useStore } from '../../lib/store'
import { useBreakpoint } from '../../lib/breakpoint'

const TABS = [
  { to: '/app/discover', icon: 'flame', label: 'Discover' },
  { to: '/app/feed', icon: 'grid', label: 'Feed' },
  { to: '/app/explore', icon: 'compass', label: 'Explore' },
  { to: '/app/matches', icon: 'chat', label: 'Chats', badgeKey: 'chats' },
  { to: '/app/profile', icon: 'user', label: 'You' },
]

/**
 * Tablet / desktop navigation.
 *
 * A bottom pill on a 1024px iPad reads as a stretched phone app, so at
 * `medium` and up we switch to a left rail: icon-only on tablet portrait
 * (space is tight), icon + label once there's room.
 *
 * Touch targets stay at 48px+ because iPads are still fingers, not cursors.
 */
export default function SideRail() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { matches, me } = useStore()
  const { isExpanded } = useBreakpoint()

  const badges = useMemo(
    () => ({ chats: matches.reduce((n, m) => n + (m.unread || 0) + (m.isNew ? 1 : 0), 0) }),
    [matches],
  )

  const activeIndex = TABS.findIndex((t) => pathname.startsWith(t.to))
  const wide = isExpanded

  return (
    <motion.nav
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r hairline bg-[color:var(--app-bg)] ${
        wide ? 'w-[232px] px-3' : 'w-[84px] px-2.5'
      }`}
      style={{ paddingTop: 'max(env(safe-area-inset-top), 18px)', paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
    >
      {/* brand */}
      <button
        onClick={() => { haptic('light'); navigate('/app/discover') }}
        className={`flex items-center gap-2.5 h-12 mb-4 rounded-2xl ${wide ? 'px-3' : 'justify-center'}`}
        aria-label="Leenk home"
      >
        {wide ? <Wordmark size={22} /> : <LogoMark size={26} />}
      </button>

      {/* tabs */}
      <div className="flex flex-col gap-1.5 flex-1">
        {TABS.map((tab, i) => {
          const active = i === activeIndex
          const button = (
            <button
              key={tab.to}
              onClick={() => { haptic('light'); navigate(tab.to) }}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center rounded-2xl h-[52px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                wide ? 'px-3.5 gap-3.5' : 'justify-center'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="rail-pill"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  className="absolute inset-0 rounded-2xl bg-brand-500/12"
                />
              )}
              <span className="relative shrink-0">
                <motion.span
                  animate={active ? { scale: 1.06 } : { scale: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                  className={`block transition-colors duration-200 ${active ? 'text-brand-500' : 'muted'}`}
                >
                  <Icon name={tab.icon} size={23} strokeWidth={active ? 2 : 1.7} />
                </motion.span>
                {badges[tab.badgeKey] > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full brand-fill text-white text-[9.5px] font-bold grid place-items-center">
                    {badges[tab.badgeKey] > 9 ? '9+' : badges[tab.badgeKey]}
                  </span>
                )}
              </span>
              {wide && (
                <span className={`relative text-[14.5px] font-medium ${active ? 'text-brand-500' : ''}`}>
                  {tab.label}
                </span>
              )}
            </button>
          )
          return wide ? button : <Tooltip key={tab.to} label={tab.label} placement="top">{button}</Tooltip>
        })}
      </div>

      {/* compose */}
      <button
        onClick={() => { haptic('medium'); navigate('/app/compose') }}
        aria-label="New post"
        className={`flex items-center justify-center gap-2.5 h-[52px] rounded-2xl brand-fill text-white shadow-glow mb-2 ${wide ? 'px-4' : ''}`}
      >
        <Icon name="plus" size={20} strokeWidth={2.4} />
        {wide && <span className="text-[14.5px] font-semibold">Post</span>}
      </button>

      {/* account */}
      <button
        onClick={() => { haptic('light'); navigate('/app/settings') }}
        aria-label="Settings"
        className={`flex items-center gap-3 h-[52px] rounded-2xl ${wide ? 'px-2.5' : 'justify-center'}`}
      >
        <Avatar src={me?.photos?.[0]} name={me?.name} size={32} />
        {wide && (
          <span className="min-w-0 text-left">
            <span className="block text-[13.5px] font-medium truncate">{me?.name}</span>
            <span className="block text-[11.5px] muted truncate">Settings</span>
          </span>
        )}
      </button>
    </motion.nav>
  )
}
