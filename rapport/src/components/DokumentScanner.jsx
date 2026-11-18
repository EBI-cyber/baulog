import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ScanLine, RotateCw, Crop, Check, Loader2 } from 'lucide-react'
import { ladeBild, verkleinern, entzerren, verbessern, eckenFinden, dokumentFilter, schaerfen, graustufen, drehen, kopie } from '../lib/scan'

const LUPE = 110
const FILTER = [['dokument', 'Dokument'], ['farbe', 'Farbe'], ['grau', 'Graustufen'], ['original', 'Original']]

// Viereck leicht zur Mitte einrücken, damit kein Untergrund am Rand stehen bleibt
function einruecken(ecken, anteil) {
  const mx = ecken.reduce((a, p) => a + p.x, 0) / 4, my = ecken.reduce((a, p) => a + p.y, 0) / 4
  return ecken.map((p) => ({ x: p.x + (mx - p.x) * anteil, y: p.y + (my - p.y) * anteil }))
}

/**
 * Foto zu Dokument verarbeiten (wie der Beleg-Scanner in BauLog): Ecken automatisch finden und nachziehen
 * (Ecken oder Kantenmitten, Lupe), perspektivisch entzerren (glätten), Filter Dokument / Farbe / Graustufen /
 * Original, schärfen, drehen. Ergebnis als JPEG-DataURL über onFertig.
 */
