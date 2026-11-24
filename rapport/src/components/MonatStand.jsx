import { angerechnet } from '../lib/arten'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Gauge, Clock, TrendingUp, TrendingDown, Banknote, CalendarOff, Wallet, AlertTriangle, CheckCircle2, ChevronRight, CalendarClock, PiggyBank, FileCheck2, XCircle, Camera } from 'lucide-react'
import { db } from '../lib/db'
import { zahl } from '../lib/settings'
import { feiertagAm } from '../lib/feiertage'
import { sollIst, stundenkonto } from '../lib/soll'
import { gavFuer } from '../lib/gav'
import { chf } from '../lib/lohn'
import { useLohn } from '../lib/useLohn'
import LohnDetailSheet from './LohnDetailSheet'
import { useState } from 'react'
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
  const [detail, setDetail] = useState(null)
  const erster = useLiveQuery(() => db.schichten.orderBy('start').first(), [], null)
  const lohn = useLohn(mVon, zukunft ? mVon : bis, einst)
  if (zukunft) return null

  const sp = spesen.filter((x) => x.datum >= mVon && x.datum <= bis)
  const r = sollIst({ von: mVon, bis, schichten, absenzen, einsaetze, einst, kanton, ersterTag: erster?.datum })
  const konto = stundenkonto({ jahr, bis, schichten, absenzen, einsaetze, einst, kanton })
  const { arbeit, tage, abwBezahlt, soll, sollTage, tagSoll, sollAngenommen, ist, saldo, luecken, einsatz, hatEintrag } = r
  const abwNachArt = r.nachArt
  const jetzt = Date.now()

  // Wochen des Monats mit Rapport-Status
  const wochenListe = wochen.map(({ w, key, tage: wt }) => {
    // nur Tage dieses Monats (Wochen am Monatsrand zählen anteilig) → Summe passt zum Monat
    const ws = schichten.filter((s) => s.wocheKey === key && s.datum >= mVon && s.datum <= mBis)
    const wa = absenzen.filter((a) => a.wocheKey === key && a.datum >= mVon && a.datum <= mBis)
    const h = ws.reduce((s, x) => s + arbeitMs(x, jetzt), 0) / 36e5 + wa.reduce((s, a) => s + angerechnet(a), 0)
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

  const Kachel = ({ icon: I, titel, children, farbe = '', onClick }) => (
    <button onClick={onClick} className={'glass rounded-3xl p-4 text-left card-hover ' + farbe}>
      <div className="text-white/65 text-xs inline-flex items-center gap-1.5"><I className="w-3.5 h-3.5" /> {titel}</div>
      {children}
    </button>
  )
  const fmtH = (n) => `${dez(n)} h`
  const zeigArbeit = () => setDetail({
    titel: 'Gearbeitet ' + monatsName, betrag: arbeit, fmt: fmtH,
    was: `Deine Arbeitszeit ohne Pausen an ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}${laufend ? ' bis heute' : ''}. Bezahlte Abwesenheiten (Ferien, krank …) zählen separat.`,
    rechnung: [...wochenListe.map((x) => [`KW ${x.w.kw}${x.teil ? ' (nur Tage im ' + monatsName + ')' : ''}`, x.h]), ['Total inkl. Abwesenheiten', ist, true],
      ...(abwBezahlt > 0 ? [['davon bezahlte Abwesenheiten', abwBezahlt]] : []), ...Object.entries(abwNachArt || {}).map(([a, n]) => [`${a}: ${n} ${n === 1 ? 'Tag' : 'Tage'}`])],
    grundlage: 'Summe deiner erfassten Schichten (Kalender antippen → Tag → Einträge).',
  })
  const zeigSaldo = () => setDetail({
    titel: 'Überstunden ' + monatsName, betrag: r.ueber, fmt: (n) => `${dez(n)} h`,
    was: `Als Temporärer bekommst du jede gearbeitete Stunde bezahlt — Minusstunden gibt es nicht. Die ${dez(r.wochenStd)} h pro Woche laut Einsatzvertrag legen nur fest, ab wann eine Stunde als Überstunde zählt.`,
    rechnung: [...r.ueberWochen.map((w) => [`Woche ${w.von.slice(8)}.${w.von.slice(5, 7)}.: ${dez(w.ist)} h − ${dez(w.grenze)} h`, w.ueber]), ['Überstunden total', r.ueber, true],
      [`Konto ${jahr}: aufgebaut seit 1. Januar`, konto.aufgebaut], ['− mit Freizeit kompensiert', -konto.kompensiert], [`= Guthaben ${jahr}`, konto.saldo, true]],
    grundlage: 'Pro Kalenderwoche: Arbeitszeit + bezahlte Abwesenheiten (Ferien, Krankheit … höchstens mit dem Tagessoll) über den Wochenstunden des Einsatzes. Eine Woche zählt zum Monat ihres Donnerstags. Zuschlag laut Vertrag (OR 321c: 25 %, sofern nichts anderes vereinbart).',
    hinweis: gavFuer(einsatz) ? `${gavFuer(einsatz).name}: Überstunden innert eines Jahres mit Freizeit gleicher Dauer kompensieren (Abwesenheit „Überzeit kompensiert“ eintragen), sonst Auszahlung ohne Zuschlag. Zuschlag 25 % nur für angeordnete Überzeit über 45 h pro Woche.`
      : einsatz?.ueberstundenModus === 'keine' ? 'Dein Vertrag rechnet mit durchschnittlicher Arbeitszeit — dafür zahlt das Büro keinen automatischen Überstundenzuschlag pro Woche.' : '',
  })

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Gauge className="w-4 h-4 text-white/65" />
        <h2 className="font-bold">Stand {monatsName}</h2>
        <span className="text-xs text-white/60">{laufend ? `bis heute, ${datumKurz(heute)}` : 'ganzer Monat'}</span>
      </div>
      {(luecken.length > 0 || offen.length > 0 || (ende != null && ende >= 0 && ende <= 7)) && (
        <div className="space-y-2">
          {luecken.length > 0 && <div className="text-sm rounded-2xl px-4 py-3 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>Ohne Eintrag: {luecken.map((d) => `${TAGE[d.getDay()]} ${datumKurz(d)}`).join(', ')} — Arbeitszeit oder Abwesenheit eintragen, damit der Rapport vollständig ist.</div>
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


      <div className="grid grid-cols-2 gap-3">
        <Kachel icon={Clock} titel="Gearbeitet" onClick={zeigArbeit}>
          <div className="text-2xl font-extrabold grad-text tabular-nums">{dez(arbeit)} h</div>
          <div className="text-xs text-white/65">an {tage} {tage === 1 ? 'Tag' : 'Tagen'}{abwBezahlt > 0 ? ` · + ${dez(abwBezahlt)} h bez. Abwesenheit` : ''}</div>
        </Kachel>
        <Kachel icon={TrendingUp} titel="Überstunden" onClick={zeigSaldo}>
          <div className={'text-2xl font-extrabold tabular-nums ' + (r.ueber > 0.004 ? 'text-emerald-400' : 'text-white/70')}>{r.ueber > 0.004 ? '+' + dez(r.ueber) : '0.00'} h</div>
          <div className="text-xs text-white/65">über {dez(r.wochenStd)} h/Woche · Konto {jahr}: {dez(konto.saldo)} h</div>
        </Kachel>
        <Link to="/lohn" className="glass rounded-3xl p-4 col-span-2 card-hover block">
          <div className="text-white/65 text-xs inline-flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> Lohn {laufend ? 'bisher' : 'im Monat'} (geschätzt)</div>
          {lohnOk ? (
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl font-extrabold tabular-nums">{chf(lohn.netto, einst.waehrung)} <span className="text-xs font-normal text-white/60">netto</span></div>
                <div className="text-xs text-white/65">brutto {chf(lohn.brutto, einst.waehrung)}{lohn.spesen > 0 ? ` · + Spesen ${chf(lohn.spesen, einst.waehrung)}` : ''}</div>
              </div>
              {laufend && restTage > 0 && hochNetto > 0 && <div className="text-right">
                <div className="text-xs text-white/60">Monatsende ({restTage} Tage voll)</div>
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
          {abwBezahlt > 0 && <div className="text-xs text-white/65">{dez(abwBezahlt)} h angerechnet</div>}
        </Kachel>
        <Kachel icon={Wallet} titel="Spesen">
          <div className="text-lg font-bold tabular-nums">{sp.length ? chf(sp.reduce((s, x) => s + zahl(x.betrag), 0), einst.waehrung) : '–'}</div>
        </Kachel>
      </div>


      {wochenListe.length > 0 && (
        <div className="glass rounded-3xl divide-y divide-white/5">
          {wochenListe.map((x) => (
            <Link key={x.key} to={`/woche/${x.key}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-bold w-14">KW {x.w.kw}</span>
              <span className="flex-1 tabular-nums">{dez(x.h)} h{x.teil && <span className="text-xs text-white/55"> (nur {monatsName})</span>}</span>
              <span className={'text-xs inline-flex items-center gap-1 ' + (x.gesendet ? 'text-mint' : x.offen ? 'text-amber-300' : 'text-white/60')}>
                {x.gesendet ? <><CheckCircle2 className="w-3.5 h-3.5" /> gesendet</> : x.offen ? 'offen' : 'läuft'}
              </span>
              <ChevronRight className="w-4 h-4 text-white/45" />
            </Link>
          ))}
        </div>
      )}
      <LohnDetailSheet d={detail} w={einst.waehrung} onClose={() => setDetail(null)} />
    </section>
  )
}
