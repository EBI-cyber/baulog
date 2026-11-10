import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, Loader2, Share2, X, AlertTriangle } from 'lucide-react'
import { schnappschuss, signaturAnlegen, signaturStatus, signaturLink } from '../lib/signatur'
import { kiVerfuegbar } from '../lib/ki'

/**
 * QR-Code, den der Polier mit seinem Handy scannt: Er sieht den Rapport und unterschreibt dort.
 * Die Unterschrift kommt automatisch zurück (onUnterschrift({ bild, name, am })).
 */
export default function QrSignatur({ g, woche, ma, onUnterschrift }) {
  const [zustand, setZustand] = useState(null) // { token, qr, link } | 'laedt'
  const [antwort, setAntwort] = useState(null)
  const [fehler, setFehler] = useState('')
  const aktiv = useRef(true)
  const qrBox = useRef()
  useEffect(() => () => { aktiv.current = false }, [])

  async function starten() {
    setFehler(''); setAntwort(null); setZustand('laedt')
    try {
      const token = await signaturAnlegen(schnappschuss(g, woche, ma))
      const link = signaturLink(token)
      const qr = await QRCode.toDataURL(link, { margin: 1, width: 520, errorCorrectionLevel: 'M' })
      setZustand({ token, qr, link })
      setTimeout(() => qrBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      // auf die Antwort warten
      while (aktiv.current) {
        await new Promise((r) => setTimeout(r, 3000))
        if (document.visibilityState !== 'visible') continue
        const s = await signaturStatus(token, true).catch(() => null)
        if (!s || s.status === 'offen') continue
        setAntwort(s)
        if (s.status === 'unterschrieben') { onUnterschrift({ bild: s.bild, name: s.name, funktion: s.funktion || '', id: s.unterschreiberId || null, am: Date.parse(s.beantwortet) || Date.now(), email: s.email || '', tel: s.tel || '' }); setZustand(null) }
        return
      }
    } catch (e) { setFehler(e.message); setZustand(null) }
  }

  if (!kiVerfuegbar) return null
  return (
    <div className="space-y-2">
      {!zustand && (<>
        <button type="button" onClick={starten} disabled={!ma?.bild} className="w-full rounded-2xl py-2.5 bg-white/10 font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40">
          <QrCode className="w-4 h-4" /> Polier unterschreibt auf seinem Handy (QR-Code)
        </button>
        {!ma?.bild && <div className="text-xs text-white/40 text-center">Zuerst selbst unterschreiben — dann bekommt der Polier einen vollständigen Durchschlag.</div>}
      </>)}
      {zustand === 'laedt' && <div className="text-sm text-white/50 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> QR-Code wird erstellt …</div>}
      {zustand?.qr && (
        <div ref={qrBox} className="rounded-2xl bg-white p-4 text-center space-y-2 relative">
          <button type="button" onClick={() => { aktiv.current = false; setZustand(null); setTimeout(() => { aktiv.current = true }) }}
            className="absolute top-2 right-2 text-slate-400" aria-label="Schliessen"><X className="w-5 h-5" /></button>
          <img src={zustand.qr} alt="QR-Code zum Unterschreiben" className="mx-auto w-60 h-60" />
          <div className="text-slate-700 text-sm font-semibold">Polier: mit der Handy-Kamera scannen, Rapport prüfen und unterschreiben</div>
          <div className="text-slate-500 text-xs inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Warte auf Unterschrift …</div>
          <button type="button" onClick={() => navigator.share?.({ title: 'Rapport unterschreiben', url: zustand.link }).catch(() => {})}
            className="block mx-auto text-xs text-slate-600 underline inline-flex items-center gap-1"><Share2 className="w-3.5 h-3.5" /> Link stattdessen schicken (WhatsApp/SMS)</button>
        </div>
      )}
      {antwort?.status === 'abgelehnt' && (
        <div className="text-sm rounded-xl px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div><b>{antwort.name || 'Der Polier'}</b> ist nicht einverstanden{antwort.bemerkung ? `: „${antwort.bemerkung}“` : '.'} Bitte korrigieren und neu senden.</div>
        </div>
      )}
      {fehler && <div className="text-sm text-ember">{fehler}</div>}
    </div>
  )
}
