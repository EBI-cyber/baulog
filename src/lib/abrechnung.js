import { filterByRange, projektTotals } from './calc'

// Abschläge (intern: "rechnungen"): Zuordnung der Einträge, Zahlungen, Übertrag-Kette und Prüfung vor dem Versenden.
// Jeder Eintrag merkt sich in abschlagToken, mit welchem Abschlag er abgerechnet wurde. Ein neuer Abschlag
// nimmt alle Einträge ohne abschlagToken – das Datum spielt dafür keine Rolle, nachgetragene Arbeiten
// können also weder verloren gehen noch doppelt berechnet werden.

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
const tag = (e) => String(e.createdAt || '').slice(0, 10)
const nachDatum = (liste) => liste.slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))

export const nachNr = (rechnungen) => rechnungen.slice().sort((a, b) => (Number(a.nr) || 0) - (Number(b.nr) || 0))
export const nachAnlage = (rechnungen) => rechnungen.slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))

// Einträge eines Abschlags bzw. noch nicht abgerechnete Einträge (optional nur bis zu einem Tag)
export const eintraegeVon = (eintraege, r) => eintraege.filter((e) => r.token && e.abschlagToken === r.token)
export const offeneEintraege = (eintraege, bis) => eintraege.filter((e) => !e.abschlagToken && (!bis || tag(e) <= bis))

// Erster bis letzter Arbeitstag einer Liste
export function leistungszeitraum(liste) {
  const tage = liste.map(tag).filter(Boolean).sort()
  return { von: tage[0] || null, bis: tage[tage.length - 1] || null }
}

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

// Einmalige automatische Zuordnung für Abschläge, die noch keine Einträge kennen (angelegt vor dieser Funktion):
// Von den noch freien Einträgen im gespeicherten Zeitraum werden Tag für Tag so viele genommen, bis die Summe
// dem damals berechneten Betrag entspricht. Rückgabe: { zuordnungen: [{ r, ids, von, bis }], offen: [r] }
export function zuordnungVorschlag(rechnungen, eintraege, rate) {
  const vergeben = new Set(eintraege.filter((e) => e.abschlagToken).map((e) => e.id))
  const zuordnungen = [], offen = []
  for (const r of nachAnlage(rechnungen)) {
    if (eintraegeVon(eintraege, r).length) continue
    const kandidaten = nachDatum(filterByRange(eintraege, r.von, r.bis).filter((e) => !vergeben.has(e.id)))
    const tage = [...new Set(kandidaten.map(tag))]
    let treffer = null
    for (const t of tage) {
      const bisher = kandidaten.filter((e) => tag(e) <= t)
      if (Math.abs(projektTotals(bisher, rate).total - (Number(r.betrag) || 0)) < 1) { treffer = bisher; break }
    }
    if (!treffer) { offen.push(r); continue }
    treffer.forEach((e) => vergeben.add(e.id))
    zuordnungen.push({ r, ids: treffer.map((e) => e.id), ...leistungszeitraum(treffer) })
  }
  return { zuordnungen, offen }
}

// Abschläge, deren Einträge inzwischen geändert wurden (Summe weicht vom berechneten Betrag ab)
export function abweichungen(rechnungen, eintraege, rate) {
  const out = []
  for (const r of rechnungen) {
    const liste = eintraegeVon(eintraege, r)
    if (!liste.length) continue
    const jetzt = projektTotals(liste, rate).total
    if (Math.abs(jetzt - (Number(r.betrag) || 0)) >= 1) out.push({ r, jetzt })
  }
  return out
}

const datum = (d) => { try { return d ? new Date(d).toLocaleDateString('de-DE') : '…' } catch { return '…' } }
const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

