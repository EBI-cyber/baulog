import { jsPDF } from 'jspdf'
import { TAGE, wochenTage, isoDatum, datumLang, datumKurz, uhr, pauseMs, arbeitMs, hm, dezimal, bloecke } from './zeit'
import { absenzArt, spesenArt } from './arten'
import { zahl } from './settings'
import { wochenRechnung, std } from './woche'
import { unterzeichnerText, blockschrift } from './unterschreiber'
import { rapportTage } from './rapporttage'
import * as jahresabschlussHilfe from './jahresabschluss'

const sauber = (t) => String(t || '').trim().replace(/\s+/g, '_').replace(/[^\wäöüÄÖÜß-]/g, '')
/** Dateiname mit KW vorne — so stehen Rapport und Zeitnachweis einer Woche im Ordner nebeneinander */
export function dateiName(einst, w, firma, art = 'Rapport') {
  return `KW${String(w.kw).padStart(2, '0')}_${w.jahr}_${art}_${sauber(einst.name) || 'Mitarbeiter'}${firma ? '_' + sauber(firma) : ''}.pdf`
}

/**
 * Zeitnachweis: jede Schicht mit Arbeitsblöcken (Beginn–Pause–…–Ende), Pausen, Netto-Stunden und Notiz/Projekt,
 * dazu Abwesenheiten und Spesen — zur Kontrolle durch den Einsatzbetrieb.
 */
