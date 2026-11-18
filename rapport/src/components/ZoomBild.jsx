import { useRef, useState } from 'react'

/**
 * Bild mit Zoom: zwei Finger auseinander/zusammen, Doppeltipp = 3× an der Stelle bzw. zurück,
 * ein Finger verschiebt das vergrösserte Bild. Ohne Bibliothek, über Pointer-Events.
 */
export default function ZoomBild({ src, alt = '', className = '' }) {
  const box = useRef(null)
  const zeiger = useRef(new Map())
  const start = useRef(null)
  const letzterTipp = useRef(0)
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const tRef = useRef(t)
  const setze = (n) => {
    // nicht über den Rand hinaus schieben
    const r = box.current.getBoundingClientRect()
    const maxX = (r.width * (n.s - 1)) / 2, maxY = (r.height * (n.s - 1)) / 2
    const k = { s: n.s, x: Math.max(-maxX, Math.min(maxX, n.x)), y: Math.max(-maxY, Math.min(maxY, n.y)) }
    tRef.current = k; setT(k)
  }
  const mitte = () => { const p = [...zeiger.current.values()]; return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) } }
  // Punkt im Rahmen (Mitte = 0) → mit Zoom um diesen Punkt
  const rel = (cx, cy) => { const r = box.current.getBoundingClientRect(); return { x: cx - r.left - r.width / 2, y: cy - r.top - r.height / 2 } }
  const zoomUm = (alt, s, p) => ({ s, x: p.x - (p.x - alt.x) * (s / alt.s), y: p.y - (p.y - alt.y) * (s / alt.s) })

  const runter = (e) => {
    box.current.setPointerCapture?.(e.pointerId)
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zeiger.current.size === 2) { const m = mitte(); start.current = { ...m, t: tRef.current } }
    else if (zeiger.current.size === 1) {
      const jetzt = Date.now()
      if (jetzt - letzterTipp.current < 300) { // Doppeltipp
        const p = rel(e.clientX, e.clientY)
        setze(tRef.current.s > 1.2 ? { s: 1, x: 0, y: 0 } : zoomUm(tRef.current, 3, p))
        letzterTipp.current = 0; start.current = null; return
      }
      letzterTipp.current = jetzt
      start.current = { x: e.clientX, y: e.clientY, t: tRef.current }
    }
  }
  const bewegen = (e) => {
    if (!zeiger.current.has(e.pointerId) || !start.current) return
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const st = start.current
    if (zeiger.current.size === 2 && st.d) {
      const m = mitte()
      const s = Math.max(1, Math.min(6, st.t.s * (m.d / st.d)))
      const p0 = rel(st.x, st.y), p1 = rel(m.x, m.y)
      const z = zoomUm(st.t, s, p0)
      setze({ s, x: z.x + (p1.x - p0.x), y: z.y + (p1.y - p0.y) })
    } else if (zeiger.current.size === 1 && st.t.s > 1) {
      setze({ ...st.t, x: st.t.x + e.clientX - st.x, y: st.t.y + e.clientY - st.y })
    }
  }
  const hoch = (e) => {
    zeiger.current.delete(e.pointerId)
    if (zeiger.current.size === 1) { const [p] = zeiger.current.values(); start.current = { x: p.x, y: p.y, t: tRef.current } }
    else if (!zeiger.current.size) start.current = null
  }
  return (
    <div ref={box} className={'relative w-full h-full overflow-hidden touch-none select-none flex items-center justify-center ' + className}
      onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch} onWheel={(e) => setze(zoomUm(tRef.current, Math.max(1, Math.min(6, tRef.current.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2))), rel(e.clientX, e.clientY)))}>
      <img src={src} alt={alt} draggable={false} className="max-w-full max-h-full object-contain rounded-lg bg-white pointer-events-none"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transformOrigin: 'center center' }} />
      {t.s > 1.05
        ? <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setze({ s: 1, x: 0, y: 0 })} className="absolute top-2 right-2 rounded-full bg-black/75 px-3 py-1.5 text-xs text-white">{t.s.toFixed(1)}× · zurück</button>
        : <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white/85 pointer-events-none">Zoomen: 2 Finger oder Doppeltipp</span>}
    </div>
  )
}
