import { db } from './db'
import { rapportPdf, dateiName, zeitnachweisPdf } from './pdf'
import { msVerbunden, msVersand, msLaden } from './microsoft'
import { gruppenLaden, statusKey, rapportStatus } from './rapporte'
import { wochenRechnung, std } from './woche'
import { ausKey, wochenStart } from './zeit'
import { ladeEinstellungen } from './settings'
import { automatischSichern } from './sicherung'

const sauber = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '_').trim()

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
/** Monat einer Woche = Monat ihres Donnerstags (wie die ISO-Woche das Jahr bestimmt) → „11 November“ (sortiert richtig) */
export function wochenMonat(woche) {
  const d = wochenStart(woche); d.setDate(d.getDate() + 3)
  return `${String(d.getMonth() + 1).padStart(2, '0')} ${MONATE[d.getMonth()]}`
}

/** OneDrive-Ordner aus der Vorlage, z.B. "Rapporte/{jahr}/{monat}" → "Rapporte/2026/11 November" */
export function ordnerPfad(vorlage, woche, g) {
  return String(vorlage || 'Rapporte/{jahr}/{monat}')
    .replace(/\{jahr\}/g, woche.jahr).replace(/\{monat\}/g, wochenMonat(woche)).replace(/\{kw\}/g, String(woche.kw).padStart(2, '0'))
    .replace(/\{buero\}/g, sauber(g.buero) || 'Büro').replace(/\{firma\}/g, sauber(g.firma) || 'Firma')
}

export function mailText(g, woche, einst) {
  const h = std(wochenRechnung({ schichten: g.schichten, absenzen: g.absenzen, einst: g.einst }).total)
  const nr = g.einsatz?.einsatznummer ? `, Einsatz-Nr. ${g.einsatz.einsatznummer}` : ''
  return {
    betreff: `Rapport KW ${woche.kw}/${woche.jahr} – ${einst.name || ''} – ${g.firma}`.replace(/ – –/g, ' –'),
    text: `Guten Tag${g.einsatz?.bueroKontakt ? ' ' + g.einsatz.bueroKontakt : ''}\n\n` +
      `Im Anhang sende ich Ihnen meinen Rapport für KW ${woche.kw}/${woche.jahr} (Einsatz bei ${g.firma}${nr}): ${h} Stunden.\n\n` +
      `Freundliche Grüsse\n${einst.name || ''}`,
  }
}

/** Zeitnachweis (Arbeitsblöcke, Pausen, Projekt) einer Gruppe */
export function zeitnachweisDatei(g, woche, mehrere) {
  const blob = zeitnachweisPdf({ einst: g.einst, woche, schichten: g.schichten, absenzen: g.absenzen, spesen: g.spesen, einsatz: g.einsatz })
  return { blob, name: dateiName(g.einst, woche, mehrere ? g.firma : null, 'Zeitnachweis') }
}

/** PDF einer Gruppe mit den gespeicherten Unterschriften */
export function gruppenPdf(g, woche, status, mehrere) {
  const blob = rapportPdf({ einst: g.einst, woche, schichten: g.schichten, absenzen: g.absenzen, spesen: g.spesen, einsatz: g.einsatz, unterschriften: status })
  return { blob, name: dateiName(g.einst, woche, mehrere ? g.firma : null) }
}

/**
 * Rapport abschliessen: Unterschriften speichern, dann automatisch senden/sichern (falls Microsoft verbunden).
 * wunsch: { mail: bool, onedrive: bool }. Ohne Netz wird der Versand vorgemerkt und später nachgeholt.
 */
export async function abschliessen({ g, wKey, unterschriften, wunsch, mehrere }) {
  const key = statusKey(wKey, g.firma)
  const alt = (await db.wochen.get(key)) || { key }
  const status = { ...alt, ...unterschriften, abgeschlossenAm: Date.now(), versandOffen: null, fehler: null }
  await db.wochen.put(status)
  if (!msVerbunden()) return { status, ohneMicrosoft: true }
  return versenden(g, wKey, status, wunsch, mehrere)
}

