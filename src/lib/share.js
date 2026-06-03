export async function sharePdf(doc, filename) {
  let blob = null
  try { blob = doc.output('blob') } catch { blob = null }
  if (!blob) { try { doc.save(filename) } catch {} ; return }

  // 1) Natives Teilen (Handy) — bei jedem Fehler außer Abbruch auf Download zurückfallen
  try {
    const file = new File([blob], filename, { type: 'application/pdf' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename })
      return
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return
  }

  // 2) Download per Link
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 8000)
    return
  } catch {}

  // 3) Letzter Ausweg: jsPDF-eigener Save
  try { doc.save(filename) } catch {}
}
