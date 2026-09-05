import admin from 'firebase-admin'
import { config } from './config.js'
import { memoryDb } from './memoryDb.js'

/**
 * Leenk's own Firebase project.
 *
 * If no service-account credentials are present we fall back to an in-memory
 * Firestore-compatible shim (lib/memoryDb.js). That keeps the whole API
 * runnable and testable before the Firebase project exists — the moment real
 * credentials land in .env, every route switches to real Firestore with no
 * code change.
 */

let _db = null
let _auth = null
let _usingMemory = false

function init() {
  if (_db) return

  const { projectId, clientEmail, privateKey, storageBucket } = config.firebase
  const hasCreds = projectId && clientEmail && privateKey

  if (!hasCreds) {
    _usingMemory = true
    _db = memoryDb
    _auth = null
    // eslint-disable-next-line no-console
    console.warn('[firebase] No credentials found — using in-memory store (development only).')
    return
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      storageBucket: storageBucket || undefined,
    })
  }
  _db = admin.firestore()
  _db.settings({ ignoreUndefinedProperties: true })
  _auth = admin.auth()
}

export function db() {
  init()
  return _db
}

export function auth() {
  init()
  return _auth
}

/**
 * Firebase Cloud Messaging. Returns null when running on the in-memory dev
 * store, so notification code can no-op cleanly instead of throwing.
 */
export function messaging() {
  init()
  if (_usingMemory) return null
  try {
    return admin.messaging() || null
  } catch {
    return null
  }
}

export function usingMemory() {
  init()
  return _usingMemory
}

export const FieldValue = {
  serverTimestamp: () => (usingMemory() ? new Date().toISOString() : admin.firestore.FieldValue.serverTimestamp()),
  increment: (n) => (usingMemory() ? { __increment: n } : admin.firestore.FieldValue.increment(n)),
  arrayUnion: (...v) => (usingMemory() ? { __arrayUnion: v } : admin.firestore.FieldValue.arrayUnion(...v)),
  arrayRemove: (...v) => (usingMemory() ? { __arrayRemove: v } : admin.firestore.FieldValue.arrayRemove(...v)),
  delete: () => (usingMemory() ? { __delete: true } : admin.firestore.FieldValue.delete()),
}
