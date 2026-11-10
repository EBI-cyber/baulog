import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Play, Pause, Square, Coffee, Plus, Send, Settings, Building2, Pencil, CalendarOff, Wallet, Banknote, PartyPopper, IdCard, ClipboardList, Thermometer } from 'lucide-react'
import { db, speichern, laufendeSchicht } from '../lib/db'
import { useEinstellungen, fertigEingerichtet } from '../lib/settings'
import { isoWoche, isoDatum, wochenKey, wocheVersetzt, TAGE_LANG, datumLang, uhr, pauseMs, arbeitMs, istPausiert, hms, hm } from '../lib/zeit'
import FirmaWahl from '../components/FirmaWahl'
import Erfassen from '../components/Erfassen'
import AbschlussSheet from '../components/AbschlussSheet'
import KrankSheet from '../components/KrankSheet'
import { AbsenzZeile, SpesenZeile } from '../components/Zeilen'
import { zahl, tagesSoll } from '../lib/settings'
import { useLohn } from '../lib/useLohn'
import { chf } from '../lib/lohn'
import { feiertagAm } from '../lib/feiertage'
import { kantonFuer } from '../lib/kanton'
import { speichereAbsenz } from '../lib/db'
import { offeneRapporte } from '../lib/rapporte'
import { profilFertig, ausweisTage, mindestPause } from '../lib/profil'
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
  const tag = isoDatum(heute)
  const heuteListe = useLiveQuery(() => db.schichten.where('datum').equals(tag).sortBy('start'), [tag], [])
  const absenzen = useLiveQuery(() => db.absenzen.where('datum').equals(tag).toArray(), [tag], [])
  const spesen = useLiveQuery(() => db.spesen.where('datum').equals(tag).toArray(), [tag], [])
  const vorwoche = wocheVersetzt(woche, -1)
  const offen = useLiveQuery(async () => {
    const key = wochenKey(vorwoche)
    return (await offeneRapporte(key, einst)).length ? key : null
  }, [wochenKey(vorwoche), einst.firma, einst.buero], null)

  const jetzt = useJetzt(!!laufend)
  const einsaetze = useLiveQuery(() => db.einsaetze.toArray(), [], [])
  const lohnHeute = useLohn(tag, tag, einst, jetzt)
  const monatVon = tag.slice(0, 8) + '01'
  const lohnMonat = useLohn(monatVon, tag, einst, jetzt)
  const aktiverEinsatz = (einsaetze || []).find((e) => e.firma === (einst.firma || einst.firmen[0]))
  const kanton = kantonFuer(laufend?.firma || einst.firma, einsaetze, einst)
  const feiertag = feiertagAm(kanton, tag)
  const pausiert = istPausiert(laufend)
  const [sheet, setSheet] = useState(null)
  const bearbeite = (s) => setSheet({ typ: 'zeit', objekt: s })
  const [stoppFrage, setStoppFrage] = useState(false)
  const [wechseln, setWechseln] = useState(false)
  const [abschluss, setAbschluss] = useState(null) // wocheKey
  const [krank, setKrank] = useState(false)
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
    const fertig = { ...laufend, ende: n, pausen: (laufend.pausen || []).map((p) => (p.ende == null ? { ...p, ende: n } : p)) }
    // Arbeitsgesetz: zu kurze Pause automatisch auf die Mindestpause ergänzen (abschaltbar im Fragebogen)
    if (einst.profil?.mindestpause !== false) {
      const pause = pauseMs(fertig) / 60000, arbeit = (n - fertig.start) / 60000 - pause
      const soll = mindestPause(arbeit)
      if (pause < soll) { fertig.pauseMin = soll; fertig.pauseAuto = Math.round(pause) }
    }
    await speichern(fertig)
    // Letzter Arbeitstag der Woche: direkt zum Wochenabschluss (unterschreiben & senden)
    const wt = new Date().getDay() || 7
    const key = wochenKey(isoWoche(new Date()))
    if (wt >= (+einst.abschlussTag || 5) && (await offeneRapporte(key, einst)).length) setAbschluss(key)
  }

  const fertig = (heuteListe || []).filter((s) => s.ende != null)
  const summeHeute = (heuteListe || []).reduce((a, s) => a + arbeitMs(s, jetzt), 0)
    + (absenzen || []).reduce((a, x) => a + zahl(x.stunden) * 3600000, 0)

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

      {!profilFertig(einst.profil) ? (
        <Link to="/fragebogen" className="rounded-3xl p-4 flex items-center gap-3 card-hover bg-aqua/10 border border-aqua/30">
          <IconChip icon={ClipboardList} variant="grad" />
          <div className="min-w-0">
            <div className="font-semibold">Einmal einrichten</div>
            <div className="text-sm text-white/55">Kurzer Fragebogen zu deiner Situation — dann stimmen Lohn, Steuer und Rapport.</div>
          </div>
        </Link>
      ) : !fertigEingerichtet(einst) && (
        <Link to="/einstellungen" className="glass rounded-3xl p-4 flex items-center gap-3 card-hover">
          <IconChip icon={Settings} />
          <div className="min-w-0">
            <div className="font-semibold">Ersten Einsatz anlegen</div>
            <div className="text-sm text-white/50">Einsatzvertrag fotografieren — Firma, Büro und Lohn werden übernommen.</div>
          </div>
        </Link>
      )}
      {(() => {
        const t = ausweisTage(einst.profil)
        if (t == null || t > 60) return null
        return (
          <Link to="/fragebogen" className={'rounded-3xl p-4 flex items-center gap-3 border ' + (t <= 14 ? 'bg-ember/15 border-ember/40' : 'bg-amber-400/10 border-amber-400/30')}>
            <IconChip icon={IdCard} />
            <div className="min-w-0">
              <div className="font-semibold">{t < 0 ? 'Ausweis abgelaufen!' : `Ausweis läuft in ${t} Tagen ab`}</div>
              <div className="text-sm text-white/60">Verlängerung rechtzeitig beim Migrationsamt bzw. über den Arbeitgeber beantragen. Neues Datum im Fragebogen eintragen.</div>
            </div>
          </Link>
        )
      })()}

      {offen && (
        <button onClick={() => setAbschluss(offen)} className="w-full text-left rounded-3xl p-4 flex items-center gap-3 bg-aqua/10 border border-aqua/30">
          <IconChip icon={Send} variant="grad" />
          <div className="min-w-0">
            <div className="font-semibold">KW {+offen.slice(-2)} ist vorbei</div>
            <div className="text-sm text-white/60">Unterschreiben & ans Büro senden</div>
          </div>
        </button>
      )}

      {/* Stempeluhr */}
      <section className="glass rounded-4xl p-6 text-center space-y-5">
        {!laufend ? (
          <>
            {firma && !wechseln ? (
              // Aktueller Einsatz ist voreingestellt — nur Start drücken
              <button onClick={() => setWechseln(true)} className="w-full text-left rounded-2xl bg-white/[0.05] border border-white/10 px-4 py-3 flex items-center gap-3">
                <IconChip icon={Building2} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{firma}</div>
                  <div className="text-xs text-white/45 truncate">{[aktiverEinsatz?.buero || einst.buero, aktiverEinsatz?.einsatzort, aktiverEinsatz?.funktion].filter(Boolean).join(' · ') || 'Einsatz'}</div>
                </div>
                <span className="shrink-0 text-xs text-white/40">Wechseln</span>
              </button>
            ) : (
              <div className="text-left space-y-2">
                <div className="text-xs text-white/50 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Einsatzbetrieb wählen</div>
                <FirmaWahl firmen={einst.firmen} wert={firma} onWahl={(f) => { setEinst({ firma: f }); setWechseln(false) }}
                  onNeu={(n) => { setEinst({ firmen: [...einst.firmen, n], firma: n }); setWechseln(false) }} />
              </div>
            )}
            <button onClick={start} disabled={!firma}
              className="mx-auto w-44 h-44 rounded-full btn-grad shadow-glow flex flex-col items-center justify-center gap-1 font-extrabold text-xl active:scale-95 transition disabled:opacity-40">
              <Play className="w-12 h-12" strokeWidth={2.2} fill="currentColor" />
              Start
            </button>
            {!firma && <div className="text-sm text-white/50">Zuerst eine Firma wählen oder hinzufügen.</div>}
            <button onClick={() => setKrank(true)} className="text-sm text-white/45 inline-flex items-center gap-1.5"><Thermometer className="w-4 h-4" /> Krank melden</button>
          </>
        ) : (
          <>
            <button onClick={() => bearbeite(laufend)} className="inline-flex items-center gap-1.5 text-sm text-white/60">
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

      {lohnHeute && (lohnHeute.brutto > 0 || lohnMonat?.brutto > 0) && (
        <Link to="/lohn" className="glass rounded-3xl p-4 grid grid-cols-2 gap-3 card-hover">
          <div className="flex items-center gap-3 min-w-0">
            <IconChip icon={Banknote} />
            <div className="min-w-0">
              <div className="text-xs text-white/45">Heute verdient</div>
              <div className="font-extrabold grad-text tabular-nums">{chf(lohnHeute.brutto, einst.waehrung)}</div>
              <div className="text-xs text-white/40 tabular-nums">netto ≈ {chf(lohnHeute.netto, einst.waehrung)}</div>
            </div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-xs text-white/45">Monat bis jetzt</div>
            <div className="font-extrabold tabular-nums">{chf(lohnMonat?.netto || 0, einst.waehrung)}</div>
            <div className="text-xs text-white/40">netto</div>
          </div>
        </Link>
      )}
      {lohnHeute && lohnHeute.fehlendeLoehne.length > 0 && fertigEingerichtet(einst) && (
        <Link to="/einstellungen" className="block text-sm text-white/55 underline decoration-white/20">
          Für den Live-Lohn den Einsatzvertrag von {lohnHeute.fehlendeLoehne[0]} erfassen →
        </Link>
      )}

      {feiertag && !(absenzen || []).length && (
        <div className="rounded-3xl p-4 flex items-center gap-3 bg-violet-400/10 border border-violet-400/30">
          <IconChip icon={PartyPopper} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{feiertag}</div>
            <div className="text-sm text-white/55">Feiertag im Kanton {kanton}</div>
          </div>
          <button onClick={() => speichereAbsenz({ datum: tag, art: 'feiertag', firma: einst.firma, halbtag: false, stunden: tagesSoll(einst), zeugnis: false, notiz: feiertag })}
            className="shrink-0 rounded-xl px-3 py-2 bg-white/10 text-sm font-semibold">Eintragen</button>
        </div>
      )}

      {/* Heutige Einträge */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Heute erfasst</h2>
          <div className="text-sm text-white/60 tabular-nums">Total <span className="font-bold text-white">{hm(summeHeute)} h</span></div>
        </div>
        {(absenzen || []).map((a) => <AbsenzZeile key={'a' + a.id} a={a} onClick={() => setSheet({ typ: 'absenz', objekt: a })} />)}
        {fertig.map((s) => <SchichtZeile key={s.id} s={s} onClick={() => bearbeite(s)} />)}
        {(spesen || []).map((x) => <SpesenZeile key={'s' + x.id} s={x} waehrung={einst.waehrung} onClick={() => setSheet({ typ: 'spesen', objekt: x })} />)}
        {!fertig.length && !absenzen?.length && <div className="text-sm text-white/40">Noch nichts abgeschlossen.</div>}
        <div className="grid grid-cols-3 gap-2">
          {[['zeit', Plus, 'Zeit'], ['absenz', CalendarOff, 'Abwesend'], ['spesen', Wallet, 'Spesen']].map(([t, I, l]) => (
            <button key={t} onClick={() => setSheet({ typ: t, datum: tag })}
              className="rounded-2xl py-3 bg-white/[0.06] border border-dashed border-white/15 text-white/65 text-sm inline-flex flex-col items-center gap-1">
              <I className="w-5 h-5" strokeWidth={1.9} /> {l}
            </button>
          ))}
        </div>
      </section>

      <Erfassen wert={sheet} setWert={setSheet} />
      {krank && <KrankSheet onClose={() => setKrank(false)} />}
      {abschluss && <AbschlussSheet wKey={abschluss} onClose={() => setAbschluss(null)} />}
    </div>
  )
}
