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
import { CANDIDATES, campusById, intentLabel } from '../../lib/mock'
import { useStore } from '../../lib/store'
import { haptic } from '../../lib/haptics'

export default function UserProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { toast } = useStore()
  const user = CANDIDATES.find((c) => c.uid === userId)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [following, setFollowing] = useState(false)

  if (!user) {
    return (
      <Page nav={false}>
        <Header back title="Profile" />
        <EmptyState icon="user" title="Profile not found" description="This account may have been removed." action="Go back" onAction={() => navigate(-1)} />
      </Page>
    )
  }

  const campus = campusById(user.campusId)

  return (
    <Page nav={false} padBottom={false} swipeBack>
      <Header back transparent border={false} right={<IconButton icon="dots" tone="glass" label="Options" onClick={() => setMenuOpen(true)} />} className="!absolute left-0 right-0 !top-0" />

      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        <div className="relative aspect-[3/4] bg-[color:var(--app-elev)]">
          <img src={user.photos[photoIdx]} alt={user.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/35 pointer-events-none" />

          <div className="absolute top-3 left-4 right-4 flex gap-1.5 z-10">
            {user.photos.map((_, i) => (
              <button
                key={i}
                onClick={() => { haptic('light'); setPhotoIdx(i) }}
                className="flex-1 h-[3px] rounded-full bg-white/28 overflow-hidden"
              >
                <motion.span className="block h-full bg-white rounded-full" initial={false} animate={{ width: i <= photoIdx ? '100%' : '0%' }} transition={{ duration: 0.25 }} />
              </button>
            ))}
          </div>

          <button className="absolute left-0 top-0 bottom-0 w-1/3" aria-label="Previous photo" onClick={() => photoIdx > 0 && setPhotoIdx(photoIdx - 1)} />
          <button className="absolute right-0 top-0 bottom-0 w-1/3" aria-label="Next photo" onClick={() => photoIdx < user.photos.length - 1 && setPhotoIdx(photoIdx + 1)} />

          <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
            <Badge tone="brand" icon="badge" size="sm" className="!bg-white/18 !text-white backdrop-blur-sm mb-2">Verified student</Badge>
            <h1 className="font-display text-[32px] font-semibold tracking-[-0.035em] leading-none">
              {user.name} <span className="font-sans font-normal opacity-85 text-[26px]">{user.age}</span>
            </h1>
            <p className="text-[13.5px] opacity-90 mt-2 flex items-center gap-1.5">
              <Icon name="cap" size={15} /> {campus.name}
            </p>
          </div>
        </div>

        <div className="max-w-[560px] mx-auto px-5 pt-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge icon="heart" size="sm">{intentLabel(user.intent)}</Badge>
            <Badge icon="cap" size="sm">{user.department}</Badge>
            <Badge icon="pin" size="sm">{user.distanceKm === 0 ? 'Same campus' : `${user.distanceKm} km away`}</Badge>
            <Badge icon="sparkline" size="sm">{user.level} level</Badge>
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

      <div className="glass border-t hairline px-5 pt-3 pb-[max(env(safe-area-inset-bottom),14px)]">
        <div className="max-w-[560px] mx-auto flex gap-3 justify-center">
          <Button variant="secondary" size="lg" icon="x" className="!w-14 !px-0 !text-rose-500" onClick={() => navigate(-1)} aria-label="Pass" />
          <Button variant="secondary" size="lg" icon="star" className="!w-14 !px-0 !text-sky-500" onClick={() => toast('Super liked', 'brand')} aria-label="Super like" />
          <Button size="lg" icon="heart" full onClick={() => { toast(`You liked ${user.name}`, 'brand'); navigate(-1) }}>Like</Button>
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