async function versenden(g, wKey, status, wunsch, mehrere) {
  const woche = ausKey(wKey), einst = ladeEinstellungen()
  const datei = gruppenPdf(g, woche, status, mehrere)
  const mailAn = g.einsatz?.bueroEmail
  const m = mailText(g, woche, einst)
  const cc = einst.kopieAnMich ? msLaden().konto : ''
  try {
    // Durchschlag an den Einsatzbetrieb: per E-Mail; für WhatsApp ein OneDrive-Link (nur ansehen)
    // Bei Vertretung bekommt der Haupt-Unterzeichner (z.B. Polier) eine Kopie zur Kenntnis
    const an = status.kopieEmail || (status.vertretungFuer && status.kopieCc) || ''
    const cc = status.kopieEmail && status.vertretungFuer ? status.kopieCc : ''
    const vertretungText = status.vertretungFuer
      ? `\n\nUnterschrieben von ${status.firmaName}${status.firmaFunktion ? ' (' + status.firmaFunktion + ')' : ''} in Vertretung von ${status.vertretungFuer}.` : ''
    const k = an ? {
      an, cc,
      betreff: `Durchschlag Rapport KW ${woche.kw}/${woche.jahr} – ${einst.name || ''}`,
      text: `Guten Tag\n\nIm Anhang der Durchschlag des unterschriebenen Rapports für KW ${woche.kw}/${woche.jahr} ` +
        `(${einst.name || ''}, Einsatz bei ${g.firma}).${vertretungText}\n\nFreundliche Grüsse\n${einst.name || ''}`,
    } : null
    const r = await msVersand({
      datei,
      onedrive: wunsch.onedrive || status.kopieTel ? { ordner: ordnerPfad(einst.onedriveOrdner, woche, g), link: !!status.kopieTel } : null,
      mail: wunsch.mail && mailAn ? { an: mailAn, cc, ...m } : null,
      kopie: k,
    })
    // Zeitnachweis daneben ablegen (gleicher Ordner, gleiche KW vorne im Namen)
    if (wunsch.onedrive) {
      try { await msVersand({ datei: zeitnachweisDatei(g, woche, mehrere), onedrive: { ordner: ordnerPfad(einst.onedriveOrdner, woche, g) } }) } catch { /* Rapport ist wichtiger */ }
    }
    const neu = { ...status, versandOffen: null, fehler: null }
    if (r.mail?.ok) neu.gesendetAm = Date.now(), neu.gesendetAn = r.mail.an.join(', ')
    if (r.onedrive?.ok) neu.gespeichertAm = Date.now(), neu.onedrivePfad = r.onedrive.pfad, neu.onedriveUrl = r.onedrive.url
    if (r.onedrive?.link) neu.kopieLink = r.onedrive.link
    if (r.kopie?.ok) neu.kopieGesendetAm = Date.now()
    const fehler = [r.kopie && !r.kopie.ok && `Durchschlag: ${r.kopie.fehler}`, r.mail && !r.mail.ok && `E-Mail: ${r.mail.fehler}`, r.onedrive && !r.onedrive.ok && `OneDrive: ${r.onedrive.fehler}`].filter(Boolean)
    if (wunsch.mail && !mailAn) fehler.push('E-Mail: Im Einsatz ist keine E-Mail des Büros eingetragen')
    if (fehler.length) neu.fehler = fehler.join(' · ')
    await db.wochen.put(neu)
    automatischSichern(true).catch(() => {}) // nach jedem Abschluss auch die Daten sichern
    return { status: neu, r }
  } catch (e) {
    // kein Netz o.ä.: vormerken und beim nächsten Öffnen nachholen
    const neu = { ...status, versandOffen: wunsch, fehler: e.message }
    await db.wochen.put(neu)
    return { status: neu, fehler: e.message }
  }
}

let laeuft = false
/** Vorgemerkte Versände nachholen (App-Start, wieder online) */
export async function ausstehendeVersenden() {
  if (laeuft || !msVerbunden() || !navigator.onLine) return
  laeuft = true
  try {
    const offen = await db.wochen.filter((w) => !!w.versandOffen).toArray()
    for (const s of offen) {
      const [wKey, firma] = s.key.split('|')
      const gruppen = await gruppenLaden(wKey, ladeEinstellungen())
      const g = gruppen.find((x) => x.firma === firma)
      if (g) await versenden(g, wKey, s, s.versandOffen, gruppen.length > 1)
    }
  } finally { laeuft = false }
}

export { rapportStatus }
