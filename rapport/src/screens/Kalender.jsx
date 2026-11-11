import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, CalendarOff, Wallet, CalendarRange, PartyPopper } from 'lucide-react'
import { db } from '../lib/db'
import { useEinstellungen, zahl } from '../lib/settings'
import { feiertagAm } from '../lib/feiertage'
import { kantonFuer } from '../lib/kanton'
import { absenzArt, FARBE } from '../lib/arten'
import { std } from '../lib/woche'
import { isoWoche, wochenKey, wochenTage, isoDatum, TAGE_LANG, datumLang, arbeitMs } from '../lib/zeit'
import Sheet from '../components/Sheet'
import Erfassen from '../components/Erfassen'
import SchichtZeile from '../components/SchichtZeile'
import { AbsenzZeile, SpesenZeile } from '../components/Zeilen'

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const p2 = (n) => String(n).padStart(2, '0')
const monatKey = (j, m) => `${j}-${p2(m + 1)}`
const dez = (h) => (h ? (Math.round(h * 100) / 100).toFixed(2).replace(/\.?0+$/, '') : '')

/** Monatskalender mit KW-Spalte: Tag antippen = Details & bearbeiten, KW antippen = Wochenrapport */
export default function Kalender() {
  const { monat } = useParams()
  const nav = useNavigate()
  const [einst] = useEinstellungen()
  const heute = new Date()
  const m = /^(\d{4})-(\d{2})$/.exec(monat || '')
  const jahr = m ? +m[1] : heute.getFullYear()
  const mon = m ? +m[2] - 1 : heute.getMonth()
  const [tag, setTag] = useState(null) // ISO-Datum des geöffneten Tages
  const [erfassen, setErfassen] = useState(null)
  useEffect(() => { setTag(null); setErfassen(null) }, [monat])

  // Wochen (Mo–So), die den Monat berühren
  const wochen = useMemo(() => {
    const liste = []
    let w = isoWoche(new Date(jahr, mon, 1))
    for (let i = 0; i < 6; i++) {
      const tage = wochenTage(w)
      if (tage[0].getMonth() !== mon && tage[0] > new Date(jahr, mon, 1)) break
      liste.push({ w, key: wochenKey(w), tage })
      w = isoWoche(new Date(tage[6].getFullYear(), tage[6].getMonth(), tage[6].getDate() + 1))
    }
    return liste
  }, [jahr, mon])
  const von = isoDatum(wochen[0].tage[0])
  const bis = isoDatum(wochen[wochen.length - 1].tage[6])

  const schichten = useLiveQuery(() => db.schichten.where('datum').between(von, bis, true, true).toArray(), [von, bis], [])
  const absenzen = useLiveQuery(() => db.absenzen.where('datum').between(von, bis, true, true).toArray(), [von, bis], [])
  const spesen = useLiveQuery(() => db.spesen.where('datum').between(von, bis, true, true).toArray(), [von, bis], [])
  const einsaetze = useLiveQuery(() => db.einsaetze.toArray(), [], [])
  const status = useLiveQuery(() => db.wochen.toArray(), [], [])
  const kanton = kantonFuer([...new Set(schichten.map((s) => s.firma))], einsaetze, einst)

  const jetzt = Date.now()
  const proTag = (d) => {
    const sch = schichten.filter((s) => s.datum === d).sort((a, b) => a.start - b.start)
    const abw = absenzen.filter((a) => a.datum === d)
    const sp = spesen.filter((x) => x.datum === d)
    const arbeit = sch.reduce((s, x) => s + arbeitMs(x, jetzt), 0) / 36e5
    const abwStd = abw.reduce((s, a) => s + zahl(a.stunden), 0)
    return { sch, abw, sp, arbeit, abwStd, laeuft: sch.some((x) => x.ende == null), feiertag: feiertagAm(kanton, d) }
  }
  const wocheGesendet = (key) => {
    const firmen = [...new Set(schichten.filter((s) => s.wocheKey === key && s.ende != null).map((s) => s.firma))]
    if (!firmen.length) return false
    return firmen.every((f) => status.some((x) => (x.key === `${key}|${f}` || x.key === key) && x.gesendetAm))
  }

  // Monatssumme (nur Tage dieses Monats)
  const imMonat = (d) => d.startsWith(monatKey(jahr, mon))
  const summe = {
    arbeit: schichten.filter((s) => imMonat(s.datum)).reduce((s, x) => s + arbeitMs(x, jetzt), 0) / 36e5,
    abw: absenzen.filter((a) => imMonat(a.datum)).reduce((s, a) => s + zahl(a.stunden), 0),
    tage: new Set(schichten.filter((s) => imMonat(s.datum)).map((s) => s.datum)).size,
  }

  const versetzen = (delta) => {
    const d = new Date(jahr, mon + delta, 1)
    nav(`/kalender/${monatKey(d.getFullYear(), d.getMonth())}`)
  }
  const heuteIso = isoDatum(heute)
  const diesenMonat = jahr === heute.getFullYear() && mon === heute.getMonth()

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <button onClick={() => versetzen(-1)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" aria-label="Vorheriger Monat">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center min-w-0">
          <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">{MONATE[mon]}</h1>
          <div className="text-sm text-white/50">
            {jahr} · KW {wochen[0].w.kw}–{wochen[wochen.length - 1].w.kw}
            {!diesenMonat && <> · <button onClick={() => nav('/kalender')} className="underline underline-offset-2 text-white/70">heute</button></>}
          </div>
        </div>
        <button onClick={() => versetzen(1)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" aria-label="Nächster Monat">
          <ChevronRight className="w-5 h-5" />
        </button>
      </header>

      <section className="glass rounded-3xl p-2 sm:p-3">
        <div className="grid grid-cols-[2.6rem_repeat(7,minmax(0,1fr))] gap-1 text-[11px] text-white/40 text-center pb-1">
          <div>KW</div>{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((t) => <div key={t}>{t}</div>)}
        </div>
        <div className="space-y-1">
          {wochen.map(({ w, key, tage }) => {
            const wSumme = tage.reduce((s, t) => { const x = proTag(isoDatum(t)); return s + x.arbeit + x.abwStd }, 0)
            const gesendet = wocheGesendet(key)
            return (
              <div key={key} className="grid grid-cols-[2.6rem_repeat(7,minmax(0,1fr))] gap-1">
                <button onClick={() => nav(`/woche/${key}`)} aria-label={`KW ${w.kw} öffnen`}
                  className="rounded-xl bg-white/[0.06] flex flex-col items-center justify-center py-1 active:scale-95">
                  <span className="text-sm font-bold">{w.kw}</span>
                  {wSumme > 0 && <span className="text-[10px] text-white/50 tabular-nums">{dez(wSumme)}</span>}
                  {gesendet && <CheckCircle2 className="w-3 h-3 text-mint" />}
                </button>
                {tage.map((t) => {
                  const d = isoDatum(t)
                  const x = proTag(d)
                  const fremd = t.getMonth() !== mon
                  const abw = x.abw[0] && absenzArt(x.abw[0].art)
                  const farbe = abw ? FARBE[abw.farbe] : x.arbeit > 0 ? 'bg-white/[0.07] border-white/10' : 'border-transparent'
                  return (
                    <button key={d} onClick={() => setTag(d)} aria-label={`${TAGE_LANG[t.getDay()]} ${datumLang(t)}`}
                      className={'relative rounded-xl border min-h-[3.4rem] px-0.5 py-1 flex flex-col items-center justify-start gap-0.5 active:scale-95 '
                        + farbe + (fremd ? ' opacity-35' : '') + (d === heuteIso ? ' ring-2 ring-aqua/70' : '')}>
                      <span className={'text-sm leading-none ' + (d === heuteIso ? 'font-extrabold' : 'font-medium') + (t.getDay() === 0 || t.getDay() === 6 ? ' text-white/50' : '')}>{t.getDate()}</span>
                      {x.arbeit > 0 && <span className="text-[11px] font-semibold tabular-nums leading-none text-white/85">{dez(x.arbeit)}</span>}
                      {abw && <abw.icon className="w-3.5 h-3.5" strokeWidth={2} />}
                      {x.feiertag && !abw && <PartyPopper className="w-3 h-3 text-violet-300" strokeWidth={2} />}
                      <span className="absolute bottom-1 flex gap-0.5">
                        {x.laeuft && <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" />}
                        {x.sp.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/45 px-1">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-white/[0.12]" /> gearbeitet (Std.)</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-400/30" /> Ferien</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-400/30" /> krank/Unfall</span>
        <span className="inline-flex items-center gap-1"><PartyPopper className="w-3 h-3 text-violet-300" /> Feiertag</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-300" /> Spesen</span>
        <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-mint" /> Rapport gesendet</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-3xl p-3"><div className="text-white/40 text-xs">Gearbeitet</div><div className="text-lg font-bold tabular-nums">{std(summe.arbeit)} h</div></div>
        <div className="glass rounded-3xl p-3"><div className="text-white/40 text-xs">Arbeitstage</div><div className="text-lg font-bold tabular-nums">{summe.tage}</div></div>
        <div className="glass rounded-3xl p-3"><div className="text-white/40 text-xs">Abwesend</div><div className="text-lg font-bold tabular-nums">{std(summe.abw)} h</div></div>
      </div>

      {tag && <TagSheet datum={tag} x={proTag(tag)} waehrung={einst.waehrung}
        onClose={() => setTag(null)}
        onWoche={() => nav(`/woche/${wochenKey(isoWoche(new Date(tag + 'T12:00')))}`)}
        onErfassen={(w) => { setTag(null); setErfassen(w) }} />}
      <Erfassen wert={erfassen} setWert={setErfassen} />
    </div>
  )
}

function TagSheet({ datum, x, waehrung, onClose, onWoche, onErfassen }) {
  const t = new Date(datum + 'T12:00')
  const leer = !x.sch.length && !x.abw.length && !x.sp.length
  const knopf = 'rounded-2xl py-2.5 bg-white/[0.06] border border-white/10 text-sm inline-flex items-center justify-center gap-1.5'
  return (
    <Sheet titel={`${TAGE_LANG[t.getDay()]}, ${datumLang(t)}`} onClose={onClose}>
      <div className="text-sm text-white/50 -mt-1">
        KW {isoWoche(t).kw}{x.feiertag ? ` · ${x.feiertag}` : ''}
        {(x.arbeit > 0 || x.abwStd > 0) && <> · <b className="text-white">{std(x.arbeit + x.abwStd)} h</b></>}
      </div>
      {leer && <div className="text-sm text-white/45">Noch nichts eingetragen.</div>}
      {x.abw.map((a) => <AbsenzZeile key={'a' + a.id} a={a} onClick={() => onErfassen({ typ: 'absenz', objekt: a })} />)}
      {x.sch.map((s) => <SchichtZeile key={s.id} s={s} onClick={() => onErfassen({ typ: 'zeit', objekt: s })} />)}
      {x.sp.map((s) => <SpesenZeile key={'s' + s.id} s={s} waehrung={waehrung} onClick={() => onErfassen({ typ: 'spesen', objekt: s })} />)}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button onClick={() => onErfassen({ typ: 'zeit', datum })} className={knopf}><Clock className="w-4 h-4" /> Zeit</button>
        <button onClick={() => onErfassen({ typ: 'absenz', datum })} className={knopf}><CalendarOff className="w-4 h-4" /> Abwesend</button>
        <button onClick={() => onErfassen({ typ: 'spesen', datum })} className={knopf}><Wallet className="w-4 h-4" /> Spesen</button>
      </div>
      <button onClick={onWoche} className="w-full rounded-2xl py-3 font-semibold btn-grad inline-flex items-center justify-center gap-2">
        <CalendarRange className="w-4 h-4" /> Woche {isoWoche(t).kw} & Rapport
      </button>
    </Sheet>
  )
}

