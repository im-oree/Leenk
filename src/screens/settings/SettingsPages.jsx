import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Section from '../../components/ui/Section'
import ListRow from '../../components/ui/ListRow'
import Toggle from '../../components/ui/Toggle'
import Chip from '../../components/ui/Chip'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import RangeSlider from '../../components/ui/RangeSlider'
import EmptyState from '../../components/ui/EmptyState'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { useStore } from '../../lib/store'
import { useTheme } from '../../lib/ThemeContext'
import { usePerf } from '../../lib/PerfContext'
import { INTENTS, DEPARTMENTS } from '../../lib/mock'

/* ---------------------------- Notifications ----------------------------- */
export function NotificationSettings() {
  const { settings, dispatch } = useStore()
  const n = settings.notifications
  const set = (k, v) => dispatch({ type: 'settings/set', patch: { notifications: { ...n, [k]: v } } })

  const items = [
    { k: 'matches', label: 'New matches', desc: 'When someone you liked likes you back' },
    { k: 'messages', label: 'Messages', desc: 'New messages from your matches' },
    { k: 'feed', label: 'Feed activity', desc: 'Likes, comments and new followers' },
    { k: 'safety', label: 'Safety & verification', desc: 'Account status and safety alerts', locked: true },
    { k: 'marketing', label: 'Product news', desc: 'Occasional updates about new features' },
  ]

  return (
    <Page nav={false} swipeBack>
      <Header back title="Notifications" />
      <div className="max-w-[560px] w-full mx-auto pt-4 space-y-6 pb-10">
        <div className="mx-4 p-4 rounded-3xl bg-brand-500/[0.07] flex gap-3">
          <Icon name="bell" size={18} className="text-brand-500 shrink-0 mt-0.5" />
          <p className="text-[13px] leading-relaxed muted">
            We only notify you when something actually happened. No fake “someone liked you” nudges — ever.
          </p>
        </div>
        <Section title="What you get">
          {items.map((it) => (
            <div key={it.k} className="px-4">
              <Toggle
                label={it.label}
                description={it.desc + (it.locked ? ' · always on' : '')}
                checked={it.locked ? true : n[it.k]}
                disabled={it.locked}
                onChange={(v) => set(it.k, v)}
              />
            </div>
          ))}
        </Section>
      </div>
    </Page>
  )
}

/* ------------------------------ Appearance ------------------------------ */
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const { tier } = usePerf()
  const { settings, dispatch } = useStore()

  return (
    <Page nav={false} swipeBack>
      <Header back title="Appearance" />
      <div className="max-w-[560px] w-full mx-auto pt-4 space-y-7 pb-10">
        <div className="px-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.07em] muted mb-3">Theme</p>
          <SegmentedControl
            value={theme}
            onChange={setTheme}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          />
        </div>

        <Section title="Motion & effects">
          <div className="px-4">
            <Toggle
              label="Reduce motion"
              description="Fewer animations, instant transitions"
              checked={settings.reduceMotion}
              onChange={(v) => dispatch({ type: 'settings/set', patch: { reduceMotion: v } })}
            />
          </div>
          <ListRow
            icon="bolt"
            label="Device performance"
            description={
              tier === 'high'
                ? 'Your device handles full blur, shadows and parallax.'
                : tier === 'mid'
                  ? 'Some heavy effects are trimmed to keep things smooth.'
                  : 'Effects are minimised so scrolling stays fast.'
            }
            value={tier === 'high' ? 'Full' : tier === 'mid' ? 'Balanced' : 'Saver'}
            chevron={false}
          />
        </Section>

        <p className="px-6 text-[12.5px] muted leading-relaxed">
          Leenk detects what your phone can handle and adjusts automatically. Layout never changes — only effects.
        </p>
      </div>
    </Page>
  )
}

/* ------------------------------- Privacy -------------------------------- */
export function PrivacySettings() {
  const { settings, dispatch, toast } = useStore()
  const p = settings.privacy
  const set = (k, v) => dispatch({ type: 'settings/set', patch: { privacy: { ...p, [k]: v } } })

  const scopes = [
    { id: 'home', label: 'My campus only' },
    { id: 'nearby', label: 'Nearby campuses' },
    { id: 'everyone', label: 'Everyone on Leenk' },
  ]

  return (
    <Page nav={false} swipeBack>
      <Header back title="Privacy & visibility" />
      <div className="max-w-[560px] w-full mx-auto pt-4 space-y-7 pb-10">
        <div className="px-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.07em] muted mb-3">Who can see my profile</p>
          <div className="space-y-2">
            {scopes.map((s) => (
              <button
                key={s.id}
                onClick={() => set('discoverability', s.id)}
                className={`w-full flex items-center gap-3 px-4 h-[54px] rounded-2xl border-2 text-left font-medium text-[15px] transition-colors ${
                  p.discoverability === s.id ? 'border-brand-500 bg-brand-500/[0.06]' : 'border-[color:var(--app-border)]'
                }`}
              >
                <span className="flex-1">{s.label}</span>
                {p.discoverability === s.id && <Icon name="check" size={17} className="text-brand-500" strokeWidth={2.6} />}
              </button>
            ))}
          </div>
        </div>

        <Section title="Controls">
          <div className="px-4">
            <Toggle label="Show me in discovery" description="Turn off to pause without deleting your account" checked={p.visible} onChange={(v) => { set('visible', v); toast(v ? 'You are discoverable' : 'Discovery paused') }} />
          </div>
          <div className="px-4">
            <Toggle label="Read receipts" description="Let matches see when you've read a message" checked={p.readReceipts} onChange={(v) => set('readReceipts', v)} />
          </div>
          <div className="px-4">
            <Toggle label="Show active status" description="Display when you were last online" checked={p.showActive} onChange={(v) => set('showActive', v)} />
          </div>
        </Section>

        <div className="mx-4 p-4 rounded-3xl elev flex gap-3">
          <Icon name="pin" size={18} className="muted shrink-0 mt-0.5" />
          <p className="text-[13px] leading-relaxed muted">
            Leenk never shows your exact location — only approximate distance and your campus. Your hostel or address is never visible.
          </p>
        </div>
      </div>
    </Page>
  )
}

