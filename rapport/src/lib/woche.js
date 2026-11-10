import { arbeitMs } from './zeit'
import { absenzArt } from './arten'
import { zahl } from './settings'

/** Alle Wochenzahlen an einem Ort (für Bildschirm und PDF). Stunden als Zahl. */
export function wochenRechnung({ schichten = [], absenzen = [], spesen = [], einst, jetzt = Date.now() }) {
  const arbeit = schichten.reduce((a, s) => a + arbeitMs(s, jetzt), 0) / 3600000
  const nachArt = {}
  for (const x of absenzen) {
    const k = absenzArt(x.art).label
    nachArt[k] = (nachArt[k] || 0) + (x.halbtag ? 0.5 : 1)
  }
  const absenzStd = absenzen.reduce((a, x) => a + zahl(x.stunden), 0)
  const total = arbeit + absenzStd
  const soll = zahl(einst?.wochenSoll)
  return {
    arbeit, absenzStd, total, nachArt,
    soll: soll || null,
    differenz: soll ? total - soll : null,
    spesen: spesen.reduce((a, x) => a + zahl(x.betrag), 0),
  }
}

/** Stunden (Zahl) → "8:24" */
export function std(h) {
  const neg = h < 0, min = Math.round(Math.abs(h) * 60)
  return `${neg ? '-' : ''}${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}
export const betrag = (v, w = 'CHF') => `${w} ${zahl(v).toFixed(2)}`