export default function DokumentScanner({ datei, onFertig, onAbbrechen, titel = 'Rapport zuschneiden' }) {
  const [quelle, setQuelle] = useState(null) // Vorschau-Canvas (max 1400 px)
  const [vorschau, setVorschau] = useState('')
  const [ecken, setEcken] = useState(null)
  const [schritt, setSchritt] = useState('ecken') // ecken | filter
  const [filter, setFilter] = useState('dokument')
  const [scharf, setScharf] = useState(true)
  const [ergebnis, setErgebnis] = useState('')
  const [busy, setBusy] = useState('')
  const [bildMass, setBildMass] = useState(null)
  const voll = useRef(null) // Foto in voller Auflösung (bis 3000 px)
  const roh = useRef(null) // entzerrtes Canvas
  const bild = useRef(null), svg = useRef(null), lupe = useRef(null), flaeche = useRef(null)
  const griff = useRef(null), live = useRef(null)

  useEffect(() => {
    let aktiv = true
    ;(async () => {
      const url = URL.createObjectURL(datei)
      try {
        const img = await ladeBild(url)
        if (!aktiv) return
        voll.current = verkleinern(img, 3000)
        const c = verkleinern(img, 1400)
        const W = c.width, H = c.height
        const gefunden = eckenFinden(c)
        setQuelle(c); setVorschau(c.toDataURL('image/jpeg', 0.85))
        setEcken(gefunden ? einruecken(gefunden, 0.01) : [{ x: W * 0.04, y: H * 0.04 }, { x: W * 0.96, y: H * 0.04 }, { x: W * 0.96, y: H * 0.96 }, { x: W * 0.04, y: H * 0.96 }])
      } catch { onAbbrechen?.() } finally { URL.revokeObjectURL(url) }
    })()
    return () => { aktiv = false }
  }, [datei]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bild in die freie Fläche einpassen
  useEffect(() => {
    if (!quelle || schritt !== 'ecken') return
    // Innenmass der Fläche (ohne Padding), Bild genau im Seitenverhältnis des Fotos – sonst würde das Bild
    // gestreckt, die Linien aber nicht, und Linie und Zuschnitt lägen versetzt
    const f = flaeche.current; if (!f) return
    const passen = () => {
      const cs = getComputedStyle(f)
      const fw = f.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const fh = f.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const s = Math.min(fw / quelle.width, fh / quelle.height)
      if (s > 0) setBildMass({ w: Math.floor(quelle.width * s), h: Math.floor(quelle.height * s) })
    }
    passen()
    const ro = new ResizeObserver(passen); ro.observe(f)
    return () => ro.disconnect()
  }, [quelle, schritt])

  // Zeigerposition → Bildpixel
  const punkt = (ev) => {
    const r = bild.current.getBoundingClientRect()
    return { x: Math.max(0, Math.min(quelle.width, ((ev.clientX - r.left) / r.width) * quelle.width)), y: Math.max(0, Math.min(quelle.height, ((ev.clientY - r.top) / r.height) * quelle.height)) }
  }
  const mitte = (e, i) => ({ x: (e[i].x + e[(i + 1) % 4].x) / 2, y: (e[i].y + e[(i + 1) % 4].y) / 2 })
  const griffe = (e) => [...e, ...[0, 1, 2, 3].map((i) => mitte(e, i))]
  const zeichne = (e) => {
    const s = svg.current; if (!s) return
    s.querySelector('polygon').setAttribute('points', e.map((p) => p.x + ',' + p.y).join(' '))
    griffe(e).forEach((p, i) => { const c = s.querySelector('[data-g="' + i + '"]'); c.setAttribute('cx', p.x); c.setAttribute('cy', p.y) })
  }
  const lupeZeigen = (p) => {
    const l = lupe.current, b = bild.current; if (!l || !b) return
    const r = b.getBoundingClientRect(), f = r.width / quelle.width, z = 2.5
    const x = p.x * f, y = p.y * f
    l.style.display = 'block'
    l.style.left = Math.max(0, Math.min(r.width - LUPE, x - LUPE / 2)) + 'px'
    l.style.top = (y > LUPE * 1.4 ? y - LUPE * 1.3 : y + LUPE * 0.3) + 'px'
    l.style.backgroundSize = r.width * z + 'px ' + r.height * z + 'px'
    l.style.backgroundPosition = (LUPE / 2 - x * z) + 'px ' + (LUPE / 2 - y * z) + 'px'
  }
  const lupeAus = () => { if (lupe.current) lupe.current.style.display = 'none' }
  const runter = (ev) => {
    const p = punkt(ev), g = griffe(ecken)
    let best = 0
    g.forEach((q, i) => { if (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(g[best].x - p.x, g[best].y - p.y)) best = i })
    ev.currentTarget.setPointerCapture?.(ev.pointerId)
    live.current = ecken.map((q) => ({ ...q }))
    griff.current = { i: best, start: p, basis: ecken.map((q) => ({ ...q })) }
    lupeZeigen(g[best])
  }
  const bewegen = (ev) => {
    const gr = griff.current; if (!gr) return
    const p = punkt(ev)
    const e = gr.basis.map((q) => ({ ...q }))
    // halbe Fingerbewegung: genauer, und die Ecke springt nicht unter den Finger
    if (gr.i < 4) e[gr.i] = { x: Math.max(0, Math.min(quelle.width, gr.basis[gr.i].x + (p.x - gr.start.x) * 0.5)), y: Math.max(0, Math.min(quelle.height, gr.basis[gr.i].y + (p.y - gr.start.y) * 0.5)) }
    else {
      // Kante nur senkrecht zu sich selbst verschieben
      const a = gr.i - 4, b = (a + 1) % 4
      const lx = e[b].x - e[a].x, ly = e[b].y - e[a].y, len = Math.hypot(lx, ly) || 1
      const nx = -ly / len, ny = lx / len
      const weg = ((p.x - gr.start.x) * nx + (p.y - gr.start.y) * ny) * 0.5
      e[a] = { x: e[a].x + nx * weg, y: e[a].y + ny * weg }; e[b] = { x: e[b].x + nx * weg, y: e[b].y + ny * weg }
    }
    live.current = e
    zeichne(e)
    lupeZeigen(gr.i < 4 ? e[gr.i] : mitte(e, gr.i - 4))
  }
  const hoch = () => { lupeAus(); if (griff.current) { setEcken(live.current); griff.current = null } }

  const anwenden = (f = filter, s = scharf) => {
    if (!roh.current) return
    const c = kopie(roh.current)
    if (f === 'dokument') dokumentFilter(c)
    else if (f === 'farbe') verbessern(c)
    else if (f === 'grau') graustufen(c)
    if (s && f !== 'original') schaerfen(c, f === 'dokument' ? 0.5 : 0.8)
    setErgebnis(c.toDataURL('image/jpeg', 0.88))
  }
  const zuschneiden = () => {
    setBusy('Wird entzerrt …')
    setTimeout(() => {
      try {
        const f = voll.current.width / quelle.width
        roh.current = entzerren(voll.current, ecken.map((p) => ({ x: p.x * f, y: p.y * f })), 2200)
        // Rapport ist quer (A4 quer): hochkant fotografiert → automatisch drehen
        if (roh.current.height > roh.current.width * 1.15) roh.current = drehen(roh.current)
        setSchritt('filter'); anwenden()
      } catch { /* Ecken ungültig */ }
      setBusy('')
    }, 30)
  }
  const waehle = (f) => { setFilter(f); setBusy('…'); setTimeout(() => { anwenden(f, scharf); setBusy('') }, 20) }
  const schaerfeUm = () => { const s = !scharf; setScharf(s); setBusy('…'); setTimeout(() => { anwenden(filter, s); setBusy('') }, 20) }
  const dreh = () => { roh.current = drehen(roh.current); anwenden() }

  const r = quelle ? quelle.width / 30 : 10
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black flex flex-col text-white">
      <div className="flex items-center gap-2 px-3 pb-2" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{schritt === 'ecken' ? titel : 'Als Dokument'}</div>
          <div className="text-white/65 text-xs leading-tight">{schritt === 'ecken' ? 'Ecken oder Kantenmitten an den Rand des Blatts ziehen – die Lupe zeigt die Stelle.' : 'Filter wählen – „Dokument“ macht das Papier weiss und die Schrift schwarz.'}</div>
        </div>
        <button onClick={onAbbrechen} className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center shrink-0" aria-label="Abbrechen"><X className="w-5 h-5" /></button>
      </div>

      {schritt === 'ecken' ? <>
        <div ref={flaeche} className="flex-1 min-h-0 flex items-center justify-center px-2">
          {!quelle ? <Loader2 className="w-8 h-8 animate-spin text-white/60" /> :
            <div className="relative shrink-0 select-none touch-none" style={bildMass ? { width: bildMass.w, height: bildMass.h } : { visibility: 'hidden' }} onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}>
              <img ref={bild} src={vorschau} alt="" className="block w-full h-full pointer-events-none" draggable={false} />
              {ecken && <svg ref={svg} viewBox={'0 0 ' + quelle.width + ' ' + quelle.height} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                <polygon points={ecken.map((p) => p.x + ',' + p.y).join(' ')} fill="rgba(34,211,238,0.15)" stroke="#22d3ee" strokeWidth={quelle.width / 200} />
                {griffe(ecken).map((p, i) => (
                  <circle key={i} data-g={i} cx={p.x} cy={p.y} r={i < 4 ? r : r * 0.65} fill={i < 4 ? 'rgba(34,211,238,0.9)' : 'rgba(255,255,255,0.85)'} stroke={i < 4 ? '#fff' : '#22d3ee'} strokeWidth={quelle.width / 300} />
                ))}
              </svg>}
              <div ref={lupe} className="absolute pointer-events-none rounded-full border-2 border-aqua shadow-2xl overflow-hidden"
                style={{ display: 'none', width: LUPE, height: LUPE, backgroundImage: 'url(' + vorschau + ')', backgroundRepeat: 'no-repeat', backgroundColor: '#000' }}>
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-aqua/90" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-aqua/90" />
              </div>
            </div>}
        </div>
        <div className="p-3 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {busy && <div className="text-aqua text-sm text-center">{busy}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => quelle && setEcken([{ x: 0, y: 0 }, { x: quelle.width, y: 0 }, { x: quelle.width, y: quelle.height }, { x: 0, y: quelle.height }])} className="rounded-2xl py-3 bg-white/10 font-semibold">Ganzes Bild</button>
            <button onClick={zuschneiden} disabled={!ecken || !!busy} className="rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><ScanLine className="w-5 h-5" /> Zuschneiden</button>
          </div>
        </div>
      </> : <>
        <div className="flex-1 min-h-0 flex items-center justify-center p-2">
          {ergebnis ? <img src={ergebnis} alt="Dokument" className="max-w-full max-h-full object-contain rounded-lg bg-white" /> : <Loader2 className="w-8 h-8 animate-spin text-white/60" />}
        </div>
        <div className="p-3 space-y-2.5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="grid grid-cols-4 gap-1.5">
            {FILTER.map(([k, t]) => (
              <button key={k} onClick={() => waehle(k)} className={'rounded-xl py-2.5 text-sm font-semibold ' + (filter === k ? 'btn-grad' : 'bg-white/10 text-white/85')}>{t}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={() => setSchritt('ecken')} className="rounded-xl py-2.5 bg-white/10 text-sm inline-flex items-center justify-center gap-1.5"><Crop className="w-4 h-4" /> Zuschnitt</button>
            <button onClick={dreh} className="rounded-xl py-2.5 bg-white/10 text-sm inline-flex items-center justify-center gap-1.5"><RotateCw className="w-4 h-4" /> Drehen</button>
            <button onClick={schaerfeUm} disabled={filter === 'original'} className={'rounded-xl py-2.5 text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-40 ' + (scharf ? 'bg-aqua/20 border border-aqua/50 text-aqua' : 'bg-white/10')}>Schärfen {scharf ? 'an' : 'aus'}</button>
          </div>
          <button onClick={() => ergebnis && onFertig(ergebnis)} disabled={!ergebnis || !!busy} className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><Check className="w-5 h-5" /> Übernehmen</button>
        </div>
      </>}
    </div>,
    document.body,
  )
}
