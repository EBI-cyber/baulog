import { arbeitMs, wochenTage, isoDatum } from './zeit'
import { sonderStunden, LOHN_STANDARD } from './lohn'
import { zahl } from './settings'
import { absenzArt } from './arten'

/**
 * Tageswerte für das Rapport-Formular (Wochenraster wie Arbeitsrapport der Temporärbüros):
 * je Tag Normalstunden, Stunden zu 125 / 150 / 200 %, Spesen Essen, Einsatzort, Abwesenheiten.
 * Zuschlags-Stunden: Nacht/Samstag/Sonntag/Feiertag nach den Sätzen des Einsatzes,
 * Überstunden über dem Wochensoll (ausser ueberstundenModus 'keine'). Rest = Normalstunden.
 */
const wert = (e, k) => zahl(e?.[k] !== undefined && e?.[k] !== '' ? e[k] : LOHN_STANDARD[k])
const stufe = (prozent) => (prozent >= 99 ? 200 : prozent >= 49 ? 150 : prozent >= 24 ? 125 : 100)

export function rapportTage({ woche, schichten, absenzen = [], spesen = [], einsatz: e, einst }) {
  const tage = wochenTage(woche).map((d) => ({ datum: isoDatum(d), tag: d, normal: 0, h125: 0, h150: 0, h200: 0, spesen: 0, orte: new Set(), absenzen: [] }))
  const nach = Object.fromEntries(tage.map((t) => [t.datum, t]))
  for (const a of absenzen) {
    const t = nach[a.datum]
    const art = absenzArt(a.art)
    if (t) t.absenzen.push({ label: art.label + (a.halbtag ? ' ½' : ''), kurz: (art.kurz || art.label) + (a.halbtag ? ' ½' : ''), std: zahl(a.stunden) })
  }
  const soll = e?.ueberstundenModus === 'keine' ? 0 : zahl(e?.wochenstunden) || zahl(einst?.wochenSoll)
  let kumuliert = absenzen.reduce((x, a) => x + zahl(a.stunden), 0)
  for (const s of [...schichten].filter((x) => x.ende != null).sort((a, b) => a.start - b.start)) {
    const t = nach[s.datum]
    if (!t) continue
    const h = arbeitMs(s) / 36e5
    const x = sonderStunden(s, Date.now(), e)
    // Sonderstunden in ihre Stufe; Feiertag/Sonntag/Samstag vor Nacht (kein Doppelzählen über die Gesamtstunden hinaus)
    let rest = h
    const buche = (std, prozent) => {
      const n = Math.min(rest, std)
      if (n <= 0) return
      const st = stufe(prozent)
      if (st === 100) return
      t['h' + st] += n; rest -= n
    }
    buche(x.feiertag, wert(e, 'feiertagArbeitZuschlag'))
    buche(x.sonntag, wert(e, 'sonntagZuschlag'))
    buche(x.samstag, wert(e, 'samstagZuschlag'))
    buche(x.nacht, wert(e, 'nachtZuschlag'))
    // Überstunden (über dem Wochensoll) aus den verbleibenden Normalstunden
    const ueber = soll ? Math.max(0, kumuliert + h - Math.max(soll, kumuliert)) : 0
    kumuliert += h
    buche(ueber, wert(e, 'ueberstundenZuschlag'))
    t.normal += rest
    // Notiz als Baustelle, ohne den automatischen Vermerk „(vom Papier-Rapport) nachgetragen“
    const notiz = (s.notiz || '').replace(/\s*·?\s*(vom Papier-Rapport )?nachgetragen\s*$/i, '').trim()
    // Einsatzbetrieb + Ort (+ Baustelle/Notiz), z.B. „Stüssi Betonvorfabrikation AG · Dällikon“
    for (const teil of [s.firma || e?.firma, (e?.einsatzort || '').replace(/^\d{4}\s+/, ''), notiz]) if (teil?.trim()) t.orte.add(teil.trim())
  }
  for (const x of spesen) {
    const t = nach[x.datum]
    if (t && (x.art === 'verpflegung' || !x.art)) t.spesen += zahl(x.betrag)
  }
  const total = (k) => tage.reduce((a, t) => a + t[k], 0)
  return {
    tage: tage.map((t) => ({ ...t, orteListe: [...t.orte].filter(Boolean), ort: [...t.orte].filter(Boolean).join(', ') })),
    total: { normal: total('normal'), h125: total('h125'), h150: total('h150'), h200: total('h200'), spesen: total('spesen'),
      absenz: tage.reduce((a, t) => a + t.absenzen.reduce((b, x) => b + x.std, 0), 0) },
  }
}
