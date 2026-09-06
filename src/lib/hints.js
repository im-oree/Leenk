/**
 * One-off UI hints that teach a gesture, then get out of the way forever.
 *
 * Rules (per PRD feedback):
 *  - a hint shows at most `maxShows` times TOTAL on a device
 *  - each show must be on a DIFFERENT subject (e.g. 3 different profiles),
 *    so a user flicking back and forth doesn't burn all three instantly
 *  - state is persisted, so it never reappears on that device
 */

const KEY = 'leenk.hints.v1'

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* storage full or blocked — hints just show again, harmless */
  }
}

export function getHint(id) {
  const all = readAll()
  return all[id] || { shows: 0, subjects: [], done: false }
}

/** Should this hint appear for this subject right now? */
export function shouldShowHint(id, subjectId, maxShows = 3) {
  const h = getHint(id)
  if (h.done || h.shows >= maxShows) return false
  // already used its slot on this subject → don't re-show for the same person
  if (subjectId != null && h.subjects.includes(subjectId)) return false
  return true
}

/** Record that the hint was shown for a subject. */
export function markHintShown(id, subjectId, maxShows = 3) {
  const all = readAll()
  const h = all[id] || { shows: 0, subjects: [], done: false }
  if (subjectId != null && h.subjects.includes(subjectId)) return
  h.shows += 1
  if (subjectId != null) h.subjects.push(subjectId)
  if (h.shows >= maxShows) h.done = true
  all[id] = h
  writeAll(all)
}

/** Dismiss permanently — e.g. the user performed the gesture themselves. */
export function completeHint(id) {
  const all = readAll()
  all[id] = { ...(all[id] || { shows: 0, subjects: [] }), done: true }
  writeAll(all)
}

export function resetHints() {
  writeAll({})
}
