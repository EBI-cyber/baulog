import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ScanSearch, Loader2, CheckCircle2, AlertTriangle, X, Share2, CloudUpload, Check } from 'lucide-react'
import Sheet from './Sheet'
import DokumentScanner from './DokumentScanner'
import { db, speichereAbsenz } from '../lib/db'
import { useEinstellungen, zahl } from '../lib/settings'
import { alsDataUrl } from '../lib/bild'
import { kiVerfuegbar } from '../lib/ki'
import { papierRapportLesen, fotosZuPdf, abgleichen, papierVermerken } from '../lib/papierrapport'
import { kern, zeilenBerechnen, zeilenSpeichern } from '../lib/nachtragen'
import { dateiName } from '../lib/pdf'
import { teileDatei } from '../lib/teilen'
import { msVerbunden, msVersand } from '../lib/microsoft'
import { ordnerPfad } from '../lib/versand'
import { wochenKey, TAGE, datumKurz, wochenTage } from '../lib/zeit'
import { absenzArt } from '../lib/arten'

const ARTEN = [[/ferien/i, 'ferien'], [/krank/i, 'krank'], [/unfall/i, 'unfall'], [/feiertag/i, 'feiertag'], [/unbezahlt/i, 'unbezahlt'], [/arzt/i, 'arzt'], [/milit/i, 'militaer'], [/kein einsatz/i, 'kein_einsatz']]
const dez = (n) => (Math.round(n * 100) / 100).toFixed(2)
const dataUrlZuBlob = (u) => { const [k, b] = u.split(','); const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: k.slice(5, k.indexOf(';')) }) }

/**
 * Unterschriebenen Papier-Rapport fotografieren → auswerten → mit den Zeiten der App abgleichen
 * → an den Berater weiterleiten → Woche als gesendet vermerken.
 */
