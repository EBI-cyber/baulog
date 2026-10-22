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
db.version(3).stores({
  rechnungen: '++id, token, projektId, projektToken, bezahlt, createdAt, synced',
})
// Gelöschte Datensätze merken, bis die Löschung in der Cloud angekommen ist
db.version(4).stores({
  geloescht: '++id, &[tabelle+token]',
})
// Automatische Datensicherungen im Gerät (siehe lib/backup.js)
db.version(5).stores({
  sicherungen: '++id, createdAt',
})

// Jede lokale Änderung meldet sich hier, damit der Cloud-Sync sofort anlaufen kann
const listeners = new Set()
export function onLocalChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function changed() { listeners.forEach((fn) => { try { fn() } catch {} }) }
export const notifyLocalChange = changed
async function tombstone(tabelle, token) {
  if (token) await db.geloescht.put({ tabelle, token })
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2))

export async function createProjekt(p) {
  const id = await db.projekte.add({ status: 'aktiv', ...p, token: uuid(), createdAt: new Date().toISOString(), synced: 0 })
  changed(); return id
}
export async function listProjekte() { return db.projekte.orderBy('createdAt').reverse().toArray() }
export async function getProjekt(id) { return db.projekte.get(Number(id)) }
export async function updateProjekt(id, patch) { const r = await db.projekte.update(Number(id), { ...patch, synced: 0 }); changed(); return r }
// Vor jedem Löschen von Projekt oder Abschnitt den Stand sichern (lib/backup.js)
async function sichernVorLoeschen(was) {
  try { await (await import('./backup')).sicherungAnlegen('Vor dem Löschen: ' + was) } catch (e) { console.warn('Sicherung fehlgeschlagen', e) }
}

export async function deleteProjekt(id) {
  const p = await db.projekte.get(Number(id))
  await sichernVorLoeschen('Projekt ' + (p ? p.name : id))
  const es = await db.eintraege.where('projektId').equals(Number(id)).toArray()
  for (const e of es) await tombstone('eintraege', e.token)
  if (p) await tombstone('projekte', p.token)
  await db.eintraege.where('projektId').equals(Number(id)).delete()
  await db.projekte.delete(Number(id))
  changed()
}

export async function addEintrag(e) {
  const proj = await db.projekte.get(Number(e.projektId))
  const id = await db.eintraege.add({ ...e, token: uuid(), projektToken: proj ? proj.token : null, createdAt: e.createdAt || new Date().toISOString(), synced: 0 })
  changed(); return id
}
export async function listEintraege(projektId) {
  const arr = await db.eintraege.where('projektId').equals(Number(projektId)).toArray()
  return arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}
export async function updateEintrag(id, patch) { const r = await db.eintraege.update(Number(id), { ...patch, synced: 0 }); changed(); return r }
export async function deleteEintrag(id) {
  const e = await db.eintraege.get(Number(id))
  if (e) await tombstone('eintraege', e.token)
  await db.eintraege.delete(Number(id)); changed()
}
export async function allEintraege() { return db.eintraege.toArray() }
export async function projektMap() { const ps = await db.projekte.toArray(); const m = {}; ps.forEach((p) => { m[p.token] = p.owner }); return m }

export async function createRechnung(r) {
  const proj = await db.projekte.get(Number(r.projektId))
  const id = await db.rechnungen.add({ bezahlt: 0, ...r, projektToken: proj ? proj.token : r.projektToken, token: uuid(), createdAt: r.createdAt || new Date().toISOString(), synced: 0 })
  changed(); return id
}
export async function listRechnungen(projektId) {
  const arr = await db.rechnungen.where('projektId').equals(Number(projektId)).toArray()
  return arr.sort((a, b) => String(b.von || b.createdAt).localeCompare(String(a.von || a.createdAt)))
}
export async function updateRechnung(id, patch) { const r = await db.rechnungen.update(Number(id), { ...patch, synced: 0 }); changed(); return r }
export async function deleteRechnung(id) {
  const r = await db.rechnungen.get(Number(id))
  await sichernVorLoeschen('Abschlag ' + (r && r.nr != null ? r.nr : id))
  if (r) await tombstone('rechnungen', r.token)
  await db.rechnungen.delete(Number(id)); changed()
}
export async function allRechnungen() { return db.rechnungen.toArray() }

