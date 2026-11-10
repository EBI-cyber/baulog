import { arbeitMs, isoDatum } from './zeit'
import { zahl } from './settings'
import { feiertagAm } from './feiertage'

/**
 * Lohnschätzung für Temporärarbeit (Schweiz), Aufbau wie GAV Personalverleih:
 * Grundlohn + Zuschläge + Zulagen + bezahlte Absenzen → Feiertags-, Ferienentschädigung, 13. Monatslohn
 * → Bruttolohn − Sozialabzüge (− Quellensteuer) = Nettolohn + Spesen/Mittagszulage = Auszahlung.
 * Branchenregeln (Bau/Industrie) kommen über die Felder des Einsatzes (siehe branchen.js).
 * Ohne Gewähr — massgebend ist die Abrechnung des Temporärbüros.
 */

export const LOHN_STANDARD = {
  stundenlohn: '', wochenstunden: '',
  feiertagProzent: '', ferienProzent: '8.33', dreizehnterProzent: '8.33',
  ueberstundenZuschlag: '25', nachtVon: '23', nachtBis: '6', nachtZuschlag: '25',
  samstagZuschlag: '', sonntagZuschlag: '50', feiertagArbeitZuschlag: '50',
  zulageStunde: '', mittagszulage: '', krankFaktor: '80', schlechtwetterFaktor: '0',
  ahv: '5.3', alv: '1.1', nbu: '', ktg: '', bvg: '', gav: '', far: '', parifonds: '', quellensteuer: '',
}

export const ABZUEGE = [
  ['ahv', 'AHV/IV/EO'], ['alv', 'ALV'], ['nbu', 'Nichtberufsunfall (NBU)'], ['ktg', 'Krankentaggeld (KTG)'],
  ['bvg', 'Pensionskasse (BVG)'], ['gav', 'GAV-Beitrag (Weiterbildung/Vollzug)'],
  ['far', 'FAR (Frühpensionierung Bau)'], ['parifonds', 'Parifonds / Berufsbeitrag'], ['quellensteuer', 'Quellensteuer'],
]

/** Vertragswert oder Standard (leer im Vertrag = Standard) */
const wert = (e, k) => zahl(e?.[k] !== undefined && e?.[k] !== '' ? e[k] : LOHN_STANDARD[k])
const prozent = (e, k) => wert(e, k) / 100

/** Stundenlohn inkl. Feiertag, Ferien, 13. ML (wie oft im Vertrag als „Total" angegeben) */
export function stundenlohnTotal(e) {
  const g = zahl(e?.stundenlohn)
  const ft = g * prozent(e, 'feiertagProzent'), fe = (g + ft) * prozent(e, 'ferienProzent')
  return g + ft + fe + (g + ft + fe) * prozent(e, 'dreizehnterProzent')
}

/** Lohnfaktor einer Abwesenheit (Anteil des Stundenlohns) */
export function absenzFaktor(art, e) {
  switch (art) {
    case 'ferien': return wert(e, 'ferienProzent') > 0 ? 0 : 1 // bereits als Zuschlag bezahlt
    case 'feiertag': return wert(e, 'feiertagProzent') > 0 ? 0 : 1
    case 'krank': case 'unfall': return wert(e, 'krankFaktor') / 100
    case 'schlechtwetter': return wert(e, 'schlechtwetterFaktor') / 100
    case 'militaer': case 'eltern': return 0.8 // EO
    case 'arzt': case 'bezahlt': return 1
    default: return 0
  }
}

const ueber = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/**
 * Sonderstunden einer Schicht (anteilig ohne Pausen):
 * nacht (Zeitfenster aus dem Einsatz), samstag, sonntag, feiertag (Feiertag im Kanton, nicht Sonntag)
 */
