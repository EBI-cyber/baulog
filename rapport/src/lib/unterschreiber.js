import { db } from './db'

/**
 * Unterschriftsberechtigte des Einsatzbetriebs (pro Einsatz):
 * [{ id, name, funktion, email, tel, standard, zuletzt }]
 * „standard" = Haupt-Unterzeichner (meist der Polier). Unterschreibt jemand anderes, gilt das als Vertretung:
 * Es steht im Rapport („i.V.") und der Haupt-Unterzeichner bekommt eine Kopie.
 */
export const FUNKTIONEN = ['Polier', 'Vorarbeiter', 'Bauführer', 'Meister / Werkstattleiter', 'Andere']

const neueId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))
const norm = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Liste inkl. Übernahme des früheren Einzel-Poliers */
export function liste(e) {
  const l = [...(e?.unterschreiber || [])]
  if (!l.length && e?.polierName) l.push({ id: 'polier', name: e.polierName, funktion: 'Polier', email: e.polierEmail || '', tel: e.polierTel || '', standard: true })
  return l
}
export const standardPerson = (e) => liste(e).find((x) => x.standard) || null

/** Person in der Liste finden: id, sonst E-Mail, sonst Name */
export function finde(e, p) {
  const l = liste(e)
  return (p?.id && l.find((x) => x.id === p.id))
    || (p?.email && l.find((x) => x.email && norm(x.email) === norm(p.email)))
    || (p?.name && l.find((x) => norm(x.name) === norm(p.name)))
    || null
}

/** Person aufnehmen/aktualisieren (leere Felder überschreiben nichts). Gibt die gespeicherte Person zurück. */
export async function merken(einsatz, p) {
  if (!einsatz?.id || !p?.name?.trim()) return null
  const l = liste(einsatz)
  const t = finde(einsatz, p)
  const daten = Object.fromEntries(Object.entries({ name: p.name?.trim(), funktion: p.funktion, email: p.email?.trim(), tel: p.tel?.trim() }).filter(([, v]) => v))
  let person
  const neu = t
    ? l.map((x) => (x.id === t.id ? (person = { ...x, ...daten, zuletzt: Date.now() }) : x))
    : [...l, (person = { id: neueId(), email: '', tel: '', funktion: 'Polier', ...daten, standard: !l.some((x) => x.standard), zuletzt: Date.now() })]
  await db.einsaetze.update(einsatz.id, { unterschreiber: neu })
  return person
}

/** Anzeige im Rapport: „Hans Muster, Vorarbeiter (i.V. Peter Polier)" */
export function unterzeichnerText(u) {
  if (!u?.firmaName) return ''
  return `${u.firmaName}${u.firmaFunktion ? ', ' + u.firmaFunktion : ''}${u.vertretungFuer ? ` (i.V. ${u.vertretungFuer})` : ''}`
}
