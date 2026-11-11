/**
 * Datei über das iPhone-Teilen-Menü weitergeben (WhatsApp, „In Dateien sichern" → OneDrive …).
 * WICHTIG (iOS): muss direkt aus dem Knopf-Klick aufgerufen werden, ohne vorheriges await.
 * Rückgabe: 'geteilt' | 'abgebrochen' | 'heruntergeladen'
 */
export async function teileDatei(blob, dateiname) {
  const file = new File([blob], dateiname, { type: blob.type || 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      // bewusst ohne "text": WhatsApp auf iOS verwirft sonst teilweise die Datei
      await navigator.share({ files: [file], title: dateiname })
      return 'geteilt'
    } catch (e) {
      if (e?.name === 'AbortError') return 'abgebrochen'
      throw e
    }
  }
  herunterladen(blob, dateiname)
  return 'heruntergeladen'
}

export function herunterladen(blob, dateiname) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = dateiname
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** WhatsApp-Chat mit dem Büro öffnen (nur Text — Dateien gehen nur übers Teilen-Menü) */
export function whatsappLink(tel, text) {
  // wa.me braucht die internationale Nummer: 079 … → 4179 …, 0041 … → 41 …
  let nr = String(tel || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '')
  if (/^0\d{9}$/.test(nr)) nr = '41' + nr.slice(1)
  return `https://wa.me/${nr}?text=${encodeURIComponent(text)}`
}
