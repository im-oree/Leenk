# Leenk ⇄ StudentHub Integration Specification

**Version:** 1.0
**Date:** 2026-09-05
**From:** Leenk team
**To:** StudentHub backend devs
**Status:** Requesting implementation of the endpoints and collections marked **`[NEW — PLEASE BUILD]`**

---

## 0. TL;DR — what we need from you

| # | Item | Type | Section |
|---|---|---|---|
| 1 | OAuth client registration for `leenk-dev` / `leenk-prod` | Config | §2 |
| 2 | `GET /api/shared-data/leenk-profile` | **NEW endpoint** | §3.1 |
| 3 | `POST /api/auth/provision-from-child-app` | **NEW endpoint** | §3.2 |
| 4 | `POST /api/shared-data/child-app-write` | **NEW endpoint** | §3.3 |
| 5 | `GET /api/users/exists` | **NEW endpoint** | §3.4 |
| 6 | `POST /api/integrations/leenk/ban-signal` | **NEW endpoint** | §3.5 |
| 7 | `campusPlaces` collection + `GET /api/campus/:campusId/places` | **NEW collection + endpoint** | §5.2 |
| 8 | `POST /api/locations/resolve-place` | **NEW endpoint** | §5.3 |
| 9 | `GET /api/campus/:campusId/config` | **NEW endpoint** | §5.4 |
| 10 | Extra fields on `users/{uid}` (`linkedApps.leenk`, `campusId`) | **Schema change** | §4.1 |
| 11 | `childAppLinks` collection | **NEW collection** | §4.2 |
| 12 | `campusConfig` collection | **NEW collection** | §5.4 |

Everything else Leenk uses already exists in your codebase (`/oauth/*`, `/api/auth/firebase-to-jwt`, `/api/shared-data/*`, `/api/users/umis/academic`).

---

## 1. Architecture

Leenk is a **child app** of StudentHub with its **own Firebase project**.

```
┌────────────────────────┐         OIDC + REST         ┌────────────────────────┐
│   LEENK                │ ──────────────────────────► │   STUDENTHUB           │
│   own Firebase project │ ◄────────────────────────── │   existing Firebase    │
│                        │                             │                        │
│  OWNS:                 │                             │  OWNS:                 │
│   swipes, matches      │                             │   identity (uid)       │
│   messages, posts      │                             │   academic records     │
│   trust score          │                             │   matric / UMIS        │
│   verification records │                             │   campus registry      │
│   device fingerprints  │                             │   campus places/geo    │
│   dating preferences   │                             │   wallet / points      │
│                        │                             │   ID card verification │
│  MIRRORS (read-only):  │                             │                        │
│   studentHubUid  ◄─────┼─── foreign key ─────────────┤                        │
│   name, photo, dept    │                             │                        │
│   level, matric        │                             │                        │
└────────────────────────┘                             └────────────────────────┘
```

### 1.1 Ownership rules (non-negotiable both ways)

| Data | Source of truth | Notes |
|---|---|---|
| User identity, `uid` | **StudentHub** | Leenk stores it as `studentHubUid` foreign key |
| Name, photo, department, level, course, matric | **StudentHub** | Leenk mirrors; StudentHub wins on conflict |
| ID-card verification, UMIS enrolment | **StudentHub** | Feeds Leenk's trust score |
| Campus registry, campus places, geofences | **StudentHub** | Leenk caches with TTL |
| Swipes, matches, messages | **Leenk only** | **Never** sent to StudentHub |
| Dating intent, prompts, dating photos | **Leenk only** | **Never** sent to StudentHub |
| Trust score, device fingerprints | **Leenk only** | Leenk may send a *ban signal*, never the raw score |
| Wallet, points, HubScore | **StudentHub** | Leenk reads only if the user grants scope |

> **Privacy commitment we are making to students and need you to honour:**
> nothing about who a student swipes, matches, or messages ever leaves Leenk's
> Firebase project. If StudentHub ever needs "is this user active on Leenk", the
> answer is a boolean, never a list.

### 1.2 Why Leenk keeps its own Firebase project

1. **Blast radius** — a dating dataset has a different risk profile to a campus utility app. Separate project = separate IAM, separate breach surface.
2. **Rules complexity** — Leenk's Firestore rules are dominated by match/block/verification checks that would bloat your existing `firestore.rules`.
3. **Write volume** — swipes are high-frequency (25–100 writes/user/day). We don't want that in your quota.
4. **Deletion** — "delete my Leenk account" must not delete the StudentHub account, and vice versa. Separate projects make that trivially correct.

StudentHub remains the **identity anchor**: every Leenk user row carries `studentHubUid`, and that is the join key for everything.

---

## 2. OAuth client registration

Please register two clients in your in-code registry (alongside `bu-scheduler-dev` / `bu-scheduler-prod`):

