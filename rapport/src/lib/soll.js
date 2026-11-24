import { zahl } from './settings'
import { feiertagAm } from './feiertage'
import { absenzArt } from './arten'
import { isoDatum, arbeitMs } from './zeit'

/**
 * Ist/Soll für [von, bis] (YYYY-MM-DD, bis höchstens heute).
 * Soll = Werktage (Mo–Fr) ab Einsatzbeginn bzw. erster Schicht, ohne Feiertage (Kanton) und unbezahlte
 * Abwesenheiten (ausser Kompensation), × Wochenstunden / 5. Heute zählt erst, wenn etwas eingetragen ist.
 * Ist = Arbeitszeit + angerechnete Abwesenheitsstunden. saldo = Überstunden (≥ 0, wochenweise über den Wochenstunden).
 */
export function sollIst({ von, bis, schichten, absenzen, einsaetze = [], einst, kanton, ersterTag, jetzt = Date.now() }) {
  const heuteIso = isoDatum(new Date())
  const imZeitraum = (d) => d >= von && d <= bis
  const sch = schichten.filter((s) => imZeitraum(s.datum))
  const abw = absenzen.filter((a) => imZeitraum(a.datum))
  const arbeit = sch.reduce((s, x) => s + arbeitMs(x, jetzt), 0) / 36e5
  const firma = [...sch].sort((a, b) => a.start - b.start).pop()?.firma || einst.firma
  const einsatz = einsaetze.find((e) => e.firma === firma)
  const wochenStd = zahl(einsatz?.wochenstunden) || zahl(einst.wochenSoll)
  const tagSoll = (wochenStd || 40) / 5
  // nur bezahlte Abwesenheiten zählen zum Ist (unbezahlte Tage fallen dafür aus dem Soll) — und höchstens mit dem
  // Tagessoll: ein Krankheitstag mit Ø 8.46 h (Lohnausfallprinzip, nur für den Lohn) darf keine Überstunden erzeugen
  const abwBezahlt = abw.filter((a) => absenzArt(a.art).bezahlt).reduce((s, a) => s + Math.min(zahl(a.stunden), tagSoll * (a.halbtag ? 0.5 : 1)), 0)
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
  // Temporär: keine Minusstunden — bezahlt wird jede Stunde. Die Wochenstunden laut Vertrag legen nur fest, ab wann
  // eine Stunde als Überstunde zählt: pro Kalenderwoche max(0, Arbeit + bezahlte Abwesenheit − Wochenstunden).
  // Eine Woche gehört zum Zeitraum, in dem ihr Donnerstag liegt.
  const ueberWochen = []
  const mo = new Date(von + 'T12:00'); mo.setDate(mo.getDate() - ((mo.getDay() + 6) % 7))
  for (; isoDatum(mo) <= bis; mo.setDate(mo.getDate() + 7)) {
    const doIso = isoDatum(new Date(mo.getFullYear(), mo.getMonth(), mo.getDate() + 3, 12))
    if (doIso < von || doIso > bis) continue
    const a0 = isoDatum(mo), a1 = isoDatum(new Date(mo.getFullYear(), mo.getMonth(), mo.getDate() + 6, 12))
    const inW = (d) => d >= a0 && d <= a1
    const wArbeit = schichten.filter((x) => inW(x.datum)).reduce((t, x) => t + arbeitMs(x, jetzt), 0) / 36e5
    const wAbw = absenzen.filter((x) => inW(x.datum) && absenzArt(x.art).bezahlt).reduce((t, x) => t + Math.min(zahl(x.stunden), tagSoll * (x.halbtag ? 0.5 : 1)), 0)
    if (wArbeit + wAbw <= 0) continue
    ueberWochen.push({ von: a0, bis: a1, ist: wArbeit + wAbw, grenze: wochenStd || 40, ueber: Math.max(0, wArbeit + wAbw - (wochenStd || 40)) })
  }
  const ueber = ueberWochen.reduce((t, w) => t + w.ueber, 0)
  const nachArt = {}
  for (const a of abw) { const art = absenzArt(a.art); const k = art.kurz || art.label; nachArt[k] = (nachArt[k] || 0) + (a.halbtag ? 0.5 : 1) }
  return { arbeit, abwBezahlt, ist, soll, saldo: ueber, ueber, ueberWochen, wochenStd: wochenStd || 40, sollTage, tagSoll, sollAngenommen: !wochenStd, luecken, einsatz,
    tage: new Set(sch.map((s) => s.datum)).size, nachArt, hatEintrag }
}
