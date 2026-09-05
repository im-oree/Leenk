# Leenk Map — design + anti-stalking model

Status: **design, not yet built.** Written before implementation because the
failure mode here is physical harm to a student, not a bad UX review.

---

## 1. The core problem

A campus map of real students is the single most dangerous feature in this
product. Everything else (swipes, chat, posts) leaks *interest*. A map leaks
*location*, and location is what turns online harassment into an in-person
encounter.

Two properties make Leenk's case worse than Snap Map's:

1. **The population is dense and bounded.** On one campus, "somewhere in a
   250m cell near the library" is often one building, and at 2am it may be one
   person. Aggregation that is safely anonymous across a city is not safely
   anonymous across a 1km campus.
2. **The graph is romantic.** Rejection is a normal, frequent outcome here.
   Rejected-then-tracks-you is a named, common pattern in dating products, not
   a hypothetical.

So the map is opt-in, off by default, and every design decision below biases
toward "leaks nothing" over "looks impressive".

---

## 2. What we are building

Confirmed with the product owner:

- OSM base map, drawn on / restyled so it reads as ours rather than stock OSM.
- People rendered as **profile-picture pins with a name label**.
- Pins have a **fixed max width and height** so a long name or tall avatar can
  never overflow the marker.
- **Last online, NOT realtime.** This is the most important safety decision in
  the whole feature and it was the right call — see §4.
- Opt-in only.

### 2.1 Base map

Use **MapLibre GL JS** (BSD, no key, no account) with a free raster/vector
tile source. Do **not** use Google Maps or Mapbox — both require a billing
account, which breaks the zero-cost constraint.

Tile source needs a decision (see §7): raw `tile.openstreetmap.org` forbids
heavy app use under its tile usage policy, so we either self-host tiles or use
a free-tier provider. This is a real blocker, not a detail.

Custom drawing on top (campus buildings, walkways, our own colour ramp) is a
styled vector layer plus GeoJSON overlays for campus geometry — we already
have `campusPlaces` in Firestore from the Phase 1 location work.

### 2.2 Pin rendering

```
maxWidth  : 96px      hard cap, name truncates with ellipsis
maxHeight : 76px      avatar 40px + label row, never grows
avatar    : 40x40 circle, 2px ring
label     : single line, max ~10 chars visible, then ellipsis
collision : pins within 44px collapse into a cluster bubble
```

Clustering is not cosmetic — it is a privacy control. See §3.3.

---

## 3. The privacy model

### 3.1 Three levels, opt-in, default off

| Level | Who sees you | Precision shown |
|---|---|---|
| `off` (**default**) | nobody | — |
| `campus` | verified students on your campus | campus centroid only — "on campus", no pin position |
| `matches` | only people you have matched with | fuzzed cell (§3.2) |

There is deliberately **no "everyone" level** and no "followers" level.
Follower graphs are cheap to acquire; a match is mutual and revocable.

Unmatching removes map visibility instantly, in the same write as the unmatch.
Blocking removes it in both directions, permanently.

### 3.2 Fuzzing: snap, don't jitter

Never publish a real coordinate. Reuse the Phase 1 grid maths from
`STUDENTHUB_INTEGRATION.md` §5.5:

- Snap to a **250m grid cell**, publish the *cell centre*, never the true point.
- **The snapped cell must be stable per user per cell**, not re-randomised each
  update. Random jitter on every ping is a classic mistake: an observer who
  collects N pings averages the noise away and recovers the true location to
  arbitrary precision. Snapping to a fixed grid leaks at most "which cell",
  no matter how many samples an attacker collects.
- Never publish accuracy radius, heading, or speed. Those re-narrow the cell.

### 3.3 k-anonymity