// Prüfung vor dem Erzeugen eines Nachweises/Abschlags. Rückgabe: [{ stufe: 'fehler'|'hinweis', text }]
// Fehler sperren das Festhalten als Abschlag, Hinweise nicht.
export function pruefeNachweis({ projekt, eintraege, rechnungen, von, bis, alsAbschlag, betrag, vorherigerSaldo }) {
  const m = []
  const rate = projekt && projekt.hourlyRate
  const liste = alsAbschlag ? offeneEintraege(eintraege, bis) : filterByRange(eintraege, von, bis)
  if (alsAbschlag) {
    const ohne = rechnungen.filter((r) => !eintraegeVon(eintraege, r).length)
    if (ohne.length) m.push({ stufe: 'fehler', text: 'Abschlag ' + ohne.map((r) => r.nr).join(', ') + ' ist noch keinen Einträgen zugeordnet. Sonst würden diese Leistungen noch einmal berechnet. Bitte unter „Abschläge & Zahlungen“ prüfen.' })
    if (vorherigerSaldo > 0 && betrag > 0 && Math.abs(vorherigerSaldo - betrag) < 0.01) m.push({ stufe: 'fehler', text: 'Der Übertrag ist genau so hoch wie die Leistungen dieses Abschlags. Das deutet auf doppelt abgerechnete Leistungen hin.' })
    if (vorherigerSaldo > 0) m.push({ stufe: 'hinweis', text: 'Aus dem letzten Abschlag sind ' + eur(vorherigerSaldo) + ' als unbezahlt vermerkt und werden übertragen. Wurde schon gezahlt? Dann zuerst unter „Abschläge & Zahlungen“ eintragen.' })
    for (const a of abweichungen(rechnungen, eintraege, rate)) {
      m.push({ stufe: 'hinweis', text: 'Einträge von Abschlag ' + (a.r.nr ?? '') + ' wurden nachträglich geändert: jetzt ' + eur(a.jetzt) + ', berechnet wurden ' + eur(a.r.betrag) + '.' })
    }
  }
  if (!liste.length) m.push({ stufe: 'fehler', text: alsAbschlag ? 'Es gibt keine Leistungen, die noch nicht abgerechnet sind.' : 'Im gewählten Zeitraum gibt es keine Einträge.' })
  const nullZeit = liste.filter((e) => e.type === 'zeit' && !(Number(e.minutes) > 0))
  if (nullZeit.length) m.push({ stufe: 'hinweis', text: 'Zeiteinträge mit 0 Stunden: ' + nullZeit.map((e) => datum(e.createdAt)).join(', ') + '.' })
  const cm = liste.filter((e) => e.type === 'menge' && /^(mm|cm)$/i.test(String(e.einheit || '').trim()))
  if (cm.length) m.push({ stufe: 'hinweis', text: 'Mengen in ' + cm[0].einheit + ' erfasst, der Einheitspreis gilt dann je ' + cm[0].einheit + '. Meist ist m, m² oder Stück gemeint.' })
  const ohneUhrzeit = liste.filter((e) => e.type === 'zeit' && !(e.startAt && e.endAt))
  if (ohneUhrzeit.length) m.push({ stufe: 'hinweis', text: ohneUhrzeit.length + ' Zeiteinträge ohne Uhrzeit. Im PDF steht dort „Dauer ohne erfasste Uhrzeit“.' })
  if (projekt && /unbekannt/i.test(String(projekt.address || '') + ' ' + String(projekt.customer || ''))) m.push({ stufe: 'hinweis', text: 'Kunde oder Adresse enthält „unbekannt“. Bitte im Projekt prüfen.' })
  return m
}

// Mögliche Test-Einträge: Zeiten unter 1 Minute und einzelne Einträge,
// die mehr als 30 Tage vor dem eigentlichen Arbeitsbeginn liegen und zusammen kaum etwas kosten.
// Rückgabe: [{ e, grund }]
export function verdaechtigeEintraege(liste, rate) {
  const out = new Map()
  const merk = (e, grund) => { if (!out.has(e.id)) out.set(e.id, { e, grund }) }
  for (const e of liste) {
    if (e.type === 'zeit' && !(Number(e.minutes) >= 1)) merk(e, 'Zeit unter 1 Minute')
  }
  const tage = [...new Set(liste.map(tag).filter(Boolean))].sort()
  for (let i = 1; i < tage.length; i++) {
    const luecke = (new Date(tage[i]) - new Date(tage[i - 1])) / 86400000
    if (luecke <= 30) continue
    const frueh = liste.filter((e) => tag(e) < tage[i])
    if (projektTotals(frueh, rate).total < 5) frueh.forEach((e) => merk(e, 'Einzeln, ' + Math.round(luecke) + ' Tage vor Arbeitsbeginn'))
    break
  }
  return nachDatum([...out.values()].map((x) => x.e)).map((e) => out.get(e.id))
}
