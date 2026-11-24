import { NavLink, useLocation } from 'react-router-dom'
import { Clock, CalendarDays, Settings, Timer, Banknote, BarChart3, Archive } from 'lucide-react'

const LINKS = [
  { to: '/', label: 'Heute', icon: Clock, end: true },
  { to: '/kalender', label: 'Kalender', icon: CalendarDays, auch: ['/woche'] },
  { to: '/statistik', label: 'Statistik', icon: BarChart3 },
  { to: '/lohn', label: 'Lohn', icon: Banknote },
  { to: '/archiv', label: 'Archiv', icon: Archive, auch: ['/rapporte', '/abrechnungen'] },
  { to: '/einstellungen', label: 'Einstellungen', kurz: 'Optionen', icon: Settings },
]

export default function Nav() {
  const { pathname } = useLocation()
  // Wochenansicht gehört zum Kalender
  const aktiv = (l, isActive) => isActive || (l.auch || []).some((a) => pathname.startsWith(a))
  return (
    <>
      <aside className="hidden md:flex flex-col w-60 shrink-0 sticky top-0 h-[100dvh] p-5 gap-1 border-r border-white/5">
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="w-10 h-10 rounded-xl btn-grad shadow-glow flex items-center justify-center"><Timer className="w-5 h-5" strokeWidth={2.2} /></div>
          <div className="font-extrabold text-lg tracking-tight">Rapport</div>
        </div>
        {LINKS.map((l) => { const { to, label, icon: I, end } = l; return (
          <NavLink key={to} to={to} end={end} className={({ isActive }) =>
            'flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium ' + (aktiv(l, isActive) ? 'bg-white/10 text-white' : 'text-white/65 hover:text-white/80')}>
            <I className="w-5 h-5" strokeWidth={1.9} /> {label}
          </NavLink>
        ) })}
      </aside>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 glass border-x-0 border-b-0 rounded-none pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="max-w-md mx-auto grid grid-cols-6">
          {LINKS.map((l) => { const { to, label, kurz, icon: I, end } = l; return (
            <NavLink key={to} to={to} end={end} className={({ isActive }) =>
              'flex flex-col items-center gap-1 text-[11.5px] font-medium py-1 min-w-0 ' + (aktiv(l, isActive) ? 'text-white' : 'text-white/65')}>
              <I className="w-6 h-6" strokeWidth={1.9} /> <span className="truncate max-w-full">{kurz || label}</span>
            </NavLink>
          ) })}
        </div>
      </nav>
    </>
  )
}
