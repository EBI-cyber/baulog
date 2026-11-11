import { jsPDF } from 'jspdf'
import { TAGE, wochenTage, isoDatum, datumLang, datumKurz, uhr, pauseMs, arbeitMs, hm, dezimal } from './zeit'
import { absenzArt, spesenArt } from './arten'
import { zahl } from './settings'
import { wochenRechnung, std } from './woche'
import { unterzeichnerText } from './unterschreiber'
import { rapportTage } from './rapporttage'

const sauber = (t) => String(t || '').trim().replace(/\s+/g, '_').replace(/[^\wäöüÄÖÜß-]/g, '')
export function dateiName(einst, w, firma) {
  return `Rapport_KW${String(w.kw).padStart(2, '0')}_${w.jahr}_${sauber(einst.name) || 'Mitarbeiter'}${firma ? '_' + sauber(firma) : ''}.pdf`
}

/**
 * Wochenrapport als PDF (vorläufiges Layout — wird später an die Vorlage angepasst).
 * Gibt einen Blob zurück.
 */
/** Rapport-PDF: Formular (Wochenraster wie die Arbeitsrapporte der Temporärbüros, Standard) oder Liste mit Uhrzeiten */
export function rapportPdf(args) {
  return args.einsatz?.rapportVorlage === 'liste' ? rapportListePdf(args) : rapportFormularPdf(args)
}

