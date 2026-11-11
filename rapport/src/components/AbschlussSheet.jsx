import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { CheckCircle2, Send, Mail, CloudUpload, Loader2, AlertTriangle, Share2, Building2, Phone, MessageCircle, Copy, ShieldAlert, UserPlus, MapPin } from 'lucide-react'
import Sheet from './Sheet'
import Unterschrift from './Unterschrift'
import QrSignatur from './QrSignatur'
import FernSenden from './FernSenden'
import { useEinstellungen } from '../lib/settings'
import { gruppenLaden, rapportStatus } from '../lib/rapporte'
import { abschliessen, gruppenPdf, ordnerPfad } from '../lib/versand'
import { useMs } from '../lib/microsoft'
import { teileDatei, whatsappLink } from '../lib/teilen'
import { db } from '../lib/db'
import { liste, standardPerson, finde, merken, FUNKTIONEN } from '../lib/unterschreiber'
import { wochenRechnung, std } from '../lib/woche'
import { ausKey } from '../lib/zeit'
import { ortVomStandort } from '../lib/standort'

/** Wochenabschluss: pro Firma unterschreiben (ich + Einsatzbetrieb), dann automatisch senden & sichern */
export default function AbschlussSheet({ wKey, onClose }) {
  const [einst] = useEinstellungen()
  const ms = useMs()
  const woche = ausKey(wKey)
  const gruppen = useLiveQuery(() => gruppenLaden(wKey, einst), [wKey, einst.name, einst.firma], null)
  const verbunden = !!(ms.refreshToken && ms.clientId)

  return (
    <Sheet titel={`Woche abschliessen · KW ${woche.kw}`} icon={Send} onClose={onClose}>
      {!gruppen ? <Loader2 className="w-5 h-5 animate-spin text-white/40" /> : !gruppen.length ? (
        <div className="text-sm text-white/50">In dieser Woche gibt es keine abgeschlossenen Zeiten.</div>
      ) : gruppen.map((g) => (
        <Gruppe key={g.firma} g={g} wKey={wKey} woche={woche} einst={einst} verbunden={verbunden} mehrere={gruppen.length > 1} />
      ))}
      {!verbunden && (
        <div className="text-xs text-white/45">
          Für den vollautomatischen Versand (E-Mail ans Büro + OneDrive) einmal unter <Link to="/einstellungen" onClick={onClose} className="underline">Einstellungen → Automatischer Versand</Link> mit Microsoft verbinden.
        </div>
      )}
    </Sheet>
  )
}

