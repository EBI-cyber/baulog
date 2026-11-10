import Dexie from 'dexie'
import { isoWoche, isoDatum, wochenKey } from './zeit'
import { ladeEinstellungen, speichereEinstellungen } from './settings'

// Alles bleibt auf dem Gerät (IndexedDB) — funktioniert auch ohne Netz.
export const db = new Dexie('rapport')
db.version(1).stores({
  // Schicht: { start, ende|null, pausen:[{start,ende|null}], pauseMin?, firma, notiz, datum, wocheKey }
  schichten: '++id, datum, wocheKey, start',
  // Woche: { key, gesendetAm?, gespeichertAm? }
  wochen: 'key',
})
db.version(2).stores({
  // Abwesenheit: { datum, wocheKey, art, stunden (angerechnet), halbtag, zeugnis, notiz }
  absenzen: '++id, datum, wocheKey',
  // Spesen: { datum, wocheKey, art, betrag, km, notiz }
  spesen: '++id, datum, wocheKey',
})
db.version(3).stores({
  // Einsatz (aus dem Einsatzvertrag): { firma, kanton, einsatzort, stundenlohn, …Prozente, fotos:[dataUrl] }
  einsaetze: '++id, firma',
})

// Browser bitten, die Daten nicht automatisch zu löschen
navigator.storage?.persist?.().catch(() => {})

/** datum + wocheKey immer aus dem Beginn ableiten */
export function mitSchluessel(s) {
  const d = new Date(s.start)
  return { ...s, datum: isoDatum(d), wocheKey: wochenKey(isoWoche(d)) }
}

/** für Abwesenheiten/Spesen: wocheKey aus dem Datum (YYYY-MM-DD) */
export function mitWoche(x) {
  return { ...x, wocheKey: wochenKey(isoWoche(new Date(x.datum + 'T12:00'))) }
}
export const speichereAbsenz = (a) => db.absenzen.put(mitWoche(a))
export const speichereSpesen = (x) => db.spesen.put(mitWoche(x))

export const speichern = (s) => (s.id ? db.schichten.put(mitSchluessel(s)) : db.schichten.add(mitSchluessel(s)))

export async function laufendeSchicht() {
  return (await db.schichten.filter((s) => s.ende == null).toArray()).sort((a, b) => b.start - a.start)[0]
}

export async function wocheMarkieren(key, feld) {
  const w = (await db.wochen.get(key)) || { key }
  await db.wochen.put({ ...w, [feld]: Date.now() })
}

export async function exportieren() {
  return { app: 'rapport', version: 3, exportiertAm: new Date().toISOString(),
    schichten: await db.schichten.toArray(), wochen: await db.wochen.toArray(),
    absenzen: await db.absenzen.toArray(), spesen: await db.spesen.toArray(), einsaetze: await db.einsaetze.toArray(),
    // Einstellungen inkl. Fragebogen und Unterschrift (ohne Microsoft-Anmeldung — die liegt getrennt)
    einstellungen: ladeEinstellungen() }
}

export async function importieren(daten) {
  if (daten?.app !== 'rapport') throw new Error('Keine Rapport-Sicherung')
  await db.transaction('rw', [db.schichten, db.wochen, db.absenzen, db.spesen, db.einsaetze], async () => {
    for (const t of ['schichten', 'wochen', 'absenzen', 'spesen', 'einsaetze']) {
      await db[t].clear(); await db[t].bulkAdd(daten[t] || [])
    }
  })
  if (daten.einstellungen) speichereEinstellungen({ ...ladeEinstellungen(), ...daten.einstellungen })
}
