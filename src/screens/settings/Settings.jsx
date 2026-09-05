import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Section from '../../components/ui/Section'
import ListRow from '../../components/ui/ListRow'
import Avatar from '../../components/ui/Avatar'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { useStore } from '../../lib/store'
import { useTheme } from '../../lib/ThemeContext'
import { usePerf } from '../../lib/PerfContext'
import { campusById } from '../../lib/mock'

export default function Settings() {
  const navigate = useNavigate()
  const { me, dispatch, verificationStatus } = useStore()
  const { theme } = useTheme()
  const { tier } = usePerf()
  const [signOutOpen, setSignOutOpen] = useState(false)

  return (
    <Page
      nav={false}
      swipeBack
      header={
        <Header back title="Settings" />
      }
    >

      <div className="max-w-[560px] w-full mx-auto pb-10 space-y-7 pt-4">
        <button
          onClick={() => navigate('/app/edit-profile')}
          className="mx-4 surface rounded-3xl p-4 flex items-center gap-3.5 w-[calc(100%-2rem)] text-left active:opacity-80"
        >
          <Avatar src={me.photos[0]} name={me.name} size="lg" verified={verificationStatus === 'verified'} />
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-[16px] truncate">{me.name}</span>
            <span className="block text-[13px] muted truncate mt-0.5">{campusById(me.campusId).short} · {me.department}</span>
          </span>
          <Icon name="chevronRight" size={18} className="muted" />
        </button>

        <Section title="Account">
          <ListRow icon="user" label="Edit profile" onClick={() => navigate('/app/edit-profile')} />
          <ListRow icon="badge" label="Verification & trust" value={verificationStatus === 'verified' ? 'Verified' : 'Pending'} onClick={() => navigate('/app/trust')} />
          <ListRow icon="phone" label="Phone number" value="+234 ••• •• 78" onClick={() => navigate('/app/settings/account')} />
          <ListRow icon="crown" label="Leenk+" value="Free plan" onClick={() => navigate('/app/premium')} />
        </Section>

        <Section title="Discovery">
          <ListRow icon="sliders" label="Discovery preferences" description="Age, campus scope, intent" onClick={() => navigate('/app/settings/discovery')} />
          <ListRow icon="eye" label="Privacy & visibility" onClick={() => navigate('/app/settings/privacy')} />
        </Section>

        <Section title="App">
          <ListRow icon="bell" label="Notifications" onClick={() => navigate('/app/settings/notifications')} />
          <ListRow icon={theme === 'dark' ? 'moon' : 'sun'} label="Appearance" value={theme === 'dark' ? 'Dark' : 'Light'} onClick={() => navigate('/app/settings/appearance')} />
          <ListRow icon="bolt" label="Performance" value={tier === 'high' ? 'Full effects' : tier === 'mid' ? 'Balanced' : 'Battery saver'} onClick={() => navigate('/app/settings/appearance')} />
        </Section>

        <Section title="Safety">
          <ListRow icon="shield" label="Safety centre" onClick={() => navigate('/app/safety')} />
          <ListRow icon="block" label="Blocked accounts" value="0" onClick={() => navigate('/app/settings/blocked')} />
          <ListRow icon="flag" label="Report a problem" onClick={() => navigate('/app/report')} />
        </Section>

        <Section title="About">
          <ListRow icon="info" label="Community guidelines" onClick={() => navigate('/app/settings/legal')} />
          <ListRow icon="lock" label="Privacy policy" onClick={() => navigate('/app/settings/legal')} />
          <ListRow icon="globe" label="Terms of service" onClick={() => navigate('/app/settings/legal')} />
        </Section>

        <Section>
          <ListRow icon="logout" label="Sign out" danger chevron={false} onClick={() => setSignOutOpen(true)} />
          <ListRow icon="trash" label="Delete account" danger chevron={false} onClick={() => navigate('/app/settings/account')} />
        </Section>

        <p className="text-center text-[12px] muted">Leenk v0.1.0 · Built for students</p>
      </div>

      <Modal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title="Sign out?"
        description="You'll need your phone number and a code to get back in."
        actions={
          <>
            <Button full variant="secondary" onClick={() => setSignOutOpen(false)}>Cancel</Button>
            <Button full variant="danger" onClick={() => { dispatch({ type: 'auth/signout' }); navigate('/onboarding', { replace: true }) }}>
              Sign out
            </Button>
          </>
        }
      />
    </Page>
  )
}
