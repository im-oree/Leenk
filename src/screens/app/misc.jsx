import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Icon from '../../components/ui/Icon'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Chip from '../../components/ui/Chip'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import ProgressBar from '../../components/ui/ProgressBar'
import EmptyState from '../../components/ui/EmptyState'
import Section from '../../components/ui/Section'
import ListRow from '../../components/ui/ListRow'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { useStore } from '../../lib/store'
import { CANDIDATES, POSTS, CAMPUSES, campusById, PROMPTS } from '../../lib/mock'
import { timeAgo } from '../../lib/format'
import { listStagger, listItem } from '../../lib/motion'
import { haptic } from '../../lib/haptics'

/* ---------------------------- Notifications ----------------------------- */
export function Notifications() {
  const navigate = useNavigate()
  const { notifications, dispatch } = useStore()
  const icons = { match: 'heart', like: 'heart', comment: 'comment', follow: 'user', verify: 'badge' }

  return (
    <Page nav={false} swipeBack>
      <Header
        back
        title="Activity"
        right={<Button variant="ghost" size="sm" className="muted" onClick={() => dispatch({ type: 'notifications/readAll' })}>Mark all read</Button>}
      />
      <div className="max-w-[var(--content-max)] w-full mx-auto pt-2 pb-10">
        {notifications.length ? (
          <motion.div variants={listStagger(0.04)} initial="initial" animate="animate">
            {notifications.map((n) => (
              <motion.button
                key={n.id}
                variants={listItem}
                onClick={() => navigate(n.type === 'match' ? '/app/matches' : '/app/feed')}
                className={`w-full flex items-start gap-3.5 px-4 py-3.5 text-left active:bg-[color:var(--app-elev)] ${n.unread ? 'bg-brand-500/[0.04]' : ''}`}
              >
                <span className="w-10 h-10 rounded-2xl elev text-brand-500 grid place-items-center shrink-0">
                  <Icon name={icons[n.type] || 'bell'} size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14.5px] font-medium">{n.title}</span>
                  <span className="block text-[13px] muted mt-0.5 leading-snug">{n.body}</span>
                </span>
                <span className="text-[11.5px] muted shrink-0">{timeAgo(n.at)}</span>
                {n.unread && <span className="w-2 h-2 rounded-full brand-fill shrink-0 mt-2" />}
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <EmptyState icon="bell" title="All quiet" description="Matches, messages and feed activity land here." />
        )}
      </div>
    </Page>
  )
}

/* -------------------------------- Likes --------------------------------- */
export function Likes() {
  const navigate = useNavigate()
  const people = CANDIDATES.slice(3, 11)

  return (
    <Page nav={false} swipeBack>
      <Header back title="Liked you" subtitle={`${people.length} people`} />
      <div className="max-w-[var(--content-max)] w-full mx-auto px-4 pt-3 pb-10">
        <div className="rounded-3xl brand-fill text-white p-5 mb-5 shadow-glow">
          <Icon name="crown" size={24} />
          <p className="font-display text-[19px] font-semibold tracking-[-0.02em] mt-2.5">See everyone who liked you</p>
          <p className="text-[13.5px] text-white/80 mt-1.5 leading-relaxed">Skip the guessing. Leenk+ reveals every like instantly.</p>
          <Button className="mt-4 !bg-white !text-brand-600 !shadow-none" onClick={() => navigate('/app/premium')}>Try Leenk+</Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {people.map((p, i) => (
            <motion.button
              key={p.uid}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04, duration: 0.32 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/app/user/${p.uid}`)}
              className="relative aspect-[3/4] rounded-3xl overflow-hidden bg-[color:var(--app-elev)]"
            >
              <img src={p.photos[0]} alt="" loading="lazy" className={`w-full h-full object-cover ${i > 1 ? 'blur-xl scale-110' : ''}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 text-white text-left">
                {i > 1 ? (
                  <div className="flex items-center gap-1.5">
                    <Icon name="lock" size={14} />
                    <span className="text-[13px] font-medium">Leenk+</span>
                  </div>
                ) : (
                  <>
                    <p className="font-semibold text-[15px] truncate">{p.name}, {p.age}</p>
                    <p className="text-[11.5px] opacity-80 truncate">{campusById(p.campusId).short}</p>
                  </>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </Page>
  )
}

/* ------------------------------- Compose -------------------------------- */
export function Compose() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isStory = params.get('type') === 'story'
  const { dispatch, me, toast } = useStore()
  const [caption, setCaption] = useState('')
  const [media, setMedia] = useState(null)
  const [scope, setScope] = useState('followers')

  const publish = () => {
    dispatch({
      type: 'post/create',
      post: {
        id: `p${Date.now()}`,
        author: { ...me, photos: me.photos },
        media: media || 'https://picsum.photos/seed/new/1000/1000',
        caption: caption || '',
        likes: 0, comments: 0, liked: false, at: Date.now(), scope,
      },
    })
    toast(isStory ? 'Story posted' : 'Posted to your feed', 'success')
    navigate('/app/feed')
  }

  return (
    <Page nav={false} padBottom={false}>
      <Header
        close
        onClose={() => navigate(-1)}
        title={isStory ? 'New story' : 'New post'}
        right={<Button size="sm" disabled={!media} onClick={publish}>Share</Button>}
      />
      <div className="flex-1 overflow-y-auto no-scrollbar max-w-[var(--content-max)] w-full mx-auto px-5 pt-4 pb-10 space-y-5">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => { haptic('light'); setMedia(`https://picsum.photos/seed/c${Date.now() % 999}/1000/1000`) }}
          className={`w-full aspect-square rounded-3xl overflow-hidden border-2 border-dashed grid place-items-center relative ${media ? 'border-transparent' : 'border-[color:var(--app-border)] elev'}`}
        >
          {media ? (
            <>
              <img src={media} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[12.5px] font-medium">Change</span>
            </>
          ) : (
            <span className="flex flex-col items-center gap-2.5 muted">
              <Icon name="image" size={32} />
              <span className="text-[14px] font-medium">Add a photo</span>
              <span className="text-[12.5px]">or record a short video</span>
            </span>
          )}
        </motion.button>

        {!isStory && (
          <>
            <Textarea label="Caption" placeholder="Say something…" maxLength={280} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <div>
              <p className="text-[13px] font-medium muted mb-2.5 ml-1">Who can see this</p>
              <div className="flex flex-wrap gap-2">
                {[{ id: 'followers', label: 'Followers' }, { id: 'campus', label: 'My campus' }, { id: 'nearby', label: 'Nearby campuses' }].map((s) => (
                  <Chip key={s.id} selected={scope === s.id} onClick={() => setScope(s.id)}>{s.label}</Chip>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="p-4 rounded-2xl elev flex gap-3">
          <Icon name="lock" size={17} className="muted shrink-0 mt-0.5" />
          <p className="text-[12.5px] leading-relaxed muted">
            Feed content stays inside Leenk. There's no public web view and nothing is indexed by search engines.
          </p>
        </div>
      </div>
    </Page>
  )
}

/* ------------------------------ Post detail ----------------------------- */
export function PostDetail() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { posts, dispatch } = useStore()
  const post = posts.find((p) => p.id === postId) || POSTS[0]
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState(
    CANDIDATES.slice(0, 4).map((c, i) => ({ id: i, author: c, text: ['this is such a good shot', 'ok but where is this', 'sending this to my roommate', 'the lighting 🔥'][i], at: Date.now() - i * 3600_000 })),
  )

  return (
    <Page nav={false} padBottom={false} swipeBack>
      <Header back title="Post" />
      <div className="flex-1 overflow-y-auto no-scrollbar max-w-[var(--content-max)] w-full mx-auto pb-4">
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar src={post.author.photos[0]} name={post.author.name} size="md" verified />
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold truncate">{post.author.name}</p>
            <p className="text-[12px] muted truncate">{campusById(post.author.campusId).short} · {timeAgo(post.at)}</p>
          </div>
        </div>
        <img src={post.media} alt="" className="w-full aspect-square object-cover" />
        <div className="px-4 pt-3">
          <div className="flex items-center gap-1">
            <button onClick={() => dispatch({ type: 'post/like', id: post.id })} className={`p-1.5 -ml-1.5 ${post.liked ? 'text-brand-500' : ''}`} aria-label="Like">
              <Icon name="heart" size={24} filled={post.liked} />
            </button>
            <button className="p-1.5" aria-label="Comment"><Icon name="comment" size={23} /></button>
            <button className="p-1.5" aria-label="Share"><Icon name="share" size={22} /></button>
          </div>
          <p className="text-[13.5px] font-semibold mt-1.5">{post.likes.toLocaleString()} likes</p>
          <p className="text-[14.5px] mt-1"><span className="font-semibold">{post.author.name}</span> {post.caption}</p>
        </div>

        <div className="mt-5 px-4 space-y-4">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.07em] muted">Comments</p>
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar src={c.author.photos[0]} name={c.author.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px]"><span className="font-semibold">{c.author.name}</span> {c.text}</p>
                <p className="text-[11.5px] muted mt-1">{timeAgo(c.at)} · Reply</p>
              </div>
              <button className="p-1 muted shrink-0" aria-label="Like comment"><Icon name="heart" size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="glass border-t hairline px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="max-w-[var(--content-max)] mx-auto flex items-center gap-2.5">
          <Input placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} containerClassName="flex-1" />
          <Button
            size="md" disabled={!comment.trim()}
            onClick={() => { setComments([...comments, { id: Date.now(), author: post.author, text: comment, at: Date.now() }]); setComment('') }}
          >
            Post
          </Button>
        </div>
      </div>
    </Page>
  )
}

/* ------------------------------ Trust score ----------------------------- */
export function TrustCenter() {
  const { me, verificationStatus } = useStore()
  const factors = [
    { label: 'Institutional check', value: 'School ID verified', score: 30, max: 30, icon: 'id' },
    { label: 'Face match & liveness', value: 'Passed', score: 25, max: 25, icon: 'face' },
    { label: 'Account age', value: '4 months', score: 14, max: 20, icon: 'clock' },
    { label: 'Community standing', value: 'No reports', score: 18, max: 20, icon: 'users' },
    { label: 'Device signals', value: 'One trusted device', score: 5, max: 5, icon: 'shield' },
  ]
  const total = factors.reduce((n, f) => n + f.score, 0)

  return (
    <Page nav={false} swipeBack>
      <Header back title="Verification & trust" />
      <div className="max-w-[var(--content-max)] w-full mx-auto pt-4 pb-12 space-y-7">
        <div className="mx-4 surface rounded-[28px] p-6 text-center">
          <Badge tone={verificationStatus === 'verified' ? 'success' : 'warn'} icon="badge">
            {verificationStatus === 'verified' ? 'Verified student' : 'Pending verification'}
          </Badge>
          <div className="relative w-[136px] h-[136px] mx-auto mt-5">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--app-border)" strokeWidth="9" />
              <motion.circle
                cx="60" cy="60" r="52" fill="none" stroke="url(#tg)" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - total / 100) }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              />
              <defs>
                <linearGradient id="tg" x1="0" y1="0" x2="120" y2="120">
                  <stop stopColor="#ff8fab" /><stop offset="1" stopColor="#e81f57" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div>
                <p className="font-display text-[34px] font-semibold tabular-nums leading-none">{total}</p>
                <p className="text-[11.5px] muted mt-1">trust score</p>
              </div>
            </div>
          </div>
          <p className="text-[13px] muted mt-4 leading-relaxed max-w-[280px] mx-auto">
            Your score is private. Other people only ever see a plain verified badge.
          </p>
        </div>

        <Section title="What builds your score">
          {factors.map((f) => (
            <div key={f.label} className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl elev text-brand-500 grid place-items-center shrink-0">
                  <Icon name={f.icon} size={17} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-medium">{f.label}</p>
                  <p className="text-[12.5px] muted mt-0.5">{f.value}</p>
                </div>
                <span className="text-[13px] font-semibold tabular-nums muted">{f.score}/{f.max}</span>
              </div>
              <ProgressBar value={(f.score / f.max) * 100} className="mt-2.5" />
            </div>
          ))}
        </Section>

        <Section title="Keeping it current">
          <ListRow icon="refresh" label="Re-verify each term" description="Next check: start of next semester" chevron={false} />
          <ListRow icon="shield" label="Appeal a decision" description="A human reviews every appeal" />
        </Section>
      </div>
    </Page>
  )
}

/* ------------------------------ Safety hub ------------------------------ */
export function SafetyCenter() {
  const navigate = useNavigate()
  const { toast } = useStore()
  return (
    <Page nav={false} swipeBack>
      <Header back title="Safety centre" />
      <div className="max-w-[var(--content-max)] w-full mx-auto pt-4 pb-12 space-y-7">
        <div className="mx-4 rounded-[28px] p-5 bg-brand-500/[0.07]">
          <Icon name="shield" size={26} className="text-brand-500" />
          <p className="font-display text-[19px] font-semibold tracking-[-0.02em] mt-3">Meeting someone new?</p>
          <p className="text-[13.5px] muted mt-1.5 leading-relaxed">
            Share your plan with a friend for a set window. They get your general location and when you expect to be done.
          </p>
          <Button className="mt-4" onClick={() => toast('Meetup share started', 'success')}>Share my meetup</Button>
        </div>

        <Section title="Tools">
          <ListRow icon="flag" label="Report someone" onClick={() => navigate('/app/report')} />
          <ListRow icon="block" label="Blocked accounts" onClick={() => navigate('/app/settings/blocked')} />
          <ListRow icon="eyeOff" label="Pause discovery" onClick={() => navigate('/app/settings/privacy')} />
        </Section>

        <Section title="Good habits">
          {[
            { icon: 'chat', label: 'Keep it in the app', d: 'No need to give out your number until you want to.' },
            { icon: 'pin', label: 'Meet somewhere public', d: 'First meetups are better on campus or somewhere busy.' },
            { icon: 'info', label: 'Trust the odd feeling', d: 'If something is off, unmatch. You never owe an explanation.' },
          ].map((t) => <ListRow key={t.label} icon={t.icon} label={t.label} description={t.d} chevron={false} />)}
        </Section>
      </div>
    </Page>
  )
}

/* -------------------------------- Report -------------------------------- */
export function ReportFlow() {
  const navigate = useNavigate()
  const { toast } = useStore()
  const [step, setStep] = useState(0)
  const [category, setCategory] = useState(null)
  const [detail, setDetail] = useState('')

  const cats = [
    { id: 'harassment', label: 'Harassment or threats', priority: true },
    { id: 'fake', label: "Not a real student / fake profile", priority: true },
    { id: 'explicit', label: 'Unsolicited explicit content', priority: true },
    { id: 'solicit', label: 'Selling or scamming' },
    { id: 'underage', label: 'Appears to be under 18', priority: true },
    { id: 'other', label: 'Something else' },
  ]

  return (
    <Page nav={false} padBottom={false} swipeBack onSwipeBack={() => (step === 0 ? navigate(-1) : setStep(0))}>
      <Header back onBack={() => (step === 0 ? navigate(-1) : setStep(0))} title="Report" subtitle={`Step ${step + 1} of 2`} />
      <div className="px-5"><ProgressBar value={((step + 1) / 2) * 100} /></div>

      <div className="flex-1 overflow-y-auto no-scrollbar max-w-[var(--content-max)] w-full mx-auto px-5 pt-6 pb-8">
        <AnimatePresence mode="wait">
          {step === 0 ? (
            <motion.div key="cat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.26 }}>
              <h1 className="font-display text-[26px] font-semibold tracking-[-0.035em] leading-tight">What happened?</h1>
              <p className="text-[14px] muted mt-2 leading-relaxed">Safety reports jump the queue. Everything you send stays confidential.</p>
              <div className="mt-6 space-y-2.5">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { haptic('light'); setCategory(c.id) }}
                    className={`w-full flex items-center gap-3 px-4 py-4 rounded-2xl border-2 text-left transition-colors ${category === c.id ? 'border-brand-500 bg-brand-500/[0.06]' : 'border-[color:var(--app-border)]'}`}
                  >
                    <span className="flex-1 text-[15px] font-medium">{c.label}</span>
                    {c.priority && <Badge tone="warn" size="sm">Priority</Badge>}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.26 }}>
              <h1 className="font-display text-[26px] font-semibold tracking-[-0.035em] leading-tight">Anything else?</h1>
              <p className="text-[14px] muted mt-2 leading-relaxed">Optional, but details help our moderators act faster.</p>
              <div className="mt-6">
                <Textarea rows={6} maxLength={600} placeholder="What happened, and when…" value={detail} onChange={(e) => setDetail(e.target.value)} />
              </div>
              <div className="mt-5 p-4 rounded-2xl elev flex gap-3">
                <Icon name="info" size={17} className="muted shrink-0 mt-0.5" />
                <p className="text-[12.5px] leading-relaxed muted">
                  Reports never trigger an instant ban on their own — they trigger review. This protects people from mass-report abuse.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="glass border-t hairline px-5 pt-3.5 pb-[max(env(safe-area-inset-bottom),18px)]">
        <div className="max-w-[var(--content-max)] mx-auto">
          <Button full size="lg" disabled={!category} onClick={() => { if (step === 0) setStep(1); else { toast('Report sent to moderators', 'success'); navigate(-1) } }}>
            {step === 0 ? 'Continue' : 'Submit report'}
          </Button>
        </div>
      </div>
    </Page>
  )
}

/* ------------------------------- Premium -------------------------------- */
export function Premium() {
  const navigate = useNavigate()
  const { toast } = useStore()
  const [plan, setPlan] = useState('term')

  const perks = [
    { icon: 'heart', title: 'See who liked you', body: 'Every like, unblurred, instantly.' },
    { icon: 'bolt', title: 'Unlimited swipes', body: 'No daily cap, no waiting.' },
    { icon: 'star', title: '5 super likes a day', body: 'Stand out where it counts.' },
    { icon: 'sliders', title: 'Advanced filters', body: 'Department, level and intent combined.' },
    { icon: 'badge', title: 'Verified+ badge', body: 'An extra video check for maximum trust.' },
    { icon: 'crown', title: 'Campus perks', body: 'Discounts at spots around your school.' },
  ]

  const plans = [
    { id: 'month', label: '1 month', price: '₦1,680', per: 'per month' },
    { id: 'term', label: '4 months', price: '₦4,900', per: '₦1,225 / month', tag: 'Best value' },
    { id: 'year', label: '12 months', price: '₦12,600', per: '₦1,050 / month' },
  ]

  return (
    <Page nav={false} padBottom={false}>
      <Header close onClose={() => navigate(-1)} title="Leenk+" />
      <div className="flex-1 overflow-y-auto no-scrollbar max-w-[var(--content-max)] w-full mx-auto px-5 pt-3 pb-8">
        <div className="text-center py-5">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="w-16 h-16 rounded-[24px] brand-fill grid place-items-center mx-auto shadow-glow">
            <Icon name="crown" size={28} className="text-white" />
          </motion.div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.035em] mt-4 leading-tight">
            More <span className="font-curvy italic font-normal brand-text">yes</span>, less waiting
          </h1>
          <p className="text-[14.5px] muted mt-2 leading-relaxed">Everything unlocked, same verified network.</p>
        </div>

        <div className="space-y-2.5 mt-2">
          {perks.map((p, i) => (
            <motion.div key={p.title} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: 0.34 }} className="flex gap-3.5 items-start">
              <span className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-500 grid place-items-center shrink-0">
                <Icon name={p.icon} size={17} />
              </span>
              <span>
                <span className="block font-medium text-[14.5px]">{p.title}</span>
                <span className="block text-[12.5px] muted mt-0.5">{p.body}</span>
              </span>
            </motion.div>
          ))}
        </div>

        <div className="mt-7 space-y-2.5">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => { haptic('light'); setPlan(p.id) }}
              className={`w-full flex items-center gap-3.5 p-4 rounded-3xl border-2 text-left transition-colors ${plan === p.id ? 'border-brand-500 bg-brand-500/[0.06]' : 'border-[color:var(--app-border)]'}`}
            >
              <span className={`w-5 h-5 rounded-full border-2 grid place-items-center shrink-0 ${plan === p.id ? 'border-brand-500 brand-fill' : 'border-[color:var(--app-border)]'}`}>
                {plan === p.id && <Icon name="check" size={10} strokeWidth={3.4} className="text-white" />}
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-[15px]">{p.label}</span>
                  {p.tag && <Badge tone="brand" size="sm">{p.tag}</Badge>}
                </span>
                <span className="block text-[12.5px] muted mt-0.5">{p.per}</span>
              </span>
              <span className="font-display font-semibold text-[16px]">{p.price}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="glass border-t hairline px-5 pt-3.5 pb-[max(env(safe-area-inset-bottom),18px)]">
        <div className="max-w-[var(--content-max)] mx-auto">
          <Button full size="lg" onClick={() => toast('Payment connects to Paystack', 'brand')}>Continue</Button>
          <p className="text-[11.5px] muted text-center mt-2.5">Cancel any time. Renews automatically.</p>
        </div>
      </div>
    </Page>
  )
}

