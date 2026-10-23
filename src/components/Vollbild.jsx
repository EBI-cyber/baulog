import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut } from 'lucide-react'

// Bild im Vollbild ansehen: mit zwei Fingern zoomen, mit einem verschieben, Doppeltipp = Zoom an/aus
// markierung = { x, y, w, h } (Anteile 0–1): Stelle gelb hervorheben und dorthin zoomen
export default function Vollbild({ src, onClose, markierung, titel }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const zeiger = useRef(new Map()), start = useRef(null), letzterTipp = useRef(0)

  const begrenzt = (s) => Math.max(1, Math.min(6, s))
  const runter = (ev) => {
    ev.currentTarget.setPointerCapture?.(ev.pointerId)
    zeiger.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    const p = [...zeiger.current.values()]
    if (p.length === 1) {
      const jetzt = Date.now()
      if (jetzt - letzterTipp.current < 300) setT((a) => (a.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }))
      letzterTipp.current = jetzt
    }
    start.current = { t: { ...t }, p, abstand: p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 }
  }
  const bewegen = (ev) => {
    if (!zeiger.current.has(ev.pointerId) || !start.current) return
    zeiger.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    const p = [...zeiger.current.values()], st = start.current
    if (p.length === 2 && st.p.length === 2) {
      const a = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
      const mx = (p[0].x + p[1].x) / 2 - (st.p[0].x + st.p[1].x) / 2, my = (p[0].y + p[1].y) / 2 - (st.p[0].y + st.p[1].y) / 2
      setT({ s: begrenzt(st.t.s * (a / Math.max(1, st.abstand))), x: st.t.x + mx, y: st.t.y + my })
    } else if (p.length === 1 && st.p.length === 1) {
      setT({ ...st.t, x: st.t.x + p[0].x - st.p[0].x, y: st.t.y + p[0].y - st.p[0].y })
    }
  }
  const hoch = (ev) => {
    zeiger.current.delete(ev.pointerId)
    const p = [...zeiger.current.values()]
    start.current = p.length ? { t: { ...t }, p, abstand: 0 } : null
    if (t.s <= 1.02) setT({ s: 1, x: 0, y: 0 })
  }

  // per Portal an <body>, weil „fixed“ in Glas-Fenstern (backdrop-filter) sonst nur das Fenster füllt
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden touch-none select-none"
      onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}
      // Klicks nicht an darunterliegende Fenster weiterreichen (React leitet Ereignisse auch durch Portale weiter)
      onClick={(e) => e.stopPropagation()}
      onWheel={(ev) => setT((a) => ({ ...a, s: begrenzt(a.s * (ev.deltaY < 0 ? 1.15 : 0.87)) }))}>
      <div className="relative pointer-events-none" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transformOrigin: 'center center' }}>
        <img src={src} alt="" draggable={false} className="block max-w-[100vw] max-h-[100dvh]"
          onLoad={(ev) => {
            if (!markierung) return
            // auf die markierte Stelle zoomen
            const w = ev.currentTarget.clientWidth, h = ev.currentTarget.clientHeight, s = 2.2
            const cx = markierung.x + markierung.w / 2, cy = markierung.y + markierung.h / 2
            setT({ s, x: (0.5 - cx) * w * s, y: (0.5 - cy) * h * s })
          }} />
        {markierung && (
          <div className="absolute rounded-sm" style={{
            left: (markierung.x * 100) + '%', top: (markierung.y * 100) + '%', width: (markierung.w * 100) + '%', height: (markierung.h * 100) + '%',
            background: 'rgba(250, 204, 21, 0.38)', outline: '2px solid rgba(234, 179, 8, 0.95)', mixBlendMode: 'multiply',
          }} />
        )}
      </div>
      {titel && <div className="absolute top-4 left-4 right-44 text-white text-sm font-semibold pointer-events-none">{titel}</div>}
      <div className="absolute top-3 right-3 flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => setT((a) => ({ ...a, s: begrenzt(a.s * 1.5) }))} className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center"><ZoomIn className="w-5 h-5" /></button>
        <button onClick={() => setT((a) => (a.s / 1.5 <= 1 ? { s: 1, x: 0, y: 0 } : { ...a, s: a.s / 1.5 }))} className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center"><ZoomOut className="w-5 h-5" /></button>
        <button onClick={onClose} className="w-11 h-11 rounded-full btn-grad flex items-center justify-center"><X className="w-5 h-5" /></button>
      </div>
      <div className="absolute bottom-4 left-0 right-0 text-center text-white/60 text-xs pointer-events-none">Mit zwei Fingern zoomen · Doppeltippen</div>
    </div>,
    document.body,
  )
}
