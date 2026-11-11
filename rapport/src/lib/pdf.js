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
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const L = 14, R = 283, u = unterschriften || {}, p = einst?.profil || {}
  const { tage, total } = rapportTage({ woche, schichten, absenzen, spesen, einsatz: e, einst })
  const zahlTxt = (n) => (n > 0.004 ? n.toFixed(2) : '')
  const grau = (y, text) => {
    doc.setFillColor(120, 120, 120); doc.rect(L, y, R - L, 6, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255); doc.text(text, L + 2, y + 4.2); doc.setTextColor(0)
  }
  const label = (t, x, y, size = 8.5) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(90); doc.text(t, x, y); doc.setTextColor(0) }
  const wertTxt = (t, x, y, size = 11) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.text(String(t || ''), x, y) }
  const box = (x, y, an) => { doc.setDrawColor(90); doc.rect(x, y - 3, 3.5, 3.5); if (an) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('X', x + 0.7, y - 0.2) } }
  const bild = (src, x, unten, maxB = 60, maxH = 16) => {
    if (!src) return
    try { const ip = doc.getImageProperties(src); const h = Math.min(maxH, (maxB * ip.height) / ip.width), w = (h * ip.width) / ip.height; doc.addImage(src, 'PNG', x, unten - h, w, h) } catch {}
  }
  const am = (ts) => (ts ? datumLang(new Date(ts)) : '')

  // Kopf: Feld für den Strichcode-Aufkleber, Titel, Büro, Kalenderwoche
  doc.setDrawColor(170); doc.setLineDashPattern([1.2, 1.2], 0); doc.rect(L, 9, 72, 20); doc.setLineDashPattern([], 0)
  label('Strichcode hier einkleben', L + 18, 20, 8)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Arbeitsrapport', 125, 17)
  label('Kalenderwoche | Jahr', 125, 27); wertTxt(`KW ${woche.kw} / ${woche.jahr}`, 158, 27, 13)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(einst?.buero || '', R, 16, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90); doc.text('Temporärbüro', R, 21, { align: 'right' }); doc.setTextColor(0)

  // TMA
  grau(33, 'vom Temporär-Mitarbeitenden auszufüllen (TMA)')
  label('Vorname | Name TMA', L + 2, 46); wertTxt(einst?.name, L + 38, 46, 12)
  label('Adresse TMA', L + 2, 53); wertTxt([p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '), L + 38, 53, 10)
  label('Name Einsatzbetrieb', 150, 46); wertTxt(e?.firma || schichten[0]?.firma, 183, 46, 12)
  label('Adresse Einsatzbetrieb', 150, 53); wertTxt(e?.firmaAdresse || e?.einsatzort, 183, 53, 10)

  // Wochenraster
  const x0 = L, lw = 34, tw = 26, dw = (R - L - lw - tw) / 7
  const cx = (i) => x0 + lw + i * dw
  let y = 58
  doc.setFillColor(242, 242, 242); doc.rect(x0, y, R - L, 7, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('Position | Tag', x0 + 2, y + 4.8)
  ;['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].forEach((t, i) => doc.text(t, cx(i) + 2, y + 4.8))
  doc.text('Total', R - tw + 2, y + 4.8)
  y += 7
  const hat200 = total.h200 > 0.004
  const zeilen = [
    ['Datum', (t) => datumKurz(t.tag), () => ''],
    ['Normalstunden', (t) => zahlTxt(t.normal), () => zahlTxt(total.normal)],
    ['Stunden zu 125 %', (t) => zahlTxt(t.h125), () => zahlTxt(total.h125)],
    ['Stunden zu 150 %', (t) => zahlTxt(t.h150), () => zahlTxt(total.h150)],
    ...(hat200 ? [['Stunden zu 200 %', (t) => zahlTxt(t.h200), () => zahlTxt(total.h200)]] : []),
    ['Spesen Essen', (t) => (t.spesen > 0 ? t.spesen.toFixed(2) : ''), () => (total.spesen > 0 ? total.spesen.toFixed(2) : '')],
  ]
  const raster = (h) => { doc.setDrawColor(200); doc.rect(x0, y, R - L, h); for (let i = 0; i <= 7; i++) doc.line(cx(i), y, cx(i), y + h) }
  const titelTxt = (t, dy = 5.3) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60); doc.text(t, x0 + 2, y + dy); doc.setTextColor(0) }
  for (const [titel, f, fT] of zeilen) {
    raster(8); titelTxt(titel)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
    tage.forEach((t, i) => { const v = f(t); if (v) doc.text(v, cx(i) + dw / 2, y + 5.5, { align: 'center' }) })
    const vt = fT(); if (vt) doc.text(vt, R - tw / 2, y + 5.5, { align: 'center' })
    y += 8
  }
  // Abwesenheit: Art (Ferien, krank, unbezahlt …) + angerechnete Stunden — immer sichtbar, auch bei 0 Std.
  raster(11); titelTxt(['Abwesenheit', '(Art | Std.)'], 4.5)
  tage.forEach((t, i) => {
    if (!t.absenzen.length) return
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(t.absenzen.map((a) => a.kurz).join(' + '), cx(i) + dw / 2, y + 4, { align: 'center', maxWidth: dw - 1.5 })
    const std = t.absenzen.reduce((a, x) => a + x.std, 0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(std > 0.004 ? std.toFixed(2) : '–', cx(i) + dw / 2, y + 8.8, { align: 'center' })
  })
  if (total.absenz > 0.004) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(zahlTxt(total.absenz), R - tw / 2, y + 7, { align: 'center' }) }
  y += 11
  // Einsatzort | Baustelle
  doc.setDrawColor(200); doc.rect(x0, y, R - L - tw, 13)
  for (let i = 0; i <= 7; i++) doc.line(cx(i), y, cx(i), y + 13)
  titelTxt(['Einsatzort |', 'Baustelle'], 4.3)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  tage.forEach((t, i) => {
    if (!t.orteListe.length) return
    const z = t.orteListe.flatMap((x) => doc.splitTextToSize(x, dw - 2))
    doc.text(z.slice(0, 4), cx(i) + 1, y + 3.4, { lineHeightFactor: 1.15 })
  })
  y += 18

  // TMA: Zwischenverdienst, Ort/Datum, Unterschrift
  label('Zwischenverdienst', L + 2, y); box(L + 31, y, !!p.rav); label('ja', L + 36, y); box(L + 44, y, p.rav === false); label('nein', L + 49, y)
  label('Ort | Datum', L + 66, y); wertTxt(`${p.ort || ''}${u.maAm ? (p.ort ? ', ' : '') + am(u.maAm) : ''}`, L + 84, y, 10)
  bild(u.maBild, 185, y + 1.5, 60, 8.5)
  doc.setDrawColor(150); doc.line(150, y + 2, R, y + 2); label('Unterschrift TMA', 150, y + 6)
  y += 10

  // Einsatzbetrieb
  grau(y, 'vom Einsatzbetrieb auszufüllen'); y += 12
  box(L + 2, y, u.einsatzWeiter === true); label('der Arbeitseinsatz geht weiter', L + 7.5, y, 9)
  box(L + 70, y, u.einsatzWeiter === false); label(`der Arbeitseinsatz ist beendet am ${u.einsatzWeiter === false && u.beendetAm ? u.beendetAm.split('-').reverse().join('.') : '________'}`, L + 75.5, y, 9)
  label('Leistungsbeurteilung', 178, y - 4, 8)
  for (let i = 1; i <= 5; i++) { box(178 + (i - 1) * 16, y + 2, +u.bewertung === i); label(String(i), 182.5 + (i - 1) * 16, y + 2, 8) }
  label('ungenügend', 178, y + 7, 7); label('sehr gut', 238, y + 7, 7)
  y += 22
  const ortEB = (e?.einsatzort || '').replace(/^\d{4}\s*/, '')
  wertTxt(`${ortEB}${u.firmaAm ? (ortEB ? ', ' : '') + am(u.firmaAm) : ''}`, L + 2, y - 1.5, 10)
  bild(u.firmaBild, 110, y)
  wertTxt(unterzeichnerText(u).toUpperCase(), 192, y - 1.5, 9.5)
  doc.setDrawColor(150); doc.line(L, y, 95, y); doc.line(105, y, 182, y); doc.line(192, y, R, y)
  label('Ort | Datum', L, y + 4); label('Stempel und rechtsgültige Unterschrift', 105, y + 4); label('Name Unterzeichner in Blockschrift', 192, y + 4)

  // Fuss
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110)
  doc.text(doc.splitTextToSize('Mit ihrer Unterschrift bestätigen Mitarbeitende und Einsatzbetrieb die Richtigkeit der eingetragenen Arbeitszeiten. ' +
    'Es gelten der Einsatzvertrag und der Rahmenarbeitsvertrag des Temporärbüros.' + (u.maBild || u.firmaBild ? ' Elektronisch unterschrieben in der Rapport-App.' : ''), R - L), L, 199)
  doc.text(`Erstellt am ${datumLang(new Date())} ${uhr(Date.now())}${e?.einsatznummer ? ` · Einsatz-Nr. ${e.einsatznummer}` : ''}`, L, 206)
  return doc.output('blob')
}