/* ----------------------------- Edit profile ----------------------------- */
export function EditProfile() {
  const navigate = useNavigate()
  const { me, dispatch, toast } = useStore()
  const [draft, setDraft] = useState(me)
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <Page nav={false} padBottom={false} swipeBack>
      <Header
        back title="Edit profile"
        right={<Button size="sm" onClick={() => { dispatch({ type: 'profile/update', patch: draft }); toast('Profile saved', 'success'); navigate(-1) }}>Save</Button>}
      />
      <div className="flex-1 overflow-y-auto no-scrollbar max-w-[var(--content-max)] w-full mx-auto px-5 pt-5 pb-10 space-y-7">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.07em] muted mb-3">Photos</p>
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => {
              const src = draft.photos[i]
              return (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    const photos = [...draft.photos]
                    if (src) photos.splice(i, 1)
                    else photos[i] = `https://picsum.photos/seed/e${i}${Date.now() % 99}/800/1100`
                    set({ photos })
                  }}
                  className={`relative aspect-[3/4] rounded-2xl overflow-hidden border-2 border-dashed ${src ? 'border-transparent' : 'border-[color:var(--app-border)] elev'}`}
                >
                  {src ? (
                    <>
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 grid place-items-center">
                        <Icon name="close" size={12} className="text-white" strokeWidth={2.6} />
                      </span>
                    </>
                  ) : (
                    <span className="w-full h-full grid place-items-center muted"><Icon name="plus" size={20} /></span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </div>

        <Textarea label="Bio" maxLength={200} value={draft.bio || ''} onChange={(e) => set({ bio: e.target.value })} />

        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.07em] muted mb-3">Prompts</p>
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => {
              const p = draft.prompts?.[i]
              return (
                <div key={i} className="surface rounded-3xl p-4">
                  <select
                    value={p?.q || ''}
                    onChange={(e) => {
                      const prompts = [...(draft.prompts || [])]
                      prompts[i] = { q: e.target.value, a: prompts[i]?.a || '' }
                      set({ prompts })
                    }}
                    className="w-full bg-transparent outline-none font-curvy italic text-[15.5px] text-brand-500 mb-2"
                  >
                    <option value="">Choose a prompt…</option>
                    {PROMPTS.map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                  <Textarea
                    rows={2} maxLength={160} placeholder="Your answer…"
                    value={p?.a || ''}
                    onChange={(e) => {
                      const prompts = [...(draft.prompts || [])]
                      prompts[i] = { q: prompts[i]?.q || '', a: e.target.value }
                      set({ prompts })
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <Section title="Details" flush>
          <div className="surface rounded-3xl overflow-hidden divide-y divide-[color:var(--app-border)]">
            <ListRow icon="cap" label="Campus" value={campusById(draft.campusId).short} onClick={() => toast('Campus changes need re-verification')} />
            <ListRow icon="id" label="Department" value={draft.department} onClick={() => navigate('/app/settings/discovery')} />
            <ListRow icon="sparkline" label="Level" value={draft.level} onClick={() => navigate('/app/settings/discovery')} />
            <ListRow icon="heart" label="Looking for" value={draft.intent} onClick={() => navigate('/app/settings/discovery')} />
          </div>
        </Section>
      </div>
    </Page>
  )
}

/* ------------------------------- Campus --------------------------------- */
export function CampusPage() {
  const { campusId } = useParams()
  const navigate = useNavigate()
  const campus = campusById(campusId)
  const students = CANDIDATES.filter((c) => c.campusId === campusId)
  const feed = POSTS.filter((p) => p.author.campusId === campusId)
  const [tab, setTab] = useState('posts')

  return (
    <Page nav={false} swipeBack>
      <Header back title={campus.short} subtitle={`${campus.userCount.toLocaleString()} verified students`} />
      <div className="max-w-[var(--content-max)] w-full mx-auto pb-10">
        <div className="px-5 pt-4">
          <div className="surface rounded-[28px] p-5">
            <span className="w-12 h-12 rounded-2xl elev grid place-items-center font-display font-semibold text-brand-500">
              {campus.short.slice(0, 3).toUpperCase()}
            </span>
            <h1 className="font-display text-[22px] font-semibold tracking-[-0.03em] mt-3">{campus.name}</h1>
            <p className="text-[13.5px] muted mt-1">{campus.city}</p>
            <div className="flex gap-2 mt-3.5">
              <Badge icon="users" size="sm">{campus.userCount.toLocaleString()} students</Badge>
              <Badge icon="badge" size="sm">Verification: {campus.verificationMethod}</Badge>
            </div>
          </div>
        </div>

        <div className="px-4 mt-5">
          <SegmentedControl size="sm" value={tab} onChange={setTab} options={[{ value: 'posts', label: 'Posts' }, { value: 'people', label: 'People' }]} />
        </div>

        {tab === 'posts' ? (
          <div className="grid grid-cols-3 gap-[3px] px-[3px] mt-3">
            {feed.map((p) => (
              <button key={p.id} onClick={() => navigate(`/app/post/${p.id}`)} className="aspect-square overflow-hidden bg-[color:var(--app-elev)]">
                <img src={p.media} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
            {feed.length === 0 && <div className="col-span-3"><EmptyState icon="image" title="No posts yet" description="Be the first to post from this campus." /></div>}
          </div>
        ) : (
          <div className="px-4 mt-3 space-y-1.5">
            {students.map((s) => (
              <button key={s.uid} onClick={() => navigate(`/app/user/${s.uid}`)} className="w-full flex items-center gap-3.5 p-2.5 rounded-2xl active:bg-[color:var(--app-elev)] text-left">
                <Avatar src={s.photos[0]} name={s.name} size="md" verified />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[15px] truncate">{s.name}, {s.age}</span>
                  <span className="block text-[12.5px] muted truncate">{s.department}</span>
                </span>
                <Icon name="chevronRight" size={17} className="muted" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}

/* -------------------------------- Story --------------------------------- */
export function StoryViewer() {
  const navigate = useNavigate()
  const { storyId } = useParams()
  const [progress, setProgress] = useState(0)
  const story = CANDIDATES[0]

  useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) return 100
        return p + 1.4
      })
    }, 60)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (progress >= 100) navigate(-1)
  }, [progress, navigate])

  return (
    <Page nav={false} padBottom={false} scroll={false} className="bg-black">
      <div className="relative flex-1">
        <img src={story.photos[1]} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />
        <div className="absolute top-0 left-0 right-0 safe-top px-4 pt-3 z-10">
          <div className="h-[3px] rounded-full bg-white/25 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-[width] duration-75" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Avatar src={story.photos[0]} name={story.name} size="sm" />
            <span className="text-white text-[14px] font-medium flex-1">{story.name}</span>
            <button onClick={() => navigate(-1)} className="text-white p-1.5" aria-label="Close"><Icon name="close" size={22} /></button>
          </div>
        </div>
        <button className="absolute left-0 inset-y-0 w-1/3" onClick={() => setProgress(0)} aria-label="Previous" />
        <button className="absolute right-0 inset-y-0 w-1/3" onClick={() => navigate(-1)} aria-label="Next" />
        <div className="absolute bottom-0 left-0 right-0 p-4 safe-bottom flex items-center gap-2.5">
          <div className="flex-1 rounded-full border border-white/35 px-4 py-3 text-white/70 text-[14px]">Send a message</div>
          <button className="w-11 h-11 rounded-full grid place-items-center text-white border border-white/35" aria-label="Like"><Icon name="heart" size={19} /></button>
        </div>
      </div>
    </Page>
  )
}

/* -------------------------------- Share --------------------------------- */
export function SharePage() {
  const { me, toast } = useStore()
  return (
    <Page nav={false} swipeBack>
      <Header back title="Share Leenk" />
      <div className="max-w-[480px] w-full mx-auto px-6 pt-6 pb-12 text-center">
        <div className="surface rounded-[28px] p-7">
          <Avatar src={me.photos[0]} name={me.name} size="xl" verified className="mx-auto" />
          <p className="font-display text-[20px] font-semibold tracking-[-0.02em] mt-4">{me.name} is on Leenk</p>
          <p className="text-[13.5px] muted mt-2 leading-relaxed">Invite a coursemate. More verified students on your campus means better matches for everyone.</p>
          <div className="mt-6 p-3.5 rounded-2xl elev font-mono text-[13.5px] break-all">leenk.app/i/{me.name.toLowerCase()}-{campusById(me.campusId).short.toLowerCase()}</div>
          <Button full className="mt-4" icon="share" onClick={() => toast('Invite link copied', 'success')}>Copy invite link</Button>
        </div>
      </div>
    </Page>
  )
}
