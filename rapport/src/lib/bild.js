/** Foto verkleinern → JPEG-DataURL (für KI und Ablage) */
export async function verkleinern(datei, max = 1800, qualitaet = 0.82) {
  const url = URL.createObjectURL(datei)
  try {
    const img = await new Promise((ok, fehler) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fehler; i.src = url })
    const f = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', qualitaet)
  } finally { URL.revokeObjectURL(url) }
}

/** Datei als Data-URL: Bilder verkleinert, PDFs unverändert (z.B. Lohnabrechnung oder Kontoauszug als PDF) */
export async function alsDataUrl(datei, max = 2000, qualitaet = 0.85) {
  if (datei.type === 'application/pdf' || /\.pdf$/i.test(datei.name || '')) {
    return await new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^;]*;/, 'data:application/pdf;')); r.onerror = nein; r.readAsDataURL(datei) })
  }
  return verkleinern(datei, max, qualitaet)
}
