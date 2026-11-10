import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { User, Building2, Factory, X, Download, Upload, Smartphone, Info, FileSignature, PenLine, Plus, ChevronRight, Sparkles, LogOut, MapPin } from 'lucide-react'
import { useEinstellungen, tagesSoll } from '../lib/settings'
import { db, exportieren, importieren } from '../lib/db'
import { KANTONE } from '../lib/feiertage'
import { chf } from '../lib/lohn'
import { anmelden, abmelden, angemeldetAls, kiVerfuegbar } from '../lib/ki'
import EinsatzSheet from '../components/EinsatzSheet'
import MicrosoftKarte from '../components/MicrosoftKarte'
import Unterschrift from '../components/Unterschrift'
import { teileDatei } from '../lib/teilen'
import { isoDatum } from '../lib/zeit'
import IconChip from '../ui/IconChip'

function Karte({ icon, titel, children }) {
  return (
    <section className="glass rounded-3xl p-5 space-y-3">
      <div className="font-bold flex items-center gap-2.5"><IconChip icon={icon} size="w-9 h-9" iconClass="w-[18px] h-[18px]" /> {titel}</div>
      {children}
    </section>
  )
}

function Feld({ label, hinweis, ...rest }) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1">{label}</label>
      <input className="eingabe" {...rest} />
      {hinweis && <div className="text-xs text-white/35 mt-1">{hinweis}</div>}
    </div>
  )
}

