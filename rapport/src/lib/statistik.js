import { lohnMitQst } from './useLohn'
import { sollIst } from './soll'
import { isoDatum, isoWoche, wochenStart, wocheVersetzt, wochenKey } from './zeit'

export const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
export const MONATE_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

const plusTage = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return isoDatum(d) }

/**
 * Zeiträume für die Statistik.
 * woche: 12 KW bis zur Woche `anker` (wocheVersetzt-Objekt) · monat: 12 Monate des Jahres `anker`
 * · jahr: alle Jahre von `anker[0]` bis `anker[1]`.
 */
export function perioden(art, anker) {
  if (art === 'woche') {
    return Array.from({ length: 12 }, (_, i) => {
      const w = wocheVersetzt(anker, i - 11)
      const von = isoDatum(wochenStart(w))
      return { key: wochenKey(w), kurz: String(w.kw), titel: `KW ${w.kw} / ${w.jahr}`, von, bis: plusTage(von, 6), monate: null, monat: plusTage(von, 3).slice(0, 7) }
    })
  }
  if (art === 'monat') {
    return MONATE_KURZ.map((k, m) => ({
      key: `${anker}-${String(m + 1).padStart(2, '0')}`, kurz: k, titel: `${MONATE_LANG[m]} ${anker}`,
      von: isoDatum(new Date(anker, m, 1)), bis: isoDatum(new Date(anker, m + 1, 0)), monate: null,
    }))
  }
  const [a, b] = anker
  return Array.from({ length: b - a + 1 }, (_, i) => {
    const j = a + i
    return { key: String(j), kurz: String(j), titel: `Jahr ${j}`, von: `${j}-01-01`, bis: `${j}-12-31`, monate: true }
  })
}

/** Monatsgrenzen im Zeitraum (für Jahreswerte: Lohn Monat für Monat wie die Lohnabrechnung) */
function monateIn(von, bis) {
  const out = []
  for (let d = new Date(von + 'T12:00'); isoDatum(d) <= bis; d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)) {
    const mVon = isoDatum(new Date(d.getFullYear(), d.getMonth(), 1)), mBis = isoDatum(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    out.push([mVon < von ? von : mVon, mBis > bis ? bis : mBis])
  }
  return out
}

/**
 * Kennzahlen eines Zeitraums. daten = { schichten, absenzen, spesen, einsaetze, erster } (alles),
 * qstTarife = { [jahr]: tarif|null }. Zukunft wird abgeschnitten (bis höchstens heute).
 */
export function auswerten({ p, daten, einst, kanton, qstTarife = {}, heute = isoDatum(new Date()) }) {
  if (p.von > heute) return { ...p, zukunft: true, leer: true }
  const bis = p.bis < heute ? p.bis : heute
  const laufend = p.bis >= heute
  const s = sollIst({ von: p.von, bis, schichten: daten.schichten, absenzen: daten.absenzen, einsaetze: daten.einsaetze, einst, kanton, ersterTag: daten.erster })
  const lohn = { brutto: 0, netto: 0, auszahlung: 0, spesen: 0, rueck: 0, fehlt: false }
  // Woche: ganze Woche (Überstunden wochenweise); Monat/Jahr: Monat für Monat
  const stuecke = p.monate || p.key.length === 7 ? monateIn(p.von, bis) : [[p.von, p.bis]]
  for (const [a, b] of stuecke) {
    const l = lohnMitQst({ daten, einst, qstTarif: qstTarife[+b.slice(0, 4)] || null, von: a, bis: b })
    lohn.brutto += l.brutto; lohn.netto += l.netto; lohn.auszahlung += l.auszahlung; lohn.spesen += l.spesen + l.mittag; lohn.rueck += l.rueckstellung || 0
    if (l.fehlendeLoehne.length && l.brutto === 0 && s.arbeit > 0) lohn.fehlt = true
  }
  const r = (n) => Math.round(n * 100) / 100
  return {
    ...p, laufend, bisEff: bis,
    arbeit: s.arbeit, abw: s.abwBezahlt, ist: s.ist, soll: s.soll, saldo: s.saldo, tage: s.tage, nachArt: s.nachArt,
    brutto: r(lohn.brutto), netto: r(lohn.netto), abzuege: r(lohn.brutto - lohn.netto), auszahlung: r(lohn.auszahlung), spesen: r(lohn.spesen), rueckstellung: r(lohn.rueck),
    lohnFehlt: lohn.fehlt,
    leer: s.ist === 0 && lohn.brutto === 0,
  }
}

/** Summen/Durchschnitte über die ausgewerteten Zeiträume (Ø nur über abgeschlossene Zeiträume mit Daten) */
export function zusammenfassen(werte) {
  const mit = werte.filter((w) => !w.leer)
  const fertig = mit.filter((w) => !w.laufend)
  const sum = (arr, k) => arr.reduce((a, w) => a + (w[k] || 0), 0)
  const schnitt = (k) => (fertig.length ? sum(fertig, k) / fertig.length : null)
  const max = (k) => mit.reduce((m, w) => (!m || w[k] > m[k] ? w : m), null)
  return {
    anzahl: mit.length, fertig: fertig.length,
    arbeit: sum(mit, 'arbeit'), abw: sum(mit, 'abw'), ist: sum(mit, 'ist'), soll: sum(mit, 'soll'), saldo: sum(mit, 'saldo'),
    brutto: sum(mit, 'brutto'), netto: sum(mit, 'netto'), spesen: sum(mit, 'spesen'),
    abzuege: sum(mit, 'abzuege'), rueckstellung: sum(mit, 'rueckstellung'), auszahlung: sum(mit, 'auszahlung'),
    schnittIst: schnitt('ist'), schnittNetto: schnitt('netto'), schnittBrutto: schnitt('brutto'),
    maxIst: max('ist'), maxNetto: max('netto'),
    proStunde: sum(mit, 'ist') > 0 ? sum(mit, 'netto') / sum(mit, 'ist') : null,
  }
}

export const aktuelleWoche = () => isoWoche(new Date())
