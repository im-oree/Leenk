# Leenk Ranking & Matching Algorithm

**Status:** Design spec — review before implementation
**Scope:** discovery stack ranking, hard filters, feed ranking, signal collection

---

## 0. Non-negotiable rules (hard gates, evaluated before any scoring)

These are **filters, not scores**. A candidate failing any of them is removed from the pool entirely — no score can rescue them.

| # | Gate | Rule |
|---|---|---|
| 1 | **Orientation** | Mutual preference match required (§1). **Never** show same-gender candidates unless *both* parties opted in during onboarding. |
| 2 | Age | Both directions: each must fall inside the other's stated age range. Hard floor 18. |
| 3 | Verification | Candidate must be `verified`. Pending/rejected never enter a stack. |
| 4 | Block | Either direction blocked → excluded, permanently. |
| 5 | Already acted | Any prior swipe by the viewer on this candidate → excluded (unless undone). |
| 6 | Ban | Candidate banned or `in_review` → excluded. |
| 7 | Trust floor | Candidate `trustScore < 40` → excluded. |
| 8 | Distance ceiling | Beyond the viewer's `maxDistanceKm` → excluded. |
| 9 | Self | Never show the viewer to themselves. |

### 0.1 Orientation gate — exact logic

Onboarding collects two independent fields:

```
gender          : 'man' | 'woman' | 'nonbinary'
interestedIn    : Array<'men' | 'women' | 'nonbinary'>   // multi-select
```

A pair `(A, B)` is **orientation-compatible** iff:

```
genderMatchesPreference(B.gender, A.interestedIn)
      AND
genderMatchesPreference(A.gender, B.interestedIn)
```

where `genderMatchesPreference('man', prefs) = prefs.includes('men')`, etc.

**This is symmetric and mandatory.** A straight man never appears in another straight man's stack, because `'man'` is not in his `interestedIn`. Same-gender pairing happens only when both users explicitly selected that gender in onboarding. There is no fallback, no "expand my search" that bypasses this, and no admin override.

> Implementation note: this is checked **twice** — once when building the
> candidate pool (indexed query) and once immediately before returning the
> stack. A scoring bug must never be able to leak a non-compatible profile.

Nonbinary handling: users select what they are and who they want independently, so a nonbinary user who selects `['women']` sees women who included `'nonbinary'` in their preferences. No special-casing.

---

## 1. Discovery score

For a viewer `V` and candidate `C` that survived every hard gate:

```
score(V, C) = Σ (weight_i × signal_i(V, C))   ×   trustMultiplier(C)
                                              ×   fatiguePenalty(C)
```

All signals are normalised to **0..1** before weighting, so weights are directly comparable and tunable from the admin config without code changes.

### 1.1 Signal table

| Signal | Weight | Range | Definition |
|---|---:|---|---|
| `sameCampus` | **0.22** | 0/1 | Same `campusId`. The single strongest predictor — this is a campus app. |
| `proximity` | **0.14** | 0..1 | `exp(−distanceKm / 12)`. Smooth decay; 0 km→1.0, 5 km→0.66, 15 km→0.29. |
| `sameCity` | 0.04 | 0/1 | Fallback when campuses differ. |
| `sameCountry` | 0.01 | 0/1 | Near-zero; only separates international edge cases. |
| `intentMatch` | **0.16** | 0..1 | Intent compatibility matrix (§1.2). |
| `ageAffinity` | 0.07 | 0..1 | `1 − |ageV − ageC| / 12`, floored at 0. |
| `academicOverlap` | 0.06 | 0..1 | Same department 1.0 · same faculty 0.6 · same level 0.4 (max of these). |
| `socialGraph` | **0.11** | 0..1 | Friends-of-friends — see §1.3. |
| `interestOverlap` | 0.08 | 0..1 | Jaccard over interest tags + prompt topic embeddings. |
| `activityRecency` | 0.06 | 0..1 | `exp(−hoursSinceActive / 72)`. Don't show ghosts. |
| `reciprocityLikelihood` | **0.13** | 0..1 | Predicted P(C likes V back) — see §1.4. |
| `theyLikedYou` | **0.18** | 0/1 | C already liked V. Huge boost: guaranteed match if V likes back. |
| `profileQuality` | 0.05 | 0..1 | Photo count, prompts filled, bio length. Caps at 4 photos + 3 prompts. |
| `noveltyDecay` | −0.09 | 0..1 | Times shown without action. Penalty, not a bonus. |

**Weights sum to ~1.0 excluding penalties.** All live in `appConfig/discovery.weights` and are hot-editable (§5).

