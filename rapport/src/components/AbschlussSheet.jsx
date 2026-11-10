import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { CheckCircle2, Send, Mail, CloudUpload, Loader2, AlertTriangle, Share2, Building2 } from 'lucide-react'
import Sheet from './Sheet'
import Unterschrift from './Unterschrift'
import { useEinstellungen } from '../lib/settings'
import { gruppenLaden, rapportStatus } from '../lib/rapporte'
import { abschliessen, gruppenPdf, ordnerPfad } from '../lib/versand'
import { useMs } from '../lib/microsoft'
import { teileDatei } from '../lib/teilen'
import { wochenRechnung, std } from '../lib/woche'
import { ausKey } from '../lib/zeit'

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
  const [ma, setMa] = useState(null), [fi, setFi] = useState(null), [fiName, setFiName] = useState('')
  const [wunsch, setWunsch] = useState({ mail: true, onedrive: true })
  const [laeuft, setLaeuft] = useState(false), [ergebnis, setErgebnis] = useState(null)
  useEffect(() => {
    if (status === undefined) return
    setMa(status?.maBild || einst.unterschrift?.bild || null)
    setFi(status?.firmaBild || null)
    setFiName(status?.firmaName || g.einsatz?.meldenBei || '')
  }, [status === undefined]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = wochenRechnung({ schichten: g.schichten, absenzen: g.absenzen, einst: g.einst }).total
  const jetzt = Date.now()
  const unterschriften = { maBild: ma, maAm: ma ? (status?.maBild === ma ? status.maAm : jetzt) : null,
    firmaBild: fi, firmaName: fiName, firmaAm: fi ? (status?.firmaBild === fi ? status.firmaAm : jetzt) : null }
  // PDF vorab (für das Teilen-Menü ohne Microsoft — iOS verlangt den direkten Klick)
  const datei = useMemo(() => gruppenPdf(g, woche, unterschriften, mehrere), [ma, fi, fiName, g]) // eslint-disable-line react-hooks/exhaustive-deps
  const email = g.einsatz?.bueroEmail

  async function los() {
    setLaeuft(true); setErgebnis(null)
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

      <div className="space-y-1.5">
        <div className="text-xs text-white/50">Unterschrift Mitarbeiter ({einst.name || 'ich'})</div>
        <Unterschrift wert={ma} onChange={setMa} hoehe={130} />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs text-white/50">Unterschrift Einsatzbetrieb (Vorarbeiter / Polier)</div>
        <Unterschrift wert={fi} onChange={setFi} hoehe={150} />
        <input className="eingabe" placeholder="Name des Unterzeichners" value={fiName} onChange={(e) => setFiName(e.target.value)} />
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
          <button onClick={los} disabled={laeuft || (!wunsch.mail && !wunsch.onedrive)}
            className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {laeuft ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Bestätigen & senden
          </button>
        </>
      ) : (
        <button onClick={async () => {
          const r = await teileDatei(datei.blob, datei.name).catch(() => 'fehler')
          if (r === 'geteilt' || r === 'heruntergeladen') await abschliessen({ g, wKey, unterschriften, wunsch, mehrere })
        }} className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2">
          <Share2 className="w-5 h-5" /> Unterschreiben & teilen
        </button>
      )}

      {s?.gesendetAm && <div className="text-sm text-lime flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> Gesendet an {s.gesendetAn || 'Büro'}</div>}
      {s?.gespeichertAm && <div className="text-sm text-lime flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> In OneDrive gespeichert{s.onedrivePfad ? `: ${s.onedrivePfad}` : ''}</div>}
      {s?.versandOffen && <div className="text-sm text-amber-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Kein Netz — wird automatisch nachgesendet.</div>}
      {s?.fehler && !s?.versandOffen && <div className="text-sm text-ember flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {s.fehler}</div>}
    </section>
  )
}
