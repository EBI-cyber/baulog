import { jsPDF } from 'jspdf'
import { TAGE, wochenTage, isoDatum, datumLang, datumKurz, uhr, pauseMs, arbeitMs, hm, dezimal } from './zeit'
import { absenzArt, spesenArt } from './arten'
import { zahl } from './settings'
import { wochenRechnung, std } from './woche'

export function dateiName(einst, w) {
  const name = (einst.name || 'Mitarbeiter').trim().replace(/\s+/g, '_').replace(/[^\wäöüÄÖÜß-]/g, '')
  return `Rapport_KW${String(w.kw).padStart(2, '0')}_${w.jahr}_${name}.pdf`
}

/**
 * Wochenrapport als PDF (vorläufiges Layout — wird später an die Vorlage angepasst).
 * Gibt einen Blob zurück.
 */
export function rapportPdf({ einst, woche, schichten, absenzen = [], spesen = [] }) {
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

  let summePause = 0
  const neueSeiteWennNoetig = (platz = 12) => { if (y > 285 - platz) { doc.addPage(); y = 20 } }
  const zeile = (werte, grau) => {
    neueSeiteWennNoetig()
    doc.setTextColor(grau ? 160 : 0)
    werte.forEach((v, i) => {
      const t = doc.splitTextToSize(String(v ?? ''), sp[i].w - 2)[0] || ''
      doc.text(t, sp[i].x + 1.5, y)
    })
    doc.setDrawColor(220); doc.line(L, y + 2.5, R, y + 2.5)
    y += 8
  }
  for (const tag of tage) {
    const d = isoDatum(tag)
    const s = schichten.filter((x) => x.datum === d && x.ende != null).sort((a, b) => a.start - b.start)
    const abw = absenzen.filter((x) => x.datum === d)
    if (!s.length && !abw.length) { zeile([TAGE[tag.getDay()], datumKurz(tag), '–', '', '', '', '', ''], true); continue }
    for (const x of abw) {
      const h = zahl(x.stunden) * 3600000
      zeile([TAGE[tag.getDay()], datumKurz(tag), absenzArt(x.art).label + (x.halbtag ? ' (½ Tag)' : ''), '', '', '', hm(h), dezimal(h)])
    }
    for (const x of s) {
      const a = arbeitMs(x), p = pauseMs(x)
      summePause += p
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
  const r = wochenRechnung({ schichten, absenzen, spesen, einst })
  doc.text(std(r.total), sp[6].x + 1.5, y + 0.5)
  doc.text(r.total.toFixed(2), sp[7].x + 1.5, y + 0.5)

  // Zusammenfassung
  y += 12
  doc.setFontSize(9.5)
  const zus = [['Gearbeitet', `${std(r.arbeit)} h`], ['Abwesenheiten', `${std(r.absenzStd)} h`
    + (Object.keys(r.nachArt).length ? `  (${Object.entries(r.nachArt).map(([k, v]) => `${k}: ${v} Tg.`).join(', ')})` : '')]]
  if (r.soll) zus.push(['Soll', `${std(r.soll)} h`], [r.differenz >= 0 ? 'Überstunden' : 'Minusstunden', `${r.differenz >= 0 ? '+' : ''}${std(r.differenz)} h`])
  for (const [k, v] of zus) {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(90); doc.text(k, L, y)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(0); doc.text(v, L + 38, y)
    y += 5.5
  }

  // Spesen
  if (spesen.length) {
    y += 5; neueSeiteWennNoetig(20)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Spesen', L, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    for (const x of [...spesen].sort((a, b) => a.datum.localeCompare(b.datum))) {
      neueSeiteWennNoetig()
      const art = spesenArt(x.art).label + (x.km ? ` (${x.km} km)` : '')
      doc.text(datumKurz(new Date(x.datum + 'T12:00')), L, y)
      doc.text(doc.splitTextToSize(`${art}${x.notiz ? ' – ' + x.notiz : ''}`, 120)[0], L + 16, y)
      doc.text(`${einst.waehrung} ${zahl(x.betrag).toFixed(2)}`, R, y, { align: 'right' })
      y += 5
    }
    doc.setFont('helvetica', 'bold')
    doc.text('Total Spesen', L + 16, y + 1); doc.text(`${einst.waehrung} ${r.spesen.toFixed(2)}`, R, y + 1, { align: 'right' })
    y += 6
  }

  // Bemerkungen
  const notizen = [
    ...schichten.filter((x) => x.notiz?.trim()).map((x) => ({ d: isoDatum(new Date(x.start)), t: x.notiz.trim() })),
    ...absenzen.filter((x) => x.notiz?.trim() || x.zeugnis).map((x) => ({ d: x.datum,
      t: [absenzArt(x.art).label, x.zeugnis ? 'Arztzeugnis vorhanden' : '', x.notiz?.trim()].filter(Boolean).join(' – ') })),
  ].sort((a, b) => a.d.localeCompare(b.d))
  y += 8
  if (notizen.length) {
    neueSeiteWennNoetig(20)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0); doc.text('Bemerkungen', L, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    for (const n of notizen) {
      const zeilen = doc.splitTextToSize(`${datumKurz(new Date(n.d + 'T12:00'))}: ${n.t}`, R - L)
      neueSeiteWennNoetig(); doc.text(zeilen, L, y); y += zeilen.length * 4.5 + 1
    }
    y += 4
  }

  // Unterschriften
  if (y > 262) { doc.addPage(); y = 40 }
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
