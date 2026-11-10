import { NavLink } from 'react-router-dom'
import { Clock, CalendarDays, Settings, Timer } from 'lucide-react'

const LINKS = [
  { to: '/', label: 'Heute', icon: Clock, end: true },
  { to: '/woche', label: 'Woche', icon: CalendarDays },
  { to: '/einstellungen', label: 'Einstellungen', icon: Settings },
]

export default function Nav() {
  return (
    <>
      <aside className="hidden md:flex flex-col w-60 shrink-0 sticky top-0 h-[100dvh] p-5 gap-1 border-r border-white/5">
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="w-10 h-10 rounded-xl btn-grad shadow-glow flex items-center justify-center"><Timer className="w-5 h-5" strokeWidth={2.2} /></div>
          <div className="font-extrabold text-lg tracking-tight">Rapport</div>
        </div>
        {LINKS.map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) =>
            'flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium ' + (isActive ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80')}>
            <I className="w-5 h-5" strokeWidth={1.9} /> {label}
          </NavLink>
        ))}
      </aside>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 glass border-x-0 border-b-0 rounded-none pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="max-w-md mx-auto grid grid-cols-3">
          {LINKS.map(({ to, label, icon: I, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) =>
              'flex flex-col items-center gap-1 text-[11px] font-medium py-1 ' + (isActive ? 'text-white' : 'text-white/45')}>
              <I className="w-6 h-6" strokeWidth={1.9} /> {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