function rapportListePdf({ einst, woche, schichten, absenzen = [], spesen = [], einsatz = null, unterschriften = null }) {
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
  feld('Einsatzbetrieb', firmen.join(', ') || einsatz?.firma || '—', 54)
  // rechte Spalte: Einsatz-Nr., Funktion, Einsatzort
  const rechts = [['Einsatz-Nr.', einsatz?.einsatznummer], ['Funktion', einsatz?.funktion], ['Einsatzort', einsatz?.einsatzort]].filter((x) => x[1])
  rechts.forEach(([k, v], i) => {
    const yy = 40 + i * 7
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text(k, 120, yy)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(0); doc.text(doc.splitTextToSize(String(v), 52)[0], 143, yy)
  })
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
  if (y > 258) { doc.addPage(); y = 40 }
  y = Math.max(y + 24, 252)
  const u = unterschriften || {}
  const bild = (src, x, unten) => {
    if (!src) return
    try {
      const p = doc.getImageProperties(src)
      const h = Math.min(20, (70 * p.height) / p.width), w = (h * p.width) / p.height
      doc.addImage(src, 'PNG', x + 2, unten - h - 0.5, w, h)
    } catch { /* ungültiges Bild ignorieren */ }
  }
  bild(u.maBild, L, y); bild(u.firmaBild, R - 75, y)
  doc.setDrawColor(120)
  doc.line(L, y, L + 75, y); doc.line(R - 75, y, R, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  const am = (ts) => (ts ? `${datumLang(new Date(ts))} ${uhr(ts)}` : 'Datum')
  doc.text(`${am(u.maAm)} / Unterschrift Mitarbeiter`, L, y + 5)
  doc.text(`${am(u.firmaAm)} / Unterschrift Einsatzbetrieb`, R - 75, y + 5)
  if (u.firmaName) { doc.setFontSize(8.5); doc.text(doc.splitTextToSize(unterzeichnerText(u), 75), R - 75, y + 9.5) }
  if (u.maBild || u.firmaBild) { doc.setFontSize(7); doc.setTextColor(150); doc.text('Elektronisch unterschrieben in der Rapport-App.', L, y + 9.5) }
  doc.setFontSize(7.5); doc.setTextColor(150)
  doc.text(`Erstellt am ${datumLang(new Date())} ${uhr(Date.now())} mit Rapport`, L, 289)

  return doc.output('blob')
}

/** Lohnabrechnung (Schätzung) als PDF — nur für mich, nicht für das Büro */
export function lohnPdf({ einst, lohn, titel, von, bis }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 15, R = 195, w = einst.waehrung
  const geld = (n) => `${w} ${(n || 0).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  let y = 22
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Lohnabrechnung (Schätzung)', L, y)
  doc.setFontSize(12); doc.text(titel, R, y, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  y += 7; doc.text(`${einst.name || ''} · ${datumLang(new Date(von + 'T12:00'))} – ${datumLang(new Date(bis + 'T12:00'))}`, L, y)
  y += 6
  const neu = (p = 10) => { if (y > 280 - p) { doc.addPage(); y = 20 } }
  const zeile = (label, betrag, { info, fett, minus } = {}) => {
    neu()
    doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(fett ? 10.5 : 9.5); doc.setTextColor(0)
    doc.text(label, L + 2, y)
    if (info) { doc.setFontSize(8.5); doc.setTextColor(120); doc.text(info, L + 95, y); doc.setTextColor(0); doc.setFontSize(fett ? 10.5 : 9.5) }
    doc.text((minus ? '- ' : '') + geld(betrag), R, y, { align: 'right' })
    y += fett ? 7 : 5.5
  }
  for (const p of lohn.posten) {
    y += 5; neu(30)
    doc.setFillColor(235, 245, 248); doc.rect(L, y - 5, R - L, 8, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(`${p.firma}${p.einsatz?.kanton ? ' (' + p.einsatz.kanton + ')' : ''}${p.einsatz?.funktion ? ' · ' + p.einsatz.funktion : ''}`, L + 2, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    if (p.stundenlohn) doc.text(`Grundlohn ${geld(p.stundenlohn)} / Std.`, R - 2, y, { align: 'right' })
    y += 8
    for (const x of p.zeilen.filter((z) => !z.konto)) zeile(x.art ? `${absenzArt(x.art).label} (${x.ausKonto ? 'aus Konto' : 'Lohnfortzahlung'})` : x.label, x.betrag, { info: x.info })
    for (const x of p.zeilen.filter((z) => z.konto)) zeile(`(angespart) ${x.label}`, x.betrag, { info: 'nicht im Bruttolohn' })
    doc.setDrawColor(200); doc.line(L, y - 3.5, R, y - 3.5)
    zeile('Bruttolohn', p.brutto, { fett: true })
    for (const a of p.abzuege) zeile(`${a.label} ${a.prozent} %`, a.betrag, { minus: true })
    doc.line(L, y - 3.5, R, y - 3.5)
    zeile('Nettolohn', p.netto, { fett: true })
  }
  y += 4; neu(25)
  doc.setDrawColor(120); doc.line(L, y - 3.5, R, y - 3.5)
  zeile('Total Nettolohn', lohn.netto)
  zeile('Spesen', lohn.spesen)
  if (lohn.mittag) zeile('Mittagszulage', lohn.mittag)
  zeile('Auszahlung', w === 'CHF' ? Math.round(lohn.auszahlung * 20) / 20 : lohn.auszahlung, { fett: true })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140)
  doc.text(doc.splitTextToSize('Eigene Schätzung nach Schema GAV Personalverleih, ohne Gewähr. Massgebend ist die Lohnabrechnung des Temporärbüros.', R - L), L, 285)
  return doc.output('blob')
}


/**
 * Arbeitsrapport als Formular (A4 quer), Aufbau wie die Rapporte der Temporärbüros:
 * TMA-Teil mit Wochenraster (Normalstunden, 125 %, 150 %, Spesen, Einsatzort) und Unterschrift,
 * Teil Einsatzbetrieb mit Fortsetzung/Ende, Leistungsbeurteilung, Stempel/Unterschrift, Name in Blockschrift.
 * Kein Logo und keine Formulartexte eines Büros — der Büroname steht als Text im Kopf.
 */
function rapportFormularPdf({ einst, woche, schichten, absenzen = [], spesen = [], einsatz: e = null, unterschriften = null }) {
  // Layout nach dem Papier-Arbeitsrapport der Temporärbüros (A4 quer): gleiche Felder an gleicher Stelle,
  // Ziffernkästchen pro Tag, graue Balken. Ohne Logo und ohne die geschützten Formulartexte eines Büros.
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const u = unterschriften || {}, p = einst?.profil || {}
  const { tage, total } = rapportTage({ woche, schichten, absenzen, spesen, einsatz: e, einst })
  const L = 9, R = 285
  const GRAU = [118, 118, 118], HELL = [228, 228, 228], LINIE = [150, 150, 150]
  const label = (t, x, y, size = 8.5, opt) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(70); doc.text(t, x, y, opt); doc.setTextColor(0) }
  const wert = (t, x, y, size = 11, opt) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(25, 35, 90); doc.text(String(t || ''), x, y, opt); doc.setTextColor(0) }
  const box = (x, y, an, g = 3.2) => { doc.setDrawColor(...LINIE); doc.setFillColor(255); doc.rect(x, y - g + 0.4, g, g, 'FD'); if (an) wert('X', x + 0.55, y - 0.15, 9) }
  const bild = (src, x, unten, maxB = 60, maxH = 14) => {
    if (!src) return
    try { const ip = doc.getImageProperties(src); const h = Math.min(maxH, (maxB * ip.height) / ip.width), w = (h * ip.width) / ip.height; doc.addImage(src, 'PNG', x, unten - h, w, h) } catch {}
  }
  const am = (ts) => (ts ? datumLang(new Date(ts)) : '')
  const band = (y, h, text) => { doc.setFillColor(...GRAU); doc.rect(L, y, R - L, h, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255); doc.text(text, L + 2, y + h - 1.6); doc.setTextColor(0) }

  // ── Kopf: Strichcode-Feld (Eckmarken), Titel, Kalenderwoche, Büro ──
  doc.setDrawColor(60); doc.setLineWidth(0.3)
  const ecke = (x, y, dx, dy) => { doc.line(x, y, x + dx, y); doc.line(x, y, x, y + dy) }
  ecke(L, 13, 3, 3); ecke(117, 13, -3, 3); ecke(L, 33, 3, -3); ecke(117, 33, -3, -3)
  label('Strichcode hier einkleben', 63, 23.5, 8.5, { align: 'center' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.text('Arbeitsrapport', 147, 19)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text('Kalenderwoche | Jahr', 147, 36)
  wert(`KW ${woche.kw} / ${woche.jahr}`, 183, 34.5, 15)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(einst?.buero || '', R, 19, { align: 'right' })
  label('Temporärbüro', R, 25, 9, { align: 'right' })
  doc.setLineWidth(0.2)

  // ── TMA ──
  band(39, 5.5, 'vom Temporär-Mitarbeitenden auszufüllen (TMA)')
  doc.setDrawColor(...LINIE); doc.rect(L, 44.5, R - L, 108.5)
  label('Vorname | Name TMA', 11, 52); wert(einst?.name, 46, 52, 13)
  label('Adresse TMA', 11, 61.5); wert([p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '), 46, 61.5, 10.5)
  label('Name Einsatzbetrieb', 158, 52); wert(e?.firma || schichten[0]?.firma, 196, 52, 12)
  label('Adresse Einsatzbetrieb', 158, 61.5); wert(e?.firmaAdresse || e?.einsatzort, 196, 61.5, 10.5)
  doc.setDrawColor(200); doc.line(46, 53.5, 150, 53.5); doc.line(46, 63, 150, 63); doc.line(196, 53.5, R - 2, 53.5); doc.line(196, 63, R - 2, 63)

  // ── Wochenraster mit Ziffernkästchen ──
  const x0 = 11, lw = 22, dw = 24.8, tx = x0 + lw + 7 * dw, tw = 28.4
  const cx = (i) => x0 + lw + i * dw
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
  doc.text('Position | Tag', x0, 69.5)
  doc.setFont('helvetica', 'normal')
  ;['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].forEach((t, i) => doc.text(t, cx(i) + 1.5, 69.5))
  doc.setFont('helvetica', 'bold'); doc.text('Total', tx + 1.5, 69.5)
  // Ziffern rechtsbündig in 2 + 2 Kästchen (Ganze | Dezimalen), wie auf dem Papier
  const ziffern = (txt, x, w, y, h) => {
    if (!txt) return
    const [g, d = ''] = txt.split('.')
    const k = w / 4
    if (g.length > 2) { wert(txt, x + w / 2, y + h - 2.2, 10.5, { align: 'center' }); return }
    const z = [...g.padStart(2, ' '), ...d.padEnd(2, ' ').slice(0, 2)]
    z.forEach((c, i) => { if (c.trim()) wert(c, x + k * i + k / 2, y + h - 2.2, 11.5, { align: 'center' }) })
  }
  const zeile = (y, h, titel, werte, totalTxt, opt = {}) => {
    doc.setFillColor(...HELL); doc.rect(x0, y, lw, h, 'F')
    label(titel, x0 + 1.2, y + (Array.isArray(titel) ? 3.6 : h / 2 + 1.2), 8.5)
    const n = opt.ohneTotal ? 7 : 8
    for (let i = 0; i < n; i++) {
      const x = i < 7 ? cx(i) : tx, w = i < 7 ? dw : tw
      doc.setDrawColor(...LINIE); doc.setFillColor(i >= 5 && i < 7 ? 246 : 255); doc.rect(x, y, w, h, 'FD')
      if (!opt.frei) { // feine Kästchen-Trennlinien + Dezimalpunkt
        doc.setDrawColor(205); for (let k = 1; k < 4; k++) doc.line(x + (w / 4) * k, y + (k === 2 ? 0 : h * 0.45), x + (w / 4) * k, y + h)
        doc.setFillColor(90); doc.circle(x + w / 2, y + h - 1, 0.35, 'F')
      }
    }
    werte.forEach((v, i) => (opt.frei ? opt.zeichne(v, cx(i), y, dw, h) : ziffern(v, cx(i), dw, y, h)))
    if (!opt.ohneTotal && totalTxt) ziffern(totalTxt, tx, tw, y, h)
  }
  const z2 = (n) => (n > 0.004 ? n.toFixed(2) : '')
  let y = 72
  zeile(y, 8, 'Datum', tage.map((t) => `${String(t.tag.getDate()).padStart(2, '0')}.${String(t.tag.getMonth() + 1).padStart(2, '0')}`), null); y += 9
  zeile(y, 9, ['Normal-', 'stunden'], tage.map((t) => z2(t.normal)), z2(total.normal)); y += 9.5
  zeile(y, 9, ['Stunden', 'zu 125 %'], tage.map((t) => z2(t.h125)), z2(total.h125)); y += 9.5
  zeile(y, 9, ['Stunden', 'zu 150 %'], tage.map((t) => z2(t.h150)), z2(total.h150)); y += 9.5
  zeile(y, 9, ['Spesen', 'Essen'], tage.map((t) => (t.spesen > 0 ? t.spesen.toFixed(2) : '')), total.spesen > 0 ? total.spesen.toFixed(2) : ''); y += 9.5
  // freie Zeile des Formulars: Abwesenheiten (bzw. Stunden zu 200 %, falls welche anfallen)
  const hat200 = total.h200 > 0.004
  if (hat200) { zeile(y, 9, ['Stunden', 'zu 200 %'], tage.map((t) => z2(t.h200)), z2(total.h200)); y += 9.5 }
  zeile(y, 9, ['Abwesen-', 'heit'], tage.map((t) => t), z2(total.absenz), { frei: true, zeichne: (t, x, yy, w, h) => {
    if (!t.absenzen.length) return
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(25, 35, 90)
    doc.text(t.absenzen.map((a) => a.kurz).join(' + '), x + w / 2, yy + 3.4, { align: 'center', maxWidth: w - 1.5 })
    const std = t.absenzen.reduce((a, b) => a + b.std, 0)
    wert(std > 0.004 ? std.toFixed(2) : '–', x + w / 2, yy + h - 1.6, 10, { align: 'center' })
  } }); y += 10.5
  zeile(y, 11, ['Einsatzort |', 'Baustelle'], tage.map((t) => t), null, { frei: true, ohneTotal: true, zeichne: (t, x, yy, w) => {
    if (!t.orteListe?.length) return
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3); doc.setTextColor(25, 35, 90)
    doc.text(t.orteListe.flatMap((s) => doc.splitTextToSize(s, w - 1.6)).slice(0, 4), x + 0.8, yy + 2.8, { lineHeightFactor: 1.1 })
    doc.setTextColor(0)
  } })
  y += 11

  // Bestätigungstext rechts neben dem Raster (eigene, neutrale Formulierung)
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.6); doc.setTextColor(40)
  doc.text(doc.splitTextToSize('Mit ihrer Unterschrift bestätigen die/der Temporär-Mitarbeitende und der Einsatzbetrieb die Richtigkeit der in diesem Arbeitsrapport eingetragenen Arbeitszeiten, Zuschläge, Spesen und Abwesenheiten. ' +
    'Grundlage sind der Einsatzvertrag für diesen Arbeitseinsatz und der Rahmenarbeitsvertrag des Temporärbüros. ' +
    'Entlöhnt wird die in diesem Rapport ausgewiesene und vom Einsatzbetrieb unterschriftlich bestätigte Arbeitszeit.', R - tx - tw - 5), tx + tw + 3, 68)
  doc.setTextColor(0)

  // TMA: Zwischenverdienst, Ort | Datum, Unterschrift
  y = 149
  label('Zwischenverdienst', 13, y, 9.5); box(42, y, !!p.rav); label('ja', 46.5, y, 9.5); box(55, y, p.rav === false); label('nein', 59.5, y, 9.5)
  const maOrt = u.maOrt || p.ort || ''
  label('Ort | Datum', 74, y, 9.5); wert(`${maOrt}${u.maAm ? (maOrt ? ', ' : '') + am(u.maAm) : ''}`, 94, y, 10)
  label('Unterschrift TMA', 158, y - 0.5, 9.5)
  bild(u.maBild, 190, y + 2.5, 60, 11)
  doc.setDrawColor(...LINIE); doc.line(188, y + 2.8, R - 3, y + 2.8)

  // ── Einsatzbetrieb ──
  band(156, 5.5, 'vom Einsatzbetrieb auszufüllen')
  doc.setFillColor(...HELL); doc.rect(L, 161.5, R - L, 36.5, 'F')
  y = 168
  box(13, y, u.einsatzWeiter === true); label('der Arbeitseinsatz geht weiter', 18, y, 9.5)
  box(68, y, u.einsatzWeiter === false); label('der Arbeitseinsatz ist beendet am', 73, y, 9.5)
  doc.setDrawColor(...LINIE); doc.line(127, y + 0.5, 162, y + 0.5)
  if (u.einsatzWeiter === false && u.beendetAm) wert(u.beendetAm.split('-').reverse().join('.'), 129, y - 0.5, 10)
  doc.setFillColor(196, 196, 196); doc.rect(170, 161.5, R - 170, 12, 'F')
  label('Leistungsbeurteilung', 172, 166.5, 9)
  for (let i = 1; i <= 5; i++) { const bx = 208 + (i - 1) * 15; doc.setFillColor(255); doc.rect(bx, 163.2, 3.4, 3.4, 'F'); label(String(i), bx + 1.7, 165.9, 7.5, { align: 'center' }); if (+u.bewertung === i) wert('X', bx + 0.5, 166.3, 10) }
  label('ungenügend', 203, 171.5, 8); label('sehr gut', 263, 171.5, 8)
  y = 189
  const ortEB = u.firmaOrt || (e?.einsatzort || '').replace(/^\d{4}\s*/, '')
  wert(`${ortEB}${u.firmaAm ? (ortEB ? ', ' : '') + am(u.firmaAm) : ''}`, 13, y - 1.5, 11)
  bild(u.firmaBild, 80, y, 70, 15)
  wert(unterzeichnerText(u).toUpperCase(), 172, y - 1.5, 10)
  doc.setDrawColor(...LINIE); doc.line(11, y, 62, y); doc.line(66, y, 166, y); doc.line(172, y, R - 3, y)
  label('Ort | Datum', 11, y + 3.6, 9); label('Stempel und rechtsgültige Unterschrift', 66, y + 3.6, 9); label('Name Unterzeichner in Blockschrift', 172, y + 3.6, 9)
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.2); doc.setTextColor(40)
  doc.text(doc.splitTextToSize('Mit seiner Unterschrift bestätigt der Einsatzbetrieb die Richtigkeit der Einträge in diesem Arbeitsrapport gemäss dem Verleihvertrag für diesen Arbeitseinsatz.' +
    (u.maBild || u.firmaBild ? ' Elektronisch unterschrieben in der Rapport-App.' : ''), R - L - 4), 11, 196.5)
  doc.setTextColor(0)

  // Fuss: Temporärbüro (Kontakt aus dem Einsatz), Erstellt am
  const kontakt = [einst?.buero, e?.bueroTel || einst?.bueroTel, e?.bueroEmail].filter(Boolean).join('  |  ')
  label(kontakt, L, 205, 8.5)
  label(`Erstellt am ${datumLang(new Date())} ${uhr(Date.now())}${e?.einsatznummer ? ` · Einsatz-Nr. ${e.einsatznummer}` : ''}`, R, 205, 7.5, { align: 'right' })
  return doc.output('blob')
}
