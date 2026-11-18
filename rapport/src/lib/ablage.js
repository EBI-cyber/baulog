import { db } from './db'
import { ladeEinstellungen, speichereEinstellungen } from './settings'
import { gruppenLaden, statusKey } from './rapporte'
import { gruppenPdf, zeitnachweisDatei, ordnerPfad } from './versand'
import { fotosZuPdf } from './papierrapport'
import { dateiName } from './pdf'
import { sicherungsDatei, SICHERUNG_ORDNER, hatDaten } from './sicherung'
import { blobZuBase64 } from './microsoft'
import { ausKey } from './zeit'

/**
 * OneDrive-Ablage über einen iPhone-Kurzbefehl (ohne Microsoft-App-Registrierung):
 * Die App legt ein Paket { dateien: [{ ziel, daten }] } in die Zwischenablage (ziel = „Rapporte/2026/11 November/KW46_…pdf“,
 * daten = Base64) und startet den Kurzbefehl „Rapport ablegen“. Der Kurzbefehl dekodiert jede Datei und sichert sie mit
 * „Datei sichern“ in OneDrive – fehlende Ordner (Jahr, Monat) legt iOS dabei selbst an, gleichnamige Dateien werden ersetzt.
 */
export const KURZBEFEHL = 'Rapport ablegen'
export const ablageAktiv = () => !!ladeEinstellungen().ablageKurzbefehl

/** Gesendete/abgeschlossene Rapporte, die noch nicht in OneDrive liegen */
export async function offeneAblagen() {
  const alle = await db.wochen.toArray()
  return alle.filter((s) => s.key.includes('|') && (s.gesendetAm || s.abgeschlossenAm || s.papierBilder?.length) && !s.abgelegtAm && !s.gespeichertAm)
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** Dateien einer Woche/Firma: Rapport (bzw. Foto des unterschriebenen Papier-Rapports) + Zeitnachweis */
export async function dateienFuer(key, einst = ladeEinstellungen()) {
  const [wKey, firma] = key.split('|')
  const woche = ausKey(wKey)
  const status = (await db.wochen.get(key)) || {}
  const gruppen = await gruppenLaden(wKey, einst)
  const mehrere = gruppen.length > 1
  const g = gruppen.find((x) => x.firma === firma) || { firma, buero: einst.buero, schichten: [], absenzen: [], spesen: [], einst }
  const ordner = ordnerPfad(einst.onedriveOrdner, woche, g)
  const out = []
  if (status.papierBilder?.length) out.push({ ordner, name: dateiName(einst, woche, mehrere ? firma : null, 'Rapport_unterschrieben'), blob: fotosZuPdf(status.papierBilder) })
  else if (g.schichten.length || g.absenzen.length) out.push({ ordner, ...gruppenPdf(g, woche, status, mehrere) })
  if (g.schichten.length) out.push({ ordner, ...zeitnachweisDatei(g, woche, mehrere) })
  return out
}

/** Paket für den Kurzbefehl (JSON-Text) */
async function paket(dateien) {
  const liste = []
  for (const d of dateien) liste.push({ ziel: `${d.ordner}/${d.name}`, daten: await blobZuBase64(d.blob) })
  return JSON.stringify({ dateien: liste })
}

/**
 * Dateien in OneDrive ablegen: muss direkt aus einem Tipp aufgerufen werden (Zwischenablage + Kurzbefehl öffnen).
 * keys: Wochen/Firmen, die danach als abgelegt markiert werden. mitSicherung: Datensicherung dazulegen.
 */
export async function ablegen({ keys = [], dateien = null, mitSicherung = false }) {
  const einst = ladeEinstellungen()
  const sammeln = async () => {
    const alle = dateien ? [...dateien] : []
    for (const k of keys) alle.push(...await dateienFuer(k, einst))
    if (mitSicherung && await hatDaten()) { const s = await sicherungsDatei(); alle.push({ ordner: SICHERUNG_ORDNER, ...s }) }
    if (!alle.length) throw new Error('Keine Dateien zum Ablegen.')
    return { alle, text: await paket(alle) }
  }
  // iOS erlaubt das Schreiben in die Zwischenablage nur direkt im Tipp → ClipboardItem mit Promise
  let ergebnis = null
  const arbeit = sammeln().then((r) => { ergebnis = r; return r })
  if (window.ClipboardItem && navigator.clipboard?.write) {
    await navigator.clipboard.write([new window.ClipboardItem({ 'text/plain': arbeit.then((r) => new Blob([r.text], { type: 'text/plain' })) })])
  } else {
    await navigator.clipboard.writeText((await arbeit).text)
  }
  await arbeit
  window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(KURZBEFEHL)}&input=clipboard`
  const jetzt = Date.now()
  for (const k of keys) {
    const alt = (await db.wochen.get(k)) || { key: k }
    await db.wochen.put({ ...alt, abgelegtAm: jetzt, abgelegtPfad: ergebnis.alle.find((d) => d.ordner !== SICHERUNG_ORDNER)?.ordner || '' })
  }
  if (mitSicherung) speichereEinstellungen({ ...ladeEinstellungen(), letzteSicherung: jetzt, letzteSicherungPfad: SICHERUNG_ORDNER + ' (Kurzbefehl)' })
  return ergebnis.alle
}

/** Testdatei „Rapporte/Test.txt“ */
export function testAblegen() {
  const blob = new Blob([`Test der Ablage aus der Rapport-App – ${new Date().toLocaleString('de-CH')}`], { type: 'text/plain' })
  return ablegen({ dateien: [{ ordner: 'Rapporte', name: 'Test.txt', blob }] })
}

export { statusKey }