export function sonderStunden(s, jetzt = Date.now(), e = null) {
  const s0 = s.start, s1 = s.ende ?? jetzt, dauer = s1 - s0
  const leer = { nacht: 0, samstag: 0, sonntag: 0, feiertag: 0 }
  if (dauer <= 0) return leer
  const von = wert(e, 'nachtVon'), bis = wert(e, 'nachtBis')
  const r = { ...leer }
  const d = new Date(s0); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1)
  while (d.getTime() < s1) {
    const J = d.getFullYear(), M = d.getMonth(), T = d.getDate()
    const t0 = d.getTime(), t1 = new Date(J, M, T + 1).getTime()
    // Nachtfenster dieses Tages: von → bis (über Mitternacht, wenn von > bis)
    const n0 = new Date(J, M, T, von).getTime(), n1 = new Date(J, M, T + (von > bis ? 1 : 0), bis).getTime()
    r.nacht += ueber(s0, s1, n0, n1)
    const wt = d.getDay()
    if (wt === 6) r.samstag += ueber(s0, s1, t0, t1)
    else if (wt === 0) r.sonntag += ueber(s0, s1, t0, t1)
    else if (e?.kanton && feiertagAm(e.kanton, isoDatum(d))) r.feiertag += ueber(s0, s1, t0, t1)
    d.setDate(d.getDate() + 1)
  }
  const f = arbeitMs(s, jetzt) / dauer
  for (const k in r) r[k] = (r[k] * f) / 36e5
  return r
}

const leerTopf = (einsatz) => ({
  einsatz, firma: einsatz?.firma || 'Ohne Einsatzvertrag', stundenlohn: zahl(einsatz?.stundenlohn),
  grundStd: 0, ueberStd: 0, nachtStd: 0, samstagStd: 0, sonntagStd: 0, feiertagStd: 0, tage: new Set(), absenzen: {},
})

/**
 * schichten/absenzen: möglichst ganze Wochen (für Überstunden), gezählt wird nur [von, bis] (YYYY-MM-DD).
 * Rückgabe: { posten: [...je Einsatz], brutto, abzuege, netto, spesen, auszahlung, fehlendeLoehne }
 */
