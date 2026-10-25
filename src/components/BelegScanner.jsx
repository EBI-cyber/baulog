import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ImagePlus, ScanLine, RotateCcw, X, Plus, ScrollText, Search } from 'lucide-react'
import { ladeBild, dateiAlsDataUrl, verkleinern, entzerren, verbessern, eckenFinden, dokumentFilter, ablagefassung } from '../lib/scan'
import { belegLesen, positionFinden } from '../lib/ai'
import { parseBetrag } from '../lib/abrechnung'
import Vollbild from './Vollbild'
import VideoScan from './VideoScan'
import VideoAnleitung, { anleitungGesehen } from './VideoAnleitung'
import { melden, frage, toast } from '../ui/Hinweise'

const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

// Lange Belege für die KI in überlappende Stücke teilen, damit jedes Stück in voller Schärfe ankommt
// (ein einzelnes, sehr langes Bild würde die KI stark verkleinern). Kurze Belege bleiben ein Bild.
function kiStuecke(canvas) {
  const W = canvas.width, H = canvas.height
  if (H <= W * 2.2) return [canvas.toDataURL('image/jpeg', 0.8)]
  const hoehe = Math.round(W * 1.5), ueber = Math.round(hoehe * 0.15)
  const n = Math.min(10, Math.ceil((H - ueber) / (hoehe - ueber)))
  const schritt = (H - hoehe) / Math.max(1, n - 1)
  return Array.from({ length: n }, (_, i) => {
    const c = document.createElement('canvas'); c.width = W; c.height = hoehe
    c.getContext('2d').drawImage(canvas, 0, Math.round(i * schritt), W, hoehe, 0, 0, W, hoehe)
    return c.toDataURL('image/jpeg', 0.85)
  })
}

// Viereck leicht zur Mitte einrücken, damit kein Untergrund am Rand stehen bleibt
function einruecken(ecken, anteil) {
  const mx = ecken.reduce((a, p) => a + p.x, 0) / 4, my = ecken.reduce((a, p) => a + p.y, 0) / 4
  return ecken.map((p) => ({ x: p.x + (mx - p.x) * anteil, y: p.y + (my - p.y) * anteil }))
}

