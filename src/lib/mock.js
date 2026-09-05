/**
 * MOCK DATA ONLY.
 * Shapes mirror the PRD data model (§1.7) and the StudentHub Firestore schema,
 * so swapping these arrays for live Firebase reads is a drop-in change.
 * Nothing here talks to a network.
 */

export const CAMPUSES = [
  { id: 'babcock', name: 'Babcock University', short: 'Babcock', city: 'Ilishan-Remo', verificationMethod: 'umis', userCount: 1240 },
  { id: 'unilag', name: 'University of Lagos', short: 'UNILAG', city: 'Akoka', verificationMethod: 'email+id', userCount: 980 },
  { id: 'covenant', name: 'Covenant University', short: 'Covenant', city: 'Ota', verificationMethod: 'email', userCount: 760 },
  { id: 'ui', name: 'University of Ibadan', short: 'UI', city: 'Ibadan', verificationMethod: 'id', userCount: 540 },
  { id: 'oau', name: 'Obafemi Awolowo University', short: 'OAU', city: 'Ile-Ife', verificationMethod: 'id', userCount: 410 },
]

export const DEPARTMENTS = [
  'Computer Science', 'Software Engineering', 'Mass Communication', 'Law', 'Nursing',
  'Accounting', 'Economics', 'Architecture', 'Political Science', 'Microbiology',
  'Mechanical Engineering', 'Psychology', 'Business Admin', 'Medicine & Surgery',
]

export const LEVELS = ['100', '200', '300', '400', '500', 'Postgrad']

export const INTENTS = [
  { id: 'dating', label: 'Dating', blurb: 'Something real, no rush' },
  { id: 'friends', label: 'Friends', blurb: 'New people, good energy' },
  { id: 'study', label: 'Study buddy', blurb: 'Someone to lock in with' },
  { id: 'open', label: 'Open to anything', blurb: 'See where it goes' },
]

export const PROMPTS = [
  'The way to win me over is',
  'My most controversial campus opinion',
  'I geek out way too hard about',
  "You'll find me at 2am doing",
  'Two truths and a lie',
  'My simple pleasures',
  'Best spot on campus, and why',
]

const img = (seed, w = 800, h = 1100) => `https://picsum.photos/seed/${seed}/${w}/${h}`

export const ME = {
  uid: 'me',
  name: 'Ayo',
  fullName: 'Ayomide Bakare',
  age: 20,
  birthdate: '2005-04-12',
  gender: 'male',
  campusId: 'babcock',
  department: 'Software Engineering',
  level: '300',
  intent: 'dating',
  bio: 'Building things that hopefully outlive the semester.',
  photos: [img('me1'), img('me2'), img('me3')],
  prompts: [
    { q: 'I geek out way too hard about', a: 'Keyboard switches and Formula 1 pit strategy.' },
    { q: 'Best spot on campus, and why', a: 'The old library roof — nobody goes up there at 6pm.' },
  ],
  verified: true,
  trustScore: 87,
  subscription: 'free',
  stats: { likes: 128, matches: 24, posts: 12, followers: 340, following: 210 },
  privacy: { discoverability: 'nearby', visible: true, readReceipts: true, showActive: true },
}

const NAMES = [
  ['Zara', 'female', 20], ['Tobi', 'male', 21], ['Amaka', 'female', 19], ['Dami', 'female', 22],
  ['Kelechi', 'male', 20], ['Ife', 'female', 21], ['Nifemi', 'male', 19], ['Chidera', 'female', 23],
  ['Simi', 'female', 20], ['Bolu', 'male', 22], ['Halima', 'female', 21], ['Emeka', 'male', 20],
]

export const CANDIDATES = NAMES.map(([name, gender, age], i) => ({
  uid: `u${i + 1}`,
  name,
  age,
  gender,
  campusId: CAMPUSES[i % CAMPUSES.length].id,
  department: DEPARTMENTS[(i * 3) % DEPARTMENTS.length],
  level: LEVELS[i % 4],
  intent: INTENTS[i % INTENTS.length].id,
  distanceKm: [0, 0, 1, 3, 6, 12, 18, 24][i % 8],
  verified: true,
  photos: [img(`p${i}a`), img(`p${i}b`), img(`p${i}c`)],
  bio: [
    'Chronically early to lectures, chronically late to everything else.',
    'I will absolutely beat you at table tennis.',
    'Looking for someone to explore Lagos food spots with.',
    'Half engineer, half amateur photographer.',
  ][i % 4],
  prompts: [
    { q: PROMPTS[i % PROMPTS.length], a: [
      'Bring me suya and ask me about my thesis. That easy.',
      'The 8am lecture should be a criminal offence.',
      'Vintage film cameras. I have four. I need zero.',
      'Rewriting my notes in three different colours for no reason.',
    ][i % 4] },
    { q: PROMPTS[(i + 2) % PROMPTS.length], a: 'Long walks, short queues, cold drinks.' },
  ],
  interests: [['Film', 'Padel', 'Afrobeats'], ['Chess', 'Gym', 'Anime'], ['Fashion', 'Poetry', 'Coffee'], ['Football', 'Coding', 'Cars']][i % 4],
}))

