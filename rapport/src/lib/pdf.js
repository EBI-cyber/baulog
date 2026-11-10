import { jsPDF } from 'jspdf'
import { TAGE, wochenTage, isoDatum, datumLang, datumKurz, uhr, pauseMs, arbeitMs, hm, dezimal } from './zeit'

export function dateiName(einst, w) {
  const name = (einst.name || 'Mitarbeiter').trim().replace(/\s+/g, '_').replace(/[^\wäöüÄÖÜß-]/g, '')
  return `Rapport_KW${String(w.kw).padStart(2, '0')}_${w.jahr}_${name}.pdf`
}

/**
 * Wochenrapport als PDF (vorläufiges Layout — wird später an die Vorlage angepasst).
 * Gibt einen Blob zurück.
 */
export function rapportPdf({ einst, woche, schichten }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const tage = wochenTage(woche)
  const L = 15, R = 195
  const firmen = [...new Set(schichten.map((s) => s.firma).filter(Boolean))]

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
  doc.text('Arbeitsrapport', L, 22)
  doc.setFontSize(13)
  doc.text(`KW ${woche.kw} / ${woche.jahr}`, R, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(`${datumLang(tage[0])} – ${datumLang(tage[6])}`, R, 28, { align: 'right' })

  const feld = (label, wert, y) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110)
    doc.text(label, L, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0)
    doc.text(wert || '—', L + 38, y)
  }
  feld('Mitarbeiter', einst.name, 40)
  feld('Temporärbüro', einst.buero, 47)
  feld('Einsatzbetrieb', firmen.join(', ') || '—', 54)
  doc.setDrawColor(180); doc.line(L, 59, R, 59)

  // Tabelle
  const sp = [
    { t: 'Tag', x: L, w: 14 }, { t: 'Datum', x: L + 14, w: 20 }, { t: 'Einsatzbetrieb', x: L + 34, w: 58 },
    { t: 'Beginn', x: L + 92, w: 18 }, { t: 'Ende', x: L + 110, w: 18 }, { t: 'Pause', x: L + 128, w: 18 },
    { t: 'Std.', x: L + 146, w: 17 }, { t: 'Dezimal', x: L + 163, w: 17 },
  ]
  let y = 68
  doc.setFillColor(235, 245, 248); doc.rect(L, y - 5.5, R - L, 8, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  sp.forEach((c) => doc.text(c.t, c.x + 1.5, y))
  y += 8
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)

  let summe = 0, summePause = 0
  const zeile = (werte, grau) => {
    doc.setTextColor(grau ? 160 : 0)
    werte.forEach((v, i) => {
      const t = doc.splitTextToSize(String(v ?? ''), sp[i].w - 2)[0] || ''
      doc.text(t, sp[i].x + 1.5, y)
    })
    doc.setDrawColor(220); doc.line(L, y + 2.5, R, y + 2.5)
    y += 8
  }
  for (const tag of tage) {
    const s = schichten.filter((x) => x.datum === isoDatum(tag) && x.ende != null).sort((a, b) => a.start - b.start)
    if (!s.length) { zeile([TAGE[tag.getDay()], datumKurz(tag), '–', '', '', '', '', ''], true); continue }
    for (const x of s) {
      const a = arbeitMs(x), p = pauseMs(x)
      summe += a; summePause += p
      zeile([TAGE[tag.getDay()], datumKurz(tag), x.firma, uhr(x.start), uhr(x.ende), hm(p), hm(a), dezimal(a)])
    }
  }
  doc.setTextColor(0)

  // Summe
  y += 2
  doc.setFillColor(235, 245, 248); doc.rect(L, y - 5.5, R - L, 9, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('Total Woche', L + 1.5, y + 0.5)
  doc.text(hm(summePause), sp[5].x + 1.5, y + 0.5)
  doc.text(hm(summe), sp[6].x + 1.5, y + 0.5)
  doc.text(dezimal(summe), sp[7].x + 1.5, y + 0.5)

  // Bemerkungen
  const notizen = schichten.filter((x) => x.notiz?.trim()).sort((a, b) => a.start - b.start)
  y += 14
  if (notizen.length) {
    doc.setFontSize(10); doc.text('Bemerkungen', L, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    for (const n of notizen) {
      const zeilen = doc.splitTextToSize(`${datumKurz(new Date(n.start))}: ${n.notiz.trim()}`, R - L)
      doc.text(zeilen, L, y); y += zeilen.length * 4.5 + 1
    }
    y += 4
  }

  // Unterschriften
  y = Math.max(y + 16, 250)
  doc.setDrawColor(120)
  doc.line(L, y, L + 75, y); doc.line(R - 75, y, R, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  doc.text('Datum / Unterschrift Mitarbeiter', L, y + 5)
  doc.text('Datum / Unterschrift Einsatzbetrieb', R - 75, y + 5)
  doc.setFontSize(7.5); doc.setTextColor(150)
  doc.text(`Erstellt am ${datumLang(new Date())} ${uhr(Date.now())} mit Rapport`, L, 289)

  return doc.output('blob')
}
