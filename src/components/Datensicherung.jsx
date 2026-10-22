import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Download, Upload, RotateCcw } from 'lucide-react'
import IconChip from '../ui/IconChip'
import { stand, dateiname, zaehlen, pruefen, sicherungAnlegen, listeSicherungen, sicherungLesen, zurueckspielen } from '../lib/backup'
import { syncAll } from '../lib/cloud'
import { shareFile } from '../lib/share'

const zeit = (iso) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const inhalt = (a) => a.projekte + ' Projekte · ' + a.eintraege + ' Einträge · ' + a.rechnungen + ' Abschläge'

export default function Datensicherung() {
  const [liste, setListe] = useState([])
  const [busy, setBusy] = useState('')
  const datei = useRef(null)
  const laden = async () => setListe(await listeSicherungen())
  useEffect(() => { laden() }, [])

  const herunterladen = async () => {
    setBusy('datei')
    try {
      await syncAll().catch(() => {}) // vorher den neuesten Cloud-Stand holen
      const d = await stand()
      await sicherungAnlegen('Sicherung als Datei')
      await shareFile(new Blob([JSON.stringify(d)], { type: 'application/json' }), dateiname(d))
      await laden()
    } catch (e) { alert('Sicherung fehlgeschlagen: ' + (e && e.message ? e.message : e)) }
    setBusy('')
  }

  const zurueck = async (d, woher) => {
    const a = zaehlen(d)
    if (!confirm('Stand vom ' + zeit(d.createdAt) + ' zurückspielen?\n\n' + inhalt(a) + ' (' + woher + ')\n\nDiese Datensätze ersetzen den aktuellen Stand, auch in der Cloud. Neuere Einträge bleiben erhalten. Der aktuelle Stand wird vorher automatisch gesichert.')) return
    setBusy('zurueck')
    try { await zurueckspielen(d); await syncAll().catch(() => {}); await laden(); alert('Stand wurde zurückgespielt.') }
    catch (e) { alert('Zurückspielen fehlgeschlagen: ' + (e && e.message ? e.message : e)) }
    setBusy('')
  }

  const ausDatei = async (ev) => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = ''
    if (!f) return
    try { await zurueck(pruefen(JSON.parse(await f.text())), 'aus Datei') } catch (e) { alert(e && e.message ? e.message : 'Datei nicht lesbar.') }
  }

  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <IconChip icon={ShieldCheck} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
        <div>
          <div className="font-semibold">Datensicherung</div>
          <div className="text-white/35 text-xs">Alles inkl. Fotos und Zahlungen · automatisch täglich und vor jedem Löschen</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={herunterladen} disabled={!!busy} className="rounded-2xl py-2.5 font-semibold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50">
          <Download className="w-4 h-4" />{busy === 'datei' ? 'Sichere …' : 'Als Datei sichern'}
        </button>
        <button onClick={() => datei.current && datei.current.click()} disabled={!!busy} className="rounded-2xl py-2.5 font-semibold bg-white/10 inline-flex items-center justify-center gap-2 disabled:opacity-50">
          <Upload className="w-4 h-4" /> Aus Datei zurückspielen
        </button>
        <input ref={datei} type="file" accept="application/json,.json" className="hidden" onChange={ausDatei} />
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="text-white/45 text-xs">Sicherungen in diesem Gerät</div>
        {liste.length === 0 && <div className="text-white/30 text-xs">Noch keine — die erste entsteht automatisch.</div>}
        {liste.map((x) => (
          <div key={x.id} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm">{zeit(x.createdAt)} · {x.grund}</div>
              <div className="text-white/35 text-[11px]">{inhalt(x.anzahl)}</div>
            </div>
            <button onClick={async () => zurueck(await sicherungLesen(x.id), 'Sicherung im Gerät')} disabled={!!busy} title="Diesen Stand zurückspielen" className="text-amber p-1.5 shrink-0"><RotateCcw className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
