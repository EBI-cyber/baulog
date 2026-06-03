import { NavLink } from 'react-router-dom'
import { useRole } from '../lib/role'
import { LayoutGrid, BarChart3, Settings, HardHat } from 'lucide-react'

const items = [
  { to: '/', label: 'Projekte', Icon: LayoutGrid, end: true },
  { to: '/auswertung', label: 'Auswertung', Icon: BarChart3, ownerOnly: true },
  { to: '/einstellungen', label: 'Einstellungen', Icon: Settings },
]

export default function Nav() {
  const role = useRole()
  const visible = items.filter((it) => !(it.ownerOnly && role === 'worker'))

  return (
    <>
      {/* Desktop: Sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 sticky top-0 h-[100dvh] border-r border-white/10 px-4 py-7 gap-1.5">
        <div className="flex items-center gap-2.5 px-2 mb-7">
          <div className="w-10 h-10 rounded-2xl btn-grad shadow-glow flex items-center justify-center">
            <HardHat className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <span className="text-2xl font-extrabold grad-text tracking-tight">BauLog</span>
        </div>
        {visible.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => 'flex items-center gap-3 px-3.5 py-3 rounded-2xl font-medium transition ' +
              (isActive ? 'bg-white/10 text-white border border-white/10' : 'text-white/45 hover:text-white hover:bg-white/5 border border-transparent')}>
            <Icon className="w-5 h-5" strokeWidth={1.85} />{label}
          </NavLink>
        ))}
        <div className="mt-auto px-3 text-white/25 text-xs">Bautagebuch · Stunden · Kalkulation</div>
      </aside>

      {/* Mobile: Bottom-Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 px-4 pb-4 pointer-events-none">
        <div className="glass rounded-3xl grid text-center text-[11px] py-2.5 max-w-md mx-auto pointer-events-auto"
          style={{ gridTemplateColumns: 'repeat(' + visible.length + ',minmax(0,1fr))' }}>
          {visible.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => 'flex flex-col items-center gap-1 py-1 ' + (isActive ? 'text-amber' : 'text-white/45')}>
              <Icon className="w-[22px] h-[22px]" strokeWidth={1.85} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