export const MATCHES = CANDIDATES.slice(0, 6).map((c, i) => ({
  id: `m${i + 1}`,
  user: c,
  matchedAt: Date.now() - (i + 1) * 3600_000 * 7,
  isNew: i < 2,
  lastMessage: i < 2 ? null : [
    { text: 'okay but your prompt answer was actually funny', mine: false },
    { text: 'see you at the thing on Friday?', mine: true },
    { text: 'sending the notes now 😭', mine: false },
    { text: 'no because who told you that', mine: true },
  ][i % 4],
  unread: i === 2 ? 2 : 0,
}))

export const THREADS = {
  m3: [
    { id: 1, mine: false, text: 'hey — you were in the 300L systems class right?', at: Date.now() - 7200_000 },
    { id: 2, mine: true, text: 'yeah lol I sat at the back the whole semester', at: Date.now() - 7000_000 },
    { id: 3, mine: false, text: 'explains why I never saw you', at: Date.now() - 6900_000 },
    { id: 4, mine: false, text: 'sending the notes now 😭', at: Date.now() - 600_000 },
  ],
}

export const POSTS = CANDIDATES.slice(0, 8).map((c, i) => ({
  id: `post${i + 1}`,
  author: c,
  media: img(`f${i}`, 1000, 1000),
  caption: [
    'Late night studio. Third coffee. Zero regrets.',
    'Campus looked unreal this evening.',
    'We won. That is the whole caption.',
    'Finally finished the project. Sleeping for a week.',
  ][i % 4],
  likes: 40 + i * 27,
  comments: 3 + (i % 9),
  liked: i % 5 === 0,
  at: Date.now() - (i + 1) * 5400_000,
  scope: i % 3 === 0 ? 'campus' : 'followers',
}))

export const STORIES = [
  { id: 's0', author: { ...ME, name: 'Your story' }, mine: true, seen: false,
    items: [{ media: ME.photos?.[0] }] },
  ...CANDIDATES.slice(0, 7).map((c, i) => ({
    id: `s${i + 1}`,
    author: c,
    seen: i > 3,
    at: Date.now() - (i + 1) * 1800_000,
    items: (c.photos || []).slice(0, 2).map((m) => ({ media: m })),
  })),
]

// Which candidates currently have a live story — drives rings across the app.
const STORY_AUTHORS = new Set(CANDIDATES.slice(0, 7).map((c) => c.uid))
CANDIDATES.forEach((c, i) => {
  c.hasActiveStory = STORY_AUTHORS.has(c.uid)
  c.hasUnseenStory = c.hasActiveStory && i <= 3
})

export const NOTIFICATIONS = [
  { id: 'n1', type: 'match', title: 'You matched with Zara', body: 'Say something before the vibe cools.', at: Date.now() - 900_000, unread: true },
  { id: 'n2', type: 'verify', title: 'Verification approved', body: 'Your Babcock student status is confirmed.', at: Date.now() - 86_400_000, unread: false },
  { id: 'n3', type: 'like', title: 'Tobi liked your post', body: '“Late night studio…”', at: Date.now() - 3600_000 * 5, unread: true },
  { id: 'n4', type: 'comment', title: 'Amaka commented', body: '“this is such a good shot”', at: Date.now() - 3600_000 * 9, unread: false },
  { id: 'n5', type: 'follow', title: 'Kelechi followed you', body: 'From University of Lagos', at: Date.now() - 3600_000 * 26, unread: false },
]

export const campusById = (id) => CAMPUSES.find((c) => c.id === id) || CAMPUSES[0]
export const intentLabel = (id) => INTENTS.find((i) => i.id === id)?.label || 'Open'

/* ------------------------------------------------------------------ *
 * GIF + sound fixtures (mock mode)
 * ------------------------------------------------------------------ */

// Deterministic placeholder "GIFs" — still images, but they exercise the exact
// { preview, full } contract the real provider returns, so the picker layout
// and the send path are identical in both modes.
const GIF_TAGS = [
  'excited', 'laughing', 'crying', 'shocked', 'love', 'dancing',
  'thumbs up', 'eye roll', 'facepalm', 'clapping', 'confused', 'wave',
  'sleepy', 'nervous', 'celebrate', 'shy', 'angry', 'thinking',
]

