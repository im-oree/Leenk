# Leenk

Campus-only dating & social app for verified university students.
React + Vite + Tailwind + Framer Motion, wrapped with Capacitor for iOS/Android,
fully responsive on web. Mobile-first.

**Status:** complete front end running on mock data. No backend is wired — every
mutation goes through one store, which is the seam where Firebase/StudentHub
calls drop in.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
npm run cap:sync   # build + sync native shells (after `npx cap add ios|android`)
```

## Design system

| Token | Value |
|---|---|
| Brand | `#fb3f6d` reddish-pink, gradient `#ff5c85 → #d61350` |
| Default theme | **Light**. Dark is `#050506`. Picked during onboarding, changeable in Settings. |
| Display font | Bricolage Grotesque (headings) |
| Body font | Inter |
| Curvy font | Instrument Serif — italic, used only for prompts and one-word accents |

Theme is driven by CSS variables on `html.dark` / `html.light`, so every surface
transitions together with no flash.

## Performance adaptation

`src/lib/perf.js` scores the device on memory, cores, network and reduced-motion,
then samples live FPS for the first few seconds. The tier lands on `high | mid | low`
and is applied as a class on `<html>`:

- **high** — blur, shadows, parallax, gradient glows, stagger
- **mid** — shadows and springs, no parallax or heavy blur
- **low** — flat surfaces, no backdrop-filter, no shimmer, minimal motion

Layout never changes between tiers — only effects — so nothing ever looks broken
on a budget Android phone. Users can see their detected tier under
Settings → Appearance.

## Architecture

```
src/
  components/
    brand/     Logo mark (two interlocking hearts forming a chain link) + wordmark
    layout/    Page shell, Header, NavBar, NavContext, NavDirection
    swipe/     SwipeCard, SwipeControls, MatchOverlay
    feed/      PostCard, StoryRail
    ui/        Button, IconButton, Input, Textarea, Sheet, Modal, Avatar,
               Badge, Toggle, Chip, SegmentedControl, ProgressBar, RangeSlider,
               Skeleton, EmptyState, ListRow, Section, Toast, Spinner, Icon
  screens/
    onboarding/  Welcome, 12 progressive steps, Verify, VerifyPending
    app/         Discover, Feed, Explore, Matches, Chat, Profile, UserProfile,
                 plus misc.jsx (Notifications, Likes, Compose, PostDetail,
                 TrustCenter, SafetyCenter, ReportFlow, Premium, EditProfile,
                 CampusPage, StoryViewer, SharePage)
    settings/    Settings hub + 7 paginated sub-pages
  lib/         store, mock data, perf, theme, motion presets, haptics, format
```

Every button, row, chip, sheet and badge is its own component file and is reused
across screens — nothing is styled inline per-page.

### Navigation

- Bottom nav is a component with an on/off state (`<Page nav={false}>`), and it
  **slides in and out** rather than popping. The feed also hides it on scroll-down
  and brings it back on scroll-up.
- Every page has a back or close affordance via `<Header back />` / `<Header close />`.
- Page transitions are directional: forward pushes in from the right, back pushes
  from the left, tracked in `NavDirection`.
- Pushed pages accept `swipeBack` for the native edge-swipe gesture.

### Icons

Custom single-stroke set in `components/ui/Icon.jsx` (~55 glyphs, 1.7 weight,
round caps). No icon library dependency.

## Wiring the backend (when you're ready)

Nothing calls the network today. The integration points, in order:

1. **`src/lib/store.jsx`** — one reducer holds every piece of state. Each `case`
   is a named mutation (`swipe`, `message/send`, `post/like`, `match/unmatch`,
   `verify/set`…). Replace the local update with a Firestore write plus an
   `onSnapshot` subscription; no component changes.
2. **`src/lib/mock.js`** — the shapes here mirror the PRD data model and the
   StudentHub Firestore schema. Swap the exported arrays for live reads.
3. **Auth** — `onboard/complete` and `verify/set` are where Firebase Auth
   (phone OTP) and the verification pipeline attach.
4. **Gate** — `App.jsx` `<Gate>` already blocks every app route on
   `verificationStatus !== 'verified'`. Point it at the server-side flag.
5. **Payments** — the Premium screen's CTA is the Paystack hook.
6. **Haptics / camera / push** — `src/lib/haptics.js` already prefers the
   Capacitor plugin and falls back to the web Vibration API.

## What's built against the PRD

Auth & progressive onboarding · profile with prompts · swipe/match with
super-like, undo and daily cap · match celebration · chat with unmatch,
report and block one tap away · Instagram-style feed, stories and explore ·
verification flow (method → document → liveness selfie → review) with the
pending gate · private trust score breakdown · safety centre with meetup
sharing · two-step report flow that prioritises safety categories ·
notification settings with no engagement-bait · full paginated settings.