```js
'leenk-dev': {
  client_id: 'leenk-dev',
  client_secret: process.env.LEENK_OAUTH_SECRET_DEV,
  redirect_uris: [
    'leenk://auth/callback',
    'http://localhost:5173/auth/callback',
    'http://localhost:5100/auth/callback',
  ],
  scopes: ['openid', 'profile', 'email', 'campus', 'academic'],
  grant_types: ['authorization_code', 'refresh_token'],
  pkce_required: true,
},
'leenk-prod': {
  client_id: 'leenk-prod',
  client_secret: process.env.LEENK_OAUTH_SECRET_PROD,
  redirect_uris: ['leenk://auth/callback', 'https://app.leenk.ng/auth/callback'],
  scopes: ['openid', 'profile', 'email', 'campus', 'academic'],
  grant_types: ['authorization_code', 'refresh_token'],
  pkce_required: true,
}
```

**Two new scopes requested:**

| Scope | Grants | Why Leenk needs it |
|---|---|---|
| `campus` | `campusId`, campus places, campus config | Scope discovery to home/nearby campuses |
| `academic` | `department`, `level`, `course`, `matricNumber`, `idCardVerified` | Profile prefill + institutional trust signal |

`campus` and `academic` must be **separately consentable** on your authorize screen. A student who declines `academic` should still be able to sign in — they'll just verify manually inside Leenk.

---

## 3. Endpoints we need you to build

### 3.1 `GET /api/shared-data/leenk-profile` **`[NEW — PLEASE BUILD]`**

One call that returns everything Leenk needs to prefill a profile. Saves us 3–4 round trips on a cold sign-in.

**Auth:** `Authorization: Bearer <StudentHub app JWT>`
**Query:** `?appId=leenk`

**Response `200`:**
```jsonc
{
  "success": true,
  "profile": {
    "uid": "firebase-uid",
    "displayName": "Ayomide Bakare",
    "fullName": "Ayomide David Bakare",
    "email": "ayomide.bakare@student.babcock.edu.ng",
    "emailVerified": true,
    "photoURL": "https://.../avatar.jpg",
    "phone": "+2348011111111",
    "phoneVerified": true,

    "campusId": "babcock",
    "campusName": "Babcock University",
    "department": "Software Engineering",
    "course": "Software Engineering",
    "courseCode": "SEN",
    "level": "300",
    "matricNumber": "21/1234",

    "idCardVerified": true,
    "idCardVerificationStatus": "verified",
    "idCardVerifiedAt": 1767225600000,
    "umisLinked": true,

    "isBanned": false,
    "banReason": null,
    "accountCreatedAt": 1735689600000,
    "lastLoginAt": 1788619329000
  },
  "grants": ["profile", "email", "campus", "academic"],
  "generatedAt": "2026-09-05T14:42:09.784Z"
}
```

**Errors:**
- `403 { "error": "App not authorized", "code": "APP_NOT_AUTHORIZED" }`
- `403 { "error": "Scope not granted", "code": "SCOPE_MISSING", "missing": ["academic"] }` — return the profile with those fields **omitted** rather than failing, if at all possible.
- `404 { "error": "User not found" }`

**Notes for you:**
- If a field is missing in your DB, return `null` — don't omit the key. Our mapper handles nulls; missing keys make debugging harder.
- `level` as a **string** please (`"300"`, not `300`) — you currently store both.
- We tolerate your field aliases (`matricNo`/`matricNumber`, `photoURL`/`avatarUrl`), but a single canonical name here would be ideal.

---

### 3.2 `POST /api/auth/provision-from-child-app` **`[NEW — PLEASE BUILD]`**

**This is the important one.** When a student signs up *inside Leenk* (no StudentHub account yet), we push them to you so **StudentHub gains the user**.

**Auth:** `X-LEENK-KEY: <shared secret>` (header) — server-to-server only, never from a client.

**Request:**
```jsonc
{
  "appId": "leenk",
  "leenkUid": "lk_mtohrnl7j3vwoy",
  "phone": "+2348011111111",
  "email": "ayo@student.babcock.edu.ng",
  "campusId": "babcock",
  "profile": {
    "displayName": "Ayo",
    "photoURL": "https://leenk-cdn/.../1.jpg",
    "department": "Software Engineering",
    "course": "Software Engineering",
    "level": "300"
  },
  "idempotencyKey": "provision:lk_mtohrnl7j3vwoy"
}
```

**Behaviour we need:**

1. **Match first, create second.** Look for an existing StudentHub user by, in order:
   `phone` → `email` → (`matricNumber` if supplied).
2. If **found** → link, don't duplicate. Return `matched: true` and the existing `uid`.
3. If **not found** → create a new `users/{uid}` doc with the supplied fields, `identityProvider: "leenk"`, and `emailVerified: false`.
4. **Idempotent** on `idempotencyKey` — we retry with backoff, so a repeat call must return the same `uid`, not create a second account.
5. Write a `childAppLinks` record (§4.2).
6. **Never** overwrite an existing non-empty StudentHub field with a Leenk value. Only fill blanks.

**Response `200` / `201`:**
```jsonc
{
  "success": true,
  "matched": false,
  "created": true,
  "uid": "firebase-uid-generated",
  "studenthubId": "sh_ab12cd34",
  "customToken": "<firebase custom token, optional>",
  "fieldsWritten": ["displayName", "photoURL", "department", "level", "campusId"],
  "fieldsSkipped": ["email"],
  "reason": null
}
```

