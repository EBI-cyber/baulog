import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, Check, Flashlight, Volume2, VolumeX, Camera } from 'lucide-react'
import { verfolger, begleiter, grau, schaerfe } from '../lib/videoscan'

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

// Langer Beleg, Schritt 2: Kamera über den Beleg ziehen. uebersicht = zugeschnittenes Übersichtsfoto (Canvas).
// Jedes Kamerabild wird im Übersichtsfoto wiedergefunden; die Leiste rechts zeigt, was schon erfasst ist.
// Reihenfolge und Tempo sind egal, Lücken kann man durch Zurückfahren füllen. Ergebnis = ein langes Bild über onFertig.
// Ein Begleiter achtet laufend auf waagerechte Haltung, Abstand, Tempo, Licht und Schärfe.
// Ohne uebersicht: Schritt 1, das Übersichtsfoto selbst (eigene Kamera, damit die Taschenlampe an ist) → onFoto(Canvas).
export default function VideoScan({ uebersicht, onFertig, onFoto, onAbbrechen }) {
  const foto = !uebersicht
  const video = useRef(null), stream = useRef(null)
  const zustand = useRef({ laeuft: false, stop: false, lage: null, bestScharf: 0, sprich: sprecher() })
  const spur = useRef(null)
  if (!spur.current && !foto) spur.current = verfolger(uebersicht)
  const [karte] = useState(() => (foto ? '' : uebersicht.toDataURL('image/jpeg', 0.6)))
  const [laeuft, setLaeuft] = useState(false)
  const [anzeige, setAnzeige] = useState({ abschnitte: 0, abdeckung: 0, bereiche: [], lage: null, pos: null, hinweis: { text: 'Kamera startet …', stufe: 'gut', werte: {} } })
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
        const kannLicht = spur.getCapabilities && spur.getCapabilities().torch
        if (kannLicht) setLicht(false)
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}) }
        // Taschenlampe gleich einschalten (Browser kennen nur an/aus, an = volle Stärke);
        // manche Handys nehmen das erst kurz nach dem Kamerastart an, daher ein zweiter Versuch
        if (kannLicht) {
          const an = () => spur.applyConstraints({ advanced: [{ torch: true }] }).then(() => { if (aktiv) setLicht(true) })
          an().catch(() => setTimeout(() => { if (aktiv) an().catch(() => {}) }, 600))
        }
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

  // Ein Durchgang je ~45 ms: Lage im Beleg bestimmen, nach Start Abschnitte sammeln, Begleiter-Hinweise
  const schritt = (t) => {
    const z = zustand.current, v = video.current
    if (z.stop) return
    requestAnimationFrame(schritt)
    if (!v || !v.videoWidth || t - (z.zuletzt || 0) < 45) return
    z.zuletzt = t
    if (foto) {
      // Übersichtsfoto: nur Haltung, Licht und Schärfe prüfen
      const g = grau(v, 320), sch = schaerfe(g)
      z.bestScharf = Math.max(z.bestScharf * 0.995, sch)
      let h = begleiter({ lage: z.lage, papier: null, tempo: null, hell: g.hell, scharf: z.bestScharf ? sch / z.bestScharf : null, laeuft: false })
      if (h.stufe === 'gut') h = { ...h, text: 'Gut so – ganzen Beleg ins Bild, dann auslösen' }
      if (h.text !== (z.kandidat && z.kandidat.text)) { z.kandidat = h; z.seit = t }
      const gez = t - z.seit > 500 ? h : (z.gezeigt || h)
      z.gezeigt = gez
      z.sprich(gez.text, tonRef.current)
      setAnzeige((a) => ({ ...a, lage: z.lage, hinweis: gez }))
      return
    }
    // einmal je Durchgang ein festes Bild ziehen: Lagebestimmung und Aufnahme müssen genau dasselbe Bild sehen
    const bildJetzt = vollbild()
    const st = spur.current.schritt(bildJetzt, t, z.laeuft, () => bildJetzt)
    if (st.neu && navigator.vibrate) navigator.vibrate(30)
    let hinweis = begleiter({ lage: z.lage, papier: st.papier, tempo: z.laeuft && st.sicher ? st.tempo : null, hell: st.hell, scharf: st.scharf, laeuft: z.laeuft })
    if (st.verloren) hinweis = { ...hinweis, text: 'Suche die Stelle im Beleg – Handy ruhig halten', stufe: 'achtung' }
    else if (z.laeuft && st.luecke && hinweis.stufe === 'gut') hinweis = { ...hinweis, text: 'Weiter oben fehlt noch ein Stück – kurz zurückfahren', stufe: 'achtung' }
    else if (z.laeuft && st.abdeckung >= 0.9 && !st.endenErfasst && hinweis.stufe === 'gut') hinweis = { ...hinweis, text: 'Noch bis ganz ans Ende des Belegs fahren', stufe: 'achtung' }
    // Hinweise erst nach einer halben Sekunde zeigen, damit sie nicht flackern
    if (hinweis.text !== (z.kandidat && z.kandidat.text)) { z.kandidat = hinweis; z.seit = t }
    const gezeigt = t - z.seit > 500 || hinweis.stufe === 'stopp' ? hinweis : (z.gezeigt || hinweis)
    z.gezeigt = gezeigt
    if (gezeigt.stufe !== 'gut' || !z.laeuft) z.sprich(gezeigt.text, tonRef.current)
    setAnzeige({ abschnitte: st.abschnitte, abdeckung: st.abdeckung, bereiche: spur.current.bereiche(), lage: z.lage, pos: st.y != null && !st.verloren ? [st.y / st.HO, (st.y + st.hO) / st.HO] : null, hinweis: gezeigt })
    // ganzer Beleg erfasst: automatisch fertig
    // erst fertig, wenn auch Anfang und Ende scharf erfasst sind: Lücken füllt nur das unschärfere Übersichtsfoto
    if (z.laeuft && st.abdeckung >= 0.985 && st.endenErfasst) fertig()
  }

  // Übersichtsfoto in voller Kameraauflösung aufnehmen
  const ausloesen = () => {
    const v = video.current, z = zustand.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    z.stop = true
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (navigator.vibrate) navigator.vibrate(30)
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop())
    onFoto(c)
  }

  const start = () => {
    lageHoeren()
    zustand.current.laeuft = true
    setLaeuft(true)
  }

  const fertig = () => {
    const z = zustand.current; if (!z.laeuft || z.stop) return
    if (!spur.current.anzahl()) { alert('Noch kein Abschnitt aufgenommen. Bitte das Handy über den Beleg führen.'); return }
    z.stop = true
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (navigator.vibrate) navigator.vibrate([40, 60, 40])
    setBusy('Setze den Beleg zusammen …')
    setTimeout(() => {
      try {
        const bild = spur.current.zusammensetzen()
        if (stream.current) stream.current.getTracks().forEach((t) => t.stop())
        // dazu die einzelnen scharfen Abschnitte: daraus liest die KI (unabhängig von den Nähten im Gesamtbild)
        onFertig(bild, spur.current.anzahl(), spur.current.kiAbschnitte(10))
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
        <div className="font-semibold">{foto ? 'Langer Beleg – Übersichtsfoto' : 'Langer Beleg – Video-Scan'}</div>
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
              {!foto && ampel('Abstand', hinweis.werte.abstand)}
              {laeuft && ampel('Tempo', hinweis.werte.tempo)}
            </div>
            {laeuft && <div className="text-xs text-white/80">{Math.round(anzeige.abdeckung * 100)} % des Belegs erfasst</div>}
          </div>
        )}
        {!fehler && !busy && !foto && (
          // Mini-Karte: Übersichtsfoto, grün = schon erfasst, Rahmen = gerade im Bild
          <div className="absolute right-3 top-32 bottom-3 w-12 rounded-lg overflow-hidden border border-white/40 bg-black/50">
            <img src={karte} alt="" className="absolute inset-0 w-full h-full object-fill opacity-70" />
            {anzeige.bereiche.map(([a, b], i) => <div key={i} className="absolute left-0 right-0 bg-emerald-500/55" style={{ top: a * 100 + '%', height: (b - a) * 100 + '%' }} />)}
            {anzeige.pos && <div className="absolute -left-px -right-px border-2 border-amber rounded-sm" style={{ top: Math.max(0, anzeige.pos[0]) * 100 + '%', height: (Math.min(1, anzeige.pos[1]) - Math.max(0, anzeige.pos[0])) * 100 + '%' }} />}
          </div>
        )}
        {punkt && !busy && (
          <div className="absolute left-3 bottom-3 w-16 h-16 rounded-full border-2 border-white/60 bg-black/40">
            <div className="absolute left-1/2 top-1/2 w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border border-white/50" />
            <div className={'absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full ' + FARBE[hinweis.werte.lage || 'gut']}
              style={{ left: (50 + punkt.x * 42) + '%', top: (50 + punkt.y * 42) + '%' }} />
          </div>
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-amber font-semibold">{busy}</div>}
      </div>
      <div className="p-3 space-y-2">
        {foto ? (
          <>
            <div className="text-white/75 text-xs">Schritt 1 von 2: Beleg flach auf einen dunkleren Untergrund legen und so weit vom Beleg weggehen, dass er ganz ins Bild passt. Handy waagerecht halten und auslösen.</div>
            <button onClick={ausloesen} disabled={!!fehler} className="w-full rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><Camera className="w-5 h-5" /> Übersichtsfoto aufnehmen</button>
          </>
        ) : !laeuft ? (
          <>
            <div className="text-white/75 text-xs">Schritt 2 von 2: Handy waagerecht über den Beleg halten, sodass er gut zwei Drittel der Bildbreite füllt. Der orange Rahmen in der Leiste rechts zeigt, welche Stelle die App gerade erkennt. Auf Start tippen und das Handy ruhig über den Beleg führen, bis die Leiste ganz grün ist. Lücken füllst du einfach durch Zurückfahren.</div>
            <button onClick={start} disabled={!!fehler} className="w-full rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><Play className="w-5 h-5" /> Start</button>
          </>
        ) : (
          <button onClick={fertig} disabled={!!busy} className="w-full rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><Check className="w-5 h-5" /> Fertig{anzeige.abdeckung < 0.95 ? ' (Lücken nimmt die App aus dem Übersichtsfoto)' : ''}</button>
        )}
      </div>
    </div>,
    document.body,
  )
}