/* ------------------------------ Discovery ------------------------------- */
export function DiscoverySettings() {
  const { filters, dispatch } = useStore()
  const set = (patch) => dispatch({ type: 'filters/set', patch })

  return (
    <Page nav={false} swipeBack>
      <Header back title="Discovery preferences" />
      <div className="max-w-[560px] w-full mx-auto pt-6 px-5 space-y-8 pb-10">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.07em] muted mb-4">Age range</p>
          <RangeSlider min={18} max={40} value={filters.ageRange} onChange={(v) => set({ ageRange: v })} />
        </div>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.07em] muted mb-3">Campus scope</p>
          <div className="flex flex-wrap gap-2">
            {[{ id: 'home', label: 'My campus' }, { id: 'nearby', label: 'Nearby' }, { id: 'anywhere', label: 'Anywhere' }].map((s) => (
              <Chip key={s.id} selected={filters.scope === s.id} onClick={() => set({ scope: s.id })}>{s.label}</Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.07em] muted mb-3">Relationship intent</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={filters.intent === 'any'} onClick={() => set({ intent: 'any' })}>Anything</Chip>
            {INTENTS.map((i) => <Chip key={i.id} selected={filters.intent === i.id} onClick={() => set({ intent: i.id })}>{i.label}</Chip>)}
          </div>
        </div>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.07em] muted mb-3">Department</p>
          <div className="flex flex-wrap gap-2">
            <Chip size="sm" selected={filters.department === 'any'} onClick={() => set({ department: 'any' })}>Any</Chip>
            {DEPARTMENTS.slice(0, 10).map((d) => (
              <Chip key={d} size="sm" selected={filters.department === d} onClick={() => set({ department: d })}>{d}</Chip>
            ))}
          </div>
        </div>
      </div>
    </Page>
  )
}

/* ------------------------------- Account -------------------------------- */
export function AccountSettings() {
  const navigate = useNavigate()
  const { dispatch, toast } = useStore()
  const [confirm, setConfirm] = useState(false)
  const [email, setEmail] = useState('')

  return (
    <Page nav={false} swipeBack>
      <Header back title="Account" />
      <div className="max-w-[560px] w-full mx-auto pt-4 space-y-7 pb-10">
        <Section title="Sign-in">
          <ListRow icon="phone" label="Phone number" value="+234 ••• •• 78" onClick={() => toast('Change flow opens here')} />
          <ListRow icon="mail" label="School email" value="Not linked" onClick={() => navigate('/verify')} />
        </Section>

        <Section title="Your data">
          <ListRow icon="share" label="Download my data" onClick={() => toast('Export requested')} />
          <ListRow icon="id" label="Verification documents" description="See what we hold and for how long" onClick={() => navigate('/app/trust')} />
        </Section>

        <Section title="Danger zone">
          <ListRow icon="eyeOff" label="Pause my account" description="Hide from discovery, keep your matches" onClick={() => toast('Account paused')} />
          <ListRow icon="trash" label="Delete account permanently" danger chevron={false} onClick={() => setConfirm(true)} />
        </Section>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        title="Delete your account?"
        description="Your profile, matches, messages and posts are permanently removed. This cannot be undone."
        actions={
          <>
            <Button full variant="secondary" onClick={() => setConfirm(false)}>Keep account</Button>
            <Button full variant="danger" disabled={email.trim().length < 3} onClick={() => { dispatch({ type: 'auth/signout' }); navigate('/onboarding', { replace: true }) }}>
              Delete
            </Button>
          </>
        }
      >
        <Input label="Type your email to confirm" placeholder="you@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Modal>
    </Page>
  )
}

/* ------------------------------- Blocked -------------------------------- */
export function BlockedSettings() {
  return (
    <Page nav={false} swipeBack>
      <Header back title="Blocked accounts" />
      <EmptyState icon="block" title="Nobody blocked" description="Anyone you block disappears from your stack, feed and chats — and can't find you either." />
    </Page>
  )
}

/* -------------------------------- Legal --------------------------------- */
export function LegalPage() {
  const sections = [
    { title: 'Be a real student', body: 'Every account is verified. Impersonating another person, using someone else\u2019s ID, or sharing your account is an immediate ban.' },
    { title: 'Respect goes both ways', body: 'Harassment, threats, hate speech and unsolicited explicit content have zero tolerance. Reports involving safety are reviewed first.' },
    { title: 'No solicitation', body: 'Leenk is not a marketplace. Selling, scamming or promoting paid services through profiles or DMs gets you removed.' },
    { title: 'Your data', body: 'ID documents and selfies are encrypted, used only for verification, and retained under our published retention policy. They are never shown to other users.' },
    { title: 'Appeals', body: 'If you think a decision was wrong — including a device-linked ban — Trust & Safety reviews every appeal with a human.' },
  ]
  return (
    <Page nav={false} swipeBack>
      <Header back title="Community guidelines" />
      <div className="max-w-[560px] w-full mx-auto px-6 pt-5 pb-12 space-y-6">
        {sections.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.36 }}
          >
            <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">{s.title}</h2>
            <p className="text-[14.5px] muted mt-2 leading-relaxed">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </Page>
  )
}