export default function Einstellungen() {
  const [einst, setEinst] = useEinstellungen()
  const [meldung, setMeldung] = useState(null)
  const datei = useRef()
  const einsaetze = useLiveQuery(() => db.einsaetze.toArray(), [], [])
  const [einsatz, setEinsatz] = useState(null) // { e } bearbeiten | { vorgabe } | {} neu
  const [konto, setKonto] = useState(null)
  const [login, setLogin] = useState({ email: '', pw: '' })
  useEffect(() => { angemeldetAls().then(setKonto).catch(() => {}) }, [])

  async function sichern() {
    const blob = new Blob([JSON.stringify(await exportieren(), null, 1)], { type: 'application/json' })
    // Nach einem await lässt iOS das Teilen-Menü evtl. nicht zu → dann wird heruntergeladen
    try { await teileDatei(blob, `Rapport-Sicherung_${isoDatum(new Date())}.json`) }
    catch { setMeldung({ ok: false, text: 'Sicherung konnte nicht geteilt werden.' }) }
  }

  async function laden(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!confirm('Alle Zeiten auf diesem Gerät durch die Sicherung ersetzen?')) return
    try { await importieren(JSON.parse(await f.text())); setMeldung({ ok: true, text: 'Sicherung eingespielt.' }) }
    catch (err) { setMeldung({ ok: false, text: 'Fehler: ' + err.message }) }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">Einstellungen</h1>

      <Karte icon={User} titel="Ich">
        <Feld label="Mein Name (steht im Rapport)" value={einst.name} autoComplete="name"
          onChange={(e) => setEinst({ name: e.target.value })} placeholder="Vorname Nachname" />
      </Karte>

      <Karte icon={PenLine} titel="Meine Unterschrift">
        <div className="text-sm text-white/55">Einmal unterschreiben — wird bei jedem Rapport automatisch eingesetzt.</div>
        <Unterschrift wert={einst.unterschrift?.bild || null} onChange={(bild) => setEinst({ unterschrift: bild ? { bild, am: Date.now() } : null })} />
      </Karte>

      <MicrosoftKarte Karte={Karte} />

      <Karte icon={Building2} titel="Temporärbüro (Standard)">
        <div className="text-sm text-white/55">Jeder Einsatz hat sein eigenes Büro (unten bei den Einsätzen). Diese Angaben gelten nur, wenn im Einsatz keins steht.</div>
        <Feld label="Name des Büros" value={einst.buero} onChange={(e) => setEinst({ buero: e.target.value })} placeholder="z.B. Muster Personal AG" />
        <Feld label="WhatsApp-Nummer des Büros (optional)" value={einst.bueroTel} inputMode="tel"
          onChange={(e) => setEinst({ bueroTel: e.target.value })} placeholder="+41 79 123 45 67"
          hinweis="Für den Knopf „Chat mit Büro“. Der Rapport selbst geht übers Teilen-Menü." />
      </Karte>

      <Karte icon={Factory} titel="Einsätze (Firmen & Verträge)">
        <div className="text-sm text-white/55">Pro Einsatz: Firma, Kanton (für die Feiertage), Lohn und Abzüge — am einfachsten per Foto vom Einsatzvertrag.</div>
        <div className="space-y-2">
          {einst.firmen.map((f) => {
            const e = (einsaetze || []).find((x) => x.firma === f)
            return (
              <div key={f} className="flex items-center gap-2">
                <button onClick={() => setEinsatz(e ? { e } : { vorgabe: { firma: f } })}
                  className="flex-1 min-w-0 text-left rounded-2xl px-3 py-2.5 bg-white/[0.04] border border-white/10 flex items-center gap-3 card-hover">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{f}{einst.firma === f && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-aqua/15 text-aqua align-middle">aktuell</span>}</div>
                    <div className="text-xs text-white/45 truncate">
                      {e ? [e.kanton, e.einsatzort, e.stundenlohn && `${chf(+e.stundenlohn, einst.waehrung)}/Std.`].filter(Boolean).join(' · ') || 'Vertrag ohne Angaben' : 'Kein Vertrag erfasst — antippen'}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                </button>
                <button className="text-white/30 hover:text-ember shrink-0 p-2" aria-label={`${f} aus Liste entfernen`}
                  onClick={() => setEinst({ firmen: einst.firmen.filter((x) => x !== f), firma: einst.firma === f ? '' : einst.firma })}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
        <button onClick={() => setEinsatz({})} className="w-full rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" /> Neuer Einsatz
        </button>
        <div>
          <label className="block text-xs text-white/50 mb-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Kanton, falls kein Einsatz zugeordnet</label>
          <select value={einst.kanton} onChange={(e) => setEinst({ kanton: e.target.value })} className="eingabe">
            <option value="">–</option>
            {Object.entries(KANTONE).map(([k, n]) => <option key={k} value={k}>{k} – {n}</option>)}
          </select>
        </div>
      </Karte>

      <Karte icon={FileSignature} titel="Arbeitsvertrag">
        <div className="grid grid-cols-2 gap-3">
          <Feld label="Soll-Stunden / Woche" value={einst.wochenSoll} inputMode="decimal" placeholder="z.B. 42"
            onChange={(e) => setEinst({ wochenSoll: e.target.value })} />
          <Feld label="Arbeitstage / Woche" value={einst.arbeitstage} inputMode="numeric"
            onChange={(e) => setEinst({ arbeitstage: parseInt(e.target.value, 10) || '' })} />
        </div>
        <div className="text-xs text-white/40">Tagessoll: <b className="text-white/70">{String(tagesSoll(einst)).replace('.', ',')} h</b> — wird bei Ferien, Krankheit, Feiertag usw. als Vorschlag angerechnet.</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Währung</label>
            <div className="flex gap-2">
              {['CHF', 'EUR'].map((w) => (
                <button key={w} onClick={() => setEinst({ waehrung: w })}
                  className={'flex-1 rounded-xl py-2.5 text-sm border ' + (einst.waehrung === w ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/65')}>{w}</button>
              ))}
            </div>
          </div>
          <Feld label={`Kilometer-Satz (${einst.waehrung}/km)`} value={einst.kmSatz} inputMode="decimal"
            onChange={(e) => setEinst({ kmSatz: e.target.value })} />
        </div>
      </Karte>

      <Karte icon={Smartphone} titel="Auf dem iPhone einrichten">
        <ol className="text-sm text-white/70 space-y-2 list-decimal pl-5">
          <li>Diese Seite in <b>Safari</b> öffnen → Teilen-Knopf → <b>„Zum Home-Bildschirm“</b>. Danach immer über das App-Symbol starten.</li>
          <li><b>OneDrive-App</b> installieren und anmelden. In der Dateien-App unter „Durchsuchen → … → Bearbeiten“ OneDrive einschalten.</li>
          <li>Beim ersten „In OneDrive sichern“: <b>„In Dateien sichern“</b> → OneDrive → Ordner wählen (z.B. <i>Rapporte</i>). iOS merkt sich den Ordner.</li>
          <li>Beim ersten „Ans Büro senden“: <b>WhatsApp</b> → Chat des Büros wählen. Danach steht das Büro oben in den Vorschlägen.</li>
        </ol>
        <div className="text-xs text-white/40 flex gap-2"><Info className="w-4 h-4 shrink-0" /> Sobald eine Woche vorbei ist, erinnert dich die App auf „Heute“ an den Rapport.</div>
      </Karte>

      {kiVerfuegbar && <Karte icon={Sparkles} titel="KI-Zugang">
        {konto ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-white/70">Angemeldet als <b className="text-white">{konto}</b></span>
            <button onClick={async () => { await abmelden(); setKonto(null) }} className="shrink-0 text-white/50 inline-flex items-center gap-1"><LogOut className="w-4 h-4" /> Abmelden</button>
          </div>
        ) : (
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault()
            try { await anmelden(login.email, login.pw); setKonto(await angemeldetAls()); setLogin({ email: '', pw: '' }) }
            catch (err) { setMeldung({ ok: false, text: err.message }) }
          }}>
            <div className="text-sm text-white/55">Nur nötig, falls das Vertrags-Auslesen eine Anmeldung verlangt: dasselbe Konto wie in BauLog.</div>
            <input className="eingabe" type="email" autoComplete="email" placeholder="E-Mail" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
            <input className="eingabe" type="password" autoComplete="current-password" placeholder="Passwort" value={login.pw} onChange={(e) => setLogin({ ...login, pw: e.target.value })} />
            <button className="w-full rounded-2xl py-2.5 bg-white/10 font-semibold">Anmelden</button>
          </form>
        )}
      </Karte>}

      <Karte icon={Download} titel="Datensicherung">
        <div className="text-sm text-white/55">Alle Zeiten liegen nur auf diesem Gerät. Sichere sie ab und zu (z.B. auch in OneDrive).</div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={sichern} className="rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Sichern</button>
          <button onClick={() => datei.current?.click()} className="rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> Einspielen</button>
        </div>
        <input ref={datei} type="file" accept="application/json,.json" className="hidden" onChange={laden} />
        {meldung && <div className={'text-sm rounded-xl px-3 py-2 border ' + (meldung.ok ? 'bg-lime/15 border-lime/30 text-lime' : 'bg-ember/15 border-ember/30 text-ember')}>{meldung.text}</div>}
      </Karte>
      {einsatz && <EinsatzSheet einsatz={einsatz.e || null} vorgabe={einsatz.vorgabe} onClose={() => setEinsatz(null)} />}
    </div>
  )
}
