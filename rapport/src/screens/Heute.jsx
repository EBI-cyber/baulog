import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Play, Pause, Square, Coffee, Plus, Send, Settings, Building2, Pencil } from 'lucide-react'
import { db, speichern, laufendeSchicht } from '../lib/db'
import { useEinstellungen, fertigEingerichtet } from '../lib/settings'
import { isoWoche, isoDatum, wochenKey, wocheVersetzt, TAGE_LANG, datumLang, uhr, pauseMs, arbeitMs, istPausiert, hms, hm } from '../lib/zeit'
import FirmaWahl from '../components/FirmaWahl'
import SchichtSheet from '../components/SchichtSheet'
import SchichtZeile from '../components/SchichtZeile'
import IconChip from '../ui/IconChip'

function useJetzt(aktiv) {
  const [jetzt, setJetzt] = useState(Date.now())
  useEffect(() => {
    if (!aktiv) return
    const t = setInterval(() => setJetzt(Date.now()), 1000)
    const sichtbar = () => setJetzt(Date.now())
    document.addEventListener('visibilitychange', sichtbar)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', sichtbar) }
  }, [aktiv])
  return jetzt
}

export default function Heute() {
  const [einst, setEinst] = useEinstellungen()
  const heute = new Date()
  const woche = isoWoche(heute)
  const laufend = useLiveQuery(laufendeSchicht, [], null)
  const heuteListe = useLiveQuery(() => db.schichten.where('datum').equals(isoDatum(heute)).sortBy('start'), [isoDatum(heute)], [])
  const vorwoche = wocheVersetzt(woche, -1)
  const offen = useLiveQuery(async () => {
    const key = wochenKey(vorwoche)
    const n = await db.schichten.where('wocheKey').equals(key).count()
    const w = await db.wochen.get(key)
    return n > 0 && !w?.gesendetAm ? key : null
  }, [wochenKey(vorwoche)], null)

  const jetzt = useJetzt(!!laufend)
  const pausiert = istPausiert(laufend)
  const [bearbeiten, setBearbeiten] = useState(null) // Schicht | 'neu'
  const [stoppFrage, setStoppFrage] = useState(false)
  const stoppTimer = useRef()

  const firma = einst.firma || einst.firmen[0] || ''

  async function start() {
    if (!firma) return
    await speichern({ start: Date.now(), ende: null, pausen: [], firma, notiz: '' })
  }
  async function pause() {
    await speichern({ ...laufend, pausen: [...(laufend.pausen || []), { start: Date.now(), ende: null }] })
  }
  async function weiter() {
    await speichern({ ...laufend, pausen: laufend.pausen.map((p) => (p.ende == null ? { ...p, ende: Date.now() } : p)) })
  }
  async function stopp() {
    if (!stoppFrage) {
      setStoppFrage(true)
      clearTimeout(stoppTimer.current)
      stoppTimer.current = setTimeout(() => setStoppFrage(false), 3500)
      return
    }
    setStoppFrage(false)
    const n = Date.now()
    await speichern({ ...laufend, ende: n, pausen: (laufend.pausen || []).map((p) => (p.ende == null ? { ...p, ende: n } : p)) })
  }

  const fertig = (heuteListe || []).filter((s) => s.ende != null)
  const summeHeute = (heuteListe || []).reduce((a, s) => a + arbeitMs(s, jetzt), 0)

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-white/45 text-sm">{TAGE_LANG[heute.getDay()]}, {datumLang(heute)}</div>
          <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">Heute</h1>
        </div>
        <Link to="/woche" className="shrink-0 glass rounded-2xl px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wider text-white/45">KW</div>
          <div className="text-xl font-extrabold leading-none tabular-nums">{woche.kw}</div>
        </Link>
      </header>

      {!fertigEingerichtet(einst) && (
        <Link to="/einstellungen" className="glass rounded-3xl p-4 flex items-center gap-3 card-hover">
          <IconChip icon={Settings} />
          <div className="min-w-0">
            <div className="font-semibold">Einmal einrichten</div>
            <div className="text-sm text-white/50">Name, Temporärbüro und Firma eintragen — steht später im Rapport.</div>
          </div>
        </Link>
      )}

      {offen && (
        <Link to={`/woche/${offen}`} className="rounded-3xl p-4 flex items-center gap-3 bg-aqua/10 border border-aqua/30">
          <IconChip icon={Send} variant="grad" />
          <div className="min-w-0">
            <div className="font-semibold">KW {+offen.slice(-2)} ist vorbei</div>
            <div className="text-sm text-white/60">Rapport jetzt sichern & ans Büro senden</div>
          </div>
        </Link>
      )}

      {/* Stempeluhr */}
      <section className="glass rounded-4xl p-6 text-center space-y-5">
        {!laufend ? (
          <>
            <div className="text-left space-y-2">
              <div className="text-xs text-white/50 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Einsatzbetrieb</div>
              <FirmaWahl firmen={einst.firmen} wert={firma} onWahl={(f) => setEinst({ firma: f })}
                onNeu={(n) => setEinst({ firmen: [...einst.firmen, n], firma: n })} />
            </div>
            <button onClick={start} disabled={!firma}
              className="mx-auto w-44 h-44 rounded-full btn-grad shadow-glow flex flex-col items-center justify-center gap-1 font-extrabold text-xl active:scale-95 transition disabled:opacity-40">
              <Play className="w-12 h-12" strokeWidth={2.2} fill="currentColor" />
              Start
            </button>
            {!firma && <div className="text-sm text-white/50">Zuerst eine Firma wählen oder hinzufügen.</div>}
          </>
        ) : (
          <>
            <button onClick={() => setBearbeiten(laufend)} className="inline-flex items-center gap-1.5 text-sm text-white/60">
              <Building2 className="w-4 h-4" /> {laufend.firma} · seit {uhr(laufend.start)} <Pencil className="w-3.5 h-3.5 text-white/35" />
            </button>
            <div>
              <div className={'text-6xl font-extrabold tabular-nums tracking-tight ' + (pausiert ? 'text-white/40' : 'grad-text')}>
                {hms(arbeitMs(laufend, jetzt))}
              </div>
              <div className="text-sm text-white/50 mt-1 inline-flex items-center gap-1.5">
                <Coffee className="w-4 h-4" /> Pause {hm(pauseMs(laufend, jetzt))}
                {pausiert && <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-400/15 text-amber-300 border border-amber-400/30">Pause läuft</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {pausiert ? (
                <button onClick={weiter} className="rounded-3xl py-5 font-bold text-lg btn-grad inline-flex items-center justify-center gap-2 active:scale-95 transition">
                  <Play className="w-6 h-6" fill="currentColor" /> Weiter
                </button>
              ) : (
                <button onClick={pause} className="rounded-3xl py-5 font-bold text-lg bg-white/10 inline-flex items-center justify-center gap-2 active:scale-95 transition">
                  <Pause className="w-6 h-6" fill="currentColor" /> Pause
                </button>
              )}
              <button onClick={stopp}
                className={'rounded-3xl py-5 font-bold text-lg inline-flex items-center justify-center gap-2 active:scale-95 transition ' +
                  (stoppFrage ? 'bg-ember text-white' : 'bg-ember/15 text-ember border border-ember/30')}>
                <Square className="w-5 h-5" fill="currentColor" /> {stoppFrage ? 'Sicher?' : 'Feierabend'}
              </button>
            </div>
            {stoppFrage && <div className="text-xs text-white/45 -mt-2">Nochmal tippen zum Beenden</div>}
          </>
        )}
      </section>

      {/* Heutige Einträge */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Heute erfasst</h2>
          <div className="text-sm text-white/60 tabular-nums">Total <span className="font-bold text-white">{hm(summeHeute)} h</span></div>
        </div>
        {fertig.map((s) => <SchichtZeile key={s.id} s={s} onClick={() => setBearbeiten(s)} />)}
        {!fertig.length && <div className="text-sm text-white/40">Noch nichts abgeschlossen.</div>}
        <button onClick={() => setBearbeiten('neu')} className="w-full rounded-2xl py-3 bg-white/[0.06] border border-dashed border-white/15 text-white/60 inline-flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Zeit nachtragen
        </button>
      </section>

      {bearbeiten && <SchichtSheet schicht={bearbeiten === 'neu' ? null : bearbeiten} onClose={() => setBearbeiten(null)} />}
    </div>
  )
}