**Errors:**
- `403 { "error": "Invalid app key" }`
- `409 { "error": "Phone belongs to a banned account", "code": "UPSTREAM_BANNED" }` — we must know this so we can block the signup.
- `422 { "error": "campusId not recognised", "code": "UNKNOWN_CAMPUS" }`

**Failure handling on our side:** if you're down, the signup still succeeds in Leenk. The job sits in our `studentHubOutbox` collection and retries with exponential backoff (5s → 1h, 6 attempts). So please make this idempotent — you *will* see duplicates otherwise.

---

### 3.3 `POST /api/shared-data/child-app-write` **`[NEW — PLEASE BUILD]`**

Ongoing profile sync. When a student edits their name/photo/department in Leenk, we mirror it to you.

**Auth:** `X-LEENK-KEY` header.

**Request:**
```jsonc
{
  "appId": "leenk",
  "uid": "studenthub-firebase-uid",
  "dataType": "profile",
  "patch": {
    "displayName": "Ayo",
    "photoURL": "https://.../new.jpg",
    "department": "Software Engineering",
    "level": "400"
  },
  "origin": "leenk.profile.edit",
  "at": 1788619329835
}
```

**Whitelist — please reject anything not in this set:**
`displayName`, `photoURL`, `department`, `course`, `level`, `bio`, `phone`

**Response `200`:**
```jsonc
{
  "success": true,
  "uid": "...",
  "applied": ["displayName", "photoURL"],
  "rejected": [{ "field": "level", "reason": "UMIS_AUTHORITATIVE" }],
  "at": 1788619329900
}
```

> If a field is authoritative on your side (e.g. `level` comes from UMIS), **reject it and tell us why**. We'll surface "managed by StudentHub" in the Leenk UI rather than silently losing the edit.

Please also log these to `data_access_logs` with `action: "write"` so there's an audit trail.

---

### 3.4 `GET /api/users/exists` **`[NEW — PLEASE BUILD]`**

Pre-signup check so we can offer **"You already have a StudentHub account — sign in instead"** rather than creating a duplicate.

**Auth:** `X-LEENK-KEY`. **Rate limit: 10/min per IP** — this is an enumeration surface.

**Query:** `?phone=%2B2348011111111` or `?email=...`

**Response `200`:**
```jsonc
{ "success": true, "exists": true, "hasLeenkLink": false, "campusId": "babcock", "maskedName": "A**** B****" }
```

Return **`maskedName` only** — never the full name, email or photo. This endpoint must not let someone enumerate your user base.

---

### 3.5 `POST /api/integrations/leenk/ban-signal` **`[NEW — PLEASE BUILD]`**

When Leenk bans someone for a **safety** reason (harassment, impersonation, fake student, underage), you probably want to know.

**Auth:** `X-LEENK-KEY`.

```jsonc
{
  "appId": "leenk",
  "studentHubUid": "firebase-uid",
  "severity": "high",
  "category": "impersonation",
  "reasonCode": "FAKE_STUDENT_CONFIRMED",
  "evidenceRef": "leenk://moderation/ban/abc123",
  "at": 1788619329835
}
```

**We deliberately do NOT send:** the trust score, the device fingerprint, the reporter's identity, or any chat content. Just the fact and the category.

**Response:** `{ "success": true, "acknowledged": true, "actionTaken": "flagged_for_review" }`

Your call whether that triggers anything on your side. We'd suggest *flag for review*, not auto-ban — false positives happen and a student losing their timetable app over a dating-app dispute would be bad.

---

## 4. Schema changes on StudentHub

### 4.1 `users/{uid}` — additive fields **`[SCHEMA CHANGE]`**

All additive, all optional, nothing removed:

```jsonc
{
  // ... your existing fields unchanged ...

  // NEW — canonical campus id (you currently infer campus from email domain)
  "campusId": "babcock",

  // NEW — which child apps this identity is linked to
  "linkedApps": {
    "leenk": {
      "linked": true,
      "leenkUid": "lk_mtohrnl7j3vwoy",
      "linkedAt": 1788619329835,
      "provisionedBy": "leenk",        // "leenk" | "studenthub"
      "lastSyncAt": 1788619329835,
      "scopes": ["profile", "email", "campus", "academic"]
    }
  },

  // NEW — safety signals from child apps (see §3.5)
  "childAppFlags": [
    { "appId": "leenk", "category": "impersonation", "severity": "high", "at": 1788619329835 }
  ]
}
```

**Index requested:**
`users` — `linkedApps.leenk.linked ASC`, `campusId ASC`, `__name__ ASC`
(so we can ask "how many Leenk-linked students at Babcock" for the density metric in PRD §1.2.)

---

### 4.2 `childAppLinks/{appId}_{studentHubUid}` **`[NEW COLLECTION]`**

Audit trail of the federation, independent of the user doc.