// Beleg fotografieren → Ecken finden → nachziehen (Ecken oder ganze Kanten) → entzerren →
// KI liest Lieferant, Datum, Betrag und die einzelnen Positionen mit Gewerk → speichern
// korrektur = { bild, ecken }: gespeichertes Originalfoto erneut zuschneiden (ohne KI), Ergebnis über onKorrigiert
// nurBild: nur fotografieren und zuschneiden (z. B. fehlendes Belegbild nachscannen), Ergebnis über onKorrigiert
// sofortKamera: gleich die Kamera öffnen (nächster Beleg nach „Speichern & nächster“)
export default function BelegScanner({ gewerke = [], projekt, verschleissProzent = 25, onFertig, onAbbrechen, onOhneBeleg, korrektur, nurBild, onKorrigiert, sofortKamera }) {
  const [quelle, setQuelle] = useState(null) // Canvas des verkleinerten Fotos
  const [vorschau, setVorschau] = useState('')
  const [ecken, setEcken] = useState(null)
  const [ki, setKi] = useState(null) // { lieferant, datum, betrag, positionen }
  const [ergebnis, setErgebnis] = useState('')
  const [fassungen, setFassungen] = useState(null) // { dokument, farbe } – zwischen beiden umschaltbar
  const [modus, setModus] = useState('dokument')
  const [gross, setGross] = useState(false)
  const [markiert, setMarkiert] = useState(null) // { markierung, titel } – Position auf dem Belegbild zeigen
  const [suchePos, setSuchePos] = useState(-1)
  const [busy, setBusy] = useState('')
  const [video, setVideo] = useState(false) // Video-Scan für lange Belege offen
  const [fotoKamera, setFotoKamera] = useState(Boolean(sofortKamera)) // eigene Kamera (mit Taschenlampe) für das Übersichtsfoto
  const [videoNoetig, setVideoNoetig] = useState(null) // { pxProZeichen } – Foto zu klein für scharfe Schrift
  const [anleitung, setAnleitung] = useState(false) // bebilderte Anleitung vor dem ersten Video-Scan
  const voll = useRef(null) // Foto in voller Auflösung (für die Qualitätsprüfung und das Übersichtsfoto)
  const [uebersicht, setUebersicht] = useState(null) // zugeschnittenes Übersichtsfoto (Canvas) für den Video-Scan
  const [lang, setLang] = useState(false) // Quelle stammt aus dem Video-Scan
  const autoZuschnitt = useRef(false)
  const kiBilder = useRef(null) // Stücke des zugeschnittenen Belegs für die KI
  const videoStuecke = useRef(null) // einzelne scharfe Abschnitte aus dem Video-Scan für die KI
  const galerie = useRef(null), bild = useRef(null), svg = useRef(null)
  // Ziehen ohne React-Neuzeichnen: Positionen in einer Ref, SVG direkt aktualisieren
  const live = useRef(null), griff = useRef(null), lupe = useRef(null)
  // Lupe wie bei OneDrive: zeigt die Umgebung des gezogenen Punkts vergrößert mit Fadenkreuz
  const LUPE = 120, ZOOM = 3
  const lupeZeigen = (p) => {
    const l = lupe.current, b = bild.current; if (!l || !b) return
    const r = b.getBoundingClientRect(), f = r.width / quelle.width
    const px = p.x * f, py = p.y * f
    l.style.display = 'block'
    l.style.backgroundSize = (r.width * ZOOM) + 'px ' + (r.height * ZOOM) + 'px'
    l.style.backgroundPosition = (LUPE / 2 - px * ZOOM) + 'px ' + (LUPE / 2 - py * ZOOM) + 'px'
    // Lupe in die gegenüberliegende obere Ecke, damit der Finger sie nicht verdeckt
    const links = px > r.width / 2
    l.style.left = links ? '8px' : (r.width - LUPE - 8) + 'px'
    l.style.top = py < LUPE + 24 ? (r.height - LUPE - 8) + 'px' : '8px'
  }
  const lupeAus = () => { if (lupe.current) lupe.current.style.display = 'none' }
  const inp = 'w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 outline-none focus:border-amber'
  // Korrekturmodus: Originalfoto laden und mit den gespeicherten Ecken starten
  const korrekturGeladen = useRef(false)
  if (korrektur && !korrekturGeladen.current) {
    korrekturGeladen.current = true
    ladeBild(korrektur.bild).then((img) => {
      const c = verkleinern(img, 1600)
      setQuelle(c); setVorschau(korrektur.bild); setEcken(korrektur.ecken)
    }).catch(() => melden('Originalfoto konnte nicht geladen werden.'))
  }

  const laden = async (ev) => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = ''
    if (!f) return
    setBusy('Lade Foto …')
    try { await uebernehmen(await ladeBild(await dateiAlsDataUrl(f))) } catch (err) { melden(err && err.message ? err.message : String(err)) }
    setBusy('')
  }
  // Foto (Bild oder Canvas) übernehmen: verkleinern, Ecken suchen
  const uebernehmen = async (quellbild) => {
    {
      const c = verkleinern(quellbild, 1600)
      const W = c.width, H = c.height
      {
        const w0 = quellbild.naturalWidth || quellbild.width, h0 = quellbild.naturalHeight || quellbild.height, f = Math.min(1, 3000 / Math.max(w0, h0))
        const v = document.createElement('canvas'); v.width = Math.round(w0 * f); v.height = Math.round(h0 * f)
        v.getContext('2d').drawImage(quellbild, 0, 0, v.width, v.height)
        voll.current = v
      }
      setVideoNoetig(null)
      const gefunden = eckenFinden(c)
      setLang(false); videoStuecke.current = null
      setQuelle(c); setVorschau(c.toDataURL('image/jpeg', 0.85)); setErgebnis(''); setKi(null)
      setEcken(gefunden ? einruecken(gefunden, 0.012) : [{ x: W * 0.05, y: H * 0.05 }, { x: W * 0.95, y: H * 0.05 }, { x: W * 0.95, y: H * 0.95 }, { x: W * 0.05, y: H * 0.95 }])
      // Ecken nicht gefunden: KI um eine Schätzung bitten (die Angaben liest sie später vom zugeschnittenen Beleg)
      if (!gefunden) {
        setBusy('Suche den Beleg …')
        try {
          const k = await belegLesen(c.toDataURL('image/jpeg', 0.8), gewerke)
          if (Array.isArray(k.ecken) && k.ecken.length === 4 && k.ecken.every((p) => p && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) {
            setEcken(einruecken(k.ecken.map((p) => ({ x: p.x * W, y: p.y * H })), 0.01))
          }
        } catch { /* dann eben von Hand */ }
        setBusy('')
      }
    }
  }

  // Größe des Fotos im Vollbild-Zuschnitt: so groß wie die freie Fläche zwischen Kopfzeile und Knöpfen erlaubt
  const flaeche = useRef(null)
  const [bildMass, setBildMass] = useState(null)
  useEffect(() => {
    const el = flaeche.current
    if (!el || !quelle) return
    const messen = () => {
      const r = el.getBoundingClientRect(), fw = r.width - 16, fh = r.height - 8
      const f = Math.min(fw / quelle.width, fh / quelle.height)
      if (f > 0) setBildMass({ w: Math.round(quelle.width * f), h: Math.round(quelle.height * f) })
    }
    messen()
    const ro = new ResizeObserver(messen); ro.observe(el)
    return () => ro.disconnect()
  }, [quelle, ergebnis]) // eslint-disable-line react-hooks/exhaustive-deps
  // Nochmal: beim Video-Scan mit derselben Übersicht neu scannen, sonst (oder mit neuesFoto) ein neues Foto – man bleibt im Beleg
  const lauf = useRef(0) // laufende KI-Auswertung verwerfen, wenn inzwischen neu gescannt wird
  const nochmal = (neuesFoto) => {
    lauf.current++
    setErgebnis(''); setKi(null); setFassungen(null); setBusy('')
    if (lang && uebersicht && neuesFoto !== true) setVideo(true)
    else { setQuelle(null); setEcken(null); setVideoNoetig(null); setLang(false); setUebersicht(null); videoStuecke.current = null; setFotoKamera(true) }
  }
  // Ecken im Foto in voller Auflösung
  const eckenVoll = () => {
    const f = voll.current ? voll.current.width / quelle.width : 1
    return ecken.map((p) => ({ x: p.x * f, y: p.y * f }))
  }
  // Reicht ein Foto? Entscheidend ist, wie viele Bildpunkte ein Schriftzeichen bekommt. Ein Kassenbon hat etwa
  // 42 Zeichen je Zeile; unter ~10 Bildpunkten je Zeichen liest die KI unzuverlässig (lange Bons aus der Ferne).
  const ZEICHEN = 42, MIN_PX = 10
  const weiter = () => {
    const e = eckenVoll()
    const breite = Math.max(Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y), Math.hypot(e[2].x - e[3].x, e[2].y - e[3].y))
    const pxProZeichen = breite / ZEICHEN
    if (pxProZeichen >= MIN_PX) zuschneiden()
    else setVideoNoetig({ pxProZeichen })
  }
  // Video-Scan: das zugeschnittene Foto dient als Übersicht, an der sich die Abschnitte ausrichten
  const zumVideo = () => {
    if (!anleitungGesehen()) { setAnleitung(true); return }
    try { setUebersicht(entzerren(voll.current || quelle, voll.current ? eckenVoll() : ecken, 1600)); setVideo(true) }
    catch (err) { melden('Zuschneiden fehlgeschlagen: ' + (err && err.message ? err.message : err)) }
  }
  // Ergebnis des Video-Scans: das lange Bild ist schon passend zum Übersichtsfoto zugeschnitten
  const videoFertig = (c, anzahl, abschnitte) => {
    setVideo(false)
    // die KI liest die einzelnen Abschnitte (kontrastreich, höchstens 1000 px breit) statt des zusammengesetzten Bildes
    try {
      videoStuecke.current = (abschnitte || []).map((a) => dokumentFilter(verkleinern(a, Math.max(a.width, a.height) * Math.min(1, 1000 / a.width))).toDataURL('image/jpeg', 0.85))
    } catch { videoStuecke.current = null }
    setLang(true)
    autoZuschnitt.current = true
    setQuelle(c); setVorschau(c.toDataURL('image/jpeg', 0.85)); setErgebnis(''); setKi(null)
    setEcken([{ x: 0, y: 0 }, { x: c.width, y: 0 }, { x: c.width, y: c.height }, { x: 0, y: c.height }])
  }
  useEffect(() => { if (autoZuschnitt.current && quelle && ecken) { autoZuschnitt.current = false; zuschneiden() } }) // eslint-disable-line react-hooks/exhaustive-deps

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
    lupeZeigen(g[best])
  }
  const bewegen = (ev) => {
    const gr = griff.current; if (!gr) return
    const p = punkt(ev)
    const e = gr.basis.map((q) => ({ ...q }))
    // Ecke um die Fingerbewegung verschieben (springt beim Antippen nicht unter den Finger, der sie sonst verdeckt);
    // langsam und genau: halbe Fingerbewegung, so trifft man die Kante leichter
    if (gr.i < 4) e[gr.i] = { x: Math.max(0, Math.min(quelle.width, gr.basis[gr.i].x + (p.x - gr.start.x) * 0.5)), y: Math.max(0, Math.min(quelle.height, gr.basis[gr.i].y + (p.y - gr.start.y) * 0.5)) }
    else {
      // Kante einrücken: nur senkrecht zur Kante verschieben (die Linie rutscht nicht zur Seite)
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

  // Zuschneiden, dann liest die KI den geraden, kontrastreichen Beleg (deutlich zuverlässiger als das Rohfoto)
  const zuschneiden = () => {
    setBusy('Schneide zu …')
    setTimeout(async () => {
      let url = ''
      try {
        // „Dokument“ (Schatten weg, schwarze Schrift auf Weiß) als Standard, „Farbe“ als Alternative
        const roh = entzerren(quelle, ecken, 1600)
        const farbe = document.createElement('canvas'); farbe.width = roh.width; farbe.height = roh.height
        farbe.getContext('2d').drawImage(roh, 0, 0)
        const dok = dokumentFilter(roh)
        kiBilder.current = kiStuecke(dok)
        const f = { dokument: dok.toDataURL('image/jpeg', 0.8), farbe: verbessern(farbe).toDataURL('image/jpeg', 0.8) }
        setFassungen(f); url = f.dokument; setModus('dokument'); setErgebnis(url)
      }
      catch (err) { melden('Zuschneiden fehlgeschlagen: ' + (err && err.message ? err.message : err)); setBusy(''); return }
      if (ki || korrektur || nurBild) { setBusy(''); return }
      setBusy('KI liest den Beleg …')
      const meinLauf = lauf.current
      try {
        // langer Beleg: Detailstücke und dazu das Übersichtsfoto zur Orientierung
        const uebersichtUrl = uebersicht ? uebersicht.toDataURL('image/jpeg', 0.8) : undefined
        const k = lang && videoStuecke.current && videoStuecke.current.length
          ? await belegLesen(videoStuecke.current, gewerke, projekt, uebersichtUrl, true)
          : lang && uebersicht
          ? await belegLesen(kiBilder.current, gewerke, projekt, uebersichtUrl)
          : await belegLesen(kiBilder.current && kiBilder.current.length > 1 ? kiBilder.current : url, gewerke, projekt)
        if (meinLauf !== lauf.current) return // inzwischen neu gescannt
        setKi({
          lieferant: k.lieferant || '', datum: /^\d{4}-\d{2}-\d{2}$/.test(k.datum || '') ? k.datum : '',
          betrag: k.betrag != null ? String(k.betrag).replace('.', ',') : '',
          positionen: (Array.isArray(k.positionen) ? k.positionen : []).filter((p) => p && p.bezeichnung)
            .map((p) => ({ bezeichnung: String(p.bezeichnung), menge: Number(p.menge) || 1, gesamt: String(p.gesamt ?? '').replace('.', ','), gewerk: gewerke.includes(p.gewerk) ? p.gewerk : (gewerke.includes(k.gewerk) ? k.gewerk : gewerke[0]), privat: Boolean(p.privat), verschleiss: Boolean(p.verschleiss) && !p.privat, anteil: String(verschleissProzent), grund: p.grund || '' })),
        })
      } catch (err) {
        if (meinLauf !== lauf.current) return
        setKi({ lieferant: '', datum: '', betrag: '', positionen: [] })
        melden('KI konnte den Beleg nicht lesen: ' + (err && err.message ? err.message : err) + '\nDu kannst die Angaben selbst eintragen.')
      }
      setBusy('')
    }, 30)
  }
  const setPos = (i, patch) => setKi((k) => ({ ...k, positionen: k.positionen.map((p, j) => (j === i ? { ...p, ...patch } : p)) }))
  const fertig = async (weiter) => {
    const betrag = parseBetrag(ki.betrag)
    if (Number.isNaN(betrag) || betrag <= 0) { melden('Bitte den Gesamtbetrag des Belegs eintragen, z. B. 127,53.'); return }
    const alle = ki.positionen.map((p) => ({ ...p, gesamt: parseBetrag(p.gesamt) })).filter((p) => p.bezeichnung.trim() && Number.isFinite(p.gesamt) && p.gesamt > 0)
    const summe = alle.reduce((a, p) => a + p.gesamt, 0)
    if (alle.length && Math.abs(summe - betrag) > 0.01 && !await frage('Die Positionen ergeben ' + eur(summe) + ', der Beleg ' + eur(betrag) + '.\n\nTrotzdem speichern? Die Differenz von ' + eur(betrag - summe) + ' wird als eigene Zeile „Differenz laut Beleg“ gebucht und in den Materialbelegen markiert.')) return
    // Verschleißteile: nur der eingestellte Anteil wird berechnet
    const positionen = alle.filter((p) => !p.privat).map((p) => ({ ...p, anteil: p.verschleiss ? Math.max(0, Math.min(100, parseBetrag(p.anteil) || 0)) : 100 }))
    const privat = alle.filter((p) => p.privat).reduce((a, p) => a + p.gesamt, 0)
    // Originalfoto (komprimiert) und Ecken mitgeben, damit der Zuschnitt später korrigierbar bleibt
    // langer Beleg: das zusammengesetzte Bild ist schon zugeschnitten, ein Rohbild bräuchte nur Platz (und sprengt sonst den Cloud-Upload)
    const roh = lang ? null : { bild: quelle.toDataURL('image/jpeg', 0.7), ecken }
    const privatPositionen = alle.filter((p) => p.privat)
    const bildUrl = lang ? await ablagefassung(ergebnis) : ergebnis
    onFertig({ dataUrl: bildUrl, lieferant: ki.lieferant.trim(), datum: ki.datum, betrag, positionen, privat, privatPositionen, roh }, { weiter })
  }

  if (!quelle) {
    return (
      <div className="space-y-2">
        <div className="text-white/75 text-xs">Beleg flach auf einen dunklen Untergrund legen und den ganzen Beleg fotografieren. Die App prüft, ob die Schrift scharf genug ist – bei langen Belegen führt sie dich danach durch einen Video-Scan.</div>
        <button onClick={() => setFotoKamera(true)} disabled={!!busy} className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2"><Camera className="w-5 h-5" /> Beleg fotografieren</button>
        <button onClick={() => galerie.current.click()} disabled={!!busy} className="w-full text-white/60 text-xs py-1 inline-flex items-center justify-center gap-1.5"><ImagePlus className="w-3.5 h-3.5" /> Vorhandenes Bild wählen</button>
        <input ref={galerie} type="file" accept="image/*" className="hidden" onChange={laden} />
        {busy && <div className="text-amber text-sm">{busy}</div>}
        {onOhneBeleg && <button onClick={onOhneBeleg} className="w-full text-white/60 text-xs py-1">Ohne Beleg eintragen – per Sprache oder von Hand</button>}
        {onAbbrechen && <button onClick={onAbbrechen} className="w-full text-white/70 text-sm py-1">Abbrechen</button>}
        {fotoKamera && <VideoScan onFoto={(c) => { setFotoKamera(false); setBusy('Lade Foto …'); uebernehmen(c).catch((err) => melden(err && err.message ? err.message : String(err))).finally(() => setBusy('')) }} onAbbrechen={() => setFotoKamera(false)} />}
      </div>
    )
  }

  const r = quelle.width / 30
  return (
    <div className="space-y-3">
      {!ergebnis ? createPortal(
        // Ecken setzen im Vollbild: das Foto nutzt den ganzen Bildschirm, die Knöpfe stehen fest unten.
        // Nichts muss gescrollt werden, so verschiebt man beim Scrollen keine Linie aus Versehen.
        <div className="fixed inset-0 z-[90] bg-black flex flex-col text-white">
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{lang ? 'Zuschnitt prüfen' : 'Ecken an den Beleg ziehen'}</div>
              <div className="text-white/60 text-xs leading-tight">Ecken oder Kantenmitten ziehen – sie bewegen sich langsamer als der Finger, die Lupe zeigt die Stelle.</div>
            </div>
            {onAbbrechen && <button onClick={onAbbrechen} className="p-2 rounded-full bg-white/10 shrink-0" title="Abbrechen"><X className="w-5 h-5" /></button>}
          </div>
          <div ref={flaeche} className="flex-1 min-h-0 flex items-center justify-center px-2">
            <div className="relative select-none touch-none" style={bildMass ? { width: bildMass.w, height: bildMass.h } : { visibility: 'hidden' }} onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}>
              <img ref={bild} src={vorschau} alt="" className="block w-full h-full rounded-lg pointer-events-none" draggable={false} />
              {ecken && (
                <svg ref={svg} viewBox={'0 0 ' + quelle.width + ' ' + quelle.height} className="absolute inset-0 w-full h-full pointer-events-none">
                  <polygon points={ecken.map((p) => p.x + ',' + p.y).join(' ')} fill="rgba(245,158,11,0.15)" stroke="#f59e0b" strokeWidth={quelle.width / 200} />
                  {griffe(ecken).map((p, i) => (
                    <circle key={i} data-g={i} cx={p.x} cy={p.y} r={i < 4 ? r : r * 0.65} fill={i < 4 ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.85)'} stroke={i < 4 ? '#fff' : '#f59e0b'} strokeWidth={quelle.width / 300} />
                  ))}
                </svg>
              )}
              <div ref={lupe} className="absolute pointer-events-none rounded-full border-2 border-amber shadow-2xl overflow-hidden"
                style={{ display: 'none', width: LUPE, height: LUPE, backgroundImage: 'url(' + vorschau + ')', backgroundRepeat: 'no-repeat', backgroundColor: '#000' }}>
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-amber/90" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-amber/90" />
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {busy && <div className="text-amber text-sm text-center">{busy}</div>}
            {videoNoetig && !lang ? (
              <div className="rounded-2xl p-3 space-y-2 border border-amber/50 bg-amber/10">
                <div className="font-bold text-amber flex items-center gap-2"><ScrollText className="w-5 h-5" /> Achtung: Video-Scan nötig</div>
                <div className="text-white/85 text-xs">Der Beleg ist zu lang für ein Foto: die Schrift wäre zu klein ({Math.round(videoNoetig.pxProZeichen)} statt mindestens {MIN_PX} Bildpunkte je Buchstabe). Dein Foto dient als Übersicht, dann fährst du mit dem Handy einmal über den Beleg.</div>
                <button onClick={zumVideo} disabled={!!busy} className="w-full rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><ScrollText className="w-5 h-5" /> Video-Scan starten</button>
                <div className="flex justify-between gap-2 text-xs">
                  <button onClick={() => nochmal(true)} className="text-amber inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Neues Foto</button>
                  <button onClick={() => setAnleitung('nur')} className="text-amber">Anleitung</button>
                  <button onClick={() => { setVideoNoetig(null); zuschneiden() }} className="text-white/60">Trotzdem nur mit Foto weiter</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => nochmal(true)} className="rounded-2xl py-3 bg-white/10 inline-flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Neues Foto</button>
                <button onClick={korrektur || nurBild || lang ? zuschneiden : weiter} disabled={!!busy} className="rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50"><ScanLine className="w-4 h-4" /> {korrektur || nurBild || lang ? 'Zuschneiden' : 'Weiter'}</button>
              </div>
            )}
          </div>
          {anleitung && <VideoAnleitung onFertig={() => { const weiterZumVideo = anleitung !== 'nur'; setAnleitung(false); if (weiterZumVideo) setTimeout(zumVideo, 0) }} />}
        </div>,
        document.body,
      ) : (
        <>
          <button onClick={() => setGross(true)} className="block w-full relative">
            <img src={ergebnis} alt="Beleg" className="w-full max-h-[45dvh] object-contain rounded-xl bg-black/40 border border-white/20" />
            <span className="absolute bottom-2 right-2 text-xs bg-black/70 text-white rounded-full px-2.5 py-1">Antippen zum Vergrößern</span>
          </button>
          {gross && <Vollbild src={ergebnis} onClose={() => setGross(false)} />}
          {markiert && <Vollbild src={ergebnis} markierung={markiert.markierung} titel={markiert.titel} onClose={() => setMarkiert(null)} />}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              {!korrektur && !nurBild && lang && <button onClick={() => nochmal(false)} className="text-amber text-xs inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Video wiederholen</button>}
              {!korrektur && !nurBild && <button onClick={() => nochmal(true)} className="text-amber text-xs inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Neues Foto</button>}
              <button onClick={() => setErgebnis('')} className="text-amber text-xs">Zuschnitt ändern</button>
            </div>
            {fassungen && (
              <div className="flex rounded-xl overflow-hidden border border-white/20 text-xs">
                {[['dokument', 'Dokument'], ['farbe', 'Farbe']].map(([k, t]) => (
                  <button key={k} onClick={() => { setModus(k); setErgebnis(fassungen[k]) }} className={'px-3 py-1.5 ' + (modus === k ? 'btn-grad font-semibold' : 'bg-white/5 text-white/75')}>{t}</button>
                ))}
              </div>
            )}
          </div>
          {korrektur || nurBild ? (
            <button onClick={() => onKorrigiert(ergebnis, ecken, korrektur ? korrektur.bild : quelle.toDataURL('image/jpeg', 0.7))} className="w-full rounded-2xl py-3 font-bold btn-grad">{nurBild ? 'Bild übernehmen' : 'Zuschnitt übernehmen'}</button>
          ) : !ki ? <div className="text-amber text-sm">KI liest den Beleg …</div> : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={ki.lieferant} onChange={(e) => setKi({ ...ki, lieferant: e.target.value })} placeholder="Lieferant" className={inp} />
                <input type="date" value={ki.datum} onChange={(e) => setKi({ ...ki, datum: e.target.value })} className={inp} />
              </div>
              <div className="text-white/80 text-sm font-semibold pt-1">Positionen</div>
              {ki.positionen.map((p, i) => (
                <div key={i} className={'flex flex-wrap items-center gap-1.5 ' + (p.privat ? 'rounded-xl p-1.5 bg-ember/10 border border-ember/40' : p.verschleiss ? 'rounded-xl p-1.5 bg-amber/10 border border-amber/40' : '')}>
                  {p.privat && <div className="w-full text-ember text-xs font-semibold">Privat? {p.grund || 'gehört vermutlich nicht zur Baustelle'} – wird nicht verrechnet</div>}
                  {p.verschleiss && !p.privat && (
                    <div className="w-full text-amber text-xs font-semibold flex items-center gap-1.5 flex-wrap">
                      Verschleißteil{p.grund ? ' (' + p.grund + ')' : ''} – berechnet werden
                      <input value={p.anteil} onChange={(e) => setPos(i, { anteil: e.target.value })} inputMode="decimal" className="w-12 bg-white/10 border border-amber/40 rounded px-1 py-0.5 text-right" /> %
                      = {eur((parseBetrag(p.gesamt) || 0) * (parseBetrag(p.anteil) || 0) / 100)}
                    </div>
                  )}
                  <input value={p.bezeichnung} onChange={(e) => setPos(i, { bezeichnung: e.target.value })} className={inp + ' flex-1 min-w-[10rem] py-1.5 text-sm'} />
                  <select value={p.gewerk} onChange={(e) => setPos(i, { gewerk: e.target.value })} className="bg-white/10 border border-white/20 rounded-lg px-1.5 py-1.5 text-xs max-w-[7.5rem]">
                    {gewerke.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input value={p.gesamt} onChange={(e) => setPos(i, { gesamt: e.target.value })} inputMode="decimal" className="w-20 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-right" />
                  <button onClick={() => setPos(i, { privat: !p.privat, verschleiss: false })} className={'text-xs px-2 py-1 rounded-lg border ' + (p.privat ? 'border-ember/60 text-ember' : 'border-white/20 text-white/60')}>privat</button>
                  <button onClick={() => setPos(i, { verschleiss: !p.verschleiss, privat: false, anteil: p.anteil || String(verschleissProzent) })} className={'text-xs px-2 py-1 rounded-lg border ' + (p.verschleiss ? 'border-amber/60 text-amber' : 'border-white/20 text-white/60')}>Verschleiß</button>
                  <button title="Auf dem Beleg zeigen" disabled={suchePos >= 0} onClick={async () => {
                    setSuchePos(i)
                    let markierung = null
                    try { markierung = await positionFinden(ergebnis, p.bezeichnung) } catch { /* ohne Markierung zeigen */ }
                    setSuchePos(-1)
                    setMarkiert({ markierung, titel: p.bezeichnung + (markierung ? '' : ' (Stelle nicht gefunden)') })
                  }} className="text-amber p-1 disabled:opacity-50">{suchePos === i ? <span className="text-xs">…</span> : <Search className="w-4 h-4" />}</button>
                  <button onClick={() => setKi({ ...ki, positionen: ki.positionen.filter((_, j) => j !== i) })} className="text-white/60 hover:text-ember p-1"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => setKi({ ...ki, positionen: [...ki.positionen, { bezeichnung: '', menge: 1, gesamt: '', gewerk: gewerke[0] }] })} className="text-amber text-xs inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Position hinzufügen</button>
              {(() => {
                const summe = ki.positionen.reduce((a, p) => a + (parseBetrag(p.gesamt) || 0), 0), betrag = parseBetrag(ki.betrag) || 0
                const privat = ki.positionen.filter((p) => p.privat).reduce((a, p) => a + (parseBetrag(p.gesamt) || 0), 0)
                return <>
                  {(() => {
                    const rest = ki.positionen.filter((p) => p.verschleiss && !p.privat).reduce((a, p) => a + (parseBetrag(p.gesamt) || 0) * (1 - (parseBetrag(p.anteil) || 0) / 100), 0)
                    return (privat > 0 || rest > 0) ? <div className="text-amber text-xs font-semibold">{privat > 0 ? 'Privat ' + eur(privat) + ' · ' : ''}{rest > 0 ? 'Verschleiß nicht berechnet ' + eur(rest) + ' · ' : ''}Dem Kunden werden {eur(betrag - privat - rest)} berechnet.</div> : null
                  })()}
                  {Math.abs(summe - betrag) > 0.01 && ki.positionen.length ? (
                    <div className="rounded-xl px-3 py-2 text-sm border bg-ember/10 text-ember border-ember/40">
                      <div className="font-semibold">{summe < betrag ? 'Es fehlen ' + eur(betrag - summe) : 'Es sind ' + eur(summe - betrag) + ' zu viel'}</div>
                      <div className="text-xs">Die Positionen ergeben {eur(summe)}, der Beleg {eur(betrag)}. {summe < betrag ? 'Vermutlich wurde eine Zeile nicht erkannt.' : 'Vermutlich ist eine Zeile doppelt.'} Bitte mit dem Bild vergleichen (antippen zum Vergrößern) und die Position {summe < betrag ? 'mit „Position hinzufügen“ ergänzen' : 'mit dem X entfernen'} oder neu scannen.</div>
                    </div>
                  ) : null}
                </>
              })()}
              <div className="flex items-center gap-2">
                <span className="text-white/80 text-sm shrink-0">Gesamt brutto €</span>
                <input value={ki.betrag} onChange={(e) => setKi({ ...ki, betrag: e.target.value })} inputMode="decimal" className={inp} />
              </div>
              {/* Speichern bleibt beim Scrollen durch lange Positionslisten unten erreichbar */}
              <div className="grid grid-cols-2 gap-2 sticky bottom-0 z-10 -mx-2 px-2 py-2 rounded-2xl bg-neutral-900/95 shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
                <button onClick={() => fertig(false)} className="rounded-2xl py-3 font-semibold bg-white/10">Speichern</button>
                <button onClick={() => fertig(true)} className="rounded-2xl py-3 font-bold btn-grad">Speichern &amp; nächster</button>
              </div>
            </div>
          )}
        </>
      )}
      {busy && <div className="text-amber text-sm">{busy}</div>}
      {video && uebersicht && <VideoScan uebersicht={uebersicht} onFertig={videoFertig} onAbbrechen={() => setVideo(false)} />}
    </div>
  )
}
