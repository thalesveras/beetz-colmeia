import { NavLink } from 'react-router-dom'
import { Home, Users, UserCircle, Hexagon, CalendarDays, Trophy } from 'lucide-react'

const links = [
  { to: '/dashboard', label: 'Início', icon: Home },
  { to: '/turma', label: 'Turma', icon: Users },
  { to: '/mapa', label: 'Mapa', icon: Hexagon },
  { to: '/eventos', label: 'Eventos', icon: CalendarDays },
  { to: '/ranking', label: 'Ranking', icon: Trophy },
  { to: '/perfil/me', label: 'Perfil', icon: UserCircle }
]

export default function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-beetz-dark border-t border-white/10 flex justify-around py-2 z-40">
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium ${
              isActive ? 'text-beetz-yellow' : 'text-white/60'
            }`
          }
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
