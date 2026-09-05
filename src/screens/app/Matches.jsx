import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Avatar from '../../components/ui/Avatar'
import StoryRing from '../../components/feed/StoryRing'
import Input from '../../components/ui/Input'
import Icon from '../../components/ui/Icon'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'
import { useStore } from '../../lib/store'
import { timeAgo } from '../../lib/format'
import { listStagger, listItem } from '../../lib/motion'
import { campusById } from '../../lib/mock'

export default function Matches() {
  const navigate = useNavigate()
  const { matches } = useStore()
  const [q, setQ] = useState('')

  const fresh = matches.filter((m) => m.isNew && !m.lastMessage)
  const convos = useMemo(
    () => matches.filter((m) => m.lastMessage).filter((m) => !q || m.user.name.toLowerCase().includes(q.toLowerCase())),
    [matches, q],
  )

  return (
    <Page>
      <Header title="Chats" subtitle={`${matches.length} matches`} right={fresh.length > 0 ? <Badge tone="brand" icon="heart" size="sm">{fresh.length} new</Badge> : null} />

      <div className="max-w-[var(--content-max)] w-full mx-auto">
        <div className="px-4 pt-3">
          <Input icon="search" placeholder="Search matches" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {fresh.length > 0 && (
          <div className="mt-5">
            <p className="px-5 text-[12.5px] font-semibold uppercase tracking-[0.07em] muted mb-3">New matches</p>
            <div className="flex gap-3.5 overflow-x-auto no-scrollbar px-4 pb-1">
              {fresh.map((m, i) => (
                <motion.button
                  key={m.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05, type: 'spring', stiffness: 380, damping: 26 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => navigate(`/app/chat/${m.id}`)}
                  className="flex flex-col items-center gap-1.5 shrink-0 w-[70px]"
                >
                  {/* StoryRing draws its own ring — never wrap it in another one */}
                  <StoryRing src={m.user.photos[0]} name={m.user.name} size={56}
                    hasStory={!!m.user.hasActiveStory} hasUnseen={!!m.user.hasUnseenStory} />
                  <span className="text-[11.5px] font-medium truncate w-full text-center">{m.user.name}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <p className="px-5 text-[12.5px] font-semibold uppercase tracking-[0.07em] muted mb-1.5">Messages</p>
          {convos.length ? (
            <motion.div variants={listStagger(0.04)} initial="initial" animate="animate">
              {convos.map((m) => (
                <motion.button
                  key={m.id}
                  variants={listItem}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate(`/app/chat/${m.id}`)}
                  className="w-full flex items-center gap-3.5 px-4 py-3 active:bg-[color:var(--app-elev)] text-left"
                >
                  <StoryRing src={m.user.photos[0]} name={m.user.name} size={56}
                    hasStory={!!m.user.hasActiveStory} hasUnseen={!!m.user.hasUnseenStory} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-[15px] truncate">{m.user.name}</span>
                      <span className="text-[11.5px] muted shrink-0 ml-auto">{timeAgo(m.matchedAt)}</span>
                    </span>
                    <span className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[13.5px] truncate ${m.unread ? 'font-medium' : 'muted'}`}>
                        {m.lastMessage.mine && <span className="muted">You: </span>}
                        {m.lastMessage.text}
                      </span>
                      {m.unread > 0 && (
                        <span className="ml-auto shrink-0 min-w-[19px] h-[19px] px-1.5 rounded-full brand-fill text-white text-[10.5px] font-bold grid place-items-center">
                          {m.unread}
                        </span>
                      )}
                    </span>
                    <span className="block text-[11.5px] muted mt-0.5 truncate">{campusById(m.user.campusId).short}</span>
                  </span>
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <EmptyState
              icon="bubbleHeart"
              title="No conversations yet"
              description="Matches show up here. Say something better than “hey” and you're already ahead."
              action="Start swiping"
              onAction={() => navigate('/app/discover')}
            />
          )}
        </div>
      </div>
    </Page>
  )
}
