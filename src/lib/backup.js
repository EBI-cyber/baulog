import { db, notifyLocalChange } from './db'
import { loadSettings } from './settings'

// Datensicherung: kompletter Stand (Projekte, Einträge inkl. Fotos, Abschnitte/Zahlungen).
// - automatische Sicherungen im Gerät (täglich + vor jedem Löschen), die letzten MAX bleiben
// - Sicherung als Datei zum Ablegen außerhalb der App
// - Zurückspielen: Datensätze aus der Sicherung ersetzen den aktuellen Stand und gehen per Sync in die Cloud.
//   Was nach der Sicherung neu angelegt wurde, bleibt erhalten (es wird nichts gelöscht).

const MAX = 15
const TABELLEN = ['projekte', 'eintraege', 'rechnungen']

export async function stand() {
  const out = { app: 'BauLog', version: 1, createdAt: new Date().toISOString(), settings: loadSettings() }
  for (const t of TABELLEN) out[t] = await db[t].toArray()
  return out
}

export async function sicherungAnlegen(grund) {
  const daten = await stand()
  const id = await db.sicherungen.add({ createdAt: daten.createdAt, grund, anzahl: zaehlen(daten), daten })
  const alle = await db.sicherungen.orderBy('createdAt').toArray()
  for (const alt of alle.slice(0, Math.max(0, alle.length - MAX))) await db.sicherungen.delete(alt.id)
  return id
}

// Einmal pro Tag automatisch sichern
export async function taeglicheSicherung() {
  const letzte = await db.sicherungen.orderBy('createdAt').last()
  if (letzte && Date.now() - new Date(letzte.createdAt).getTime() < 20 * 3600 * 1000) return
  if ((await db.projekte.count()) === 0) return
  await sicherungAnlegen('Tägliche Sicherung')
}

export async function listeSicherungen() {
  const alle = await db.sicherungen.orderBy('createdAt').reverse().toArray()
  return alle.map(({ id, createdAt, grund, anzahl }) => ({ id, createdAt, grund, anzahl }))
}

export async function sicherungLesen(id) { return (await db.sicherungen.get(Number(id)))?.daten }

export function zaehlen(d) {
  return { projekte: (d.projekte || []).length, eintraege: (d.eintraege || []).length, rechnungen: (d.rechnungen || []).length }
}

export function dateiname(d) {
  return 'BauLog-Sicherung-' + String(d.createdAt).slice(0, 16).replace('T', '_').replace(':', '-') + '.json'
}

export function pruefen(d) {
  if (!d || d.app !== 'BauLog' || !Array.isArray(d.projekte) || !Array.isArray(d.eintraege)) throw new Error('Das ist keine BauLog-Sicherung.')
  return d
}

export async function zurueckspielen(d) {
  pruefen(d)
  await sicherungAnlegen('Vor dem Zurückspielen')
  await db.transaction('rw', db.projekte, db.eintraege, db.rechnungen, db.geloescht, async () => {
    const idByToken = {}
    for (const p of d.projekte) {
      const { id, ...row } = p
      const ex = p.token ? await db.projekte.where('token').equals(p.token).first() : null
      if (ex) { await db.projekte.put({ ...row, id: ex.id, synced: 0 }); idByToken[p.token] = ex.id }
      else idByToken[p.token] = await db.projekte.add({ ...row, synced: 0 })
      if (p.token) await db.geloescht.where('[tabelle+token]').equals(['projekte', p.token]).delete()
    }
    for (const t of ['eintraege', 'rechnungen']) {
      for (const e of d[t] || []) {
        const { id, ...row } = e
        row.projektId = idByToken[e.projektToken] ?? e.projektId
        const ex = e.token ? await db[t].where('token').equals(e.token).first() : null
        if (ex) await db[t].put({ ...row, id: ex.id, synced: 0 })
        else await db[t].add({ ...row, synced: 0 })
        if (e.token) await db.geloescht.where('[tabelle+token]').equals([t, e.token]).delete()
      }
    }
  })
  notifyLocalChange()
}