export function lohnBerechnen({ schichten = [], absenzen = [], spesen = [], einsaetze = [], einst, von, bis, jetzt = Date.now() }) {
  const nachFirma = Object.fromEntries(einsaetze.map((e) => [e.firma, e]))
  const imZeitraum = (d) => (!von || d >= von) && (!bis || d <= bis)
  const topf = {}
  const holeTopf = (firma) => {
    const e = nachFirma[firma] || null
    return (topf[e ? e.firma : '_'] ||= leerTopf(e))
  }
  // Firma einer Abwesenheit: gespeichert, sonst Einsatz der Woche, sonst aktuelle Firma
  const firmaFuer = (a) => a.firma || schichten.find((s) => s.wocheKey === a.wocheKey)?.firma || einst?.firma || ''

  // Wochenweise: Absenzen füllen das Soll zuerst, darüber hinaus gearbeitete Stunden = Überstunden
  const wochen = {}
  for (const s of schichten) (wochen[s.wocheKey] ||= { s: [], a: [] }).s.push(s)
  for (const a of absenzen) (wochen[a.wocheKey] ||= { s: [], a: [] }).a.push(a)
  for (const w of Object.values(wochen)) {
    let kumuliert = w.a.reduce((x, a) => x + zahl(a.stunden), 0)
    for (const a of w.a) {
      if (!imZeitraum(a.datum)) continue
      const t = holeTopf(firmaFuer(a))
      const z = (t.absenzen[a.art] ||= { std: 0, betrag: 0, faktor: absenzFaktor(a.art, t.einsatz) })
      z.std += zahl(a.stunden)
      z.betrag += zahl(a.stunden) * t.stundenlohn * z.faktor
    }
    for (const s of [...w.s].sort((x, y) => x.start - y.start)) {
      const t = holeTopf(s.firma)
      const h = arbeitMs(s, jetzt) / 36e5
      const soll = zahl(t.einsatz?.wochenstunden) || zahl(einst?.wochenSoll)
      const ueberStd = soll ? Math.max(0, kumuliert + h - Math.max(soll, kumuliert)) : 0
      kumuliert += h
      if (!imZeitraum(s.datum)) continue
      const x = sonderStunden(s, jetzt, t.einsatz)
      t.grundStd += h; t.ueberStd += ueberStd
      t.nachtStd += x.nacht; t.samstagStd += x.samstag; t.sonntagStd += x.sonntag; t.feiertagStd += x.feiertag
      if (h > 0) t.tage.add(s.datum)
    }
  }

  const posten = Object.values(topf).map((t) => {
    const e = t.einsatz, g = t.stundenlohn
    const zeilen = []
    const z = (label, betrag, info) => { if (Math.abs(betrag) >= 0.005 || info?.immer) zeilen.push({ label, betrag, info: info?.text }) }
    const std = (h) => `${h.toFixed(2)} h`
    const grund = t.grundStd * g
    z('Grundlohn', grund, { text: `${std(t.grundStd)} × ${g.toFixed(2)}`, immer: true })
    z(`Überstundenzuschlag ${wert(e, 'ueberstundenZuschlag')} %`, t.ueberStd * g * prozent(e, 'ueberstundenZuschlag'), { text: std(t.ueberStd) })
    z(`Nachtzuschlag ${wert(e, 'nachtZuschlag')} % (${wert(e, 'nachtVon')}–${wert(e, 'nachtBis')} Uhr)`, t.nachtStd * g * prozent(e, 'nachtZuschlag'), { text: std(t.nachtStd) })
    z(`Samstagszuschlag ${wert(e, 'samstagZuschlag')} %`, t.samstagStd * g * prozent(e, 'samstagZuschlag'), { text: std(t.samstagStd) })
    z(`Sonntagszuschlag ${wert(e, 'sonntagZuschlag')} %`, t.sonntagStd * g * prozent(e, 'sonntagZuschlag'), { text: std(t.sonntagStd) })
    z(`Feiertagsarbeit ${wert(e, 'feiertagArbeitZuschlag')} %`, t.feiertagStd * g * prozent(e, 'feiertagArbeitZuschlag'), { text: std(t.feiertagStd) })
    z('Zulage pro Stunde', t.grundStd * wert(e, 'zulageStunde'), { text: `${std(t.grundStd)} × ${wert(e, 'zulageStunde').toFixed(2)}` })
    for (const [art, a] of Object.entries(t.absenzen)) {
      zeilen.push({ art, label: art, betrag: a.betrag, info: `${std(a.std)} × ${Math.round(a.faktor * 100)} %` })
    }
    const ft = grund * prozent(e, 'feiertagProzent')
    z(`Feiertagsentschädigung ${wert(e, 'feiertagProzent')} %`, ft)
    const fe = (grund + ft) * prozent(e, 'ferienProzent')
    z(`Ferienentschädigung ${wert(e, 'ferienProzent')} %`, fe)
    z(`13. Monatslohn ${wert(e, 'dreizehnterProzent')} %`, (grund + ft + fe) * prozent(e, 'dreizehnterProzent'))
    const brutto = zeilen.reduce((a, x) => a + x.betrag, 0)
    const abzuege = ABZUEGE.map(([k, label]) => ({ k, label, prozent: wert(e, k), betrag: brutto * prozent(e, k) })).filter((a) => a.prozent > 0)
    const abzugTotal = abzuege.reduce((a, x) => a + x.betrag, 0)
    // nicht AHV-pflichtig, kommt zur Auszahlung
    const mittag = t.tage.size * wert(e, 'mittagszulage')
    return { ...t, tage: t.tage.size, zeilen, brutto, abzuege, abzugTotal, netto: brutto - abzugTotal, mittag }
  }).filter((p) => p.grundStd > 0 || p.zeilen.length > 1)

  const spesenSumme = spesen.filter((x) => imZeitraum(x.datum)).reduce((a, x) => a + zahl(x.betrag), 0)
  const mittag = posten.reduce((a, p) => a + p.mittag, 0)
  const brutto = posten.reduce((a, p) => a + p.brutto, 0)
  const abzuege = posten.reduce((a, p) => a + p.abzugTotal, 0)
  return {
    posten, brutto, abzuege, netto: brutto - abzuege, spesen: spesenSumme, mittag,
    auszahlung: brutto - abzuege + spesenSumme + mittag,
    fehlendeLoehne: posten.filter((p) => !p.stundenlohn).map((p) => p.firma),
  }
}

/** Zeitraum um [von, bis] auf ganze Wochen erweitern (für die Überstunden) */
export function erweitert(von, bis) {
  const a = new Date(von + 'T12:00'); a.setDate(a.getDate() - 6)
  const b = new Date(bis + 'T12:00'); b.setDate(b.getDate() + 6)
  return [isoDatum(a), isoDatum(b)]
}

export const chf = (n, w = 'CHF') => `${w} ${(n || 0).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
/** Auszahlung: CHF auf 5 Rappen gerundet */
export const runde5 = (n, w = 'CHF') => (w === 'CHF' ? Math.round(n * 20) / 20 : n)
