import { zahl } from './settings'
import { chf } from './lohn'

/**
 * Laienverständliche Erklärung jeder Zeile der Lohnabrechnung (Prüfung):
 * { was: was ist das, rechnung: wie kommt die Zahl zustande (mit den Zahlen der Abrechnung), woher: Grundlage }
 * Ohne KI — feste Texte + Zahlen aus der gelesenen Abrechnung (ki) bzw. der App.
 */
const f2 = (n) => (Math.round(zahl(n) * 100) / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pz = (n) => `${String(Math.round(zahl(n) * 10000) / 10000)} %`

const TEXTE = {
  stunden: { was: 'Alle Stunden, die du in dieser Abrechnungsperiode gearbeitet hast.', woher: 'Deine unterschriebenen Wochenrapporte. Die App vergleicht sie mit deinen erfassten Zeiten.' },
  ansatz: { was: 'Dein Grundlohn pro Stunde — ohne Ferien, Feiertage und 13. Monatslohn.', woher: 'Einsatzvertrag (darf den Mindestlohn des GAV nicht unterschreiten).' },
  grundlohn: { was: 'Lohn für die gearbeiteten Stunden ohne Zuschläge.', woher: 'Stunden × Grundlohn pro Stunde.' },
  ueberstunden: { was: 'Zuschlag für Stunden über der vereinbarten Arbeitszeit.', woher: 'Einsatzvertrag/GAV (meist 25 %). Bei „durchschnittlicher Arbeitszeit“ entstehen Überstunden erst über das Jahr gesehen.' },
  nacht: { was: 'Zuschlag für Arbeit in der Nacht.', woher: 'Arbeitsgesetz / GAV.' },
  samstag: { was: 'Zuschlag für Samstagsarbeit (wenn vereinbart).', woher: 'Einsatzvertrag / GAV.' },
  sonntag: { was: 'Zuschlag für Sonntagsarbeit.', woher: 'Arbeitsgesetz (mind. 50 %) / GAV.' },
  feiertagarbeit: { was: 'Zuschlag für Arbeit an einem Feiertag.', woher: 'Arbeitsgesetz / GAV.' },
  ferien: { was: 'Ferienentschädigung: Als Temporärer bekommst du die Ferien nicht als freie bezahlte Tage, sondern als Zuschlag auf jede Stunde. 8.33 % ≈ 4 Wochen, 10.64 % ≈ 5 Wochen, 11.83 % ≈ 5.5 Wochen Ferien pro Jahr.', woher: 'Einsatzvertrag / GAV Personalverleih, Obligationenrecht Art. 329d.' },
  feiertag: { was: 'Feiertagsentschädigung: Bezahlte Feiertage (z.B. Weihnachten, Ostern) werden ebenfalls als Zuschlag pro Stunde ausgeglichen.', woher: 'GAV Personalverleih (Satz im Einsatzvertrag, z.B. 2.77 % ≈ 7 Feiertage).' },
  dreizehnter: { was: '13. Monatslohn — anteilig mit jeder Stunde: 8.33 % = ein Zwölftel.', woher: 'GAV Personalverleih / Einsatzvertrag. Gerechnet auf Grundlohn + Ferien + Feiertag.' },
  absenzen: { was: 'Lohn für bezahlte Abwesenheiten (Krankheit, Unfall, Militär, bezogene Ferien …).', woher: 'Meist 80 % des Lohns über die Krankentaggeld-/Unfallversicherung, ab Wartetagen laut Vertrag.' },
  brutto: { was: 'Bruttolohn: alles zusammen, bevor etwas abgezogen wird. Darauf werden die Sozialabzüge berechnet (AHV-pflichtiger Lohn).', woher: 'Summe aller Lohnzeilen.' },
  ahv: { was: 'AHV/IV/EO: staatliche Altersrente (1. Säule), Invalidenversicherung und Erwerbsersatz (z.B. Militär). Der Arbeitgeber zahlt gleich viel dazu.', woher: 'Gesetzlich 5.3 % für dich (gleich für alle).' },
  alv: { was: 'Arbeitslosenversicherung: Sie zahlt dir Taggeld, wenn du arbeitslos wirst (RAV).', woher: 'Gesetzlich 1.1 % (bis CHF 148’200 Jahreslohn).' },
  nbu: { was: 'Nichtberufsunfall: Versicherung für Unfälle in der Freizeit (Sport, Haushalt, Verkehr). Berufsunfälle zahlt der Arbeitgeber.', woher: 'Satz der Unfallversicherung des Büros (der Buchstabe, z.B. „Code H“, ist dessen Tarifklasse).' },
  ktg: { was: 'Krankentaggeld: Wenn du krank bist, bekommst du meist 80 % deines Lohns während bis zu 2 Jahren.', woher: 'Kollektivversicherung des Büros / GAV Personalverleih.' },
  bvg: { was: 'Pensionskasse (2. Säule): dein Sparguthaben fürs Alter, zusätzlich zur AHV. Das Geld gehört dir und wird bei einem Stellenwechsel auf die neue Kasse oder ein Freizügigkeitskonto übertragen. Der Arbeitgeber zahlt mindestens gleich viel.', woher: 'BVG-Gesetz und Reglement der Pensionskasse. Gerechnet auf dem „koordinierten Lohn“ = Bruttolohn minus Koordinationsabzug — deshalb ist die Basis kleiner als der Bruttolohn.' },
  gav: { was: 'Vollzugskosten GAV: kleiner Beitrag an die Kontrolle des Gesamtarbeitsvertrags (Lohnkontrollen, Weiterbildung). Der Arbeitgeber zahlt mit.', woher: 'GAV Personalverleih (0.4 %).' },
  far: { was: 'FAR: Fonds für die Frühpensionierung im Bauhauptgewerbe.', woher: 'GAV FAR (Bau).' },
  parifonds: { was: 'Parifonds/Berufsbeitrag: Beitrag an Aus- und Weiterbildung der Branche.', woher: 'Branchen-GAV.' },
  quellensteuer: { was: 'Quellensteuer: Deine Einkommenssteuer wird direkt vom Lohn abgezogen (für Ausländer ohne C-Ausweis). Der Satz hängt vom Monatslohn, Zivilstand, Kindern und Wohnkanton ab.', woher: 'Offizielle Tabelle der Eidg. Steuerverwaltung für deinen Wohnkanton und Tarif (z.B. A0N, C2N).' },
  netto: { was: 'Nettolohn: Bruttolohn minus alle Abzüge — das gehört dir.', woher: 'Brutto − Abzüge.' },
  spesen: { was: 'Spesen und Zulagen: Ersatz für Auslagen (z.B. Essen auswärts). Darauf gibt es keine Abzüge.', woher: 'Einsatzvertrag / Spesenreglement.' },
  rueckstellung: { was: 'Zurückbehaltenes Guthaben: Das Büro zahlt die Ferienentschädigung (netto) nicht sofort aus, sondern spart sie für dich. Du bekommst sie, wenn du Ferien nimmst oder der Einsatz endet.', woher: 'So handhabt es das Büro (z.B. Bellini „Rückstellung Feriengeld Netto“). Das Geld gehört dir.' },
  vorschuesse: { was: 'Bereits ausbezahlt: Beträge, die du schon vorher bekommen hast (wöchentlicher Vorschuss/Lohn). Sie werden hier wieder abgezogen, damit nichts doppelt bezahlt wird.', woher: 'Deine Zahlungen laut Bankauszug (in der App unter Zahlungen erfasst).' },
  auszahlung: { was: 'Auszahlung: was jetzt noch auf dein Konto kommt. 0.00 heisst: alles wurde schon vorher ausbezahlt.', woher: 'Netto + Spesen − zurückbehaltenes Guthaben − bereits ausbezahlt.' },
  guthaben: { was: 'Guthaben: wie viel das Büro insgesamt für dich angespart hat (Stand nach dieser Abrechnung).', woher: 'Summe aller Rückstellungen minus bezogene Ferien/Auszahlungen.' },
}

function schluessel(id) {
  if (id.startsWith('abzug-bvg-basis')) return 'bvg'
  if (id === 'abzug-qst') return 'quellensteuer'
  if (id.startsWith('abzug-')) return id.replace(/^abzug-/, '').replace(/-satz$/, '')
  if (id.startsWith('guthaben-')) return 'guthaben'
  return id.replace(/-modus$/, '')
}

/** Erklärung zu einem Prüfpunkt c ({ id, titel, app, ab }) mit den gelesenen Daten ki */
export function erklaeren(c, ki = {}, w = 'CHF') {
  const k = schluessel(c.id)
  const t = TEXTE[k] || { was: c.titel, woher: '' }
  const pos = Array.isArray(ki.positionen) ? ki.positionen : []
  const abz = Array.isArray(ki.abzuege) ? ki.abzuege : []
  let rechnung = ''
  const zeile = pos.find((x) => x.art === k) || (k === 'grundlohn' ? pos.find((x) => x.art === 'grundlohn') : null)
  if (k === 'grundlohn' && zeile) rechnung = `${f2(zeile.menge)} h × ${chf(zeile.ansatz, w)} = ${chf(zeile.betrag, w)}`
  else if (['ferien', 'feiertag', 'dreizehnter', 'ueberstunden', 'nacht', 'samstag', 'sonntag', 'feiertagarbeit'].includes(k) && zeile && zeile.menge && zeile.ansatz) {
    const grund = zahl(pos.find((x) => x.art === 'grundlohn')?.ansatz)
    rechnung = `${f2(zeile.menge)} h × ${chf(zeile.ansatz, w)} pro Stunde = ${chf(zeile.betrag, w)}` + (grund && k !== 'dreizehnter' ? ` (${chf(zeile.ansatz, w)} ≈ ${(zahl(zeile.ansatz) / grund * 100).toFixed(2)} % von ${chf(grund, w)})` : '')
  } else if (k === 'brutto' && pos.length) rechnung = pos.filter((x) => !['spesen', 'mittag'].includes(x.art)).map((x) => f2(x.betrag)).join(' + ') + ` = ${chf(ki.brutto, w)}`
  else if (['ahv', 'alv', 'nbu', 'ktg', 'bvg', 'gav', 'far', 'parifonds', 'quellensteuer'].includes(k)) {
    const a = abz.find((x) => x.art === k)
    if (a && a.basis && a.prozent) rechnung = `${chf(a.basis, w)} × ${pz(a.prozent)} = ${chf(a.betrag, w)}`
    if (k === 'bvg' && a?.basis && ki.brutto) rechnung += ` · Basis ${chf(a.basis, w)} = Brutto ${chf(ki.brutto, w)} − Koordinationsabzug ${chf(zahl(ki.brutto) - zahl(a.basis), w)}`
    if (k === 'quellensteuer' && !a) rechnung = c.app > 0 ? `Laut Tabelle wären es ${chf(c.app, w)} — auf der Abrechnung steht nichts.` : ''
  } else if (k === 'netto' && ki.brutto != null) rechnung = `${chf(ki.brutto, w)} − Abzüge ${chf(abz.reduce((s, a) => s + zahl(a.betrag), 0), w)} = ${chf(ki.netto, w)}`
  else if (k === 'auszahlung' && ki.netto != null) {
    const r = zahl(ki.rueckstellungen?.ferien) + zahl(ki.rueckstellungen?.feiertag) + zahl(ki.rueckstellungen?.dreizehnter)
    rechnung = `Netto ${chf(ki.netto, w)}${r ? ` − zurückbehalten ${chf(r, w)}` : ''}${zahl(ki.vorschuesse) ? ` − bereits ausbezahlt ${chf(ki.vorschuesse, w)}` : ''} = ${chf(ki.auszahlung, w)}`
  } else if (k === 'rueckstellung' && ki.rueckstellungen?.ferien) {
    const fe = pos.find((x) => x.art === 'ferien')
    rechnung = fe ? `Ferienentschädigung ${chf(fe.betrag, w)} minus Abzüge darauf = ${chf(ki.rueckstellungen.ferien, w)} netto zurückbehalten` : ''
  } else if (k === 'vorschuesse' && Array.isArray(ki.vorschussZeilen) && ki.vorschussZeilen.length) rechnung = ki.vorschussZeilen.map((x) => `${x.text || 'Vorschuss'}: ${chf(x.betrag, w)}`).join(' · ')
  else if (k === 'stunden' && ki.stundenTotal) rechnung = `${f2(ki.stundenTotal)} h laut Abrechnung`
  return { was: t.was, rechnung, woher: t.woher }
}
