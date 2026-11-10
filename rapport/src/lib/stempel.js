import { supabase } from './ki'
import { speichern, laufendeSchicht } from './db'
import { ladeEinstellungen, speichereEinstellungen } from './settings'
import { pauseMs } from './zeit'
import { mindestPause } from './profil'

// Stempeln per iPhone-Kurzbefehl (Rückseite doppelt/dreifach tippen, Siri, Ort) über die Edge Function „rapport-stempel“.

const basis = import.meta.env.VITE_SUPABASE_URL
export const stempelVerfuegbar = !!(basis && supabase)

export function schluessel(neu = false) {
  const e = ladeEinstellungen()
  if (e.stempelKey && !neu) return e.stempelKey
  const k = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('')
  speichereEinstellungen({ ...e, stempelKey: k, stempelAktiv: true })
  return k
}
export const stempelUrl = (aktion) => `${basis}/functions/v1/rapport-stempel?k=${schluessel()}&a=${aktion}`

const aktiv = () => stempelVerfuegbar && ladeEinstellungen().stempelAktiv && ladeEinstellungen().stempelKey

async function aufruf(body) {
  const { data, error } = await supabase.functions.invoke('rapport-stempel', { body: { k: ladeEinstellungen().stempelKey, ...body } })
  if (error) throw error
  return data
}

/** App meldet ihren Zustand, damit „umschalten“ im Kurzbefehl stimmt */
export function zustandMelden(zustand) {
  if (aktiv()) aufruf({ task: 'zustand', zustand }).catch(() => {})
}

/**
 * Schicht beenden (gemeinsam für den Knopf und den Kurzbefehl).
 * Ohne erfasste Pause und mit Pausen-Automatik: Mindestpause nach ArG eintragen und „pausePruefen“ setzen,
 * damit die App nach der wirklichen Pause fragt.
 */
export function schichtBeenden(laufend, n, einst) {
  const fertig = { ...laufend, ende: n, pausen: (laufend.pausen || []).map((p) => (p.ende == null ? { ...p, ende: n } : p)) }
  const pause = pauseMs(fertig) / 60000, arbeit = (n - fertig.start) / 60000 - pause
  const soll = mindestPause(arbeit)
  if (pause < soll) {
    fertig.pausePruefen = true
    if (einst.profil?.mindestpause !== false) { fertig.pauseMin = soll; fertig.pauseAuto = Math.round(pause) }
  }
  return fertig
}

let laeuft = false
/** Ereignisse vom Kurzbefehl holen und mit ihrer Uhrzeit übernehmen. Gibt die Anzahl zurück. */
export async function ereignisseAbholen() {
  if (laeuft || !aktiv() || !navigator.onLine) return 0
  laeuft = true
  try {
    const { ereignisse = [] } = await aufruf({ task: 'abholen' })
    const einst = ladeEinstellungen()
    for (const ev of ereignisse) {
      const t = Date.parse(ev.zeit)
      const l = await laufendeSchicht()
      if (ev.aktion === 'start' && !l && einst.firma) {
        await speichern({ start: t, ende: null, pausen: [], firma: einst.firma, notiz: '', quelle: 'kurzbefehl' })
      } else if (ev.aktion === 'pause' && l && !(l.pausen || []).some((p) => p.ende == null)) {
        await speichern({ ...l, pausen: [...(l.pausen || []), { start: t, ende: null }] })
      } else if (ev.aktion === 'weiter' && l) {
        await speichern({ ...l, pausen: (l.pausen || []).map((p) => (p.ende == null ? { ...p, ende: t } : p)) })
      } else if (ev.aktion === 'stopp' && l) {
        await speichern(schichtBeenden(l, t, einst))
      }
    }
    // Zustand abgleichen (falls ein Ereignis nicht passte)
    const l = await laufendeSchicht()
    zustandMelden(!l ? 'aus' : (l.pausen || []).some((p) => p.ende == null) ? 'pause' : 'arbeit')
    return ereignisse.length
  } catch { return 0 } finally { laeuft = false }
}

export function abholenStarten() {
  const los = () => { if (document.visibilityState === 'visible') ereignisseAbholen() }
  setTimeout(los, 800)
  document.addEventListener('visibilitychange', los)
  window.addEventListener('online', los)
  setInterval(los, 20000)
}
