import { useEffect, useState } from 'react'
import { Cloud, CloudUpload, CloudOff, AlertTriangle, RefreshCw, X } from 'lucide-react'
import { getSyncStatus, onSyncStatus, syncAll } from '../lib/cloud'

// Kleine Anzeige oben rechts: Ist alles in der Cloud gesichert?
const LOOK = {
  ok: { Icon: Cloud, text: 'Gesichert', cls: 'text-emerald-300/80' },
  laeuft: { Icon: RefreshCw, text: 'Sync …', cls: 'text-white/60', spin: true },
  wartet: { Icon: CloudUpload, text: 'Wartet', cls: 'text-amber' },
  offline: { Icon: CloudOff, text: 'Offline', cls: 'text-white/50' },
  fehler: { Icon: AlertTriangle, text: 'Sync-Problem', cls: 'text-ember' },
}

export default function SyncBadge() {
  const [st, setSt] = useState(getSyncStatus())
  const [open, setOpen] = useState(false)
  useEffect(() => onSyncStatus(setSt), [])
  const look = LOOK[st.state]
  if (!look) return null
  const { Icon } = look
  const label = st.state === 'wartet' && st.pending ? st.pending + ' warten' : look.text

  return (
    <>
      <button onClick={() => (st.state === 'fehler' ? setOpen(true) : syncAll())}
        className={'fixed z-30 left-1/2 -translate-x-1/2 top-[max(0.5rem,env(safe-area-inset-top))] glass rounded-full px-3 py-1 text-xs font-medium inline-flex items-center gap-1.5 ' + look.cls}>
        <Icon className={'w-4 h-4' + (look.spin ? ' animate-spin' : '')} strokeWidth={1.9} />
        <span>{label}</span>
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-40" onClick={() => setOpen(false)}>
          <div className="glass rounded-3xl p-5 w-full max-w-md m-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-ember" /> Nicht alles ist in der Cloud</div>
              <button onClick={() => setOpen(false)} className="text-white/40 p-1"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-white/55 text-sm mb-3">
              {st.pending ? st.pending + ' Änderung(en) sind nur auf diesem Gerät gespeichert. ' : ''}
              Sie gehen nicht verloren und werden automatisch erneut gesendet.
            </p>
            <ul className="text-xs text-white/45 space-y-1 max-h-40 overflow-auto mb-4">
              {st.fehler.slice(0, 8).map((f) => <li key={f} className="bg-white/5 rounded-lg px-2 py-1 break-words">{f}</li>)}
            </ul>
            <button onClick={() => { setOpen(false); syncAll() }} className="btn-grad w-full rounded-2xl py-2.5 font-semibold inline-flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" /> Erneut versuchen
            </button>
          </div>
        </div>
      )}
    </>
  )
}
