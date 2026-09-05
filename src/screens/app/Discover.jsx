import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import SwipeCard from '../../components/swipe/SwipeCard'
import SwipeControls from '../../components/swipe/SwipeControls'
import MatchOverlay from '../../components/swipe/MatchOverlay'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import Badge from '../../components/ui/Badge'
import FiltersSheet from './FiltersSheet'
import { Wordmark } from '../../components/brand/Logo'
import { useStore } from '../../lib/store'
import { haptic } from '../../lib/haptics'
import { discovery } from '../../lib/data'
import OfflineBanner from '../../components/ui/OfflineBanner'

export default function Discover() {
  const navigate = useNavigate()
  const { queue, me, undosLeft, superLikesLeft, swipesLeft, dispatch, toast } = useStore()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [newMatch, setNewMatch] = useState(null)

  const visible = queue.slice(0, 3)

  const doSwipe = useCallback(
    async (dir) => {
      const top = queue[0]
      if (!top) return

      // Advance the stack IMMEDIATELY — the next card must never wait on a
      // network round trip, or swiping feels broken on a slow connection.
      dispatch({ type: 'swipe', dir, forceMatch: false })

      // The server decides whether it's a match; show the overlay when it says so.
      try {
        const res = await discovery.swipe(top.uid, dir, { source: 'stack' })
        if (res?.matched) setNewMatch({ id: res.match?.id || `m-${top.uid}`, user: top })
      } catch {
        // Offline: the swipe is consumed locally and reconciled on reconnect.
      }
    },
    [queue, dispatch],
  )

  const onUndo = () => {
    dispatch({ type: 'swipe/undo' })
    toast('Brought them back', 'brand')
  }

  return (
    <Page>
      <Header
        left={<div className="pl-2"><Wordmark size={21} /></div>}
        right={
          <>
            <IconButton icon="sliders" label="Filters" onClick={() => setFiltersOpen(true)} />
            <IconButton icon="bell" label="Notifications" onClick={() => navigate('/app/notifications')} />
          </>
        }
      />

      <div className="flex-1 flex flex-col px-4 pt-3 max-w-[var(--content-max)] w-full mx-auto">
        <div className="flex items-center justify-between mb-3 px-1">
          <Badge tone="neutral" icon="fire" size="sm">{swipesLeft} swipes left today</Badge>
          <button onClick={() => navigate('/app/likes')} className="text-[12.5px] font-medium text-brand-500">
            See who liked you
          </button>
        </div>

        <div className="relative flex-1 min-h-[420px]">
          <AnimatePresence>
            {visible.length > 0 ? (
              visible
                .map((u, i) => (
                  <SwipeCard
                    key={u.uid}
                    user={u}
                    index={i}
                    isTop={i === 0}
                    onSwipe={doSwipe}
                    onOpen={(user) => navigate(`/app/user/${user.uid}`)}
                  />
                ))
                .reverse()
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center">
                <EmptyState
                  icon="refresh"
                  title="That's everyone for now"
                  description="You've seen every profile matching your filters. Widen your campus scope or check back later."
                  action="Reset stack"
                  onAction={() => { haptic('medium'); dispatch({ type: 'queue/refill' }) }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="py-5">
          <SwipeControls
            undosLeft={undosLeft}
            superLeft={superLikesLeft}
            disabled={visible.length === 0}
            onUndo={onUndo}
            onPass={() => doSwipe('left')}
            onSuper={() => doSwipe('super')}
            onLike={() => doSwipe('right')}
            onBoost={() => toast('Boost is coming with Leenk+', 'brand')}
          />
        </div>
      </div>

      <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} />
      <MatchOverlay match={newMatch} me={me} onClose={() => setNewMatch(null)} />
    </Page>
  )
}
