import { useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'

// Spracherkennung (Web Speech API) — transkribiert live auf Deutsch. Beste Unterstützung: Chrome/Android.
export default function VoiceInput({ onText }) {
  const [rec, setRec] = useState(false)
  const recRef = useRef(null)
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

  function toggle() {
    if (!SR) { alert('Spracherkennung wird hier nicht unterstützt — am besten Chrome / Android nutzen.'); return }
    if (rec) { recRef.current && recRef.current.stop(); return }
    const r = new SR()
    r.lang = 'de-DE'; r.interimResults = true; r.continuous = true
    let finalText = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += tr + ' '
        else interim += tr
      }
      onText((finalText + interim).trim())
    }
    r.onend = () => setRec(false)
    r.onerror = () => setRec(false)
    recRef.current = r; r.start(); setRec(true)
  }

  return (
    <button type="button" onClick={toggle}
      className={'rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 ' + (rec ? 'bg-ember text-white animate-pulse' : 'bg-white/10 text-white')}>
      {rec ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      {rec ? 'Stopp' : 'Diktieren'}
    </button>
  )
}
