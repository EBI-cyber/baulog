import { HelpCircle } from 'lucide-react'
import Sheet from './Sheet'
import { chf } from '../lib/lohn'

/** Erklärung einer Lohn-Zahl: was ist das, Rechnung mit den echten Zahlen, Grundlage */
export default function LohnDetailSheet({ d, w, onClose }) {
  if (!d) return null
  const F = d.fmt || ((n) => chf(n, w))
  return (
    <Sheet titel={d.titel} icon={HelpCircle} onClose={onClose}>
      <div className="space-y-4">
        <div className={'text-4xl font-extrabold tabular-nums ' + (d.betrag < 0 ? 'text-rose-300' : 'grad-text')}>{d.betrag < 0 ? '− ' : ''}{F(Math.abs(d.betrag || 0))}</div>
        {d.was && <div><div className="text-xs uppercase tracking-wider text-white/55 mb-1">Was ist das?</div><div className="text-sm text-white/85">{d.was}</div></div>}
        {d.rechnung?.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-white/55 mb-1">So wird gerechnet</div>
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-3 py-1">
              {d.rechnung.map(([t, b, fett], i) => (
                <div key={i} className={'flex items-baseline justify-between gap-3 py-1.5 text-sm ' + (fett ? 'font-bold border-t border-white/10' : '')}>
                  <span className={'min-w-0 ' + (fett ? '' : 'text-white/80')}>{t}</span>
                  {b !== undefined && b !== null && <span className={'shrink-0 tabular-nums ' + (b < 0 ? 'text-rose-300' : '')}>{b < 0 ? '− ' : ''}{F(Math.abs(b))}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {d.grundlage && <div><div className="text-xs uppercase tracking-wider text-white/55 mb-1">Grundlage</div><div className="text-sm text-white/75">{d.grundlage}</div></div>}
        {d.hinweis && <div className="text-sm rounded-2xl px-3 py-2 bg-sky-400/10 border border-sky-400/30 text-sky-200">{d.hinweis}</div>}
        {!d.fmt && <div className="text-xs text-white/55">Schätzung der App — massgebend ist die Abrechnung des Temporärbüros.</div>}
      </div>
    </Sheet>
  )
}
