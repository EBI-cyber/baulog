import { jsPDF } from 'jspdf'
import { filterByRange } from './calc'

const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
const hh = (min) => ((Number(min) || 0) / 60).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' h'
const num = (n) => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })
const dmy = (d) => { try { return new Date(d).toLocaleDateString('de-DE') } catch { return '' } }
const hm = (d) => { try { return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

export function buildLeistungsnachweis(projekt, alleEintraege, s, opts = {}) {
  const mitKosten = opts.mitKosten !== false
  const eintraege = filterByRange(alleEintraege, opts.von, opts.bis)
  const rate = Number(projekt.hourlyRate) || 0
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const M = 48, R = 547
  let y = 56
  const line = () => { doc.setDrawColor(210).line(M, y, R, y); y += 14 }
  const need = (h) => { if (y + h > 800) { doc.addPage(); y = 56 } }

  // Kopf
  // Firmenkopf nur, wenn Firmendaten eingetragen sind (sonst stand „Leistungsnachweis“ doppelt da)
  if (s.company) { doc.setFont('helvetica', 'bold').setFontSize(18).text(s.company, M, y); y += 16 }
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  ;[s.owner, s.street, [s.zip, s.city].filter(Boolean).join(' '), s.taxId ? 'Steuernr.: ' + s.taxId : '']
    .filter(Boolean).forEach((t) => { doc.text(String(t), M, y); y += 12 })
  doc.setTextColor(0)

  y += s.company ? 14 : 0
  const titel = mitKosten && opts.abschnittNr != null ? 'Abschlagsrechnung Nr. ' + opts.abschnittNr : 'Leistungsnachweis'
  doc.setFont('helvetica', 'bold').setFontSize(15).text(titel, M, y)
  doc.setFont('helvetica', 'normal').setFontSize(10)
  y += 20
  doc.text('Projekt: ' + (projekt.name || ''), M, y); y += 14
  if (projekt.customer) { doc.text('Kunde: ' + projekt.customer, M, y); y += 14 }
  if (projekt.address) { doc.text('Adresse: ' + projekt.address, M, y); y += 14 }
  const dates = eintraege.map((e) => e.createdAt).filter(Boolean).sort()
  if (opts.von || opts.bis) { doc.text('Abrechnungszeitraum: ' + (opts.von ? dmy(opts.von) : 'Beginn') + ' – ' + (opts.bis ? dmy(opts.bis) : 'heute'), M, y); y += 14 }
  else if (dates.length) { doc.text('Zeitraum: ' + dmy(dates[0]) + ' – ' + dmy(dates[dates.length - 1]), M, y); y += 14 }
  doc.text('Erstellt: ' + dmy(new Date().toISOString()), M, y); y += 8
  line()

  // Zeiterfassung — chronologisch mit echten Uhrzeiten (Timer-Start/Pause/Ende)
  const zeitEntries = eintraege.filter((e) => e.type === 'zeit')
    .slice().sort((a, b) => String(a.startAt || a.createdAt).localeCompare(String(b.startAt || b.createdAt)))
  if (zeitEntries.length) {
    need(30); doc.setFont('helvetica', 'bold').setFontSize(11).text('Zeiterfassung', M, y); y += 16
    doc.setFontSize(9)
    zeitEntries.forEach((e) => {
      const what = (e.gewerk || '') + (e.leistung ? ' › ' + e.leistung : '')
      let head
      if (e.startAt && e.endAt) {
        head = dmy(e.startAt) + '  ' + hm(e.startAt) + '–' + hm(e.endAt) + ' Uhr'
        if (e.pausen && e.pausen.length) {
          head += '  (Pause ' + e.pausen.map((p) => hm(p.start) + '–' + hm(p.end)).join(', ') + ')'
        }
      } else {
        head = dmy(e.createdAt) + '  Dauer ohne erfasste Uhrzeit'
      }
      const lines = doc.splitTextToSize(head + '   ·  ' + (what || '(allgemein)') + '   ·  ' + hh(e.minutes), R - M)
      need(lines.length * 12 + 2)
      doc.text(lines, M, y); y += lines.length * 12 + 2
    })
    doc.setFont('helvetica', 'normal'); y += 8; line()
  }

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

  // Abrechnungs-Abschnitt: Verrechnung mit Saldo aus dem vorherigen Abschnitt
  if (mitKosten && opts.abschnittNr != null) {
    need(90)
    doc.setFont('helvetica', 'bold').setFontSize(11).text('Abrechnung — Abschlag Nr. ' + opts.abschnittNr, M, y); y += 16
    doc.setFont('helvetica', 'normal').setFontSize(9.5)
    doc.text('Leistungen dieses Abschlags', M, y); doc.text(eur(sumCost), R, y, { align: 'right' }); y += 14
    const vs = Number(opts.vorherigerSaldo) || 0
    const va = opts.vorherigerAbschlag
    if (vs !== 0) {
      const nr = va && va.nr != null ? va.nr : opts.abschnittNr - 1
      // Herleitung des Übertrags, damit der Kunde sieht, was schon gezahlt wurde
      if (va) {
        doc.setTextColor(110)
        doc.text('Abschlag ' + nr + ': berechnet ' + eur(va.gesamtbetrag) + ', gezahlt ' + eur(va.bezahlt), M, y); y += 13
        doc.setTextColor(0)
      }
      doc.text(vs > 0 ? 'Noch offen aus Abschlag ' + nr : 'Guthaben aus Abschlag ' + nr, M, y)
      doc.text((vs > 0 ? '+ ' : '- ') + eur(Math.abs(vs)), R, y, { align: 'right' }); y += 14
    }
    line()
    doc.setFont('helvetica', 'bold').setFontSize(10.5)
    doc.text(vs !== 0 ? 'Zu zahlen nach Verrechnung' : 'Zu zahlen', M, y); doc.text(eur(sumCost + vs), R, y, { align: 'right' }); y += 18
    doc.setFont('helvetica', 'normal')
  }

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

// Gesamtübersicht aller Abschläge eines Projekts (Betrag/bezahlt/Saldo, chronologisch)
export function buildAbrechnungsUebersicht(projekt, rechnungen, s) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const M = 48, R = 547
  let y = 56
  const line = () => { doc.setDrawColor(210).line(M, y, R, y); y += 14 }
  const need = (h) => { if (y + h > 800) { doc.addPage(); y = 56 } }

  if (s.company) { doc.setFont('helvetica', 'bold').setFontSize(18).text(s.company, M, y); y += 16 }
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  ;[s.owner, s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).forEach((t) => { doc.text(String(t), M, y); y += 12 })
  doc.setTextColor(0)
  y += s.company ? 14 : 0
  doc.setFont('helvetica', 'bold').setFontSize(15).text('Abrechnungsübersicht', M, y); y += 20
  doc.setFont('helvetica', 'normal').setFontSize(10)
  doc.text('Projekt: ' + (projekt.name || ''), M, y); y += 14
  if (projekt.customer) { doc.text('Kunde: ' + projekt.customer, M, y); y += 14 }
  doc.text('Erstellt: ' + dmy(new Date().toISOString()), M, y); y += 8
  line()

  const asc = rechnungen.slice().sort((a, b) => (Number(a.nr) || 0) - (Number(b.nr) || 0))
  const cZeit = 100, cBetrag = 290, cBezahlt = 370
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text('Abschlag', M, y); doc.text('Zeitraum', cZeit, y); doc.text('Leistungen', cBetrag, y); doc.text('Bezahlt', cBezahlt, y); doc.text('Saldo', R, y, { align: 'right' })
  doc.setFont('helvetica', 'normal'); y += 4; line()

  let sumBetrag = 0, sumBezahlt = 0
  asc.forEach((r) => {
    need(16)
    // Leistungen ohne Übertrag summieren, sonst zählt ein offener Rest doppelt
    const leistung = Number(r.betrag) || 0
    const gesamt = Number(r.gesamtbetrag ?? r.betrag) || 0
    const bezahlt = Number(r.bezahlterBetrag) || 0
    const saldo = r.saldo != null ? Number(r.saldo) : gesamt - bezahlt
    sumBetrag += leistung; sumBezahlt += bezahlt
    doc.text(String(r.nr ?? '–'), M, y)
    doc.text((r.von ? dmy(r.von) : 'Beginn') + ' – ' + (r.bis ? dmy(r.bis) : 'offen'), cZeit, y)
    doc.text(eur(leistung), cBetrag, y)
    doc.text(eur(bezahlt), cBezahlt, y)
    doc.text((saldo > 0 ? 'offen ' : saldo < 0 ? 'Guthaben ' : '') + eur(Math.abs(saldo)), R, y, { align: 'right' })
    y += 15
  })
  y += 2; line()
  doc.setFont('helvetica', 'bold').setFontSize(10)
  const endSaldo = asc.length ? Number(asc[asc.length - 1].saldo) || 0 : 0
  doc.text('Leistungen gesamt: ' + eur(sumBetrag), M, y); y += 14
  doc.text('Gesamt bezahlt: ' + eur(sumBezahlt), M, y); y += 14
  doc.text('Aktueller Saldo: ' + eur(endSaldo) + (endSaldo > 0 ? ' (offen)' : endSaldo < 0 ? ' (Guthaben)' : ' (ausgeglichen)'), M, y)

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(7).setTextColor(140)
    doc.text('Erstellt mit BauLog · ' + dmy(new Date().toISOString()) + ' · Seite ' + i + '/' + pages, M, 812)
    doc.setTextColor(0)
  }
  return doc
}
export const uebersichtFilename = (projekt) => 'Abrechnungsuebersicht_' + String(projekt.name || 'Projekt').replace(/[^\w\-]+/g, '_') + '.pdf'
