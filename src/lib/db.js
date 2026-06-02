import Dexie from 'dexie'

export const db = new Dexie('baulog')
db.version(1).stores({
  projekte: '++id, name, status, createdAt',
  eintraege: '++id, projektId, type, gewerk, createdAt',
})

export async function createProjekt(p) {
  return db.projekte.add({ status: 'aktiv', createdAt: new Date().toISOString(), ...p })
}
export async function listProjekte() {
  return db.projekte.orderBy('createdAt').reverse().toArray()
}
export async function getProjekt(id) {
  return db.projekte.get(Number(id))
}
export async function updateProjekt(id, patch) {
  return db.projekte.update(Number(id), patch)
}
export async function deleteProjekt(id) {
  await db.eintraege.where('projektId').equals(Number(id)).delete()
  await db.projekte.delete(Number(id))
}

export async function addEintrag(e) {
  return db.eintraege.add({ createdAt: new Date().toISOString(), ...e })
}
export async function listEintraege(projektId) {
  const arr = await db.eintraege.where('projektId').equals(Number(projektId)).toArray()
  return arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}
export async function deleteEintrag(id) {
  return db.eintraege.delete(Number(id))
}
export async function allEintraege() {
  return db.eintraege.toArray()
}