```jsonc
{
  "id": "leenk_firebaseUid123",
  "appId": "leenk",
  "studentHubUid": "firebaseUid123",
  "childUid": "lk_mtohrnl7j3vwoy",
  "provisionedBy": "leenk",
  "createdAt": "<Timestamp>",
  "createdAtMs": 1788619329835,
  "lastSyncAt": 1788619329835,
  "syncCount": 12,
  "scopes": ["profile", "email", "campus", "academic"],
  "status": "active",           // active | revoked | suspended
  "revokedAt": null
}
```

**Why separate from `users`:** when a student revokes Leenk access we set `status: "revoked"` here and keep the history, without mutating the user doc. Also makes "how many students use Leenk" a single cheap query.

---

## 5. Campus & location — the part we most need from you

Babcock is our flagship campus and StudentHub **already has** live location infrastructure (`user_locations`, `location_history`, `campusPlaceId`, the cafeteria notifier). We want to reuse it rather than rebuild it badly.

### 5.1 What we're trying to achieve

| Leenk feature | Location need | Precision required |
|---|---|---|
| "On your campus" badge | Is this user inside the campus polygon? | Campus-level (±500 m) |
| Distance on a swipe card | Fuzzy bucket only | 400 m / 2 km / 5 km / 15 km / 40 km |
| "Nearby campuses" scope | Distance between two campus centroids | Campus-level |
| Explore by campus | Static campus registry | None (registry lookup) |
| *(Phase 2)* "12 people at the Café now" | Aggregate count at a named place | Place-level, **k-anonymised** |

**We never need, never store, and never display a precise user coordinate.** See §5.5.

---

### 5.2 `campusPlaces` collection + `GET /api/campus/:campusId/places` **`[NEW — PLEASE BUILD]`**

You already write `campusPlaceId` / `campusPlaceName` onto `user_locations` — but the registry those come from isn't exposed. Please formalise it.

**Collection `campusPlaces/{placeId}`:**
```jsonc
{
  "placeId": "babcock_cafeteria_main",
  "campusId": "babcock",
  "name": "Main Cafeteria",
  "category": "cafeteria",     // cafeteria | library | hostel | lecture | chapel | sports | admin | gate | other
  "centroid": { "lat": 6.89012, "lng": 3.71813 },
  "radiusM": 60,                // circular geofence
  "polygon": [                  // optional, wins over radius when present
    { "lat": 6.8903, "lng": 3.7179 },
    { "lat": 6.8903, "lng": 3.7184 },
    { "lat": 6.8899, "lng": 3.7184 },
    { "lat": 6.8899, "lng": 3.7179 }
  ],
  "geohash": "s1z8k3m2p",
  "isPublic": true,             // false for hostels — see below
  "leenkVisible": true,         // false = never surface in Leenk
  "openHours": { "mon": [["07:00","21:00"]], "sun": [] },
  "updatedAt": "<Timestamp>"
}
```

> **Please set `isPublic: false` and `leenkVisible: false` on every hostel and
> residence.** PRD §1.9 forbids exposing where a student lives. We filter on our
> side too, but defence in depth.

**`GET /api/campus/:campusId/places`** → `{ "success": true, "campusId": "babcock", "places": [ ...above... ], "updatedAt": "..." }`

Add `?category=cafeteria` and `?leenkVisible=true` filters. We cache the response for **6 hours**; an `ETag`/`Last-Modified` header would let us revalidate cheaply.

---

### 5.3 `POST /api/locations/resolve-place` **`[NEW — PLEASE BUILD]`**

Point-in-geofence resolution. You have the polygon data; we don't want to ship it to the client or duplicate it.

**Request:**
```jsonc
{ "latitude": 6.89012, "longitude": 3.71813, "campusId": "babcock", "accuracy": 12 }
```

**Response `200`:**
```jsonc
{
  "success": true,
  "onCampus": true,
  "campusId": "babcock",
  "distanceFromCampusCentroidM": 210,
  "place": {
    "placeId": "babcock_cafeteria_main",
    "name": "Main Cafeteria",
    "category": "cafeteria",
    "confidence": 0.94
  },
  "resolvedAt": 1788619329835
}
```

**Rules:**
- If the fix falls inside a place with `isPublic: false`, return `"place": null` **and** `"onCampus": true`. Never tell us it's a hostel.
- If `accuracy > radiusM * 2`, return `place: null` with `"reason": "ACCURACY_EXCEEDS_GEOFENCE"` — a 100 m-accurate fix can't resolve a 60 m café.
- Must respond in **< 150 ms p95**. We call this on accepted pings only (see rate maths below), so volume is modest, but it's in a user-facing path.

**Confidence formula we'd suggest** (so both sides agree on the number):

```
confidence = clamp(0, 1,  1 − (d / r)  −  (accuracy / (4r)) )

  d        = distance from fix to place centroid, metres
  r        = place radiusM
  accuracy = reported GPS accuracy, metres
```

So a dead-centre fix with 10 m accuracy on a 60 m place → `1 − 0 − 0.042 ≈ 0.96`.
A fix on the boundary with 40 m accuracy → `1 − 1 − 0.167 < 0` → clamped to 0, i.e. rejected.

