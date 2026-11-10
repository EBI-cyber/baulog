import Dexie from 'dexie'
import { isoWoche, isoDatum, wochenKey } from './zeit'

// Alles bleibt auf dem Gerät (IndexedDB) — funktioniert auch ohne Netz.
export const db = new Dexie('rapport')
db.version(1).stores({
  // Schicht: { start, ende|null, pausen:[{start,ende|null}], pauseMin?, firma, notiz, datum, wocheKey }
  schichten: '++id, datum, wocheKey, start',
  // Woche: { key, gesendetAm?, gespeichertAm? }
  wochen: 'key',
})

// Browser bitten, die Daten nicht automatisch zu löschen
navigator.storage?.persist?.().catch(() => {})

/** datum + wocheKey immer aus dem Beginn ableiten */
export function mitSchluessel(s) {
  const d = new Date(s.start)
  return { ...s, datum: isoDatum(d), wocheKey: wochenKey(isoWoche(d)) }
}

export const speichern = (s) => (s.id ? db.schichten.put(mitSchluessel(s)) : db.schichten.add(mitSchluessel(s)))

export async function laufendeSchicht() {
  return (await db.schichten.filter((s) => s.ende == null).toArray()).sort((a, b) => b.start - a.start)[0]
}

export async function wocheMarkieren(key, feld) {
  const w = (await db.wochen.get(key)) || { key }
  await db.wochen.put({ ...w, [feld]: Date.now() })
}

export async function exportieren() {
  return { app: 'rapport', version: 1, exportiertAm: new Date().toISOString(),
    schichten: await db.schichten.toArray(), wochen: await db.wochen.toArray() }
}

export async function importieren(daten) {
  if (daten?.app !== 'rapport') throw new Error('Keine Rapport-Sicherung')
  await db.transaction('rw', db.schichten, db.wochen, async () => {
    await db.schichten.clear(); await db.wochen.clear()
    await db.schichten.bulkAdd(daten.schichten || []); await db.wochen.bulkAdd(daten.wochen || [])
  })
}
