import { zahl } from './settings'
import { stundenlohnTotal } from './lohn'
import { ferienMindestProzent, alter } from './profil'

/**
 * Vertrags-Check für Einsatzverträge (Personalverleih Schweiz).
 * Nur Regeln mit klarer Grundlage; Mindestlöhne (je GAV/Kategorie) werden nicht geschätzt, sondern als Prüfhinweis gegeben.
 * Ergebnis: { urteil: gut|pruefenswert|problematisch, punkte: [{ id, gruppe, titel, status: ok|info|warnung|fehler, text, korrektur, quelle }] }
 * Keine Rechtsberatung — verbindlich klären: Gewerkschaft (Unia, Syna), paritätische Kommission, Arbeitsinspektorat.
 */
const gesetzt = (e, k) => e?.[k] !== undefined && e?.[k] !== null && String(e[k]).trim() !== ''
const AVG19 = 'AVG Art. 19 Abs. 2'

export function vertragPruefen(e, einst) {
  const punkte = []
  const add = (p) => punkte.push(p)
  const a = e?.angaben || null // von der KI: welche Pflichtangaben im Vertrag stehen

  // 1) Pflichtangaben im Einsatzvertrag (AVG Art. 19 Abs. 2)
  const pflicht = [
    ['taetigkeit', 'Art der Arbeit', gesetzt(e, 'funktion') || gesetzt(e, 'qualifikation')],
    ['arbeitsort', 'Arbeitsort', gesetzt(e, 'einsatzort')],
    ['beginn', 'Beginn des Einsatzes', gesetzt(e, 'beginn')],
    ['dauerOderKuendigung', 'Dauer des Einsatzes oder Kündigungsfrist', gesetzt(e, 'ende') || gesetzt(e, 'maxDauerTage') || gesetzt(e, 'kuendigungsfrist')],
    ['arbeitszeit', 'Arbeitszeit', gesetzt(e, 'wochenstunden')],
    ['lohn', 'Lohn', zahl(e?.stundenlohn) > 0],
    ['spesenZulagen', 'Spesen und Zulagen', gesetzt(e, 'spesenInfo') || zahl(e?.mittagszulage) > 0 || zahl(e?.zulageStunde) > 0],
    ['sozialabzuege', 'Abzüge für die Sozialversicherungen', null],
    ['ueberstunden', 'Leistungen bei Überstunden', null],
    ['krankheit', 'Leistungen bei Krankheit', gesetzt(e, 'krankFaktor') && !!a?.krankheit],
    ['unfall', 'Leistungen bei Unfall', null],
    ['ferien', 'Ferien', zahl(e?.ferienProzent) > 0],
    ['lohnzahlungstermin', 'Termin der Lohnzahlung', gesetzt(e, 'lohnzahlung')],
  ]
  for (const [k, titel, ausFeldern] of pflicht) {
    const vorhanden = (a && a[k] === true) || ausFeldern === true
    const unbekannt = !a && ausFeldern !== true
    add({ id: 'pflicht-' + k, gruppe: 'Pflichtangaben', titel, quelle: AVG19,
      status: vorhanden ? 'ok' : unbekannt ? 'info' : 'warnung',
      text: vorhanden ? '' : unbekannt ? 'Nicht geprüft — Vertrag per Foto einlesen, dann prüft die App das automatisch.' : 'Fehlt im Einsatzvertrag. Fehlen Pflichtangaben, gelten die orts- und berufsüblichen Bedingungen bzw. das Gesetz.',
      korrektur: vorhanden ? '' : `Bitte die Angabe „${titel}“ im Einsatzvertrag ergänzen.` })
  }

  // 2) Gesetzliche Mindestwerte
  const fMin = ferienMindestProzent(einst?.profil) || 8.33
  if (gesetzt(e, 'ferienProzent')) {
    const f = zahl(e.ferienProzent)
    add({ id: 'ferien-min', gruppe: 'Mindestwerte', titel: `Ferienentschädigung ${f} %`, quelle: fMin > 9 ? 'OR Art. 329a (unter 20: 5 Wochen) / GAV Personalverleih (ab 50: 5 Wochen)' : 'OR Art. 329a (mind. 4 Wochen = 8.33 %)',
      status: f + 0.005 >= fMin ? 'ok' : 'fehler',
      text: f + 0.005 >= fMin ? '' : `Zu tief: ${alter(einst?.profil) != null ? `mit ${alter(einst.profil)} Jahren ` : ''}stehen dir mindestens ${fMin} % zu (${fMin > 9 ? '5' : '4'} Wochen).`,
      korrektur: `Ferienentschädigung auf mindestens ${fMin} % korrigieren.` })
  }
  const kText = String(e?.kuendigungsfrist || '')
  const tage = [...kText.matchAll(/(\d+)\s*(?:Arbeits|Kalender)?tag/gi)].map((m) => +m[1])
  if (tage.length) {
    const min = Math.min(...tage)
    add({ id: 'kuendigung', gruppe: 'Mindestwerte', titel: `Kündigungsfrist: ${kText}`, quelle: 'AVG Art. 19 Abs. 4',
      status: min >= 2 ? 'ok' : 'fehler',
      text: min >= 2 ? 'Gesetzlich: mind. 2 Tage in den ersten 3 Monaten, mind. 7 Tage im 4.–6. Monat.' : `Zu kurz: ${min} Tag(e). Gesetzlich mindestens 2 Tage in den ersten 3 Monaten.`,
      korrektur: 'Kündigungsfrist auf mindestens 2 Tage (erste 3 Monate) bzw. 7 Tage (4.–6. Monat) korrigieren.' })
  }
  const minWert = (k, titel, min, quelle, text) => {
    if (!gesetzt(e, k)) return
    const v = zahl(e[k])
    add({ id: k, gruppe: 'Mindestwerte', titel: `${titel} ${v} %`, quelle, status: v + 0.005 >= min ? 'ok' : 'warnung', text: v + 0.005 >= min ? '' : text, korrektur: `${titel} auf ${min} % anheben oder schriftliche Grundlage nennen.` })
  }
  minWert('ueberstundenZuschlag', 'Überstundenzuschlag', 25, 'OR Art. 321c', 'Unter 25 % nur zulässig, wenn es schriftlich vereinbart ist.')
  minWert('nachtZuschlag', 'Nachtzuschlag', 25, 'ArG Art. 17b (vorübergehende Nachtarbeit)', 'Für vorübergehende Nachtarbeit sind mindestens 25 % vorgeschrieben.')
  minWert('sonntagZuschlag', 'Sonntagszuschlag', 50, 'ArG Art. 19 (vorübergehende Sonntagsarbeit)', 'Für vorübergehende Sonntagsarbeit sind mindestens 50 % vorgeschrieben.')
  for (const [k, titel, max, quelle] of [['ahv', 'AHV/IV/EO-Abzug', 5.3, 'AHVG/IVG/EOG (Arbeitnehmeranteil)'], ['alv', 'ALV-Abzug', 1.1, 'AVIG (Arbeitnehmeranteil)']]) {
    if (!gesetzt(e, k)) continue
    const v = zahl(e[k])
    add({ id: k, gruppe: 'Mindestwerte', titel: `${titel} ${v} %`, quelle, status: v <= max + 0.005 ? 'ok' : 'fehler',
      text: v <= max + 0.005 ? '' : `Höher als der gesetzliche Arbeitnehmeranteil (${max} %).`, korrektur: `${titel} auf ${max} % korrigieren.` })
  }
  if (gesetzt(e, 'krankFaktor') && zahl(e.krankFaktor) < 80) {
    add({ id: 'krank', gruppe: 'Mindestwerte', titel: `Lohn bei Krankheit ${zahl(e.krankFaktor)} %`, quelle: 'OR Art. 324a / GAV Personalverleih (Krankentaggeld)', status: 'warnung',
      text: 'Üblich ist ein Krankentaggeld von 80 % des Lohns.', korrektur: 'Lohnfortzahlung bei Krankheit (Krankentaggeld 80 %) bestätigen.' })
  }
  if (zahl(e?.karenztage) > 2) {
    add({ id: 'karenz', gruppe: 'Mindestwerte', titel: `${zahl(e.karenztage)} Wartetage bei Krankheit`, quelle: 'GAV Personalverleih', status: 'warnung',
      text: 'Im GAV Personalverleih sind höchstens 2 Wartetage üblich.', korrektur: 'Anzahl Wartetage (Karenztage) bei Krankheit prüfen.' })
  }
  if (zahl(e?.stundenlohn) > 0 && zahl(e?.stundenlohnTotalVertrag) > 0) {
    const ber = stundenlohnTotal(e), v = zahl(e.stundenlohnTotalVertrag)
    add({ id: 'total', gruppe: 'Rechnung', titel: `Total pro Stunde ${v.toFixed(2)}`, quelle: 'Nachgerechnet aus Grundlohn und Prozentsätzen',
      status: Math.abs(ber - v) <= 0.05 ? 'ok' : 'warnung',
      text: Math.abs(ber - v) <= 0.05 ? '' : `Aus den Prozentsätzen ergeben sich ${ber.toFixed(2)} — der Vertrag nennt ${v.toFixed(2)}.`, korrektur: 'Berechnung des Total-Stundenlohns erklären bzw. korrigieren.' })
  }
  if (zahl(e?.stundenlohn) > 0 && !(zahl(e?.dreizehnterProzent) > 0)) {
    add({ id: 'dreizehnter', gruppe: 'Rechnung', titel: 'Kein 13. Monatslohn', quelle: 'GAV / Einsatzbetrieb', status: 'info', text: 'Viele GAV sehen einen 13. Monatslohn (8.33 %) vor — nachfragen, ob er zusteht.', korrektur: 'Bitte bestätigen, ob ein 13. Monatslohn geschuldet ist.' })
  }

  // 3) Unzulässige Klauseln (AVG Art. 19 Abs. 5: nichtig)
  const KL = {
    gebuehr: ['Gebühr zulasten des Arbeitnehmers', 'fehler', 'Gebühren und finanzielle Vorleistungen des Arbeitnehmers sind nichtig.', 'AVG Art. 19 Abs. 5 lit. a'],
    lohnrueckbehalt: ['Lohnrückbehalt / Kaution', 'fehler', 'Lohnrückbehalte und Vorleistungen sind nichtig.', 'AVG Art. 19 Abs. 5 lit. a'],
    uebertrittsverbot: ['Hindernis für den Übertritt in den Einsatzbetrieb', 'fehler', 'Vereinbarungen, die den späteren Übertritt in den Einsatzbetrieb verhindern, sind nichtig.', 'AVG Art. 19 Abs. 5 lit. b'],
    kuendigungKurz: ['Zu kurze Kündigungsfrist', 'fehler', 'Mindestens 2 Tage in den ersten 3 Monaten.', 'AVG Art. 19 Abs. 4'],
    konventionalstrafe: ['Konventionalstrafe', 'warnung', 'Strafklauseln genau prüfen lassen.', 'OR'],
    sonstiges: ['Auffällige Klausel', 'info', 'Von der KI als auffällig markiert — kurz prüfen.', ''],
  }
  for (const k of Array.isArray(e?.klauseln) ? e.klauseln : []) {
    const [titel, status, text, quelle] = KL[k.art] || KL.sonstiges
    add({ id: 'klausel-' + punkte.length, gruppe: 'Klauseln', titel, quelle, status, text: `${text}${k.zitat ? ` Im Vertrag: „${String(k.zitat).slice(0, 160)}“` : ''}`, korrektur: `Klausel streichen bzw. erklären: „${String(k.zitat || titel).slice(0, 120)}“.` })
  }

  // 4) Mindestlohn: nicht schätzen, sondern prüfen lassen
  const KANTON_MINDESTLOHN = ['GE', 'NE', 'JU', 'TI', 'BS']
  add({ id: 'mindestlohn', gruppe: 'Lohn', titel: `Mindestlohn${e?.gavName ? ` (${e.gavName})` : ''}`, quelle: 'GAV Personalverleih / Branchen-GAV',
    status: 'info', text: `Den Grundlohn ${zahl(e?.stundenlohn) ? `(${zahl(e.stundenlohn).toFixed(2)}/h) ` : ''}mit dem Mindestlohn für ${e?.qualifikation || e?.funktion || 'deine Tätigkeit'} vergleichen — z.B. im Lohnrechner auf tempdata.ch (offizielle Plattform des GAV Personalverleih).${KANTON_MINDESTLOHN.includes(e?.kanton) ? ` Der Kanton ${e.kanton} hat zusätzlich einen gesetzlichen Mindestlohn.` : ''}`,
    korrektur: '' })
  if (!gesetzt(e, 'gavName')) add({ id: 'gav', gruppe: 'Lohn', titel: 'Anwendbarer GAV nicht genannt', quelle: 'AVG / GAV Personalverleih', status: 'info', text: 'Welcher GAV gilt, bestimmt Mindestlohn, Ferien und Zuschläge — nachfragen.', korrektur: 'Bitte den anwendbaren GAV nennen.' })

  const urteil = punkte.some((p) => p.status === 'fehler') ? 'problematisch' : punkte.some((p) => p.status === 'warnung') ? 'pruefenswert' : 'gut'
  return { urteil, punkte }
}

export function vertragNachricht({ e, einst, punkte }) {
  return `Guten Tag${e?.bueroKontakt ? ' ' + e.bueroKontakt : ''}\n\n` +
    `vielen Dank für den Einsatzvertrag${e?.einsatznummer ? ` (Nr. ${e.einsatznummer})` : ''} für ${e?.firma || 'den Einsatz'}. Bevor ich unterschreibe, bitte ich Sie, folgende Punkte zu prüfen bzw. zu korrigieren:\n\n` +
    punkte.map((p) => `• ${p.korrektur || p.titel}${p.quelle ? ` (${p.quelle})` : ''}`).join('\n') +
    `\n\nVielen Dank und freundliche Grüsse\n${einst?.name || ''}`
}
