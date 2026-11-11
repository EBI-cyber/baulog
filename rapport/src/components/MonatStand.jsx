import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Gauge, Clock, TrendingUp, TrendingDown, Banknote, CalendarOff, Wallet, AlertTriangle, CheckCircle2, ChevronRight, CalendarClock } from 'lucide-react'
import { db } from '../lib/db'
import { zahl } from '../lib/settings'
import { feiertagAm } from '../lib/feiertage'
import { absenzArt } from '../lib/arten'
import { chf } from '../lib/lohn'
import { useLohn } from '../lib/useLohn'
import { tageBisEnde, einsatzEnde } from '../lib/einsatzende'
import { isoDatum, arbeitMs, datumKurz, TAGE } from '../lib/zeit'

const dez = (h) => (Math.round(h * 100) / 100).toFixed(2)
const plusMinus = (h) => (h >= 0 ? '+' : '−') + dez(Math.abs(h))
const tagIso = (d) => isoDatum(d)

/**
 * „Wo stehe ich?“ — Monats-Stand unter dem Kalender: Ist-Stunden, Soll bis heute → Über-/Minusstunden,
 * Lohn bisher (+ Hochrechnung), Abwesenheiten, Spesen, Wochen mit Rapport-Status und Hinweise.
 * Soll = Werktage (Mo–Fr) ab Einsatzbeginn bis heute, ohne Feiertage und unbezahlte Abwesenheiten, × Wochenstunden / 5.
 */
