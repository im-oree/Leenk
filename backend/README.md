# Leenk Backend

Node + Express API for Leenk, federating with the StudentHub platform.

> **For the StudentHub devs:** everything you need to build is in
> [`docs/STUDENTHUB_INTEGRATION.md`](docs/STUDENTHUB_INTEGRATION.md).
> That document is the deliverable — it lists every new endpoint, collection
> and schema change we're requesting, with exact JSON shapes.

---

## Run

```bash
cd backend
cp .env.example .env
npm install
npm run dev          # http://localhost:5100
curl localhost:5100/health
```

**No Firebase credentials needed to start.** With `FIREBASE_*` blank the API
uses an in-memory Firestore-compatible store (`src/lib/memoryDb.js`) so every
endpoint is exercisable immediately. Fill in the env vars and it switches to
real Firestore with zero code changes.

Same for StudentHub: `STUDENTHUB_ENABLED=false` keeps the app fully functional;
federation calls are skipped and queued rather than failing.

---

## Architecture

Leenk has **its own Firebase project**. StudentHub stays the identity anchor.

| Owned by Leenk | Owned by StudentHub |
|---|---|
| swipes, matches, messages | user identity (`uid`) |
| posts, follows, likes | academic records, matric, UMIS |
| trust score, verification records | ID-card verification |
| device fingerprints, bans | campus registry, places, geofences |
| dating prefs, prompts, photos | wallet, points, HubScore |

Every Leenk user row carries `studentHubUid` as the join key. Dating data
(who swiped whom, chat content) **never** leaves Leenk.

```
src/
  server.js              express app, limiters, error handler
  lib/
    config.js            env → typed config
    firebase.js          Firestore or in-memory fallback
    memoryDb.js          Firestore-compatible dev shim
    geo.js               haversine, grid snap, geohash, plausibility
  middleware/
    auth.js              requireAuth / requireVerified / requireAdmin
  services/
    studentHub.js        OIDC + REST client for the parent platform
    profileMapper.js     field ownership & merge policy
    trust.js             trust score engine, shadow-throttling
    location.js          ingestion, throttling, k-anonymity
    outbox.js            durable retry queue for StudentHub writes
  routes/
    auth.js  profile.js  discovery.js  matches.js
    feed.js  location.js verification.js  safety.js
```

---

## Endpoints

```
GET    /health
GET    /api                                  self-describing index
GET    /api/integration/studenthub/health

POST   /api/auth/signup                      → also provisions into StudentHub
POST   /api/auth/studenthub/callback         → "Sign in with StudentHub" (OIDC)
POST   /api/auth/link-studenthub
GET    /api/auth/me

GET    /api/profile                          PUT /api/profile
GET    /api/profile/:uid                     POST|DELETE /api/profile/:uid/block
GET    /api/profile/sync/studenthub

GET    /api/discovery/stack                  POST /api/discovery/swipe
POST   /api/discovery/undo                   GET  /api/discovery/likes
PUT    /api/discovery/filters

GET    /api/matches                          DELETE /api/matches/:id
GET    /api/matches/:id/messages             POST   /api/matches/:id/messages

GET    /api/feed                             POST /api/feed
POST   /api/feed/:postId/like                GET|POST /api/feed/:postId/comments
POST   /api/feed/follow/:uid

POST   /api/location/ping                    POST /api/location/batch
GET    /api/location/policy                  GET  /api/location/presence/:campusId
GET    /api/location/campus/:campusId/places

POST   /api/verification/submit              GET  /api/verification/status
POST   /api/verification/studenthub-umis     POST /api/verification/vouch
GET    /api/verification/queue               POST /api/verification/queue/:id/decide

POST   /api/safety/report                    POST /api/safety/meetup
POST   /api/safety/appeal                    GET  /api/safety/reports
POST   /api/safety/reports/:id/resolve
```

---

## Key behaviours

**Verification is a hard gate.** `requireVerified` runs on every discovery,
match, message and feed route — checked server-side on each request, not just
at signup (PRD §1.4.2). An unverified token gets `403 NOT_VERIFIED`.

**Trust score** (`services/trust.js`) is 0–100, private to the user, built from
capped additive signals. Below 55 the account is silently shadow-throttled via
`visibilityMultiplier`; below 40 it can't swipe. New signals are just new keys
in `SIGNAL_WEIGHTS` — no re-architecture (PRD §2.3.2).

**Append-only audit.** Verification decisions, moderation actions and bans are
written as new documents; nothing is overwritten (PRD §1.6).

**Ban propagation** targets the person: the account plus every linked device
fingerprint, so delete-and-resignup doesn't work (PRD §1.8.6).

**Reports never auto-ban.** Three open reports move an account to
`in_review` — re-verification, not removal — so mass-reporting can't be
weaponised (PRD §1.8.4).

**Location** is grid-snapped to 250 m before storage, exposed to other users
only as a fuzzy bucket, k-anonymised at 3 for aggregate counts, and gated by
interval + movement + plausibility checks. Full maths in
[`docs/STUDENTHUB_INTEGRATION.md` §5.5](docs/STUDENTHUB_INTEGRATION.md).

**StudentHub can always be down.** Outbound writes go through
`services/outbox.js` — immediate attempt, then exponential backoff
(5s → 1h, 6 attempts), swept every 60s. A user signup is never blocked on it.

---

## Connecting the frontend

The React app talks to this API through `src/lib/api.js`:

```bash
# Leenk/.env
VITE_USE_API=true
VITE_API_BASE=/api
```

Vite proxies `/api` → `http://127.0.0.1:5100` in dev. With `VITE_USE_API=false`
(the default) the UI keeps running on mock data.
