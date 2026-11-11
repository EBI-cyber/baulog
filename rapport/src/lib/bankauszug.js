// Bankauszug lesen (ohne KI) und Gutschriften des Temporärbüros einordnen — ohne Abhängigkeiten (auch in Node testbar)
const isoDatum = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MONATE = { jan: 1, feb: 2, mär: 3, maer: 3, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 }
const p2 = (n) => String(n).padStart(2, '0')
const jahr4 = (j) => (j < 100 ? 2000 + j : j)

/** Datum in einer Zeile finden → { iso, rest } */
function datumIn(zeile, heute = new Date()) {
  let m = /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/.exec(zeile)
  if (m) return { iso: `${jahr4(+m[3])}-${p2(+m[2])}-${p2(+m[1])}`, rest: zeile.replace(m[0], ' ') }
  m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(zeile)
  if (m) return { iso: m[0], rest: zeile.replace(m[0], ' ') }
  m = /\b(\d{1,2})\.?\s+(jan|feb|mär|maer|mar|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|dez|dec)[a-zä]*\.?(?:\s+(\d{4}))?/i.exec(zeile)
  if (m) return { iso: `${m[3] || heute.getFullYear()}-${p2(MONATE[m[2].toLowerCase()])}-${p2(+m[1])}`, rest: zeile.replace(m[0], ' ') }
  if (/\bheute\b/i.test(zeile)) return { iso: isoDatum(heute), rest: zeile.replace(/\bheute\b/i, ' ') }
  if (/\bgestern\b/i.test(zeile)) { const d = new Date(heute); d.setDate(d.getDate() - 1); return { iso: isoDatum(d), rest: zeile.replace(/\bgestern\b/i, ' ') } }
  return null
}

/** Kopierten Buchungsverlauf ohne KI lesen (Zeile für Zeile: Datum merken, Beträge mit dem Text davor verbinden) */
export function buchungenLokal(text, heute = new Date()) {
  const funde = []
  let datum = null, puffer = []
  for (const roh of String(text || '').split(/\r?\n/)) {
    let zeile = roh.trim()
    if (!zeile) continue
    const d = datumIn(zeile, heute)
    if (d) { datum = d.iso; zeile = d.rest.trim() }
    if (/saldo|kontostand|verfügbar/i.test(zeile)) { puffer = []; continue }
    const re = /([+\-−–]?)\s?(?:CHF\s?)?(\d{1,3}(?:['’ ]\d{3})+|\d+)[.,](\d{2})(?!\d)/g
    let m, gefunden = false
    while ((m = re.exec(zeile))) {
      const betrag = parseFloat(m[2].replace(/['’ ]/g, '') + '.' + m[3]) * (/[-−–]/.test(m[1]) ? -1 : 1)
      const txt = [...puffer, zeile.replace(m[0], ' ')].join(' ').replace(/\bCHF\b/g, ' ').replace(/\s+/g, ' ').trim()
      if (datum && betrag) funde.push({ datum, betrag, text: txt })
      gefunden = true
    }
    puffer = gefunden ? [] : [...puffer, zeile].slice(-3)
  }
  return funde
}

const wort = (x) => String(x || '').toLowerCase().trim().split(/\s+/)[0]

/** Vom Büro? Art und Monat vorschlagen. buero = Liste der Büro-Namen aus Einsätzen/Einstellungen */
export function einordnen(b, bueros = []) {
  const t = b.text.toLowerCase()
  const vomBuero = bueros.some((x) => wort(x).length > 2 && t.includes(wort(x)))
  const lohnWort = /lohn|salär|salaer|gehalt|salary/.test(t)
  const vorschussWort = /vorschuss|akonto|a-konto|vorauszahlung|abschlag/.test(t)
  const relevant = b.betrag > 0 && (vomBuero || lohnWort || vorschussWort)
  const art = vorschussWort ? 'vorschuss' : lohnWort ? 'lohn' : 'vorschuss'
  const d = new Date(b.datum + 'T12:00')
  // Lohn-Restzahlung kommt meist Anfang Folgemonat → gehört zum Vormonat
  if (art === 'lohn' && d.getDate() <= 20) d.setMonth(d.getMonth() - 1)
  const buero = bueros.find((x) => t.includes(wort(x))) || ''
  return { ...b, relevant, art, fuerMonat: isoDatum(d).slice(0, 7), buero }
}

export const schluessel = (b) => `${b.datum}|${Number(b.betrag).toFixed(2)}`

