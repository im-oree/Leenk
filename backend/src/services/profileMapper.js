/**
 * Translation layer between StudentHub's user document and Leenk's profile.
 *
 * Principle: StudentHub is the source of truth for IDENTITY and ACADEMIC data.
 * Leenk is the source of truth for DATING/SOCIAL data. Neither overwrites the
 * other's territory.
 */

/** Fields Leenk PULLS from StudentHub (identity + academic). */
export const PULL_FIELDS = [
  'displayName', 'fullName', 'email', 'photoURL', 'course', 'department',
  'level', 'matricNumber', 'idCardVerified', 'isBanned', 'createdAt', 'campusId',
]

/** Fields Leenk PUSHES back to StudentHub (things StudentHub also benefits from). */
export const PUSH_FIELDS = ['displayName', 'photoURL', 'department', 'level', 'course', 'bio', 'phone']

/** Fields Leenk NEVER shares with StudentHub (dating-private). */
export const PRIVATE_TO_LEENK = [
  'intent', 'prompts', 'photos', 'swipes', 'matches', 'messages',
  'filters', 'trustScore', 'likedBy', 'privacy',
]

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/**
 * StudentHub user doc / OIDC claims -> Leenk profile shape.
 * Tolerates the many field aliases present in the StudentHub schema.
 */
export function fromStudentHub(sh = {}) {
  const name = str(sh.displayName) || str(sh.name) || str(sh.given_name) || str(sh.fullName)
  const photo = str(sh.photoURL) || str(sh.picture) || str(sh.avatarUrl) || str(sh.profileImageUrl)

  return {
    studentHubUid: str(sh.uid) || str(sh.sub) || str(sh.firebaseUid) || str(sh.studenthubId),
    name: name ? name.split(' ')[0] : undefined,
    fullName: str(sh.fullName) || name,
    email: str(sh.email),
    photos: photo ? [photo] : [],
    department: str(sh.department) || str(sh.course),
    course: str(sh.course),
    level: str(sh.level) != null ? String(sh.level) : undefined,
    matricNumber: str(sh.matricNumber) || str(sh.matricNo),
    // Babcock/UMIS-verified ID card is a strong institutional signal
    institutionalVerified: Boolean(sh.idCardVerified),
    bannedUpstream: Boolean(sh.isBanned),
    source: 'studenthub',
  }
}

/** Leenk profile -> the subset we write back to StudentHub. */
export function toStudentHub(leenk = {}) {
  const out = {}
  if (leenk.name || leenk.fullName) out.displayName = leenk.fullName || leenk.name
  if (Array.isArray(leenk.photos) && leenk.photos[0]) out.photoURL = leenk.photos[0]
  if (leenk.department) out.department = leenk.department
  if (leenk.course) out.course = leenk.course
  if (leenk.level) out.level = String(leenk.level)
  if (leenk.bio) out.bio = leenk.bio
  if (leenk.phone) out.phone = leenk.phone
  return out
}

/**
 * Merge policy when a StudentHub sign-in refreshes an existing Leenk profile.
 * StudentHub wins on academic/identity fields; Leenk keeps everything social.
 */
export function mergeOnSignIn(existing = {}, incoming = {}) {
  const merged = { ...existing }
  const authoritative = ['fullName', 'email', 'matricNumber', 'course', 'department', 'level', 'institutionalVerified', 'studentHubUid']
  for (const k of authoritative) {
    if (incoming[k] !== undefined && incoming[k] !== null && incoming[k] !== '') merged[k] = incoming[k]
  }
  // Only seed a display name / photo if Leenk has none yet.
  if (!existing.name && incoming.name) merged.name = incoming.name
  if ((!existing.photos || existing.photos.length === 0) && incoming.photos?.length) merged.photos = incoming.photos
  merged.lastSyncedFromHubAt = Date.now()
  return merged
}

/** Compute the trust contribution coming from StudentHub signals. */
export function hubTrustContribution(sh = {}) {
  let score = 0
  const reasons = []
  if (sh.institutionalVerified) { score += 30; reasons.push('studenthub_id_card_verified') }
  if (sh.matricNumber) { score += 10; reasons.push('matric_present') }
  if (sh.email && /\.edu|\.ac\.|student/i.test(sh.email)) { score += 8; reasons.push('school_email_domain') }
  if (sh.createdAt) {
    const ageDays = (Date.now() - new Date(sh.createdAt).getTime()) / 86_400_000
    if (ageDays > 180) { score += 10; reasons.push('hub_account_age_6mo') }
    else if (ageDays > 30) { score += 5; reasons.push('hub_account_age_1mo') }
  }
  return { score: Math.min(score, 50), reasons }
}
