import { useNavigate } from 'react-router-dom'
import { ClipboardCheck, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react'
import { timerVon } from '../lib/baustelle'
import { euro } from '../lib/format'

const heuteISO = () => new Date().toLocaleDateString('sv-SE')
const istHeute = (iso) => iso && new Date(iso).toLocaleDateString('sv-SE') === heuteISO()

// Tagesabschluss: je Projekt mit Arbeit heute prüfen, ob alles erfasst ist, und die Lücken mit einem Tipp schließen.
export default function Tagesabschluss({ projekte, eintraege, onClose }) {
  const nav = useNavigate()
  const heute = eintraege.filter((e) => istHeute(e.startAt || e.createdAt))
  const liste = projekte.map((p) => {
    const e = heute.filter((x) => x.projektId === p.id)
    const tm = timerVon(p.id)
    if (!e.length && !tm) return null
    const min = e.filter((x) => x.type === 'zeit').reduce((a, x) => a + (Number(x.minutes) || 0), 0)
    const mat = e.filter((x) => x.type === 'material')
    const offen = []
    if (tm) offen.push({ text: 'Timer läuft noch', aktion: 'Zum Timer', ziel: '' })
    if ((min > 0 || tm) && !e.some((x) => x.type === 'tagebuch')) offen.push({ text: 'Kein Bautagebuch-Eintrag', aktion: 'Schreiben', ziel: 'tagebuch' })
    if ((min > 0 || tm) && !e.some((x) => x.type === 'foto')) offen.push({ text: 'Keine Fotos vom Tag', aktion: 'Foto', ziel: 'foto', leicht: true })
    const ohnePreis = mat.filter((x) => !(Number(x.unitCost) > 0) && !/privat, nicht berechnet/.test(x.label || ''))
    if (ohnePreis.length) offen.push({ text: 'Preis fehlt bei ' + ohnePreis.length + ' Material', aktion: 'Nachtragen', ziel: 'belege' })
    return { p, min, mat, fotos: e.filter((x) => x.type === 'foto').length, offen }
  }).filter(Boolean)
  const alles = liste.every((x) => !x.offen.some((o) => !o.leicht))

  const geh = (p, ziel) => { onClose(); nav('/projekt/' + p.id + (ziel ? '?neu=' + ziel : '')) }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={onClose}>
      <div className="glass w-full max-w-lg mx-auto rounded-t-4xl md:rounded-4xl p-5 space-y-3 max-h-[90dvh] overflow-y-auto m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold flex items-center gap-2.5"><ClipboardCheck className="w-6 h-6 text-amber" /> Tagesabschluss</div>
        {!liste.length ? (
          <div className="text-white/70 text-sm">Heute ist noch nichts erfasst.</div>
        ) : (
          <>
            <div className={'rounded-2xl px-3 py-2 text-sm font-semibold flex items-center gap-2 ' + (alles ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber/10 text-amber border border-amber/40')}>
              {alles ? <><CheckCircle2 className="w-5 h-5" /> Alles erfasst – schönen Feierabend!</> : <><AlertTriangle className="w-5 h-5" /> Noch ein paar Punkte offen</>}
            </div>
            {liste.map(({ p, min, mat, fotos, offen }) => (
              <div key={p.id} className="rounded-2xl p-3 bg-white/5 border border-white/15 space-y-2">
                <button onClick={() => geh(p)} className="w-full flex items-center gap-2 text-left">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{p.name}</div>
                    <div className="text-white/60 text-xs">{(min / 60).toLocaleString('de-DE', { maximumFractionDigits: 2 })} h · {mat.length} Material ({euro(mat.reduce((a, x) => a + (Number(x.qty) || 0) * (Number(x.unitCost) || 0), 0))}) · {fotos} Fotos</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/50" />
                </button>
                {offen.length === 0 && <div className="text-emerald-400 text-sm flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> vollständig</div>}
                {offen.map((o) => (
                  <div key={o.text} className="flex items-center gap-2 text-sm">
                    <span className={'flex-1 ' + (o.leicht ? 'text-white/70' : 'text-amber')}>{o.text}</span>
                    <button onClick={() => geh(p, o.ziel)} className="rounded-xl px-3 py-1.5 bg-white/10 text-xs font-semibold">{o.aktion}</button>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
        <button onClick={onClose} className="w-full rounded-2xl py-2.5 text-white/70 text-sm">Schließen</button>
      </div>
    </div>
  )
}
