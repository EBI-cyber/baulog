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
    if (!gefunden) { // ganze Franken nur mit eindeutigem Vorzeichen/CHF: „+800“, „CHF 800“, „800 CHF“
      const g = /(?:([+\-−–])\s?(?:CHF\s?)?|CHF\s?)(\d{1,3}(?:['’ ]\d{3})+|\d+)(?![.,\d])|(\d{1,3}(?:['’ ]\d{3})+|\d+)\s?CHF\b/.exec(zeile)
      if (g && datum) {
        const betrag = parseFloat((g[2] || g[3]).replace(/['’ ]/g, '')) * (/[-−–]/.test(g[1] || '') ? -1 : 1)
        if (betrag) { funde.push({ datum, betrag, text: [...puffer, zeile.replace(g[0], ' ')].join(' ').replace(/\bCHF\b/g, ' ').replace(/\s+/g, ' ').trim() }); gefunden = true }
      }
    }
    puffer = gefunden ? [] : [...puffer, zeile].slice(-3)
  }
  return funde
}

const wort = (x) => String(x || '').toLowerCase().trim().split(/\s+/)[0]

/** ISO-Kalenderwoche eines Datums */
export function kwVon(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)
}

/**
 * Wochen-Vorschuss bezahlt die Vorwoche (z.B. am Do 05.11. für KW 44 = 26.–30.10.) → Monat der Vorwoche
 * (nach deren Mittwoch, also dem Monat mit den meisten Arbeitstagen). Gibt { fuerMonat, kw } zurück.
 */
export function vorwocheVon(datum) {
  const d = new Date(datum + 'T12:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 + 2) // Mittwoch der Vorwoche
  return { fuerMonat: isoDatum(d).slice(0, 7), kw: kwVon(d) }
}

/** Normalisierter Absender-/Text-Anfang (für gelernte Muster, wenn der Verwendungszweck mager ist) */
export const muster = (text) => String(text || '').toLowerCase().replace(/[^a-zäöüéèà ]/g, ' ').replace(/\b(gutschrift|zahlung|eingang|überweisung|ueberweisung|sepa|ch|ag|gmbh|sa)\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ')

/** Vom Büro? Art und Monat vorschlagen. bueros = Büro-Namen aus Einsätzen/Einstellungen, gelernt = gemerkte Muster */
export function einordnen(b, bueros = [], gelernt = []) {
  const t = b.text.toLowerCase()
  const m = muster(b.text)
  const vomBuero = bueros.some((x) => wort(x).length > 2 && t.includes(wort(x))) || (m.length > 2 && gelernt.includes(m))
  const lohnWort = /lohn|salär|salaer|gehalt|salary/.test(t)
  const vorschussWort = /vorschuss|akonto|a-konto|vorauszahlung|abschlag/.test(t)
  const relevant = b.betrag > 0 && (vomBuero || lohnWort || vorschussWort)
  const art = vorschussWort ? 'vorschuss' : lohnWort ? 'lohn' : 'vorschuss'
  const buero = bueros.find((x) => t.includes(wort(x))) || (vomBuero ? bueros[0] || '' : '')
  return { ...b, relevant, art, ...monatFuer(b.datum, art), buero }
}

/** Vorschuss → Monat der bezahlten Vorwoche; Lohn-Restzahlung bis zum 20. → Vormonat, sonst Zahlungsmonat */
export function monatFuer(datum, art) {
  if (art === 'vorschuss') return vorwocheVon(datum)
  const d = new Date(datum + 'T12:00')
  if (art === 'lohn' && d.getDate() <= 20) d.setDate(0)
  return { fuerMonat: isoDatum(d).slice(0, 7), kw: null }
}

export const schluessel = (b) => `${b.datum}|${Number(b.betrag).toFixed(2)}`

