import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { lohnBerechnen, erweitert } from './lohn'

/** Live-Lohn für [von, bis] (YYYY-MM-DD). jetzt = für laufende Schichten. */
export function useLohn(von, bis, einst, jetzt) {
  const daten = useLiveQuery(async () => {
    const [a, b] = erweitert(von, bis)
    return {
      schichten: await db.schichten.where('datum').between(a, b, true, true).toArray(),
      absenzen: await db.absenzen.where('datum').between(a, b, true, true).toArray(),
      spesen: await db.spesen.where('datum').between(von, bis, true, true).toArray(),
      einsaetze: await db.einsaetze.toArray(),
    }
  }, [von, bis], null)
  if (!daten) return null
  return lohnBerechnen({ ...daten, einst, von, bis, jetzt })
}
