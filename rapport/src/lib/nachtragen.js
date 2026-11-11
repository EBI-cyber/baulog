import { db, speichern } from './db'
import { mindestPause } from './profil'
import { LOHN_STANDARD } from './lohn'
import { statusKey } from './rapporte'
import { ausKey, wochenKey, wochenTage, isoDatum } from './zeit'

/** "9,50" / "9.5" / "9:30" → Minuten (Rapportzettel rechnen dezimal: 10,75 = 10 h 45 min) */
export function stundenMinuten(t) {
  const s = String(t ?? '').trim().replace(',', '.')
  if (!s) return 0
  if (s.includes(':')) {
    const [h, m] = s.split(':').map((x) => parseInt(x, 10) || 0)
    return h * 60 + m
  }
  const v = parseFloat(s)
  return isNaN(v) || v < 0 ? 0 : Math.round(v * 60)
}

/** "Stüssi" / "Stüssi AG" / "Stüssi Betonvorfabrikation AG" = dieselbe Firma (erstes Wort) */
export const kern = (x) => String(x || '').toLowerCase().trim().split(/\s+/)[0]

/**
 * Link-Parameter → Vorgabe. h=9.5,8.5,… (Stunden Mo–So) | z=06:45-09:00_09:15-12:00;… (genaue Blöcke,
 * Tage mit ;) | n=Notiz;… | f Firma, bu Büro, a Adresse, o Ort, kt Kanton, ueb Überstunden, b Beginn, papier=1
 */
export function vorgabeAus(such) {
  if (!such.has('h') && !such.has('z')) return null
  return {
    stunden: (such.get('h') || '').split(/[;,]/).map((x) => x.trim()),
    zeiten: (such.get('z') || '').split(';').map((tag) => tag.split('_').map((b) => b.split('-').map((x) => x.trim())).filter((b) => b.length === 2 && b[0] && b[1])),
    notizen: (such.get('n') || '').split(';'),
    firma: such.get('f') || '', buero: such.get('bu') || '', adresse: such.get('a') || '', ort: such.get('o') || '', baustelle: such.get('bs') || '',
    kanton: such.get('kt') || '', ueberstunden: such.get('ueb') || '', beginn: such.get('b') || '', papier: such.get('papier') === '1',
  }
}

/** Alle Nachtrag-Links aus einem Text (z.B. aus der Zwischenablage) → [{ woche, key, vorgabe }] */
export function linksLesen(text) {
  const funde = []
  // tolerant: Zeilenumbrüche/Leerzeichen mitten im Link (Umbruch beim Kopieren) entfernen, Links neu trennen
  const chunks = []
  for (const zeile of String(text || '').replace(/&amp;/g, '&').replace(/\s*\bKW\s*\d{1,2}\s*:\s*/gi, '\n').split(/\r?\n/)) {
    const z = zeile.trim()
    if (!z) continue
    if (/woche\/\d{4}-W\d{2}/.test(z) || /^https?:/.test(z)) chunks.push(z)
    else if (chunks.length && !/^(KW|Woche)\s*\d/i.test(z)) chunks[chunks.length - 1] += z // umgebrochener Link
  }
  // Leerzeichen im Link (dekodiert kopiert) wieder kodieren; mehrere Links in einer Zeile trennen
  const roh = chunks.map((c) => c.replace(/(.)(https?:\/\/)/g, '$1\n$2').split('\n').map((x) => x.trim().replace(/ /g, '%20')).join('\n')).join('\n')
  const re = /woche\/(\d{4}-W\d{2})\?([^\s<>"']+)/g
  const seen = new Set()
  let m
  while ((m = re.exec(roh))) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    const woche = ausKey(m[1])
    const vorgabe = woche && vorgabeAus(new URLSearchParams(m[2]))
    if (vorgabe) funde.push({ woche, key: m[1], vorgabe })
  }
  return funde
}

/** Tageszeilen einer Woche: genaue Zeiten (Lücken = Pausen) oder Stunden + Beginn + Pause (ArG-Mindestpause) */
export function zeilenBerechnen({ woche, stunden = [], zeiten = [], pausen = [], notizen = [], beginn, vorhanden = [] }) {
  return wochenTage(woche).map((t, i) => {
    const datum = isoDatum(t)
    const schon = vorhanden.filter((s) => s.datum === datum)
    const notiz = notizen[i] || ''
    if (zeiten[i]?.length) {
      const ts = zeiten[i].map(([a, b]) => [new Date(`${datum}T${a}`).getTime(), new Date(`${datum}T${b}`).getTime()])
      const min = ts.reduce((s, [a, b]) => s + Math.max(0, b - a), 0) / 60000
      const luecken = ts.slice(1).map(([a], k) => ({ start: ts[k][1], ende: a })).filter((x) => x.ende > x.start)
      const pause = luecken.reduce((s, x) => s + (x.ende - x.start), 0) / 60000
      return { t, i, datum, min, pause, start: ts[0][0], ende: ts[ts.length - 1][1], luecken, genau: true, notiz, schon }
    }
    const min = stundenMinuten(stunden[i])
    const pause = pausen[i] ?? mindestPause(min)
    const start = new Date(`${datum}T${beginn || '07:00'}`).getTime()
    return { t, i, datum, min, pause, start, ende: start + (min + pause) * 60000, notiz, schon }
  })
}

/** Firma + Büro als Einsatz sichern (anlegen bzw. ergänzen) */
export async function einsatzSichern({ firma, buero, vorgabe = {} }) {
  const einsatz = await db.einsaetze.where('firma').equals(firma).first()
  await db.einsaetze.put({
    ...(einsatz || { firma, rapportVorlage: 'formular', fotos: [], unterschreiber: [], ...LOHN_STANDARD }),
    buero,
    firmaAdresse: einsatz?.firmaAdresse || vorgabe.adresse || '',
    einsatzort: einsatz?.einsatzort || vorgabe.ort || '',
    baustelle: einsatz?.baustelle || vorgabe.baustelle || '',
    kanton: einsatz?.kanton || vorgabe.kanton || '',
    ueberstundenModus: einsatz?.ueberstundenModus || vorgabe.ueberstunden || 'woche',
  })
}

/** Neue Tage speichern (schon erfasste bleiben), optional Woche als auf Papier abgegeben markieren */
export async function zeilenSpeichern({ woche, zeilen, firma, papier }) {
  const neu = zeilen.filter((z) => z.min > 0 && !z.schon.length && z.start <= Date.now())
  for (const z of neu) {
    const notiz = [z.notiz, papier ? 'vom Papier-Rapport nachgetragen' : 'nachgetragen'].filter(Boolean).join(' · ')
    await speichern(z.genau
      ? { start: z.start, ende: z.ende, pausen: z.luecken, firma, notiz }
      : { start: z.start, ende: z.ende, pausen: [], pauseMin: z.pause, firma, notiz })
  }
  if (papier) {
    const k = statusKey(wochenKey(woche), firma)
    const alt = (await db.wochen.get(k)) || { key: k }
    await db.wochen.put({ ...alt, gesendetAm: alt.gesendetAm || Date.now(), gesendetAn: alt.gesendetAn || 'Büro (Papier-Rapport)' })
  }
  return neu.length
}
