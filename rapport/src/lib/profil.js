// Persönliche Situation (Fragebogen in den Einstellungen) und was die App daraus ableitet.

export const PROFIL_STANDARD = {
  geburtsdatum: '', strasse: '', plz: '', ort: '', wohnkanton: '',
  status: '',            // CH | C | B | L | G | F | N
  ausweisBis: '',        // Ablaufdatum der Bewilligung
  zivilstand: '',        // ledig | verheiratet | partnerschaft | geschieden | verwitwet
  partnerArbeitet: false, kinder: 0, kirche: false,
  qstTarif: '',          // leer = automatisch
  qstSatz: '',           // % laut Lohnabrechnung
  lohnRhythmus: '',      // woche | monat
  rav: false,
  mindestpause: true,    // fehlende Pausen nach Arbeitsgesetz automatisch ergänzen
  krankMeldenBis: '07:00',
  arbeitsweg: '',        // auto | motorrad | oev | velo | fuss
  fertigAm: null,
}

export const STATUS = [
  { id: 'CH', label: 'Schweizer/in' }, { id: 'C', label: 'C-Ausweis' }, { id: 'B', label: 'B-Ausweis' },
  { id: 'L', label: 'L-Ausweis' }, { id: 'G', label: 'G (Grenzgänger)' }, { id: 'F', label: 'F / N' },
]

/** Quellensteuerpflichtig: ausländische Arbeitnehmende ohne C-Ausweis */
export const quellensteuerPflichtig = (p) => ['B', 'L', 'G', 'F', 'N'].includes(p?.status)

/** Tarifcode (vereinfacht): A ledig, B verheiratet Alleinverdiener, C Doppelverdiener, H alleinerziehend; + Kinder + Kirche Y/N */
export function tarifAuto(p) {
  if (!p) return ''
  const verh = ['verheiratet', 'partnerschaft'].includes(p.zivilstand)
  const k = Math.min(9, +p.kinder || 0)
  const buchst = verh ? (p.partnerArbeitet ? 'C' : 'B') : k > 0 ? 'H' : 'A'
  return `${buchst}${k}${p.kirche ? 'Y' : 'N'}`
}
export const tarif = (p) => p?.qstTarif || tarifAuto(p)

export function alter(p, am = new Date()) {
  if (!p?.geburtsdatum) return null
  const g = new Date(p.geburtsdatum + 'T12:00')
  let a = am.getFullYear() - g.getFullYear()
  if (am.getMonth() < g.getMonth() || (am.getMonth() === g.getMonth() && am.getDate() < g.getDate())) a--
  return a
}

/** Ferien laut GAV Personalverleih: bis 20 und ab 50 Jahren 5 Wochen (10.64 %), sonst 4 Wochen (8.33 %) */
export function ferienMindestProzent(p) {
  const a = alter(p)
  if (a == null) return null
  return a < 20 || a >= 50 ? 10.64 : 8.33
}

/** Tage bis zum Ablauf des Ausweises (null = kein Datum) */
export function ausweisTage(p) {
  if (!p?.ausweisBis || p.status === 'CH') return null
  return Math.ceil((new Date(p.ausweisBis + 'T23:59') - Date.now()) / 864e5)
}

/** Mindestpause nach Arbeitsgesetz (Art. 15 ArG) in Minuten für eine Arbeitszeit in Minuten */
export function mindestPause(arbeitMin) {
  if (arbeitMin > 9 * 60) return 60
  if (arbeitMin > 7 * 60) return 30
  if (arbeitMin > 5.5 * 60) return 15
  return 0
}

export const profilFertig = (p) => !!p?.fertigAm
