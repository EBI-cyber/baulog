import { ladeBild, scanFarbe } from './scan'

/**
 * Blanko-Rapportformular des Temporärbüros als Hintergrund für den PDF-Rapport vorbereiten.
 * PDF (Scan, z.B. aus der Kamera-App „Dokumente scannen“): das eingebettete JPEG wird direkt aus der Datei gelesen –
 * ohne PDF-Bibliothek. Foto: unverändert. Danach Papier weiss machen (Scan-Filter) und auf 2400 px verkleinern.
 * Das Formular bleibt nur auf dem Gerät (im Einsatz gespeichert).
 */
function jpegAusPdf(bytes) {
  const text = new TextDecoder('latin1').decode(bytes)
  let bestes = null
  let i = 0
  while ((i = text.indexOf('/DCTDecode', i)) !== -1) {
    const s = text.indexOf('stream', i)
    if (s === -1) break
    let start = s + 6
    if (text[start] === '\r') start++
    if (text[start] === '\n') start++
    const ende = text.indexOf('endstream', start)
    if (ende === -1) break
    const stueck = bytes.subarray(start, ende)
    if (stueck[0] === 0xff && stueck[1] === 0xd8 && (!bestes || stueck.length > bestes.length)) bestes = stueck
    i = ende
  }
  return bestes
}

export async function formularAusDatei(datei) {
  let url
  if (datei.type === 'application/pdf' || /\.pdf$/i.test(datei.name || '')) {
    const jpg = jpegAusPdf(new Uint8Array(await datei.arrayBuffer()))
    if (!jpg) throw new Error('In diesem PDF ist kein gescanntes Bild. Bitte das Formular fotografieren oder mit „Dokumente scannen“ als PDF sichern.')
    url = URL.createObjectURL(new Blob([jpg], { type: 'image/jpeg' }))
  } else url = URL.createObjectURL(datei)
  try {
    const img = await ladeBild(url)
    let w = img.naturalWidth, h = img.naturalHeight
    const quer = w >= h
    const f = Math.min(1, 2400 / Math.max(w, h))
    const c = document.createElement('canvas')
    // hochkant gescannt → quer drehen (Formular ist A4 quer)
    if (quer) { c.width = Math.round(w * f); c.height = Math.round(h * f); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height) }
    else { c.width = Math.round(h * f); c.height = Math.round(w * f); const x = c.getContext('2d'); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(img, 0, 0, c.height, c.width) }
    scanFarbe(c)
    return c.toDataURL('image/jpeg', 0.85)
  } finally { URL.revokeObjectURL(url) }
}
