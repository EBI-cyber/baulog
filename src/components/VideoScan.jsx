import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, Check, Flashlight, Volume2, VolumeX } from 'lucide-react'
import { grau, schaerfe, verschiebung, zusammensetzen, versatzVerfeinern, papierSpalten, helligkeit, begleiter } from '../lib/videoscan'

const SPUR = 320 // Breite der Graustufenbilder für die Verfolgung
const NEU_AB = 0.42 // neuer Abschnitt, sobald sich das Bild um diesen Anteil der Höhe verschoben hat
const SPAETESTENS = 0.6 // dann auch ohne bestes Schärfe-Ergebnis
const MAX_ABSCHNITTE = 16
const FARBE = { gut: 'bg-emerald-500', achtung: 'bg-amber', stopp: 'bg-ember' }

// Hinweis vorlesen (de-DE), nicht öfter als alle 2,5 s und nur bei neuem Text
function sprecher() {
  let zuletzt = '', zeit = 0
  return (text, an) => {
    if (!an || !window.speechSynthesis || text === zuletzt || Date.now() - zeit < 2500) return
    zuletzt = text; zeit = Date.now()
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/–/g, ',')); u.lang = 'de-DE'; u.rate = 1.1
    window.speechSynthesis.speak(u)
  }
}

// Langer Beleg: Kamera von oben nach unten über den Beleg ziehen. Ergebnis = ein langes Bild (Canvas) über onFertig.
// Ein Begleiter achtet laufend auf waagerechte Haltung, Abstand, Tempo, Licht und Schärfe.
export default function VideoScan({ onFertig, onAbbrechen }) {
  const video = useRef(null), stream = useRef(null)
  const zustand = useRef({ laeuft: false, stop: false, lage: null, bestScharf: 0, sprich: sprecher() })
  const [laeuft, setLaeuft] = useState(false)
  const [anzeige, setAnzeige] = useState({ abschnitte: 0, fortschritt: 0, hinweis: { text: 'Kamera startet …', stufe: 'gut', werte: {} }, lage: null })
  const [fehler, setFehler] = useState('')
  const [licht, setLicht] = useState(null) // null = Taschenlampe nicht verfügbar
  const [ton, setTon] = useState(true)
  const [busy, setBusy] = useState('')
  const tonRef = useRef(true)
  tonRef.current = ton

  // Lage des Handys (Wasserwaage)
  const lageHoeren = () => {
    const z = zustand.current
    if (z.lageAn || typeof window.DeviceOrientationEvent === 'undefined') return
    const an = () => {
      z.lageAn = true
      z.lageFn = (e) => { if (e.beta != null) z.lage = { beta: e.beta, gamma: e.gamma || 0 } }
      window.addEventListener('deviceorientation', z.lageFn)
    }
    // iPhone fragt einmal nach Erlaubnis (nur nach einem Tipp möglich)
    if (typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') an() }).catch(() => {})
    else an()
  }

  useEffect(() => {
    let aktiv = true
    const z = zustand.current
    if (typeof DeviceOrientationEvent === 'undefined' || typeof DeviceOrientationEvent.requestPermission !== 'function') lageHoeren()
    ;(async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        if (!aktiv) { s.getTracks().forEach((t) => t.stop()); return }
        stream.current = s
        const spur = s.getVideoTracks()[0]
        spur.applyConstraints?.({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {})
        if (spur.getCapabilities && spur.getCapabilities().torch) setLicht(false)
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}) }
        requestAnimationFrame(schritt)
      } catch {
        setFehler('Die Kamera ist nicht verfügbar. Bitte in den Browser-Einstellungen den Kamerazugriff erlauben.')
      }
    })()
    return () => {
      aktiv = false; z.stop = true
      if (z.lageFn) window.removeEventListener('deviceorientation', z.lageFn)
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      if (stream.current) stream.current.getTracks().forEach((t) => t.stop())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const lampe = () => {
    const spur = stream.current && stream.current.getVideoTracks()[0]; if (!spur) return
    spur.applyConstraints({ advanced: [{ torch: !licht }] }).then(() => setLicht(!licht)).catch(() => {})
  }

  // aktuelles Kamerabild in voller Auflösung (höchstens 1200 px breit)
  const vollbild = () => {
    const v = video.current, f = Math.min(1, 1200 / v.videoWidth)
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * f); c.height = Math.round(v.videoHeight * f)
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    return c
  }
  const faktor = () => Math.min(1200, video.current.videoWidth) / SPUR

  // Ein Durchgang je ~45 ms: Begleiter-Hinweise immer, Verfolgung und Aufnahme nur nach Start
  const schritt = (t) => {
    const z = zustand.current, v = video.current
    if (z.stop) return
    requestAnimationFrame(schritt)
    if (!v || !v.videoWidth || t - (z.zuletzt || 0) < 45) return
    z.zuletzt = t
    const g = grau(v, SPUR), h = g.h
    const s = schaerfe(g)
    z.bestScharf = Math.max(z.bestScharf * 0.995, s)
    let tempo = null
    if (z.laeuft) {
      // um die erwartete Position herum suchen; nach mehreren unsicheren Bildern großflächig
      const m = z.unsicher > 8
        ? verschiebung(z.anker, g, 0, h * 0.3, 10, h * 0.3)
        : verschiebung(z.anker, g, z.pos.dx + z.tempo.dx, z.pos.dy + z.tempo.dy, 6, Math.max(10, Math.round(h * 0.04)))
      if (m && m.eindeutig) {
        z.tempo = { dx: (z.tempo.dx + (m.dx - z.pos.dx)) / 2, dy: (z.tempo.dy + (m.dy - z.pos.dy)) / 2 }
        z.pos = { dx: m.dx, dy: m.dy }
        z.unsicher = 0
      } else z.unsicher++
      tempo = z.tempo.dy / h
      const anteil = z.pos.dy / h
      if (anteil >= NEU_AB && z.unsicher === 0 && (s >= z.scharf * 0.8 || anteil >= SPAETESTENS)) {
        const f = faktor()
        z.abschnitte.push({ bild: vollbild(), dx: z.pos.dx * f, dy: z.pos.dy * f })
        z.anker = g; z.scharf = s; z.pos = { dx: 0, dy: 0 }
        if (navigator.vibrate) navigator.vibrate(30)
        if (z.abschnitte.length >= MAX_ABSCHNITTE) { fertig(); return }
      }
    }
    let hinweis = begleiter({ lage: z.lage, papier: papierSpalten(g), tempo, hell: helligkeit(g), scharf: z.bestScharf ? s / z.bestScharf : null, laeuft: z.laeuft })
    if (z.laeuft && z.unsicher > 8) hinweis = { ...hinweis, text: 'Position verloren – bitte ein Stück zurück nach oben', stufe: 'stopp' }
    // Hinweise erst nach einer halben Sekunde zeigen, damit sie nicht flackern
    if (hinweis.text !== (z.kandidat && z.kandidat.text)) { z.kandidat = hinweis; z.seit = t }
    const gezeigt = t - z.seit > 500 || hinweis.stufe === 'stopp' ? hinweis : (z.gezeigt || hinweis)
    z.gezeigt = gezeigt
    if (gezeigt.stufe !== 'gut' || !z.laeuft) z.sprich(gezeigt.text, tonRef.current)
    setAnzeige({ abschnitte: z.laeuft ? z.abschnitte.length : 0, fortschritt: z.laeuft ? Math.max(0, Math.min(1, z.pos.dy / h / NEU_AB)) : 0, hinweis: gezeigt, lage: z.lage })
  }

  const start = () => {
    const v = video.current, z = zustand.current
    if (!v || !v.videoWidth) return
    lageHoeren()
    const g = grau(v, SPUR)
    Object.assign(z, { anker: g, scharf: schaerfe(g), pos: { dx: 0, dy: 0 }, tempo: { dx: 0, dy: 0 }, unsicher: 0, abschnitte: [{ bild: vollbild(), dx: 0, dy: 0 }], laeuft: true })
    setLaeuft(true)
  }

  const fertig = () => {
    const z = zustand.current; if (!z.laeuft || z.stop) return
    z.stop = true
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    // letztes Stück mitnehmen, wenn seit dem letzten Abschnitt noch etwas dazugekommen ist
    if (z.pos.dy > z.anker.h * 0.08 && z.unsicher === 0) {
      const f = faktor()
      z.abschnitte.push({ bild: vollbild(), dx: z.pos.dx * f, dy: z.pos.dy * f })
    }
    setBusy('Setze den Beleg zusammen …')
    setTimeout(() => {
      try {
        const a = z.abschnitte.map((x, i) => (i ? { ...x, ...versatzVerfeinern(z.abschnitte[i - 1].bild, x.bild, x.dx, x.dy) } : x))
        const bild = zusammensetzen(a)
        if (stream.current) stream.current.getTracks().forEach((t) => t.stop())
        onFertig(bild, a.length)
      } catch (err) {
        setBusy('')
        alert('Zusammensetzen fehlgeschlagen: ' + (err && err.message ? err.message : err))
        onAbbrechen()
      }
    }, 30)
  }

  const { hinweis, lage } = anzeige
  const ampel = (name, wert) => (
    <div className="flex items-center gap-1.5"><span className={'w-2.5 h-2.5 rounded-full ' + FARBE[wert || 'gut']} />{name}</div>
  )
  // Wasserwaage: Punkt wandert mit der Neigung, Ziel ist die Mitte
  const punkt = lage ? { x: Math.max(-1, Math.min(1, lage.gamma / 20)), y: Math.max(-1, Math.min(1, lage.beta / 20)) } : null

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <div className="font-semibold">Langer Beleg – Video-Scan</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTon(!ton)} className="p-2 rounded-full bg-white/10" title={ton ? 'Sprachhinweise aus' : 'Sprachhinweise an'}>{ton ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}</button>
          {licht !== null && <button onClick={lampe} className={'p-2 rounded-full ' + (licht ? 'bg-amber text-black' : 'bg-white/10')} title="Licht"><Flashlight className="w-5 h-5" /></button>}
          <button onClick={onAbbrechen} className="p-2 rounded-full bg-white/10" title="Abbrechen"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        {fehler ? <div className="text-white/80 p-4">{fehler}</div> : (
          <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-contain" />
        )}
        {!fehler && !busy && (
          <div className="absolute left-3 right-3 top-3 rounded-xl bg-black/65 text-white px-3 py-2 text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={'w-3 h-3 rounded-full shrink-0 ' + FARBE[hinweis.stufe]} />
              <span className="font-semibold flex-1">{hinweis.text}</span>
              {laeuft && <span className="shrink-0 text-white/75">{anzeige.abschnitte} Abschn.</span>}
            </div>
            <div className="flex gap-4 text-xs text-white/80">
              {ampel('Waagerecht', lage ? hinweis.werte.lage : null)}
              {ampel('Abstand', hinweis.werte.abstand)}
              {laeuft && ampel('Tempo', hinweis.werte.tempo)}
            </div>
            {laeuft && <div className="h-1.5 rounded-full bg-white/20 overflow-hidden"><div className="h-full btn-grad" style={{ width: anzeige.fortschritt * 100 + '%' }} /></div>}
          </div>
        )}
        {punkt && !busy && (
          <div className="absolute right-3 bottom-3 w-16 h-16 rounded-full border-2 border-white/60 bg-black/40">
            <div className="absolute left-1/2 top-1/2 w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border border-white/50" />
            <div className={'absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full ' + FARBE[hinweis.werte.lage || 'gut']}
              style={{ left: (50 + punkt.x * 42) + '%', top: (50 + punkt.y * 42) + '%' }} />
          </div>
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-amber font-semibold">{busy}</div>}
      </div>
      <div className="p-3 space-y-2">
        {!laeuft ? (
          <>
            <div className="text-white/75 text-xs">Beleg flach auf einen dunkleren Untergrund legen. Handy waagerecht darüber halten, sodass der Beleg gut zwei Drittel der Bildbreite füllt und der obere Rand zu sehen ist. Der Begleiter oben sagt dir, ob Haltung und Abstand passen. Dann auf Start tippen und das Handy langsam nach unten ziehen, ohne die Höhe zu ändern.</div>
            <button onClick={start} disabled={!!fehler} className="w-full rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><Play className="w-5 h-5" /> Start</button>
          </>
        ) : (
          <button onClick={fertig} disabled={!!busy} className="w-full rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><Check className="w-5 h-5" /> Fertig – Ende des Belegs erreicht</button>
        )}
      </div>
    </div>,
    document.body,
  )
}
