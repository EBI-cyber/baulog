import { NavLink } from 'react-router-dom'
import { useRole } from '../lib/role'

const items = [
  { to: '/', label: 'Projekte', icon: '🏗️', end: true },
  { to: '/auswertung', label: 'Auswertung', icon: '📊', ownerOnly: true },
  { to: '/einstellungen', label: 'Einstellungen', icon: '⚙️' },
]

export default function Nav() {
  const role = useRole()
  const visible = items.filter((it) => !(it.ownerOnly && role === 'worker'))
  const cols = visible.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <nav className={'glass m-4 rounded-3xl ' + cols + ' grid text-center text-[11px] py-3 sticky bottom-0'}>
      {visible.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'text-white' : 'text-white/45')}>
          <div className="text-lg">{it.icon}</div>
          <div className="mt-0.5">{it.label}</div>
        </NavLink>
      ))}
    </nav>
  )
}
