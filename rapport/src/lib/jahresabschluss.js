import { zahl } from './settings'
import { lohnMitQst } from './useLohn'
import { isoDatum } from './zeit'

export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const r2 = (n) => Math.round((n || 0) * 100) / 100

/** Abzugsgruppen für die Jahresübersicht */
export const GRUPPEN = [
  ['sozial', 'AHV/IV/EO, ALV, NBU', ['ahv', 'alv', 'nbu']],
  ['bvg', 'Pensionskasse (BVG)', ['bvg']],
  ['quellensteuer', 'Quellensteuer', ['quellensteuer']],
  ['uebrige', 'Übrige (KTG, GAV-Beitrag …)', ['ktg', 'gav', 'far', 'parifonds', 'sonstiges']],
]
const gruppeVon = (art) => (GRUPPEN.find(([, , arten]) => arten.includes(art)) || GRUPPEN[3])[0]

const leer = () => ({ brutto: 0, netto: 0, spesen: 0, rueck: 0, vorschuesse: 0, auszahlung: 0, stunden: 0, abzug: { ahv: 0, alv: 0, nbu: 0, ktg: 0, bvg: 0, gav: 0, far: 0, parifonds: 0, quellensteuer: 0, sonstiges: 0 } })

/** Gleiche Abrechnung mehrfach geprüft → nur die neueste zählt */
export function eindeutig(liste) {
  const m = {}
  for (const a of liste || []) {
    const k = `${a.von}|${a.bis}|${(a.buero || '').toLowerCase()}`
    if (!m[k] || (a.erstellt || 0) > (m[k].erstellt || 0)) m[k] = a
  }
  return Object.values(m).sort((a, b) => a.bis.localeCompare(b.bis))
}

/** Zahlen einer gespeicherten Lohnabrechnung (KI-Daten) */
export function abrechnungWerte(a) {
  const d = a.daten || {}
  const x = leer()
  x.brutto = zahl(d.brutto); x.netto = zahl(d.netto)
  for (const z of d.abzuege || []) { const art = x.abzug[z.art] !== undefined ? z.art : 'sonstiges'; x.abzug[art] += Math.abs(zahl(z.betrag)) }
  for (const p of d.positionen || []) if (['spesen', 'mittag'].includes(p.art)) x.spesen += zahl(p.betrag)
  const rs = d.rueckstellungen || {}
  x.rueck = zahl(rs.ferien) + zahl(rs.feiertag) + zahl(rs.dreizehnter)
  x.vorschuesse = zahl(d.vorschuesse); x.auszahlung = zahl(d.auszahlung); x.stunden = zahl(d.stundenTotal)
  if (!x.netto && x.brutto) x.netto = x.brutto - Object.values(x.abzug).reduce((s, v) => s + v, 0)
  return x
}

function addiere(z, x) {
  for (const k of ['brutto', 'netto', 'spesen', 'rueck', 'vorschuesse', 'auszahlung', 'stunden']) z[k] += x[k]
  for (const k in x.abzug) z.abzug[k] += x.abzug[k]
}

/** App-Schätzung eines Monats, falls keine Abrechnung vorliegt */
function schaetzung(daten, einst, qstTarif, von, bis) {
  const l = lohnMitQst({ daten, einst, qstTarif, von, bis })
  const x = leer()
  x.brutto = l.brutto; x.netto = l.netto; x.spesen = l.spesen + l.mittag; x.rueck = l.rueckstellung; x.auszahlung = l.auszahlung
  for (const p of l.posten) { x.stunden += p.grundStd; for (const a of p.abzuege) x.abzug[x.abzug[a.k] !== undefined ? a.k : 'sonstiges'] += a.betrag }
  return x
}

/**
 * Jahresabschluss: pro Monat die Lohnabrechnung(en) des Büros (Monat = Ende der Abrechnungsperiode);
 * fehlt sie, die Schätzung der App (markiert). Rückgabe { monate: [...12], total, totalAbrechnung, abrechnungen }
 */
export function jahresabschluss({ jahr, abrechnungen, daten, einst, qstTarif, heute = isoDatum(new Date()) }) {
  const liste = eindeutig(abrechnungen).filter((a) => +a.bis.slice(0, 4) === jahr)
  const monate = MONATE.map((name, m) => {
    const key = `${jahr}-${String(m + 1).padStart(2, '0')}`
    const von = `${key}-01`, bis = isoDatum(new Date(jahr, m + 1, 0))
    const ab = liste.filter((a) => a.bis.slice(0, 7) === key)
    const x = leer()
    let quelle = 'leer'
    if (ab.length) { for (const a of ab) addiere(x, abrechnungWerte(a)); quelle = 'abrechnung' }
    else if (daten && von <= heute) {
      const s = schaetzung(daten, einst, qstTarif, von, bis < heute ? bis : heute)
      if (s.brutto > 0) { addiere(x, s); quelle = bis < heute ? 'schaetzung' : 'laufend' }
    }
    return { m, key, name, quelle, abrechnungen: ab, ...x }
  })
  const total = leer(), totalAb = leer()
  for (const x of monate) { addiere(total, x); if (x.quelle === 'abrechnung') addiere(totalAb, x) }
  const runden = (t) => { for (const k of ['brutto', 'netto', 'spesen', 'rueck', 'vorschuesse', 'auszahlung', 'stunden']) t[k] = r2(t[k]); for (const k in t.abzug) t.abzug[k] = r2(t.abzug[k]); return t }
  return { monate, total: runden(total), totalAbrechnung: runden(totalAb), abrechnungen: liste, mitSchaetzung: monate.some((x) => x.quelle === 'schaetzung' || x.quelle === 'laufend') }
}

export const gruppen = (t) => Object.fromEntries(GRUPPEN.map(([k, , arten]) => [k, r2(arten.reduce((s, a) => s + (t.abzug[a] || 0), 0))]))

/**
 * Werte im Aufbau des Lohnausweises (Formular 11) — Orientierung für die Steuererklärung, ohne Gewähr.
 */
export function lohnausweis(t) {
  const z9 = r2(t.abzug.ahv + t.abzug.alv + t.abzug.nbu)
  const z10 = r2(t.abzug.bvg)
  return [
    { ziffer: '1', text: 'Lohn (Bruttolohn gemäss Abrechnungen)', betrag: r2(t.brutto) },
    { ziffer: '8', text: 'Bruttolohn total', betrag: r2(t.brutto), fett: true },
    { ziffer: '9', text: 'Beiträge AHV/IV/EO/ALV/NBU', betrag: -z9 },
    { ziffer: '10.1', text: 'Berufliche Vorsorge (BVG), ordentliche Beiträge', betrag: -z10 },
    { ziffer: '11', text: 'Nettolohn', betrag: r2(t.brutto - z9 - z10), fett: true },
    { ziffer: '12', text: 'Quellensteuerabzug', betrag: r2(t.abzug.quellensteuer) },
    { ziffer: '13', text: 'Spesenvergütungen (nicht im Bruttolohn)', betrag: r2(t.spesen) },
  ]
}

export { gruppeVon }
