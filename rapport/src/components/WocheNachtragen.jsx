import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarPlus, Info } from 'lucide-react'
import Sheet from './Sheet'
import FirmaWahl from './FirmaWahl'
import { db, speichern } from '../lib/db'
import { useEinstellungen } from '../lib/settings'
import { mindestPause } from '../lib/profil'
import { LOHN_STANDARD } from '../lib/lohn'
import { statusKey } from '../lib/rapporte'
import { wochenTage, wochenKey, isoDatum, TAGE_LANG, datumKurz, uhr } from '../lib/zeit'

/** "9,50" / "9.5" / "9:30" → Minuten (Rapportzettel rechnen dezimal: 10,75 = 10 h 45 min) */
export function stundenMinuten(t) {
  const s = String(t ?? '').trim().replace(',', '.')
  if (!s) return 0
  if (s.includes(':')) {
    const [h, m] = s.split(':').map((x) => parseInt(x, 10) || 0)
    return h * 60 + m
  }
  const v = parseFloat(s)
  return isNaN(v) || v < 0 ? 0 : Math.round(v * 60)
}

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
  // "Stüssi" / "Stüssi AG" / "Stüssi Betonvorfabrikation AG" = dieselbe Firma (erstes Wort)
  const kern = (x) => String(x || '').toLowerCase().trim().split(/\s+/)[0]
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

  // Beginn aus dem Einsatzvertrag, sonst 07:00
  useEffect(() => {
    if (!einsaetze || beginn) return
    setBeginn(einsaetze.find((e) => e.firma === firma)?.arbeitsbeginn || '07:00')
  }, [einsaetze]) // eslint-disable-line react-hooks/exhaustive-deps

  const zeilen = useMemo(() => tage.map((t, i) => {
    const datum = isoDatum(t)
    const schon = (vorhanden || []).filter((s) => s.datum === datum)
    const notiz = vorgabe.notizen?.[i] || ''
    if (zeiten[i]) {
      // genaue Zeiten: Beginn = erstes Von, Ende = letztes Bis, Lücken = Pausen
      const ts = zeiten[i].map(([a, b]) => [new Date(`${datum}T${a}`).getTime(), new Date(`${datum}T${b}`).getTime()])
      const min = ts.reduce((s, [a, b]) => s + Math.max(0, b - a), 0) / 60000
      const luecken = ts.slice(1).map(([a], k) => ({ start: ts[k][1], ende: a })).filter((x) => x.ende > x.start)
      const pause = luecken.reduce((s, x) => s + (x.ende - x.start), 0) / 60000
      return { t, i, datum, min, pause, start: ts[0][0], ende: ts[ts.length - 1][1], luecken, genau: true, notiz, schon }
    }
    const min = stundenMinuten(stunden[i])
    const pause = pausen[i] ?? mindestPause(min)
    const start = new Date(`${datum}T${beginn || '07:00'}`).getTime()
    const ende = start + (min + pause) * 60000
    return { t, i, datum, min, pause, start, ende, notiz, schon }
  }), [tage, stunden, pausen, zeiten, beginn, vorhanden]) // eslint-disable-line react-hooks/exhaustive-deps

  const neu = zeilen.filter((z) => z.min > 0 && !z.schon.length)
  const total = zeilen.reduce((s, z) => s + z.min, 0) / 60

  async function uebernehmen() {
    if (!firma) return setFehler('Bitte den Einsatzbetrieb wählen.')
    if (!bueroWert.trim()) return setFehler('Bitte das Temporärbüro eintragen.')
    if (!neu.length && !papier) return setFehler('Keine neuen Stunden eingetragen.')
    if (neu.some((z) => z.start > Date.now())) return setFehler('Ein Tag liegt in der Zukunft.')
    // Firma + Temporärbüro dauerhaft speichern (Einsatz anlegen bzw. ergänzen)
    const b = bueroWert.trim()
    const ergaenzt = {
      ...(einsatz || { firma, rapportVorlage: 'formular', fotos: [], unterschreiber: [], ...LOHN_STANDARD }),
      buero: b,
      firmaAdresse: einsatz?.firmaAdresse || vorgabe.adresse || '',
      einsatzort: einsatz?.einsatzort || vorgabe.ort || '',
      kanton: einsatz?.kanton || vorgabe.kanton || '',
      ueberstundenModus: einsatz?.ueberstundenModus || vorgabe.ueberstunden || 'woche',
    }
    await db.einsaetze.put(ergaenzt)
    setEinst({ firmen, firma: einst.firma && firmen.includes(einst.firma) ? einst.firma : firma, buero: einst.buero || b })
    for (const z of neu) {
      const notiz = [z.notiz, papier ? 'vom Papier-Rapport nachgetragen' : 'nachgetragen'].filter(Boolean).join(' · ')
      await speichern(z.genau
        ? { start: z.start, ende: z.ende, pausen: z.luecken, firma, notiz }
        : { start: z.start, ende: z.ende, pausen: [], pauseMin: z.pause, firma, notiz })
    }
    if (papier) {
      const k = statusKey(wKey, firma)
      const alt = (await db.wochen.get(k)) || { key: k }
      await db.wochen.put({ ...alt, gesendetAm: alt.gesendetAm || Date.now(), gesendetAn: alt.gesendetAn || 'Büro (Papier-Rapport)' })
    }
    onClose(neu.length)
  }

  return (
    <Sheet titel={`KW ${woche.kw} nachtragen`} icon={CalendarPlus} onClose={() => onClose(0)}>
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
