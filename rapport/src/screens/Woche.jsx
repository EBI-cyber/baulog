import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Send, CloudUpload, FileText, Plus, CheckCircle2, MessageCircle, AlertTriangle, CalendarOff, Wallet, PartyPopper, Banknote, CalendarPlus, CalendarDays } from 'lucide-react'
import { db, wocheMarkieren, speichereAbsenz } from '../lib/db'
import { feiertagAm } from '../lib/feiertage'
import { kantonFuer } from '../lib/kanton'
import { tagesSoll } from '../lib/settings'
import { useLohn } from '../lib/useLohn'
import { chf } from '../lib/lohn'
import { Link } from 'react-router-dom'
import { useEinstellungen } from '../lib/settings'
import { isoWoche, wochenKey, ausKey, wocheVersetzt, wochenTage, isoDatum, TAGE_LANG, datumKurz, datumLang, arbeitMs, hm, dezimal, uhr } from '../lib/zeit'
import RapportKarte from '../components/RapportKarte'
import AbschlussSheet from '../components/AbschlussSheet'
import { rapportGruppen } from '../lib/rapporte'
import Erfassen from '../components/Erfassen'
import { AbsenzZeile, SpesenZeile } from '../components/Zeilen'
import { wochenRechnung, std } from '../lib/woche'
import SchichtZeile from '../components/SchichtZeile'
import IconChip from '../ui/IconChip'
import WocheNachtragen from '../components/WocheNachtragen'
import { vorgabeAus } from '../lib/nachtragen'