A pin only renders if **at least 3 other visible users share the cell**
(reuse Phase 1's `kAnonymity: 3`). Below that, the user collapses into the
campus-level "on campus" state with no position.

This is what stops the 2am case: if you are the only person in your cell, you
are not on the map at all.

### 3.4 No history, ever

Store **one** current fuzzed cell per user. Overwrite in place. Do not keep a
location trail — no `locationHistory` collection, no append-only log.

A trail is what converts a map into a pattern-of-life dossier ("she's at this
building every Tuesday at 4"). It is also the asset that does the most damage
in a breach. Not collecting it is strictly better than securing it.

Retention: a pin expires **after 8 hours** with no update and disappears.

---

## 4. Why "last online, not realtime" is the right call

Realtime location makes **interception** possible: an attacker watches the dot
move and intercepts the person *now*. Coarse last-seen only tells you where
someone *was*, which is far less actionable.

Implementation:

- Show a **bucketed** staleness label, never a timestamp:
  `Just now` (<15m) · `Today` · `Yesterday` · `This week`.
  A precise "8 minutes ago" combined with a cell is close to realtime.
- **Add deliberate delay.** Never publish a location update immediately.
  Hold it for a randomised **10–30 minutes**. This single measure defeats
  most interception attempts and costs nothing in product value, because the
  feature's purpose is ambient discovery, not meeting up right now.
- Suppress updates entirely while the user is moving fast (reuse the Phase 1
  `maxSpeed` check) — a moving trail is a route.

---

## 5. Anti-stalking detection

The product owner asked what the best method is. Direct answer: **you cannot
reliably detect stalking from map-view telemetry alone**, and a naive
"following" detector will be mostly false positives. On a campus of 5,000
students sharing a handful of lecture halls, two people being in the same cell
repeatedly is the normal case, not the suspicious one.

What actually works is layering three cheap signals and only acting when they
**co-occur**.

### 5.1 Signal A — viewing behaviour (strongest, and it is server-side)

This is the good one, because it needs no location inference at all. Stalking
has a distinctive *access* pattern:

| Signal | Why it matters |
|---|---|
| Repeated profile/map views of one target with **no interaction** | Normal interest converts to a like or message; surveillance does not |
| View concentration: one target is >40% of all your map views | Normal browsing is spread out |
| Views resuming immediately after being **unmatched or rejected** | The highest-risk transition in the product |
| Views continuing after the target restricted visibility | Intent signal |
| Checking at a regular cadence (e.g. every morning) | Monitoring, not browsing |

Log map/profile views to `users/{uid}/mapViews/{targetUid}` with a count, first
and last timestamp, and post-unmatch flag. This is a counter, not a trail.

### 5.2 Signal B — co-location beyond chance

Only meaningful **relative to a baseline**. Compute, per (viewer, target) pair,
how often they share a cell versus how often you'd expect from each person's
own cell distribution. Flag only sustained, large excursions — and heavily
discount cells that are high-traffic (lecture halls, cafeteria), because
co-presence there carries almost no information.

Realistically this is Phase 2+ and should never fire an action on its own.

### 5.3 Signal C — account patterns

New account + immediately views one specific person + no other activity. Also:
multiple accounts from one device fingerprint viewing the same target. Both
already have infrastructure from Phase 1 (`deviceFingerprints`, `trustSignals`).

### 5.4 What the system does when signals co-occur

Graduated, and **never** tells the suspected party what tripped it (that just
teaches evasion):

1. **Silently reduce precision.** Degrade the target's visibility to
   campus-level *for that viewer only*. Cheap, invisible, and removes the
   capability. This should be the default automated response.
2. **Rate-limit** that viewer's map views of that target.
3. **Queue for Fraud Ops** (the Phase 2 §G role, separate from content
   moderation) with the co-occurring signals attached.
4. **Notify the target only with something actionable** — "You can limit who
   sees you on the map" plus a one-tap control. Never "someone may be watching
   you", which causes fear without agency and may be a false positive.

Automated *banning* on these signals is not acceptable — false positive rate
is too high and the cost to a wrongly-banned student is real.

### 5.5 The controls that matter more than detection

Detection is a backstop. These prevent more harm, and are cheap:

- **Ghost mode** — see the map without appearing on it. Must not be punished
  or advertised to others.
- **Hide from specific people** without blocking (blocking is a signal that can
  escalate a situation in the physical world; quiet invisibility is safer).
- **Block removes map presence in both directions**, permanently.
- **"Who can see me" is one tap from the map**, not buried in settings.
- On unmatch, **default the pair to invisible to each other** rather than
  leaving prior visibility in place.

---

## 6. Multi-device + StudentHub

The product owner asked for support for more than one device, and across
StudentHub and Leenk. Two rules keep that from becoming a leak:

- Location publishes **per account, not per device**. The newest fuzzed cell
  from any signed-in device wins; devices never appear separately (two pins
  for one person deanonymises the fuzzing).
- **StudentHub does not receive Leenk location data.** Per the ownership split
  in `STUDENTHUB_INTEGRATION.md` §1, location is Leenk-private. A StudentHub
  session can authenticate you, but map visibility is a Leenk-only setting and
  must be granted explicitly inside Leenk.

---

## 7. Open questions (need a decision before building)

1. **Tile hosting.** OSM's public tile server forbids app-scale use.
   Self-host (needs a server + storage, ongoing cost) or free-tier provider
   (most require a key/card — conflicts with the zero-cost rule)? This blocks
   the map.
2. **Is `matches`-only enough**, or is campus-level visibility to all verified
   students wanted? The latter is a much larger exposure surface.
3. **Ghost mode free or paid?** Recommendation: **free**. Charging for a safety
   control is indefensible if something happens to a student who couldn't pay.
4. Should a user be able to see **who viewed them** on the map? It aids
   self-protection but creates its own harassment vector.

---

## 8. Recommended build order

1. Visibility settings + `off` default + ghost mode (no map yet).
2. Static campus-level presence ("on campus"), no pins.
3. Fuzzed pins with k-anonymity + delay, matches-only.
4. View-logging (§5.1) and the auto-degrade response.
5. Co-location baselines (§5.2) — last, and advisory only.

Shipping 3 before 1 and 4 would be the mistake.
