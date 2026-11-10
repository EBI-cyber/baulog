import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { lohnBerechnen, KONTEN, modus } from './lohn'
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
    if (!e || !KONTEN.some(([k]) => modus(e, k) === 'konto')) continue
    const tag = (zahl(e.wochenstunden) / 5) || tagesSoll(einst)
    const konten = {}
    for (const [k, label] of KONTEN) {
      if (modus(e, k) !== 'konto') continue
      const bew = bewegungen.filter((b) => b.firma === e.firma && b.konto === k && (!bis || b.datum <= bis))
      const bewegung = bew.reduce((a, b) => a + zahl(b.betrag), 0)
      const saldo = p.konten[k].gutschrift - p.konten[k].bezug + bewegung
      const stunden = p.stundenlohn ? saldo / p.stundenlohn : 0
      konten[k] = { label, gutschrift: p.konten[k].gutschrift, bezug: p.konten[k].bezug, bewegung, saldo, stunden, tage: tag ? stunden / tag : 0, bewegungen: bew }
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
