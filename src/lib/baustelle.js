// Hilfen für die Baustelle: Standort einer Baustelle merken, Abstand dazu, aktuelles Wetter.
// Der Standort liegt nur auf diesem Gerät (localStorage), er wird nicht in die Cloud übertragen.

const STANDORT = (token) => 'baulog.standort.' + token

export function standortVon(token) {
  try { const s = JSON.parse(localStorage.getItem(STANDORT(token)) || 'null'); return s && Number.isFinite(s.lat) ? s : null } catch { return null }
}
export function standortSpeichern(token, pos) {
  try { localStorage.setItem(STANDORT(token), JSON.stringify({ lat: pos.lat, lng: pos.lng, am: new Date().toISOString() })) } catch { /* Speicher voll */ }
}
export function standortLoeschen(token) { try { localStorage.removeItem(STANDORT(token)) } catch { /* egal */ } }

// aktuelle Position → { lat, lng, genau } (Meter); wirft einen verständlichen Fehler
export function aktuellePosition(maxAlter = 60000) {
  return new Promise((ok, fehler) => {
    if (!navigator.geolocation) { fehler(new Error('Dieses Gerät kann den Standort nicht bestimmen.')); return }
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, genau: p.coords.accuracy }),
      (e) => fehler(new Error(e.code === 1 ? 'Standort nicht erlaubt. Bitte in den Einstellungen des Browsers den Standortzugriff für BauLog erlauben.' : 'Standort konnte nicht bestimmt werden.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: maxAlter },
    )
  })
}

// Abstand zweier Punkte in Metern
export function abstand(a, b) {
  const r = 6371000, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(x))
}
export const BAUSTELLE_RADIUS = 200 // Meter: so nah gilt man als „an der Baustelle“

// WMO-Wettercodes (Open-Meteo) auf Deutsch
const WETTER = {
  0: 'klar', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt', 45: 'Nebel', 48: 'Reifnebel',
  51: 'leichter Nieselregen', 53: 'Nieselregen', 55: 'starker Nieselregen', 56: 'gefrierender Niesel', 57: 'gefrierender Niesel',
  61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen', 66: 'gefrierender Regen', 67: 'gefrierender Regen',
  71: 'leichter Schneefall', 73: 'Schneefall', 75: 'starker Schneefall', 77: 'Schneegriesel',
  80: 'leichte Regenschauer', 81: 'Regenschauer', 82: 'heftige Regenschauer', 85: 'Schneeschauer', 86: 'starke Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Gewitter mit Hagel',
}

// Aktuelles Wetter am Ort → Text für das Bautagebuch, z. B. „Wetter: 14 °C, bedeckt, Wind 12 km/h, kein Niederschlag“
export async function wetterText(pos) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pos.lat.toFixed(4) + '&longitude=' + pos.lng.toFixed(4) +
    '&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m&timezone=auto'
  const r = await fetch(url)
  if (!r.ok) throw new Error('Wetterdienst nicht erreichbar')
  const c = (await r.json()).current || {}
  const teile = []
  if (Number.isFinite(c.temperature_2m)) teile.push(Math.round(c.temperature_2m) + ' °C')
  if (WETTER[c.weather_code]) teile.push(WETTER[c.weather_code])
  if (Number.isFinite(c.wind_speed_10m)) teile.push('Wind ' + Math.round(c.wind_speed_10m) + ' km/h')
  if (Number.isFinite(c.relative_humidity_2m)) teile.push('Luftfeuchte ' + Math.round(c.relative_humidity_2m) + ' %')
  teile.push(c.precipitation > 0 ? 'Niederschlag ' + c.precipitation.toLocaleString('de-DE') + ' mm' : 'kein Niederschlag')
  return 'Wetter: ' + teile.join(', ')
}

// Läuft für dieses Projekt ein Timer? (gleicher Schlüssel wie im Projekt)
export const TIMERKEY = (id) => 'baulog.timer.' + id
export function timerVon(id) { try { return JSON.parse(localStorage.getItem(TIMERKEY(id)) || 'null') } catch { return null } }
export function timerStarten(id, gewerk = '', leistung = '') {
  const tm = { gewerk, leistung, startTs: Date.now(), pauses: [] }
  localStorage.setItem(TIMERKEY(id), JSON.stringify(tm))
  return tm
}

// Ort aus einem Namen oder einer PLZ bestimmen (Open-Meteo-Geocoding), z. B. der Firmensitz als Rückfall fürs Wetter
export async function ortAusName(name) {
  if (!name || !String(name).trim()) throw new Error('kein Ort')
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&countryCode=DE&name=' + encodeURIComponent(String(name).trim()))
  const t = r.ok ? ((await r.json()).results || [])[0] : null
  if (!t) throw new Error('Ort nicht gefunden')
  return { lat: t.latitude, lng: t.longitude }
}
