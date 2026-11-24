import { db } from './db'
import { arbeitMs, isoDatum } from './zeit'
import { tagesSoll } from './settings'

/**
 * Stunden für einen Krankheits-/Unfalltag nach dem Lohnausfallprinzip: was man ohne Krankheit gearbeitet hätte.
 * Grundlage = Ø gearbeitete Stunden pro Arbeitstag der letzten 3 Monate vor dem Tag (bzw. seit Einsatzbeginn),
 * ausser der Einsatzvertrag nennt ausdrücklich die vertragliche Arbeitszeit (`krankStundenBasis: 'vertrag'`).
 * Zu wenig Daten (< 5 Arbeitstage) → Tagessoll aus den Einstellungen.
 */
export async function krankStunden(datum, einst, firma = einst?.firma) {
  const soll = tagesSoll(einst)
  const einsatz = firma ? await db.einsaetze.where('firma').equals(firma).first().catch(() => null) : null
  if (einsatz?.krankStundenBasis === 'vertrag') return { stunden: soll, quelle: 'vertrag', tage: 0 }
  const d = new Date(datum + 'T12:00'); d.setDate(d.getDate() - 91)
  const von = isoDatum(d)
  const liste = await db.schichten.where('datum').between(von, datum, true, false).toArray().catch(() => [])
  const proTag = {}
  for (const s of liste) {
    if (firma && s.firma && s.firma !== firma) continue
    if (!s.ende) continue
    proTag[s.datum] = (proTag[s.datum] || 0) + arbeitMs(s) / 36e5
  }
  const werte = Object.values(proTag).filter((h) => h > 0.5)
  if (werte.length < 5) return { stunden: soll, quelle: 'soll', tage: werte.length }
  const schnitt = Math.round((werte.reduce((a, h) => a + h, 0) / werte.length) * 100) / 100
  return { stunden: schnitt, quelle: 'durchschnitt', tage: werte.length, von }
}

export const krankBasisText = (k, soll) => !k ? '' : k.quelle === 'durchschnitt'
  ? `Ø ${k.stunden.toFixed(2)} h pro Arbeitstag (${k.tage} Arbeitstage der letzten 3 Monate) — so viel hättest du ohne Krankheit gearbeitet (Lohnausfallprinzip).`
  : k.quelle === 'vertrag' ? `${k.stunden.toFixed(2)} h laut Einsatzvertrag (vertragliche Arbeitszeit als Grundlage).`
  : `${soll.toFixed(2)} h (Tagessoll) — noch zu wenig erfasste Arbeitstage für einen Durchschnitt.`
