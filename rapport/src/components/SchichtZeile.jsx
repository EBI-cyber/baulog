import { ChevronRight } from 'lucide-react'
import { uhr, pauseMs, arbeitMs, hm } from '../lib/zeit'

const notizText = (n) => (n || '').replace(/\s*·?\s*(vom Papier-Rapport )?nachgetragen\s*$/i, '').trim()

export default function SchichtZeile({ s, onClick }) {
  const notiz = notizText(s.notiz)
  return (
    <button onClick={onClick} className="w-full text-left glass rounded-2xl px-4 py-3 flex items-center gap-3 card-hover active:scale-[0.99]">
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{s.firma || '—'}</div>
        <div className="text-sm text-white/70 tabular-nums">
          {uhr(s.start)} – {s.ende ? uhr(s.ende) : 'läuft'} · Pause {hm(pauseMs(s))}
        </div>
        {notiz && <div className="text-sm text-white/60 truncate">{notiz}</div>}
        {s.pausePruefen ? <div className="text-xs text-amber-300">Pause prüfen</div> : s.pauseAuto != null && s.pauseMin != null ? <div className="text-xs text-amber-300/90">Pause ergänzt (Arbeitsgesetz)</div> : null}
      </div>
      <div className="shrink-0 text-lg font-bold tabular-nums">{hm(arbeitMs(s))} h</div>
      <ChevronRight className="w-4 h-4 text-white/50 shrink-0" />
    </button>
  )
}
