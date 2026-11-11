import { ortSuchen } from './plz'

/**
 * Ort der Unterschrift aus dem Standort: GPS des Handys → PLZ/Ort über das amtliche Ortschaftenverzeichnis
 * (swisstopo, frei zugänglich). Fragt beim ersten Mal nach der Erlaubnis. Ergebnis 30 min gemerkt.
 * Gibt { ort, plz } oder null (keine Erlaubnis, kein Netz, ausserhalb der Schweiz).
 */
const KEY = 'rapport.standortOrt'

export async function ortVomStandort({ timeout = 10000 } = {}) {
  try {
    const alt = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (alt && Date.now() - alt.zeit < 30 * 60e3) return alt.wert
  } catch { /* */ }
  if (!navigator.geolocation) return null
  const pos = await new Promise((ok) => navigator.geolocation.getCurrentPosition(ok, () => ok(null),
    { enableHighAccuracy: false, timeout, maximumAge: 10 * 60e3 }))
  if (!pos) return null
  const { longitude: lon, latitude: lat } = pos.coords
  let wert = null
  try {
    const url = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryPoint&sr=4326&tolerance=0&returnGeometry=false' +
      `&layers=all:ch.swisstopo-vd.ortschaftenverzeichnis_plz&geometry=${lon},${lat}`
    const r = await fetch(url, { signal: AbortSignal.timeout?.(timeout) })
    const a = (await r.json())?.results?.[0]?.attributes || {}
    const plz = String(a.plz || '').slice(0, 4)
    let ort = a.langtext || a.ortbez || a.name || ''
    // Ortsname aus der eigenen PLZ-Liste, falls die Antwort nur die PLZ enthält
    if (!ort && plz) ort = (await ortSuchen(plz, 1))[0]?.ort || ''
    if (ort) wert = { ort, plz }
  } catch { /* offline o.ä. */ }
  try { sessionStorage.setItem(KEY, JSON.stringify({ zeit: Date.now(), wert })) } catch { /* */ }
  return wert
}
