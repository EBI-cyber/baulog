import { useEffect, useRef, useState } from 'react'

// Live-Kamera (Rückkamera) mit Auslöser; Fallback auf Datei-Auswahl wenn nicht verfügbar
export default function CameraCapture({ onCapture }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}) }
      } catch {
        setError('Kamera nicht verfügbar — bitte Datei wählen.')
      }
    })()
    return () => { active = false; if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()) }
  }, [])

  function snap() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const w = v.videoWidth, h = v.videoHeight
    const scale = Math.min(1, 1600 / w)
    const c = document.createElement('canvas')
    c.width = Math.round(w * scale); c.height = Math.round(h * scale)
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    onCapture(c.toDataURL('image/jpeg', 0.8))
  }
  function onFile(e) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    const r = new FileReader(); r.onload = () => onCapture(r.result); r.readAsDataURL(f)
  }

  if (error) {
    return (
      <div>
        <div className="text-white/50 text-sm mb-2">{error}</div>
        <input type="file" accept="image/*" capture="environment" onChange={onFile} className="text-sm" />
      </div>
    )
  }
  return (
    <div>
      <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-[3/4] object-cover" />
      <button onClick={snap} className="w-full mt-2 rounded-2xl py-3 font-bold bg-gradient-to-r from-amber to-ember text-ink active:scale-[0.98] transition">📷 Aufnehmen</button>
    </div>
  )
}
