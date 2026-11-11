import { db } from './db'
import { supabase } from './ki'
import { isoDatum } from './zeit'
import { schluessel } from './bankauszug'
export { buchungenLokal, einordnen, schluessel, monatFuer, muster } from './bankauszug'

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

// KI-Antworten robust lesen: „05.11.2026“ / „2026-11-05“, „+800.00 CHF“ / „1'234.50“ / 800
function datumNorm(x) {
  const t = String(x || '').trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[0]
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(t)
  return m ? `${+m[3] < 100 ? 2000 + +m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}
function betragNorm(x) {
  if (typeof x === 'number') return x
  const t = String(x || '').replace(/CHF/gi, '').replace(/['’\s]/g, '').replace('−', '-').replace('–', '-')
  return parseFloat(t.replace(/,(\d{2})$/, '.$1')) || 0
}

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
    .map((b) => ({ datum: datumNorm(b.datum), betrag: betragNorm(b.betrag), text: [b.text, b.gegenpartei].filter(Boolean).join(' ').trim() }))
    .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.datum) && b.betrag)
}

/** Gewählte Buchungen speichern (doppelte — gleiches Datum + Betrag — werden übersprungen) */
export async function zahlungenSpeichern(liste, quelle = 'bank') {
  let n = 0
  for (const b of liste) {
    const k = schluessel(b)
    if (await db.zahlungen.where('schluessel').equals(k).first()) continue
    await db.zahlungen.add({ datum: b.datum, betrag: Math.abs(Number(b.betrag)), art: b.art, fuerMonat: b.fuerMonat, kw: b.kw ?? null, firma: b.firma || '', buero: b.buero || '', text: b.text || '', quelle, schluessel: k })
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