### 1.2 Intent compatibility matrix

Intents: `relationship`, `dating`, `friends`, `study`, `unsure`.

|  | relationship | dating | friends | study | unsure |
|---|---|---|---|---|---|
| **relationship** | 1.0 | 0.7 | 0.2 | 0.15 | 0.5 |
| **dating** | 0.7 | 1.0 | 0.35 | 0.2 | 0.6 |
| **friends** | 0.2 | 0.35 | 1.0 | 0.7 | 0.5 |
| **study** | 0.15 | 0.2 | 0.7 | 1.0 | 0.4 |
| **unsure** | 0.5 | 0.6 | 0.5 | 0.4 | 0.7 |

Symmetric by construction. `unsure` deliberately sits mid-range everywhere so new users aren't buried.

### 1.3 Social graph (friends-of-friends)

Leenk has no explicit friend list, so the graph is derived from three edges:

1. **Follows** (feed) — `A follows B`
2. **Mutual matches** — `A matched B`
3. **Vouches** — `A vouched for B` (verification feature)

```
mutuals(V, C)  = |neighbours(V) ∩ neighbours(C)|
socialGraph    = min(1, log2(1 + mutuals) / log2(1 + 8))
```

Saturates at 8 mutuals. Log scale because the 1st mutual connection is far more informative than the 9th.

> **Privacy:** the *count* influences ranking; the identities are never shown.
> No "you both know Ada" UI — on a campus that deanonymises quickly and creates
> social pressure. The signal stays internal.

### 1.4 Reciprocity likelihood

The most valuable signal: showing V people who will actually like V back. Prevents attractive-user monopolisation and keeps low-activity users from starving.

**Phase 1 — heuristic** (no training data yet):

```
reciprocity = 0.35 × selectivityFit
            + 0.30 × demandBalance
            + 0.20 × attributeAffinity
            + 0.15 × activityFit
```

- `selectivityFit` — how picky is C? `1 − (C.likesGiven / C.swipesTotal)` inverted against V's own desirability decile. A highly selective C is only shown to high-desirability V.
- `demandBalance` — `1 − normalised(C.likesReceived_7d)`. Actively suppresses users already drowning in likes, redistributing attention.
- `attributeAffinity` — cosine similarity between V's attribute vector and C's *revealed preference* vector (the mean attribute vector of profiles C has liked).
- `activityFit` — both users active in overlapping hours.

**Phase 2 — learned:** logistic regression on `(V_features, C_features) → didLikeBack`, retrained nightly once ≥50k labelled swipe pairs exist. Same interface, so it drops in behind the same function signature.

### 1.5 Trust multiplier (shadow-throttling)

```
trustScore ≥ 75  → 1.00
trustScore ≥ 55  → 0.75
trustScore ≥ 40  → 0.35
trustScore < 40  → excluded by gate 7
```

Low-trust accounts aren't banned, just quietly deprioritised. They never learn they're throttled — which is the point.

### 1.6 Fatigue penalty

```
fatiguePenalty = 0.85 ^ timesShownWithoutAction
```

A profile skipped past 5 times drops to 44% weight. Prevents the same faces cycling forever.

### 1.7 Exploration (ε-greedy)

**15% of every stack is randomised** from the eligible pool, ignoring score.

Without this the algorithm converges on a local optimum: new users with no signal never surface, and V only ever sees one "type". The exploration slots are how the system discovers preferences it hasn't learned yet. Tunable via `discovery.explorationRate`.

New-user boost: candidates with `< 20` total impressions get a flat `×1.4` for their first 72 hours. Cold-start protection.

### 1.8 Diversity constraint

Post-scoring, before returning:
- Max **3 consecutive** candidates from the same department.
- Max **40%** of a stack from any single department.
- Enforced by a re-shuffle pass, not by score adjustment.

Otherwise a Software Engineering student sees only Software Engineering students, which is both boring and socially claustrophobic.

---

## 2. Behavioural signal collection

To power §1.4 and the feed, we log these events. **All are private to Leenk and never sent to StudentHub.**

| Event | Payload | Used for |
|---|---|---|
| `profile_view` | targetUid, dwellMs, source, photosViewed | attributeAffinity, interest inference |
| `photo_expand` | targetUid, photoIndex | strong interest signal |
| `swipe` | targetUid, direction, dwellMs, position | reciprocity training label |
| `match` | pair | graph edge |
| `message_sent` | matchId, index | match *quality* label |
| `conversation_depth` | matchId, turnCount | the real success metric |
| `unmatch` | targetUid, hoursAfterMatch, hadMessaged | negative label |
| `report` | category | trust + safety |
| `feed_dwell` | postId, ms, viewportPct | feed ranking |
| `post_like/comment/share` | postId | feed affinity |
| `profile_from_feed` | postId → uid | cross-surface interest |
| `session` | start, end, tabs, campusId | activityFit |

