import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home, Users, UserCircle, Hexagon, CalendarDays, Trophy, Info, LogOut, Package,
  ShieldCheck, Settings, ChevronDown, Wallet, Cake, Truck, HandCoins, Receipt, ClipboardList
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  canApproveUsers, canManageUsers, canViewFinancialSummary, canViewHiveMap, canViewRanking,
  canViewStockTab, canViewTeamDirectory
} from '../../lib/permissions'
import Avatar from '../ui/Avatar'

interface NavItem {
  to: string
  label: string
  icon: any
}

interface NavGroupDef {
  key: string
  label: string
  icon: any
  items: NavItem[]
}

export default function Sidebar() {
  const { profile, email, signOut, accessRole } = useAuth()
  const location = useLocation()

  const topLink: NavItem = { to: '/dashboard', label: 'Início', icon: Home }
  const bottomLink: NavItem = { to: '/informacoes', label: 'Informações', icon: Info }

  const groups: NavGroupDef[] = [
    {
      key: 'comunidade',
      label: 'Comunidade',
      icon: Users,
      items: [
        ...(canViewTeamDirectory(accessRole) ? [{ to: '/turma', label: 'Conhecer a turma', icon: Users }] : []),
        { to: '/perfil/me', label: 'Meu perfil', icon: UserCircle },
        ...(canViewHiveMap(accessRole) ? [{ to: '/mapa', label: 'Mapa da colmeia', icon: Hexagon }] : []),
        { to: '/aniversariantes', label: 'Aniversariantes do mês', icon: Cake },
        ...(canViewRanking(accessRole) ? [{ to: '/ranking', label: 'Ranking', icon: Trophy }] : [])
      ]
    },
    {
      key: 'eventos',
      label: 'Eventos',
      icon: CalendarDays,
      items: [
        { to: '/eventos', label: 'Eventos', icon: CalendarDays },
        ...(canViewStockTab(accessRole) ? [{ to: '/estoque', label: 'Estoque', icon: Package }] : [])
      ]
    },
    ...(canViewFinancialSummary(accessRole)
      ? [{
          key: 'financeiro',
          label: 'Financeiro',
          icon: Wallet,
          items: [
            { to: '/financeiro', label: 'Despesas', icon: Wallet },
            { to: '/financeiro/fornecedores', label: 'Fornecedores', icon: Truck },
            { to: '/financeiro/repasses', label: 'Repasses', icon: HandCoins },
            { to: '/financeiro/recebimentos', label: 'Recebimentos', icon: Receipt },
            { to: '/financeiro/fechamentos', label: 'Todos os fechamentos', icon: ClipboardList }
          ]
        }]
      : []),
    ...(canManageUsers(accessRole) || canApproveUsers(accessRole)
      ? [{
          key: 'gestao',
          label: 'Gestão',
          icon: ShieldCheck,
          items: [
            { to: '/admin', label: 'Administração', icon: ShieldCheck },
            ...(canManageUsers(accessRole) ? [{ to: '/configuracoes', label: 'Configurações', icon: Settings }] : [])
          ]
        }]
      : [])
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

      <nav className="flex-1 space-y-1 overflow-y-auto">
        <TopLevelLink item={topLink} />

        <div className="pt-2 mt-1 space-y-1">
          {groups.map((group) => (
            <NavGroup key={group.key} group={group} currentPath={location.pathname} />
          ))}
        </div>

        <div className="pt-2 mt-1 border-t border-white/10">
          <TopLevelLink item={bottomLink} />
        </div>
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

function TopLevelLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          isActive ? 'bg-beetz-yellow text-beetz-dark' : 'text-white/80 hover:bg-white/10'
        }`
      }
    >
      <Icon size={18} />
      {item.label}
    </NavLink>
  )
}

function NavGroup({ group, currentPath }: { group: NavGroupDef; currentPath: string }) {
  const containsActive = group.items.some((item) => currentPath.startsWith(item.to))
  const [open, setOpen] = useState(containsActive)
  const GroupIcon = group.icon

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          containsActive && !open ? 'text-beetz-yellow' : 'text-white/80'
        } hover:bg-white/10`}
      >
        <GroupIcon size={18} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown size={15} className={`transition-transform text-white/50 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1 ml-4 pl-3 border-l border-white/10 space-y-1">
          {group.items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-beetz-yellow text-beetz-dark' : 'text-white/70 hover:bg-white/10'
                  }`
                }
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}
