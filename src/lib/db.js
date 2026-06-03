import Dexie from 'dexie'

export const db = new Dexie('baulog')
db.version(1).stores({
  projekte: '++id, name, status, createdAt',
  eintraege: '++id, projektId, type, gewerk, createdAt',
})
db.version(2).stores({
  projekte: '++id, token, name, status, createdAt, synced',
  eintraege: '++id, token, projektId, projektToken, type, gewerk, createdAt, synced',
}).upgrade(async (tx) => {
  const ps = await tx.table('projekte').toArray()
  for (const p of ps) if (!p.token) await tx.table('projekte').update(p.id, { token: crypto.randomUUID(), synced: 0 })
  const ps2 = await tx.table('projekte').toArray()
  const tokenById = {}; ps2.forEach((p) => { tokenById[p.id] = p.token })
  const es = await tx.table('eintraege').toArray()
  for (const e of es) {
    const patch = { synced: 0 }
    if (!e.token) patch.token = crypto.randomUUID()
    if (!e.projektToken) patch.projektToken = tokenById[e.projektId] || null
    await tx.table('eintraege').update(e.id, patch)
  }
})

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2))

export async function createProjekt(p) {
  return db.projekte.add({ status: 'aktiv', ...p, token: uuid(), createdAt: new Date().toISOString(), synced: 0 })
}
export async function listProjekte() { return db.projekte.orderBy('createdAt').reverse().toArray() }
export async function getProjekt(id) { return db.projekte.get(Number(id)) }
export async function updateProjekt(id, patch) { return db.projekte.update(Number(id), { ...patch, synced: 0 }) }
export async function deleteProjekt(id) {
  await db.eintraege.where('projektId').equals(Number(id)).delete()
  await db.projekte.delete(Number(id))
}

export async function addEintrag(e) {
  const proj = await db.projekte.get(Number(e.projektId))
  return db.eintraege.add({ ...e, token: uuid(), projektToken: proj ? proj.token : null, createdAt: e.createdAt || new Date().toISOString(), synced: 0 })
}
export async function listEintraege(projektId) {
  const arr = await db.eintraege.where('projektId').equals(Number(projektId)).toArray()
  return arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}
export async function deleteEintrag(id) { return db.eintraege.delete(Number(id)) }
export async function allEintraege() { return db.eintraege.toArray() }
export async function projektMap() { const ps = await db.projekte.toArray(); const m = {}; ps.forEach((p) => { m[p.token] = p.owner }); return m }

// --- Cloud-Sync-Helfer ---
export async function pendingProjekte() { return (await db.projekte.toArray()).filter((p) => !p.synced) }
export async function pendingEintraege() { return (await db.eintraege.toArray()).filter((e) => !e.synced) }
export async function markProjektSynced(token) { const p = await db.projekte.where('token').equals(token).first(); if (p) await db.projekte.update(p.id, { synced: 1 }) }
export async function markEintragSynced(token) { const e = await db.eintraege.where('token').equals(token).first(); if (e) await db.eintraege.update(e.id, { synced: 1 }) }

export async function upsertProjekteFromCloud(list) {
  for (const p of list) {
    const ex = await db.projekte.where('token').equals(p.token).first()
    if (ex) await db.projekte.update(ex.id, { ...p, synced: 1 })
    else await db.projekte.add({ ...p, synced: 1 })
  }
}
export async function upsertEintraegeFromCloud(list) {
  const projs = await db.projekte.toArray()
  const idByToken = {}; projs.forEach((p) => { idByToken[p.token] = p.id })
  for (const e of list) {
    const projektId = idByToken[e.projektToken] || e.projektId || null
    const ex = await db.eintraege.where('token').equals(e.token).first()
    const row = { ...e, projektId, synced: 1 }
    if (ex) await db.eintraege.update(ex.id, row)
    else await db.eintraege.add(row)
  }
}
