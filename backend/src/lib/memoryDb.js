/**
 * Minimal Firestore-compatible in-memory store.
 *
 * Supports the subset the Leenk API actually uses:
 *   collection().doc().get/set/update/delete
 *   collection().add()
 *   collection().where().orderBy().limit().get()
 *   collection().doc().collection()  (subcollections)
 *   runTransaction / batch (sequential, non-atomic — dev only)
 *
 * This exists purely so the backend boots and every endpoint is exercisable
 * before the real Firebase project is provisioned. Swap in real Firestore by
 * setting FIREBASE_* env vars; no route code changes.
 */

const store = new Map() // path -> Map<docId, data>

const now = () => new Date().toISOString()
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

function coll(path) {
  if (!store.has(path)) store.set(path, new Map())
  return store.get(path)
}

function applyOps(existing = {}, patch = {}) {
  const out = { ...existing }
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('__increment' in v) { out[k] = (Number(out[k]) || 0) + v.__increment; continue }
      if ('__arrayUnion' in v) {
        const cur = Array.isArray(out[k]) ? out[k] : []
        out[k] = [...new Set([...cur, ...v.__arrayUnion])]
        continue
      }
      if ('__arrayRemove' in v) {
        const cur = Array.isArray(out[k]) ? out[k] : []
        out[k] = cur.filter((x) => !v.__arrayRemove.includes(x))
        continue
      }
      if ('__delete' in v) { delete out[k]; continue }
    }
    out[k] = v
  }
  return out
}

function snap(id, data, path) {
  return {
    id,
    exists: data !== undefined,
    data: () => clone(data),
    get: (f) => (data ? f.split('.').reduce((o, k) => o?.[k], data) : undefined),
    ref: docRef(path, id),
  }
}

function valueAt(obj, field) {
  return field.split('.').reduce((o, k) => o?.[k], obj)
}

function compare(a, op, b) {
  switch (op) {
    case '==': return a === b
    case '!=': return a !== b
    case '>': return a > b
    case '>=': return a >= b
    case '<': return a < b
    case '<=': return a <= b
    case 'in': return Array.isArray(b) && b.includes(a)
    case 'not-in': return Array.isArray(b) && !b.includes(a)
    case 'array-contains': return Array.isArray(a) && a.includes(b)
    case 'array-contains-any': return Array.isArray(a) && Array.isArray(b) && b.some((x) => a.includes(x))
    default: return false
  }
}

function queryRef(path, filters = [], orders = [], lim = null) {
  return {
    where: (field, op, value) => queryRef(path, [...filters, { field, op, value }], orders, lim),
    orderBy: (field, dir = 'asc') => queryRef(path, filters, [...orders, { field, dir }], lim),
    limit: (n) => queryRef(path, filters, orders, n),
    startAfter: () => queryRef(path, filters, orders, lim),
    select: () => queryRef(path, filters, orders, lim),
    get: async () => {
      let rows = [...coll(path).entries()].map(([id, data]) => ({ id, data }))
      for (const f of filters) rows = rows.filter((r) => compare(valueAt(r.data, f.field), f.op, f.value))
      for (const o of [...orders].reverse()) {
        rows.sort((a, b) => {
          const av = valueAt(a.data, o.field)
          const bv = valueAt(b.data, o.field)
          if (av === bv) return 0
          const res = av > bv ? 1 : -1
          return o.dir === 'desc' ? -res : res
        })
      }
      if (lim) rows = rows.slice(0, lim)
      const docs = rows.map((r) => snap(r.id, r.data, path))
      return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) }
    },
  }
}

function docRef(path, id) {
  return {
    id,
    path: `${path}/${id}`,
    get: async () => snap(id, coll(path).get(id), path),
    set: async (data, opts = {}) => {
      const prev = opts.merge ? coll(path).get(id) || {} : {}
      coll(path).set(id, applyOps(prev, clone(data)))
      return { writeTime: now() }
    },
    update: async (data) => {
      const prev = coll(path).get(id)
      if (prev === undefined) throw new Error(`NOT_FOUND: ${path}/${id}`)
      coll(path).set(id, applyOps(prev, clone(data)))
      return { writeTime: now() }
    },
    delete: async () => { coll(path).delete(id); return { writeTime: now() } },
    collection: (sub) => collectionRef(`${path}/${id}/${sub}`),
  }
}

function collectionRef(path) {
  const q = queryRef(path)
  return {
    ...q,
    doc: (id) => docRef(path, id || `auto_${Math.random().toString(36).slice(2, 12)}`),
    add: async (data) => {
      const id = `auto_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      coll(path).set(id, clone(data))
      return docRef(path, id)
    },
  }
}

export const memoryDb = {
  collection: collectionRef,
  doc: (fullPath) => {
    const parts = fullPath.split('/')
    const id = parts.pop()
    return docRef(parts.join('/'), id)
  },
  runTransaction: async (fn) => {
    const tx = {
      get: async (ref) => ref.get(),
      set: (ref, data, opts) => { ref.set(data, opts) },
      update: (ref, data) => { ref.update(data) },
      delete: (ref) => { ref.delete() },
    }
    return fn(tx)
  },
  batch: () => {
    const ops = []
    return {
      set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
      update: (ref, data) => ops.push(() => ref.update(data)),
      delete: (ref) => ops.push(() => ref.delete()),
      commit: async () => { for (const op of ops) await op() },
    }
  },
  __reset: () => store.clear(),
  __dump: () => Object.fromEntries([...store.entries()].map(([k, v]) => [k, Object.fromEntries(v)])),
}
