import { jsPDF } from 'jspdf'
import { filterByRange, zeitAnteile } from './calc'

const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
const hh = (min) => ((Number(min) || 0) / 60).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' h'
const num = (n) => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })
const dmy = (d) => { try { return new Date(d).toLocaleDateString('de-DE') } catch { return '' } }
const hm = (d) => { try { return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const tagLang = (d) => { try { return new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return dmy(d) } }

// Farbwelt (BauLog: Amber → Ember), dezent für Druck
const C = {
  text: [28, 25, 23], grau: [120, 113, 108], hell: [168, 162, 158], linie: [231, 229, 228],
  flaeche: [247, 245, 242], amber: [245, 158, 11], ember: [239, 68, 68], pill: [254, 243, 199], pillText: [146, 64, 14],
}

export function buildLeistungsnachweis(projekt, alleEintraege, s, opts = {}) {
  const mitKosten = opts.mitKosten !== false
  const eintraege = filterByRange(alleEintraege, opts.von, opts.bis)
  const rate = Number(projekt.hourlyRate) || 0
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const M = 48, R = 547
  let y = 56
  const line = () => { doc.setDrawColor(210).line(M, y, R, y); y += 14 }
  const need = (h) => { if (y + h > 785) { doc.addPage(); y = 56 } }

  const farbe = (c) => doc.setTextColor(c[0], c[1], c[2])
  const fuell = (c) => doc.setFillColor(c[0], c[1], c[2])
  const strich = (c) => doc.setDrawColor(c[0], c[1], c[2])
  // Abschnittsüberschrift mit kleinem Farbbalken
  const abschnitt = (titel) => {
    need(34); y += 6
    fuell(C.amber); doc.rect(M, y - 9, 3, 12, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(11.5); farbe(C.text); doc.text(titel, M + 9, y)
    y += 14
  }

  // Farbband oben
  fuell(C.amber); doc.rect(0, 0, 595.28, 6, 'F')
  fuell(C.ember); doc.rect(0, 6, 595.28, 1.5, 'F')

  // Kopf: Titel links, Firma rechts
  y = 58
  const titel = mitKosten && opts.abschnittNr != null ? 'Abschlagsrechnung' : 'Leistungsnachweis'
  doc.setFont('helvetica', 'bold').setFontSize(8.5); farbe(C.amber)
  doc.text((mitKosten && opts.abschnittNr != null ? 'ABSCHLAG NR. ' + opts.abschnittNr : 'NACHWEIS') + '  ·  ' + String(projekt.name || '').toUpperCase(), M, y - 16)
  doc.setFont('helvetica', 'bold').setFontSize(22); farbe(C.text); doc.text(titel, M, y + 4)
  let fy = y - 16
  if (s.company) { doc.setFont('helvetica', 'bold').setFontSize(11); farbe(C.text); doc.text(s.company, R, fy, { align: 'right' }); fy += 13 }
  doc.setFont('helvetica', 'normal').setFontSize(8.5); farbe(C.grau)
  ;[s.owner, s.street, [s.zip, s.city].filter(Boolean).join(' '), s.taxId ? 'Steuernr. ' + s.taxId : '']
    .filter(Boolean).forEach((t) => { doc.text(String(t), R, fy, { align: 'right' }); fy += 11 })
  y = Math.max(y + 22, fy + 6)

  // Infobox: Projektangaben in zwei Spalten
  const dates = eintraege.map((e) => e.createdAt).filter(Boolean).sort()
  const links = [['Projekt', projekt.name], ['Kunde', projekt.customer], ['Adresse', projekt.address]].filter((x) => x[1])
  const rechts = [
    dates.length ? ['Leistungszeitraum', dmy(dates[0]) + ' – ' + dmy(dates[dates.length - 1])] : null,
    ['Erstellt', dmy(new Date().toISOString())],
    mitKosten && opts.abschnittNr != null ? ['Abschlag', 'Nr. ' + opts.abschnittNr] : null,
  ].filter(Boolean)
  const zeilen = Math.max(links.length, rechts.length)
  const boxH = 16 + zeilen * 24
  fuell(C.flaeche); doc.roundedRect(M, y, R - M, boxH, 6, 6, 'F')
  const feld = (x, yy, label, wert) => {
    doc.setFont('helvetica', 'normal').setFontSize(7.5); farbe(C.grau); doc.text(String(label).toUpperCase(), x, yy)
    doc.setFont('helvetica', 'bold').setFontSize(10); farbe(C.text); doc.text(String(wert), x, yy + 11)
  }
  links.forEach((f, k) => feld(M + 14, y + 18 + k * 24, f[0], f[1]))
  rechts.forEach((f, k) => feld(M + (R - M) / 2 + 8, y + 18 + k * 24, f[0], f[1]))
  y += boxH + 14
  farbe(C.text); doc.setFont('helvetica', 'normal')

  // Tagesbericht: je Arbeitstag die Zeiten, darunter die ausgeführten Arbeiten aus dem Bautagebuch,
  // rechts die Stunden des Tages – statt Zeiterfassung und Bautagebuch getrennt aufzulisten
  const tagKey = (d) => { try { return new Date(d).toLocaleDateString('sv-SE') } catch { return String(d || '').slice(0, 10) } }
  const zeitEntries = eintraege.filter((e) => e.type === 'zeit')
  const diaryEntries = eintraege.filter((e) => e.type === 'tagebuch' && e.text)
  const tage = [...new Set([...zeitEntries.map((e) => tagKey(e.startAt || e.createdAt)), ...diaryEntries.map((e) => tagKey(e.createdAt))])].sort()
  if (tage.length) {
    abschnitt('Tagesbericht')
    tage.forEach((t) => {
      const zeiten = zeitEntries.filter((e) => tagKey(e.startAt || e.createdAt) === t)
        .sort((a, b) => String(a.startAt || a.createdAt).localeCompare(String(b.startAt || b.createdAt)))
      const texte = diaryEntries.filter((e) => tagKey(e.createdAt) === t)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      const minuten = zeiten.reduce((sum, e) => sum + (Number(e.minutes) || 0), 0)
      const zeitText = zeiten.map((e) => {
        let z = e.startAt && e.endAt ? hm(e.startAt) + '–' + hm(e.endAt) + ' Uhr (' + hh(e.minutes) + ')' : (zeiten.length > 1 ? hh(e.minutes) + ' ' : '') + 'Uhrzeit nicht erfasst'
        if (e.startAt && e.pausen && e.pausen.length) z += ', Pause ' + e.pausen.map((pa) => hm(pa.start) + '–' + hm(pa.end)).join(', ')
        // Leistung nur nennen, wenn der Abschnitt nicht auf mehrere Leistungen aufgeteilt ist
        if (e.leistung && !(Array.isArray(e.aufteilung) && e.aufteilung.length > 1)) z += ' · ' + e.leistung
        return z
      }).join('   ·   ')
      const zeitLines = zeitText ? doc.setFontSize(9).splitTextToSize(zeitText, R - M) : []
      const textLines = texte.length ? doc.setFontSize(9.5).splitTextToSize(texte.map((e) => e.text.trim()).join(' '), R - M) : []
      need(22 + zeitLines.length * 11 + textLines.length * 12 + 12)
      doc.setFont('helvetica', 'bold').setFontSize(10); farbe(C.text); doc.text(tagLang(t), M, y)
      if (minuten) {
        // Stunden des Tages als Plakette rechts
        const txt = hh(minuten), w = doc.getTextWidth(txt) + 14
        fuell(C.pill); doc.roundedRect(R - w, y - 10, w, 14, 7, 7, 'F')
        farbe(C.pillText); doc.text(txt, R - w / 2, y, { align: 'center' })
      }
      y += 13
      if (zeitLines.length) { doc.setFont('helvetica', 'normal').setFontSize(8.5); farbe(C.grau); doc.text(zeitLines, M, y); y += zeitLines.length * 11 }
      if (textLines.length) { doc.setFont('helvetica', 'normal').setFontSize(9.5); farbe(C.text); y += 2; doc.text(textLines, M, y, { lineHeightFactor: 1.25 }); y += textLines.length * 12 }
      y += 7; strich(C.linie); doc.setLineWidth(0.5).line(M, y - 3, R, y - 3); y += 9
    })
    doc.setFont('helvetica', 'normal'); y += 4
  }

  // Leistungen gruppieren
  const groups = {}
  const gruppenEintraege = eintraege.flatMap((e) => e.type === 'zeit' ? zeitAnteile(e).map((t) => ({ ...e, gewerk: t.gewerk, leistung: t.leistung, minutes: t.minutes })) : [e])
  for (const e of gruppenEintraege) {
    if (['zeit', 'menge', 'material', 'maschine'].indexOf(e.type) === -1) continue
    // Maschinen und Material ohne eigene Leistung als solche ausweisen statt „(allgemein)“
    const leistung = e.leistung || (e.type === 'maschine' ? 'Maschineneinsatz' + (e.maschine ? ': ' + e.maschine : '')
      : e.type === 'material' ? 'Material' + (e.label ? ': ' + e.label : '') : '(allgemein)')
    const key = (e.gewerk || '') + ' › ' + leistung
    if (!groups[key]) groups[key] = { gewerk: e.gewerk, leistung, minutes: 0, menge: 0, einheit: '', material: 0, maschine: 0 }
    const g = groups[key]
    if (e.type === 'zeit') g.minutes += Number(e.minutes) || 0
    else if (e.type === 'menge') { g.menge += Number(e.menge) || 0; if (e.einheit) g.einheit = e.einheit }
    else if (e.type === 'material') g.material += (Number(e.qty) || 0) * (Number(e.unitCost) || 0)
    else if (e.type === 'maschine') g.maschine += ((Number(e.minutes) || 0) / 60) * (Number(e.satz) || 0)
  }
  // nach Gewerk sortiert, innerhalb des Gewerks die größten Posten zuerst
  const rows = Object.values(groups).sort((a, b) => String(a.gewerk || '').localeCompare(String(b.gewerk || ''), 'de') || b.minutes - a.minutes)
  // Stunden auf Viertelstunden runden; die Rundungsdifferenz trägt der größte Posten, damit die Summe exakt bleibt
  const zeitRows = rows.filter((g) => g.minutes > 0)
  const echt = zeitRows.reduce((a, g) => a + g.minutes, 0)
  zeitRows.forEach((g) => { g.minAnzeige = Math.round(g.minutes / 15) * 15 })
  if (zeitRows.length) {
    const groesster = zeitRows.reduce((a, b) => (b.minutes > a.minutes ? b : a))
    groesster.minAnzeige += echt - zeitRows.reduce((a, g) => a + g.minAnzeige, 0)
  }
  rows.forEach((g) => { if (g.minAnzeige == null) g.minAnzeige = g.minutes })

  // Spalten: Leistung | Menge | Stunden | EP (€/Einh) | Selbstkosten – je Gewerk ein Block mit Zwischensumme
  const cMenge = 248, cStd = 312, cEP = 372
  abschnitt('Ausgeführte Leistungen')
  const nurGewerke = opts.detail === 'gewerk'
  // Tabellenkopf als helles Band
  fuell(C.flaeche); doc.rect(M, y - 10, R - M, 16, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(7.5); farbe(C.grau)
  doc.text(nurGewerke ? 'GEWERK' : 'LEISTUNG', M + 6, y); if (!nurGewerke) doc.text('MENGE', cMenge, y); doc.text('STUNDEN', cStd, y)
  if (mitKosten) { if (!nurGewerke) doc.text('EP €/EINH.', cEP, y); doc.text(nurGewerke ? 'BETRAG' : 'SELBSTKOSTEN', R - 6, y, { align: 'right' }) }
  farbe(C.text); doc.setFont('helvetica', 'normal'); y += 18

  let sumMin = 0, sumCost = 0
  const sumMaterial = rows.reduce((a, g) => a + g.material, 0)
  const gewerke = [...new Set(rows.map((g) => g.gewerk || ''))]
  gewerke.forEach((gw) => {
    const block = rows.filter((g) => (g.gewerk || '') === gw)
    const kosten = (g) => (g.minAnzeige / 60) * rate + g.material + g.maschine
    const blockMin = block.reduce((a, g) => a + g.minAnzeige, 0)
    // „Nur Gewerke“: Material steht als eigene Zeile, damit Arbeit und Belege getrennt bleiben
    const blockCost = block.reduce((a, g) => a + kosten(g) - (nurGewerke ? g.material : 0), 0)
    need(34)
    doc.setFont('helvetica', 'bold').setFontSize(9.5); farbe(C.text)
    doc.text(gw || 'Ohne Gewerk', M + 6, y)
    if (blockMin) doc.text(hh(blockMin), cStd, y)
    if (mitKosten) doc.text(eur(blockCost), R - 6, y, { align: 'right' })
    doc.setFont('helvetica', 'normal').setFontSize(9); y += 14
    // „Nur Gewerke“: Einzelleistungen nicht aufführen, die Gewerkzeile enthält Stunden und Betrag
    if (nurGewerke) {
      block.forEach((g) => { sumMin += g.minAnzeige; sumCost += kosten(g) - g.material })
      strich(C.linie); doc.setLineWidth(0.5).line(M, y - 9, R, y - 9); y += 4
      return
    }
    block.forEach((g) => {
      // lange Bezeichnungen umbrechen statt in die nächste Zeile zu schreiben
      const nameLines = doc.splitTextToSize(g.leistung, cMenge - M - 22)
      need(nameLines.length * 11 + 6)
      const total = kosten(g)
      const ep = g.menge > 0 ? total / g.menge : null
      sumMin += g.minAnzeige; sumCost += total
      farbe(C.grau)
      doc.text(nameLines, M + 18, y)
      doc.text(g.menge ? num(g.menge) + ' ' + (g.einheit || '') : '–', cMenge, y)
      doc.text(g.minAnzeige ? hh(g.minAnzeige) : '–', cStd, y)
      if (mitKosten) {
        doc.text(ep != null ? eur(ep).replace(' EUR', '') + (g.einheit ? '/' + g.einheit : '') : '–', cEP, y)
        doc.text(eur(total), R - 6, y, { align: 'right' })
      }
      farbe(C.text)
      y += Math.max(14, nameLines.length * 11 + 4)
    })
    y += 4
  })
  if (nurGewerke && sumMaterial > 0) {
    need(20)
    doc.setFont('helvetica', 'bold').setFontSize(9.5); farbe(C.text)
    doc.text('Material laut Belegen', M + 6, y)
    if (mitKosten) doc.text(eur(sumMaterial), R - 6, y, { align: 'right' })
    sumCost += sumMaterial
    strich(C.linie); doc.setLineWidth(0.5).line(M, y + 5, R, y + 5); y += 18
    doc.setFont('helvetica', 'normal')
  }
  // Summenzeile
  need(24)
  strich(C.text); doc.setLineWidth(0.8).line(M, y - 6, R, y - 6); y += 8
  doc.setFont('helvetica', 'bold').setFontSize(10); farbe(C.text)
  doc.text('Summe', M + 6, y); doc.text(hh(sumMin), cStd, y)
  if (mitKosten) doc.text(eur(sumCost), R - 6, y, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setLineWidth(0.5); y += 22

  // Abrechnungs-Abschnitt: Verrechnung mit Saldo aus dem vorherigen Abschnitt
  if (mitKosten && opts.abschnittNr != null) {
    need(105)
    abschnitt('Abrechnung')
    const boxY = y - 4
    y += 12
    doc.setFont('helvetica', 'normal').setFontSize(9.5); farbe(C.text)
    doc.text('Leistungen dieses Abschlags', M + 14, y); doc.text(eur(sumCost), R - 14, y, { align: 'right' }); y += 12
    if (sumMaterial > 0) {
      // aufschlüsseln, damit der Kunde Arbeit und weiterberechnetes Material getrennt sieht
      doc.setFontSize(8.5); farbe(C.grau)
      doc.text('davon Arbeitsleistung und Geräte', M + 24, y); doc.text(eur(sumCost - sumMaterial), R - 14, y, { align: 'right' }); y += 11
      doc.text('davon Material laut Belegen', M + 24, y); doc.text(eur(sumMaterial), R - 14, y, { align: 'right' }); y += 13
      doc.setFontSize(9.5); farbe(C.text)
    } else y += 2
    const vs = Number(opts.vorherigerSaldo) || 0
    const va = opts.vorherigerAbschlag
    if (vs !== 0) {
      const nr = va && va.nr != null ? va.nr : opts.abschnittNr - 1
      // Herleitung des Übertrags, damit der Kunde sieht, was schon gezahlt wurde
      doc.text(vs > 0 ? 'Noch offen aus Abschlag ' + nr : 'Guthaben aus Abschlag ' + nr, M + 14, y)
      doc.text((vs > 0 ? '+ ' : '- ') + eur(Math.abs(vs)), R - 14, y, { align: 'right' }); y += 12
      if (va) {
        doc.setFontSize(8.5); farbe(C.grau)
        doc.text('Abschlag ' + nr + ': berechnet ' + eur(va.gesamtbetrag) + ', gezahlt ' + eur(va.bezahlt), M + 14, y); y += 12
        doc.setFontSize(9.5); farbe(C.text)
      }
    }
    // „Zu zahlen“ als hervorgehobene Leiste
    y += 6
    fuell(C.pill); doc.roundedRect(M + 6, y - 13, R - M - 12, 24, 5, 5, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(11.5); farbe(C.pillText)
    doc.text(vs !== 0 ? 'Zu zahlen nach Verrechnung' : 'Zu zahlen', M + 16, y + 3); doc.text(eur(sumCost + vs), R - 16, y + 3, { align: 'right' })
    y += 22
    strich(C.linie); doc.setLineWidth(0.8).roundedRect(M, boxY, R - M, y - boxY, 6, 6, 'S'); doc.setLineWidth(0.5)
    y += 14; farbe(C.text); doc.setFont('helvetica', 'normal')
  }

  // Fotos
  const fotos = eintraege.filter((e) => e.type === 'foto' && e.dataUrl).slice(0, 8)
  if (fotos.length) {
    abschnitt('Fotodokumentation')
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

  // Abzüge aus Materialbelegen dokumentieren: private Positionen (nicht berechnet) und Verschleißteile (anteilig)
  if (mitKosten) {
    const zahl = (t) => Number(String(t).replace(/\./g, '').replace(',', '.')) || 0
    const abzuege = []
    for (const e of eintraege.filter((x) => x.type === 'material')) {
      const label = e.label || ''
      const p = label.match(/\(privat, nicht berechnet: ([\d.]+,\d{2}) €\)/)
      const v = label.match(/\(Verschleißanteil (\d+(?:[.,]\d+)?) % von ([\d.]+,\d{2}) €\)/)
      const name = label.replace(/\s*\((privat, nicht berechnet|Verschleißanteil)[^)]*\)\s*$/, '')
      if (p) abzuege.push({ name, grund: 'privat', voll: zahl(p[1]), berechnet: 0 })
      else if (v) abzuege.push({ name, grund: 'Verschleiß (' + v[1] + ' %)', voll: zahl(v[2]), berechnet: (Number(e.qty) || 0) * (Number(e.unitCost) || 0) })
    }
    // ältere Belege: Privatanteil nur in der Belegnotiz vermerkt
    const notizen = [...new Set(eintraege.filter((x) => x.type === 'material' && x.note).map((x) => x.note))]
    for (const n of notizen) {
      const m = n.match(/\(davon privat ([\d.]+,\d{2}) €, nicht verrechnet\)/)
      const schon = abzuege.some((a) => a.grund === 'privat' && n.includes(a.name.split(':')[0]))
      if (m && !schon) abzuege.push({ name: n.replace(/\s*·.*$/, ''), grund: 'privat', voll: zahl(m[1]), berechnet: 0 })
    }
    if (abzuege.length) {
      abschnitt('Abzüge aus Materialbelegen')
      doc.setFont('helvetica', 'normal').setFontSize(8.5); farbe(C.grau)
      doc.text('Diese Positionen stehen auf den Belegen, werden aber nicht oder nur anteilig berechnet.', M, y); y += 14
      fuell(C.flaeche); doc.rect(M, y - 10, R - M, 16, 'F')
      doc.setFont('helvetica', 'bold').setFontSize(7.5)
      doc.text('POSITION', M + 6, y); doc.text('GRUND', 285, y); doc.text('LAUT BELEG', 420, y, { align: 'right' }); doc.text('BERECHNET', 480, y, { align: 'right' }); doc.text('ABZUG', R - 6, y, { align: 'right' })
      y += 16; doc.setFont('helvetica', 'normal').setFontSize(8.5); farbe(C.text)
      let sumAbzug = 0
      abzuege.forEach((a) => {
        const zeilen = doc.splitTextToSize(a.name, 285 - M - 16)
        need(zeilen.length * 10 + 6)
        doc.text(zeilen, M + 6, y); doc.text(a.grund, 285, y)
        doc.text(eur(a.voll), 420, y, { align: 'right' }); doc.text(eur(a.berechnet), 480, y, { align: 'right' }); doc.text('- ' + eur(a.voll - a.berechnet), R - 6, y, { align: 'right' })
        sumAbzug += a.voll - a.berechnet
        y += Math.max(13, zeilen.length * 10 + 3)
      })
      strich(C.linie); doc.setLineWidth(0.5).line(M, y - 6, R, y - 6); y += 6
      doc.setFont('helvetica', 'bold').setFontSize(9)
      doc.text('Nicht berechnet gesamt', M + 6, y); doc.text('- ' + eur(sumAbzug), R - 6, y, { align: 'right' })
      doc.setFont('helvetica', 'normal'); y += 18
    }
  }

  // Materialbelege: jeder Beleg auf eigener Seite, mit Lieferant, Datum und Betrag
  if (opts.belege) {
    const belege = eintraege.filter((e) => e.type === 'material' && e.dataUrl)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    belege.forEach((e, k) => {
      doc.addPage(); y = 56
      abschnitt('Materialbeleg ' + (k + 1) + ' von ' + belege.length)
      doc.setFont('helvetica', 'normal').setFontSize(9.5); farbe(C.grau)
      doc.text(e.note || [e.label, dmy(e.createdAt), eur((Number(e.qty) || 0) * (Number(e.unitCost) || 0))].filter(Boolean).join('  ·  '), M, y); y += 14
      try {
        const p = doc.getImageProperties(e.dataUrl)
        const maxW = R - M, maxH = 780 - y
        const f = Math.min(maxW / p.width, maxH / p.height)
        doc.addImage(e.dataUrl, 'JPEG', M, y, p.width * f, p.height * f)
      } catch { /* Bild nicht lesbar */ }
      farbe(C.text)
    })
  }

  // Fußzeile auf jeder Seite
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    strich(C.linie); doc.setLineWidth(0.5).line(M, 800, R, 800)
    doc.setFont('helvetica', 'normal').setFontSize(7.5); farbe(C.hell)
    doc.text([s.company, projekt.name, projekt.customer].filter(Boolean).join('  ·  '), M, 812)
    doc.text('Seite ' + i + ' von ' + pages, R, 812, { align: 'right' })
    farbe(C.text)
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
