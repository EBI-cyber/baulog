import { useRef, useState } from 'react'
import { Camera, ImagePlus, ScanLine, RotateCcw, X, Plus } from 'lucide-react'
import { ladeBild, dateiAlsDataUrl, verkleinern, entzerren, verbessern, eckenFinden } from '../lib/scan'
import { belegLesen } from '../lib/ai'
import { parseBetrag } from '../lib/abrechnung'

const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

// Viereck leicht zur Mitte einrücken, damit kein Untergrund am Rand stehen bleibt
function einruecken(ecken, anteil) {
  const mx = ecken.reduce((a, p) => a + p.x, 0) / 4, my = ecken.reduce((a, p) => a + p.y, 0) / 4
  return ecken.map((p) => ({ x: p.x + (mx - p.x) * anteil, y: p.y + (my - p.y) * anteil }))
}

// Beleg fotografieren → Ecken finden → nachziehen (Ecken oder ganze Kanten) → entzerren →
// KI liest Lieferant, Datum, Betrag und die einzelnen Positionen mit Gewerk → speichern
export default function BelegScanner({ gewerke, onFertig, onAbbrechen }) {
  const [quelle, setQuelle] = useState(null) // Canvas des verkleinerten Fotos
  const [vorschau, setVorschau] = useState('')
  const [ecken, setEcken] = useState(null)
  const [ki, setKi] = useState(null) // { lieferant, datum, betrag, positionen }
  const [ergebnis, setErgebnis] = useState('')
  const [busy, setBusy] = useState('')
  const kamera = useRef(null), galerie = useRef(null), bild = useRef(null), svg = useRef(null)
  // Ziehen ohne React-Neuzeichnen: Positionen in einer Ref, SVG direkt aktualisieren
  const live = useRef(null), griff = useRef(null)
  const inp = 'w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 outline-none focus:border-amber'

  const laden = async (ev) => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = ''
    if (!f) return
    setBusy('Lade Foto …')
    try {
      const c = verkleinern(await ladeBild(await dateiAlsDataUrl(f)), 1600)
      const W = c.width, H = c.height
      const gefunden = eckenFinden(c)
      setQuelle(c); setVorschau(c.toDataURL('image/jpeg', 0.85)); setErgebnis(''); setKi(null)
      setEcken(gefunden ? einruecken(gefunden, 0.012) : [{ x: W * 0.05, y: H * 0.05 }, { x: W * 0.95, y: H * 0.05 }, { x: W * 0.95, y: H * 0.95 }, { x: W * 0.05, y: H * 0.95 }])
      setBusy('KI liest den Beleg …')
      try {
        const k = await belegLesen(c.toDataURL('image/jpeg', 0.8), gewerke)
        if (!gefunden && Array.isArray(k.ecken) && k.ecken.length === 4 && k.ecken.every((p) => p && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) {
          setEcken(einruecken(k.ecken.map((p) => ({ x: p.x * W, y: p.y * H })), 0.01))
        }
        setKi({
          lieferant: k.lieferant || '', datum: /^\d{4}-\d{2}-\d{2}$/.test(k.datum || '') ? k.datum : '',
          betrag: k.betrag != null ? String(k.betrag).replace('.', ',') : '',
          positionen: (Array.isArray(k.positionen) ? k.positionen : []).filter((p) => p && p.bezeichnung)
            .map((p) => ({ bezeichnung: String(p.bezeichnung), menge: Number(p.menge) || 1, gesamt: String(p.gesamt ?? '').replace('.', ','), gewerk: gewerke.includes(p.gewerk) ? p.gewerk : (gewerke.includes(k.gewerk) ? k.gewerk : gewerke[0]) })),
        })
      } catch (err) {
        setKi({ lieferant: '', datum: '', betrag: '', positionen: [] })
        alert('KI konnte den Beleg nicht lesen: ' + (err && err.message ? err.message : err) + '\nDu kannst die Angaben selbst eintragen.')
      }
    } catch (err) { alert(err && err.message ? err.message : String(err)) }
    setBusy('')
  }

  // Zeigerposition → Bildpixel
  const punkt = (ev) => {
    const r = bild.current.getBoundingClientRect()
    return { x: Math.max(0, Math.min(quelle.width, ((ev.clientX - r.left) / r.width) * quelle.width)), y: Math.max(0, Math.min(quelle.height, ((ev.clientY - r.top) / r.height) * quelle.height)) }
  }
  const mitte = (e, i) => ({ x: (e[i].x + e[(i + 1) % 4].x) / 2, y: (e[i].y + e[(i + 1) % 4].y) / 2 })
  // Griffe: 0–3 Ecken, 4–7 Kantenmitten (Kante i verbindet Ecke i und i+1)
  const griffe = (e) => [...e, ...[0, 1, 2, 3].map((i) => mitte(e, i))]
  const zeichne = (e) => {
    const s = svg.current; if (!s) return
    s.querySelector('polygon').setAttribute('points', e.map((p) => p.x + ',' + p.y).join(' '))
    griffe(e).forEach((p, i) => { const c = s.querySelector('[data-g="' + i + '"]'); c.setAttribute('cx', p.x); c.setAttribute('cy', p.y) })
  }
  const runter = (ev) => {
    const p = punkt(ev), g = griffe(ecken)
    let best = 0
    g.forEach((q, i) => { if (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(g[best].x - p.x, g[best].y - p.y)) best = i })
    ev.currentTarget.setPointerCapture?.(ev.pointerId)
    live.current = ecken.map((q) => ({ ...q }))
    griff.current = { i: best, start: p, basis: ecken.map((q) => ({ ...q })) }
  }
  const bewegen = (ev) => {
    const gr = griff.current; if (!gr) return
    const p = punkt(ev)
    const e = gr.basis.map((q) => ({ ...q }))
    if (gr.i < 4) e[gr.i] = p
    else {
      // Kante einrücken: beide Endpunkte um dieselbe Strecke verschieben
      const dx = p.x - gr.start.x, dy = p.y - gr.start.y, a = gr.i - 4, b = (a + 1) % 4
      e[a] = { x: e[a].x + dx, y: e[a].y + dy }; e[b] = { x: e[b].x + dx, y: e[b].y + dy }
    }
    live.current = e
    zeichne(e)
  }
  const hoch = () => { if (griff.current) { setEcken(live.current); griff.current = null } }

  const zuschneiden = () => {
    setBusy('Schneide zu …')
    setTimeout(() => {
      try { setErgebnis(verbessern(entzerren(quelle, ecken, 1400)).toDataURL('image/jpeg', 0.75)) }
      catch (err) { alert('Zuschneiden fehlgeschlagen: ' + (err && err.message ? err.message : err)) }
      setBusy('')
    }, 30)
  }
  const setPos = (i, patch) => setKi((k) => ({ ...k, positionen: k.positionen.map((p, j) => (j === i ? { ...p, ...patch } : p)) }))
  const fertig = () => {
    const betrag = parseBetrag(ki.betrag)
    if (Number.isNaN(betrag) || betrag <= 0) { alert('Bitte den Gesamtbetrag des Belegs eintragen, z. B. 127,53.'); return }
    const positionen = ki.positionen.map((p) => ({ ...p, gesamt: parseBetrag(p.gesamt) })).filter((p) => p.bezeichnung.trim() && Number.isFinite(p.gesamt) && p.gesamt > 0)
    onFertig({ dataUrl: ergebnis, lieferant: ki.lieferant.trim(), datum: ki.datum, betrag, positionen })
  }

  if (!quelle) {
    return (
      <div className="space-y-2">
        <div className="text-white/75 text-xs">Beleg flach auf einen dunkleren Untergrund legen und von oben fotografieren. Die App schneidet zu, die KI liest Lieferant, Datum, Positionen und Preise.</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => kamera.current.click()} disabled={!!busy} className="rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2"><Camera className="w-5 h-5" /> Foto aufnehmen</button>
          <button onClick={() => galerie.current.click()} disabled={!!busy} className="rounded-2xl py-3 font-semibold bg-white/10 inline-flex items-center justify-center gap-2"><ImagePlus className="w-5 h-5" /> Bild wählen</button>
        </div>
        <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={laden} />
        <input ref={galerie} type="file" accept="image/*" className="hidden" onChange={laden} />
        {busy && <div className="text-amber text-sm">{busy}</div>}
        {onAbbrechen && <button onClick={onAbbrechen} className="w-full text-white/70 text-sm py-1">Zurück</button>}
      </div>
    )
  }

  const r = quelle.width / 30
  return (
    <div className="space-y-3">
      {!ergebnis ? (
        <>
          <div className="text-white/75 text-xs">Ecken oder Kantenmitten ziehen. Mit den Kanten rückst du eine ganze Seite ein, damit kein Untergrund stehen bleibt.</div>
          <div className="relative select-none touch-none" onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}>
            <img ref={bild} src={vorschau} alt="" className="w-full rounded-xl pointer-events-none" draggable={false} />
            {ecken && (
              <svg ref={svg} viewBox={'0 0 ' + quelle.width + ' ' + quelle.height} className="absolute inset-0 w-full h-full pointer-events-none">
                <polygon points={ecken.map((p) => p.x + ',' + p.y).join(' ')} fill="rgba(245,158,11,0.15)" stroke="#f59e0b" strokeWidth={quelle.width / 200} />
                {griffe(ecken).map((p, i) => (
                  <circle key={i} data-g={i} cx={p.x} cy={p.y} r={i < 4 ? r : r * 0.65} fill={i < 4 ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.85)'} stroke={i < 4 ? '#fff' : '#f59e0b'} strokeWidth={quelle.width / 300} />
                ))}
              </svg>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setQuelle(null); setEcken(null); setKi(null) }} className="rounded-2xl py-2.5 bg-white/10 inline-flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Neues Foto</button>
            <button onClick={zuschneiden} disabled={!!busy} className="rounded-2xl py-2.5 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><ScanLine className="w-4 h-4" /> Zuschneiden</button>
          </div>
        </>
      ) : (
        <>
          <img src={ergebnis} alt="Beleg" className="w-full max-h-[45dvh] object-contain rounded-xl bg-white" />
          <button onClick={() => setErgebnis('')} className="text-amber text-xs">Zuschnitt ändern</button>
          {!ki ? <div className="text-amber text-sm">KI liest den Beleg …</div> : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={ki.lieferant} onChange={(e) => setKi({ ...ki, lieferant: e.target.value })} placeholder="Lieferant" className={inp} />
                <input type="date" value={ki.datum} onChange={(e) => setKi({ ...ki, datum: e.target.value })} className={inp} />
              </div>
              <div className="text-white/80 text-sm font-semibold pt-1">Positionen</div>
              {ki.positionen.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  <input value={p.bezeichnung} onChange={(e) => setPos(i, { bezeichnung: e.target.value })} className={inp + ' flex-1 min-w-[10rem] py-1.5 text-sm'} />
                  <select value={p.gewerk} onChange={(e) => setPos(i, { gewerk: e.target.value })} className="bg-white/10 border border-white/20 rounded-lg px-1.5 py-1.5 text-xs max-w-[7.5rem]">
                    {gewerke.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input value={p.gesamt} onChange={(e) => setPos(i, { gesamt: e.target.value })} inputMode="decimal" className="w-20 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-right" />
                  <button onClick={() => setKi({ ...ki, positionen: ki.positionen.filter((_, j) => j !== i) })} className="text-white/60 hover:text-ember p-1"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => setKi({ ...ki, positionen: [...ki.positionen, { bezeichnung: '', menge: 1, gesamt: '', gewerk: gewerke[0] }] })} className="text-amber text-xs inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Position hinzufügen</button>
              {(() => {
                const summe = ki.positionen.reduce((a, p) => a + (parseBetrag(p.gesamt) || 0), 0), betrag = parseBetrag(ki.betrag) || 0
                return Math.abs(summe - betrag) > 0.01 && ki.positionen.length ? <div className="text-amber text-xs">Positionen ergeben {eur(summe)}, Beleg {eur(betrag)}. Die Differenz wird als eigene Zeile übernommen.</div> : null
              })()}
              <div className="flex items-center gap-2">
                <span className="text-white/80 text-sm shrink-0">Gesamt brutto €</span>
                <input value={ki.betrag} onChange={(e) => setKi({ ...ki, betrag: e.target.value })} inputMode="decimal" className={inp} />
              </div>
              <button onClick={fertig} className="w-full rounded-2xl py-3 font-bold btn-grad">Beleg speichern</button>
            </div>
          )}
        </>
      )}
      {busy && <div className="text-amber text-sm">{busy}</div>}
    </div>
  )
}
