import { NavLink } from 'react-router-dom'
import { Home, Users, UserCircle, Hexagon, CalendarDays, Trophy, Package, ShieldCheck, Settings } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canManageUsers, canViewStockTab } from '../../lib/permissions'

const baseLinks = [
  { to: '/dashboard', label: 'Início', icon: Home },
  { to: '/turma', label: 'Turma', icon: Users },
  { to: '/mapa', label: 'Mapa', icon: Hexagon },
  { to: '/eventos', label: 'Eventos', icon: CalendarDays }
]

const endLinks = [
  { to: '/ranking', label: 'Ranking', icon: Trophy },
  { to: '/perfil/me', label: 'Perfil', icon: UserCircle }
]

export default function MobileNav() {
  const { accessRole } = useAuth()

  const links = [
    ...baseLinks,
    ...(canViewStockTab(accessRole) ? [{ to: '/estoque', label: 'Estoque', icon: Package }] : []),
    ...endLinks,
    ...(canManageUsers(accessRole) ? [{ to: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
    ...(canManageUsers(accessRole) ? [{ to: '/configuracoes', label: 'Config', icon: Settings }] : [])
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-beetz-dark border-t border-white/10 flex justify-around py-2 z-40 overflow-x-auto">
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg text-[9px] font-medium shrink-0 ${
              isActive ? 'text-beetz-yellow' : 'text-white/60'
            }`
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
