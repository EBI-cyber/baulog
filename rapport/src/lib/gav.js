/**
 * Regeln aus allgemeinverbindlichen Branchen-GAV (Quelle: tempdata, Personalverleih <Branche>).
 * Werden erkannt über den GAV-Namen des Einsatzes (`gavName`, von der KI aus dem Vertrag gelesen) und gelten als
 * Standard — Werte, die im Einsatz ausgefüllt sind, gehen vor.
 *
 * Felder:
 *  ueberzeitGrenze/ueberzeitZuschlag — Überzeit (ArG Art. 9/13, Industrie 45 h/Woche): Zuschlag, wenn angeordnet
 *  samstagNach5 — Samstagszuschlag nur, wenn in der Woche schon 5 Normalarbeitstage geleistet wurden
 *  krankStundenBasis 'vertrag' — Fehltage (Ferien, Feiertag, Krankheit, Unfall) mit der Tagessollzeit
 *  ueberstundenAusgleich 'jahr' — Überstunden innert eines Jahres mit Freizeit kompensieren, sonst ohne Zuschlag ausbezahlt
 */
export const GAV = [
  {
    id: 'betonwaren', name: 'Betonwaren-Industrie Schweiz', muster: /betonwaren|betonfertigteil/i,
    quelle: 'GAV Schweizerische Betonwaren-Industrie (Art. 3, Nachtrag 2006) via tempdata',
    regeln: {
      ueberzeitGrenze: '45', ueberzeitZuschlag: '25', samstagZuschlag: '25', samstagNach5: true,
      krankStundenBasis: 'vertrag', ueberstundenAusgleich: 'jahr', ueberstundenModus: 'keine',
    },
    text: [
      'Überstunden (über der vertraglichen Wochenarbeitszeit) innert eines Jahres mit Freizeit gleicher Dauer kompensieren — sonst Auszahlung ohne Zuschlag.',
      'Angeordnete Überzeit (über 45 h pro Woche, Arbeitsgesetz) mit 25 % Zuschlag in Geld oder Freizeit.',
      'Samstag ausnahmsweise: 25 % Zuschlag, wenn in der Woche schon 5 Normalarbeitstage geleistet wurden.',
      'Zweischichtbetrieb: CHF 1.50 pro Stunde (als „Zulage pro Std.“ im Einsatz eintragen, falls du Schicht arbeitest).',
      'Fehltage (Ferien, Feiertage, Krankheit, Unfall) zählen mit der Tagessollzeit.',
      'Mindestlohn BetonwerkerIn EFZ ab 1.6.2026: CHF 4\'900.– pro Monat (182.5 h → CHF 26.85/h).',
    ],
  },
]

export const gavFuer = (e) => (e ? GAV.find((g) => g.muster.test(`${e.gavName || ''} ${e.gav_name || ''}`)) || null : null)

/** Einsatz mit den GAV-Standards ergänzt (ausgefüllte Felder des Einsatzes gehen vor) */
export function mitGav(e) {
  const g = gavFuer(e)
  if (!g) return e
  const eigene = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== '' && v != null))
  return { ...g.regeln, ...eigene }
}