export const MOCK_GIFS = (q = '') => {
  const term = q.trim().toLowerCase()
  // A query that matches nothing must return nothing, so the picker's empty
  // state is reachable in mock mode (it previously fell back to the full list).
  const list = (term ? GIF_TAGS.filter((t) => t.includes(term) || term.includes(t)) : GIF_TAGS).slice(0, 18)
  return list.map((tag, i) => {
    // Vary aspect ratios so the masonry grid gets a realistic workout.
    const w = 200 + ((i * 37) % 120)
    const h = 150 + ((i * 53) % 130)
    const seed = `gif-${tag.replace(/\s/g, '')}`
    return {
      id: seed,
      description: tag,
      preview: { url: `https://picsum.photos/seed/${seed}/${w}/${h}`, width: w, height: h },
      full: { url: `https://picsum.photos/seed/${seed}/${w * 2}/${h * 2}`, width: w * 2, height: h * 2 },
    }
  })
}

const SOUND_SEEDS = [
  ['Lagos Nights', 'Tunde A.', 142], ['Campus Walk', 'Mira K.', 98],
  ['Slow Motion', 'Blue Room', 176], ['Afrobeat Sketch', 'Kola', 121],
  ['Rooftop', 'Ada N.', 155], ['Study Loop', 'Quiet Hours', 204],
  ['Late Bus', 'Femi O.', 133], ['Golden Hour', 'Sade B.', 167],
  ['No Signal', 'Terminal 3', 112], ['Harmattan', 'Zainab I.', 189],
  ['First Week', 'The Commons', 145], ['Night Market', 'Chidi E.', 158],
]

export const MOCK_SOUNDS = (q = '') => {
  const term = q.trim().toLowerCase()
  return SOUND_SEEDS
    .filter(([t, a]) => !term || t.toLowerCase().includes(term) || a.toLowerCase().includes(term))
    .map(([title, artist, duration], i) => ({
      id: `snd-${i}`,
      title,
      artist,
      duration,
      // No real audio in mock mode; the picker handles a null url by disabling
      // preview playback rather than throwing.
      url: null,
      thumbnail: `https://picsum.photos/seed/snd${i}/120/120`,
      license: { code: 'cc0', version: '1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      attribution: `${title} by ${artist} (CC0)`,
      source: 'mock',
    }))
}

/* ------------------------------------------------------------------ *
 * Map fixtures (mock mode)
 * ------------------------------------------------------------------ */

// Babcock University, Ilishan-Remo. Pins are already snapped to a 250m grid,
// matching what the API returns — the client never sees a raw coordinate.
const BABCOCK = { lat: 6.8917, lng: 3.7186 }

export const MOCK_MAP = () => {
  const staleness = ['Just now', 'Just now', 'Today', 'Today', 'Yesterday']
  const pins = CANDIDATES.slice(0, 9).map((c, i) => {
    // Deterministic spread over ~1km, snapped to a 250m grid like the server.
    const dLat = (((i * 37) % 9) - 4) * (250 / 111320)
    const dLng = (((i * 53) % 9) - 4) * (250 / (111320 * Math.cos(BABCOCK.lat * Math.PI / 180)))
    const lat = BABCOCK.lat + dLat
    const lng = BABCOCK.lng + dLng
    return {
      uid: c.uid,
      name: c.name,
      photo: c.photos[0],
      verified: true,
      lat, lng,
      cellId: `${lat.toFixed(3)}:${lng.toFixed(3)}`,
      lastSeen: staleness[i % staleness.length],
    }
  })
  return { enabled: true, pins, onCampusCount: pins.length + 6, suppressed: 6, kAnonymity: 3 }
}

/* ------------------------------------------------------------------ *
 * StudentHub federated posts (mock mode)
 * ------------------------------------------------------------------ *
 * Read-only inline federation. Mirrors the shape produced by
 * backend/src/services/federation.js normalizePost().
 */
export const MOCK_SH_POSTS = [
  {
    id: 'sh_1', source: 'studenthub', readOnly: true, kind: 'announcement',
    caption: 'Second semester examination timetable is now available on the student portal. Check your course codes carefully — three papers moved this week.',
    mediaUrl: null, mediaType: 'none', campusId: 'babcock',
    createdAtMs: Date.now() - 2 * 3600_000,
    likeCount: 214, commentCount: 38, liked: false, sourceUrl: null,
    author: { uid: 'sh_registrar', studentHubUid: 'registrar', name: 'Babcock Registrar', photo: null, campusId: 'babcock', verified: true, official: true },
  },
  {
    id: 'sh_2', source: 'studenthub', readOnly: true, kind: 'event',
    caption: 'Career fair this Friday, 10am at the Multipurpose Hall. 20+ companies recruiting for internships and graduate roles.',
    mediaUrl: null, mediaType: 'none', campusId: 'babcock',
    createdAtMs: Date.now() - 9 * 3600_000,
    likeCount: 96, commentCount: 12, liked: false, sourceUrl: null,
    author: { uid: 'sh_careers', studentHubUid: 'careers', name: 'Careers Office', photo: null, campusId: 'babcock', verified: true, official: true },
  },
]
