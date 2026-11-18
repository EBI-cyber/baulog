import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FolderTree, ChevronDown, Check, AlertTriangle, CloudUpload } from 'lucide-react'
import { useEinstellungen } from '../lib/settings'
import { KURZBEFEHL, ablegen, offeneAblagen, testAblegen } from '../lib/ablage'
import { ordnerPfad } from '../lib/versand'
import { isoWoche } from '../lib/zeit'

/** Einstellungen: Rapporte über einen Kurzbefehl geordnet in OneDrive ablegen (ohne Microsoft-Registrierung) */
export default function AblageKarte({ Karte }) {
  const [einst, setEinst] = useEinstellungen()
  const [hilfe, setHilfe] = useState(!einst.ablageKurzbefehl)
  const [meldung, setMeldung] = useState('')
  const offen = useLiveQuery(() => offeneAblagen(), [], [])
  const beispiel = ordnerPfad(einst.onedriveOrdner, isoWoche(new Date()), { buero: einst.buero, firma: einst.firma })

  async function los(fn) {
    setMeldung('')
    try { const d = await fn(); setMeldung(`${d.length} Datei${d.length === 1 ? '' : 'en'} an den Kurzbefehl übergeben.`) } catch (e) { setMeldung('Fehler: ' + e.message) }
  }

  return (
    <Karte icon={FolderTree} titel="OneDrive-Ablage per Kurzbefehl">
      <div className="text-sm text-white/70">Jeder gesendete Rapport (auch der fotografierte Papier-Rapport) und sein Zeitnachweis landen geordnet in OneDrive — <b className="text-white/85">ohne Microsoft-Einrichtung</b>, über die OneDrive-App und einen Kurzbefehl. Ordner für Jahr und Monat legt das iPhone selbst an:</div>
      <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm font-mono text-white/85">
        OneDrive / {beispiel} /<br />&nbsp;&nbsp;KW{String(isoWoche(new Date()).kw).padStart(2, '0')}_{isoWoche(new Date()).jahr}_Rapport_….pdf<br />&nbsp;&nbsp;KW{String(isoWoche(new Date()).kw).padStart(2, '0')}_{isoWoche(new Date()).jahr}_Zeitnachweis_….pdf<br />OneDrive / Rapporte / Sicherung / …json
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!einst.ablageKurzbefehl} onChange={(e) => setEinst({ ablageKurzbefehl: e.target.checked })} className="w-5 h-5 accent-cyan-400" /> Ablage per Kurzbefehl verwenden</label>

      <button onClick={() => setHilfe(!hilfe)} className="text-sm text-white/65 inline-flex items-center gap-1">
        <ChevronDown className={'w-4 h-4 transition ' + (hilfe ? 'rotate-180' : '')} /> Kurzbefehl „{KURZBEFEHL}“ einrichten (einmalig, 5 Minuten)
      </button>
      {hilfe && (
        <div className="text-sm text-white/75 space-y-3">
          <div>
            <div className="font-semibold text-white">1. OneDrive vorbereiten</div>
            <div>App <b>OneDrive</b> installieren und anmelden. In der App <b>Dateien</b> → „Durchsuchen“ → <b>…</b> → <b>Bearbeiten</b> → <b>OneDrive</b> einschalten.</div>
          </div>
          <div>
            <div className="font-semibold text-white">2. Kurzbefehl anlegen</div>
            <div>App <b>Kurzbefehle</b> → <b>+</b> → oben den Namen genau <b>{KURZBEFEHL}</b> geben. Dann diese Aktionen der Reihe nach hinzufügen (über die Suche unten):</div>
            <ol className="list-decimal pl-5 space-y-1.5 mt-1.5">
              <li><b>Zwischenablage abrufen</b></li>
              <li><b>Wörterbuch abrufen</b> (aus der Eingabe „Zwischenablage“)</li>
              <li><b>Wörterbuchwert abrufen</b> → Wert für Schlüssel <span className="font-mono">dateien</span></li>
              <li><b>Wiederholen mit jedem Objekt</b> (in „Wörterbuchwert“) — darin:
                <ol className="list-[lower-alpha] pl-5 space-y-1 mt-1">
                  <li><b>Wörterbuchwert abrufen</b> → Schlüssel <span className="font-mono">daten</span> aus <b>Wiederholungsobjekt</b></li>
                  <li><b>Base64-Codierung</b> → auf <b>Decodieren</b> stellen</li>
                  <li><b>Wörterbuchwert abrufen</b> → Schlüssel <span className="font-mono">ziel</span> aus <b>Wiederholungsobjekt</b></li>
                  <li><b>Datei sichern</b> → Datei: <b>Base64-codiert</b> (das Ergebnis von b) · „Fragen, wo gesichert werden soll“ <b>aus</b> · „in … sichern“: <b>OneDrive → Dateien → Rapporte</b> (Ordner „Rapporte“ vorher in der App Dateien anlegen: OneDrive → Dateien → ••• → Neuer Ordner) · <b>Unterpfad</b>: die Variable <b>Wörterbuchwert</b> aus c · „Überschreiben, falls Datei existiert“ <b>an</b></li>
                </ol>
              </li>
              <li><b>Mitteilung anzeigen</b> → „Rapporte in OneDrive abgelegt“</li>
            </ol>
          </div>
          <div>
            <div className="font-semibold text-white">3. Testen</div>
            <div>Unten auf <b>Test ablegen</b> tippen → Kurzbefehle öffnet sich und läuft → danach liegt <span className="font-mono">Test.txt</span> im OneDrive-Ordner <span className="font-mono">Rapporte</span>. Beim ersten Mal fragt das iPhone, ob der Kurzbefehl auf OneDrive zugreifen darf → <b>Immer erlauben</b>. Danach mit einem Wisch zurück in die App.</div>
          </div>
          <div className="text-xs text-white/60">Die Bezeichnungen der Aktionen können je nach iOS-Version leicht anders heissen. Der Ordneraufbau richtet sich nach „OneDrive-Ordner“ im Abschnitt „Automatischer Versand“ (Standard Rapporte/{'{jahr}'}/{'{monat}'}).</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => los(testAblegen)} className="rounded-xl py-2.5 bg-white/10 text-sm font-semibold">Test ablegen</button>
        <button onClick={() => los(() => ablegen({ keys: offen.map((s) => s.key), mitSicherung: true }))} disabled={!offen.length}
          className="rounded-xl py-2.5 btn-grad text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"><CloudUpload className="w-4 h-4" /> {offen.length ? `${offen.length} ablegen` : 'Alles abgelegt'}</button>
      </div>
      {meldung && <div className={'text-sm flex gap-2 ' + (meldung.startsWith('Fehler') ? 'text-rose-300' : 'text-lime')}>{meldung.startsWith('Fehler') ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <Check className="w-4 h-4 shrink-0 mt-0.5" />}{meldung}</div>}
    </Karte>
  )
}

