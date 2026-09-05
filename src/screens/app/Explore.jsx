import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Input from '../../components/ui/Input'
import Chip from '../../components/ui/Chip'
import Avatar from '../../components/ui/Avatar'
import Icon from '../../components/ui/Icon'
import EmptyState from '../../components/ui/EmptyState'
import OfflineBanner from '../../components/ui/OfflineBanner'
import SmartImage from '../../components/ui/SmartImage'
import { useStore } from '../../lib/store'
import { feed as feedApi, discovery, reference } from '../../lib/data'
import { useAsync } from '../../lib/useAsync'
import { campusById } from '../../lib/mock'
import { listStagger, listItem } from '../../lib/motion'

const SCOPES = [{ id: 'all', label: 'All' }, { id: 'campus', label: 'My campus' }, { id: 'nearby', label: 'Nearby' }, { id: 'people', label: 'People' }]

export default function Explore() {
  const navigate = useNavigate()
  const { me } = useStore()
  const [q, setQ] = useState('')
  const [scope, setScope] = useState('all')

  // Explore reads the ranked 'explore' feed from the data layer rather than
  // the local store, so it reflects server-side ranking (campus affinity,
  // Wilson score) instead of whatever happens to be cached client-side.
  const { data: feedData, loading: postsLoading } =
    useAsync(() => feedApi.list('explore'), [])
  const { data: peopleData, loading: peopleLoading } =
    useAsync(() => discovery.stack(40), [])

  const posts = feedData?.posts || []
  const candidates = peopleData?.cards || []
  const CAMPUSES = reference.campuses

  const filtered = useMemo(() => {
    let list = posts
    if (scope === 'campus') list = list.filter((p) => p.author?.campusId === me.campusId)
    if (scope === 'nearby') list = list.filter((p) => p.author?.campusId !== me.campusId)
    if (q) {
      const t = q.toLowerCase()
      list = list.filter(
        (p) => (p.caption || '').toLowerCase().includes(t) || (p.author?.name || '').toLowerCase().includes(t),
      )
    }
    return list
  }, [posts, scope, q, me.campusId])

  const people = useMemo(() => {
    const t = q.trim().toLowerCase()
    return candidates.filter((c) => !t || (c.name || '').toLowerCase().includes(t))
  }, [candidates, q])

  return (
    <Page>
      <Header title="Explore" subtitle="Posts and people across campuses" />
      <OfflineBanner />

      <div className="max-w-[var(--content-max)] w-full mx-auto">
        <div className="px-4 pt-3">
          <Input icon="search" placeholder="Search people, campuses, posts" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3.5">
          {SCOPES.map((s) => (
            <Chip key={s.id} size="sm" selected={scope === s.id} onClick={() => setScope(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>

        {scope !== 'people' && (
          <>
            <div className="px-4 pb-2 flex items-center gap-2">
              <Icon name="cap" size={15} className="text-brand-500" />
              <p className="text-[12.5px] font-semibold uppercase tracking-[0.07em] muted">Campuses</p>
            </div>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-4">
              {CAMPUSES.map((c) => (
                <motion.button
                  key={c.id}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => navigate(`/app/campus/${c.id}`)}
                  className="shrink-0 w-[136px] rounded-3xl surface p-3.5 text-left"
                >
                  <span className="w-9 h-9 rounded-xl elev grid place-items-center font-display font-semibold text-[12px] text-brand-500">
                    {c.short.slice(0, 3).toUpperCase()}
                  </span>
                  <span className="block font-semibold text-[13.5px] mt-2.5 truncate">{c.short}</span>
                  <span className="block text-[11.5px] muted mt-0.5">{c.userCount.toLocaleString()} students</span>
                </motion.button>
              ))}
            </div>
          </>
        )}

        {scope === 'people' ? (
          <motion.div variants={listStagger()} initial="initial" animate="animate" className="px-4 space-y-1.5 pb-4">
            {people.map((p) => (
              <motion.button
                key={p.uid}
                variants={listItem}
                onClick={() => navigate(`/app/user/${p.uid}`)}
                className="w-full flex items-center gap-3.5 p-2.5 rounded-2xl active:bg-[color:var(--app-elev)] text-left"
              >
                <Avatar src={p.photos?.[0]} name={p.name} size="md" verified={p.verified !== false} />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[15px] truncate">{p.name}, {p.age}</span>
                  <span className="block text-[12.5px] muted truncate">{campusById(p.campusId)?.short || 'Campus'} · {p.department}</span>
                </span>
                <Icon name="chevronRight" size={17} className="muted" />
              </motion.button>
            ))}
          </motion.div>
        ) : postsLoading ? (
          <div className="grid grid-cols-3 gap-[3px] px-[3px] pb-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square bg-[color:var(--app-elev)] animate-pulse" />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="grid grid-cols-3 gap-[3px] px-[3px] pb-4">
            {filtered.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/app/post/${p.id}`)}
                className={`relative overflow-hidden bg-[color:var(--app-elev)] ${i % 7 === 0 ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square'}`}
              >
                <SmartImage src={p.media || p.mediaUrl} alt="" className="w-full h-full object-cover" />
                <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white text-[11px] font-medium drop-shadow">
                  <Icon name="heart" size={12} filled />
                  {p.likes}
                </span>
              </motion.button>
            ))}
          </div>
        ) : (
          <EmptyState icon="search" title="No results" description={`Nothing matched “${q}”. Try a different search.`} />
        )}
      </div>
    </Page>
  )
}
