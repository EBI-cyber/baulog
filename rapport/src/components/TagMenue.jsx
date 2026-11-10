import { Clock, CalendarOff, Wallet } from 'lucide-react'
import Sheet from './Sheet'
import IconChip from '../ui/IconChip'
import { TAGE_LANG, datumLang } from '../lib/zeit'

/** Auswahl: was für diesen Tag eintragen? */
export default function TagMenue({ datum, onWahl, onClose }) {
  const d = new Date(datum + 'T12:00')
  const punkte = [
    ['zeit', Clock, 'Arbeitszeit nachtragen', 'Beginn, Ende, Pause'],
    ['absenz', CalendarOff, 'Abwesenheit', 'Ferien, krank, Feiertag, Unfall …'],
    ['spesen', Wallet, 'Spesen', 'Verpflegung, Fahrt, Übernachtung'],
  ]
  return (
    <Sheet titel={`${TAGE_LANG[d.getDay()]}, ${datumLang(d)}`} onClose={onClose}>
      {punkte.map(([id, I, t, u]) => (
        <button key={id} onClick={() => onWahl(id)} className="w-full glass rounded-2xl p-3 flex items-center gap-3 text-left card-hover">
          <IconChip icon={I} />
          <div><div className="font-semibold">{t}</div><div className="text-sm text-white/45">{u}</div></div>
        </button>
      ))}
    </Sheet>
  )
}
