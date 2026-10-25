import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Kurze bebilderte Anleitung für den Video-Scan, Schritt für Schritt. Wird beim ersten Video-Scan automatisch
// gezeigt (siehe anleitungGesehen) und lässt sich im Scan über das Fragezeichen wieder öffnen.
const SCHLUESSEL = 'baulog.videoAnleitungGesehen'
export function anleitungGesehen() { try { return localStorage.getItem(SCHLUESSEL) === '1' } catch { return false } }
function merken() { try { localStorage.setItem(SCHLUESSEL, '1') } catch { /* dann eben beim nächsten Mal wieder */ } }

const SCHRITTE = [
  { titel: 'Beleg hinlegen', text: 'Beleg glatt auf einen dunklen Untergrund legen, z. B. eine schwarze Tüte oder einen dunklen Tisch. Die Taschenlampe geht automatisch an.', szene: 'liegen' },
  { titel: 'Oben anfangen', text: 'Handy waagerecht über den Anfang des Belegs halten. Der Beleg soll etwa zwei Drittel der Bildbreite füllen. Dann auf „Start“ tippen.', szene: 'oben' },
  { titel: 'Langsam nach unten ziehen', text: 'Handy ruhig und gleichmäßig nach unten führen. Die Leiste rechts im Bild wird grün, wo der Beleg schon erfasst ist.', szene: 'ziehen' },
  { titel: 'Bis über das Ende hinaus', text: 'Bis über das Ende des Belegs fahren, bis die Leiste ganz grün ist. Dann ist der Scan von selbst fertig. Bleibt eine Lücke, kurz zurückfahren.', szene: 'ende' },
]

// Zeichnung: dunkler Untergrund, langer Beleg, Handy-Rahmen und die grüne Leiste
function Szene({ art }) {
  const y = { liegen: null, oben: 18, ziehen: 'lauf', ende: 132 }[art]
  return (
    <svg viewBox="0 0 200 220" className="w-full h-48 rounded-2xl bg-neutral-900">
      <style>{`
        @keyframes vs-lauf { 0% { transform: translateY(18px) } 90%, 100% { transform: translateY(132px) } }
        @keyframes vs-gruen { 0% { height: 0 } 90%, 100% { height: 160px } }
        .vs-lauf { animation: vs-lauf 3.5s ease-in-out infinite }
        .vs-gruen { animation: vs-gruen 3.5s ease-in-out infinite }
      `}</style>
      {/* Beleg */}
      <rect x="70" y="20" width="60" height="180" rx="2" fill="#f8f8f4" />
      {Array.from({ length: 15 }, (_, i) => (
        <g key={i}><rect x="76" y={30 + i * 11} width={i % 3 ? 30 : 38} height="3" fill="#888" /><rect x="114" y={30 + i * 11} width="10" height="3" fill="#888" /></g>
      ))}
      {/* Leiste mit Fortschritt */}
      {y !== null && (
        <g>
          <rect x="166" y="30" width="14" height="160" rx="3" fill="#ffffff22" stroke="#ffffff66" />
          <rect x="166" y="30" width="14" rx="3" fill="#10b98199" className={y === 'lauf' ? 'vs-gruen' : ''} height={y === 'lauf' ? 0 : y === 132 ? 160 : 34} />
        </g>
      )}
      {/* Handy */}
      {y !== null && (
        <g className={y === 'lauf' ? 'vs-lauf' : ''} transform={y === 'lauf' ? undefined : `translate(0 ${y})`}>
          <rect x="52" y="-10" width="96" height="70" rx="8" fill="none" stroke="#f59e0b" strokeWidth="3" />
          <rect x="52" y="-10" width="96" height="70" rx="8" fill="#f59e0b14" />
          {y === 'lauf' && <path d="M100 66 l0 14 m-6 -6 l6 6 l6 -6" stroke="#f59e0b" strokeWidth="2.5" fill="none" />}
        </g>
      )}
      {art === 'liegen' && <text x="100" y="214" textAnchor="middle" fontSize="10" fill="#ffffffaa">dunkler Untergrund</text>}
    </svg>
  )
}

export default function VideoAnleitung({ onFertig }) {
  const [i, setI] = useState(0)
  const s = SCHRITTE[i], letzter = i === SCHRITTE.length - 1
  const schliessen = () => { merken(); onFertig() }
  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black/80 flex items-end md:items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <div className="glass w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/60">Video-Scan · Schritt {i + 1} von {SCHRITTE.length}</div>
          <button onClick={schliessen} className="p-1.5 rounded-full bg-white/10" title="Anleitung schließen"><X className="w-4 h-4" /></button>
        </div>
        <Szene art={s.szene} />
        <div className="text-lg font-bold">{s.titel}</div>
        <div className="text-white/80 text-sm">{s.text}</div>
        <div className="flex justify-center gap-1.5">{SCHRITTE.map((_, k) => <span key={k} className={'w-2 h-2 rounded-full ' + (k === i ? 'bg-amber' : 'bg-white/25')} />)}</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => (i ? setI(i - 1) : schliessen())} className="rounded-2xl py-2.5 bg-white/10 text-sm">{i ? 'Zurück' : 'Überspringen'}</button>
          <button onClick={() => (letzter ? schliessen() : setI(i + 1))} className="rounded-2xl py-2.5 font-bold btn-grad text-sm">{letzter ? 'Los geht’s' : 'Weiter'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
