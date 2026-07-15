import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home, Users, UserCircle, Hexagon, CalendarDays, Trophy, Package, ShieldCheck, Settings, Wallet,
  MoreHorizontal, ClipboardList, Cake, Truck, HandCoins, Receipt, Info, X, LogOut
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  canApproveUsers, canManageUsers, canViewFinancialSummary, canViewHiveMap, canViewRanking,
  canViewStockTab, canViewTeamDirectory
} from '../../lib/permissions'
import type { AccessRole } from '../../lib/permissions'

interface NavItem {
  to: string
  label: string
  icon: any
}

// A barra do celular só cabe 5 alvos de toque de forma confortável — antes
// eram até 10 itens espremidos com fonte de 9px e rolagem lateral. Agora são
// 4 fixos + "Mais", e os 4 fixos mudam conforme o cargo: quem é da diretoria
// vive no Financeiro, quem é do bar vive no Estoque, e a turma vive na Escala.
function primaryLinksFor(role: AccessRole): NavItem[] {
  switch (role) {
    case 'diretoria':
      return [
        { to: '/dashboard', label: 'Início', icon: Home },
        { to: '/eventos', label: 'Eventos', icon: CalendarDays },
        { to: '/financeiro', label: 'Financeiro', icon: Wallet },
        { to: '/admin', label: 'Admin', icon: ShieldCheck }
      ]
    case 'operacional':
      return [
        { to: '/dashboard', label: 'Início', icon: Home },
        { to: '/eventos', label: 'Eventos', icon: CalendarDays },
        { to: '/estoque', label: 'Estoque', icon: Package },
        { to: '/escala', label: 'Escala', icon: ClipboardList }
      ]
    // Garçom e caixa trabalham por evento: escala é a tela do dia a dia deles.
    case 'garcom':
    case 'caixa':
    default:
      return [
        { to: '/dashboard', label: 'Início', icon: Home },
        { to: '/eventos', label: 'Eventos', icon: CalendarDays },
        { to: '/escala', label: 'Escala', icon: ClipboardList },
        { to: '/turma', label: 'Turma', icon: Users }
      ]
  }
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// Tudo o que não está fixo na barra vive aqui dentro, agrupado igual ao menu
// do desktop pra não ter duas lógicas de navegação diferentes na cabeça.
function groupsFor(role: AccessRole, primary: NavItem[]): NavGroup[] {
  const taken = new Set(primary.map((p) => p.to))
  const groups: NavGroup[] = [
    {
      label: 'Comunidade',
      items: [
        ...(canViewTeamDirectory(role) ? [{ to: '/turma', label: 'Conhecer a turma', icon: Users }] : []),
        { to: '/perfil/me', label: 'Meu perfil', icon: UserCircle },
        ...(canViewHiveMap(role) ? [{ to: '/mapa', label: 'Mapa da colmeia', icon: Hexagon }] : []),
        { to: '/aniversariantes', label: 'Aniversariantes', icon: Cake },
        ...(canViewRanking(role) ? [{ to: '/ranking', label: 'Ranking', icon: Trophy }] : [])
      ]
    },
    {
      label: 'Eventos',
      items: [
        { to: '/eventos', label: 'Eventos', icon: CalendarDays },
        { to: '/escala', label: 'Escala', icon: ClipboardList },
        ...(canViewStockTab(role) ? [{ to: '/estoque', label: 'Estoque', icon: Package }] : [])
      ]
    },
    ...(canViewFinancialSummary(role)
      ? [{
          label: 'Financeiro',
          items: [
            { to: '/financeiro', label: 'Despesas', icon: Wallet },
            { to: '/financeiro/fornecedores', label: 'Fornecedores', icon: Truck },
            { to: '/financeiro/repasses', label: 'Repasses', icon: HandCoins },
            { to: '/financeiro/recebimentos', label: 'Recebimentos', icon: Receipt },
            { to: '/financeiro/fechamentos', label: 'Fechamentos', icon: ClipboardList }
          ]
        }]
      : []),
    ...(canManageUsers(role) || canApproveUsers(role)
      ? [{
          label: 'Gestão',
          items: [
            { to: '/admin', label: 'Administração', icon: ShieldCheck },
            ...(canManageUsers(role) ? [{ to: '/configuracoes', label: 'Configurações', icon: Settings }] : [])
          ]
        }]
      : []),
    { label: 'Sobre', items: [{ to: '/informacoes', label: 'Informações', icon: Info }] }
  ]

  // Não repete no "Mais" o que já está fixo na barra.
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !taken.has(i.to)) }))
    .filter((g) => g.items.length > 0)
}

export default function MobileNav() {
  const { accessRole, signOut } = useAuth()
  const location = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)

  const primary = primaryLinksFor(accessRole)
  const groups = groupsFor(accessRole, primary)

  // Trocar de tela fecha a folha — senão ela fica aberta por cima do destino.
  useEffect(() => { setSheetOpen(false) }, [location.pathname])

  const sheetHasActive = groups.some((g) => g.items.some((i) => location.pathname.startsWith(i.to)))

  return (
    <>
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setSheetOpen(false)} />
      )}

      {sheetOpen && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[75vh] overflow-y-auto">
          <div className="sticky top-0 bg-white flex items-center justify-between px-5 pt-5 pb-3 border-b border-beetz-dark/5">
            <p className="font-extrabold">Menu</p>
            <button onClick={() => setSheetOpen(false)} className="p-1.5 rounded-lg hover:bg-beetz-gray" aria-label="Fechar">
              <X size={18} />
            </button>
          </div>

          <div className="p-4 space-y-5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-beetz-dark/35 px-2 mb-1.5">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                          isActive ? 'bg-beetz-yellow text-beetz-dark' : 'text-beetz-dark/75 hover:bg-beetz-gray'
                        }`
                      }
                    >
                      <Icon size={17} />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={() => signOut()}
              className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium text-beetz-dark/60 hover:bg-beetz-gray border-t border-beetz-dark/5 mt-2 pt-4"
            >
              <LogOut size={17} /> Sair
            </button>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-beetz-dark border-t border-white/10 flex justify-around py-2 z-40">
        {primary.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium flex-1 ${
                isActive ? 'text-beetz-yellow' : 'text-white/60'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}

        <button
          onClick={() => setSheetOpen(true)}
          className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium flex-1 ${
            sheetOpen || sheetHasActive ? 'text-beetz-yellow' : 'text-white/60'
          }`}
        >
          <MoreHorizontal size={20} />
          Mais
        </button>
      </nav>
    </>
  )
}
