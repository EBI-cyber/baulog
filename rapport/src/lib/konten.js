import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { lohnBerechnen, KONTEN, modus, angespart } from './lohn'
import { zahl, tagesSoll } from './settings'

/**
 * Guthaben beim Temporärbüro (pro Einsatz/Firma), über die ganze Zeit:
 * Saldo = Gutschriften (angesparte Entschädigungen) − Bezüge (Ferien/Feiertage aus dem Konto) ± Bewegungen (Auszahlung, Korrektur).
 * Gerechnet wird bis `bis` (YYYY-MM-DD, Standard: alles).
 */
export function kontenBerechnen({ schichten, absenzen, einsaetze, bewegungen, einst, bis }) {
  const l = lohnBerechnen({ schichten, absenzen, spesen: [], einsaetze, einst, von: null, bis: bis || null })
  const ergebnis = []
  for (const p of l.posten) {
    const e = p.einsatz
    if (!e || !KONTEN.some(([k]) => angespart(e, k))) continue
    const tag = (zahl(e.wochenstunden) / 5) || tagesSoll(einst)
    const konten = {}
    for (const [k, label] of KONTEN) {
      if (!angespart(e, k)) continue
      const bew = bewegungen.filter((b) => b.firma === e.firma && b.konto === k && (!bis || b.datum <= bis))
      const bewegung = bew.reduce((a, b) => a + zahl(b.betrag), 0)
      const saldo = p.konten[k].gutschrift - p.konten[k].bezug + bewegung
      // Wert einer freien Stunde: Grundlohn; bei netto zurückbehaltenem Guthaben der Grundlohn nach Sozialabzügen
      const satzOhne = modus(e, k) === 'netto' ? (p.abzuege || []).filter((a) => !['bvg', 'quellensteuer'].includes(a.k)).reduce((s2, a) => s2 + a.prozent, 0) / 100 : 0
      const proStunde = p.stundenlohn * (1 - satzOhne)
      const stunden = proStunde ? saldo / proStunde : 0
      // wie schnell es wächst: Gutschrift pro gearbeitete Stunde × Wochenstunden → freie Tage pro voller Arbeitswoche
      const wochenStd = zahl(e.wochenstunden) || tag * 5
      const proWocheTage = p.grundStd && proStunde && tag ? (p.konten[k].gutschrift / p.grundStd) * wochenStd / (proStunde * tag) : 0
      konten[k] = { label, gutschrift: p.konten[k].gutschrift, bezug: p.konten[k].bezug, bewegung, saldo, stunden, tage: tag ? stunden / tag : 0, tagStunden: tag, proStunde, proWocheTage, bewegungen: bew }
    }
    ergebnis.push({ firma: e.firma, buero: e.buero, einsatz: e, konten })
  }
  return ergebnis
}

export function useKonten(einst, bis) {
  return useLiveQuery(async () => kontenBerechnen({
    schichten: await db.schichten.toArray(), absenzen: await db.absenzen.toArray(), einsaetze: await db.einsaetze.toArray(),
    bewegungen: await db.kontobewegungen.toArray(), einst, bis,
  }), [JSON.stringify(einst?.profil), einst?.wochenSoll, bis], null)
}
