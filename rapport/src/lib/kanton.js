/** Kanton für die Feiertage: Einsatz der Firma → aktuelle Firma → Einstellung */
export function kantonFuer(firmen, einsaetze = [], einst = {}) {
  const liste = Array.isArray(firmen) ? firmen : [firmen]
  for (const f of [...liste, einst.firma]) {
    const e = einsaetze.find((x) => x.firma === f && x.kanton)
    if (e) return e.kanton
  }
  return einst.kanton || ''
}
