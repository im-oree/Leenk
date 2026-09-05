import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { config, isProd } from './lib/config.js'
import { usingMemory } from './lib/firebase.js'
import { studentHubHealth } from './services/studentHub.js'
import { drainOutbox, outboxStats } from './services/outbox.js'
import { seedConfig } from './services/appConfig.js'

import authRoutes from './routes/auth.js'
import profileRoutes from './routes/profile.js'
import discoveryRoutes from './routes/discovery.js'
import matchRoutes from './routes/matches.js'
import feedRoutes from './routes/feed.js'
import locationRoutes from './routes/location.js'
import verificationRoutes from './routes/verification.js'
import safetyRoutes from './routes/safety.js'
import mediaRoutes from './routes/media.js'
import paymentRoutes from './routes/payments.js'
import storyRoutes from './routes/stories.js'
import callRoutes from './routes/calls.js'
import adminRoutes from './routes/admin.js'

const app = express()

app.set('trust proxy', 1)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: true, credentials: true }))
// Payment webhooks are signature-verified over the RAW body, so the raw
// parser MUST come before express.json() or the signature can never match.
app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }))
app.use(express.json({ limit: '1mb' }))
app.use(morgan(isProd ? 'combined' : 'dev'))

const generalLimiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false })
const authLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false })
app.use('/api', generalLimiter)

/* ------------------------------- meta routes -------------------------------- */
app.get('/health', async (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Leenk Backend',
    version: '0.1.0',
    env: config.env,
    store: usingMemory() ? 'memory (dev)' : 'firestore',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api', (_req, res) => {
  res.json({
    name: 'Leenk API',
    version: '0.1.0',
    docs: '/docs/STUDENTHUB_INTEGRATION.md',
    endpoints: {
      auth: ['POST /api/auth/signup', 'POST /api/auth/studenthub/callback', 'POST /api/auth/link-studenthub', 'GET /api/auth/me'],
      profile: ['GET /api/profile', 'PUT /api/profile', 'GET /api/profile/:uid', 'POST /api/profile/:uid/block'],
      discovery: ['GET /api/discovery/stack', 'POST /api/discovery/swipe', 'POST /api/discovery/undo', 'GET /api/discovery/likes', 'PUT /api/discovery/filters'],
      matches: ['GET /api/matches', 'GET /api/matches/:id/messages', 'POST /api/matches/:id/messages', 'DELETE /api/matches/:id'],
      feed: ['GET /api/feed', 'POST /api/feed', 'POST /api/feed/:postId/like', 'GET|POST /api/feed/:postId/comments', 'POST /api/feed/follow/:uid'],
      location: ['POST /api/location/ping', 'POST /api/location/batch', 'GET /api/location/policy', 'GET /api/location/presence/:campusId'],
      verification: ['POST /api/verification/submit', 'GET /api/verification/status', 'POST /api/verification/studenthub-umis', 'POST /api/verification/vouch'],
      safety: ['POST /api/safety/report', 'POST /api/safety/meetup', 'POST /api/safety/appeal'],
    },
  })
})

app.get('/api/integration/studenthub/health', async (_req, res) => {
  res.json({ success: true, studentHub: await studentHubHealth(), outbox: await outboxStats() })
})

app.post('/api/integration/studenthub/drain', async (req, res, next) => {
  try {
    if (config.studentHub.writeKey && req.headers['x-admin-key'] !== config.studentHub.writeKey) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    res.json({ success: true, ...(await drainOutbox(50)) })
  } catch (err) { next(err) }
})

/* --------------------------------- routes ----------------------------------- */
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/discovery', discoveryRoutes)
app.use('/api/matches', matchRoutes)
app.use('/api/feed', feedRoutes)
app.use('/api/location', locationRoutes)
app.use('/api/verification', verificationRoutes)
app.use('/api/safety', safetyRoutes)
app.use('/api/media', mediaRoutes)
app.use('/api/stories', storyRoutes)
app.use('/api/calls', callRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/admin', adminRoutes)

/* -------------------------------- fallbacks --------------------------------- */
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }))

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500
  if (!isProd) console.error('[error]', err)
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
    message: err.message,
    ...(isProd ? {} : { stack: err.stack?.split('\n').slice(0, 4) }),
  })
})

/* --------------------------------- startup ---------------------------------- */
await seedConfig().catch(() => {})

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[leenk] API listening on :${config.port} (${config.env})`)
  console.log(`[leenk] store: ${usingMemory() ? 'in-memory (set FIREBASE_* to use Firestore)' : 'firestore'}`)
  console.log(`[leenk] studenthub: ${config.studentHub.enabled ? config.studentHub.baseUrl : 'disabled'}`)
})

// Outbox retry sweep
const sweep = setInterval(() => { drainOutbox(20).catch(() => {}) }, 60_000)

process.on('SIGTERM', () => { clearInterval(sweep); server.close(() => process.exit(0)) })

export default app
