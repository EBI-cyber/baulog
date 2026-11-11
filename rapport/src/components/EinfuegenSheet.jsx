import { useEffect, useState } from 'react'
import { ClipboardPaste, CheckCircle2 } from 'lucide-react'
import Sheet from './Sheet'
import { db } from '../lib/db'
import { useEinstellungen } from '../lib/settings'
import { kern, linksLesen, zeilenBerechnen, einsatzSichern, zeilenSpeichern } from '../lib/nachtragen'
import { wochenKey } from '../lib/zeit'

/**
 * Wochen aus kopierten Nachtrag-Links übernehmen — direkt in der installierten App.
 * (Links aus Chat/Mail öffnen auf dem iPhone einen eigenen Browser mit eigenem Speicher,
 * dort Übernommenes landet nicht in der App vom Home-Bildschirm.)
 */
export default function EinfuegenSheet({ onClose }) {
  const [einst, setEinst] = useEinstellungen()
  const [text, setText] = useState('')
  const [vorschau, setVorschau] = useState([])
  const [fertig, setFertig] = useState(null)
  const [fehler, setFehler] = useState('')
  const funde = linksLesen(text)

  async function einfuegen() {
    setFehler('')
    try { setText(await navigator.clipboard.readText()) }
    catch { setFehler('Kein Zugriff auf die Zwischenablage — bitte unten ins Feld tippen und „Einsetzen“ wählen.') }
  }

  // Vorschau: pro Woche Tage/Stunden und was schon erfasst ist
  useEffect(() => {
    let aus = false
    ;(async () => {
      const liste = []
      for (const f of funde) {
        const vorhanden = await db.schichten.where('wocheKey').equals(wochenKey(f.woche)).toArray()
        const einsatz = f.vorgabe.firma && (await db.einsaetze.toArray()).find((e) => kern(e.firma) === kern(f.vorgabe.firma))
        const zeilen = zeilenBerechnen({ woche: f.woche, ...f.vorgabe, beginn: f.vorgabe.beginn || einsatz?.arbeitsbeginn, vorhanden })
        const neu = zeilen.filter((z) => z.min > 0 && !z.schon.length)
        const schon = zeilen.filter((z) => z.min > 0 && z.schon.length)
        liste.push({ ...f, zeilen, neu: neu.length, schon: schon.length, std: neu.reduce((s, z) => s + z.min, 0) / 60 })
      }
      if (!aus) setVorschau(liste)
    })()
    return () => { aus = true }
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uebernehmen() {
    let tage = 0
    const firmen = [...(einst.firmen || [])]
    let buero = einst.buero
    for (const w of vorschau) {
      const v = w.vorgabe
      const firma = firmen.find((f) => kern(f) === kern(v.firma)) || v.firma || einst.firma || firmen[0]
      if (!firma) { setFehler('Im Link fehlt die Firma.'); return }
      if (!firmen.includes(firma)) firmen.push(firma)
      const einsatz = await db.einsaetze.where('firma').equals(firma).first()
      const b = einsatz?.buero || v.buero || einst.buero || ''
      if (b) await einsatzSichern({ firma, buero: b, vorgabe: v })
      buero = buero || b
      // neu berechnen (vorige Woche kann Tage ergänzt haben)
      const vorhanden = await db.schichten.where('wocheKey').equals(wochenKey(w.woche)).toArray()
      const zeilen = zeilenBerechnen({ woche: w.woche, ...v, beginn: v.beginn || einsatz?.arbeitsbeginn, vorhanden })
      tage += await zeilenSpeichern({ woche: w.woche, zeilen, firma, papier: v.papier })
    }
    setEinst({ firmen, firma: einst.firma && firmen.includes(einst.firma) ? einst.firma : firmen[firmen.length - 1], buero })
    setFertig({ wochen: vorschau.length, tage })
  }

  if (fertig) return (
    <Sheet titel="Übernommen" icon={CheckCircle2} onClose={onClose}>
      <div className="text-sm text-white/70">{fertig.tage} Tage in {fertig.wochen} {fertig.wochen === 1 ? 'Woche' : 'Wochen'} gespeichert.</div>
      <button onClick={onClose} className="w-full rounded-2xl py-3 font-bold btn-grad">Fertig</button>
    </Sheet>
  )

  return (
    <Sheet titel="Wochen einfügen" icon={ClipboardPaste} onClose={onClose}>
      <div className="text-sm text-white/55">Link(s) kopieren (lange drücken → Kopieren), dann hier einfügen. Mehrere Wochen auf einmal gehen auch.</div>
      <button onClick={einfuegen} className="w-full rounded-2xl py-3 font-semibold bg-white/10 inline-flex items-center justify-center gap-2">
        <ClipboardPaste className="w-4 h-4" /> Aus Zwischenablage einfügen
      </button>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="…oder hier einfügen" className="eingabe text-xs" />
      {text && !funde.length && <div className="text-sm text-amber-300">Kein Nachtrag-Link erkannt.</div>}
      {vorschau.map((w) => (
        <div key={w.key} className="glass rounded-2xl px-4 py-3 text-sm">
          <div className="flex justify-between font-semibold"><span>KW {w.woche.kw} / {w.woche.jahr}</span><span className="tabular-nums">{w.std.toFixed(2)} h</span></div>
          <div className="text-white/50">
            {w.neu} {w.neu === 1 ? 'Tag' : 'Tage'} neu{w.schon ? ` · ${w.schon} schon erfasst (bleiben)` : ''}
            {w.vorgabe.firma ? ` · ${w.vorgabe.firma}` : ''}{w.vorgabe.papier ? ' · auf Papier abgegeben' : ''}
          </div>
        </div>
      ))}
      {fehler && <div className="text-sm rounded-xl px-3 py-2 bg-ember/15 border border-ember/30 text-ember">{fehler}</div>}
      {vorschau.length > 0 && (
        <button onClick={uebernehmen} className="w-full rounded-2xl py-3 font-bold btn-grad">
          {vorschau.length === 1 ? 'Woche übernehmen' : `${vorschau.length} Wochen übernehmen`}
        </button>
      )}
    </Sheet>
  )
}
