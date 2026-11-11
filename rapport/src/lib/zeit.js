// Zeit- und Kalenderwochen-Helfer (ISO 8601: Woche beginnt Montag, KW 1 enthält den 4. Januar)

export const TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export const TAGE_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

const p2 = (n) => String(n).padStart(2, '0')

export function isoWoche(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const tag = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - tag)
  const jahr = t.getUTCFullYear()
  const kw = Math.ceil(((t - Date.UTC(jahr, 0, 1)) / 864e5 + 1) / 7)
  return { jahr, kw }
}

export const wochenKey = ({ jahr, kw }) => `${jahr}-W${p2(kw)}`
export function ausKey(key) {
  const m = /^(\d{4})-W(\d{2})$/.exec(key || '')
  return m ? { jahr: +m[1], kw: +m[2] } : null
}

/** Montag 00:00 (lokal) der ISO-Woche */
export function wochenStart({ jahr, kw }) {
  const jan4 = new Date(jahr, 0, 4)
  const mo = new Date(jahr, 0, 4 - (jan4.getDay() || 7) + 1)
  mo.setDate(mo.getDate() + (kw - 1) * 7)
  return mo
}

export function wocheVersetzt(w, delta) {
  const d = wochenStart(w)
  d.setDate(d.getDate() + 7 * delta + 3)
  return isoWoche(d)
}

/** Die 7 Tage (Mo–So) einer Woche als Date */
export function wochenTage(w) {
  const mo = wochenStart(w)
  return Array.from({ length: 7 }, (_, i) => new Date(mo.getFullYear(), mo.getMonth(), mo.getDate() + i))
}

export const isoDatum = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const datumKurz = (d) => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.`
export const datumLang = (d) => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`
export const uhr = (ts) => { const d = new Date(ts); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }

export function pauseMs(s, jetzt = Date.now()) {
  if (s.pauseMin != null) return s.pauseMin * 60000
  return (s.pausen || []).reduce((sum, p) => sum + Math.max(0, (p.ende ?? jetzt) - p.start), 0)
}

export function arbeitMs(s, jetzt = Date.now()) {
  return Math.max(0, (s.ende ?? jetzt) - s.start - pauseMs(s, jetzt))
}

export const istPausiert = (s) => !!s && s.ende == null && (s.pausen || []).some((p) => p.ende == null)

/** 8:05 */
export function hm(ms) {
  const min = Math.round(ms / 60000)
  return `${Math.floor(min / 60)}:${p2(min % 60)}`
}
/** 8.08 (Industriestunden) */
export const dezimal = (ms) => (Math.round(ms / 60000) / 60).toFixed(2)
/** 08:05:12 */
export function hms(ms) {
  const s = Math.floor(ms / 1000)
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`
}

/** Arbeitsblöcke einer Schicht: [[von, bis], …] — Lücken = gestoppte Pausen (nur Pausen mit Zeitpunkten) */
export function bloecke(s) {
  if (s.ende == null) return [[s.start, null]]
  const p = s.pauseMin == null ? (s.pausen || []).filter((x) => x.start && x.ende && x.ende > x.start).sort((a, b) => a.start - b.start) : []
  const out = []
  let a = s.start
  for (const x of p) { if (x.start > a) out.push([a, x.start]); a = Math.max(a, x.ende) }
  out.push([a, s.ende])
  return out
}