---

### 5.4 `campusConfig` collection + `GET /api/campus/:campusId/config` **`[NEW — PLEASE BUILD]`**

PRD §2.3.3 requires per-campus configuration from day one, even if Phase 1 only reads a few fields.

**Collection `campusConfig/{campusId}`:**
```jsonc
{
  "campusId": "babcock",
  "name": "Babcock University",
  "shortName": "Babcock",
  "city": "Ilishan-Remo",
  "state": "Ogun",
  "country": "NG",
  "centroid": { "lat": 6.8901, "lng": 3.7181 },
  "radiusKm": 3.5,
  "geohash": "s1z8k3m",
  "timezone": "Africa/Lagos",

  "verification": {
    "methods": ["umis", "email", "id_card"],   // in priority order
    "emailDomains": ["student.babcock.edu.ng", "babcock.edu.ng"],
    "registrarApi": "umis",
    "requiresManualReview": false
  },

  "academicCalendar": {
    "currentTerm": "2026/2027-1",
    "termStartMs": 1788000000000,
    "termEndMs": 1798000000000
  },

  "nearbyCampusIds": ["unilag", "covenant"],
  "studentCount": 12400,
  "leenkEnabled": true,
  "updatedAt": "<Timestamp>"
}
```

`academicCalendar.termEndMs` is what drives our **re-verification prompt** (PRD §1.8.4) — we schedule the next check for term rollover rather than an arbitrary 120 days. `verification.methods` drives which options we show on the Leenk verification screen, so we stop offering "school email" at schools that don't issue one.

---

### 5.5 Location: rate limiting, anti-spam and the maths

This is our side of the contract — documented so you can sanity-check it and so the numbers match if you ever proxy our pings.

#### 5.5.1 The three-gate write policy

A ping is **accepted by the API (HTTP 200) but only written to Firestore if it passes all gates.** The client is never told which gate it failed — that makes probing the limits much harder.

| Gate | Rule | Default | Rationale |
|---|---|---|---|
| **Accuracy floor** | drop if `accuracy > 250 m` | `LOC_MAX_ACCURACY_M=250` | A 250 m-accurate fix can't resolve anything useful; it's noise that costs a write. |
| **Time interval** | drop if `Δt < 60 s` | `LOC_MIN_INTERVAL_MS=60000` | Caps a pathological client at 60 writes/hr before the other gates. |
| **Movement** | drop if `Δd < 75 m` | `LOC_MIN_DISTANCE_M=75` | A stationary student in a lecture produces **zero** writes for 2 hours. This is the single biggest cost saver. |
| **Plausibility** | drop + flag if implied speed `> 55 m/s` | `LOC_MAX_SPEED_MPS=55` | 55 m/s ≈ 198 km/h. Faster than any Lagos road vehicle → GPS spoof or VPN relocation. |
| **Hourly cap** | hard stop at 90 writes/hr/user | `LOC_MAX_PER_HOUR=90` | Backstop if the above are somehow bypassed. |
| **Transport limit** | 20 requests/min/uid (HTTP 429) | — | Stops flooding before it reaches business logic. |

#### 5.5.2 Write-volume maths

Worst case per user per day, if all gates are bypassed:
```
60 s interval → 60 writes/hr → 1,440 writes/day/user
```
Realistic case, with the movement gate applied to a typical student day:

| Activity | Duration | Writes |
|---|---|---|
| Asleep / in hostel | 9 h | 0 (no movement) |
| In lectures (stationary blocks) | 5 h | ~8 (transitions between halls) |
| Walking around campus | 3 h | ~40 (75 m granularity) |
| Café / library / stationary | 5 h | ~6 |
| Off-campus trip | 2 h | ~25 |
| **Total** | 24 h | **≈ 80 writes/user/day** |

At **500 verified users per flagship campus** (PRD §1.2 density target):
```
500 users × 80 writes/day        = 40,000 writes/day
                                 ≈ 1.2 M writes/month
3 flagship campuses              ≈ 3.6 M writes/month
```
That sits inside a Blaze-plan Firestore budget comfortably (~$3.60/month at $1/100k writes for the location collection alone). Without the movement gate the same population would produce **21.6 M writes/month** — a 6× cost difference, which is why the gate exists.

Reads are cheaper still: `userLocations` is keyed by uid, and distance is computed from two point-reads, both of which we cache in-process for 60 s.

#### 5.5.3 Storage & precision

We store **only a grid-snapped coordinate**, never the raw fix:

```
latStep = precisionM / 111_320
lngStep = precisionM / (111_320 × cos(latitude))

snapped.lat = round(lat / latStep) × latStep
snapped.lng = round(lng / lngStep) × lngStep
```

At `precisionM = 250` and Lagos latitude (≈6.5°N, `cos ≈ 0.9936`):
- latitude cell ≈ **250 m**
- longitude cell ≈ **251.6 m**

So the stored point identifies a ~250 m square — enough to say "on campus" or "2 km away", useless for finding a person. The raw coordinate exists only in process memory for the duration of the request (to compute movement delta and call `resolve-place`), and is never persisted or logged.

