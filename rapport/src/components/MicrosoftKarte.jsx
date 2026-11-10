import { useRef, useState } from 'react'
import { Send, Loader2, Copy, CheckCircle2, LogOut, ChevronDown, ExternalLink } from 'lucide-react'
import { useMs, msSpeichern, msStart, msPoll, msTrennen, msVersand } from '../lib/microsoft'
import { useEinstellungen } from '../lib/settings'
import { kiVerfuegbar } from '../lib/ki'

/** Einstellungen „Automatischer Versand": Microsoft verbinden (Gerätecode), Ordner, Abschluss-Tag */
export default function MicrosoftKarte({ Karte }) {
  const ms = useMs()
  const [einst, setEinst] = useEinstellungen()
  const [code, setCode] = useState(null)
  const [fehler, setFehler] = useState(''), [info, setInfo] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [hilfe, setHilfe] = useState(!ms.clientId)
  const abbruch = useRef(false)

  async function verbinden() {
    setFehler(''); setInfo(''); setLaeuft(true); abbruch.current = false
    try {
      const c = await msStart()
      setCode(c)
      const bis = Date.now() + (c.ablauf || 900) * 1000
      while (!abbruch.current && Date.now() < bis) {
        await new Promise((r) => setTimeout(r, (c.intervall || 5) * 1000))
        if (await msPoll(c.deviceCode)) { setCode(null); setInfo('Verbunden.'); return }
      }
      if (!abbruch.current) setFehler('Zeit abgelaufen — bitte nochmal.')
    } catch (e) { setFehler(e.message) } finally { setLaeuft(false); setCode(null) }
  }

  async function test() {
    setFehler(''); setInfo(''); setLaeuft(true)
    try {
      const blob = new Blob([`Rapport-App Test ${new Date().toLocaleString('de-CH')}`], { type: 'text/plain' })
      const r = await msVersand({
        datei: { name: 'Rapport-Test.txt', blob },
        onedrive: { ordner: 'Rapporte' },
        mail: { an: ms.konto, betreff: 'Rapport-App: Test', text: 'Der automatische Versand funktioniert.' },
      })
      setInfo([r.mail?.ok ? `Test-Mail an ${ms.konto} gesendet` : `Mail: ${r.mail?.fehler}`, r.onedrive?.ok ? `Datei in OneDrive: ${r.onedrive.pfad}` : `OneDrive: ${r.onedrive?.fehler}`].join(' · '))
    } catch (e) { setFehler(e.message) } finally { setLaeuft(false) }
  }

  const verbunden = ms.refreshToken && ms.clientId
  return (
    <Karte icon={Send} titel="Automatischer Versand">
      <div className="text-sm text-white/55">Rapporte gehen beim Wochenabschluss automatisch <b className="text-white/80">per E-Mail ans Büro</b> und werden <b className="text-white/80">in deinem OneDrive gespeichert</b> — über dein eigenes Microsoft-Konto.</div>
      {!kiVerfuegbar && <div className="text-sm text-amber-300">In dieser Version ohne Cloud nicht verfügbar.</div>}

      {verbunden ? (
        <div className="rounded-2xl bg-lime/10 border border-lime/25 px-3 py-2.5 flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-lime shrink-0" />
          <div className="min-w-0 flex-1 truncate">Verbunden: <b>{ms.konto || ms.name}</b></div>
          <button onClick={msTrennen} className="shrink-0 text-white/50 inline-flex items-center gap-1"><LogOut className="w-4 h-4" /> Trennen</button>
        </div>
      ) : (
        <>
          {ms.abgelaufen && <div className="text-sm text-amber-300">Die Microsoft-Anmeldung ist abgelaufen — bitte neu verbinden.</div>}
          <div>
            <label className="block text-xs text-white/50 mb-1">Microsoft App-ID (Client-ID)</label>
            <input className="eingabe font-mono text-sm" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={ms.clientId || ''}
              onChange={(e) => msSpeichern({ clientId: e.target.value.trim() })} />
          </div>
          <button onClick={() => setHilfe(!hilfe)} className="text-xs text-white/50 inline-flex items-center gap-1">
            <ChevronDown className={'w-3.5 h-3.5 transition ' + (hilfe ? 'rotate-180' : '')} /> So bekommst du die App-ID (einmalig, ca. 5 Minuten)
          </button>
          {hilfe && (
            <ol className="text-sm text-white/65 space-y-1.5 list-decimal pl-5">
              <li>Am Tablet/PC <a className="underline inline-flex items-center gap-0.5" href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer">entra.microsoft.com <ExternalLink className="w-3 h-3" /></a> mit deinem Microsoft-Konto öffnen → <b>App-Registrierungen → Neue Registrierung</b>.</li>
              <li>Name: <i>Rapport</i>. Kontotypen: <b>„Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten“</b>. Umleitungs-URI leer lassen → Registrieren.</li>
              <li>Links <b>Authentifizierung</b> → ganz unten <b>„Öffentliche Clientflows zulassen“ = Ja</b> → Speichern.</li>
              <li>Links <b>API-Berechtigungen</b> → Berechtigung hinzufügen → Microsoft Graph → Delegiert: <b>Files.ReadWrite</b>, <b>Mail.Send</b>, <b>User.Read</b>, <b>offline_access</b>.</li>
              <li>Unter <b>Übersicht</b> die <b>Anwendungs-ID (Client-ID)</b> kopieren und oben einfügen.</li>
            </ol>
          )}
          {code ? (
            <div className="rounded-2xl bg-aqua/10 border border-aqua/30 p-3 space-y-2 text-sm">
              <div>1. Code kopieren: <b className="font-mono text-lg tracking-wider">{code.userCode}</b>
                <button onClick={() => navigator.clipboard?.writeText(code.userCode)} className="ml-2 align-middle text-white/60"><Copy className="w-4 h-4 inline" /></button></div>
              <div>2. <a href={code.url} target="_blank" rel="noreferrer" className="underline font-semibold">{code.url}</a> öffnen, Code eingeben und mit deinem Microsoft-Konto anmelden.</div>
              <div className="text-white/50 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Warte auf Anmeldung …
                <button onClick={() => { abbruch.current = true }} className="underline">Abbrechen</button></div>
            </div>
          ) : (
            <button onClick={verbinden} disabled={!ms.clientId || laeuft || !kiVerfuegbar}
              className="w-full rounded-2xl py-3 btn-grad font-bold disabled:opacity-40">Mit Microsoft verbinden</button>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="col-span-2">
          <label className="block text-xs text-white/50 mb-1">OneDrive-Ordner</label>
          <input className="eingabe" value={einst.onedriveOrdner} onChange={(e) => setEinst({ onedriveOrdner: e.target.value })} />
          <div className="text-xs text-white/35 mt-1">Platzhalter: {'{jahr}'} {'{kw}'} {'{buero}'} {'{firma}'} — Ordner werden automatisch angelegt.</div>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Wochenabschluss ab</label>
          <select className="eingabe" value={einst.abschlussTag} onChange={(e) => setEinst({ abschlussTag: +e.target.value })}>
            <option value={4}>Donnerstag</option><option value={5}>Freitag</option><option value={6}>Samstag</option><option value={7}>Sonntag</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70 pt-5">
          <input type="checkbox" className="w-5 h-5 accent-cyan-400" checked={!!einst.kopieAnMich} onChange={(e) => setEinst({ kopieAnMich: e.target.checked })} />
          Kopie an mich
        </label>
      </div>
      <div className="text-xs text-white/40">„Feierabend“ ab diesem Tag öffnet direkt den Wochenabschluss: unterschreiben, bestätigen — fertig.</div>

      {verbunden && <button onClick={test} disabled={laeuft} className="w-full rounded-2xl py-2.5 bg-white/10 font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {laeuft && <Loader2 className="w-4 h-4 animate-spin" />} Test: Mail an mich + Datei in OneDrive
      </button>}
      {info && <div className="text-sm rounded-xl px-3 py-2 bg-lime/15 border border-lime/30 text-lime">{info}</div>}
      {fehler && <div className="text-sm rounded-xl px-3 py-2 bg-ember/15 border border-ember/30 text-ember">{fehler}</div>}
    </Karte>
  )
}