// --- Cloud-Sync-Helfer ---
export async function pendingProjekte() { return (await db.projekte.toArray()).filter((p) => !p.synced) }
export async function pendingEintraege() { return (await db.eintraege.toArray()).filter((e) => !e.synced) }
export async function pendingRechnungen() { return (await db.rechnungen.toArray()).filter((r) => !r.synced) }
export async function pendingLoeschungen() { return db.geloescht.toArray() }
export async function loeschungErledigt(tabelle, token) { await db.geloescht.where('[tabelle+token]').equals([tabelle, token]).delete() }
export async function pendingCount() {
  const [p, e, r, g] = await Promise.all([pendingProjekte(), pendingEintraege(), pendingRechnungen(), pendingLoeschungen()])
  return p.length + e.length + r.length + g.length
}
// Nur als synchron markieren, wenn sich der Datensatz seit dem Hochladen nicht erneut geändert hat
async function markSynced(table, row) {
  const ex = await db[table].where('token').equals(row.token).first()
  if (ex && !ex.synced && JSON.stringify({ ...ex, synced: 0 }) === JSON.stringify({ ...row, synced: 0 })) await db[table].update(ex.id, { synced: 1 })
}
export const markProjektSynced = (row) => markSynced('projekte', row)
export const markEintragSynced = (row) => markSynced('eintraege', row)
export const markRechnungSynced = (row) => markSynced('rechnungen', row)

// Cloud-Stand übernehmen. Lokale, noch nicht hochgeladene Änderungen und lokal gelöschte Datensätze
// werden dabei nie überschrieben. Datensätze, die in der Cloud gelöscht wurden, verschwinden auch lokal.
// Rückgabe: true, wenn sich lokal etwas geändert hat.
async function mergeFromCloud(table, tabelle, list, withProjektId) {
  let geaendert = false
  const deleted = new Set((await db.geloescht.where('tabelle').equals(tabelle).toArray()).map((g) => g.token))
  const idByToken = {}
  if (withProjektId) (await db.projekte.toArray()).forEach((p) => { idByToken[p.token] = p.id })
  const cloudTokens = new Set()
  for (const item of list) {
    cloudTokens.add(item.token)
    if (deleted.has(item.token)) continue
    const ex = await db[table].where('token').equals(item.token).first()
    if (ex && !ex.synced) continue
    const row = { ...item, synced: 1 }
    if (withProjektId) row.projektId = idByToken[item.projektToken] || item.projektId || (ex && ex.projektId) || null
    if (ex) {
      const same = Object.keys(row).every((k) => JSON.stringify(row[k] ?? null) === JSON.stringify(ex[k] ?? null))
      if (!same) { await db[table].update(ex.id, row); geaendert = true }
    } else { await db[table].add(row); geaendert = true }
  }
  // Synchronisierte Datensätze, die es in der Cloud nicht mehr gibt, wurden woanders gelöscht
  const lokal = await db[table].toArray()
  for (const ex of lokal) {
    if (ex.synced && ex.token && !cloudTokens.has(ex.token)) { await db[table].delete(ex.id); geaendert = true }
  }
  return geaendert
}
export const mergeProjekteFromCloud = (list) => mergeFromCloud('projekte', 'projekte', list, false)
export const mergeEintraegeFromCloud = (list) => mergeFromCloud('eintraege', 'eintraege', list, true)
export const mergeRechnungenFromCloud = (list) => mergeFromCloud('rechnungen', 'rechnungen', list, true)
