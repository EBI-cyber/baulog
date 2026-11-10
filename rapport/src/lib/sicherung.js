import { db, exportieren } from './db'
import { ladeEinstellungen, speichereEinstellungen } from './settings'
import { msVerbunden, msVersand } from './microsoft'
import { isoDatum } from './zeit'

// Automatische Datensicherung in OneDrive (Ordner „Rapporte/Sicherung“): wöchentlich und nach jedem Wochenabschluss.
export const SICHERUNG_ORDNER = 'Rapporte/Sicherung'

export async function hatDaten() {
  return (await db.schichten.count()) + (await db.absenzen.count()) + (await db.einsaetze.count()) > 0
}

export async function sicherungsDatei() {
  const daten = await exportieren()
  return { name: `Rapport-Sicherung_${isoDatum(new Date())}.json`, blob: new Blob([JSON.stringify(daten)], { type: 'application/json' }) }
}

/** Jetzt in OneDrive sichern. Gibt { ok, pfad } oder wirft. */
export async function inOneDriveSichern() {
  const datei = await sicherungsDatei()
  const r = await msVersand({ datei, onedrive: { ordner: SICHERUNG_ORDNER } })
  if (!r.onedrive?.ok) throw new Error(String(r.onedrive?.fehler || 'OneDrive-Fehler'))
  speichereEinstellungen({ ...ladeEinstellungen(), letzteSicherung: Date.now(), letzteSicherungPfad: r.onedrive.pfad })
  return r.onedrive
}

let laeuft = false
/** Automatisch, wenn die letzte Sicherung älter als 7 Tage ist (oder erzwingen) */
export async function automatischSichern(erzwingen = false) {
  if (laeuft || !msVerbunden() || !navigator.onLine) return
  const e = ladeEinstellungen()
  if (!erzwingen && e.letzteSicherung && Date.now() - e.letzteSicherung < 7 * 864e5) return
  if (!(await hatDaten())) return
  laeuft = true
  try { await inOneDriveSichern() } catch { /* nächster Versuch beim nächsten Öffnen */ } finally { laeuft = false }
}

/** Tage seit der letzten Sicherung (null = noch nie) */
export function tageSeitSicherung() {
  const t = ladeEinstellungen().letzteSicherung
  return t ? Math.floor((Date.now() - t) / 864e5) : null
}
