import { zahl } from './settings'
import { feiertagAm } from './feiertage'
import { absenzArt } from './arten'
import { isoDatum, arbeitMs } from './zeit'

/**
 * Ist/Soll für [von, bis] (YYYY-MM-DD, bis höchstens heute).
 * Soll = Werktage (Mo–Fr) ab Einsatzbeginn bzw. erster Schicht, ohne Feiertage (Kanton) und unbezahlte
 * Abwesenheiten (ausser Kompensation), × Wochenstunden / 5. Heute zählt erst, wenn etwas eingetragen ist.
 * Ist = Arbeitszeit + angerechnete Abwesenheitsstunden.
 */
export function sollIst({ von, bis, schichten, absenzen, einsaetze = [], einst, kanton, ersterTag, jetzt = Date.now() }) {
  const heuteIso = isoDatum(new Date())
  const imZeitraum = (d) => d >= von && d <= bis
  const sch = schichten.filter((s) => imZeitraum(s.datum))
  const abw = absenzen.filter((a) => imZeitraum(a.datum))
  const arbeit = sch.reduce((s, x) => s + arbeitMs(x, jetzt), 0) / 36e5
  const abwBezahlt = abw.reduce((s, a) => s + zahl(a.stunden), 0)
  const firma = [...sch].sort((a, b) => a.start - b.start).pop()?.firma || einst.firma
  const einsatz = einsaetze.find((e) => e.firma === firma)
  const wochenStd = zahl(einsatz?.wochenstunden) || zahl(einst.wochenSoll)
  const tagSoll = (wochenStd || 40) / 5
  const start = [von, einsatz?.beginn, ersterTag].filter(Boolean).sort().pop()
  const hatEintrag = (d) => sch.some((s) => s.datum === d && s.ende != null) || abw.some((a) => a.datum === d)
  let sollTage = 0
  const luecken = []
  for (const d = new Date(start + 'T12:00'), e = new Date(bis + 'T12:00'); d <= e; d.setDate(d.getDate() + 1)) {
    const iso = isoDatum(d)
    if (d.getDay() === 0 || d.getDay() === 6 || feiertagAm(kanton, iso)) continue
    if (iso === heuteIso && !hatEintrag(iso)) continue
    const frei = abw.find((a) => a.datum === iso && !absenzArt(a.art).bezahlt && a.art !== 'kompensation')
    if (frei) { sollTage += frei.halbtag ? 0.5 : 0; continue }
    sollTage += 1
    if (iso < heuteIso && !hatEintrag(iso)) luecken.push(new Date(d))
  }
  const soll = sollTage * tagSoll
  const ist = arbeit + abwBezahlt
  const nachArt = {}
  for (const a of abw) { const art = absenzArt(a.art); const k = art.kurz || art.label; nachArt[k] = (nachArt[k] || 0) + (a.halbtag ? 0.5 : 1) }
  return { arbeit, abwBezahlt, ist, soll, saldo: ist - soll, sollTage, tagSoll, sollAngenommen: !wochenStd, luecken, einsatz,
    tage: new Set(sch.map((s) => s.datum)).size, nachArt, hatEintrag }
}
