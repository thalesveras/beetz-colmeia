import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { groupHasActive, isItemActive, navGroupsFor, HOME_LINK, INFO_LINK } from '../../lib/navigation'
import type { NavGroup, NavItem } from '../../lib/navigation'
import Avatar from '../ui/Avatar'
import BrandLogo from '../ui/BrandLogo'

export default function Sidebar() {
  const { profile, email, signOut, accessRole } = useAuth()
  const location = useLocation()

  // Quem monta a lista e aplica as permissões é lib/navigation.ts — aqui só desenha.
  const groups = navGroupsFor(accessRole)

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 h-screen sticky top-0 bg-beetz-dark text-white p-5">
      <div className="mb-8 px-1">
        <BrandLogo size="sm" withName />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto -mr-2 pr-2">
        <TopLevelLink item={HOME_LINK} />

        <div className="pt-2 mt-1 space-y-0.5">
          {groups.map((group) => (
            <NavGroupBlock key={group.key} group={group} currentPath={location.pathname} />
          ))}
        </div>

        <div className="pt-2 mt-1 border-t border-white/10">
          <TopLevelLink item={INFO_LINK} />
        </div>
      </nav>

      <div className="border-t border-white/10 pt-4 mt-4">
        {/* O cartão do usuário é a porta pro próprio perfil — mesmo destino
            que clicar em alguém na Turma. Sem perfil carregado, vira estático. */}
        {profile ? (
          <Link
            to={`/perfil/${profile.id}`}
            className="flex items-center gap-2 mb-3 px-1 py-1 rounded-xl hover:bg-white/10 transition-colors"
            title="Ver meu perfil"
          >
            <Avatar src={profile.avatar_url} name={`${profile.first_name} ${profile.last_name}`} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{profile.first_name} {profile.last_name}</p>
              <p className="text-[11px] text-white/50 truncate">{email}</p>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-2 mb-3 px-1">
            <Avatar src={null} name={email || 'Abelha'} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">Abelha</p>
              <p className="text-[11px] text-white/50 truncate">{email}</p>
            </div>
          </div>
        )}
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

function NavGroupBlock({ group, currentPath }: { group: NavGroup; currentPath: string }) {
  const containsActive = groupHasActive(group, currentPath)
  const [open, setOpen] = useState(containsActive)
  const GroupIcon = group.icon

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/10 ${
          containsActive ? 'text-beetz-yellow' : 'text-white/80'
        }`}
      >
        <GroupIcon size={18} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown size={15} className={`transition-transform text-white/40 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-0.5 mb-1 ml-[26px] pl-3 border-l border-white/10 space-y-0.5">
          {group.items.map((item) => {
            const Icon = item.icon
            // O item ativo é decidido no navigation.ts (prefixo mais específico
            // vence), não pelo `end` do NavLink — /financeiro e
            // /financeiro/despesas se atrapalhavam.
            const active = isItemActive(item, currentPath, group.items)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? 'bg-beetz-yellow text-beetz-dark' : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}