A **7-character geohash** (~153 m × 153 m) is stored alongside for range queries.

#### 5.5.4 Distance exposure

The client never receives metres. `distanceMeters()` output is bucketed:

| Range | Label returned |
|---|---|
| < 400 m | "On your campus" |
| < 2 km | "Walking distance" |
| < 5 km | "Under 5 km" |
| < 15 km | "Under 15 km" |
| < 40 km | "Same city" |
| ≥ 40 km | "Further away" |

Buckets defeat trilateration: an attacker who moves around and re-reads a target's distance learns only which annulus they're in, and the 250 m storage grid adds quantisation noise on top.

#### 5.5.5 k-anonymity on aggregates

Any "how many people are here" count returns **0 if the true count is 1 or 2**, with `suppressed: true`. Presence entries expire after **5 minutes** (`LOC_PRESENCE_TTL_MS`). Without this, "1 person at the Library" plus a photo is a deanonymisation.

#### 5.5.6 Spoofing detection

```
speed = haversine(prev, next) / (next.at − prev.at)
```
- `speed > 55 m/s` → reject the fix, emit a trust signal, do not update `prev` (so a spoofer can't walk the chain forward).
- `next.at <= prev.at` → reject as `NON_MONOTONIC_TIME` (replay attempt).
- Repeated violations feed the trust score and, past a threshold, route the account to manual review.

**What we'd like from you:** if StudentHub already has a device-level location trust signal for Babcock (you're clearly doing background sync), exposing it as a boolean on `resolve-place` — e.g. `"deviceLocationTrusted": true` — would let us cross-check. Not a blocker.

---

## 6. The two sign-in paths

### 6.1 Path A — "Sign in with StudentHub" (pull)

```
Leenk app                    Leenk backend                StudentHub
    │                              │                           │
    │─ tap "Sign in with           │                           │
    │   StudentHub" ───────────────┼──────────────────────────►│ GET /oauth/authorize
    │                              │                           │  (PKCE S256, scope=
    │                              │                           │   openid profile email
    │                              │                           │   campus academic)
    │◄─────────────────────────────┼───── redirect w/ code ────│
    │                              │                           │
    │─ POST /api/auth/studenthub/  │                           │
    │   callback {code, verifier} ─►│                          │
    │                              │─ POST /oauth/token ──────►│
    │                              │◄─ access + id + refresh ──│
    │                              │─ GET /oauth/userinfo ────►│
    │                              │─ GET /api/shared-data/    │
    │                              │      leenk-profile ──────►│  ★ §3.1
    │                              │◄─ full profile bundle ────│
    │                              │                           │
    │                              │ • find-or-create Leenk row
    │                              │   keyed by studentHubUid
    │                              │ • merge: StudentHub wins on
    │                              │   identity/academic fields
    │                              │ • idCardVerified → +25 trust
    │                              │ • store refresh token
    │◄─ Leenk JWT + prefilled ─────│                           │
    │   profile + needsOnboarding  │                           │
```

**What we import:** name, full name, email, photo, department, course, level, matric, `idCardVerified`, campus, account age.
**What the student still does in Leenk:** dating photos, prompts, intent, theme, and — if `idCardVerified` was false — our own verification flow.

A student arriving with `idCardVerified: true` from StudentHub starts at **trust score 75+** and skips straight to the liveness selfie. That's the single biggest conversion win in this integration.

### 6.2 Path B — sign up in Leenk (push)

```
    │─ complete Leenk onboarding ──►│
    │                               │ • create Leenk user
    │                               │ • age-gate 18+, dedupe phone
    │◄─ JWT (immediate, never ──────│
    │   blocked on StudentHub)      │
    │                               │
    │                               │  [async, outbox + retry]
    │                               │─ POST /api/auth/provision-
    │                               │   from-child-app ────────►│  ★ §3.2
    │                               │◄─ uid (matched or created)│
    │                               │ • store studentHubUid
```

**Critical:** the student is never made to wait on StudentHub. If you're down, the job retries for up to ~2 hours across 6 attempts and then lands in a dead-letter queue we monitor.

---

## 7. Failure modes & our handling

| Scenario | Leenk behaviour |
|---|---|
| StudentHub unreachable during sign-in | Show "StudentHub is unavailable — sign up with your phone instead". Path B still works. |
| StudentHub unreachable during signup push | Signup succeeds. Job → `studentHubOutbox`, retries 5s→1h ×6. |
| `provision-from-child-app` returns 409 banned | Block the Leenk signup, show an appeal route. |
| `leenk-profile` missing `academic` scope | Import what we got; user completes verification manually. |
| StudentHub says `isBanned: true` on sign-in | Refuse sign-in, `UPSTREAM_BANNED`, point to StudentHub appeals. |
| `resolve-place` times out (>150 ms) | Ping is still stored; `placeId` stays null. Purely cosmetic degradation. |
| Duplicate provision calls | Your idempotency on `idempotencyKey` must return the same uid. |
| Student revokes Leenk in StudentHub settings | We stop syncing, keep the Leenk account, mark link `revoked`. |

