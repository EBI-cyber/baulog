import { useRef, useState } from 'react'
import { Camera, ImagePlus, ScanLine, RotateCcw } from 'lucide-react'
import { ladeBild, dateiAlsDataUrl, verkleinern, entzerren, verbessern } from '../lib/scan'
import { belegLesen } from '../lib/ai'
import { parseBetrag } from '../lib/abrechnung'

// Beleg fotografieren → KI findet Ecken und liest Lieferant/Datum/Betrag → Ecken prüfen → entzerrt speichern
export default function BelegScanner({ onFertig, onAbbrechen }) {
  const [quelle, setQuelle] = useState(null) // Canvas des verkleinerten Fotos
  const [ecken, setEcken] = useState(null)
  const [daten, setDaten] = useState({ lieferant: '', datum: '', betrag: '', beschreibung: '' })
  const [ergebnis, setErgebnis] = useState('')
  const [busy, setBusy] = useState('')
  const [ziehe, setZiehe] = useState(-1)
  const kamera = useRef(null), galerie = useRef(null), bild = useRef(null)
  const inp = 'w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 outline-none focus:border-amber'

  const laden = async (ev) => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = ''
    if (!f) return
    setBusy('Lade Foto …')
    try {
      const c = verkleinern(await ladeBild(await dateiAlsDataUrl(f)), 1600)
      setQuelle(c); setErgebnis('')
      const W = c.width, H = c.height
      setEcken([{ x: W * 0.05, y: H * 0.05 }, { x: W * 0.95, y: H * 0.05 }, { x: W * 0.95, y: H * 0.95 }, { x: W * 0.05, y: H * 0.95 }])
      setBusy('KI sucht den Beleg …')
      try {
        const k = await belegLesen(c.toDataURL('image/jpeg', 0.8))
        if (Array.isArray(k.ecken) && k.ecken.length === 4 && k.ecken.every((p) => p && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) {
          setEcken(k.ecken.map((p) => ({ x: p.x * W, y: p.y * H })))
        }
        setDaten({
          lieferant: k.lieferant || '', datum: /^\d{4}-\d{2}-\d{2}$/.test(k.datum || '') ? k.datum : '',
          betrag: k.betrag != null ? String(k.betrag).replace('.', ',') : '', beschreibung: k.beschreibung || '',
        })
      } catch (err) { alert('KI konnte den Beleg nicht lesen: ' + (err && err.message ? err.message : err) + '\nDu kannst die Ecken und Angaben selbst eintragen.') }
    } catch (err) { alert(err && err.message ? err.message : String(err)) }
    setBusy('')
  }

  // Zeigerposition → Bildpixel
  const punkt = (ev) => {
    const r = bild.current.getBoundingClientRect()
    return { x: Math.max(0, Math.min(quelle.width, ((ev.clientX - r.left) / r.width) * quelle.width)), y: Math.max(0, Math.min(quelle.height, ((ev.clientY - r.top) / r.height) * quelle.height)) }
  }
  const zuschneiden = () => {
    setBusy('Schneide zu …')
    setTimeout(() => {
      try { setErgebnis(verbessern(entzerren(quelle, ecken, 1400)).toDataURL('image/jpeg', 0.75)) }
      catch (err) { alert('Zuschneiden fehlgeschlagen: ' + (err && err.message ? err.message : err)) }
      setBusy('')
    }, 30)
  }
  const fertig = () => {
    const betrag = parseBetrag(daten.betrag)
    if (!ergebnis) return
    if (Number.isNaN(betrag) || betrag <= 0) { alert('Bitte den Betrag des Belegs eintragen, z. B. 128,40.'); return }
    onFertig({ dataUrl: ergebnis, lieferant: daten.lieferant.trim(), datum: daten.datum, betrag, beschreibung: daten.beschreibung.trim() })
  }

  if (!quelle) {
    return (
      <div className="space-y-2">
        <div className="text-white/75 text-xs">Rechnung oder Kassenbon flach hinlegen und von oben fotografieren. Die KI schneidet zu und liest Lieferant, Datum und Betrag.</div>
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

  return (
    <div className="space-y-3">
      {!ergebnis ? (
        <>
          <div className="text-white/75 text-xs">Die Ecken an die Belegkanten ziehen, dann „Zuschneiden“.</div>
          <div className="relative select-none touch-none" onPointerMove={(ev) => { if (ziehe >= 0) { const p = punkt(ev); setEcken((e) => e.map((q, i) => (i === ziehe ? p : q))) } }}
            onPointerUp={() => setZiehe(-1)} onPointerLeave={() => setZiehe(-1)}>
            <img ref={bild} src={quelle.toDataURL('image/jpeg', 0.85)} alt="" className="w-full rounded-xl" draggable={false} />
            {ecken && (
              <svg viewBox={'0 0 ' + quelle.width + ' ' + quelle.height} className="absolute inset-0 w-full h-full">
                <polygon points={ecken.map((p) => p.x + ',' + p.y).join(' ')} fill="rgba(245,158,11,0.15)" stroke="#f59e0b" strokeWidth={quelle.width / 200} />
                {ecken.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={quelle.width / 28} fill="rgba(245,158,11,0.9)" stroke="#fff" strokeWidth={quelle.width / 300}
                    style={{ cursor: 'grab' }} onPointerDown={(ev) => { ev.preventDefault(); ev.currentTarget.ownerSVGElement.parentNode.setPointerCapture?.(ev.pointerId); setZiehe(i) }} />
                ))}
              </svg>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setQuelle(null); setEcken(null) }} className="rounded-2xl py-2.5 bg-white/10 inline-flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Neues Foto</button>
            <button onClick={zuschneiden} disabled={!!busy} className="rounded-2xl py-2.5 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><ScanLine className="w-4 h-4" /> Zuschneiden</button>
          </div>
        </>
      ) : (
        <>
          <img src={ergebnis} alt="Beleg" className="w-full rounded-xl bg-white" />
          <button onClick={() => setErgebnis('')} className="text-amber text-xs">Ecken nochmal anpassen</button>
          <input value={daten.lieferant} onChange={(e) => setDaten({ ...daten, lieferant: e.target.value })} placeholder="Lieferant (z. B. Bauhaus)" className={inp} />
          <input value={daten.beschreibung} onChange={(e) => setDaten({ ...daten, beschreibung: e.target.value })} placeholder="Was wurde gekauft?" className={inp} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={daten.datum} onChange={(e) => setDaten({ ...daten, datum: e.target.value })} className={inp} />
            <input value={daten.betrag} onChange={(e) => setDaten({ ...daten, betrag: e.target.value })} inputMode="decimal" placeholder="Betrag brutto €" className={inp} />
          </div>
          <button onClick={fertig} className="w-full rounded-2xl py-3 font-bold btn-grad">Beleg übernehmen</button>
        </>
      )}
      {busy && <div className="text-amber text-sm">{busy}</div>}
    </div>
  )
}
