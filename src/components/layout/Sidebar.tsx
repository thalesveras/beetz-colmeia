import { NavLink } from 'react-router-dom'
import { Home, Users, UserCircle, Hexagon, CalendarDays, Trophy, Info, LogOut, Package, ShieldCheck, Settings } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canManageUsers, canViewStockTab } from '../../lib/permissions'
import Avatar from '../ui/Avatar'

const baseLinks = [
  { to: '/dashboard', label: 'Início', icon: Home },
  { to: '/turma', label: 'Conhecer a turma', icon: Users },
  { to: '/perfil/me', label: 'Meu perfil', icon: UserCircle },
  { to: '/mapa', label: 'Mapa da colmeia', icon: Hexagon },
  { to: '/eventos', label: 'Eventos', icon: CalendarDays }
]

const endLinks = [
  { to: '/ranking', label: 'Ranking', icon: Trophy },
  { to: '/informacoes', label: 'Informações', icon: Info }
]

export default function Sidebar() {
  const { profile, email, signOut, accessRole } = useAuth()

  const links = [
    ...baseLinks,
    ...(canViewStockTab(accessRole) ? [{ to: '/estoque', label: 'Estoque', icon: Package }] : []),
    ...endLinks,
    ...(canManageUsers(accessRole) ? [{ to: '/admin', label: 'Administração', icon: ShieldCheck }] : []),
    ...(canManageUsers(accessRole) ? [{ to: '/configuracoes', label: 'Configurações', icon: Settings }] : [])
  ]

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 h-screen sticky top-0 bg-beetz-dark text-white p-5">
      <div className="flex items-center gap-2 mb-8 px-1">
        <div className="w-9 h-9 rounded-lg honey-gradient flex items-center justify-center text-lg">🐝</div>
        <div>
          <p className="font-extrabold leading-none">Beetz</p>
          <p className="text-[11px] text-beetz-yellow/80 leading-none mt-0.5">Colmeia</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? 'bg-beetz-yellow text-beetz-dark' : 'text-white/80 hover:bg-white/10'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 pt-4 mt-4">
        <div className="flex items-center gap-2 mb-3 px-1">
          <Avatar src={profile?.avatar_url} name={profile ? `${profile.first_name} ${profile.last_name}` : email || 'Abelha'} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{profile ? `${profile.first_name} ${profile.last_name}` : 'Abelha'}</p>
            <p className="text-[11px] text-white/50 truncate">{email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-2 text-sm text-white/70 hover:text-beetz-yellow px-3 py-2 w-full rounded-xl hover:bg-white/10 transition-colors"
        >
          <LogOut size={16} /> Sair
        </button>
      </div>
    </aside>
  )
}
