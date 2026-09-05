/**
 * Notifications — FCM push + in-app inbox.
 *
 * Templates live in `appConfig/notifications.templates` so copy can be edited
 * without a deploy. Copy is deliberately non-baity (PRD §1.7): we tell the
 * user what happened, we don't manufacture urgency. No "3 people are waiting!"
 *
 * Throttling is enforced here, not at the call site, so no feature can
 * accidentally spam a user.
 */

import { db, FieldValue, messaging } from '../lib/firebase.js'
import { getConfig } from './appConfig.js'

/* ------------------------------------------------------------------ */

function renderTemplate(str, vars = {}) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

/** Quiet hours are per-config and wrap midnight correctly. */
function inQuietHours() {
  const q = getConfig('notifications.quietHours')
  if (!q) return false
  const tz = q.timezone || 'Africa/Lagos'
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()),
  )
  return q.start > q.end ? hour >= q.start || hour < q.end : hour >= q.start && hour < q.end
}

async function underDailyCap(uid) {
  const cap = getConfig('notifications.maxPerDay') ?? 6
  const since = Date.now() - 86_400_000
  try {
    const snap = await db().collection('users').doc(uid)
      .collection('notifications').where('at', '>', since).get()
    return snap.size < cap
  } catch {
    return true
  }
}

/* ------------------------------------------------------------------ */

/**
 * Send a notification to one user.
 * Always writes the in-app record; push is best-effort on top.
 *
 * @param uid
 * @param {{type,title,body,data,priority,bypassQuietHours,templateKey,vars}} msg
 */
export async function sendToUser(uid, msg) {
  const cfg = getConfig('notifications')
  if (!cfg.enabled) return { sent: false, reason: 'DISABLED' }
  if (cfg.disabledByDefault?.includes(msg.type)) return { sent: false, reason: 'TYPE_DISABLED' }

  // Resolve from a template when one is named.
  let { title, body } = msg
  if (msg.templateKey) {
    const t = cfg.templates?.[msg.templateKey]
    if (t) {
      title = renderTemplate(t.title, msg.vars)
      body = renderTemplate(t.body, msg.vars)
    }
  }

  // Per-user preferences beat everything except calls.
  let prefs = {}
  try {
    const u = await db().collection('users').doc(uid).get()
    prefs = u.data()?.notificationPrefs || {}
    if (prefs[msg.type] === false) return { sent: false, reason: 'USER_OPTED_OUT' }
  } catch { /* default to allowed */ }

  const quiet = inQuietHours() && !msg.bypassQuietHours
  const capped = !(await underDailyCap(uid)) && !msg.bypassQuietHours

  const record = {
    type: msg.type,
    title,
    body,
    data: msg.data || {},
    at: Date.now(),
    read: false,
    delivered: !quiet && !capped,
    suppressedReason: quiet ? 'QUIET_HOURS' : capped ? 'DAILY_CAP' : null,
  }

  // The in-app inbox always gets it — suppression affects push, not the record,
  // so nothing is silently lost.
  try {
    await db().collection('users').doc(uid).collection('notifications').add(record)
    await db().collection('users').doc(uid).set({ unreadNotifications: FieldValue.increment(1) }, { merge: true })
  } catch { /* non-critical */ }

  if (quiet || capped) return { sent: false, reason: record.suppressedReason, stored: true }

  // Push, best effort.
  try {
    const tokensSnap = await db().collection('users').doc(uid).collection('devices').get()
    const tokens = tokensSnap.docs.map((d) => d.data().fcmToken).filter(Boolean)
    if (!tokens.length) return { sent: false, reason: 'NO_TOKENS', stored: true }

    const fcm = messaging?.()
    if (!fcm) return { sent: false, reason: 'FCM_UNAVAILABLE', stored: true }

    await fcm.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: Object.fromEntries(Object.entries({ type: msg.type, ...(msg.data || {}) }).map(([k, v]) => [k, String(v)])),
      android: { priority: msg.priority === 'high' ? 'high' : 'normal' },
      apns: { payload: { aps: { sound: msg.priority === 'high' ? 'default' : null } } },
    })

    return { sent: true, tokens: tokens.length }
  } catch (err) {
    return { sent: false, reason: 'PUSH_FAILED', error: err.message, stored: true }
  }
}

/* ---- Convenience wrappers, one per product event ---- */

export const notifyMatch = (uid, { name, matchId }) =>
  sendToUser(uid, { type: 'newMatch', templateKey: 'newMatch', vars: { name }, data: { matchId }, priority: 'high' })

export const notifyMessage = (uid, { name, preview, matchId, isFirst }) =>
  sendToUser(uid, {
    type: 'message',
    templateKey: isFirst ? 'firstMessage' : 'message',
    vars: { name, preview: (preview || '').slice(0, 80) },
    data: { matchId },
    priority: 'high',
  })

export const notifyVerification = (uid, approved, { campus } = {}) =>
  sendToUser(uid, {
    type: approved ? 'verificationApproved' : 'verificationRejected',
    templateKey: approved ? 'verificationApproved' : 'verificationRejected',
    vars: { campus: campus || 'your campus' },
    priority: 'high',
  })

/** Register a device for push. Called on login and on token refresh. */
export async function registerDevice(uid, { fcmToken, platform, deviceId }) {
  if (!fcmToken) return false
  try {
    await db().collection('users').doc(uid).collection('devices').doc(deviceId || fcmToken.slice(0, 32)).set({
      fcmToken, platform: platform || 'unknown', updatedAt: Date.now(),
    }, { merge: true })
    return true
  } catch {
    return false
  }
}

export async function unregisterDevice(uid, deviceId) {
  try {
    await db().collection('users').doc(uid).collection('devices').doc(deviceId).delete()
    return true
  } catch { return false }
}

export default { sendToUser, notifyMatch, notifyMessage, notifyVerification, registerDevice, unregisterDevice }