/** Hinweis (Heute/Woche): gesendete Rapporte, die noch nicht in OneDrive liegen → ein Tipp legt alle ab */
export function AblageHinweis() {
  const [einst] = useEinstellungen()
  const offen = useLiveQuery(() => offeneAblagen(), [], [])
  const [meldung, setMeldung] = useState('')
  if (!einst.ablageKurzbefehl || (!offen.length && !meldung)) return null
  const kws = offen.map((s) => 'KW ' + +s.key.slice(6, 8)).filter((v, i, a) => a.indexOf(v) === i)
  return (
    <button onClick={async () => { try { const d = await ablegen({ keys: offen.map((s) => s.key), mitSicherung: true }); setMeldung(`${d.length} Dateien an „${KURZBEFEHL}“ übergeben.`) } catch (e) { setMeldung('Fehler: ' + e.message) } }}
      className="w-full text-left rounded-2xl px-4 py-3 bg-sky-400/10 border border-sky-400/30 text-sky-200 flex gap-3 items-center">
      <CloudUpload className="w-5 h-5 shrink-0" />
      <span className="flex-1 text-sm">{meldung || <>Noch nicht in OneDrive: <b>{kws.join(', ')}</b> — antippen zum Ablegen (mit Datensicherung).</>}</span>
    </button>
  )
}