function Gruppe({ g, wKey, woche, einst, verbunden, mehrere }) {
  const status = useLiveQuery(() => rapportStatus(wKey, g.firma, !mehrere), [wKey, g.firma, mehrere], undefined)
  // Einsatz live (die Liste der Unterschriftsberechtigten ändert sich beim Bestätigen)
  const einsatz = useLiveQuery(() => (g.einsatz?.id ? db.einsaetze.get(g.einsatz.id) : null), [g.einsatz?.id], g.einsatz) || g.einsatz
  const personen = liste(einsatz), haupt = standardPerson(einsatz)
  const [ma, setMa] = useState(null), [fi, setFi] = useState(null), [fiAm, setFiAm] = useState(null)
  // wer unterschreibt für den Einsatzbetrieb: { id?, name, funktion, email, tel, neu?, bestaetigt? }
  const [wer, setWer] = useState({ name: '', funktion: '', email: '', tel: '' })
  const [wunsch, setWunsch] = useState({ mail: true, onedrive: true })
  const [eb, setEb] = useState({ einsatzWeiter: null, beendetAm: '', bewertung: null }) // Angaben des Einsatzbetriebs
  const [laeuft, setLaeuft] = useState(false), [ergebnis, setErgebnis] = useState(null)
  // Ort der Unterschrift: gespeicherter Ort, sonst Standort des Handys, sonst Wohnort (änderbar)
  const [ort, setOrt] = useState(null), [ortQuelle, setOrtQuelle] = useState('')
  useEffect(() => {
    if (status === undefined) return
    if (status?.maOrt) { setOrt(status.maOrt); setOrtQuelle('gespeichert'); return }
    setOrt(einst.profil?.ort || ''); setOrtQuelle(einst.profil?.ort ? 'Wohnort' : '')
    let aus = false
    ortVomStandort().then((x) => { if (!aus && x?.ort) { setOrt(x.ort); setOrtQuelle('Standort') } })
    return () => { aus = true }
  }, [status === undefined]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (status === undefined) return
    setMa(status?.maBild || einst.unterschrift?.bild || null)
    setFi(status?.firmaBild || null)
    if (status) setEb({ einsatzWeiter: status.einsatzWeiter ?? null, beendetAm: status.beendetAm || '', bewertung: status.bewertung ?? null })
    if (status?.firmaName) setWer({ id: status.firmaId, name: status.firmaName, funktion: status.firmaFunktion || '', email: status.kopieEmail || '', tel: status.kopieTel || '',
      // per Link unterschrieben, aber nicht in der Liste: erst bestätigen
      ...(status.fern?.bestaetigen && !status.firmaId ? { neu: true, bestaetigt: false } : { bestaetigt: true }) })
    else if (haupt) setWer({ ...haupt, bestaetigt: true })
  }, [status === undefined]) // eslint-disable-line react-hooks/exhaustive-deps

  const waehle = (p) => setWer(p ? { ...p, bestaetigt: true } : { name: '', funktion: '', email: '', tel: '', neu: true, bestaetigt: true })
  // Vertretung: jemand anderes als der Haupt-Unterzeichner → steht im Rapport, Haupt-Unterzeichner bekommt Kopie
  const vertretung = haupt && wer.name && (wer.id ? wer.id !== haupt.id : wer.name.trim().toLowerCase() !== haupt.name.trim().toLowerCase()) ? haupt : null
  const unbestaetigt = fi && wer.neu && !wer.bestaetigt

  const total = wochenRechnung({ schichten: g.schichten, absenzen: g.absenzen, einst: g.einst }).total
  const jetzt = Date.now()
  const unterschriften = { maBild: ma, maAm: ma ? (status?.maBild === ma ? status.maAm : jetzt) : null,
    maOrt: ort || null, firmaOrt: fi && !fiAm ? (status?.firmaBild === fi && status.firmaOrt ? status.firmaOrt : ort || null) : status?.firmaOrt || null,
    firmaBild: fi, firmaName: wer.name.trim(), firmaFunktion: wer.funktion, firmaId: wer.id || null,
    firmaAm: fi ? (fiAm || (status?.firmaBild === fi ? status.firmaAm : jetzt)) : null,
    vertretungFuer: vertretung?.name || null, kopieCc: vertretung?.email || '',
    kopieEmail: (wer.email || '').trim(), kopieTel: (wer.tel || '').trim(),
    bewertung: eb.bewertung, einsatzWeiter: eb.einsatzWeiter, beendetAm: eb.einsatzWeiter === false ? eb.beendetAm : null }
  // PDF vorab (für das Teilen-Menü ohne Microsoft — iOS verlangt den direkten Klick)
  const datei = useMemo(() => gruppenPdf(g, woche, unterschriften, mehrere), [ma, fi, wer, fiAm, eb, g, ort]) // eslint-disable-line react-hooks/exhaustive-deps
  const email = g.einsatz?.bueroEmail

  async function los() {
    setLaeuft(true); setErgebnis(null)
    // bestätigte Person in die Liste der Unterschriftsberechtigten (nächstes Mal bekannt)
    if (fi && wer.name.trim()) { const p = await merken(einsatz, wer); if (p) unterschriften.firmaId = p.id }
    try {
      const r = await abschliessen({ g, wKey, unterschriften, wunsch, mehrere })
      setErgebnis(r)
    } finally { setLaeuft(false) }
  }

  const s = ergebnis?.status || status
  return (
    <section className="rounded-3xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold truncate">{g.firma}</div>
          <div className="text-xs text-white/45 truncate flex items-center gap-1"><Building2 className="w-3 h-3" /> {g.buero || 'Büro fehlt'}{g.einsatz?.einsatznummer ? ` · Nr. ${g.einsatz.einsatznummer}` : ''}</div>
        </div>
        <div className="shrink-0 text-lg font-extrabold grad-text tabular-nums">{std(total)} h</div>
      </div>

      <label className="flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2">
        <MapPin className="w-4 h-4 text-white/50 shrink-0" />
        <span className="text-xs text-white/50 shrink-0">Ort</span>
        <input value={ort || ''} onChange={(e) => { setOrt(e.target.value); setOrtQuelle('') }} placeholder="Ort der Unterschrift" className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none" />
        {ortQuelle && <span className="text-[10px] text-white/40 shrink-0">{ortQuelle}</span>}
      </label>
      <div className="space-y-1.5">
        <div className="text-xs text-white/50">Unterschrift Mitarbeiter ({einst.name || 'ich'})</div>
        <Unterschrift wert={ma} onChange={setMa} hoehe={130} />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs text-white/50">Unterschrift Einsatzbetrieb</div>
        {/* Wer unterschreibt? Bekannte Berechtigte oder neue Person */}
        <div className="flex flex-wrap gap-1.5">
          {personen.map((p) => (
            <button key={p.id} type="button" onClick={() => waehle(p)}
              className={'px-2.5 py-1.5 rounded-xl text-xs border text-left ' + (wer.id === p.id ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/70')}>
              {p.name}<span className="block text-[10px] opacity-70">{p.funktion}{p.standard ? ' · Standard' : ''}</span>
            </button>
          ))}
          <button type="button" onClick={() => waehle(null)}
            className={'px-2.5 py-1.5 rounded-xl text-xs border inline-flex items-center gap-1 ' + (wer.neu && !wer.id ? 'btn-grad border-transparent font-semibold' : 'border-dashed border-white/25 text-white/60')}>
            <UserPlus className="w-3.5 h-3.5" /> Andere Person
          </button>
        </div>
        {(wer.neu || !personen.length) && !wer.id && <>
          <input className="eingabe" placeholder="Name des Unterzeichners" value={wer.name} onChange={(e) => setWer({ ...wer, name: e.target.value, neu: true })} />
          <div className="flex flex-wrap gap-1.5">
            {FUNKTIONEN.map((fn) => (
              <button key={fn} type="button" onClick={() => setWer({ ...wer, funktion: fn, neu: true })}
                className={'px-2.5 py-1 rounded-full text-xs border ' + (wer.funktion === fn ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/60')}>{fn}</button>
            ))}
          </div>
        </>}
        {vertretung && <div className="text-xs rounded-xl px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-200">
          Vertretung: unterschreibt für <b>{vertretung.name}</b> ({vertretung.funktion}). Im Rapport steht „i.V.“{vertretung.email ? `, ${vertretung.name} bekommt eine Kopie` : ''}.
        </div>}
        <Unterschrift wert={fi} onChange={(b) => { setFi(b); setFiAm(null) }} hoehe={150} />
        {!fi && <QrSignatur g={g} woche={woche} ma={{ bild: ma, am: unterschriften.maAm }} onUnterschrift={({ bild, name, funktion, id, am, email, tel, bewertung, einsatzWeiter, beendetAm }) => {
          setFi(bild); setFiAm(am)
          setEb({ einsatzWeiter: einsatzWeiter ?? null, beendetAm: beendetAm || '', bewertung: bewertung ?? null })
          const p = finde(einsatz, { id, email, name })
          // bekannte Person → direkt; neue Person → erst bestätigen
          setWer(p ? { ...p, email: email || p.email, tel: tel || p.tel, bestaetigt: true }
            : { name: name || '', funktion: funktion || '', email: email || '', tel: tel || '', neu: true, bestaetigt: false })
        }} />}
        {!fi && <FernSenden g={g} woche={woche} wKey={wKey} ma={{ bild: ma, am: unterschriften.maAm }} wer={wer} setWer={setWer} ort={ort}
          eb={{ bewertung: eb.bewertung, einsatzWeiter: eb.einsatzWeiter }} einst={einst} status={status} mehrere={mehrere} />}
        {unbestaetigt && (
          <div className="rounded-2xl p-3 bg-amber-400/10 border border-amber-400/40 space-y-2">
            <div className="text-sm text-amber-200 flex gap-2"><ShieldAlert className="w-5 h-5 shrink-0" />
              <span><b>{wer.name}</b>{wer.funktion ? ` (${wer.funktion})` : ''} unterschreibt zum ersten Mal für {g.firma}. Ist die Person berechtigt?</span></div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setWer({ ...wer, bestaetigt: true })} className="rounded-xl py-2 btn-grad text-sm font-bold">Ja, berechtigt</button>
              <button type="button" onClick={() => { setFi(null); haupt ? waehle(haupt) : setWer({ name: '', funktion: '', email: '', tel: '' }) }}
                className="rounded-xl py-2 bg-white/10 text-sm font-semibold">Nein, verwerfen</button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-white/45">Einsatz</span>
          {[[true, 'geht weiter'], [false, 'ist beendet']].map(([v, l]) => (
            <button key={l} type="button" onClick={() => setEb({ ...eb, einsatzWeiter: eb.einsatzWeiter === v ? null : v })}
              className={'px-2.5 py-1 rounded-full border ' + (eb.einsatzWeiter === v ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/60')}>{l}</button>
          ))}
          {eb.einsatzWeiter === false && <input type="date" className="eingabe py-1 text-xs w-36" value={eb.beendetAm} onChange={(x) => setEb({ ...eb, beendetAm: x.target.value })} />}
          <span className="text-white/45 ml-2">Beurteilung</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setEb({ ...eb, bewertung: eb.bewertung === n ? null : n })}
              className={'w-7 h-7 rounded-full border ' + (eb.bewertung === n ? 'btn-grad border-transparent font-bold' : 'border-white/15 text-white/60')}>{n}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="relative"><Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input className="eingabe pl-9 text-sm" type="email" placeholder="Durchschlag E-Mail" value={wer.email || ''} onChange={(e) => setWer({ ...wer, email: e.target.value })} /></div>
          <div className="relative"><Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input className="eingabe pl-9 text-sm" type="tel" placeholder="Durchschlag WhatsApp" value={wer.tel || ''} onChange={(e) => setWer({ ...wer, tel: e.target.value })} /></div>
        </div>
      </div>

      {verbunden ? (
        <>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="w-5 h-5 accent-cyan-400" checked={wunsch.mail && !!email} disabled={!email} onChange={(e) => setWunsch({ ...wunsch, mail: e.target.checked })} />
            <Mail className="w-4 h-4 text-white/50" /> <span className="min-w-0 truncate">{email ? `E-Mail an ${email}` : 'Keine Büro-E-Mail im Einsatz eingetragen'}</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="w-5 h-5 accent-cyan-400" checked={wunsch.onedrive} onChange={(e) => setWunsch({ ...wunsch, onedrive: e.target.checked })} />
            <CloudUpload className="w-4 h-4 text-white/50" /> <span className="min-w-0 truncate">OneDrive: {ordnerPfad(einst.onedriveOrdner, woche, g)}</span>
          </label>
          <button onClick={los} disabled={laeuft || unbestaetigt || (fi && !wer.name.trim()) || (!wunsch.mail && !wunsch.onedrive)}
            className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {laeuft ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Bestätigen & senden
          </button>
        </>
      ) : (
        <button disabled={unbestaetigt} onClick={async () => {
          if (fi && wer.name.trim()) await merken(einsatz, wer)
          const r = await teileDatei(datei.blob, datei.name).catch(() => 'fehler')
          if (r === 'geteilt' || r === 'heruntergeladen') await abschliessen({ g, wKey, unterschriften, wunsch, mehrere })
        }} className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50">
          <Share2 className="w-5 h-5" /> Unterschreiben & teilen
        </button>
      )}

      {s?.gesendetAm && <div className="text-sm text-lime flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> Gesendet an {s.gesendetAn || 'Büro'}</div>}
      {s?.gespeichertAm && <div className="text-sm text-lime flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> In OneDrive gespeichert{s.onedrivePfad ? `: ${s.onedrivePfad}` : ''}</div>}
      {s?.kopieGesendetAm && <div className="text-sm text-lime flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> Durchschlag per E-Mail an {[s.kopieEmail, s.vertretungFuer && s.kopieCc].filter(Boolean).join(' und ')}</div>}
      {(s?.gesendetAm || s?.abgeschlossenAm) && s?.kopieTel && (
        s.kopieLink
          ? <a href={whatsappLink(s.kopieTel, `Guten Tag${s.firmaName ? ' ' + s.firmaName : ''}, hier Ihr Durchschlag vom Rapport KW ${woche.kw}/${woche.jahr} (${einst.name}): ${s.kopieLink}`)}
              target="_blank" rel="noreferrer" className="w-full rounded-2xl py-3 bg-[#25D366]/15 border border-[#25D366]/40 text-[#7ee2a8] font-semibold inline-flex items-center justify-center gap-2">
              <MessageCircle className="w-5 h-5" /> Durchschlag per WhatsApp an {s.firmaName || s.kopieTel}</a>
          : <button onClick={() => teileDatei(datei.blob, datei.name).catch(() => {})}
              className="w-full rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2">
              <Copy className="w-5 h-5" /> Durchschlag teilen (WhatsApp {s.kopieTel})</button>
      )}
      {s?.versandOffen && <div className="text-sm text-amber-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Kein Netz — wird automatisch nachgesendet.</div>}
      {s?.fehler && !s?.versandOffen && <div className="text-sm text-ember flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {s.fehler}</div>}
    </section>
  )
}