export default function MonatStand({ jahr, mon, wochen, schichten, absenzen, spesen, einsaetze, status, kanton, einst, monatsName }) {
  const heute = new Date()
  const heuteIso = tagIso(heute)
  const mVon = tagIso(new Date(jahr, mon, 1)), mBis = tagIso(new Date(jahr, mon + 1, 0))
  const laufend = heuteIso >= mVon && heuteIso <= mBis
  const zukunft = mVon > heuteIso
  const bis = laufend ? heuteIso : mBis
  const erster = useLiveQuery(() => db.schichten.orderBy('start').first(), [], null)
  const lohn = useLohn(mVon, zukunft ? mVon : bis, einst)
  if (zukunft) return null

  const imMonat = (d) => d >= mVon && d <= bis
  const sch = schichten.filter((s) => imMonat(s.datum))
  const abw = absenzen.filter((a) => imMonat(a.datum))
  const sp = spesen.filter((x) => imMonat(x.datum))
  const jetzt = Date.now()
  const arbeit = sch.reduce((s, x) => s + arbeitMs(x, jetzt), 0) / 36e5
  const tage = new Set(sch.map((s) => s.datum)).size
  const abwBezahlt = abw.reduce((s, a) => s + zahl(a.stunden), 0)
  const abwNachArt = {}
  for (const a of abw) { const k = absenzArt(a.art).kurz || absenzArt(a.art).label; abwNachArt[k] = (abwNachArt[k] || 0) + (a.halbtag ? 0.5 : 1) }

  // Soll bis heute
  const firma = sch[sch.length - 1]?.firma || einst.firma
  const einsatz = einsaetze.find((e) => e.firma === firma)
  const wochenStd = zahl(einsatz?.wochenstunden) || zahl(einst.wochenSoll)
  const sollAngenommen = !wochenStd
  const tagSoll = (wochenStd || 40) / 5
  const start = [mVon, einsatz?.beginn, erster?.datum].filter(Boolean).sort().pop()
  const hatEintrag = (d) => sch.some((s) => s.datum === d && s.ende != null) || abw.some((a) => a.datum === d)
  let sollTage = 0
  const luecken = []
  for (const d = new Date(start + 'T12:00'), e = new Date(bis + 'T12:00'); d <= e; d.setDate(d.getDate() + 1)) {
    const iso = tagIso(d)
    if (d.getDay() === 0 || d.getDay() === 6 || feiertagAm(kanton, iso)) continue
    if (iso === heuteIso && !hatEintrag(iso)) continue // heute zählt erst, wenn etwas eingetragen ist
    const tagAbw = abw.filter((a) => a.datum === iso)
    const frei = tagAbw.find((a) => !absenzArt(a.art).bezahlt && a.art !== 'kompensation')
    if (frei) { sollTage += frei.halbtag ? 0.5 : 0; continue }
    sollTage += 1
    if (iso < heuteIso && !hatEintrag(iso)) luecken.push(new Date(d))
  }
  const soll = sollTage * tagSoll
  const ist = arbeit + abwBezahlt
  const saldo = ist - soll

  // Wochen des Monats mit Rapport-Status
  const wochenListe = wochen.map(({ w, key, tage: wt }) => {
    // nur Tage dieses Monats (Wochen am Monatsrand zählen anteilig) → Summe passt zum Monat
    const ws = schichten.filter((s) => s.wocheKey === key && s.datum >= mVon && s.datum <= mBis)
    const wa = absenzen.filter((a) => a.wocheKey === key && a.datum >= mVon && a.datum <= mBis)
    const h = ws.reduce((s, x) => s + arbeitMs(x, jetzt), 0) / 36e5 + wa.reduce((s, a) => s + zahl(a.stunden), 0)
    const firmen = [...new Set(ws.filter((s) => s.ende != null).map((s) => s.firma))]
    const gesendet = firmen.length > 0 && firmen.every((f) => status.some((x) => (x.key === `${key}|${f}` || x.key === key) && x.gesendetAm))
    const vorbei = tagIso(wt[6]) < heuteIso
    const teil = tagIso(wt[0]) < mVon || tagIso(wt[6]) > mBis
    return { w, key, h, teil, gesendet, offen: vorbei && h > 0 && !gesendet, leer: h === 0 && !wa.length }
  }).filter((x) => !x.leer)
  const offen = wochenListe.filter((x) => x.offen)

  // Lohn
  const lohnOk = lohn && !lohn.fehlendeLoehne?.length && lohn.brutto > 0
  // Hochrechnung: restliche Werktage (ohne Feiertage) mit vollem Tagessoll zum bisherigen Netto pro Stunde
  let restTage = 0
  if (laufend) for (const d = new Date(heuteIso + 'T12:00'), e = new Date(mBis + 'T12:00'); d <= e; d.setDate(d.getDate() + 1)) {
    const iso = tagIso(d)
    if (d.getDay() % 6 && !feiertagAm(kanton, iso) && !(iso === heuteIso && hatEintrag(iso))) restTage++
  }
  const hochNetto = lohnOk && ist > 0 ? lohn.netto + (lohn.netto / ist) * restTage * tagSoll : 0
  const ende = einsatz ? tageBisEnde(einsatz) : null

  const Kachel = ({ icon: I, titel, children, farbe = '' }) => (
    <div className={'glass rounded-3xl p-4 ' + farbe}>
      <div className="text-white/45 text-xs inline-flex items-center gap-1.5"><I className="w-3.5 h-3.5" /> {titel}</div>
      {children}
    </div>
  )

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Gauge className="w-4 h-4 text-white/50" />
        <h2 className="font-bold">Stand {monatsName}</h2>
        <span className="text-xs text-white/40">{laufend ? `bis heute, ${datumKurz(heute)}` : 'ganzer Monat'}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Kachel icon={Clock} titel="Gearbeitet">
          <div className="text-2xl font-extrabold grad-text tabular-nums">{dez(arbeit)} h</div>
          <div className="text-xs text-white/45">an {tage} {tage === 1 ? 'Tag' : 'Tagen'}{abwBezahlt > 0 ? ` · + ${dez(abwBezahlt)} h bez. Abwesenheit` : ''}</div>
        </Kachel>
        <Kachel icon={saldo >= 0 ? TrendingUp : TrendingDown} titel={saldo >= 0 ? 'Überstunden' : 'Minusstunden'}>
          <div className={'text-2xl font-extrabold tabular-nums ' + (saldo >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{plusMinus(saldo)} h</div>
          <div className="text-xs text-white/45">Soll {dez(soll)} h ({sollTage} Tage à {dez(tagSoll)}){sollAngenommen ? ' · 40 h/Woche angenommen' : ''}</div>
        </Kachel>
        <Link to="/lohn" className="glass rounded-3xl p-4 col-span-2 card-hover block">
          <div className="text-white/45 text-xs inline-flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> Lohn {laufend ? 'bisher' : 'im Monat'} (geschätzt)</div>
          {lohnOk ? (
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl font-extrabold tabular-nums">{chf(lohn.netto, einst.waehrung)} <span className="text-xs font-normal text-white/40">netto</span></div>
                <div className="text-xs text-white/45">brutto {chf(lohn.brutto, einst.waehrung)}{lohn.spesen > 0 ? ` · + Spesen ${chf(lohn.spesen, einst.waehrung)}` : ''}</div>
              </div>
              {laufend && restTage > 0 && hochNetto > 0 && <div className="text-right">
                <div className="text-xs text-white/40">Monatsende ({restTage} Tage voll)</div>
                <div className="font-bold tabular-nums">≈ {chf(hochNetto, einst.waehrung)}</div>
              </div>}
            </div>
          ) : (
            <div className="text-sm text-amber-300 mt-1">{lohn?.fehlendeLoehne?.length ? `Stundenlohn fehlt — Einsatzvertrag von ${lohn.fehlendeLoehne[0]} in den Einstellungen erfassen (Foto genügt).` : 'Noch kein Lohn in diesem Monat.'}</div>
          )}
        </Link>
        <Kachel icon={CalendarOff} titel="Abwesend">
          {Object.keys(abwNachArt).length
            ? <div className="text-sm font-semibold mt-0.5">{Object.entries(abwNachArt).map(([k, n]) => `${n} ${n === 1 ? 'Tag' : 'Tage'} ${k}`).join(' · ')}</div>
            : <div className="text-lg font-bold">–</div>}
          {abwBezahlt > 0 && <div className="text-xs text-white/45">{dez(abwBezahlt)} h angerechnet</div>}
        </Kachel>
        <Kachel icon={Wallet} titel="Spesen">
          <div className="text-lg font-bold tabular-nums">{sp.length ? chf(sp.reduce((s, x) => s + zahl(x.betrag), 0), einst.waehrung) : '–'}</div>
        </Kachel>
      </div>

      {(luecken.length > 0 || offen.length > 0 || (ende != null && ende >= 0 && ende <= 7)) && (
        <div className="space-y-2">
          {luecken.length > 0 && <div className="text-sm rounded-2xl px-4 py-3 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>Ohne Eintrag: {luecken.map((d) => `${TAGE[d.getDay()]} ${datumKurz(d)}`).join(', ')} — Arbeitszeit oder Abwesenheit eintragen (zählt sonst als Minusstunden).</div>
          </div>}
          {offen.length > 0 && <div className="text-sm rounded-2xl px-4 py-3 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>Rapport noch nicht gesendet: {offen.map((x) => `KW ${x.w.kw}`).join(', ')}</div>
          </div>}
          {ende != null && ende >= 0 && ende <= 7 && <div className="text-sm rounded-2xl px-4 py-3 bg-sky-400/10 border border-sky-400/30 text-sky-300 flex gap-2">
            <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
            <div>Einsatz bei {einsatz.firma} endet {ende === 0 ? 'heute' : `in ${ende} ${ende === 1 ? 'Tag' : 'Tagen'}`} ({einsatzEnde(einsatz).split('-').reverse().join('.')}).</div>
          </div>}
        </div>
      )}

      {wochenListe.length > 0 && (
        <div className="glass rounded-3xl divide-y divide-white/5">
          {wochenListe.map((x) => (
            <Link key={x.key} to={`/woche/${x.key}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-bold w-14">KW {x.w.kw}</span>
              <span className="flex-1 tabular-nums">{dez(x.h)} h{x.teil && <span className="text-xs text-white/35"> (nur {monatsName})</span>}</span>
              <span className={'text-xs inline-flex items-center gap-1 ' + (x.gesendet ? 'text-mint' : x.offen ? 'text-amber-300' : 'text-white/40')}>
                {x.gesendet ? <><CheckCircle2 className="w-3.5 h-3.5" /> gesendet</> : x.offen ? 'offen' : 'läuft'}
              </span>
              <ChevronRight className="w-4 h-4 text-white/25" />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
