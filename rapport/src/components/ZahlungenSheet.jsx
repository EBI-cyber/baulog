import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Landmark, ClipboardPaste, ImagePlus, Loader2, CheckCircle2, X, Plus } from 'lucide-react'
import Sheet from './Sheet'
import { db } from '../lib/db'
import { useEinstellungen, zahl } from '../lib/settings'
import { kiVerfuegbar } from '../lib/ki'
import { alsDataUrl } from '../lib/bild'
import { chf } from '../lib/lohn'
import { ARTEN, buchungenKI, buchungenLokal, einordnen, schluessel, zahlungenSpeichern, monatFuer, muster } from '../lib/zahlungen'
import { isoDatum } from '../lib/zeit'

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const monatTxt = (m) => `${MONATE[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`
const monateUm = (datum) => [-1, 0, 1].map((d) => { const x = new Date(datum + 'T12:00'); x.setDate(1); x.setMonth(x.getMonth() + d); return isoDatum(x).slice(0, 7) })

/**
 * Bankauszug einfügen: kopierter Buchungsverlauf oder Screenshots der Bank-App → Gutschriften des Büros
 * finden → als Vorschuss/Lohn für einen Monat übernehmen. Ohne KI liest die App kopierten Text selbst.
 */
export default function ZahlungenSheet({ onClose }) {
  const [einst, setEinst] = useEinstellungen()
  const einsaetze = useLiveQuery(() => db.einsaetze.toArray(), [], [])
  const bueros = [...new Set([...(einsaetze || []).map((e) => e.buero), einst.buero].filter(Boolean))]
  const [text, setText] = useState('')
  const [bilder, setBilder] = useState([])
  const [liste, setListe] = useState(null) // [{ ...buchung, an, art, fuerMonat, doppelt }]
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState(null)
  const [hand, setHand] = useState(false)
  const datei = useRef()
  const w = einst.waehrung

  async function einfuegen() {
    try { const t = await navigator.clipboard.readText(); if (t?.trim()) setText(t); else setMeldung({ ok: false, text: 'Zwischenablage leer — lange ins Feld tippen und „Einsetzen“ wählen.' }) }
    catch { setMeldung({ ok: false, text: 'Zwischenablage nicht lesbar — lange ins Feld tippen und „Einsetzen“ wählen.' }) }
  }
  async function fotos(e) {
    const f = [...(e.target.files || [])]; e.target.value = ''
    const neu = []
    for (const x of f) neu.push(await alsDataUrl(x, 1600, 0.8))
    setBilder((b) => [...b, ...neu].slice(0, 6))
  }

  async function lesen() {
    setMeldung(null); setLaeuft(true)
    let funde = [], hinweis = ''
    try {
      if (kiVerfuegbar && (bilder.length || text.trim())) funde = await buchungenKI({ text, bilder })
      else funde = buchungenLokal(text)
    } catch (err) {
      funde = buchungenLokal(text)
      hinweis = (bilder.length ? 'Screenshots brauchen die KI: ' : 'KI nicht erreichbar, Text selbst gelesen: ') + err.message
    }
    const vorhanden = new Map((await db.zahlungen.toArray()).map((z) => [z.schluessel, z]))
    const l = funde.filter((b) => b.betrag > 0).map((b) => {
      const x = einordnen(b, bueros, einst.zahlungsMuster || [])
      const alt = vorhanden.get(schluessel(x))
      // schon erfasst: gespeicherte Art/Monat zeigen (lässt sich hier umbuchen)
      return alt ? { ...x, art: alt.art, fuerMonat: alt.fuerMonat, kw: alt.kw, an: false, doppelt: alt.id } : { ...x, an: x.relevant, doppelt: null }
    })
      .sort((a, b) => (b.relevant - a.relevant) || b.datum.localeCompare(a.datum))
    setListe(l)
    setLaeuft(false)
    if (!l.length) setMeldung({ ok: false, text: (hinweis ? hinweis + ' — ' : '') + 'Keine Gutschriften gefunden.' })
    else if (hinweis) setMeldung({ ok: false, text: hinweis })
  }

  const setZeile = (i, x) => {
    setListe((l) => l.map((z, j) => (j === i ? { ...z, ...x } : z)))
    const z = liste[i]
    if (z.doppelt) db.zahlungen.update(z.doppelt, x) // schon gespeicherte Zahlung direkt umbuchen
  }
  const artWahl = (i, x, art) => setZeile(i, { art, ...monatFuer(x.datum, art) })
  const firmaZu = (b) => (einsaetze || []).find((e) => e.buero && b.buero && e.buero === b.buero)?.firma || einst.firma || ''

  async function speichern() {
    const gewaehlt = liste.filter((x) => x.an && !x.doppelt).map((x) => ({ ...x, firma: firmaZu(x), buero: x.buero || bueros[0] || '' }))
    const n = await zahlungenSpeichern(gewaehlt, 'bank')
    // Absender merken → beim nächsten Mal automatisch erkannt (auch bei magerem Verwendungszweck)
    const neu = [...new Set([...(einst.zahlungsMuster || []), ...gewaehlt.map((x) => muster(x.text)).filter((m) => m.length > 2)])]
    if (neu.length !== (einst.zahlungsMuster || []).length) setEinst({ zahlungsMuster: neu })
    setMeldung({ ok: true, text: `${n} Zahlung${n === 1 ? '' : 'en'} übernommen.` })
    setListe(null); setText(''); setBilder([])
  }

  if (hand) return <HandSheet onClose={() => setHand(false)} bueros={bueros} firma={einst.firma} w={w} />

  return (
    <Sheet titel="Zahlungen vom Büro" icon={Landmark} onClose={onClose}>
      {!liste && <>
        <div className="text-sm text-white/55">In der Bank-App den Buchungsverlauf markieren und kopieren — oder Screenshots machen. Die App findet die Gutschriften vom Büro (Vorschüsse, Lohn).</div>
        <button onClick={einfuegen} className="w-full rounded-2xl py-3 font-semibold bg-white/10 inline-flex items-center justify-center gap-2"><ClipboardPaste className="w-4 h-4" /> Aus Zwischenablage einfügen</button>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="…oder hier einfügen" className="eingabe text-xs" />
        <div className="flex flex-wrap gap-2 items-center">
          {bilder.map((b, i) => (
            <div key={i} className="relative">
              {b.startsWith('data:application/pdf') ? <div className="w-14 h-20 rounded-lg border border-white/15 bg-white/10 flex items-center justify-center text-xs font-bold">PDF</div> : <img src={b} alt="" className="w-14 h-20 object-cover rounded-lg border border-white/15" />}
              <button onClick={() => setBilder(bilder.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center" aria-label="Entfernen"><X className="w-3 h-3" /></button>
            </div>
          ))}
          {kiVerfuegbar && <button onClick={() => datei.current?.click()} className="px-3 py-2 rounded-xl border border-dashed border-white/25 text-sm text-white/65 inline-flex items-center gap-1.5"><ImagePlus className="w-4 h-4" /> Screenshot / PDF</button>}
          <input ref={datei} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={fotos} />
        </div>
        <button disabled={laeuft || (!text.trim() && !bilder.length)} onClick={lesen} className="w-full rounded-2xl py-3 font-bold btn-grad disabled:opacity-40 inline-flex items-center justify-center gap-2">
          {laeuft ? <><Loader2 className="w-4 h-4 animate-spin" /> Lese Buchungen …</> : 'Buchungen lesen'}
        </button>
        <button onClick={() => setHand(true)} className="w-full py-2 text-sm text-white/55 inline-flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" /> Zahlung von Hand erfassen</button>
      </>}

      {liste && <>
        <div className="text-sm text-white/55">Gutschriften gefunden — vom Büro sind vorausgewählt. Ein Vorschuss zählt zum Monat der Woche, die er bezahlt (Vorwoche). Nicht erkannt? Anhaken — die App merkt sich den Absender.</div>
        <div className="space-y-2">
          {liste.map((x, i) => (
            <div key={i} className={'rounded-2xl p-3 border ' + (x.an ? 'bg-white/[0.06] border-white/20' : 'border-white/10 opacity-60')}>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" disabled={!!x.doppelt} checked={x.an || !!x.doppelt} onChange={(e) => setZeile(i, { an: e.target.checked })} className="mt-1 w-4 h-4 accent-amber-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 font-semibold"><span>{x.datum.split('-').reverse().join('.')}</span><span className="tabular-nums">{chf(x.betrag, w)}</span></div>
                  <div className="text-xs text-white/50 truncate">{x.text || '—'}</div>
                  {x.doppelt && <div className="text-xs text-emerald-300">schon erfasst — Art/Monat hier änderbar</div>}
                </div>
              </label>
              {(x.an || x.doppelt) && <div className="flex flex-wrap gap-1.5 mt-2 pl-6">
                {ARTEN.map((a) => <button key={a.id} onClick={() => artWahl(i, x, a.id)} className={'px-2.5 py-1 rounded-full text-xs border ' + (x.art === a.id ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/60')}>{a.label}</button>)}
                <select value={x.fuerMonat} onChange={(e) => setZeile(i, { fuerMonat: e.target.value })} className="eingabe !w-auto !py-1 text-xs">
                  {monateUm(x.datum).map((m) => <option key={m} value={m}>für {monatTxt(m)}</option>)}
                </select>
                {x.art === 'vorschuss' && x.kw && <span className="text-xs text-white/45 self-center">bezahlt KW {x.kw}</span>}
              </div>}
            </div>
          ))}
        </div>
        {liste.some((x) => x.an && !x.doppelt)
          ? <button onClick={speichern} className="w-full rounded-2xl py-3 font-bold btn-grad">{liste.filter((x) => x.an && !x.doppelt).length} Zahlungen übernehmen</button>
          : <button onClick={onClose} className="w-full rounded-2xl py-3 font-bold btn-grad">Fertig</button>}
        <button onClick={() => setListe(null)} className="w-full py-2 text-sm text-white/45">Zurück</button>
      </>}

      {meldung && <div className={'text-sm rounded-xl px-3 py-2 border flex gap-2 ' + (meldung.ok ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300' : 'bg-amber-400/10 border-amber-400/30 text-amber-300')}>
        {meldung.ok && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}{meldung.text}</div>}
    </Sheet>
  )
}

function HandSheet({ onClose, bueros, firma, w }) {
  const [f, setF] = useState({ datum: isoDatum(new Date()), betrag: '', art: 'vorschuss', fuerMonat: isoDatum(new Date()).slice(0, 7), text: '' })
  const [ok, setOk] = useState('')
  async function sichern() {
    const b = zahl(f.betrag)
    if (!b) return
    const n = await zahlungenSpeichern([{ ...f, betrag: b, firma, buero: bueros[0] || '', text: f.text || 'von Hand' }], 'hand')
    setOk(n ? `${chf(b, w)} gespeichert.` : 'Diese Zahlung ist schon erfasst.')
    setF({ ...f, betrag: '', text: '' })
  }
  return (
    <Sheet titel="Zahlung von Hand" icon={Landmark} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs text-white/50 mb-1">Datum</label><input type="date" value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value, fuerMonat: e.target.value.slice(0, 7) })} className="eingabe" /></div>
        <div><label className="block text-xs text-white/50 mb-1">Betrag ({w})</label><input inputMode="decimal" value={f.betrag} onChange={(e) => setF({ ...f, betrag: e.target.value })} className="eingabe" placeholder="800.00" /></div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ARTEN.map((a) => <button key={a.id} onClick={() => setF({ ...f, art: a.id })} className={'px-3 py-1.5 rounded-full text-sm border ' + (f.art === a.id ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/60')}>{a.label}</button>)}
      </div>
      <div><label className="block text-xs text-white/50 mb-1">Für Lohnabrechnung</label>
        <select value={f.fuerMonat} onChange={(e) => setF({ ...f, fuerMonat: e.target.value })} className="eingabe">
          {monateUm(f.datum).map((m) => <option key={m} value={m}>{monatTxt(m)}</option>)}
        </select></div>
      <input value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Notiz (optional)" className="eingabe" />
      {ok && <div className="text-sm text-emerald-300">{ok}</div>}
      <button onClick={sichern} className="w-full rounded-2xl py-3 font-bold btn-grad">Speichern</button>
      <button onClick={onClose} className="w-full py-2 text-sm text-white/45">Fertig</button>
    </Sheet>
  )
}
