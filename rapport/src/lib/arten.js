import { Palmtree, Thermometer, Ambulance, PartyPopper, Shield, Stethoscope, CalendarCheck, CalendarX, RotateCcw, CloudRain, Ban, Baby, Utensils, Car, BedDouble, Receipt } from 'lucide-react'

/**
 * Abwesenheiten. bezahlt = Stunden werden standardmässig mit dem Tagessoll angerechnet.
 * zeugnis = Arztzeugnis/Bestätigung ist üblich und wird abgefragt.
 */
export const ABSENZEN = [
  { id: 'ferien', label: 'Ferien', icon: Palmtree, farbe: 'sky', bezahlt: true },
  { id: 'krank', label: 'Krank', icon: Thermometer, farbe: 'rose', bezahlt: true, zeugnis: true },
  { id: 'unfall', label: 'Unfall', icon: Ambulance, farbe: 'rose', bezahlt: true, zeugnis: true },
  { id: 'feiertag', label: 'Feiertag', icon: PartyPopper, farbe: 'violet', bezahlt: true },
  { id: 'arzt', label: 'Arzt / Zahnarzt', icon: Stethoscope, farbe: 'rose', bezahlt: true, zeugnis: true },
  { id: 'militaer', label: 'Militär / Zivildienst', icon: Shield, farbe: 'emerald', bezahlt: true, zeugnis: true },
  { id: 'bezahlt', label: 'Bezahlte Absenz', hinweis: 'Umzug, Hochzeit, Todesfall, Behörde …', icon: CalendarCheck, farbe: 'emerald', bezahlt: true },
  { id: 'eltern', label: 'Mutter- / Vaterschaft', icon: Baby, farbe: 'violet', bezahlt: true, zeugnis: true },
  { id: 'kompensation', label: 'Überzeit kompensiert', icon: RotateCcw, farbe: 'amber', bezahlt: false },
  { id: 'schlechtwetter', label: 'Schlechtwetter', icon: CloudRain, farbe: 'sky', bezahlt: false },
  { id: 'unbezahlt', label: 'Unbezahlter Urlaub', icon: CalendarX, farbe: 'stone', bezahlt: false },
  { id: 'kein_einsatz', label: 'Kein Einsatz', hinweis: 'Betrieb hat keine Arbeit', icon: Ban, farbe: 'stone', bezahlt: false },
]
export const absenzArt = (id) => ABSENZEN.find((a) => a.id === id) || ABSENZEN[0]

// Tailwind-Klassen pro Farbe (ausgeschrieben, damit Tailwind sie findet)
export const FARBE = {
  sky: 'bg-sky-400/15 border-sky-400/30 text-sky-300',
  rose: 'bg-rose-400/15 border-rose-400/30 text-rose-300',
  violet: 'bg-violet-400/15 border-violet-400/30 text-violet-300',
  emerald: 'bg-emerald-400/15 border-emerald-400/30 text-emerald-300',
  amber: 'bg-amber-400/15 border-amber-400/30 text-amber-300',
  stone: 'bg-white/10 border-white/20 text-white/70',
}

export const SPESEN = [
  { id: 'verpflegung', label: 'Verpflegung', icon: Utensils },
  { id: 'fahrt', label: 'Fahrt / km', icon: Car },
  { id: 'uebernachtung', label: 'Übernachtung', icon: BedDouble },
  { id: 'sonstiges', label: 'Sonstiges', icon: Receipt },
]
export const spesenArt = (id) => SPESEN.find((a) => a.id === id) || SPESEN[3]
