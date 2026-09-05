import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import IconButton from '../../components/ui/IconButton'
import SegmentedControl from '../../components/ui/SegmentedControl'
import StoryRail from '../../components/feed/StoryRail'
import PostCard from '../../components/feed/PostCard'
import Sheet from '../../components/ui/Sheet'
import ListRow from '../../components/ui/ListRow'
import EmptyState from '../../components/ui/EmptyState'
import { Wordmark } from '../../components/brand/Logo'
import { useStore } from '../../lib/store'
import { useNav } from '../../components/layout/NavContext'
import { stories as storiesApi } from '../../lib/data'
import { useAsync } from '../../lib/useAsync'
import OfflineBanner from '../../components/ui/OfflineBanner'
import Spinner from '../../components/ui/Spinner'

export default function Feed() {
  const navigate = useNavigate()
  const { posts, dispatch, toast } = useStore()
  const [tab, setTab] = useState('foryou')
  const [moreFor, setMoreFor] = useState(null)
  const { setVisible } = useNav()
  const lastY = useRef(0)

  // Story rail comes from the data layer (mock or live — identical shape).
  const { data: railData, loading: railLoading, retry: reloadRail } =
    useAsync(useCallback(() => storiesApi.rail(), []), [])
  const rail = railData?.rail || []

  // Hide the nav bar while scrolling down, bring it back on scroll up.
  const onScroll = (e) => {
    const y = e.currentTarget.scrollTop
    if (y > 90 && y > lastY.current + 8) setVisible(false)
    else if (y < lastY.current - 8 || y < 60) setVisible(true)
    lastY.current = y
  }

  const list = tab === 'following' ? posts.filter((_, i) => i % 2 === 0) : posts

  return (
    <Page scroll={false} padBottom={false}>
      <Header
        left={<div className="pl-2"><Wordmark size={21} /></div>}
        right={
          <>
            <IconButton icon="plus" label="New post" onClick={() => navigate('/app/compose')} />
            <IconButton icon="bell" label="Notifications" onClick={() => navigate('/app/notifications')} />
          </>
        }
      />

      <div className="flex-1 overflow-y-auto no-scrollbar pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+14px)]" onScroll={onScroll}>
        <div className="max-w-[var(--content-max)] mx-auto">
          <div className="px-4 pt-3">
            <SegmentedControl
              size="sm"
              value={tab}
              onChange={setTab}
              options={[{ value: 'foryou', label: 'For you' }, { value: 'following', label: 'Following' }]}
            />
          </div>

          <OfflineBanner />

          <StoryRail
            rail={rail}
            loading={railLoading}
            onOpen={(s) => navigate(`/app/story/${s.authorUid}`)}
            onAdd={() => navigate('/app/compose?type=story')}
          />

          <div className="h-px hairline border-t mx-4 mb-1" />

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24 }}
            >
              {list.length ? (
                list.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    onLike={(id) => dispatch({ type: 'post/like', id })}
                    onComment={() => navigate(`/app/post/${p.id}`)}
                    onOpenAuthor={(a) => navigate(`/app/user/${a.uid}`)}
                    onMore={setMoreFor}
                  />
                ))
              ) : (
                <EmptyState
                  icon="users"
                  title="Nothing here yet"
                  description="Follow a few people from your campus and their posts will land here."
                  action="Go to Explore"
                  onAction={() => navigate('/app/explore')}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <Sheet open={!!moreFor} onClose={() => setMoreFor(null)} title="Post options">
        <div className="-mx-1">
          <ListRow icon="user" label="View profile" onClick={() => { navigate(`/app/user/${moreFor.author.uid}`); setMoreFor(null) }} />
          <ListRow icon="share" label="Share post" onClick={() => { toast('Link copied'); setMoreFor(null) }} />
          <ListRow icon="bookmark" label="Save post" onClick={() => { toast('Saved'); setMoreFor(null) }} />
          <ListRow icon="flag" label="Report post" danger onClick={() => { navigate('/app/report'); setMoreFor(null) }} />
          <ListRow icon="block" label="Block author" danger onClick={() => { toast('Blocked'); setMoreFor(null) }} />
        </div>
      </Sheet>
    </Page>
  )
}
