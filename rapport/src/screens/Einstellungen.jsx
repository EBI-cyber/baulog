import { useRef, useState } from 'react'
import { User, Building2, Factory, X, Download, Upload, Smartphone, Info, FileSignature } from 'lucide-react'
import { useEinstellungen, tagesSoll } from '../lib/settings'
import { exportieren, importieren } from '../lib/db'
import { teileDatei } from '../lib/teilen'
import { isoDatum } from '../lib/zeit'
import FirmaWahl from '../components/FirmaWahl'
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

      <Karte icon={Building2} titel="Temporärbüro">
        <Feld label="Name des Büros" value={einst.buero} onChange={(e) => setEinst({ buero: e.target.value })} placeholder="z.B. Muster Personal AG" />
        <Feld label="WhatsApp-Nummer des Büros (optional)" value={einst.bueroTel} inputMode="tel"
          onChange={(e) => setEinst({ bueroTel: e.target.value })} placeholder="+41 79 123 45 67"
          hinweis="Für den Knopf „Chat mit Büro“. Der Rapport selbst geht übers Teilen-Menü." />
      </Karte>

      <Karte icon={Factory} titel="Einsatzbetriebe (Firmen)">
        <FirmaWahl firmen={einst.firmen} wert={einst.firma} onWahl={(f) => setEinst({ firma: f })}
          onNeu={(n) => setEinst({ firmen: [...einst.firmen, n] })} />
        {einst.firmen.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {einst.firmen.map((f) => (
              <div key={f} className="flex items-center justify-between text-sm bg-white/[0.04] rounded-xl px-3 py-2">
                <span className="truncate min-w-0">{f}</span>
                <button className="text-white/30 hover:text-ember shrink-0 p-1" aria-label={`${f} entfernen`}
                  onClick={() => setEinst({ firmen: einst.firmen.filter((x) => x !== f), firma: einst.firma === f ? '' : einst.firma })}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
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

      <Karte icon={Download} titel="Datensicherung">
        <div className="text-sm text-white/55">Alle Zeiten liegen nur auf diesem Gerät. Sichere sie ab und zu (z.B. auch in OneDrive).</div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={sichern} className="rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Sichern</button>
          <button onClick={() => datei.current?.click()} className="rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> Einspielen</button>
        </div>
        <input ref={datei} type="file" accept="application/json,.json" className="hidden" onChange={laden} />
        {meldung && <div className={'text-sm rounded-xl px-3 py-2 border ' + (meldung.ok ? 'bg-lime/15 border-lime/30 text-lime' : 'bg-ember/15 border-ember/30 text-ember')}>{meldung.text}</div>}
      </Karte>
    </div>
  )
}
