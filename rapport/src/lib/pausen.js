import { ladeEinstellungen } from './settings'

/**
 * Pausen nach festem Tagesablauf (Baustelle/Werk in der Schweiz): Znüni 09:00–09:15, Mittag ab 12:00 (Dauer wählbar).
 * Statt „x Minuten Pause“ werden echte Pausenzeiten gespeichert — der Kalkulator sieht, wie die Stunden zustande kommen.
 * Plan (global in den Einstellungen, zuletzt gewählte Mittagsdauer wird gemerkt): { znueniVon, znueniMin, mittagVon, mittagMin }
 */
export const PLAN_STANDARD = { znueniVon: '09:00', znueniMin: 15, mittagVon: '12:00', mittagMin: 30 }
export const MITTAG_DAUERN = [0, 15, 30, 45, 60, 90]

export const plan = () => ({ ...PLAN_STANDARD, ...(ladeEinstellungen().pausenPlan || {}) })

const zeit = (datum, hhmm) => new Date(`${datum}T${hhmm}`).getTime()

/** Auswahl { znueni: bool, mittag: Minuten, mittagVon: 'HH:MM' } → Pausen [{ start, ende, art }] innerhalb der Schicht */
export function pausenAusWahl(datum, start, ende, w, p = plan()) {
  const out = []
  if (w.znueni && p.znueniMin > 0) { const s = zeit(datum, p.znueniVon); out.push({ start: s, ende: s + p.znueniMin * 6e4, art: 'znueni' }) }
  if (w.mittag > 0) { const s = zeit(datum, w.mittagVon || p.mittagVon); out.push({ start: s, ende: s + w.mittag * 6e4, art: 'mittag' }) }
  return out.filter((x) => x.start >= start && (ende == null || x.ende <= ende))
}

/** Vorschlag für eine Schicht: Znüni, wenn die Schicht über die Znünizeit geht; Mittag mit der gewohnten Dauer */
export function standardWahl(datum, start, ende, p = plan()) {
  const zS = zeit(datum, p.znueniVon), mS = zeit(datum, p.mittagVon)
  return {
    znueni: start <= zS && (ende == null || ende >= zS + p.znueniMin * 6e4),
    mittag: start <= mS && (ende == null || ende >= mS + p.mittagMin * 6e4) ? p.mittagMin : 0,
    mittagVon: p.mittagVon,
  }
}

/** Auswahl aus gespeicherten Pausen lesen (Znüni = Pause nahe der Znünizeit, Mittag = übrige Pause ab ~11 Uhr) */
export function wahlAusPausen(datum, pausen = [], p = plan()) {
  const fertig = pausen.filter((x) => x.ende)
  const zS = zeit(datum, p.znueniVon)
  const z = fertig.find((x) => x.art === 'znueni' || Math.abs(x.start - zS) <= 30 * 6e4)
  const m = fertig.find((x) => x !== z && (x.art === 'mittag' || new Date(x.start).getHours() >= 11))
  const hhmm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  return { znueni: !!z, mittag: m ? Math.round((m.ende - m.start) / 6e4) : 0, mittagVon: m ? hhmm(m.start) : p.mittagVon }
}

/** Sind das genau Plan-Pausen (oder keine)? Sonst sind es gestempelte Pausen mit eigenen Zeiten. */
export const nurPlan = (pausen = []) => pausen.every((x) => x.art === 'znueni' || x.art === 'mittag')