---

## 8. Security requirements

1. **`X-LEENK-KEY`** — min 32 bytes of entropy, rotated quarterly, distinct per environment. Compare in constant time.
2. **Never accept `X-LEENK-KEY` from a browser origin.** Server-to-server only; reject if `Origin` or `Referer` is present.
3. **PKCE required** on the OAuth clients — no implicit flow, no secret in the mobile app.
4. **Rate limit `/api/users/exists` hard** (10/min/IP) — it's an enumeration surface.
5. **Log every child-app write** to `data_access_logs` with `appId`, `uid`, `action`, `fields`, `ip`.
6. **Scope enforcement server-side** — don't trust `appId` in the body alone; bind it to the authenticated key/JWT.
7. Leenk will **never** send you: chat content, swipe history, match lists, trust scores, device fingerprints, or the reporter identity behind a ban signal.

---

## 9. Environment variables

**StudentHub side (please add):**
```bash
LEENK_OAUTH_SECRET_DEV=<32+ bytes>
LEENK_OAUTH_SECRET_PROD=<32+ bytes>
LEENK_APP_KEY=<32+ bytes>          # the X-LEENK-KEY value
LEENK_INTEGRATION_ENABLED=true
```

**Leenk side (already wired, see `backend/.env.example`):**
```bash
STUDENTHUB_ENABLED=true
STUDENTHUB_BASE_URL=https://api.studenthub.ng
STUDENTHUB_OAUTH_CLIENT_ID=leenk-prod
STUDENTHUB_OAUTH_CLIENT_SECRET=...
STUDENTHUB_WRITE_KEY=...
STUDENTHUB_REDIRECT_URI=leenk://auth/callback
```

---

## 10. Suggested build order

| Phase | Items | Unblocks |
|---|---|---|
| **1** | §2 OAuth clients · §3.1 `leenk-profile` | "Sign in with StudentHub" end-to-end |
| **2** | §3.2 provision · §4.1 `linkedApps` · §4.2 `childAppLinks` | Leenk signups flowing into StudentHub |
| **3** | §5.4 `campusConfig` · §5.2 `campusPlaces` | Per-campus verification config, Explore |
| **4** | §5.3 `resolve-place` · §3.3 `child-app-write` | Campus presence, ongoing profile sync |
| **5** | §3.4 `users/exists` · §3.5 ban-signal | Signup dedupe, cross-app safety |

Phases 1–2 are the minimum for launch. Phases 3–5 can land during the soft-launch window.

---

## 11. Contract test checklist

Please confirm each returns the documented shape:

- [ ] `GET /api/shared-data/leenk-profile` — full bundle, nulls not omissions
- [ ] `GET /api/shared-data/leenk-profile` — partial scope degrades, doesn't 500
- [ ] `POST /api/auth/provision-from-child-app` — creates when new
- [ ] `POST /api/auth/provision-from-child-app` — **matches** on existing phone, no duplicate
- [ ] `POST /api/auth/provision-from-child-app` — same `idempotencyKey` twice → same uid
- [ ] `POST /api/auth/provision-from-child-app` — banned phone → 409
- [ ] `POST /api/shared-data/child-app-write` — whitelist enforced, rejections explained
- [ ] `GET /api/users/exists` — masked name only, rate limited
- [ ] `GET /api/campus/:id/places` — hostels excluded when `leenkVisible=true`
- [ ] `POST /api/locations/resolve-place` — private place → `place: null`, `onCampus: true`
- [ ] `POST /api/locations/resolve-place` — low accuracy → `ACCURACY_EXCEEDS_GEOFENCE`
- [ ] `GET /api/campus/:id/config` — `verification.methods` and `academicCalendar` populated
- [ ] All `X-LEENK-KEY` endpoints reject a missing/wrong key with 403

---

## 12. Open questions for you

1. **Campus id vocabulary** — we're using slugs (`babcock`, `unilag`). Do you have canonical ids already? We'll adopt yours.
2. **`level` type** — you store both `"300"` and `300`. Can we standardise on string?
3. **Does UMIS expose deregistration/graduation?** If we can detect a student has left, we can restrict the account immediately instead of waiting for term-end re-verification (PRD §1.8.4).
4. **Photo hosting** — should Leenk profile photos live in your Storage bucket or ours? We're assuming ours, with `photoURL` pointing at our CDN.
5. **Existing-user migration** — you have a real user base. Would you support a one-time "invite your StudentHub users to Leenk" push? That's our fastest route to the 500-user campus density target.
6. **Rate limits** — what request/min ceiling should we design against on the new endpoints?

---

*Questions → Leenk team. This document is versioned in the Leenk repo at `backend/docs/STUDENTHUB_INTEGRATION.md`.*

---

# ADDENDUM — verified against a live sibling app (BU-Scheduler)

Everything above was written from the product spec. This section is what the
**existing, deployed StudentHub child app** (`im-oree/BU-Scheduler`) actually
does. Where the two disagree, **this section wins** — it is observed, not
proposed.

## 1. There are two integration surfaces, not one

BU-Scheduler uses **both**, for different things:

