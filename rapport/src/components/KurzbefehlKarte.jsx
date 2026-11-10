import { useState } from 'react'
import { Hand, Copy, Check, ChevronDown, RefreshCw } from 'lucide-react'
import { useEinstellungen } from '../lib/settings'
import { stempelVerfuegbar, stempelUrl, schluessel } from '../lib/stempel'

function UrlZeile({ titel, aktion }) {
  const [ok, setOk] = useState(false)
  const url = stempelUrl(aktion)
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{titel}</div>
        <div className="text-[11px] text-white/35 truncate font-mono">{url}</div>
      </div>
      <button onClick={() => { navigator.clipboard?.writeText(url); setOk(true); setTimeout(() => setOk(false), 1500) }}
        className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs inline-flex items-center gap-1">
        {ok ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {ok ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  )
}

/** Einstellungen: Stempeln ohne App öffnen (Rückseite tippen, Siri, Ort) */
export default function KurzbefehlKarte({ Karte }) {
  const [einst, setEinst] = useEinstellungen()
  const [hilfe, setHilfe] = useState(false)
  const [test, setTest] = useState('')
  if (!stempelVerfuegbar) return null
  const aktiv = einst.stempelAktiv && einst.stempelKey

  return (
    <Karte icon={Hand} titel="Stempeln ohne App öffnen">
      <div className="text-sm text-white/55">Zweimal auf die <b className="text-white/80">Rückseite des iPhones</b> tippen = Pause ein/aus, dreimal = Start/Feierabend. Auch per Siri („Pause“) oder automatisch beim Ankommen am Arbeitsort. Die Zeit stimmt auf die Sekunde — die App übernimmt die Tipps beim nächsten Öffnen.</div>
      {!aktiv ? (
        <button onClick={() => schluessel()} className="w-full rounded-2xl py-3 btn-grad font-bold">Einschalten</button>
      ) : (
        <>
          <UrlZeile titel="Pause ein/aus (Doppeltipp)" aktion="pause" />
          <UrlZeile titel="Start / Feierabend (Dreifachtipp)" aktion="arbeit" />
          <button onClick={() => setHilfe(!hilfe)} className="text-sm text-white/60 inline-flex items-center gap-1">
            <ChevronDown className={'w-4 h-4 transition ' + (hilfe ? 'rotate-180' : '')} /> Einrichten — Schritt für Schritt (einmalig, 5 Minuten)
          </button>
          {hilfe && (
            <div className="text-sm text-white/70 space-y-3">
              <div>
                <div className="font-semibold text-white">1. Kurzbefehl „Pause“ anlegen</div>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Oben bei „Pause ein/aus“ auf <b>Kopieren</b> tippen.</li>
                  <li>App <b>Kurzbefehle</b> öffnen → <b>+</b> (neuer Kurzbefehl).</li>
                  <li>Aktion <b>„Inhalte von URL abrufen“</b> hinzufügen → als URL die kopierte Adresse einsetzen.</li>
                  <li>Aktion <b>„Mitteilung anzeigen“</b> hinzufügen → als Text die Variable <b>„Inhalte von URL“</b> wählen.</li>
                  <li>Oben den Namen <b>Pause</b> geben → Fertig.</li>
                </ol>
              </div>
              <div>
                <div className="font-semibold text-white">2. Kurzbefehl „Arbeit“ anlegen</div>
                <div>Genauso mit der Adresse „Start / Feierabend“ und dem Namen <b>Arbeit</b>. Tipp: als erste Aktion <b>„Hinweis anzeigen“</b> mit „Abbrechen“-Knopf — dann bestätigst du den Feierabend und er passiert nicht aus Versehen in der Hosentasche.</div>
              </div>
              <div>
                <div className="font-semibold text-white">3. Auf die Rückseite tippen</div>
                <div>iPhone-<b>Einstellungen → Bedienungshilfen → Tippen → Auf Rückseite tippen</b>: <b>Doppeltippen</b> = Kurzbefehl „Pause“, <b>Dreifachtippen</b> = Kurzbefehl „Arbeit“.</div>
              </div>
              <div>
                <div className="font-semibold text-white">4. Siri (optional)</div>
                <div>„Hey Siri, <b>Pause</b>“ bzw. „Hey Siri, <b>Arbeit</b>“ — funktioniert automatisch über den Namen.</div>
              </div>
              <div>
                <div className="font-semibold text-white">5. Automatisch beim Ankommen (optional)</div>
                <div>Kurzbefehle → <b>Automation → +</b> → <b>Ankommen</b> → Arbeitsort wählen (Radius ca. 200 m) → <b>Sofort ausführen</b> → Aktion „Inhalte von URL abrufen“ mit der Start-Adresse (wie oben, aber am Ende <span className="font-mono">a=start</span> statt <span className="font-mono">a=arbeit</span>). Für Pausen ist der Ort zu ungenau — dafür ist der Doppeltipp da.</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={async () => { setTest('…'); try { setTest(await (await fetch(stempelUrl('status'))).text()) } catch (e) { setTest('Fehler: ' + e.message) } }}
              className="rounded-xl py-2.5 bg-white/10 text-sm font-semibold">Verbindung testen</button>
            <button onClick={() => { if (confirm('Neuen Schlüssel erzeugen? Die alten Kurzbefehle funktionieren dann nicht mehr und müssen die neuen Adressen bekommen.')) schluessel(true) }}
              className="rounded-xl py-2.5 bg-white/10 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><RefreshCw className="w-4 h-4" /> Neuer Schlüssel</button>
          </div>
          {test && <div className="text-sm text-white/70">Antwort: <b>{test}</b></div>}
          <button onClick={() => setEinst({ stempelAktiv: false })} className="text-xs text-white/35">Ausschalten</button>
        </>
      )}
    </Karte>
  )
}
