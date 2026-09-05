import 'dotenv/config'

const bool = (v, d = false) => (v == null ? d : String(v).toLowerCase() === 'true')
const num = (v, d) => (v == null || v === '' ? d : Number(v))

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 5100),

  // Leenk's OWN Firebase project (source of truth for dating/social data)
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  },

  // StudentHub — the parent platform Leenk federates with
  studentHub: {
    baseUrl: process.env.STUDENTHUB_BASE_URL || 'http://localhost:5000',
    appId: process.env.STUDENTHUB_APP_ID || 'leenk',
    appSecret: process.env.STUDENTHUB_APP_SECRET || '',
    // OIDC (preferred sign-in path)
    oauthClientId: process.env.STUDENTHUB_OAUTH_CLIENT_ID || 'leenk-dev',
    oauthClientSecret: process.env.STUDENTHUB_OAUTH_CLIENT_SECRET || '',
    redirectUri: process.env.STUDENTHUB_REDIRECT_URI || 'leenk://auth/callback',
    // shared secret for Leenk -> StudentHub writes
    writeKey: process.env.STUDENTHUB_WRITE_KEY || '',
    enabled: bool(process.env.STUDENTHUB_ENABLED, false),
    timeoutMs: num(process.env.STUDENTHUB_TIMEOUT_MS, 8000),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
    ttlSeconds: num(process.env.JWT_TTL_SECONDS, 60 * 60 * 24 * 30),
  },

  location: {
    // See docs/STUDENTHUB_INTEGRATION.md §5 for the maths behind these numbers
    minIntervalMs: num(process.env.LOC_MIN_INTERVAL_MS, 60_000),
    minDistanceM: num(process.env.LOC_MIN_DISTANCE_M, 75),
    maxSpeedMps: num(process.env.LOC_MAX_SPEED_MPS, 55),
    maxPerHour: num(process.env.LOC_MAX_PER_HOUR, 90),
    maxAccuracyM: num(process.env.LOC_MAX_ACCURACY_M, 250),
    gridPrecisionM: num(process.env.LOC_GRID_PRECISION_M, 250),
    presenceTtlMs: num(process.env.LOC_PRESENCE_TTL_MS, 5 * 60_000),
  },

  discovery: {
    nearbyRadiusKm: num(process.env.DISCOVERY_NEARBY_KM, 35),
    dailySwipeCapFree: num(process.env.DAILY_SWIPE_CAP_FREE, 25),
    dailySuperLikeFree: num(process.env.DAILY_SUPERLIKE_FREE, 1),
    dailyUndoFree: num(process.env.DAILY_UNDO_FREE, 3),
  },

  trust: {
    minScoreToSwipe: num(process.env.TRUST_MIN_SWIPE, 40),
    shadowThrottleBelow: num(process.env.TRUST_SHADOW_BELOW, 55),
  },
}

export const isProd = config.env === 'production'
