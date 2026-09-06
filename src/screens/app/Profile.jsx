import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Avatar from '../../components/ui/Avatar'
import StoryRing from '../../components/feed/StoryRing'
import Icon from '../../components/ui/Icon'
import IconButton from '../../components/ui/IconButton'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { useStore } from '../../lib/store'
import { campusById, intentLabel } from '../../lib/mock'

export default function Profile() {
  const navigate = useNavigate()
  const { me, posts, verificationStatus } = useStore()
  const [tab, setTab] = useState('posts')
  const campus = campusById(me.campusId)
  const mine = posts.slice(0, 6)

  const stats = [
    { label: 'Matches', value: me.stats.matches },
    { label: 'Followers', value: me.stats.followers },
    { label: 'Following', value: me.stats.following },
  ]

  return (
    <Page
      header={
        <Header
          title="You"
          right={
            <>
              <IconButton icon="badge" label="Trust" onClick={() => navigate('/app/trust')} />
              <IconButton icon="gear" label="Settings" onClick={() => navigate('/app/settings')} />
            </>
          }
        />
      }
    >

      <div className="max-w-[var(--content-max)] w-full mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="px-5 pt-4"
        >
          <div className="flex items-center gap-4">
            <StoryRing src={me.photos[0]} name={me.name} size={108} isMe showAdd
              hasStory={!!me.hasActiveStory} hasUnseen={false}
              verified={verificationStatus === 'verified'}
              onClick={() => navigate(me.hasActiveStory ? `/app/story/${me.uid}` : '/app/compose?type=story')} />
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-[24px] font-semibold tracking-[-0.03em] truncate leading-tight">
                {me.name}, {me.age}
              </h1>
              <p className="text-[13px] muted mt-1 truncate">{campus.short} · {me.department}</p>
              <p className="text-[13px] muted truncate">{me.level} level</p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <Badge tone="brand" icon="badge" size="sm">Verified</Badge>
                <Badge size="sm" icon="heart">{intentLabel(me.intent)}</Badge>
              </div>
            </div>
          </div>

          <div className="flex gap-2.5 mt-5">
            <Button full variant="secondary" icon="user" onClick={() => navigate('/app/edit-profile')}>Edit profile</Button>
            <Button variant="secondary" icon="share" onClick={() => navigate('/app/share')} aria-label="Share" />
          </div>

          <div className="grid grid-cols-3 gap-2.5 mt-4">
            {stats.map((s) => (
              <div key={s.label} className="surface rounded-2xl py-3 text-center">
                <p className="font-display text-[19px] font-semibold tabular-nums">{s.value}</p>
                <p className="text-[11.5px] muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate('/app/premium')}
            className="w-full mt-4 rounded-3xl p-4 flex items-center gap-3.5 text-left brand-fill text-white shadow-glow"
          >
            <span className="w-10 h-10 rounded-2xl bg-white/20 grid place-items-center shrink-0">
              <Icon name="crown" size={19} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-[15px]">Get Leenk+</span>
              <span className="block text-[12.5px] text-white/80 mt-0.5">Unlimited swipes, see who liked you</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </button>

          {me.prompts?.length > 0 && (
            <div className="mt-5 space-y-2.5">
              {me.prompts.map((p, i) => (
                <div key={i} className="surface rounded-3xl p-4">
                  <p className="font-curvy italic text-[15px] text-brand-500">{p.q}</p>
                  <p className="text-[14.5px] mt-1.5 leading-snug">{p.a}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <div className="px-4 mt-6">
          <SegmentedControl
            size="sm"
            value={tab}
            onChange={setTab}
            options={[{ value: 'posts', label: 'Posts' }, { value: 'photos', label: 'Photos' }, { value: 'saved', label: 'Saved' }]}
          />
        </div>

        <div className="grid grid-cols-3 gap-[3px] px-[3px] mt-3">
          {(tab === 'photos' ? me.photos.map((m, i) => ({ id: `ph${i}`, media: m })) : mine).map((p, i) => (
            <motion.button
              key={p.id}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.035, duration: 0.3 }}
              onClick={() => navigate(`/app/post/${p.id}`)}
              className="relative aspect-square overflow-hidden bg-[color:var(--app-elev)]"
            >
              <img src={p.media} alt="" loading="lazy" className="w-full h-full object-cover" />
            </motion.button>
          ))}
        </div>
      </div>
    </Page>
  )
}
