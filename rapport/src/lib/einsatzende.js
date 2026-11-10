import { isoDatum } from './zeit'

/** Enddatum eines Einsatzes: festes Ende oder Beginn + maximale Dauer in Kalendertagen (Beginn zählt als Tag 1) */
export function einsatzEnde(e) {
  if (!e) return null
  if (e.ende) return e.ende
  const n = parseInt(e.maxDauerTage, 10)
  if (!e.beginn || !(n > 0)) return null
  const d = new Date(e.beginn + 'T12:00'); d.setDate(d.getDate() + n - 1)
  return isoDatum(d)
}

/** Tage bis zum Ende (0 = heute letzter Tag, negativ = vorbei), null = offen */
export function tageBisEnde(e) {
  const ende = einsatzEnde(e)
  if (!ende) return null
  const heute = new Date(isoDatum(new Date()) + 'T12:00')
  return Math.round((new Date(ende + 'T12:00') - heute) / 864e5)
}

export function verlaengern(e, tage) {
  const basis = new Date((einsatzEnde(e) || isoDatum(new Date())) + 'T12:00')
  const heute = new Date(isoDatum(new Date()) + 'T12:00')
  const d = basis < heute ? heute : basis
  d.setDate(d.getDate() + tage)
  return isoDatum(d)
}
