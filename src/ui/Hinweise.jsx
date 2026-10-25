import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Info, RotateCcw } from 'lucide-react'

// App-eigene Abfragen, Meldungen und kurze Hinweise mit „Rückgängig“.
// Ersetzt confirm()/alert(): Browser (z. B. Edge am PC) unterdrücken native Abfragen, dann passierte beim Klick nichts.
// Aufruf von überall: await frage({ titel, text }) → true/false, melden(text), toast(text, { rueckgaengig }).
let liste = []
const hoerer = new Set()
let naechste = 1
const aendern = (neu) => { liste = neu; hoerer.forEach((fn) => fn(liste)) }
const entfernen = (id) => aendern(liste.filter((x) => x.id !== id))

export function frage(opt) {
  const o = typeof opt === 'string' ? { text: opt } : opt
  return new Promise((fertig) => aendern([...liste, { id: naechste++, art: 'frage', ...o, fertig }]))
}
export function melden(text, titel) {
  return new Promise((fertig) => aendern([...liste, { id: naechste++, art: 'meldung', text: String(text), titel, fertig }]))
}
export function toast(text, { rueckgaengig, dauer = 5000 } = {}) {
  const id = naechste++
  aendern([...liste, { id, art: 'toast', text, rueckgaengig }])
  setTimeout(() => entfernen(id), dauer)
}

export default function Hinweise() {
  const [l, setL] = useState(liste)
  useEffect(() => { hoerer.add(setL); return () => hoerer.delete(setL) }, [])
  const dialog = l.find((x) => x.art !== 'toast')
  const toasts = l.filter((x) => x.art === 'toast')
  const schliessen = (x, wert) => { entfernen(x.id); x.fertig && x.fertig(wert) }
  return createPortal(
    <>
      {dialog && (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4" onClick={() => dialog.art === 'meldung' && schliessen(dialog)}>
          <div className="glass w-full max-w-sm rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold flex items-start gap-2">
              {dialog.gefahr ? <AlertTriangle className="w-5 h-5 text-ember shrink-0 mt-0.5" /> : <Info className="w-5 h-5 text-amber shrink-0 mt-0.5" />}
              <span>{dialog.titel || (dialog.art === 'frage' ? 'Bitte bestätigen' : 'Hinweis')}</span>
            </div>
            <div className="text-white/80 text-sm whitespace-pre-line">{dialog.text}</div>
            {dialog.art === 'frage' ? (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => schliessen(dialog, false)} className="rounded-2xl py-3 bg-white/10 text-sm">{dialog.nein || 'Abbrechen'}</button>
                <button onClick={() => schliessen(dialog, true)} className={'rounded-2xl py-3 font-semibold text-sm ' + (dialog.gefahr ? 'bg-ember text-white' : 'btn-grad')}>{dialog.ja || 'Ja'}</button>
              </div>
            ) : (
              <button onClick={() => schliessen(dialog)} className="w-full rounded-2xl py-3 btn-grad font-semibold text-sm">OK</button>
            )}
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="fixed left-0 right-0 z-[190] flex flex-col items-center gap-2 px-4 pointer-events-none" style={{ bottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
          {toasts.map((x) => (
            <div key={x.id} className="pointer-events-auto glass rounded-2xl pl-4 pr-2 py-2 flex items-center gap-3 shadow-2xl max-w-md w-full bg-neutral-900/90">
              <span className="flex-1 text-sm">{x.text}</span>
              {x.rueckgaengig && (
                <button onClick={() => { entfernen(x.id); x.rueckgaengig() }} className="rounded-xl px-3 py-2 text-sm font-semibold text-amber inline-flex items-center gap-1.5 bg-white/10"><RotateCcw className="w-4 h-4" /> Rückgängig</button>
              )}
            </div>
          ))}
        </div>
      )}
    </>,
    document.body,
  )
}
