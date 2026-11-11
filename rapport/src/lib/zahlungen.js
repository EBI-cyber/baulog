import { db } from './db'
import { supabase } from './ki'
import { isoDatum } from './zeit'
import { schluessel } from './bankauszug'
export { buchungenLokal, einordnen, schluessel } from './bankauszug'

/**
 * Zahlungen vom Temporärbüro (wöchentliche Vorschüsse, Lohn-Restzahlung) — aus dem Bankauszug
 * (kopierter Text oder Screenshot) oder von Hand. Damit sieht man, was schon bezahlt ist und was das Büro noch schuldet.
 * Zahlung: { datum, betrag (CHF, positiv), art: vorschuss|lohn|sonstig, fuerMonat 'YYYY-MM', firma, buero, text, quelle, schluessel }
 */
export const ARTEN = [
  { id: 'vorschuss', label: 'Vorschuss' },
  { id: 'lohn', label: 'Lohn (Restzahlung)' },
  { id: 'sonstig', label: 'Sonstiges' },
]

/** Bankauszug mit KI lesen (Text und/oder Screenshots) → [{ datum, betrag (+ Gutschrift / − Belastung), text }] */
export async function buchungenKI({ text, bilder }) {
  if (!supabase) throw new Error('KI ist in dieser Version nicht eingerichtet.')
  const { data, error } = await supabase.functions.invoke('baulog-ai', { body: { task: 'zahlungen', text, bilder, heute: isoDatum(new Date()) } })
  if (error) {
    let d = ''; try { d = (await error.context.clone().json()).error } catch {}
    throw new Error('KI-Fehler: ' + (d || error.message))
  }
  if (data?.error) throw new Error(data.error)
  return (Array.isArray(data?.buchungen) ? data.buchungen : [])
    .map((b) => ({ datum: String(b.datum || '').slice(0, 10), betrag: Number(b.betrag) || 0, text: String(b.text || b.gegenpartei || '').trim() }))
    .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.datum) && b.betrag)
}

/** Gewählte Buchungen speichern (doppelte — gleiches Datum + Betrag — werden übersprungen) */
export async function zahlungenSpeichern(liste, quelle = 'bank') {
  let n = 0
  for (const b of liste) {
    const k = schluessel(b)
    if (await db.zahlungen.where('schluessel').equals(k).first()) continue
    await db.zahlungen.add({ datum: b.datum, betrag: Math.abs(Number(b.betrag)), art: b.art, fuerMonat: b.fuerMonat, firma: b.firma || '', buero: b.buero || '', text: b.text || '', quelle, schluessel: k })
    n++
  }
  return n
}

/** Summen pro Monat ('YYYY-MM') → { vorschuss, lohn, sonstig, total } */
export function proMonat(zahlungen = []) {
  const m = {}
  for (const z of zahlungen) {
    const x = (m[z.fuerMonat] = m[z.fuerMonat] || { vorschuss: 0, lohn: 0, sonstig: 0, total: 0 })
    x[z.art] = (x[z.art] || 0) + z.betrag
    x.total += z.betrag
  }
  return m
}
