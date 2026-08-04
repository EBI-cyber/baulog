import { useEffect, useState } from 'react'
import { AlarmClock, Bell, X } from 'lucide-react'
import { listProjekte, allEintraege } from '../lib/db'

const today = () => new Date().toISOString().slice(0, 10)
const dismissKey = () => 'baulog.reminder.dismissed.' + today()
const notifyKey = () => 'baulog.reminder.notified.' + today()

// Erinnert ab 16 Uhr, wenn für kein aktives Projekt heute Zeit erfasst wurde.
// Funktioniert nur solange die App/der Tab offen ist — ohne eigenen Push-Server
// gibt es keine echte Hintergrund-Benachrichtigung bei geschlossener App.
export default function DailyReminder() {
  const [show, setShow] = useState(false)
  const [canAsk, setCanAsk] = useState(typeof Notification !== 'undefined' && Notification.permission === 'default')

  useEffect(() => {
    async function check() {
      if (localStorage.getItem(dismissKey())) return
      if (new Date().getHours() < 16) return
      try {
        const projekte = (await listProjekte()).filter((p) => p.status === 'aktiv')
        if (!projekte.length) return
        const eintraege = await allEintraege()
        const t = today()
        const heuteErfasst = eintraege.some((e) => e.type === 'zeit' && String(e.createdAt || '').slice(0, 10) === t)
        if (heuteErfasst) return
        setShow(true)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && !localStorage.getItem(notifyKey())) {
          new Notification('BauLog', { body: 'Heute noch keine Zeit erfasst — nicht vergessen zu dokumentieren!' })
          localStorage.setItem(notifyKey(), '1')
        }
      } catch { /* offline/Dexie noch nicht bereit — beim nächsten Intervall erneut versuchen */ }
    }
    check()
    const iv = setInterval(check, 15 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

  if (!show) return null
  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-sm">
      <div className="glass rounded-2xl p-4 flex items-start gap-3 shadow-glow">
        <AlarmClock className="w-5 h-5 text-amber shrink-0 mt-0.5" strokeWidth={1.9} />
        <div className="flex-1 min-w-0 text-sm">
          <div className="font-semibold">Heute schon dokumentiert?</div>
          <div className="text-white/50 text-xs mt-0.5">Für keins deiner aktiven Projekte wurde heute Zeit erfasst.</div>
          {canAsk && (
            <button
              onClick={async () => { try { const p = await Notification.requestPermission(); setCanAsk(p === 'default') } catch {} }}
              className="mt-2 text-xs text-amber inline-flex items-center gap-1"
            >
              <Bell className="w-3.5 h-3.5" /> Erinnerungen aktivieren
            </button>
          )}
        </div>
        <button onClick={() => { localStorage.setItem(dismissKey(), '1'); setShow(false) }} className="text-white/30 hover:text-white/60 transition p-1 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
