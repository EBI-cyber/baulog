import { HardHat, Factory, Briefcase } from 'lucide-react'

/**
 * Branchen-Vorlagen für einen Einsatz. Die Werte sind VORSCHLÄGE (übliche Regeln) —
 * der Einsatzvertrag / die erste Lohnabrechnung gehen immer vor.
 * Beim Wechsel der Branche werden nur Felder überschrieben, die leer sind oder noch den
 * Vorschlag der bisherigen Branche enthalten.
 */
export const BRANCHEN = [
  {
    id: 'bau', label: 'Bauhauptgewerbe', kurz: 'Bau (LMV)', icon: HardHat,
    hinweis: 'Landesmantelvertrag (LMV): 5 Wochen Ferien, Nacht ab 20 Uhr, Sonntag/Feiertag 100 %, Schlechtwetter, FAR- und Parifonds-Beiträge.',
    funktionen: ['Maurer', 'Stahlbetonbauer', 'Bauarbeiter', 'Vorarbeiter'],
    werte: {
      ferienProzent: '10.64', dreizehnterProzent: '8.33', ueberstundenZuschlag: '25',
      nachtVon: '20', nachtBis: '5', nachtZuschlag: '25', samstagZuschlag: '', sonntagZuschlag: '100',
      feiertagArbeitZuschlag: '100', schlechtwetterFaktor: '80', krankFaktor: '80',
    },
  },
  {
    id: 'industrie', label: 'Industrie / Fertigteilwerk', kurz: 'Industrie', icon: Factory,
    hinweis: 'Arbeitsgesetz: Nacht 23–6 Uhr, vorübergehende Nacht- 25 % und Sonntagsarbeit 50 %; Schicht-/Schmutzzulage oft pro Stunde.',
    funktionen: ['Fertigteilbauer', 'Produktionsmitarbeiter', 'Schalungsbauer', 'Maschinenführer'],
    werte: {
      ferienProzent: '8.33', dreizehnterProzent: '8.33', ueberstundenZuschlag: '25',
      nachtVon: '23', nachtBis: '6', nachtZuschlag: '25', samstagZuschlag: '', sonntagZuschlag: '50',
      feiertagArbeitZuschlag: '50', schlechtwetterFaktor: '0', krankFaktor: '80',
    },
  },
  {
    id: 'andere', label: 'Andere / nur GAV Personalverleih', kurz: 'Andere', icon: Briefcase,
    hinweis: 'Grundregeln GAV Personalverleih und Arbeitsgesetz.',
    funktionen: [],
    werte: {
      ferienProzent: '8.33', dreizehnterProzent: '8.33', ueberstundenZuschlag: '25',
      nachtVon: '23', nachtBis: '6', nachtZuschlag: '25', samstagZuschlag: '', sonntagZuschlag: '50',
      feiertagArbeitZuschlag: '50', schlechtwetterFaktor: '0', krankFaktor: '80',
    },
  },
]
export const branche = (id) => BRANCHEN.find((b) => b.id === id) || null

/** Vorlage anwenden, ohne Vertragswerte zu überschreiben */
export function brancheAnwenden(einsatz, neueId, standard) {
  const alt = branche(einsatz.branche), neu = branche(neueId)
  const out = { ...einsatz, branche: neueId }
  if (!neu) return out
  for (const [k, v] of Object.entries(neu.werte)) {
    const jetzt = einsatz[k]
    if (jetzt === undefined || jetzt === '' || jetzt === standard[k] || (alt && jetzt === alt.werte[k])) out[k] = v
  }
  return out
}