export default function PapierRapportSheet({ woche, onClose }) {
  const [einst] = useEinstellungen()
  const einsaetze = useLiveQuery(() => db.einsaetze.toArray(), [], [])
  const [bilder, setBilder] = useState([])
  const [schritt, setSchritt] = useState('fotos')
  const [ki, setKi] = useState(null)
  const [vergleich, setVergleich] = useState([])
  const [fehler, setFehler] = useState('')
  const [meldung, setMeldung] = useState('')
  const [gesendet, setGesendet] = useState(false)
  const datei = useRef()
  // Fotos laufen einzeln durch den Dokument-Scanner (zuschneiden, entzerren, Filter); Originale bleiben für „neu zuschneiden“
  const [warte, setWarte] = useState([]) // [{ datei, index }]
  const originale = useRef([])
  const wKey = wochenKey(woche)

  const einsatz = (einsaetze || []).find((e) => ki?.firma && kern(e.firma) === kern(ki.firma)) || (einsaetze || []).find((e) => e.firma === einst.firma) || null
  const firma = einsatz?.firma || einst.firma || ki?.firma || ''
  // PDF zum Weiterleiten vorab erzeugen (iOS teilt nur direkt im Klick)
  const pdf = useMemo(() => {
    if (!bilder.length) return null
    const p = bilder.find((b) => b.startsWith('data:application/pdf'))
    return { blob: p ? dataUrlZuBlob(p) : fotosZuPdf(bilder), name: dateiName(einst, woche, null, 'Rapport_unterschrieben') }
  }, [bilder]) // eslint-disable-line react-hooks/exhaustive-deps

  async function dazu(e) {
    const dateien = [...(e.target.files || [])]
    e.target.value = ''
    const pdfs = [], fotos = []
    for (const f of dateien) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')) pdfs.push(await alsDataUrl(f, 2200, 0.85))
      else fotos.push(f)
    }
    if (pdfs.length) setBilder((b) => [...b, ...pdfs].slice(0, 4))
    if (fotos.length) setWarte((w) => [...w, ...fotos.map((d) => ({ datei: d, index: null }))])
  }
  const scanFertig = (url) => {
    const { datei: d, index } = warte[0]
    if (index != null) { setBilder((b) => b.map((x, i) => (i === index ? url : x))); originale.current[index] = d }
    else setBilder((b) => { if (b.length >= 4) return b; originale.current[b.length] = d; return [...b, url] })
    setWarte((w) => w.slice(1))
  }
  const entfernen = (i) => { setBilder(bilder.filter((_, j) => j !== i)); originale.current = originale.current.filter((_, j) => j !== i) }
  async function auswerten() {
    setFehler(''); setSchritt('lesen')
    try {
      const k = await papierRapportLesen(bilder)
      setKi(k); setVergleich(await abgleichen(woche, k)); setSchritt('ergebnis')
    } catch (e) { setFehler(e.message); setSchritt('fotos') }
  }
  const neuVergleich = async () => setVergleich(await abgleichen(woche, ki))

  // Arbeitszeit eines Tages in der App löschen (z.B. fälschlich übernommen, obwohl Ferien eingetragen sind)
  async function zeitLoeschen(datum) {
    if (!window.confirm(`Arbeitszeit am ${datum.split('-').reverse().join('.')} in der App löschen? Abwesenheiten bleiben.`)) return
    const n = await db.schichten.where('datum').equals(datum).delete()
    setMeldung(`${n} Eintrag${n === 1 ? '' : 'e'} gelöscht.`)
    await neuVergleich()
  }
  async function fehlendeUebernehmen(nurDatum = null) {
    const tage = wochenTage(woche)
    const ziel = vergleich.filter((v) => (nurDatum ? v.datum === nurDatum : v.fehltInApp))
    if (nurDatum && ziel[0]?.appAbw.length && !window.confirm(`In der App steht am ${nurDatum.split('-').reverse().join('.')} ${ziel[0].appAbw.map((a) => absenzArt(a.art).label).join(', ')}. Trotzdem ${dez(ziel[0].pStd)} h Arbeitszeit vom Rapport übernehmen?`)) return
    // bei „Papier übernehmen“ für einen Tag mit anderen Zeiten: Tag in der App ersetzen
    if (nurDatum) await db.schichten.where('datum').equals(nurDatum).delete()
    const stunden = tage.map((d, i) => { const v = ziel.find((x) => x.tag.getTime() === d.getTime()); return v ? String(v.pStd) : '' })
    const vorhanden = (await db.schichten.where('wocheKey').equals(wKey).toArray())
    const zeilen = zeilenBerechnen({ woche, stunden, beginn: einsatz?.arbeitsbeginn, vorhanden })
    const n = await zeilenSpeichern({ woche, zeilen, firma, papier: false })
    // Abwesenheiten vom Papier, wenn in der App noch keine steht
    let a = 0
    for (const v of vergleich) {
      if (nurDatum && v.datum !== nurDatum) continue
      const t = v.papier?.abwesenheit
      if (!t || v.appAbw.length) continue
      const art = ARTEN.find(([re]) => re.test(t))?.[1]
      if (!art) continue
      await speichereAbsenz({ datum: v.datum, art, firma, halbtag: false, stunden: zahl(v.papier.abwesenheitStunden), zeugnis: false, notiz: 'vom Papier-Rapport' }); a++
    }
    setMeldung(`${n} Tag${n === 1 ? '' : 'e'}${a ? ` und ${a} Abwesenheit${a === 1 ? '' : 'en'}` : ''} übernommen.`)
    await neuVergleich()
  }

  async function weiterleiten() {
    const r = await teileDatei(pdf.blob, pdf.name).catch(() => 'fehler')
    if (r === 'abgebrochen' || r === 'fehler') return
    await papierVermerken({ wKey, firma, bilder, ki, gesendetAn: 'Berater (Papier-Rapport)' })
    setGesendet(true); setMeldung('Rapport weitergeleitet — Woche als gesendet vermerkt.')
    if (msVerbunden()) msVersand({ datei: pdf, onedrive: { ordner: ordnerPfad(einst.onedriveOrdner, woche, { buero: einsatz?.buero || einst.buero, firma }) } })
      .then(() => setMeldung('Rapport weitergeleitet, als gesendet vermerkt und in OneDrive abgelegt.')).catch(() => {})
  }
  async function nurVermerken() {
    await papierVermerken({ wKey, firma, bilder, ki, gesendetAn: 'Büro (Papier-Rapport)' })
    setGesendet(true); setMeldung('Woche als gesendet vermerkt.')
  }

  const fehlend = vergleich.filter((v) => v.fehltInApp).length
  // Total auf dem Rapport ≠ Summe der gelesenen Tage → ein Tag ist falsch gelesen: nichts automatisch übernehmen
  const totalFalsch = ki?.total != null && ki.total !== '' && Math.abs(zahl(ki.total) - vergleich.reduce((a, v) => a + v.pStd, 0)) > 0.01
  const konflikte = vergleich.filter((v) => v.abwKonflikt)
  const kwFalsch = ki?.kw && +ki.kw !== woche.kw
  const summePapier = vergleich.reduce((a, v) => a + v.pStd, 0), summeApp = vergleich.reduce((a, v) => a + v.app, 0)

  return (
    <Sheet titel={`Papier-Rapport KW ${woche.kw}`} icon={Camera} onClose={onClose}>
      {schritt === 'fotos' && <>
        <div className="text-sm text-white/60">Den unterschriebenen Rapport flach hinlegen und fotografieren (oder als PDF/Scan wählen). Danach Ecken zurechtziehen – die App entzerrt, schärft und macht ein sauberes Dokument daraus. Die App liest die Stunden, vergleicht sie mit deinen Zeiten und leitet den Rapport an deinen Berater weiter.</div>
        {bilder.length > 0 && <div className="flex gap-2 overflow-x-auto">{bilder.map((b, i) => (
          <div key={i} className="relative shrink-0">
            {b.startsWith('data:application/pdf') ? <div className="h-24 w-32 rounded-lg border border-white/15 bg-white/10 flex items-center justify-center text-xs font-bold">PDF</div>
              : <button onClick={() => originale.current[i] && setWarte((w) => [...w, { datei: originale.current[i], index: i }])} className="block relative">
                <img src={b} alt="" className="h-24 w-32 object-cover rounded-lg border border-white/15 bg-white" />
                {originale.current[i] && <span className="absolute bottom-1 left-1 text-xs bg-black/75 rounded px-1.5 py-0.5">Bearbeiten</span>}
              </button>}
            <button onClick={() => entfernen(i)} className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-black/80 flex items-center justify-center" aria-label="Entfernen"><X className="w-4 h-4" /></button>
          </div>))}</div>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => datei.current?.click()} className="rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Camera className="w-5 h-5" /> {bilder.length ? 'Seite dazu' : 'Foto / Scan'}</button>
          <button onClick={auswerten} disabled={!bilder.length || !kiVerfuegbar} className="rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40"><ScanSearch className="w-5 h-5" /> Auswerten</button>
        </div>
        <input ref={datei} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={dazu} />
        {warte.length > 0 && <DokumentScanner key={warte.length + ':' + (warte[0].index ?? 'n')} datei={warte[0].datei} titel={`Rapport zuschneiden${warte.length > 1 ? ` (noch ${warte.length})` : ''}`} onFertig={scanFertig} onAbbrechen={() => setWarte((w) => w.slice(1))} />}
        {bilder.length > 0 && <button onClick={nurVermerken} className="w-full py-2 text-xs text-white/65 underline">Ohne Auswertung nur als gesendet vermerken</button>}
        {fehler && <div className="text-sm text-ember">{fehler}</div>}
      </>}
      {schritt === 'lesen' && <div className="py-10 text-center text-white/60 space-y-2"><Loader2 className="w-8 h-8 animate-spin mx-auto" /><div>Rapport wird gelesen …</div></div>}
      {schritt === 'ergebnis' && ki && <>
        <button onClick={() => { setSchritt('fotos'); setMeldung('') }} className="text-sm text-aqua self-start">← Fotos / neu auswerten</button>
        {kwFalsch && <div className="text-sm rounded-xl px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Auf dem Rapport steht KW {ki.kw} — geöffnet ist KW {woche.kw}. Richtige Woche im Kalender öffnen.</div>}
        <div className="text-xs text-white/65">{[ki.firma, ki.unterschriftBetrieb ? `unterschrieben${ki.unterzeichner ? ' von ' + ki.unterzeichner : ''}` : 'ohne Unterschrift Einsatzbetrieb', ki.unterschriftDatum && ki.unterschriftDatum.split('-').reverse().join('.')].filter(Boolean).join(' · ')}</div>
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="text-white/60 text-xs text-left"><th className="pb-1">Tag</th><th className="text-right">Rapport</th><th className="text-right">App</th><th></th></tr></thead>
          <tbody>{vergleich.map((v) => (
            <tr key={v.datum} className="border-t border-white/5">
              <td className="py-1.5">{TAGE[v.tag.getDay()]} {datumKurz(v.tag)}{v.papier?.abwesenheit ? <span className="text-xs text-white/65"> · {v.papier.abwesenheit}</span> : ''}</td>
              <td className="text-right">{v.pStd ? dez(v.pStd) : '–'}</td>
              <td className="text-right">{v.app ? dez(v.app) : v.appAbw.length ? '' : '–'}{v.appAbw.length > 0 && <div className="text-xs text-violet-300">{v.appAbw.map((a) => absenzArt(a.art).kurz || absenzArt(a.art).label).join(', ')}</div>}</td>
              <td className="text-right pl-2">{v.abwKonflikt
                ? (v.app > 0 ? <button onClick={() => zeitLoeschen(v.datum)} className="text-xs rounded-lg px-2 py-1 bg-ember/20 text-rose-200">Zeit löschen</button> : <span className="text-xs text-amber-300">prüfen</span>)
                : v.stimmt ? (v.pStd || v.app || v.appAbw.length ? <CheckCircle2 className="w-4 h-4 text-lime inline" /> : '')
                : v.fehltInApp ? <span className="text-xs text-amber-300">fehlt</span>
                : v.zuViel ? <button onClick={() => zeitLoeschen(v.datum)} className="text-xs rounded-lg px-2 py-1 bg-white/10">wie Rapport (löschen)</button>
                : <button onClick={() => fehlendeUebernehmen(v.datum)} className="text-xs rounded-lg px-2 py-1 bg-white/10">Rapport übernehmen</button>}</td>
            </tr>))}</tbody>
          <tfoot><tr className="border-t border-white/15 font-bold"><td className="pt-1.5">Total</td><td className="text-right pt-1.5">{dez(summePapier)}</td><td className="text-right pt-1.5">{dez(summeApp)}</td><td className="text-right pt-1.5">{Math.abs(summePapier - summeApp) < 0.01 ? <CheckCircle2 className="w-4 h-4 text-lime inline" /> : <AlertTriangle className="w-4 h-4 text-amber-300 inline" />}</td></tr></tfoot>
        </table>
        {totalFalsch && <div className="text-sm rounded-xl px-3 py-2 bg-ember/10 border border-ember/40 text-rose-200 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>Auf dem Rapport steht Total <b>{dez(zahl(ki.total))} h</b>, die gelesenen Tage ergeben {dez(summePapier)} h — ein Tag wurde falsch gelesen (z.B. ein Strich „/“ für Ferien). Darum wird nichts automatisch übernommen. Foto schärfer zuschneiden und neu auswerten, oder einzelne Tage selbst prüfen.</span></div>}
        {konflikte.length > 0 && <div className="text-sm rounded-xl px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{konflikte.map((v) => `${TAGE[v.tag.getDay()]} ${datumKurz(v.tag)}`).join(', ')}: in der App als {konflikte.map((v) => v.appAbw.map((a) => absenzArt(a.art).label).join('/')).join(', ')} eingetragen, auf dem Rapport mit Stunden gelesen. Abwesenheiten werden nie überschrieben.{konflikte.some((v) => v.app > 0) ? ' Falls die Arbeitszeit falsch übernommen wurde: „Zeit löschen“.' : ''}</span></div>}
        {fehlend > 0 && !totalFalsch && <button onClick={() => fehlendeUebernehmen()} className="w-full rounded-2xl py-2.5 bg-white/10 font-semibold text-sm">{fehlend} fehlende Tag{fehlend === 1 ? '' : 'e'} vom Rapport übernehmen</button>}
        {meldung && <div className="text-sm rounded-xl px-3 py-2 bg-lime/10 border border-lime/30 text-lime flex gap-2"><Check className="w-4 h-4 shrink-0 mt-0.5" />{meldung}</div>}
        {!gesendet ? <>
          <button onClick={weiterleiten} className="w-full rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-2"><Share2 className="w-5 h-5" /> An Berater weiterleiten (WhatsApp …)</button>
          <div className="text-xs text-white/60 text-center">Danach ist die Woche als gesendet vermerkt{msVerbunden() ? ' und der Rapport liegt in OneDrive' : ''}.</div>
          <button onClick={nurVermerken} className="w-full py-2 text-xs text-white/65 underline">Schon gesendet — nur vermerken</button>
        </> : <button onClick={onClose} className="w-full rounded-2xl py-3 btn-grad font-bold">Fertig</button>}
        {msVerbunden() && gesendet && <div className="text-xs text-white/60 inline-flex items-center gap-1"><CloudUpload className="w-3.5 h-3.5" /> OneDrive: {ordnerPfad(einst.onedriveOrdner, woche, { buero: einsatz?.buero || einst.buero, firma })}</div>}
      </>}
    </Sheet>
  )
}
