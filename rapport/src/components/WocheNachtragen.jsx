import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarPlus, Info, Copy } from 'lucide-react'
import Sheet from './Sheet'
import FirmaWahl from './FirmaWahl'
import { db } from '../lib/db'
import { useEinstellungen } from '../lib/settings'
import { wochenTage, wochenKey, TAGE_LANG, datumKurz, uhr } from '../lib/zeit'
import { kern, zeilenBerechnen, einsatzSichern, zeilenSpeichern } from '../lib/nachtragen'

/**
 * Ganze Woche auf einmal nachtragen, z.B. vom Papier-Rapport: Stunden pro Tag → Schichten
 * mit Beginn aus dem Einsatz und der Mindestpause nach ArG (änderbar).
 * vorgabe = { stunden: [Mo..So], zeiten: [Mo..So: [[von,bis],…]], notizen: [Mo..So], firma, beginn, papier }
 * (z.B. aus einem Link). Mit genauen Zeiten werden die Lücken dazwischen als Pausen gespeichert.
 */
export default function WocheNachtragen({ woche, vorgabe = {}, onClose }) {
  const [einst, setEinst] = useEinstellungen()
  const tage = wochenTage(woche)
  const wKey = wochenKey(woche)
  const einsaetze = useLiveQuery(() => db.einsaetze.toArray(), [], null)
  const vorhanden = useLiveQuery(() => db.schichten.where('wocheKey').equals(wKey).toArray(), [wKey], null)
  const firmaVorgabe = vorgabe.firma && (einst.firmen || []).find((f) => kern(f) === kern(vorgabe.firma))
  const [firma, setFirma] = useState(firmaVorgabe || vorgabe.firma || einst.firma || einst.firmen?.[0] || '')
  const firmen = [...new Set([...(einst.firmen || []), ...(firma ? [firma] : [])])]
  const einsatz = (einsaetze || []).find((e) => e.firma === firma)
  const [buero, setBuero] = useState(null) // null = aus Einsatz/Link/Einstellungen
  const bueroWert = buero ?? (einsatz?.buero || vorgabe.buero || einst.buero || '')
  const [beginn, setBeginn] = useState(vorgabe.beginn || '')
  const [stunden, setStunden] = useState(() => tage.map((_, i) => vorgabe.stunden?.[i] ?? ''))
  const [pausen, setPausen] = useState(() => tage.map(() => null)) // null = automatisch
  const [zeiten, setZeiten] = useState(() => tage.map((_, i) => vorgabe.zeiten?.[i]?.length ? vorgabe.zeiten[i] : null))
  const [papier, setPapier] = useState(!!vorgabe.papier)
  const [fehler, setFehler] = useState('')
  // Per Link im Browser geöffnet (nicht die App vom Home-Bildschirm)? Dann landen die Daten nicht in der App.
  const imBrowser = !!(vorgabe.stunden || vorgabe.zeiten) && !(window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches)
  const [kopiert, setKopiert] = useState(false)

  // Beginn aus dem Einsatzvertrag, sonst 07:00
  useEffect(() => {
    if (!einsaetze || beginn) return
    setBeginn(einsaetze.find((e) => e.firma === firma)?.arbeitsbeginn || '07:00')
  }, [einsaetze]) // eslint-disable-line react-hooks/exhaustive-deps

  const zeilen = useMemo(() => zeilenBerechnen({ woche, stunden, zeiten: zeiten.map((z) => z || []), pausen, notizen: vorgabe.notizen, beginn, vorhanden: vorhanden || [] }),
    [woche, stunden, pausen, zeiten, beginn, vorhanden]) // eslint-disable-line react-hooks/exhaustive-deps

  const neu = zeilen.filter((z) => z.min > 0 && !z.schon.length)
  const total = zeilen.reduce((s, z) => s + z.min, 0) / 60

  async function uebernehmen() {
    if (!firma) return setFehler('Bitte den Einsatzbetrieb wählen.')
    if (!bueroWert.trim()) return setFehler('Bitte das Temporärbüro eintragen.')
    if (!neu.length && !papier) return setFehler('Keine neuen Stunden eingetragen.')
    if (neu.some((z) => z.start > Date.now())) return setFehler('Ein Tag liegt in der Zukunft.')
    const b = bueroWert.trim()
    await einsatzSichern({ firma, buero: b, vorgabe })
    setEinst({ firmen, firma: einst.firma && firmen.includes(einst.firma) ? einst.firma : firma, buero: einst.buero || b })
    await zeilenSpeichern({ woche, zeilen, firma, papier })
    onClose(neu.length)
  }

  return (
    <Sheet titel={`KW ${woche.kw} nachtragen`} icon={CalendarPlus} onClose={() => onClose(0)}>
      {imBrowser && (
        <div className="text-sm rounded-2xl px-4 py-3 bg-amber-400/10 border border-amber-400/30 text-amber-200 space-y-2">
          <div>Dieser Link ist im <b>Browser</b> offen, nicht in deiner Rapport-App. Was du hier speicherst, erscheint nicht in der App. Besser: Link kopieren, App öffnen → Kalender → „Wochen einfügen“.</div>
          <button onClick={async () => { try { await navigator.clipboard.writeText(location.href); setKopiert(true) } catch { /* */ } }}
            className="rounded-xl px-3 py-1.5 bg-white/10 text-white font-semibold inline-flex items-center gap-1.5"><Copy className="w-4 h-4" /> {kopiert ? 'Kopiert' : 'Link kopieren'}</button>
        </div>
      )}
      <label className="block text-xs text-white/50">Einsatzbetrieb</label>
      <FirmaWahl firmen={firmen} wert={firma} onWahl={(f) => { setFirma(f); setBuero(null) }}
        onNeu={(n) => setEinst({ firmen: [...(einst.firmen || []), n] })} />
      <div>
        <label className="block text-xs text-white/50 mb-1">Temporärbüro</label>
        <input value={bueroWert} onChange={(e) => setBuero(e.target.value)} placeholder="z.B. Bellini Personal AG" className="eingabe" />
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-white/60 flex-1">Arbeitsbeginn</label>
        <input type="time" value={beginn} onChange={(e) => setBeginn(e.target.value)} className="eingabe !w-32" />
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-[3.2rem_1fr_4.2rem_5.5rem] gap-2 text-[11px] text-white/40 px-1">
          <span>Tag</span><span>Stunden</span><span>Pause</span><span className="text-right">Zeit</span>
        </div>
        {zeilen.map((z) => (
          <div key={z.datum} className="grid grid-cols-[3.2rem_1fr_4.2rem_5.5rem] gap-2 items-center">
            <div className="text-sm leading-tight"><b>{TAGE_LANG[z.t.getDay()].slice(0, 2)}</b><div className="text-[11px] text-white/40">{datumKurz(z.t)}</div></div>
            {z.schon.length ? (
              <div className="col-span-3 text-xs text-white/45">schon erfasst — bleibt wie es ist</div>
            ) : <>
              <input inputMode="decimal" value={z.genau ? (z.min / 60).toFixed(2) : stunden[z.i]} placeholder="–" aria-label={`Stunden ${TAGE_LANG[z.t.getDay()]}`}
                onChange={(e) => { setStunden(stunden.map((v, j) => (j === z.i ? e.target.value : v))); if (z.genau) setZeiten(zeiten.map((v, j) => (j === z.i ? null : v))) }} className="eingabe !py-2" />
              <input inputMode="numeric" readOnly={z.genau} value={z.min ? z.pause : ''} placeholder="–" aria-label={`Pause ${TAGE_LANG[z.t.getDay()]}`}
                onChange={(e) => setPausen(pausen.map((v, j) => (j === z.i ? Math.max(0, parseInt(e.target.value, 10) || 0) : v)))} className="eingabe !py-2" />
              <div className="text-xs text-right tabular-nums text-white/55">{z.min ? `${uhr(z.start)}–${uhr(z.ende)}` : ''}
                {z.genau && <div className="text-[10px] text-white/35">{z.luecken.length} Pause{z.luecken.length === 1 ? '' : 'n'}</div>}</div>
            </>}
          </div>
        ))}
      </div>
      <div className="text-sm text-white/60">Total: <span className="font-bold text-white tabular-nums">{total.toFixed(2)} h</span></div>
      <div className="text-xs text-white/40 flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Stunden wie auf dem Rapport (dezimal: 10,75 = 10 h 45 min). Pause in Minuten, vorgeschlagen ist die Mindestpause nach Arbeitsgesetz.</div>

      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={papier} onChange={(e) => setPapier(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500" />
        <span>Rapport wurde schon auf Papier unterschrieben und abgegeben <span className="text-white/40">(Woche gilt als gesendet)</span></span>
      </label>

      {fehler && <div className="text-sm rounded-xl px-3 py-2 bg-ember/15 border border-ember/30 text-ember">{fehler}</div>}
      <button onClick={uebernehmen} className="w-full rounded-2xl py-3 font-bold btn-grad">
        {neu.length ? `${neu.length} Tage übernehmen` : 'Übernehmen'}
      </button>
    </Sheet>
  )
}