| Surface | Used for | Notes |
|---|---|---|
| **REST + OIDC** (`/oauth/*`, `/api/auth/*`, `/api/shared-data/*`) | sign-in, identity, permissioned reads | The documented multi-app contract |
| **Firestore SDK, direct** | groups, timetables, chats, profiles | Reads `users`, `courseGroups`, `groupTimetables`, `groupChats`, `notifications` straight from the shared project |

The direct-Firestore path matters for Leenk: `firestore.rules` has
`match /users/{userId} { allow read: if isAuthenticated(); }` — **any signed-in
StudentHub user can read any user document.** If Leenk ever shares that
project, Leenk profile data would inherit the same rule. This is the single
strongest argument for Leenk keeping its **own** Firebase project, which is
what we already do.

## 2. Confirmed endpoints

```
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/firebase-to-jwt
POST /api/auth/authorize-app
GET  /api/auth/authorized-apps
POST /api/auth/revoke-app
GET  /api/auth/verify
GET  /api/auth/user-profile          <- session validation (Bearer)
POST /api/auth/logout                <- revokes the JWT by jti
GET  /api/auth/audit-log
GET  /api/shared-data/:dataType
POST /api/shared-data/snapshot
GET  /api/shared-data/audit-log
POST /api/shared-data/share-token
GET  /api/shared-data/access/:token
GET  /api/shared-data/permissions
POST /api/shared-data/permissions/grant
POST /api/shared-data/permissions/revoke
```

**`:dataType` is an enum:** `profile | events | schedule | transactions |
notifications | wallet`.

> **Correction to our federation client.** We were calling
> `/api/shared-data/posts`. **That type does not exist.** The call would have
> 404'd on every request and — because the circuit breaker degrades silently —
> the Leenk feed would simply never have shown StudentHub content, with no
> error surfaced. Now configurable via `federation.sharedDataType`
> (default `announcements`).

## 3. Identity resolution — answers our open Google question

BU-Scheduler's documented order when exchanging a StudentHub auth code:

```
1. studenthubId supplied?  -> look up studenthubIdMap -> reuse that user
2. else match on email     -> link studenthubId to the existing account
3. else                    -> create the account, then link
```

So **email is the fallback join key**, and `studenthubId` is canonical once
known. This is exactly the mechanism Leenk should copy for "Sign in with
Google": a student who used Google on StudentHub is matched by verified email
and then permanently pinned by `studenthubId`. Leenk does **not** need to share
StudentHub's Firebase project to achieve single-identity.

Their `UserRecord` carries:

```ts
studenthubId?: string
identityProvider?: 'local' | 'studenthub'
linkedAt?: string
authVersion: number
```

We should mirror `studenthubId`, `identityProvider` and `linkedAt` on the Leenk
user document. `authVersion` is worth copying too — it makes a future migration
non-breaking.

## 4. OAuth specifics observed

- PKCE: `codeVerifier` 48 bytes, base64url, SHA-256 challenge
- `state` and `nonce`: 24 random bytes each, base64url
- Pending request is held in **sessionStorage**, keyed by `state`
- Scopes used: `openid profile email timetable groups notifications`
- Discovery is published at `/.well-known/openid-configuration`
- Redirect URI is `${origin}/auth/callback`
- JWTs carry `jti` + `iat`, and logout works by **revoking the jti**

Leenk should keep its own scope list (`openid profile email` plus whatever the
dating profile genuinely needs) — requesting `timetable` or `wallet` for a
dating app would be unjustified data collection.

## 5. Profile field names are inconsistent upstream

Their mapper accepts several spellings for the same field:

```
name  <- fullName | displayName | nickname
phone <- phoneNumber | phone
level <- level | studyLevel
bio   <- bio | aiSharedContext | preferences.bio
```

Our `profileMapper.js` must tolerate the same variants rather than assuming one.

## 6. Worth adopting

- **`GET /api/auth/audit-log` per user.** They log `account_created`,
  `account_linked`, `studenthub_login`, `local_login`, `logout`,
  `app_authorized`, `app_revoked`. Leenk has admin audit but no *user-visible*
  auth history; for a dating app, "where has my account been signed in" is a
  genuine safety feature.
- **Token revocation by `jti`.** Our JWTs are currently valid until expiry,
  so "sign out everywhere" is not actually enforceable. Theirs is.
- **`authorizedApps` + granular permission grant/revoke.** If a student can see
  and revoke Leenk's access to their StudentHub data, that is both good privacy
  practice and likely required for consent.
- **IndexedDB offline cache** (`src/lib/offlineCache.ts`) — a clean
  `withCachedValue(key, loader)` envelope with `updatedAt`. Better than our
  in-memory-only caching for a PWA on a patchy campus network.

## 7. Deployment shape (matches ours)

Frontend on Vercel, backend on Render, `CORS_ORIGIN` on the backend set to the
Vercel domain, `VITE_API_BASE_URL` pointing at the Render URL **with `/api`
appended**. Confirms CORS is a real production concern for Leenk, even though
it is invisible in dev behind the Vite proxy.
