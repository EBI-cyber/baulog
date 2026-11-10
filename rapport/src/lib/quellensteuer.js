// Quellensteuer-Satz automatisch aus den offiziellen ESTV-Tarifen (beim Deploy nach public/qst/<jahr>/<kt>/<CODE>.json erzeugt).
// Massgebend: Wohnkanton, Tarifcode (A0N …) und das Monatseinkommen (brutto).

const SPEICHER = 'rapport.qst'
const cache = {}

function ausSpeicher(schluessel) {
  try { const s = JSON.parse(localStorage.getItem(SPEICHER) || '{}'); return s[schluessel] || null } catch { return null }
}
function inSpeicher(schluessel, daten) {
  try { localStorage.setItem(SPEICHER, JSON.stringify({ [schluessel]: daten })) } catch {}
}

/** Tarif laden (Jahr, sonst Vorjahr). Offline: zuletzt geladener Tarif aus dem Speicher. */
export async function tarifLaden(jahr, kanton, code) {
  if (!kanton || !code) return null
  const kt = kanton.toLowerCase()
  for (const j of [jahr, jahr - 1]) {
    const schluessel = `${j}/${kt}/${code}`
    if (cache[schluessel]) return cache[schluessel]
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}qst/${schluessel}.json`)
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        const d = await r.json()
        cache[schluessel] = d; inSpeicher(schluessel, d)
        return d
      }
    } catch { /* offline */ }
    const s = ausSpeicher(schluessel)
    if (s) return (cache[schluessel] = s)
  }
  return null
}

/** Satz in % für ein Monatseinkommen (Mindeststeuer berücksichtigt) */
export function satzFuer(tarif, monatsBrutto) {
  const st = tarif?.stufen
  if (!st?.length || !(monatsBrutto > 0)) return 0
  let lo = 0, hi = st.length - 1
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (st[m][0] <= monatsBrutto) lo = m; else hi = m - 1 }
  const [, satz, mindest = 0] = st[lo]
  const steuer = Math.max(monatsBrutto * satz / 10000, mindest / 100)
  return Math.round((steuer / monatsBrutto) * 10000) / 100
}
