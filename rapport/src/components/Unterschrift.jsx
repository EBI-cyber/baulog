import { useEffect, useRef, useState } from 'react'
import { Eraser, PenLine } from 'lucide-react'

/**
 * Unterschriftsfeld (Finger/Stift). Auf dem Bildschirm hell, exportiert wird dunkelblaue
 * „Tinte" auf transparentem Grund, zugeschnitten — passt so direkt ins PDF.
 * wert: PNG-DataURL | null, onChange(dataUrl | null)
 */
export default function Unterschrift({ wert, onChange, hoehe = 170 }) {
  const box = useRef(), canvas = useRef()
  const striche = useRef([])
  const [neu, setNeu] = useState(!wert)
  const [leer, setLeer] = useState(true)

  function zeichnen() {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = box.current.clientWidth
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hoehe * dpr) }
    const ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, hoehe)
    ctx.strokeStyle = '#eaf6f8'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const s of striche.current) {
      ctx.beginPath()
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y)
      ctx.stroke()
    }
  }
  useEffect(() => { if (neu) zeichnen() }) // eslint-disable-line react-hooks/exhaustive-deps
  // Wert kommt von aussen (z.B. gespeicherte Unterschrift geladen) → als Bild zeigen, solange nicht gezeichnet wird
  useEffect(() => { if (wert && !striche.current.length) setNeu(false) }, [wert])

  function exportieren() {
    const pts = striche.current.flat()
    if (!pts.length) return null
    const pad = 6, s = 3
    const minX = Math.min(...pts.map((p) => p.x)) - pad, minY = Math.min(...pts.map((p) => p.y)) - pad
    const maxX = Math.max(...pts.map((p) => p.x)) + pad, maxY = Math.max(...pts.map((p) => p.y)) + pad
    const c = document.createElement('canvas')
    c.width = Math.ceil((maxX - minX) * s); c.height = Math.ceil((maxY - minY) * s)
    const ctx = c.getContext('2d')
    ctx.scale(s, s); ctx.translate(-minX, -minY)
    ctx.strokeStyle = '#13235c'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const st of striche.current) {
      ctx.beginPath(); st.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      if (st.length === 1) ctx.lineTo(st[0].x + 0.1, st[0].y)
      ctx.stroke()
    }
    return c.toDataURL('image/png')
  }

  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e) => { e.preventDefault(); canvas.current.setPointerCapture(e.pointerId); striche.current.push([pos(e)]); setLeer(false); zeichnen() }
  const move = (e) => { if (!e.buttons && e.pointerType === 'mouse') return; const s = striche.current.at(-1); if (!s || !canvas.current.hasPointerCapture(e.pointerId)) return; s.push(pos(e)); zeichnen() }
  const up = () => onChange(exportieren())
  const loeschen = () => { striche.current = []; setLeer(true); zeichnen(); onChange(null) }

  if (!neu && wert) {
    return (
      <div className="rounded-2xl bg-white p-2 flex items-center gap-3">
        <img src={wert} alt="Unterschrift" className="h-16 max-w-[70%] object-contain" />
        <button type="button" onClick={() => { striche.current = []; setLeer(true); setNeu(true); onChange(null) }}
          className="ml-auto text-xs text-slate-500 inline-flex items-center gap-1 px-2 py-1"><PenLine className="w-3.5 h-3.5" /> Neu</button>
      </div>
    )
  }
  return (
    <div ref={box} className="relative rounded-2xl border border-dashed border-white/25 bg-white/[0.04] select-none" style={{ height: hoehe, touchAction: 'none' }}>
      <canvas ref={canvas} style={{ width: '100%', height: hoehe, touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {leer && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/30">Hier mit dem Finger unterschreiben</div>}
      <div className="pointer-events-none absolute left-4 right-4 bottom-8 border-b border-white/15" />
      {!leer && <button type="button" onClick={loeschen} className="absolute top-2 right-2 rounded-lg bg-black/40 px-2 py-1 text-xs text-white/70 inline-flex items-center gap-1">
        <Eraser className="w-3.5 h-3.5" /> Löschen</button>}
    </div>
  )
}