export function zeitnachweisPdf({ einst, woche, schichten, absenzen = [], spesen = [], einsatz = null }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const tage = wochenTage(woche)
  const L = 14, R = 196
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Zeitnachweis', L, 20)
  doc.setFontSize(12); doc.text(`KW ${woche.kw} / ${woche.jahr}`, R, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90)
  doc.text(`${datumLang(tage[0])} – ${datumLang(tage[6])}`, R, 26, { align: 'right' })
  const kopf = [['Mitarbeiter', einst.name], ['Einsatzbetrieb', [einsatz?.firma || schichten[0]?.firma, [einsatz?.baustelle, einsatz?.einsatzort].filter(Boolean).join(', ')].filter(Boolean).join(' · ')], ['Temporärbüro', einst.buero]]
  kopf.forEach(([k, v], i) => { doc.setTextColor(90); doc.setFont('helvetica', 'normal'); doc.text(k, L, 34 + i * 6); doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.text(String(v || '—'), L + 30, 34 + i * 6) })
  let y = 56
  const sp = [{ t: 'Datum', x: L, w: 22 }, { t: 'Arbeitszeiten', x: L + 22, w: 74 }, { t: 'Pause', x: L + 96, w: 16 }, { t: 'Netto', x: L + 112, w: 16 }, { t: 'Projekt / Bemerkung', x: L + 128, w: R - L - 128 }]
  doc.setFillColor(235, 238, 242); doc.rect(L, y - 5, R - L, 7.5, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sp.forEach((c) => doc.text(c.t, c.x + 1.2, y))
  y += 7
  const zeile = (werte, grau, fett) => {
    if (y > 270) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(9.3); doc.setTextColor(grau ? 150 : 0)
    let h = 1
    werte.forEach((v, i) => { const t = doc.splitTextToSize(String(v ?? ''), sp[i].w - 2); h = Math.max(h, t.length); doc.text(t, sp[i].x + 1.2, y) })
    doc.setDrawColor(225); doc.line(L, y + 2 + (h - 1) * 4, R, y + 2 + (h - 1) * 4)
    y += 6.5 + (h - 1) * 4
  }
  let total = 0, abwTotal = 0
  for (const tag of tage) {
    const d = isoDatum(tag), dl = `${TAGE[tag.getDay()]} ${datumKurz(tag)}`
    const s = schichten.filter((x) => x.datum === d && x.ende != null).sort((a, b) => a.start - b.start)
    const abw = absenzen.filter((x) => x.datum === d)
    if (!s.length && !abw.length) { zeile([dl, '–', '', '', ''], true); continue }
    for (const x of abw) { abwTotal += zahl(x.stunden); zeile([dl, absenzArt(x.art).label + (x.halbtag ? ' (½ Tag)' : ''), '', zahl(x.stunden) ? zahl(x.stunden).toFixed(2) : '–', x.notiz || '']) }
    for (const x of s) {
      const a = arbeitMs(x) / 36e5; total += a
      const b = bloecke(x).map(([v, bis]) => `${uhr(v)}–${uhr(bis)}`).join(' · ')
      const pm = Math.round(pauseMs(x) / 6e4)
      zeile([dl, b, pm ? `${pm} Min.` : '–', a.toFixed(2), [x.firma && x.firma !== (einsatz?.firma || '') ? x.firma : '', (x.notiz || '').replace(/\s*·?\s*(vom Papier-Rapport )?nachgetragen\s*$/i, ''), x.angeordnet ? `Mehrarbeit angeordnet${x.angeordnetVon ? ' von ' + x.angeordnetVon : ''}` : ''].filter(Boolean).join(' · ')])
    }
  }
  y += 2
  doc.setFillColor(235, 238, 242); doc.rect(L, y - 5, R - L, 8, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Total gearbeitet', L + 1.2, y); doc.text(`${total.toFixed(2)} h`, sp[3].x + 1.2, y)
  if (abwTotal) { y += 7; doc.setFont('helvetica', 'normal'); doc.text(`Abwesenheiten angerechnet: ${abwTotal.toFixed(2)} h`, L + 1.2, y) }
  const sp2 = spesen.filter((x) => zahl(x.betrag))
  if (sp2.length) { y += 7; doc.setFont('helvetica', 'normal'); doc.text(`Spesen: ${sp2.map((x) => `${datumKurz(new Date(x.datum + 'T12:00'))} ${spesenArt(x.art).label} ${zahl(x.betrag).toFixed(2)}`).join(', ')}`, L + 1.2, y, { maxWidth: R - L - 2 }) }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120)
  doc.text(`Zeiten wie in der Rapport-App erfasst (Stempeln mit Uhrzeit). Erstellt am ${datumLang(new Date())} ${uhr(Date.now())}.`, L, 285)
  return doc.output('blob')
}

/**
 * Wochenrapport als PDF (vorläufiges Layout — wird später an die Vorlage angepasst).
 * Gibt einen Blob zurück.
 */
/** Rapport-PDF: Formular (Wochenraster wie die Arbeitsrapporte der Temporärbüros, Standard) oder Liste mit Uhrzeiten */
export function rapportPdf(args) {
  if (args.einsatz?.rapportVorlage === 'liste') return rapportListePdf(args)
  if (args.einsatz?.formularBild && args.einsatz?.rapportVorlage !== 'formular-app') return originalFormularPdf(args)
  return rapportFormularPdf(args)
}

/**
 * Rapport auf dem Original-Blankoformular des Temporärbüros: der hinterlegte Scan (nur auf dem Gerät, im Einsatz
 * gespeichert) ist der Hintergrund, die Werte werden in die Kästchen geschrieben. Koordinaten = Pixel des Bellini-
 * Arbeitsrapports V3.0 (Scan 2573 × 1788), werden aufs hinterlegte Bild skaliert.
 */
const BELLINI_V3 = {
  w: 2573, h: 1788,
  tage: [274, 488, 704, 922, 1138, 1352, 1565], kasten: [0, 49, 103, 150], kb: 49, // vier Kästchen je Tag (2 | 2)
  total: [1780, 1828, 1877, 1932, 1980], // 3 | 2 Kästchen
  zeilen: { datum: [587, 657], normal: [670, 739], h125: [753, 821], h150: [835, 903], spesen: [917, 985], frei: [998, 1066], ort: [1080, 1165] },
  freiLabel: [95, 1040],
  name: [400, 414], adresse: [400, 494], firma: [1690, 414], firmaAdresse: [1690, 494], kw: [1560, 282],
  zvJa: [354, 1252], zvNein: [436, 1252], maOrt: [712, 1260], maUnterschrift: [1575, 1272, 470, 115],
  weiter: [104, 1410], beendet: [572, 1410], beendetAm: [1020, 1402],
  bewertung: [[1848, 1400], [1940, 1400], [2032, 1400], [2128, 1400], [2224, 1400]],
  ebOrt: [100, 1552], ebUnterschrift: [600, 1560, 800, 125], ebName: [1500, 1552], stempel: [900, 1545, 560, 175],
}

function originalFormularPdf({ einst, woche, schichten, absenzen = [], spesen = [], einsatz: e, unterschriften = null }) {
  const L = BELLINI_V3, u = unterschriften || {}, p = einst?.profil || {}
  const ip = (() => { try { return new jsPDF().getImageProperties(e.formularBild) } catch { return { width: L.w, height: L.h } } })()
  const W = 297, H = (297 * ip.height) / ip.width
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape' })
  doc.addImage(e.formularBild, e.formularBild.startsWith('data:image/png') ? 'PNG' : 'JPEG', 0, 0, W, H)
  const X = (px) => (px / L.w) * W, Y = (py) => (py / L.h) * H
  const TINTE = [20, 40, 120] // Kugelschreiber-Blau
  const schreib = (t, px, py, size = 11, opt = {}) => { if (!t) return; doc.setFont('helvetica', opt.fett === false ? 'normal' : 'bold'); doc.setFontSize(size); doc.setTextColor(...TINTE); doc.text(String(t), X(px), Y(py), opt) }
  const kreuz = ([px, py]) => { doc.setDrawColor(...TINTE); doc.setLineWidth(0.45); const r = X(9); doc.line(X(px) - r, Y(py) - r, X(px) + r, Y(py) + r); doc.line(X(px) - r, Y(py) + r, X(px) + r, Y(py) - r) }
  const bild = (src, px, unten, maxB, maxH) => {
    if (!src) return
    try { const q = doc.getImageProperties(src); const h = Math.min(Y(maxH), (X(maxB) * q.height) / q.width), w = (h * q.width) / q.height; doc.addImage(src, 'PNG', X(px), Y(unten) - h, w, h) } catch {}
  }
  const am = (ts) => (ts ? datumLang(new Date(ts)) : '')
  const { tage, total } = rapportTage({ woche, schichten, absenzen, spesen, einsatz: e, einst })

  // Kopf
  schreib(`KW ${woche.kw} / ${woche.jahr}`, L.kw[0], L.kw[1], 15)
  schreib(einst?.name, L.name[0], L.name[1], 12.5)
  schreib([p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '), L.adresse[0], L.adresse[1], 10.5)
  schreib(e?.firma || schichten[0]?.firma, L.firma[0], L.firma[1], 11.5)
  schreib(e?.firmaAdresse || e?.einsatzort, L.firmaAdresse[0], L.firmaAdresse[1], 10)

  // Ziffern in die Kästchen: Zeile [oben, unten], Kästchen-Startpunkte, Anzahl ganze Stellen
  const ziffern = (txt, starts, ganz, [o, un]) => {
    if (!txt) return
    const [g, d = ''] = String(txt).split('.')
    const z = [...g.padStart(ganz, ' ').slice(-ganz), ...d.padEnd(2, ' ').slice(0, 2)]
    z.forEach((c, i) => { if (c.trim()) schreib(c, starts[i] + L.kb / 2, un - (un - o) * 0.22, 14, { align: 'center' }) })
  }
  const tag = (i) => L.kasten.map((k) => L.tage[i] + k)
  const z2 = (n) => (n > 0.004 ? n.toFixed(2) : '')
  const reihe = (k, werte, tot) => { werte.forEach((v, i) => ziffern(v, tag(i), 2, L.zeilen[k])); if (tot) ziffern(tot, L.total, 3, L.zeilen[k]) }
  reihe('datum', tage.map((t) => `${String(t.tag.getDate()).padStart(2, '0')}.${String(t.tag.getMonth() + 1).padStart(2, '0')}`))
  reihe('normal', tage.map((t) => z2(t.normal)), z2(total.normal))
  reihe('h125', tage.map((t) => z2(t.h125)), z2(total.h125))
  reihe('h150', tage.map((t) => z2(t.h150)), z2(total.h150))
  reihe('spesen', tage.map((t) => (t.spesen > 0 ? t.spesen.toFixed(2) : '')), total.spesen > 0 ? total.spesen.toFixed(2) : '')
  // freie Zeile: Stunden zu 200 % (falls nötig), sonst Abwesenheiten (Art klein oben, angerechnete Stunden in den Kästchen)
  const [fo, fu] = L.zeilen.frei
  if (total.h200 > 0.004) {
    schreib('Stunden 200 %', L.freiLabel[0], L.freiLabel[1], 8.5, { fett: false })
    reihe('frei', tage.map((t) => z2(t.h200)), z2(total.h200))
  } else if (tage.some((t) => t.absenzen.length)) {
    schreib('Abwesenheit', L.freiLabel[0], L.freiLabel[1], 8.5, { fett: false })
    tage.forEach((t, i) => {
      if (!t.absenzen.length) return
      schreib(t.absenzen.map((a) => a.kurz).join('+'), L.tage[i] + 100, fo + 22, 6.5, { align: 'center', fett: false })
      const std = t.absenzen.reduce((a, b) => a + b.std, 0)
      if (std > 0.004) ziffern(std.toFixed(2), tag(i), 2, [fo + 10, fu])
      else schreib('–', L.tage[i] + 100, fu - 14, 12, { align: 'center' })
    })
    if (total.absenz > 0.004) ziffern(z2(total.absenz), L.total, 3, [fo + 10, fu])
  }
  // Einsatzort | Baustelle: klein, bis 3 Zeilen je Tag
  const [oo] = L.zeilen.ort
  tage.forEach((t, i) => {
    if (!t.orteListe?.length) return
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...TINTE)
    doc.text(t.orteListe.flatMap((s) => doc.splitTextToSize(s, X(195))).slice(0, 3), X(L.tage[i] + 4), Y(oo + 22), { lineHeightFactor: 1.05 })
  })

  // TMA: Zwischenverdienst, Ort | Datum, Unterschrift
  if (p.rav === true) kreuz(L.zvJa); else if (p.rav === false) kreuz(L.zvNein)
  const maOrt = u.maOrt || p.ort || ''
  schreib(`${maOrt}${u.maAm ? (maOrt ? ', ' : '') + am(u.maAm) : ''}`, L.maOrt[0], L.maOrt[1], 10.5)
  bild(u.maBild, L.maUnterschrift[0], L.maUnterschrift[1], L.maUnterschrift[2], L.maUnterschrift[3])

  // Einsatzbetrieb
  if (u.einsatzWeiter === true) kreuz(L.weiter)
  if (u.einsatzWeiter === false) { kreuz(L.beendet); if (u.beendetAm) schreib(u.beendetAm.split('-').reverse().join('.'), L.beendetAm[0], L.beendetAm[1], 11) }
  if (+u.bewertung >= 1 && +u.bewertung <= 5) { const [bx, by] = L.bewertung[+u.bewertung - 1]; doc.setDrawColor(...TINTE); doc.setLineWidth(0.5); doc.circle(X(bx), Y(by), X(26)) }
  const ortEB = u.firmaOrt || (e?.einsatzort || '').replace(/^\d{4}\s*/, '')
  schreib(`${ortEB}${u.firmaAm ? (ortEB ? ', ' : '') + am(u.firmaAm) : ''}`, L.ebOrt[0], L.ebOrt[1], 11)
  // Firmenstempel (nur wenn der Unterzeichner beim Unterschreiben zugestimmt hat), Unterschrift darüber wie auf Papier
  if (u.stempel && u.firmaBild && e?.stempelBild) bild(e.stempelBild, L.stempel[0], L.stempel[1], L.stempel[2], L.stempel[3])
  bild(u.firmaBild, L.ebUnterschrift[0], L.ebUnterschrift[1], L.ebUnterschrift[2], L.ebUnterschrift[3])
  schreib(blockschrift(u), L.ebName[0], L.ebName[1], 11)
  if (u.maBild || u.firmaBild) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(90); doc.text(`Elektronisch unterschrieben in der Rapport-App · erstellt ${datumLang(new Date())} ${uhr(Date.now())}`, W - 4, H - 1.5, { align: 'right' }) }
  doc.setTextColor(0)
  return doc.output('blob')
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
  if (r.soll && r.differenz > 0) zus.push(['Überstunden', `+${std(r.differenz)} h (über ${std(r.soll)} h/Woche)`])
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
export function lohnPdf({ einst, lohn, titel, von, bis, zahlungen = [] }) {
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
    for (const x of p.zeilen.filter((z) => !z.konto)) zeile(x.art ? `${absenzArt(x.art).label} (${x.ausKonto ? 'aus Konto' : x.art === 'krank' || x.art === 'unfall' ? (x.taggeld ? 'Taggeld' : x.betrag ? 'Lohnfortzahlung' : 'unbezahlt') : 'Lohnfortzahlung'})` : x.label, x.betrag, { info: x.info })
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
  if (lohn.rueckstellung) zeile('Zurückbehalten (Guthaben, netto)', lohn.rueckstellung, { minus: true })
  if (zahlungen.length) {
    zeile('Lohnanspruch', lohn.auszahlung, { fett: true })
    for (const x of zahlungen) zeile(`Bereits ausbezahlt ${x.datum.split('-').reverse().join('.')}${x.kw ? ` (KW ${x.kw})` : ''}`, x.betrag, { minus: true })
    const offen = Math.round((lohn.auszahlung - zahlungen.reduce((a, x) => a + x.betrag, 0)) * 100) / 100
    zeile(offen >= -0.005 ? 'Noch auszuzahlen' : 'Zu viel ausbezahlt', Math.abs(offen), { fett: true })
  } else zeile('Auszahlung', w === 'CHF' ? Math.round(lohn.auszahlung * 20) / 20 : lohn.auszahlung, { fett: true })
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
  if (u.stempel && u.firmaBild && e?.stempelBild) bild(e.stempelBild, 100, y - 0.5, 55, 17)
  bild(u.firmaBild, 80, y, 70, 15)
  wert(blockschrift(u), 172, y - 1.5, 10)
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

/** Jahresabschluss Lohn (aus den Lohnabrechnungen) — Vorbereitung Steuererklärung */
export function jahresabschlussPdf({ einst, jahr, ja }) {
  const { gruppen, lohnausweis, GRUPPEN } = jahresabschlussHilfe
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 15, R = 195, w = einst.waehrung
  const geld = (n) => `${n < 0 ? '- ' : ''}${w} ${Math.abs(n || 0).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const t = ja.total, g = gruppen(t)
  let y = 22
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(`Jahresabschluss Lohn ${jahr}`, L, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  y += 7; doc.text(`${einst.name || ''} · erstellt ${datumLang(new Date())} · ${ja.abrechnungen.length} Lohnabrechnung(en)`, L, y)
  const zeile = (a, b, fett, info) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(fett ? 10.5 : 9.5)
    doc.text(a, L + 2, y); if (info) { doc.setTextColor(120); doc.setFontSize(8.5); doc.text(info, L + 110, y); doc.setTextColor(0); doc.setFontSize(fett ? 10.5 : 9.5) }
    if (b !== null && b !== undefined) doc.text(geld(b), R, y, { align: 'right' }); y += fett ? 7 : 5.5
  }
  const titel = (s) => { y += 6; doc.setFillColor(235, 245, 248); doc.rect(L, y - 5, R - L, 8, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(s, L + 2, y); y += 8 }
  titel('Übersicht')
  zeile('Bruttolohn', t.brutto, true)
  for (const [k, l] of GRUPPEN) if (g[k]) zeile(`− ${l}`, -g[k])
  zeile('Nettolohn', t.netto, true)
  zeile('Spesen (steuerfrei)', t.spesen)
  if (t.rueck) zeile('Zurückbehalten (Guthaben beim Büro)', -t.rueck)
  if (t.stunden) zeile(`Stunden: ${t.stunden.toFixed(2)} h · netto pro Stunde`, t.netto / t.stunden)
  titel('Für die Steuererklärung (Aufbau Lohnausweis, Formular 11)')
  for (const z of lohnausweis(t)) zeile(`${z.ziffer.padEnd(5)} ${z.text}`, z.betrag, z.fett)
  if (g.uebrige) zeile('Nicht unter Ziffer 9/10: übrige Abzüge (KTG, GAV …)', g.uebrige)
  titel('Monat für Monat')
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold')
  const sp = [L + 2, L + 40, L + 75, L + 105, L + 135, R]
  ;['Monat', 'Brutto', 'Abzüge', 'davon QST', 'Netto', 'Quelle'].forEach((h, i) => doc.text(h, sp[i], y, i && i < 5 ? { align: 'right' } : i === 5 ? { align: 'right' } : undefined))
  y += 5; doc.setFont('helvetica', 'normal')
  for (const x of ja.monate.filter((m) => m.brutto)) {
    const ab = x.brutto - x.netto
    ;[x.name, x.brutto.toFixed(2), ab.toFixed(2), (x.abzug.quellensteuer || 0).toFixed(2), x.netto.toFixed(2), x.quelle === 'abrechnung' ? 'Abrechnung' : 'Schätzung'].forEach((v, i) => doc.text(v, sp[i], y, i && i < 5 ? { align: 'right' } : i === 5 ? { align: 'right' } : undefined))
    y += 5
  }
  doc.setFontSize(8); doc.setTextColor(110)
  doc.text(doc.splitTextToSize('Zusammengestellt aus den fotografierten Lohnabrechnungen (Monate ohne Abrechnung: Schätzung der App). Ohne Gewähr, keine Steuerberatung — massgebend ist der Lohnausweis des Arbeitgebers.', R - L), L, 285)
  return doc.output('blob')
}
