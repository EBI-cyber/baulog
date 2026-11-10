import { ChevronRight, FileCheck2 } from 'lucide-react'
import { absenzArt, spesenArt, FARBE } from '../lib/arten'
import { zahl } from '../lib/settings'
import { std } from '../lib/woche'

export function AbsenzZeile({ a, onClick }) {
  const art = absenzArt(a.art)
  return (
    <button onClick={onClick} className={'w-full text-left rounded-2xl px-4 py-3 flex items-center gap-3 border active:scale-[0.99] ' + FARBE[art.farbe]}>
      <art.icon className="w-5 h-5 shrink-0" strokeWidth={1.9} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{art.label}{a.halbtag ? ' (½ Tag)' : ''}</div>
        {(a.notiz || a.zeugnis) && <div className="text-sm opacity-70 truncate flex items-center gap-1.5">
          {a.zeugnis && <><FileCheck2 className="w-3.5 h-3.5 shrink-0" /> Zeugnis</>}{a.zeugnis && a.notiz ? ' · ' : ''}{a.notiz}
        </div>}
      </div>
      <div className="shrink-0 font-bold tabular-nums">{std(zahl(a.stunden))} h</div>
      <ChevronRight className="w-4 h-4 opacity-40 shrink-0" />
    </button>
  )
}

export function SpesenZeile({ s, waehrung, onClick }) {
  const art = spesenArt(s.art)
  return (
    <button onClick={onClick} className="w-full text-left rounded-2xl px-4 py-2.5 flex items-center gap-3 bg-white/[0.04] border border-white/10 active:scale-[0.99]">
      <art.icon className="w-4 h-4 shrink-0 text-white/60" strokeWidth={1.9} />
      <div className="min-w-0 flex-1 text-sm truncate">
        {art.label}{s.km ? ` · ${s.km} km` : ''}{s.notiz ? <span className="text-white/45"> · {s.notiz}</span> : null}
      </div>
      <div className="shrink-0 text-sm font-semibold tabular-nums">{waehrung} {zahl(s.betrag).toFixed(2)}</div>
    </button>
  )
}
