import { useRef, useState } from 'react'
import { Briefcase, Camera, Sparkles, Trash2, X, Loader2, AlertTriangle, Star, UserPlus } from 'lucide-react'
import Sheet from './Sheet'
import { db } from '../lib/db'
import { useEinstellungen, zahl } from '../lib/settings'
import { KANTONE } from '../lib/feiertage'
import { LOHN_STANDARD, ABZUEGE, stundenlohnTotal } from '../lib/lohn'
import { verkleinern } from '../lib/bild'
import { einsatzvertragLesen, kiVerfuegbar } from '../lib/ki'
import { BRANCHEN, branche, brancheAnwenden } from '../lib/branchen'
import { liste, FUNKTIONEN } from '../lib/unterschreiber'
import { ferienMindestProzent, alter } from '../lib/profil'
import { einsatzEnde } from '../lib/einsatzende'
import OrtSuche from './OrtSuche'
import VertragsCheck from './VertragsCheck'

const NEU = { firma: '', firmaAdresse: '', rapportVorlage: 'formular', ueberstundenModus: 'woche', branche: '', wegKm: '', maxDauerTage: '', einsatznummer: '', arbeitsbeginn: '', qualifikation: '', meldenBei: '', buero: '', bueroTel: '', bueroKontakt: '', bueroEmail: '', einsatzort: '', baustelle: '', kanton: '', funktion: '', beginn: '', ende: '', stundenlohnTotalVertrag: '',
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
  const [f, setF] = useState(() => ({ ...NEU, ...(vorgabe || {}), ...(einsatz || {}), unterschreiber: liste(einsatz) }))
  const setU = (fn) => setF((x) => ({ ...x, unterschreiber: fn(x.unterschreiber || []) }))
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
        if (r.angaben && typeof r.angaben === 'object') y.angaben = r.angaben
        y.klauseln = Array.isArray(r.klauseln) ? r.klauseln.filter((k) => k && (k.zitat || k.art)) : []
        if (r.karenztage != null) y.karenztage = String(r.karenztage)
        if (r.lohnzahlung) y.lohnzahlung = String(r.lohnzahlung)
        if (r.einsatzdauerTage) { y.maxDauerTage = String(r.einsatzdauerTage); erkannt.push('maxDauerTage') }
        if (r.arbeitszeitDurchschnitt === true) y.ueberstundenModus = 'keine'
        ;['firma', 'firmaAdresse', 'einsatznummer', 'arbeitsbeginn', 'qualifikation', 'meldenBei', 'buero', 'bueroTel', 'bueroKontakt', 'bueroEmail', 'einsatzort', 'funktion', 'beginn', 'ende', 'gavName', 'kuendigungsfrist', 'bemerkungen', ...ZAHLEN].forEach((k) => nimm(k))
        nimm('spesenInfo', 'spesen'); nimm('stundenlohnTotalVertrag', 'stundenlohnTotal')
        if (r.kanton && KANTONE[String(r.kanton).toUpperCase()]) { y.kanton = String(r.kanton).toUpperCase(); erkannt.push('kanton') }
        return y
      })
      if (!r.kanton && r.einsatzort) {
        const { kantonZu } = await import('../lib/plz')
        const kt = await kantonZu(String(r.einsatzort))
        if (kt) setF((x) => (x.kanton ? x : { ...x, kanton: kt }))
      }
      setKi({ laeuft: false, fehler: '', erkannt })
    } catch (err) {
      setKi({ laeuft: false, fehler: err.message, erkannt: null })
    }
  }

  async function sichern() {
    const firma = f.firma.trim()
    if (!firma) return setKi((k) => ({ ...k, fehler: 'Bitte den Einsatzbetrieb (Firma) eintragen.' }))
    const daten = { ...f, firma, unterschreiber: (f.unterschreiber || []).filter((x) => x.name?.trim()) }
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

      {(f.angaben || zahl(f.stundenlohn) > 0) && <VertragsCheck e={f} einst={einst} />}

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
        <Feld breit label="Adresse Einsatzbetrieb (für den Rapport)" value={f.firmaAdresse || ''} onChange={set('firmaAdresse')} placeholder="Strasse, PLZ Ort" />
        <div className="col-span-2">
          <label className="block text-xs text-white/50 mb-1">Einsatzort (setzt den Kanton für die Feiertage)</label>
          <OrtSuche wert={f.einsatzort} onWahl={(t) => setF((x) => ({ ...x, einsatzort: `${t.plz} ${t.ort}`, kanton: t.kanton }))} />
        </div>
        <Feld breit label="Strasse / Baustelle (für den Rapport)" value={f.baustelle || ''} onChange={set('baustelle')} placeholder="z.B. Buchserstrasse" />
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
        <Feld label="Arbeitsweg (einfach)" einheit="km" {...zahlFeld('wegKm')} />
        <Feld label="Beginn" type="date" value={f.beginn} onChange={set('beginn')} />
        <Feld label="Ende" type="date" value={f.ende} onChange={set('ende')} />
        <Feld label="Max. Dauer (Kalendertage)" inputMode="numeric" value={f.maxDauerTage} onChange={set('maxDauerTage')} placeholder="z.B. 14" />
        <div className="text-xs text-white/45 self-end pb-3">{einsatzEnde(f) ? `Endet am ${einsatzEnde(f).split('-').reverse().join('.')}` : 'Unbefristet'}</div>
      </div>

      <Titel>Temporärbüro</Titel>
      <div className="grid grid-cols-2 gap-3">
        <Feld breit label="Name des Büros (steht im Rapport)" value={f.buero} onChange={set('buero')} placeholder={einst.buero ? `leer = ${einst.buero} (Standard)` : ''} />
        <Feld label="WhatsApp / Telefon" inputMode="tel" value={f.bueroTel} onChange={set('bueroTel')} placeholder="+41 …" />
        <Feld label="Kontaktperson / Agent" value={f.bueroKontakt} onChange={set('bueroKontakt')} />
        <Feld breit label="E-Mail (Rapporte gehen automatisch hierhin)" type="email" value={f.bueroEmail} onChange={set('bueroEmail')} />
      </div>

      <Titel>Unterschrift Einsatzbetrieb — berechtigt</Titel>
      <div className="text-xs text-white/45">Wer den Rapport unterschreiben darf. <Star className="w-3 h-3 inline" /> = Standard (z.B. Polier). Unterschreibt jemand anderes, steht „i.V.“ im Rapport und der Standard bekommt eine Kopie. Neue Personen kommen nach deiner Bestätigung automatisch dazu.</div>
      <div className="space-y-2">
        {(f.unterschreiber || []).map((p, i) => (
          <div key={p.id || i} className="rounded-2xl bg-white/[0.04] border border-white/10 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Als Standard setzen" onClick={() => setU((l) => l.map((x, j) => ({ ...x, standard: j === i })))}
                className={'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ' + (p.standard ? 'btn-grad' : 'bg-white/10 text-white/40')}><Star className="w-4 h-4" /></button>
              <input className="eingabe py-1.5" placeholder="Name" value={p.name} onChange={(e) => setU((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <button type="button" aria-label="Entfernen" onClick={() => setU((l) => l.filter((_, j) => j !== i))} className="shrink-0 text-white/30 hover:text-ember p-1"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select className="eingabe py-1.5 text-sm" value={p.funktion} onChange={(e) => setU((l) => l.map((x, j) => (j === i ? { ...x, funktion: e.target.value } : x)))}>
                {FUNKTIONEN.map((fn) => <option key={fn}>{fn}</option>)}
              </select>
              <input className="eingabe py-1.5 text-sm" type="email" placeholder="E-Mail" value={p.email || ''} onChange={(e) => setU((l) => l.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
              <input className="eingabe py-1.5 text-sm" type="tel" placeholder="WhatsApp" value={p.tel || ''} onChange={(e) => setU((l) => l.map((x, j) => (j === i ? { ...x, tel: e.target.value } : x)))} />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setU((l) => [...l, { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name: '', funktion: l.length ? 'Vorarbeiter' : 'Polier', email: '', tel: '', standard: !l.some((x) => x.standard) }])}
          className="w-full rounded-xl py-2 border border-dashed border-white/20 text-white/60 text-sm inline-flex items-center justify-center gap-1.5"><UserPlus className="w-4 h-4" /> Person hinzufügen</button>
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
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
        <div className="text-xs text-white/55">Wie zahlt das Büro die Entschädigungen aus? (steht auf der Lohnabrechnung — „Guthaben“/„Saldo“ heisst angespart)</div>
        {[['ferien', 'Ferien'], ['feiertag', 'Feiertage'], ['dreizehnter', '13. Monatslohn']].map(([k, l]) => (
          <div key={k} className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 text-white/70">{l}</span>
            {[['laufend', 'mit jedem Lohn'], ['konto', 'angespart']].map(([m, ml]) => (
              <button key={m} type="button" onClick={() => setF((x) => ({ ...x, [`${k}Modus`]: m }))}
                className={'flex-1 px-2 py-1.5 rounded-lg text-xs border ' + ((f[`${k}Modus`] || 'laufend') === m ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/60')}>{ml}</button>
            ))}
          </div>
        ))}
      </div>
      {zahl(f.stundenlohn) > 0 && (
        <div className={'text-sm rounded-xl px-3 py-2 border flex gap-2 ' + (abweichung ? 'bg-amber-400/10 border-amber-400/30 text-amber-300' : 'bg-white/[0.04] border-white/10 text-white/60')}>
          {abweichung && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>Berechnet: <b className="text-white">{w} {totalBerechnet.toFixed(2)}</b> / Std. inkl. Entschädigungen
            {abweichung ? ` — Vertrag sagt ${w} ${totalVertrag.toFixed(2)}. Bitte Prozente prüfen.` : ''}</span>
        </div>
      )}

      {(() => {
        const min = ferienMindestProzent(einst.profil)
        if (!min || !zahl(f.ferienProzent) || zahl(f.ferienProzent) >= min) return null
        return <div className="text-sm rounded-xl px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Mit {alter(einst.profil)} Jahren stehen dir laut GAV Personalverleih mindestens {min} % Ferienentschädigung zu — im Vertrag stehen {f.ferienProzent} %. Beim Büro nachfragen.</div>
      })()}

      <Titel>Rapport</Titel>
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-white/70">Vorlage</span>
          {[['formular', 'Formular (Wochenraster)'], ['liste', 'Liste mit Uhrzeiten']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setF((x) => ({ ...x, rapportVorlage: v }))}
              className={'flex-1 px-2 py-1.5 rounded-lg text-xs border ' + ((f.rapportVorlage || 'formular') === v ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/60')}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-white/70">Überstunden</span>
          {[['woche', 'ab Wochensoll (125 %)'], ['keine', 'durchschnittl. Arbeitszeit']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setF((x) => ({ ...x, ueberstundenModus: v }))}
              className={'flex-1 px-2 py-1.5 rounded-lg text-xs border ' + ((f.ueberstundenModus || 'woche') === v ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/60')}>{l}</button>
          ))}
        </div>
        <div className="text-xs text-white/40">„Durchschnittliche Arbeitszeit“ (z.B. „40 Std. pro Woche durchschnittlich“): Stunden über dem Wochensoll bleiben Normalstunden — Überstunden nur, wenn angeordnet.</div>
      </div>

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
        <Feld label="Lohnzahlung (Termin)" value={f.lohnzahlung || ''} onChange={set('lohnzahlung')} />
        <Feld label="Wartetage bei Krankheit" inputMode="numeric" value={f.karenztage || ''} onChange={set('karenztage')} />
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
