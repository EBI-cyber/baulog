import { jsPDF } from 'jspdf'

const eur = (n) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' EUR'
const hh = (min) => ((Number(min) || 0) / 60).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' h'
const num = (n) => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })
const dmy = (d) => { try { return new Date(d).toLocaleDateString('de-DE') } catch { return '' } }

export function buildLeistungsnachweis(projekt, eintraege, s, opts = {}) {
  const mitKosten = opts.mitKosten !== false
  const rate = Number(projekt.hourlyRate) || 0
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const M = 48, R = 547
  let y = 56
  const line = () => { doc.setDrawColor(210).line(M, y, R, y); y += 14 }
  const need = (h) => { if (y + h > 800) { doc.addPage(); y = 56 } }

  // Kopf
  doc.setFont('helvetica', 'bold').setFontSize(18).text(s.company || 'Leistungsnachweis', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  y += 16
  ;[s.owner, s.street, [s.zip, s.city].filter(Boolean).join(' '), s.taxId ? 'Steuernr.: ' + s.taxId : '']
    .filter(Boolean).forEach((t) => { doc.text(String(t), M, y); y += 12 })
  doc.setTextColor(0)

  y += 14
  doc.setFont('helvetica', 'bold').setFontSize(15).text('Leistungsnachweis', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(10)
  y += 20
  doc.text('Projekt: ' + (projekt.name || ''), M, y); y += 14
  if (projekt.customer) { doc.text('Kunde: ' + projekt.customer, M, y); y += 14 }
  if (projekt.address) { doc.text('Adresse: ' + projekt.address, M, y); y += 14 }
  const dates = eintraege.map((e) => e.createdAt).filter(Boolean).sort()
  if (dates.length) { doc.text('Zeitraum: ' + dmy(dates[0]) + ' – ' + dmy(dates[dates.length - 1]), M, y); y += 14 }
  doc.text('Erstellt: ' + dmy(new Date().toISOString()), M, y); y += 8
  line()

  // Leistungen gruppieren
  const groups = {}
  for (const e of eintraege) {
    if (['zeit', 'menge', 'material', 'maschine'].indexOf(e.type) === -1) continue
    const key = (e.gewerk || '') + ' › ' + (e.leistung || '(allgemein)')
    if (!groups[key]) groups[key] = { gewerk: e.gewerk, leistung: e.leistung || '(allgemein)', minutes: 0, menge: 0, einheit: '', material: 0, maschine: 0 }
    const g = groups[key]
    if (e.type === 'zeit') g.minutes += Number(e.minutes) || 0
    else if (e.type === 'menge') { g.menge += Number(e.menge) || 0; if (e.einheit) g.einheit = e.einheit }
    else if (e.type === 'material') g.material += (Number(e.qty) || 0) * (Number(e.unitCost) || 0)
    else if (e.type === 'maschine') g.maschine += ((Number(e.minutes) || 0) / 60) * (Number(e.satz) || 0)
  }
  const rows = Object.values(groups)

  // Spalten: Leistung | Menge | Stunden | EP (€/Einh) | Selbstkosten
  const cMenge = 248, cStd = 312, cEP = 372
  doc.setFont('helvetica', 'bold').setFontSize(11).text('Ausgeführte Leistungen', M, y); y += 16
  doc.setFontSize(9)
  doc.text('Leistung', M, y); doc.text('Menge', cMenge, y); doc.text('Stunden', cStd, y)
  if (mitKosten) { doc.text('EP €/Einh.', cEP, y); doc.text('Selbstkosten', R, y, { align: 'right' }) }
  doc.setFont('helvetica', 'normal'); y += 4; line()

  let sumMin = 0, sumCost = 0
  rows.forEach((g) => {
    need(16)
    const labor = (g.minutes / 60) * rate
    const total = labor + g.material + g.maschine
    const ep = g.menge > 0 ? total / g.menge : null
    sumMin += g.minutes; sumCost += total
    doc.text(g.gewerk + ' › ' + g.leistung, M, y, { maxWidth: 192 })
    doc.text(g.menge ? num(g.menge) + ' ' + (g.einheit || '') : '–', cMenge, y)
    doc.text(g.minutes ? hh(g.minutes) : '–', cStd, y)
    if (mitKosten) {
      doc.text(ep != null ? eur(ep).replace(' EUR', '') + (g.einheit ? '/' + g.einheit : '') : '–', cEP, y)
      doc.text(eur(total), R, y, { align: 'right' })
    }
    y += 16
  })
  y += 2; line()
  doc.setFont('helvetica', 'bold').setFontSize(10)
  doc.text('Summe Stunden: ' + hh(sumMin), M, y)
  if (mitKosten) doc.text('Selbstkosten gesamt: ' + eur(sumCost), R, y, { align: 'right' })
  doc.setFont('helvetica', 'normal'); y += 18

  // Tagebuch
  const diary = eintraege.filter((e) => e.type === 'tagebuch' && e.text)
  if (diary.length) {
    need(30); doc.setFont('helvetica', 'bold').setFontSize(11).text('Bautagebuch', M, y); doc.setFont('helvetica', 'normal').setFontSize(9); y += 16
    diary.forEach((e) => {
      const txt = dmy(e.createdAt) + ': ' + e.text
      const lines = doc.splitTextToSize(txt, R - M)
      need(lines.length * 12 + 4)
      doc.text(lines, M, y); y += lines.length * 12 + 4
    })
    y += 6
  }

  // Fotos
  const fotos = eintraege.filter((e) => e.type === 'foto' && e.dataUrl).slice(0, 8)
  if (fotos.length) {
    need(30); doc.setFont('helvetica', 'bold').setFontSize(11).text('Fotodokumentation', M, y); y += 16
    const w = 150, h = 110, gap = 12
    let x = M
    fotos.forEach((e) => {
      if (x + w > R) { x = M; y += h + 16 }
      need(h + 16)
      try { doc.addImage(e.dataUrl, 'JPEG', x, y, w, h) } catch { /* ignore */ }
      x += w + gap
    })
    y += h + 8
  }

  // Fußzeile auf jeder Seite
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(7).setTextColor(140)
    doc.text('Erstellt mit BauLog · ' + dmy(new Date().toISOString()) + ' · Seite ' + i + '/' + pages, M, 812)
    doc.setTextColor(0)
  }
  return doc
}

export const nachweisFilename = (projekt) => 'Leistungsnachweis_' + String(projekt.name || 'Projekt').replace(/[^\w\-]+/g, '_') + '.pdf'
