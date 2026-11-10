import { db } from './db'

/**
 * Einen Rapport pro Einsatzbetrieb (Firma) — jeder Einsatz kann ein anderes Temporärbüro haben.
 * Abwesenheiten/Spesen ohne Firma gehen zur Firma, bei der in der Woche (am selben Tag) gearbeitet wurde.
 */
export function rapportGruppen({ schichten = [], absenzen = [], spesen = [], einsaetze = [], einst }) {
  const fertig = schichten.filter((s) => s.ende != null)
  const standard = fertig[0]?.firma || einst.firma || ''
  const gruppen = {}
  const gruppe = (firma) => {
    const f = firma || standard
    if (!gruppen[f]) {
      const e = einsaetze.find((x) => x.firma === f) || null
      gruppen[f] = {
        firma: f, einsatz: e, schichten: [], absenzen: [], spesen: [],
        buero: e?.buero || einst.buero, bueroTel: e?.bueroTel || einst.bueroTel,
        einst: { ...einst, buero: e?.buero || einst.buero, wochenSoll: +e?.wochenstunden ? e.wochenstunden : einst.wochenSoll },
      }
    }
    return gruppen[f]
  }
  for (const s of fertig) gruppe(s.firma).schichten.push(s)
  for (const a of absenzen) gruppe(a.firma && (gruppen[a.firma] || !fertig.length) ? a.firma : standard).absenzen.push(a)
  for (const x of spesen) gruppe(fertig.find((s) => s.datum === x.datum)?.firma || standard).spesen.push(x)
  return Object.values(gruppen)
}

export const statusKey = (wKey, firma) => `${wKey}|${firma}`

/** Status (gesendet/gesichert) einer Firma in einer Woche; ältere Einträge ohne Firma zählen mit */
export async function rapportStatus(wKey, firma, einzige) {
  const s = await db.wochen.get(statusKey(wKey, firma))
  if (s || !einzige) return s || null
  return (await db.wochen.get(wKey)) || null
}

/** Noch nicht gesendete Rapporte einer Woche (Firmen) */
export async function offeneRapporte(wKey, einst) {
  const [schichten, absenzen, einsaetze] = await Promise.all([
    db.schichten.where('wocheKey').equals(wKey).toArray(),
    db.absenzen.where('wocheKey').equals(wKey).toArray(),
    db.einsaetze.toArray(),
  ])
  const g = rapportGruppen({ schichten, absenzen, einsaetze, einst })
  const offen = []
  for (const x of g) if (!(await rapportStatus(wKey, x.firma, g.length === 1))?.gesendetAm) offen.push(x.firma)
  return offen
}

/** Gruppen einer Woche aus der Datenbank laden */
export async function gruppenLaden(wKey, einst) {
  const [schichten, absenzen, spesen, einsaetze] = await Promise.all([
    db.schichten.where('wocheKey').equals(wKey).toArray(),
    db.absenzen.where('wocheKey').equals(wKey).toArray(),
    db.spesen.where('wocheKey').equals(wKey).toArray(),
    db.einsaetze.toArray(),
  ])
  return rapportGruppen({ schichten, absenzen, spesen, einsaetze, einst })
}
