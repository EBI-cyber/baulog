import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Camera, NotebookPen, Package, Clock, MapPin, ChevronRight, ClipboardCheck, Sun } from 'lucide-react'
import { listProjekte, allEintraege } from '../lib/db'
import { useCloudRefresh } from '../lib/useCloudRefresh'
import { useRole } from '../lib/role'
import { euro } from '../lib/format'
import IconChip from '../ui/IconChip'
import { standortVon, aktuellePosition, abstand, BAUSTELLE_RADIUS, timerVon, timerStarten } from '../lib/baustelle'
import Tagesabschluss from '../components/Tagesabschluss'

const heuteISO = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD in Ortszeit
const istHeute = (iso) => iso && new Date(iso).toLocaleDateString('sv-SE') === heuteISO()
const dauer = (ms) => { const m = Math.floor(ms / 60000); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ' h' }
const laufzeit = (tm, now) => Math.max(0, now - tm.startTs - (tm.pauses || []).reduce((a, p) => a + ((p.endTs || now) - p.startTs), 0))

// Startseite „Heute“: laufende Timer, Baustelle in der Nähe, Schnellaktionen fürs zuletzt genutzte Projekt,
// was heute schon erfasst ist und der Tagesabschluss.
export default function Heute() {
  const nav = useNavigate()
  const isWorker = useRole() === 'worker'
  const [projekte, setProjekte] = useState([])
  const [eintraege, setEintraege] = useState([])
  const [now, setNow] = useState(Date.now())
  const [nahe, setNahe] = useState(null) // Projekt, an dessen Baustelle man gerade steht
  const [abschluss, setAbschluss] = useState(false)

  const load = async () => { setProjekte(await listProjekte()); setEintraege(await allEintraege()) }
  useEffect(() => { load() }, [])
  useCloudRefresh(load)
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv) }, [])

  // Standort nur prüfen, wenn mindestens eine Baustelle einen gemerkten Standort hat (sonst keine Nachfrage)
  useEffect(() => {
    const mitStandort = projekte.filter((p) => p.status !== 'archiviert' && standortVon(p.token))
    if (!mitStandort.length) return
    let aktiv = true
    aktuellePosition(120000).then((pos) => {
      if (!aktiv) return
      const treffer = mitStandort.map((p) => ({ p, d: abstand(pos, standortVon(p.token)) })).filter((x) => x.d <= BAUSTELLE_RADIUS + (pos.genau || 0) / 2).sort((a, b) => a.d - b.d)[0]
      setNahe(treffer ? treffer.p : null)
    }).catch(() => {})
    return () => { aktiv = false }
  }, [projekte])

  const timer = projekte.map((p) => ({ p, tm: timerVon(p.id) })).filter((x) => x.tm)
  const heute = eintraege.filter((e) => istHeute(e.startAt || e.createdAt))
  const minuten = heute.filter((e) => e.type === 'zeit').reduce((a, e) => a + (Number(e.minutes) || 0), 0) + timer.reduce((a, x) => a + laufzeit(x.tm, now) / 60000, 0)
  const material = heute.filter((e) => e.type === 'material')
  const zuletzt = [...eintraege].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
  const aktuell = nahe || (timer[0] && timer[0].p) || (zuletzt && projekte.find((p) => p.id === zuletzt.projektId)) || projekte[0]
  const tag = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  const stunde = new Date().getHours()
  const gruss = stunde < 11 ? 'Guten Morgen' : stunde < 18 ? 'Hallo' : 'Guten Abend'

  const neu = (p, art) => nav('/projekt/' + p.id + '?neu=' + art)
  const starten = (p) => { timerStarten(p.id); nav('/projekt/' + p.id) }

  return (
    <div className="px-5 md:px-8 pt-8 md:pt-10 space-y-4">
      <header>
        <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">{gruss}!</h1>
        <p className="text-white/70 text-sm mt-0.5">{tag}</p>
      </header>

      {nahe && !timerVon(nahe.id) && (
        <div className="rounded-3xl p-4 border border-emerald-500/40 bg-emerald-500/10 space-y-3">
          <div className="flex items-center gap-2 font-semibold"><MapPin className="w-5 h-5 text-emerald-400" /> Du bist an der Baustelle „{nahe.name}“</div>
          <button onClick={() => starten(nahe)} className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2"><Play className="w-5 h-5" /> Timer starten</button>
        </div>
      )}

      {timer.map(({ p, tm }) => (
        <button key={p.id} onClick={() => nav('/projekt/' + p.id)} className="w-full glass card-hover rounded-3xl p-4 flex items-center gap-3 text-left">
          <IconChip icon={Clock} />
          <div className="flex-1 min-w-0">
            <div className="text-white/70 text-xs">Timer läuft · {p.name}</div>
            <div className="text-2xl font-extrabold tabular-nums">{dauer(laufzeit(tm, now))}</div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/50" />
        </button>
      ))}

      {aktuell && (
        <div className="glass rounded-3xl p-4 space-y-3">
          <button onClick={() => nav('/projekt/' + aktuell.id)} className="w-full flex items-center gap-2 text-left">
            <div className="flex-1 min-w-0">
              <div className="text-white/60 text-xs">{nahe ? 'Baustelle in der Nähe' : 'Zuletzt bearbeitet'}</div>
              <div className="font-bold text-lg truncate">{aktuell.name}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-white/50" />
          </button>
          <div className="grid grid-cols-4 gap-2">
            {[
              !timerVon(aktuell.id) && [Play, 'Timer', () => starten(aktuell)],
              [Camera, 'Foto', () => neu(aktuell, 'foto')],
              [NotebookPen, 'Tagebuch', () => neu(aktuell, 'tagebuch')],
              [Package, 'Beleg', () => neu(aktuell, 'material')],
            ].filter(Boolean).map(([Icon, text, fn]) => (
              <button key={text} onClick={fn} className="rounded-2xl py-3 bg-white/10 flex flex-col items-center gap-1.5 text-xs font-semibold"><Icon className="w-6 h-6 text-amber" />{text}</button>
            ))}
          </div>
        </div>
      )}

      <div className="glass rounded-3xl p-4">
        <div className="text-white/70 text-xs mb-2 uppercase tracking-wider font-semibold">Heute erfasst</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xl font-bold tabular-nums">{(minuten / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })} h</div><div className="text-white/60 text-xs">Stunden</div></div>
          <div><div className="text-xl font-bold tabular-nums">{isWorker ? material.length : euro(material.reduce((a, e) => a + (Number(e.qty) || 0) * (Number(e.unitCost) || 0), 0))}</div><div className="text-white/60 text-xs">Material</div></div>
          <div><div className="text-xl font-bold tabular-nums">{heute.filter((e) => e.type === 'foto').length}</div><div className="text-white/60 text-xs">Fotos</div></div>
        </div>
      </div>

      <button onClick={() => setAbschluss(true)} className={'w-full rounded-3xl p-4 flex items-center gap-3 text-left ' + (stunde >= 15 ? 'btn-grad font-bold' : 'glass card-hover')}>
        {stunde >= 15 ? <ClipboardCheck className="w-6 h-6" /> : <Sun className="w-6 h-6 text-amber" />}
        <div className="flex-1">
          <div className="font-bold">Tagesabschluss</div>
          <div className={'text-xs ' + (stunde >= 15 ? 'text-black/70' : 'text-white/60')}>In einer Minute prüfen: Zeiten, Material, Fotos, Bautagebuch</div>
        </div>
        <ChevronRight className="w-5 h-5" />
      </button>

      {projekte.length === 0 && (
        <div className="glass rounded-3xl p-6 text-center text-white/70 text-sm">Noch keine Projekte. Unter „Projekte“ legst du dein erstes an.</div>
      )}
      {abschluss && <Tagesabschluss projekte={projekte} eintraege={eintraege} onClose={() => setAbschluss(false)} />}
    </div>
  )
}
