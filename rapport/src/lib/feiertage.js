import { isoDatum } from './zeit'

// Gesetzliche/üblich arbeitsfreie Feiertage je Kanton (Hauptliste, ohne Gewähr —
// kommunale und konfessionell-regionale Abweichungen gibt es v.a. in AG, FR, SG, GR).

export const KANTONE = {
  ZH: 'Zürich', BE: 'Bern', LU: 'Luzern', UR: 'Uri', SZ: 'Schwyz', OW: 'Obwalden', NW: 'Nidwalden', GL: 'Glarus',
  ZG: 'Zug', FR: 'Freiburg', SO: 'Solothurn', BS: 'Basel-Stadt', BL: 'Basel-Landschaft', SH: 'Schaffhausen',
  AR: 'Appenzell A.Rh.', AI: 'Appenzell I.Rh.', SG: 'St. Gallen', GR: 'Graubünden', AG: 'Aargau', TG: 'Thurgau',
  TI: 'Tessin', VD: 'Waadt', VS: 'Wallis', NE: 'Neuenburg', GE: 'Genf', JU: 'Jura',
}

const LISTE = {
  ZH: 'NJ BT KF OM TA AU PM BF WE ST', BE: 'NJ BT KF OM AU PM BF WE ST',
  LU: 'NJ BT KF OM AU PM FL BF MH AH ME WE ST', UR: 'NJ HK JO KF OM AU PM FL BF MH AH ME WE ST',
  SZ: 'NJ HK JO KF OM AU PM FL BF MH AH ME WE ST', OW: 'NJ BT KF OM AU PM FL BF MH BK AH ME WE ST',
  NW: 'NJ JO KF OM AU PM FL BF MH AH ME WE ST', GL: 'NJ BT KF OM NF AU PM BF AH WE ST',
  ZG: 'NJ BT KF OM AU PM FL BF MH AH ME WE ST', FR: 'NJ BT KF OM AU PM FL BF MH AH ME WE ST',
  SO: 'NJ BT KF OM TA AU PM FL BF MH AH ME WE ST', BS: 'NJ KF OM TA AU PM BF WE ST', BL: 'NJ KF OM TA AU PM BF WE ST',
  SH: 'NJ BT KF OM TA AU PM BF WE ST', AR: 'NJ KF OM AU PM BF WE ST', AI: 'NJ KF OM AU PM FL BF MH AH ME WE ST',
  SG: 'NJ KF OM AU PM BF AH WE ST', GR: 'NJ KF OM AU PM BF WE ST', AG: 'NJ BT KF OM AU PM BF WE ST',
  TG: 'NJ BT KF OM TA AU PM BF WE ST', TI: 'NJ HK JO OM TA AU PM FL PP BF MH AH ME WE ST',
  VD: 'NJ BT KF OM AU PM BF BM WE', VS: 'NJ JO AU FL BF MH AH ME WE', NE: 'NJ RP KF OM AU PM BF WE ST',
  GE: 'NJ KF OM AU PM BF JG WE RE', JU: 'NJ BT KF OM TA AU PM FL IN BF MH AH WE',
}

const NAMEN = {
  NJ: 'Neujahr', BT: 'Berchtoldstag', HK: 'Heilige Drei Könige', JO: 'Josefstag', RP: 'Republikfeier', KF: 'Karfreitag',
  OM: 'Ostermontag', NF: 'Näfelser Fahrt', TA: 'Tag der Arbeit', AU: 'Auffahrt', PM: 'Pfingstmontag', FL: 'Fronleichnam',
  IN: 'Unabhängigkeitstag', PP: 'Peter und Paul', BF: 'Bundesfeier', MH: 'Mariä Himmelfahrt', JG: 'Genfer Bettag',
  BM: 'Bettagsmontag', BK: 'Bruder Klaus', AH: 'Allerheiligen', ME: 'Mariä Empfängnis', WE: 'Weihnachten',
  ST: 'Stephanstag', RE: 'Restauration',
}

function ostern(j) { // Gauss/Meeus
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(j, monat - 1, tag)
}
const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
/** n-ter Wochentag (0=So) im Monat */
function nterWochentag(j, monat, wt, n) {
  const d = new Date(j, monat, 1)
  return new Date(j, monat, 1 + ((wt - d.getDay() + 7) % 7) + (n - 1) * 7)
}

function datum(code, j) {
  const o = ostern(j)
  switch (code) {
    case 'NJ': return new Date(j, 0, 1); case 'BT': return new Date(j, 0, 2); case 'HK': return new Date(j, 0, 6)
    case 'RP': return new Date(j, 2, 1); case 'JO': return new Date(j, 2, 19)
    case 'KF': return plus(o, -2); case 'OM': return plus(o, 1); case 'AU': return plus(o, 39)
    case 'PM': return plus(o, 50); case 'FL': return plus(o, 60)
    case 'NF': { // erster Donnerstag im April, in der Karwoche eine Woche später
      const d = nterWochentag(j, 3, 4, 1)
      return d >= plus(o, -7) && d <= plus(o, 1) ? plus(d, 7) : d
    }
    case 'TA': return new Date(j, 4, 1); case 'IN': return new Date(j, 5, 23); case 'PP': return new Date(j, 5, 29)
    case 'BF': return new Date(j, 7, 1); case 'MH': return new Date(j, 7, 15)
    case 'JG': return plus(nterWochentag(j, 8, 0, 1), 4) // Donnerstag nach dem 1. Sonntag im September
    case 'BM': return plus(nterWochentag(j, 8, 0, 3), 1) // Montag nach dem 3. Sonntag im September
    case 'BK': return new Date(j, 8, 25); case 'AH': return new Date(j, 10, 1); case 'ME': return new Date(j, 11, 8)
    case 'WE': return new Date(j, 11, 25); case 'ST': return new Date(j, 11, 26); case 'RE': return new Date(j, 11, 31)
  }
  return null
}

/** { 'YYYY-MM-DD': 'Name' } für Kanton und Jahr */
const cache = {}
export function feiertage(kanton, jahr) {
  const k = `${kanton}-${jahr}`
  if (cache[k]) return cache[k]
  const out = {}
  for (const code of (LISTE[kanton] || '').split(' ').filter(Boolean)) {
    const d = datum(code, jahr)
    if (d) out[isoDatum(d)] = NAMEN[code]
  }
  return (cache[k] = out)
}

/** Name des Feiertags an diesem Datum (YYYY-MM-DD) im Kanton oder null */
export function feiertagAm(kanton, iso) {
  if (!kanton || !iso) return null
  return feiertage(kanton, +iso.slice(0, 4))[iso] || null
}
