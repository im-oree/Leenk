import { AnimatePresence } from 'framer-motion'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

import { NavProvider } from './components/layout/NavContext'
import { NetworkProvider } from './lib/network'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { NavDirectionProvider } from './components/layout/NavDirection'
import NavBar from './components/layout/NavBar'
import ToastHost from './components/ui/Toast'
import { useStore } from './lib/store'

import Welcome from './screens/onboarding/Welcome'
import { OnboardingProvider } from './screens/onboarding/OnboardingContext'
import {
  PhoneStep, CodeStep, AppearanceStep, NameStep, BirthdateStep, GenderStep,
  CampusStep, StudyStep, IntentStep, PhotosStep, PromptsStep, VerifyIntroStep,
} from './screens/onboarding/steps'
import Verify from './screens/onboarding/Verify'
import VerifyPending from './screens/onboarding/VerifyPending'

import Discover from './screens/app/Discover'
import Feed from './screens/app/Feed'
import Explore from './screens/app/Explore'
import Matches from './screens/app/Matches'
import Chat from './screens/app/Chat'
import Profile from './screens/app/Profile'
import UserProfile from './screens/app/UserProfile'
import {
  Notifications, Likes, Compose, PostDetail, TrustCenter, SafetyCenter,
  ReportFlow, Premium, EditProfile, CampusPage, StoryViewer, SharePage,
} from './screens/app/misc'

import Settings from './screens/settings/Settings'
import {
  NotificationSettings, AppearanceSettings, PrivacySettings,
  DiscoverySettings, AccountSettings, BlockedSettings, LegalPage,
} from './screens/settings/SettingsPages'

/** Verification is a hard gate — checked on every app route. */
function Gate({ children }) {
  const { onboarded, verificationStatus } = useStore()
  if (!onboarded) return <Navigate to="/onboarding" replace />
  if (verificationStatus !== 'verified') return <Navigate to="/verify/pending" replace />
  return children
}

function Onboarding() {
  return (
    <OnboardingProvider>
      <Routes>
        <Route index element={<Welcome />} />
        <Route path="phone" element={<PhoneStep />} />
        <Route path="verify-code" element={<CodeStep />} />
        <Route path="appearance" element={<AppearanceStep />} />
        <Route path="name" element={<NameStep />} />
        <Route path="birthdate" element={<BirthdateStep />} />
        <Route path="gender" element={<GenderStep />} />
        <Route path="campus" element={<CampusStep />} />
        <Route path="study" element={<StudyStep />} />
        <Route path="intent" element={<IntentStep />} />
        <Route path="photos" element={<PhotosStep />} />
        <Route path="prompts" element={<PromptsStep />} />
        <Route path="verify-intro" element={<VerifyIntroStep />} />
      </Routes>
    </OnboardingProvider>
  )
}

function Shell() {
  const location = useLocation()
  const { onboarded, verificationStatus } = useStore()

  const home = !onboarded
    ? '/onboarding'
    : verificationStatus !== 'verified'
      ? '/verify/pending'
      : '/app/discover'

  return (
    <>
      <AnimatePresence mode="popLayout" initial={false}>
        <Routes location={location} key={location.pathname.split('/').slice(0, 3).join('/')}>
          <Route path="/" element={<Navigate to={home} replace />} />

          <Route path="/onboarding/*" element={<Onboarding />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/pending" element={<VerifyPending />} />

          <Route path="/app/discover" element={<Gate><Discover /></Gate>} />
          <Route path="/app/feed" element={<Gate><Feed /></Gate>} />
          <Route path="/app/explore" element={<Gate><Explore /></Gate>} />
          <Route path="/app/matches" element={<Gate><Matches /></Gate>} />
          <Route path="/app/profile" element={<Gate><Profile /></Gate>} />

          <Route path="/app/chat/:matchId" element={<Gate><Chat /></Gate>} />
          <Route path="/app/user/:userId" element={<Gate><UserProfile /></Gate>} />
          <Route path="/app/post/:postId" element={<Gate><PostDetail /></Gate>} />
          <Route path="/app/story/:storyId" element={<Gate><StoryViewer /></Gate>} />
          <Route path="/app/campus/:campusId" element={<Gate><CampusPage /></Gate>} />

          <Route path="/app/notifications" element={<Gate><Notifications /></Gate>} />
          <Route path="/app/likes" element={<Gate><Likes /></Gate>} />
          <Route path="/app/compose" element={<Gate><Compose /></Gate>} />
          <Route path="/app/trust" element={<Gate><TrustCenter /></Gate>} />
          <Route path="/app/safety" element={<Gate><SafetyCenter /></Gate>} />
          <Route path="/app/report" element={<Gate><ReportFlow /></Gate>} />
          <Route path="/app/premium" element={<Gate><Premium /></Gate>} />
          <Route path="/app/edit-profile" element={<Gate><EditProfile /></Gate>} />
          <Route path="/app/share" element={<Gate><SharePage /></Gate>} />

          <Route path="/app/settings" element={<Gate><Settings /></Gate>} />
          <Route path="/app/settings/notifications" element={<Gate><NotificationSettings /></Gate>} />
          <Route path="/app/settings/appearance" element={<Gate><AppearanceSettings /></Gate>} />
          <Route path="/app/settings/privacy" element={<Gate><PrivacySettings /></Gate>} />
          <Route path="/app/settings/discovery" element={<Gate><DiscoverySettings /></Gate>} />
          <Route path="/app/settings/account" element={<Gate><AccountSettings /></Gate>} />
          <Route path="/app/settings/blocked" element={<Gate><BlockedSettings /></Gate>} />
          <Route path="/app/settings/legal" element={<Gate><LegalPage /></Gate>} />

          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </AnimatePresence>

      <NavBar />
      <ToastHost />
    </>
  )
}

export default function App() {
  return (
    <NetworkProvider>
      <NavDirectionProvider>
        <NavProvider>
          {/* Scoped per-shell so one bad screen can't take the whole app down */}
          <ErrorBoundary>
            <Shell />
          </ErrorBoundary>
        </NavProvider>
      </NavDirectionProvider>
    </NetworkProvider>
  )
}
