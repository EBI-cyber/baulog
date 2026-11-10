import { ChevronRight } from 'lucide-react'
import { uhr, pauseMs, arbeitMs, hm } from '../lib/zeit'

export default function SchichtZeile({ s, onClick }) {
  return (
    <button onClick={onClick} className="w-full text-left glass rounded-2xl px-4 py-3 flex items-center gap-3 card-hover active:scale-[0.99]">
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{s.firma || '—'}</div>
        <div className="text-sm text-white/50 tabular-nums">
          {uhr(s.start)} – {s.ende ? uhr(s.ende) : 'läuft'} · Pause {hm(pauseMs(s))}
          {s.notiz ? <span className="text-white/40"> · {s.notiz}</span> : null}
        </div>
      </div>
      <div className="shrink-0 font-bold tabular-nums">{hm(arbeitMs(s))} h</div>
      <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
    </button>
  )
}
