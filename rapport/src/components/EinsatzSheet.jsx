import { useRef, useState } from 'react'
import { Briefcase, Camera, Sparkles, Trash2, X, Loader2, AlertTriangle } from 'lucide-react'
import Sheet from './Sheet'
import { db } from '../lib/db'
import { useEinstellungen, zahl } from '../lib/settings'
import { KANTONE } from '../lib/feiertage'
import { LOHN_STANDARD, ABZUEGE, stundenlohnTotal } from '../lib/lohn'
import { verkleinern } from '../lib/bild'
import { einsatzvertragLesen, kiVerfuegbar } from '../lib/ki'
import { BRANCHEN, branche, brancheAnwenden } from '../lib/branchen'

const NEU = { firma: '', branche: '', einsatznummer: '', arbeitsbeginn: '', qualifikation: '', meldenBei: '', buero: '', bueroTel: '', bueroKontakt: '', bueroEmail: '', einsatzort: '', kanton: '', funktion: '', beginn: '', ende: '', stundenlohnTotalVertrag: '',
  gavName: '', kuendigungsfrist: '', spesenInfo: '', bemerkungen: '', fotos: [], ...LOHN_STANDARD }

const ZAHLEN = ['stundenlohn', 'wochenstunden', 'feiertagProzent', 'ferienProzent', 'dreizehnterProzent', 'ueberstundenZuschlag',
  'nachtVon', 'nachtBis', 'nachtZuschlag', 'samstagZuschlag', 'sonntagZuschlag', 'feiertagArbeitZuschlag', 'zulageStunde', 'mittagszulage',
  'krankFaktor', 'schlechtwetterFaktor', 'ahv', 'alv', 'nbu', 'ktg', 'bvg', 'gav', 'far', 'parifonds', 'quellensteuer']

