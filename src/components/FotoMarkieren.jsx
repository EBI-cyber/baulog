import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Undo2, MoveUpRight, Pencil, Type, Circle } from 'lucide-react'

// Baustellenfoto markieren: Pfeile, Kreise, Freihand und Text in Signalfarben einzeichnen.
// Ergebnis ist das Foto mit den Markierungen als JPEG (onFertig(dataUrl)).
const FARBEN = ['#ef4444', '#f59e0b', '#22c55e', '#ffffff']
const WERKZEUGE = [['pfeil', MoveUpRight, 'Pfeil'], ['kreis', Circle, 'Kreis'], ['stift', Pencil, 'Stift'], ['text', Type, 'Text']]

export default function FotoMarkieren({ src, onFertig, onAbbrechen }) {
  const flaeche = useRef(null), leinwand = useRef(null)
  const [bild, setBild] = useState(null)
  const [mass, setMass] = useState(null)
  const [werkzeug, setWerkzeug] = useState('pfeil')
  const [farbe, setFarbe] = useState(FARBEN[0])
  const [striche, setStriche] = useState([]) // { art, farbe, punkte: [{x,y}] in Bildpixeln, text }
  const aktuell = useRef(null)
  const [textPos, setTextPos] = useState(null) // Stelle, an die der Text kommt
  const [textEingabe, setTextEingabe] = useState('')

  useEffect(() => { const i = new Image(); i.onload = () => setBild(i); i.src = src }, [src])
  // Anzeige so groß wie möglich
  useEffect(() => {
    const el = flaeche.current
    if (!el || !bild) return
    const messen = () => { const r = el.getBoundingClientRect(), f = Math.min((r.width - 16) / bild.width, (r.height - 8) / bild.height); setMass({ w: Math.round(bild.width * f), h: Math.round(bild.height * f), f }) }
    messen(); const ro = new ResizeObserver(messen); ro.observe(el); return () => ro.disconnect()
  }, [bild])

  const dicke = bild ? Math.max(4, Math.round(Math.max(bild.width, bild.height) / 160)) : 6
  const zeichnen = (ctx, s) => {
    ctx.strokeStyle = s.farbe; ctx.fillStyle = s.farbe; ctx.lineWidth = dicke; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const p = s.punkte, a = p[0], b = p[p.length - 1]
    if (s.art === 'stift') { ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke() }
    if (s.art === 'pfeil' && p.length > 1) {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      const w = Math.atan2(b.y - a.y, b.x - a.x), l = dicke * 4.5
      ctx.beginPath(); ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - l * Math.cos(w - 0.45), b.y - l * Math.sin(w - 0.45)); ctx.lineTo(b.x - l * Math.cos(w + 0.45), b.y - l * Math.sin(w + 0.45)); ctx.closePath(); ctx.fill()
    }
    if (s.art === 'kreis' && p.length > 1) { ctx.beginPath(); ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 + 1, Math.abs(b.y - a.y) / 2 + 1, 0, 0, Math.PI * 2); ctx.stroke() }
    if (s.art === 'text' && s.text) {
      const gr = dicke * 6
      ctx.font = 'bold ' + gr + 'px sans-serif'
      const w = ctx.measureText(s.text).width
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(a.x - gr * 0.25, a.y - gr, w + gr * 0.5, gr * 1.3)
      ctx.fillStyle = s.farbe; ctx.fillText(s.text, a.x, a.y)
    }
  }
  const neuZeichnen = (liste) => {
    const c = leinwand.current; if (!c || !bild) return
    const ctx = c.getContext('2d'); ctx.drawImage(bild, 0, 0)
    liste.forEach((s) => zeichnen(ctx, s))
  }
  useEffect(() => { neuZeichnen(aktuell.current ? [...striche, aktuell.current] : striche) }) // eslint-disable-line react-hooks/exhaustive-deps

  const punkt = (ev) => { const r = leinwand.current.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * bild.width, y: (ev.clientY - r.top) / r.height * bild.height } }
  const runter = (ev) => {
    ev.currentTarget.setPointerCapture?.(ev.pointerId)
    const p = punkt(ev)
    if (werkzeug === 'text') { setTextPos(p); setTextEingabe(''); return }
    aktuell.current = { art: werkzeug, farbe, punkte: [p] }
  }
  const bewegen = (ev) => {
    if (!aktuell.current) return
    const p = punkt(ev)
    if (aktuell.current.art === 'stift') aktuell.current.punkte.push(p)
    else aktuell.current.punkte = [aktuell.current.punkte[0], p]
    neuZeichnen([...striche, aktuell.current])
  }
  const hoch = () => { if (aktuell.current) { const s = aktuell.current; aktuell.current = null; if (s.punkte.length > 1) setStriche((l) => [...l, s]) } }
  const fertig = () => { neuZeichnen(striche); onFertig(leinwand.current.toDataURL('image/jpeg', 0.85)) }

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black flex flex-col text-white">
      <div className="flex items-center gap-2 p-3">
        <button onClick={onAbbrechen} className="p-2 rounded-full bg-white/10" title="Abbrechen"><X className="w-5 h-5" /></button>
        <div className="flex-1 font-semibold text-sm">Foto markieren</div>
        <button onClick={() => setStriche((l) => l.slice(0, -1))} disabled={!striche.length} className="p-2 rounded-full bg-white/10 disabled:opacity-40" title="Rückgängig"><Undo2 className="w-5 h-5" /></button>
        <button onClick={fertig} className="rounded-full px-4 py-2 btn-grad font-bold text-sm inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> Fertig</button>
      </div>
      <div ref={flaeche} className="flex-1 min-h-0 flex items-center justify-center px-2">
        {bild && <canvas ref={leinwand} width={bild.width} height={bild.height} className="touch-none rounded-lg" style={mass ? { width: mass.w, height: mass.h } : { visibility: 'hidden' }}
          onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch} />}
      </div>
      <div className="p-3 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {textPos && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (textEingabe.trim()) setStriche((l) => [...l, { art: 'text', farbe, punkte: [textPos], text: textEingabe.trim() }]); setTextPos(null) }}>
            <input autoFocus value={textEingabe} onChange={(e) => setTextEingabe(e.target.value)} placeholder="Text für das Foto" className="flex-1 bg-white/10 border border-amber/50 rounded-xl px-3 py-2 outline-none" />
            <button className="rounded-xl px-4 btn-grad font-bold text-sm">OK</button>
          </form>
        )}
        <div className="grid grid-cols-4 gap-2">
          {WERKZEUGE.map(([k, Icon, text]) => (
            <button key={k} onClick={() => setWerkzeug(k)} className={'rounded-2xl py-2 flex flex-col items-center gap-1 text-xs ' + (werkzeug === k ? 'btn-grad font-bold' : 'bg-white/10')}><Icon className="w-5 h-5" />{text}</button>
          ))}
        </div>
        <div className="flex justify-center gap-3">
          {FARBEN.map((f) => <button key={f} onClick={() => setFarbe(f)} className={'w-9 h-9 rounded-full border-2 ' + (farbe === f ? 'border-white scale-110' : 'border-white/30')} style={{ background: f }} title="Farbe" />)}
        </div>
      </div>
    </div>,
    document.body,
  )
}