export default function Woche() {
  const { key } = useParams()
  const nav = useNavigate()
  const woche = ausKey(key) || isoWoche()
  const wKey = wochenKey(woche)
  const [einst] = useEinstellungen()
  const schichten = useLiveQuery(() => db.schichten.where('wocheKey').equals(wKey).sortBy('start'), [wKey], null)
  const absenzen = useLiveQuery(() => db.absenzen.where('wocheKey').equals(wKey).toArray(), [wKey], null)
  const spesen = useLiveQuery(() => db.spesen.where('wocheKey').equals(wKey).toArray(), [wKey], null)
  const einsaetze = useLiveQuery(() => db.einsaetze.toArray(), [], [])
  const [sheet, setSheet] = useState(null)
  const [abschluss, setAbschluss] = useState(false)
  // Woche nachtragen — auch per Link: #/woche/2026-W44?h=9.5,8.5,8,10.75,8&f=Stüssi&b=07:00&papier=1
  // genaue Zeiten: z=06:45-09:00_09:15-12:00;…  (Tage mit ; , Blöcke mit _), Notizen: n=…;…
  const [such, setSuch] = useSearchParams()
  const [nachtragen, setNachtragen] = useState(() => vorgabeAus(such))
  const nachtragenZu = () => { setNachtragen(null); if ([...such.keys()].length) setSuch({}, { replace: true }) }
  const tage = wochenTage(woche)
  const aktuelleWoche = wKey === wochenKey(isoWoche())

  const fertig = (schichten || []).filter((s) => s.ende != null)
  const laeuftNoch = (schichten || []).some((s) => s.ende == null)
  // Soll aus dem Einsatzvertrag der Woche, sonst aus den Einstellungen
  const einsatzSoll = (einsaetze || []).find((e) => (schichten || []).some((x) => x.firma === e.firma) && +e.wochenstunden)?.wochenstunden
  const einstW = einsatzSoll ? { ...einst, wochenSoll: einsatzSoll } : einst
  const r = wochenRechnung({ schichten: fertig, absenzen: absenzen || [], spesen: spesen || [], einst: einstW })
  const hatDaten = fertig.length > 0 || (absenzen || []).length > 0
  const heuteIso = isoDatum(new Date())
  const kanton = kantonFuer([...new Set((schichten || []).map((s) => s.firma))], einsaetze, einst)
  const lohn = useLohn(isoDatum(tage[0]), isoDatum(tage[6]), einst)
  const feiertagEintragen = (d, name) => speichereAbsenz({ datum: d, art: 'feiertag', firma: einst.firma, halbtag: false, stunden: tagesSoll(einst), zeugnis: false, notiz: name })
  // Vergangene Werktage ohne Eintrag (Rapport soll vollständig sein)
  const luecken = schichten && absenzen ? tage.filter((t) => {
    const d = isoDatum(t)
    return t.getDay() !== 0 && t.getDay() !== 6 && d < heuteIso && !feiertagAm(kanton, d) &&
      !schichten.some((s) => s.datum === d) && !absenzen.some((a) => a.datum === d)
  }) : []

  const gruppen = rapportGruppen({ schichten: schichten || [], absenzen: absenzen || [], spesen: spesen || [], einsaetze, einst })

  return (
    <div className="space-y-5">
      <Link to={`/kalender/${isoDatum(tage[3]).slice(0, 7)}`} className="inline-flex items-center gap-1 text-sm text-white/55 -mb-2">
        <CalendarDays className="w-4 h-4" /> Kalender
      </Link>
      <header className="flex items-center justify-between gap-2">
        <button onClick={() => nav(`/woche/${wochenKey(wocheVersetzt(woche, -1))}`)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" aria-label="Vorherige Woche">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center min-w-0">
          <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">KW {woche.kw}</h1>
          <div className="text-sm text-white/50">{datumLang(tage[0])} – {datumLang(tage[6])}{aktuelleWoche ? ' · diese Woche' : ''}</div>
        </div>
        <button onClick={() => nav(`/woche/${wochenKey(wocheVersetzt(woche, 1))}`)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" aria-label="Nächste Woche">
          <ChevronRight className="w-5 h-5" />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-3xl p-4">
          <div className="text-white/40 text-xs">Total angerechnet</div>
          <div className="text-2xl font-extrabold grad-text tabular-nums">{std(r.total)} h</div>
          <div className="text-xs text-white/40 tabular-nums">dezimal {r.total.toFixed(2)}</div>
        </div>
        <div className="glass rounded-3xl p-4">
          {r.soll ? <>
            <div className="text-white/40 text-xs">Soll {std(r.soll)} h</div>
            <div className={'text-2xl font-extrabold tabular-nums ' + (r.differenz >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {r.differenz >= 0 ? '+' : ''}{std(r.differenz)} h
            </div>
            <div className="text-xs text-white/40">{r.differenz >= 0 ? 'Überstunden' : 'Minusstunden'}</div>
          </> : <>
            <div className="text-white/40 text-xs">Soll</div>
            <div className="text-sm text-white/50 mt-1">In den Einstellungen festlegen, dann siehst du Über-/Minusstunden.</div>
          </>}
        </div>
        <div className="glass rounded-3xl p-4">
          <div className="text-white/40 text-xs">Gearbeitet</div>
          <div className="text-lg font-bold tabular-nums">{std(r.arbeit)} h</div>
        </div>
        <div className="glass rounded-3xl p-4">
          <div className="text-white/40 text-xs">Abwesenheiten</div>
          <div className="text-lg font-bold tabular-nums">{std(r.absenzStd)} h</div>
          {Object.keys(r.nachArt).length > 0 && <div className="text-xs text-white/45 truncate">
            {Object.entries(r.nachArt).map(([k, v]) => `${k} ${v}`).join(' · ')}
          </div>}
        </div>
        {lohn && lohn.brutto > 0 && <Link to="/lohn" className="glass rounded-3xl p-4 col-span-2 flex items-center justify-between card-hover">
          <div className="text-white/40 text-xs inline-flex items-center gap-1.5"><Banknote className="w-4 h-4" /> Lohn (geschätzt)</div>
          <div className="text-right tabular-nums"><div className="text-lg font-bold">{chf(lohn.netto, einst.waehrung)} <span className="text-xs font-normal text-white/40">netto</span></div>
            <div className="text-xs text-white/40">brutto {chf(lohn.brutto, einst.waehrung)}</div></div>
        </Link>}
        {r.spesen > 0 && <div className="glass rounded-3xl p-4 col-span-2 flex items-center justify-between">
          <div className="text-white/40 text-xs inline-flex items-center gap-1.5"><Wallet className="w-4 h-4" /> Spesen</div>
          <div className="text-lg font-bold tabular-nums">{einst.waehrung} {r.spesen.toFixed(2)}</div>
        </div>}
      </div>

      {luecken.length > 0 && (
        <div className="text-sm rounded-2xl px-4 py-3 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>Ohne Eintrag: {luecken.map((t) => `${TAGE_LANG[t.getDay()].slice(0, 2)} ${datumKurz(t)}`).join(', ')} — Arbeitszeit oder Abwesenheit (z.B. Feiertag) eintragen.</div>
        </div>
      )}

      {/* Rapport — einer pro Firma / Temporärbüro */}
      {laeuftNoch && (
        <div className="text-sm rounded-xl px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Eine Zeit läuft noch — sie kommt erst nach „Feierabend" in den Rapport.
        </div>
      )}
      {!hatDaten ? (
        <section className="glass rounded-3xl p-5 flex items-center gap-3">
          <IconChip icon={FileText} />
          <div className="text-sm text-white/45">Noch keine Einträge in dieser Woche.</div>
        </section>
      ) : gruppen.map((g) => <RapportKarte key={g.firma} g={g} woche={woche} wKey={wKey} mehrere={gruppen.length > 1} onAbschluss={() => setAbschluss(true)} />)}

      {/* Tage */}
      <section className="space-y-4">
        {tage.map((tag) => {
          const d = isoDatum(tag)
          const liste = (schichten || []).filter((s) => s.datum === d)
          const abw = (absenzen || []).filter((a) => a.datum === d)
          const sp = (spesen || []).filter((x) => x.datum === d)
          const t = wochenRechnung({ schichten: liste, absenzen: abw, einst }).total
          return (
            <div key={d} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="font-semibold">{TAGE_LANG[tag.getDay()]} <span className="text-white/40 font-normal">{datumKurz(tag)}</span></div>
                <div className="flex items-center gap-3">
                  {(liste.length > 0 || abw.length > 0) && <span className="tabular-nums text-white/60">{std(t)} h</span>}
                  <button onClick={() => setSheet({ typ: 'menue', datum: d })} className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/50" aria-label="Eintrag hinzufügen">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {feiertagAm(kanton, d) && !abw.length && (
                <div className="rounded-2xl px-4 py-2.5 flex items-center gap-3 border border-dashed border-violet-400/40 text-violet-300">
                  <PartyPopper className="w-5 h-5 shrink-0" strokeWidth={1.9} />
                  <div className="min-w-0 flex-1 text-sm"><b>{feiertagAm(kanton, d)}</b> <span className="opacity-70">· Feiertag {kanton}</span></div>
                  <button onClick={() => feiertagEintragen(d, feiertagAm(kanton, d))} className="shrink-0 rounded-xl px-3 py-1.5 bg-white/10 text-white text-sm font-semibold">Eintragen</button>
                </div>
              )}
              {abw.map((a) => <AbsenzZeile key={'a' + a.id} a={a} onClick={() => setSheet({ typ: 'absenz', objekt: a })} />)}
              {liste.map((s) => <SchichtZeile key={s.id} s={s} onClick={() => setSheet({ typ: 'zeit', objekt: s })} />)}
              {sp.map((x) => <SpesenZeile key={'s' + x.id} s={x} waehrung={einst.waehrung} onClick={() => setSheet({ typ: 'spesen', objekt: x })} />)}
            </div>
          )
        })}
      </section>

      <button onClick={() => setNachtragen({})}
        className="w-full rounded-2xl py-3 bg-white/[0.06] border border-dashed border-white/15 text-white/60 inline-flex items-center justify-center gap-2">
        <CalendarPlus className="w-4 h-4" /> Ganze Woche nachtragen (z.B. vom Papier-Rapport)
      </button>
      <button onClick={() => setSheet({ typ: 'absenz', datum: isoDatum(tage[0]) })}
        className="w-full rounded-2xl py-3 bg-white/[0.06] border border-dashed border-white/15 text-white/60 inline-flex items-center justify-center gap-2">
        <CalendarOff className="w-4 h-4" /> Ferien / Abwesenheit über mehrere Tage
      </button>

      <Erfassen wert={sheet} setWert={setSheet} />
      {nachtragen && <WocheNachtragen woche={woche} vorgabe={nachtragen} onClose={nachtragenZu} />}
      {abschluss && <AbschlussSheet wKey={wKey} onClose={() => setAbschluss(false)} />}
    </div>
  )
}
