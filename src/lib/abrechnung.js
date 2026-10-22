import { filterByRange } from './calc'

// Abschläge (intern: "rechnungen"): Zeiträume, Zahlungen, Übertrag-Kette und Prüfung vor dem Versenden.

// "2.000" / "2000,50" / "1.969,42" / "2000.5" → Zahl
export function parseBetrag(v) {
  if (typeof v === 'number') return v
  let t = String(v || '').replace(/[€\s]|EUR/gi, '')
  if (!t) return 0
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

const rund = (n) => Math.round((Number(n) || 0) * 100) / 100
const tag = (d) => (d ? String(d).slice(0, 10) : null)

// Überschneidet sich der Zeitraum von–bis mit einem bestehenden Abschlag? Leere Grenze = offen.
export function ueberschneidung(rechnungen, von, bis, ohneId) {
  const a1 = tag(von) || '0000-00-00', b1 = tag(bis) || '9999-12-31'
  return rechnungen.find((r) => {
    if (ohneId != null && r.id === ohneId) return false
    const a2 = tag(r.von) || '0000-00-00', b2 = tag(r.bis) || '9999-12-31'
    return a1 <= b2 && a2 <= b1
  }) || null
}

export const nachNr = (rechnungen) => rechnungen.slice().sort((a, b) => (Number(a.nr) || 0) - (Number(b.nr) || 0))

// Übertrag-Kette neu rechnen: Übertrag = offener Rest (oder Guthaben) des vorherigen Abschlags.
// Liefert nur die Abschläge, deren Werte sich ändern: [{ id, patch }]
export function ketteNeu(rechnungen) {
  const out = []
  let vorher = null
  for (const r of nachNr(rechnungen)) {
    const vorherigerSaldo = vorher ? vorher.saldo : rund(r.vorherigerSaldo)
    const gesamtbetrag = rund(rund(r.betrag) + vorherigerSaldo)
    const saldo = rund(gesamtbetrag - rund(r.bezahlterBetrag))
    const patch = { vorherigerSaldo, gesamtbetrag, saldo, bezahlt: saldo <= 0 }
    const anders = Object.keys(patch).some((k) => (k === 'bezahlt' ? Boolean(r[k]) !== patch[k] : rund(r[k]) !== patch[k]))
    if (anders) out.push({ id: r.id, patch })
    vorher = { saldo }
  }
  return out
}

const datum = (d) => { try { return d ? new Date(d).toLocaleDateString('de-DE') : '…' } catch { return '…' } }
const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

// Prüfung vor dem Erzeugen eines Nachweises/Abschlags. Rückgabe: [{ stufe: 'fehler'|'hinweis', text }]
// Fehler sperren das Festhalten als Abschlag, Hinweise nicht.
export function pruefeNachweis({ projekt, eintraege, rechnungen, von, bis, alsAbschlag, betrag, vorherigerSaldo }) {
  const m = []
  const imZeitraum = filterByRange(eintraege, von, bis)
  if (alsAbschlag) {
    const k = ueberschneidung(rechnungen, von, bis)
    if (k) m.push({ stufe: 'fehler', text: 'Der Zeitraum überschneidet sich mit Abschlag ' + (k.nr ?? '') + ' (' + datum(k.von) + ' – ' + datum(k.bis) + '). Diese Leistungen wären doppelt berechnet.' })
    if (!von && rechnungen.length) m.push({ stufe: 'fehler', text: 'Bitte ein Startdatum angeben, sonst zählen die bereits abgerechneten Leistungen noch einmal mit.' })
    if (vorherigerSaldo > 0 && betrag > 0 && Math.abs(vorherigerSaldo - betrag) < 0.01) m.push({ stufe: 'fehler', text: 'Der Übertrag ist genau so hoch wie die Leistungen dieses Abschlags. Das deutet auf einen doppelt abgerechneten Zeitraum hin.' })
    if (vorherigerSaldo > 0) m.push({ stufe: 'hinweis', text: 'Aus dem letzten Abschlag sind ' + eur(vorherigerSaldo) + ' als unbezahlt vermerkt und werden übertragen. Wurde schon gezahlt? Dann zuerst unter „Abschläge & Zahlungen“ eintragen.' })
  }
  if (!imZeitraum.length) m.push({ stufe: 'fehler', text: 'Im gewählten Zeitraum gibt es keine Einträge.' })
  const nullZeit = imZeitraum.filter((e) => e.type === 'zeit' && !(Number(e.minutes) > 0))
  if (nullZeit.length) m.push({ stufe: 'hinweis', text: 'Zeiteinträge mit 0 Stunden: ' + nullZeit.map((e) => datum(e.createdAt)).join(', ') + '.' })
  const cm = imZeitraum.filter((e) => e.type === 'menge' && /^(mm|cm)$/i.test(String(e.einheit || '').trim()))
  if (cm.length) m.push({ stufe: 'hinweis', text: 'Mengen in ' + cm[0].einheit + ' erfasst, der Einheitspreis gilt dann je ' + cm[0].einheit + '. Meist ist m, m² oder Stück gemeint.' })
  const ohneUhrzeit = imZeitraum.filter((e) => e.type === 'zeit' && !(e.startAt && e.endAt))
  if (ohneUhrzeit.length) m.push({ stufe: 'hinweis', text: ohneUhrzeit.length + ' Zeiteinträge ohne Uhrzeit. Im PDF steht dort „Dauer ohne erfasste Uhrzeit“.' })
  if (projekt && /unbekannt/i.test(String(projekt.address || '') + ' ' + String(projekt.customer || ''))) m.push({ stufe: 'hinweis', text: 'Kunde oder Adresse enthält „unbekannt“. Bitte im Projekt prüfen.' })
  return m
}
