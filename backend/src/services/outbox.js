/**
 * Durable outbox for StudentHub writes.
 *
 * StudentHub being slow or down must never fail a Leenk request. Every
 * outbound write is queued, attempted immediately, and retried with
 * exponential backoff if it fails. Each job is idempotent via `dedupeKey`.
 */

import { db, FieldValue } from '../lib/firebase.js'
import { studentHubEnabled, pushProfileUpdate, provisionStudentHubUser } from './studentHub.js'

const HANDLERS = {
  'profile.update': ({ studentHubUid, patch }) => pushProfileUpdate(studentHubUid, patch),
  'user.provision': (payload) => provisionStudentHubUser(payload),
}

const MAX_ATTEMPTS = 6
const backoffMs = (n) => Math.min(60 * 60_000, 2 ** n * 5_000) // 5s → 1h

export async function enqueue(type, payload, { dedupeKey } = {}) {
  const job = {
    type,
    payload,
    dedupeKey: dedupeKey || `${type}:${payload.studentHubUid || payload.uid || Date.now()}`,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: null,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  }
  const ref = await db().collection('studentHubOutbox').add(job)

  // Fire-and-forget immediate attempt; failures fall back to the retry sweep.
  runJob(ref.id, job).catch(() => {})
  return ref.id
}

async function runJob(id, job) {
  if (!studentHubEnabled()) {
    await db().collection('studentHubOutbox').doc(id).set(
      { status: 'skipped', lastError: 'STUDENTHUB_DISABLED', updatedAtMs: Date.now() },
      { merge: true },
    )
    return { skipped: true }
  }

  const handler = HANDLERS[job.type]
  if (!handler) {
    await db().collection('studentHubOutbox').doc(id).set(
      { status: 'failed', lastError: `No handler for ${job.type}` }, { merge: true },
    )
    return { failed: true }
  }

  try {
    const result = await handler(job.payload)
    await db().collection('studentHubOutbox').doc(id).set(
      { status: 'done', result, completedAtMs: Date.now() }, { merge: true },
    )
    return { ok: true, result }
  } catch (err) {
    const attempts = (job.attempts || 0) + 1
    const dead = attempts >= MAX_ATTEMPTS
    await db().collection('studentHubOutbox').doc(id).set(
      {
        status: dead ? 'dead' : 'pending',
        attempts,
        lastError: err.message,
        lastStatus: err.status || null,
        nextAttemptAt: Date.now() + backoffMs(attempts),
        updatedAtMs: Date.now(),
      },
      { merge: true },
    )
    return { ok: false, error: err.message, attempts }
  }
}

/** Retry sweep — call from a cron/scheduler. */
export async function drainOutbox(limit = 25) {
  const snap = await db().collection('studentHubOutbox').where('status', '==', 'pending').limit(limit).get()
  const due = snap.docs.filter((d) => (d.data().nextAttemptAt || 0) <= Date.now())
  const results = []
  for (const d of due) results.push({ id: d.id, ...(await runJob(d.id, d.data())) })
  return { checked: snap.docs.length, attempted: results.length, results }
}

export async function outboxStats() {
  const snap = await db().collection('studentHubOutbox').get()
  const counts = { pending: 0, done: 0, dead: 0, skipped: 0, failed: 0 }
  snap.docs.forEach((d) => { counts[d.data().status] = (counts[d.data().status] || 0) + 1 })
  return counts
}
