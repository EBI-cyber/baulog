import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { ortSuchen } from '../lib/plz'

/** Eingabe „Ort oder PLZ“ mit Vorschlägen; Auswahl liefert { plz, ort, kanton } */
export default function OrtSuche({ wert, onWahl, placeholder = 'Ort oder PLZ' }) {
  const [text, setText] = useState(wert || '')
  const [treffer, setTreffer] = useState([])
  const [offen, setOffen] = useState(false)
  const nr = useRef(0)
  useEffect(() => { setText(wert || '') }, [wert])
  useEffect(() => {
    const n = ++nr.current
    if (!offen) return
    ortSuchen(text).then((t) => { if (n === nr.current) setTreffer(t) })
  }, [text, offen])

  return (
    <div className="relative">
      <MapPin className="w-4 h-4 absolute left-3 top-3.5 text-white/35" />
      <input className="eingabe pl-9" value={text} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { setText(e.target.value); setOffen(true) }} onFocus={() => setOffen(true)}
        onBlur={() => setTimeout(() => setOffen(false), 150)} />
      {offen && treffer.length > 0 && (
        <div className="absolute z-40 left-0 right-0 mt-1 rounded-xl bg-[#0b1f2a] border border-white/15 shadow-xl overflow-hidden">
          {treffer.map((t) => (
            <button key={t.plz + t.ort} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onWahl(t); setText(`${t.plz} ${t.ort}`); setOffen(false) }}
              className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-white/10 border-b border-white/5 last:border-0">
              <span className="tabular-nums text-white/50 w-10">{t.plz}</span>
              <span className="flex-1 truncate">{t.ort}</span>
              <span className="text-xs text-white/40">{t.kanton}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