function Feld({ label, einheit, breit, ...rest }) {
  return (
    <div className={breit ? 'col-span-2' : ''}>
      <label className="block text-xs text-white/50 mb-1">{label}</label>
      <div className="relative">
        <input className={'eingabe ' + (einheit ? 'pr-12' : '')} {...rest} />
        {einheit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/35">{einheit}</span>}
      </div>
    </div>
  )
}

const Titel = ({ children }) => <div className="text-xs font-semibold uppercase tracking-wider text-white/40 pt-3">{children}</div>

export default function EinsatzSheet({ einsatz, vorgabe, onClose }) {
  const [einst, setEinst] = useEinstellungen()
  const [f, setF] = useState(() => ({ ...NEU, ...(vorgabe || {}), ...(einsatz || {}) }))
  const br = branche(f.branche)
  const [ki, setKi] = useState({ laeuft: false, fehler: '', erkannt: null })
  const datei = useRef()
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const zahlFeld = (k) => ({ value: f[k] ?? '', onChange: set(k), inputMode: 'decimal' })
  const w = einst.waehrung

  async function fotosDazu(e) {
    const dateien = [...(e.target.files || [])]
    e.target.value = ''
    const neu = []
    for (const d of dateien) neu.push(await verkleinern(d))
    setF((x) => ({ ...x, fotos: [...(x.fotos || []), ...neu].slice(0, 6) }))
  }

  async function auslesen() {
    setKi({ laeuft: true, fehler: '', erkannt: null })
    try {
      const r = await einsatzvertragLesen(f.fotos)
      const erkannt = []
      setF((x) => {
        const y = { ...x }
        const nimm = (k, quelle = k) => {
          const v = r[quelle]
          if (v === null || v === undefined || v === '') return
          y[k] = ZAHLEN.includes(k) ? String(v) : String(v).trim()
          erkannt.push(k)
        }
        if (['bau', 'industrie', 'andere'].includes(r.branche)) Object.assign(y, brancheAnwenden(y, r.branche, LOHN_STANDARD))
        ;['firma', 'einsatznummer', 'arbeitsbeginn', 'qualifikation', 'meldenBei', 'buero', 'bueroTel', 'bueroKontakt', 'bueroEmail', 'einsatzort', 'funktion', 'beginn', 'ende', 'gavName', 'kuendigungsfrist', 'bemerkungen', ...ZAHLEN].forEach((k) => nimm(k))
        nimm('spesenInfo', 'spesen'); nimm('stundenlohnTotalVertrag', 'stundenlohnTotal')
        if (r.kanton && KANTONE[String(r.kanton).toUpperCase()]) { y.kanton = String(r.kanton).toUpperCase(); erkannt.push('kanton') }
        return y
      })
      setKi({ laeuft: false, fehler: '', erkannt })
    } catch (err) {
      setKi({ laeuft: false, fehler: err.message, erkannt: null })
    }
  }

  async function sichern() {
    const firma = f.firma.trim()
    if (!firma) return setKi((k) => ({ ...k, fehler: 'Bitte den Einsatzbetrieb (Firma) eintragen.' }))
    const daten = { ...f, firma }
    const alt = einsatz?.firma
    await db.transaction('rw', db.einsaetze, db.schichten, db.absenzen, async () => {
      await db.einsaetze.put(daten)
      if (alt && alt !== firma) { // umbenannt: Einträge mitnehmen
        await db.schichten.filter((s) => s.firma === alt).modify({ firma })
        await db.absenzen.filter((a) => a.firma === alt).modify({ firma })
      }
    })
    const firmen = einst.firmen.map((x) => (x === alt ? firma : x))
    setEinst({
      firmen: firmen.includes(firma) ? firmen : [...firmen, firma],
      // neuer Einsatz wird zum aktuellen (voreingestellt bei Start)
      firma: !einsatz || !einst.firma || einst.firma === alt ? firma : einst.firma,
    })
    onClose()
  }

  async function loeschen() {
    if (!confirm('Einsatzvertrag löschen? Die erfassten Zeiten bleiben erhalten.')) return
    await db.einsaetze.delete(einsatz.id); onClose()
  }

  const totalBerechnet = stundenlohnTotal(f)
  const totalVertrag = zahl(f.stundenlohnTotalVertrag)
  const abweichung = totalVertrag && zahl(f.stundenlohn) && Math.abs(totalBerechnet - totalVertrag) > 0.05

  return (
    <Sheet titel={einsatz ? 'Einsatz bearbeiten' : 'Neuer Einsatz'} icon={Briefcase} onClose={onClose}>
      {/* Vertrag fotografieren */}
      <div className="rounded-2xl bg-aqua/[0.07] border border-aqua/25 p-3 space-y-3">
        <div className="text-sm text-white/70">Einsatzvertrag fotografieren (alle Seiten), die KI füllt die Felder aus.</div>
        {f.fotos?.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {f.fotos.map((src, i) => (
              <div key={i} className="relative shrink-0">
                <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Seite ${i + 1}`} className="h-20 w-16 object-cover rounded-lg border border-white/15" /></a>
                <button onClick={() => setF((x) => ({ ...x, fotos: x.fotos.filter((_, j) => j !== i) }))}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-black/80 border border-white/20 flex items-center justify-center" aria-label="Foto entfernen">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => datei.current?.click()} className="rounded-xl py-2.5 bg-white/10 text-sm font-semibold inline-flex items-center justify-center gap-2">
            <Camera className="w-4 h-4" /> {f.fotos?.length ? 'Seite dazu' : 'Foto machen'}
          </button>
          <button onClick={auslesen} disabled={!f.fotos?.length || ki.laeuft || !kiVerfuegbar}
            className="rounded-xl py-2.5 btn-grad text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40">
            {ki.laeuft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {ki.laeuft ? 'Lese …' : 'KI auslesen'}
          </button>
        </div>
        <input ref={datei} type="file" accept="image/*" multiple className="hidden" onChange={fotosDazu} />
        {ki.erkannt && <div className="text-sm rounded-xl px-3 py-2 bg-lime/15 border border-lime/30 text-lime">
          {ki.erkannt.length} Angaben übernommen — bitte kurz prüfen.
        </div>}
        {ki.fehler && <div className="text-sm rounded-xl px-3 py-2 bg-ember/15 border border-ember/30 text-ember">{ki.fehler}</div>}
      </div>

      <Titel>Branche</Titel>
      <div className="grid grid-cols-3 gap-2">
        {BRANCHEN.map((b) => (
          <button key={b.id} type="button" onClick={() => setF((x) => brancheAnwenden(x, b.id, LOHN_STANDARD))}
            className={'rounded-xl border px-2 py-2.5 text-xs flex flex-col items-center gap-1 text-center ' + (f.branche === b.id ? 'btn-grad border-transparent font-bold' : 'border-white/10 text-white/65')}>
            <b.icon className="w-5 h-5" strokeWidth={1.9} /> {b.kurz}
          </button>
        ))}
      </div>
      {br && <div className="text-xs text-white/45">{br.hinweis} <span className="text-white/30">Vorschläge — der Vertrag geht vor.</span></div>}

      <Titel>Einsatz</Titel>
      <div className="grid grid-cols-2 gap-3">
        <Feld breit label="Einsatzbetrieb (Firma) *" value={f.firma} onChange={set('firma')} />
        <Feld label="Einsatzort" value={f.einsatzort} onChange={set('einsatzort')} />
        <div>
          <label className="block text-xs text-white/50 mb-1">Kanton (Feiertage)</label>
          <select value={f.kanton} onChange={set('kanton')} className="eingabe">
            <option value="">–</option>
            {Object.entries(KANTONE).map(([k, n]) => <option key={k} value={k}>{k} – {n}</option>)}
          </select>
        </div>
        <Feld breit label="Funktion / Tätigkeit" value={f.funktion} onChange={set('funktion')} />
        {br?.funktionen.length > 0 && <div className="col-span-2 flex flex-wrap gap-1.5 -mt-1">
          {br.funktionen.map((fn) => (
            <button key={fn} type="button" onClick={() => setF((x) => ({ ...x, funktion: fn }))}
              className={'px-2.5 py-1 rounded-full text-xs border ' + (f.funktion === fn ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/60')}>{fn}</button>
          ))}
        </div>}
        <Feld label="Einsatz-Nr." value={f.einsatznummer} onChange={set('einsatznummer')} />
        <Feld label="Arbeitsbeginn" type="time" value={f.arbeitsbeginn} onChange={set('arbeitsbeginn')} />
        <Feld label="Qualifikation" value={f.qualifikation} onChange={set('qualifikation')} />
        <Feld label="Melden bei" value={f.meldenBei} onChange={set('meldenBei')} />
        <Feld label="Beginn" type="date" value={f.beginn} onChange={set('beginn')} />
        <Feld label="Ende" type="date" value={f.ende} onChange={set('ende')} />
      </div>

      <Titel>Temporärbüro</Titel>
      <div className="grid grid-cols-2 gap-3">
        <Feld breit label="Name des Büros (steht im Rapport)" value={f.buero} onChange={set('buero')} placeholder={einst.buero ? `leer = ${einst.buero} (Standard)` : ''} />
        <Feld label="WhatsApp / Telefon" inputMode="tel" value={f.bueroTel} onChange={set('bueroTel')} placeholder="+41 …" />
        <Feld label="Kontaktperson / Agent" value={f.bueroKontakt} onChange={set('bueroKontakt')} />
        <Feld breit label="E-Mail (Rapporte gehen automatisch hierhin)" type="email" value={f.bueroEmail} onChange={set('bueroEmail')} />
      </div>

      <Titel>Lohn</Titel>
      <div className="grid grid-cols-2 gap-3">
        <Feld label="Grundlohn / Std." einheit={w} {...zahlFeld('stundenlohn')} />
        <Feld label="Wochenstunden" einheit="h" {...zahlFeld('wochenstunden')} />
        <Feld label="Feiertagsentsch." einheit="%" {...zahlFeld('feiertagProzent')} />
        <Feld label="Ferienentsch." einheit="%" {...zahlFeld('ferienProzent')} />
        <Feld label="13. Monatslohn" einheit="%" {...zahlFeld('dreizehnterProzent')} />
        <Feld label="Total / Std. laut Vertrag" einheit={w} {...zahlFeld('stundenlohnTotalVertrag')} />
      </div>
      {zahl(f.stundenlohn) > 0 && (
        <div className={'text-sm rounded-xl px-3 py-2 border flex gap-2 ' + (abweichung ? 'bg-amber-400/10 border-amber-400/30 text-amber-300' : 'bg-white/[0.04] border-white/10 text-white/60')}>
          {abweichung && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>Berechnet: <b className="text-white">{w} {totalBerechnet.toFixed(2)}</b> / Std. inkl. Entschädigungen
            {abweichung ? ` — Vertrag sagt ${w} ${totalVertrag.toFixed(2)}. Bitte Prozente prüfen.` : ''}</span>
        </div>
      )}

      <Titel>Zuschläge & Zulagen</Titel>
      <div className="grid grid-cols-2 gap-3">
        <Feld label="Überstunden" einheit="%" {...zahlFeld('ueberstundenZuschlag')} />
        <Feld label="Nachtarbeit" einheit="%" {...zahlFeld('nachtZuschlag')} />
        <Feld label="Nacht ab" einheit="Uhr" {...zahlFeld('nachtVon')} placeholder={LOHN_STANDARD.nachtVon} />
        <Feld label="Nacht bis" einheit="Uhr" {...zahlFeld('nachtBis')} placeholder={LOHN_STANDARD.nachtBis} />
        <Feld label="Samstag" einheit="%" {...zahlFeld('samstagZuschlag')} />
        <Feld label="Sonntag" einheit="%" {...zahlFeld('sonntagZuschlag')} />
        <Feld label="Arbeit an Feiertagen" einheit="%" {...zahlFeld('feiertagArbeitZuschlag')} />
        <Feld label="Zulage pro Std." einheit={w} {...zahlFeld('zulageStunde')} placeholder="Schicht, Schmutz …" />
        <Feld label="Mittagszulage / Tag" einheit={w} {...zahlFeld('mittagszulage')} />
        <Feld label="Lohn bei Krankheit" einheit="%" {...zahlFeld('krankFaktor')} />
        <Feld label="Lohn bei Schlechtwetter" einheit="%" {...zahlFeld('schlechtwetterFaktor')} />
      </div>

      <Titel>Abzüge (Arbeitnehmer)</Titel>
      <div className="grid grid-cols-2 gap-3">
        {ABZUEGE.filter(([k]) => f.branche === 'bau' || !['far', 'parifonds'].includes(k) || f[k]).map(([k, label]) => <Feld key={k} label={label} einheit="%" {...zahlFeld(k)} />)}
      </div>
      <div className="text-xs text-white/35">AHV/IV/EO 5,3 % und ALV 1,1 % sind gesetzlich. Die übrigen Sätze stehen im Vertrag oder auf der ersten Lohnabrechnung.</div>

      <Titel>Weitere Angaben</Titel>
      <div className="grid grid-cols-2 gap-3">
        <Feld breit label="GAV" value={f.gavName} onChange={set('gavName')} />
        <Feld breit label="Kündigungsfrist" value={f.kuendigungsfrist} onChange={set('kuendigungsfrist')} />
        <Feld breit label="Spesen / Zulagen" value={f.spesenInfo} onChange={set('spesenInfo')} />
        <Feld breit label="Bemerkungen" value={f.bemerkungen} onChange={set('bemerkungen')} />
      </div>

      <button onClick={sichern} className="w-full rounded-2xl py-3 font-bold btn-grad mt-2">Speichern</button>
      {einsatz && (
        <button onClick={loeschen} className="w-full py-2 text-sm text-white/35 hover:text-ember inline-flex items-center justify-center gap-1.5">
          <Trash2 className="w-4 h-4" /> Einsatz löschen
        </button>
      )}
    </Sheet>
  )
}
