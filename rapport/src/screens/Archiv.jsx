import { useSearchParams } from 'react-router-dom'
import { FileText, Receipt } from 'lucide-react'
import Rapporte from './Rapporte'
import Abrechnungen from './Abrechnungen'

const TABS = [['rapporte', 'Rapporte', FileText], ['lohn', 'Lohnabrechnungen', Receipt]]

/** Archiv: unterschriebene Rapporte und Lohnabrechnungen (Originale) + Jahresabschluss */
export default function Archiv() {
  const [q, setQ] = useSearchParams()
  const gemerkt = (() => { try { return localStorage.getItem('archivTab') } catch { return null } })()
  const tab = q.get('t') || gemerkt || 'rapporte'
  const waehle = (t) => { try { localStorage.setItem('archivTab', t) } catch { /* egal */ } setQ({ t }, { replace: true }) }
  return (
    <div className="space-y-4">
      <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">Archiv</h1>
      <div className="grid grid-cols-2 gap-2">
        {TABS.map(([k, l, I]) => (
          <button key={k} onClick={() => waehle(k)}
            className={'rounded-2xl py-3 px-2 text-sm border min-w-0 inline-flex items-center justify-center gap-2 ' + (tab === k ? 'btn-grad border-transparent font-bold' : 'border-white/15 text-white/70')}>
            <I className="w-4 h-4 shrink-0" /> <span className="truncate">{l}</span>
          </button>
        ))}
      </div>
      {tab === 'lohn' ? <Abrechnungen eingebettet /> : <Rapporte eingebettet />}
    </div>
  )
}
