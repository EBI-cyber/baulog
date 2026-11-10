// Ort/PLZ-Suche mit Kanton aus dem amtlichen Ortschaftenverzeichnis (lazy geladen, funktioniert offline).
let liste = null
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

async function laden() {
  if (!liste) {
    const { default: roh } = await import('./plzdaten.js')
    liste = roh.split('\n').map((z) => { const [plz, ort, kanton] = z.split('|'); return { plz, ort, kanton, n: norm(ort) } })
  }
  return liste
}

/** Treffer für „Zug“, „6300“, „8108 Dällikon“, „dallikon“ … (max. 8) */
export async function ortSuchen(eingabe, max = 8) {
  const q = norm(eingabe)
  if (q.length < 2) return []
  const l = await laden()
  const zahl = (q.match(/\d{4}/) || [])[0], wort = q.replace(/\d+/g, '').trim()
  const treffer = l.filter((x) => (!zahl || x.plz.startsWith(zahl)) && (!wort || x.n.startsWith(wort) || x.n.includes(' ' + wort)))
    .concat(!zahl && /^\d{2,3}$/.test(q) ? l.filter((x) => x.plz.startsWith(q)) : [])
  // exakte Namen zuerst, dann nach PLZ
  return treffer.sort((a, b) => (b.n === wort) - (a.n === wort) || a.plz.localeCompare(b.plz)).slice(0, max)
}

/** Kanton zu einem Text wie „8108 Dällikon“ (PLZ bevorzugt) */
export async function kantonZu(text) {
  const t = (await ortSuchen(text, 1))[0]
  return t?.kanton || ''
}
