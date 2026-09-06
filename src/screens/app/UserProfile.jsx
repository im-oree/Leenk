import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Icon from '../../components/ui/Icon'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import Chip from '../../components/ui/Chip'
import Sheet from '../../components/ui/Sheet'
import ListRow from '../../components/ui/ListRow'
import EmptyState from '../../components/ui/EmptyState'
import { campusById, intentLabel } from '../../lib/mock'
import { profile as profileApi } from '../../lib/data'
import { useAsync } from '../../lib/useAsync'
import Spinner from '../../components/ui/Spinner'
import { useStore } from '../../lib/store'
import { haptic } from '../../lib/haptics'
import { completeHint } from '../../lib/hints'
import PhotoDots from '../../components/swipe/PhotoDots'
import SwipeHint from '../../components/swipe/SwipeHint'

export default function UserProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { toast } = useStore()
  // Goes through the data layer, so this screen works against either the
  // fixtures or the live API without a code change.
  const { data, loading } = useAsync(() => profileApi.get(userId), [userId])
  // The API and the mock card shape do not carry every optional field, so
  // normalise once here. Without this, prompts.map() and photos.length throw
  // on any profile that happens to omit them.
  const raw = data?.user || data?.profile || null
  const user = raw && {
    ...raw,
    photos: Array.isArray(raw.photos) && raw.photos.length ? raw.photos : [],
    prompts: Array.isArray(raw.prompts) ? raw.prompts : [],
    interests: Array.isArray(raw.interests) ? raw.interests : [],
  }
  const [photoIdx, setPhotoIdx] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [following, setFollowing] = useState(false)

  if (loading) {
    return (
      <Page nav={false} header={<Header back title="Profile" />}>
        <div className="flex-1 grid place-items-center"><Spinner /></div>
      </Page>
    )
  }

  if (!user) {
    return (
      <Page nav={false} header={<Header back title="Profile" />}>
        <EmptyState icon="user" title="Profile not found" description="This account may have been removed." action="Go back" onAction={() => navigate(-1)} />
      </Page>
    )
  }

  const campus = campusById(user.campusId)

  return (
    <Page
      nav={false}
      padBottom={false}
      swipeBack
      footer={
        <div className="glass border-t hairline px-5 pt-3 pb-[max(env(safe-area-inset-bottom),14px)]">
          <div className="max-w-[var(--content-max)] mx-auto flex gap-3 justify-center">
            <Button variant="secondary" size="lg" icon="x" className="!w-14 !px-0 !text-rose-500" onClick={() => navigate(-1)} aria-label="Pass" />
            <Button variant="secondary" size="lg" icon="star" className="!w-14 !px-0 !text-sky-500" onClick={() => toast('Super liked', 'brand')} aria-label="Super like" />
            <Button size="lg" icon="heart" full onClick={() => { toast(`You liked ${user.name}`, 'brand'); navigate(-1) }}>Like</Button>
          </div>
        </div>
      }
    >
      <Header back transparent border={false} right={<IconButton icon="dots" tone="glass" label="Options" onClick={() => setMenuOpen(true)} />} className="!absolute left-0 right-0 !top-0" />

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-32">
        <div className="relative aspect-[3/4] bg-[color:var(--app-elev)] overflow-hidden">
          {user.photos.length ? (
            <img src={user.photos[photoIdx]} alt={user.name} className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full elev grid place-items-center">
              <span className="text-[44px] font-semibold muted">{(user.name || '?')[0]}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/35 pointer-events-none" />

          {/* swipeable photo layer — no arrows, dots sit lower down */}
          <motion.div
            className="absolute inset-x-0 top-0 bottom-[120px] z-10"
            drag={user.photos.length > 1 ? 'x' : false}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragEnd={(_, info) => {
              const step = (d) => setPhotoIdx((i) => {
                const n = Math.min(user.photos.length - 1, Math.max(0, i + d))
                if (n !== i) { haptic('light'); completeHint('profilePhotoSwipe') }
                return n
              })
              if (info.offset.x < -45 || info.velocity.x < -420) step(1)
              else if (info.offset.x > 45 || info.velocity.x > 420) step(-1)
            }}
          />

          <div className="absolute bottom-[104px] left-0 right-0 z-20 flex justify-center">
            <SwipeHint hintId="profilePhotoSwipe" subjectId={user.uid} enabled={user.photos.length > 1} />
          </div>

          <div className="absolute bottom-[86px] left-0 right-0 z-20">
            <PhotoDots
              count={user.photos.length}
              index={photoIdx}
              onSelect={(i) => { haptic('light'); setPhotoIdx(i); completeHint('profilePhotoSwipe') }}
            />
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-5 text-white z-20 pointer-events-none">
            <Badge tone="brand" icon="badge" size="sm" className="!bg-white/18 !text-white backdrop-blur-sm mb-2">Verified student</Badge>
            <h1 className="font-display text-[32px] font-semibold tracking-[-0.035em] leading-none">
              {user.name} <span className="font-sans font-normal opacity-85 text-[26px]">{user.age}</span>
            </h1>
            <p className="text-[13.5px] opacity-90 mt-2 flex items-center gap-1.5">
              <Icon name="cap" size={15} /> {campus.name}
            </p>
          </div>
        </div>

        <div className="max-w-[var(--content-max)] mx-auto px-5 pt-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge icon="heart" size="sm">{intentLabel(user.intent)}</Badge>
            <Badge icon="cap" size="sm">{user.department}</Badge>
            <Badge icon="pin" size="sm">{user.distanceKm === 0 ? 'Same campus' : `${user.distanceKm} km away`}</Badge>
            <Badge icon="sparkline" size="sm">{user.level} level</Badge>
            {/* Count only, never a browsable list — a follower list on a
                dating app enumerates someone's social circle to strangers. */}
            {user.mutualCount > 0 && (
              <Badge icon="users" size="sm">
                {user.mutualCount} mutual{user.mutualCount === 1 ? '' : 's'}
              </Badge>
            )}
          </div>

          <p className="text-[15px] leading-relaxed">{user.bio}</p>

          {user.prompts.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.36 }}
              className="surface rounded-3xl p-4"
            >
              <p className="font-curvy italic text-[15.5px] text-brand-500">{p.q}</p>
              <p className="text-[15px] mt-1.5 leading-snug">{p.a}</p>
            </motion.div>
          ))}

          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.07em] muted mb-2.5">Into</p>
            <div className="flex flex-wrap gap-2">
              {user.interests.map((it) => <Chip key={it} size="sm" as="div">{it}</Chip>)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Button variant={following ? 'secondary' : 'soft'} icon={following ? 'check' : 'plus'} onClick={() => { setFollowing(!following); toast(following ? 'Unfollowed' : `Following ${user.name}`) }}>
              {following ? 'Following' : 'Follow'}
            </Button>
            <Button variant="secondary" icon="flag" onClick={() => navigate('/app/report')}>Report</Button>
          </div>
        </div>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Options">
        <div className="-mx-1">
          <ListRow icon="share" label="Share profile" onClick={() => { toast('Link copied'); setMenuOpen(false) }} />
          <ListRow icon="flag" label="Report profile" danger onClick={() => { setMenuOpen(false); navigate('/app/report') }} />
          <ListRow icon="block" label={`Block ${user.name}`} danger onClick={() => { toast('Blocked'); setMenuOpen(false); navigate(-1) }} />
        </div>
      </Sheet>
    </Page>
  )
}