**Dwell time is the most honest signal we have.** Someone who spends 14 s on a profile and swipes left is telling us something quite different from a 0.4 s reflex left. Both are labelled "pass", only one means disinterest.

### 2.1 Retention & privacy

| Data | Retention |
|---|---|
| Raw event log | 90 days, then aggregated |
| Aggregated per-user vectors | Lifetime of account |
| Derived preference vectors | Recomputed weekly |
| Everything | Hard-deleted within 30 days of account deletion |

Events are stored **write-only from the client** — a user cannot read their own event log via the API, so a compromised token can't exfiltrate behavioural history.

---

## 3. Feed ranking

Not chronological, not follow-only. Blend of four pools:

| Pool | Share | Contents |
|---|---:|---|
| **Following** | 40% | People V follows |
| **Campus** | 30% | Same campus, not followed |
| **Affinity** | 20% | Predicted-interest, any campus in scope |
| **Fresh** | 10% | New posts from new users (cold start) |

```
feedScore(P) = recency          × 0.30
             + authorAffinity   × 0.24
             + engagementRate   × 0.18
             + campusRelevance  × 0.12
             + mediaQuality     × 0.08
             + dwellPrediction  × 0.08
             − seenPenalty
```

- `recency` = `exp(−hours / 14)` — 14 h half-life.
- `engagementRate` = `(likes + 2×comments) / impressions`, Wilson-smoothed so a post with 1 like from 1 view doesn't top the feed.
- `seenPenalty` = 0.6 per prior impression, so re-scrolls surface new material.
- **Max 3 posts per author** per feed page.

Stories are ranked separately: unwatched first, then by author affinity, then recency.

---

## 4. Match quality feedback loop

Optimising for match *count* produces a bad product — it rewards mass-liking. We optimise for **conversations**.

```
matchQuality = 0.15 × matched
             + 0.35 × (messages ≥ 4 exchanged)
             + 0.30 × (conversation spans ≥ 2 days)
             + 0.20 × (no unmatch/report within 7 days)
```

This is the training label for §1.4 Phase 2, and the north-star metric. A pairing that matches and dies in silence scores 0.15; one that becomes a real conversation scores 1.0.

---

## 5. Runtime configuration

**Every weight, threshold and toggle above is stored in Firestore, not in env vars.** Editable live from the admin panel with no redeploy.

```
appConfig/discovery   → weights, explorationRate, dailyCaps, trustTiers
appConfig/feed        → pool shares, scoring weights, decay
appConfig/media       → imgbb key pool, size limits, allowed types
appConfig/moderation  → NSFW thresholds, provider, auto-action rules
appConfig/messaging   → edit window, rate limits, GIF provider
appConfig/notifications → templates, quiet hours, throttles
appConfig/features    → kill switches per feature
```

Env vars hold **only** database credentials and the values needed to bootstrap a connection to Firestore. Everything else is config-as-data.

Config is cached in-process for 60 s with a pub/sub invalidation hook, so reads cost nothing and edits land within a minute.

---

## 6. Anti-abuse

| Vector | Mitigation |
|---|---|
| Mass-liking | Daily cap (25 free). Like-ratio > 0.8 sustained → reciprocity penalty. |
| Bot swiping | Inter-swipe timing variance. Sub-200 ms medians flagged. |
| Attractiveness monopoly | `demandBalance` actively suppresses over-liked profiles. |
| Score gaming | Weights server-side only; never exposed in any API response. |
| Location spoofing | Speed plausibility (`STUDENTHUB_INTEGRATION.md` §5.5.6). |
| Multi-accounting | Device fingerprint linking; bans propagate across linked devices. |

---

## 7. Build order

| Phase | Contents |
|---|---|
| **1** | Hard gates (§0) — **orientation gate first**, it's a correctness requirement, not an optimisation |
| **2** | Static signals: campus, proximity, intent, age, academic |
| **3** | Event logging (§2) — must precede anything learned |
| **4** | Reciprocity heuristic (§1.4 Phase 1), fatigue, exploration |
| **5** | Social graph, feed blend |
| **6** | Learned reciprocity model once data volume allows |
