import { db } from './db'
import { schnappschuss, signaturAnlegen, signaturStatus, signaturLink } from './signatur'
import { gruppenLaden, statusKey } from './rapporte'
import { abschliessen } from './versand'
import { ladeEinstellungen } from './settings'
import { liste, standardPerson, finde, merken } from './unterschreiber'
import { msVerbunden } from './microsoft'
import { ausKey } from './zeit'

/**
 * Rapport zur Kontrolle vorab schicken: Der Polier bekommt per WhatsApp oder E-Mail einen Link
 * (Zeiten mit Pausen + Zeitnachweis-PDF) und unterschreibt auf seinem Handy, wann es ihm passt (z.B. Montag früh).
 * Die App holt die Unterschrift beim Öffnen bzw. jede Minute ab und schliesst dann automatisch ab
 * (E-Mail ans Büro + OneDrive) — bei unbekannten Unterzeichnern erst nach Bestätigung.
 * Im Wochenstatus: fern = { token, an, kanal, kontakt, gesendetAm, erledigt?, unterschriebenAm?, abgelehnt?, bestaetigen?, gesehen? }
 */

/** Link anlegen und im Wochenstatus vormerken (meine Unterschrift + Ort gleich mit speichern) */
export async function fernVorbereiten({ g, woche, wKey, ma, wer, maOrt, eb }) {
  // Empfänger als unterschriftsberechtigt merken (der Mitarbeiter hat ihn selbst gewählt) — nächstes Mal vorausgefüllt
  const einsatz = g.einsatz?.id ? await db.einsaetze.get(g.einsatz.id) : null
  const p = wer?.name?.trim() ? await merken(einsatz, { ...wer, bestaetigt: true }).catch(() => null) : null
  if (p && !wer.id) wer = { ...wer, id: p.id }
  const token = await signaturAnlegen(schnappschuss({ ...g, einsatz: einsatz || g.einsatz }, woche, ma))
  const key = statusKey(wKey, g.firma)
  const alt = (await db.wochen.get(key)) || { key }
  await db.wochen.put({ ...alt, maBild: ma.bild, maAm: ma.am, maOrt: maOrt || alt.maOrt || null, ...(eb || {}),
    fern: { token, an: wer?.name || '', unterschreiberId: wer?.id || null, kontakt: { email: wer?.email || '', tel: wer?.tel || '' }, angelegtAm: Date.now() } })
  return { token, link: signaturLink(token) }
}

export function fernText({ einst, woche, an, link }) {
  return `Guten Tag${an ? ' ' + an : ''}\n\nHier meine Arbeitszeiten für KW ${woche.kw}/${woche.jahr} zur Kontrolle (mit Pausen). ` +
    `Bitte prüfen und auf Ihrem Handy unterschreiben — bis Montag früh:\n${link}\n\nVielen Dank und freundliche Grüsse\n${einst.name || ''}`
}

/** Als gesendet markieren (Kanal: whatsapp | email | teilen) */
export async function fernGesendet(wKey, firma, kanal) {
  const key = statusKey(wKey, firma)
  const s = await db.wochen.get(key)
  if (s?.fern) await db.wochen.put({ ...s, fern: { ...s.fern, kanal, gesendetAm: Date.now() } })
}

let laeuft = false
/** Offene Fern-Unterschriften abholen; unterschrieben → automatisch abschliessen und senden */
export async function fernPruefen() {
  if (laeuft || !navigator.onLine) return
  laeuft = true
  try {
    const offen = await db.wochen.filter((w) => !!w.fern?.token && !w.fern.erledigt).toArray()
    for (const s of offen) {
      const r = await signaturStatus(s.fern.token, true).catch(() => null)
      if (!r || r.status === 'offen') continue
      if (r.status === 'abgelehnt') {
        await db.wochen.put({ ...s, fern: { ...s.fern, erledigt: true, abgelehnt: { name: r.name || '', bemerkung: r.bemerkung || '', am: Date.now() } } })
        continue
      }
      if (r.status !== 'unterschrieben') continue
      const [wKey, firma] = s.key.includes('|') ? s.key.split('|') : [s.key, null]
      const einst = ladeEinstellungen()
      const gruppen = await gruppenLaden(wKey, einst)
      const g = gruppen.find((x) => x.firma === firma) || gruppen[0]
      const einsatz = g?.einsatz?.id ? await db.einsaetze.get(g.einsatz.id) : g?.einsatz
      const person = { id: r.unterschreiberId || null, name: r.name || '', funktion: r.funktion || '', email: r.email || '', tel: r.tel || '' }
      const bekannt = finde(einsatz, person)
      const haupt = standardPerson(einsatz)
      const vertretung = haupt && person.name && (bekannt ? bekannt.id !== haupt.id : person.name.trim().toLowerCase() !== haupt.name.trim().toLowerCase()) ? haupt : null
      const unterschriften = {
        firmaBild: r.bild, firmaName: person.name, firmaFunktion: person.funktion, firmaId: bekannt?.id || null,
        firmaAm: Date.parse(r.beantwortet) || Date.now(), firmaOrt: null,
        vertretungFuer: vertretung?.name || null, kopieCc: vertretung?.email || '',
        kopieEmail: person.email.trim(), kopieTel: person.tel.trim(),
        bewertung: r.bewertung ?? null, einsatzWeiter: r.einsatzWeiter ?? null, beendetAm: r.einsatzWeiter === false ? r.beendetAm : null,
      }
      // Unbekannte Person (nicht in der Liste der Unterschriftsberechtigten): erst vom Mitarbeiter bestätigen lassen
      if (!bekannt && liste(einsatz).length) {
        await db.wochen.put({ ...s, ...unterschriften, fern: { ...s.fern, erledigt: true, unterschriebenAm: Date.now(), bestaetigen: true } })
        continue
      }
      if (bekannt && (person.email || person.tel)) await merken(einsatz, { ...bekannt, email: person.email || bekannt.email, tel: person.tel || bekannt.tel, bestaetigt: true }).catch(() => {})
      await db.wochen.put({ ...s, fern: { ...s.fern, erledigt: true, unterschriebenAm: Date.now() } })
      if (g && msVerbunden()) {
        const res = await abschliessen({ g, wKey, unterschriften, wunsch: { mail: true, onedrive: true }, mehrere: gruppen.length > 1 })
        const neu = await db.wochen.get(s.key)
        await db.wochen.put({ ...neu, fern: { ...neu.fern, automatisch: true, fehler: res?.fehler || null } })
      } else {
        const neu = await db.wochen.get(s.key)
        await db.wochen.put({ ...neu, ...unterschriften, abgeschlossenAm: Date.now(), fern: { ...neu.fern, ohneMicrosoft: true } })
      }
    }
  } finally { laeuft = false }
}

/** Beim Start, beim Zurückkehren in die App und jede Minute nachsehen */
export function fernStarten() {
  const los = () => fernPruefen().catch(() => {})
  setTimeout(los, 3000)
  setInterval(() => { if (document.visibilityState === 'visible') los() }, 60000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') los() })
  window.addEventListener('online', los)
}

export const wocheVon = (key) => ausKey(String(key).split('|')[0])
