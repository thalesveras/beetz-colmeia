import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home, Users, CalendarDays, Package, ShieldCheck, Wallet, MoreHorizontal, ClipboardList, X, LogOut,
  LayoutGrid, List
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { groupHasActive, isItemActive, navGroupsFor, INFO_LINK } from '../../lib/navigation'
import type { NavItem } from '../../lib/navigation'
import type { AccessRole } from '../../lib/permissions'

// A barra do celular só cabe 5 alvos de toque de forma confortável — antes
// eram até 10 itens espremidos com fonte de 9px e rolagem lateral. Agora são
// 4 fixos + "Mais", e os 4 fixos mudam conforme o cargo: quem é da diretoria
// vive no Financeiro, quem é do bar vive no Estoque, e a turma vive na Escala.
//
// Estes 4 NÃO são alfabéticos de propósito: é atalho por frequência de uso, não
// índice. O alfabético vale pra folha do "Mais", que é onde se procura algo.
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

export default function MobileNav() {
  const { accessRole, signOut } = useAuth()
  const location = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)

  // Lista ou grade de ícones — gosto pessoal, então fica lembrado no aparelho.
  // (Sem lazy initializer no useState de propósito: o shim de checagem não o entende.)
  const [menuView, setMenuViewState] = useState<'lista' | 'icones'>(
    localStorage.getItem('colmeia:menu-view') === 'icones' ? 'icones' : 'lista'
  )
  function setMenuView(v: 'lista' | 'icones') {
    setMenuViewState(v)
    try { localStorage.setItem('colmeia:menu-view', v) } catch { /* modo privado antigo: só não lembra */ }
  }

  const primary = primaryLinksFor(accessRole)

  // Mesma lista e mesmas permissões do desktop; aqui só tira o que já está fixo
  // na barra pra não aparecer duas vezes, e acrescenta Informações no fim.
  const taken = new Set(primary.map((p) => p.to))
  const groups = navGroupsFor(accessRole)
    .map((g) => ({ ...g, items: g.items.filter((i) => !taken.has(i.to)) }))
    .filter((g) => g.items.length > 0)
    .concat([{ key: 'sobre', label: 'Sobre', icon: INFO_LINK.icon, items: [INFO_LINK] }])

  // Trocar de tela fecha a folha — senão ela fica aberta por cima do destino.
  useEffect(() => { setSheetOpen(false) }, [location.pathname])

  const sheetHasActive = groups.some((g) => groupHasActive(g, location.pathname))

  return (
    <>
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setSheetOpen(false)} />
      )}

      {sheetOpen && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[75vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <div className="sticky top-0 bg-white flex items-center justify-between px-5 pt-5 pb-3 border-b border-beetz-dark/5">
            <p className="font-extrabold">Menu</p>
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5 bg-beetz-gray rounded-lg p-0.5">
                <button
                  onClick={() => setMenuView('lista')}
                  className={`p-1.5 rounded-md ${menuView === 'lista' ? 'bg-beetz-yellow text-beetz-dark' : 'text-beetz-dark/40'}`}
                  aria-label="Ver como lista"
                >
                  <List size={15} />
                </button>
                <button
                  onClick={() => setMenuView('icones')}
                  className={`p-1.5 rounded-md ${menuView === 'icones' ? 'bg-beetz-yellow text-beetz-dark' : 'text-beetz-dark/40'}`}
                  aria-label="Ver como ícones"
                >
                  <LayoutGrid size={15} />
                </button>
              </div>
              <button onClick={() => setSheetOpen(false)} className="p-1.5 rounded-lg hover:bg-beetz-gray" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-5">
            {groups.map((group) => (
              <div key={group.key}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-beetz-dark/35 px-2 mb-1.5">{group.label}</p>
                <div className={menuView === 'icones' ? 'grid grid-cols-3 gap-2' : 'space-y-0.5'}>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const active = isItemActive(item, location.pathname, group.items)
                    // Grade: cartão quadrado com ícone grande e rótulo embaixo —
                    // mesmo destaque de ativo (amarelo) da lista.
                    return menuView === 'icones' ? (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={`flex flex-col items-center justify-center text-center gap-1.5 px-2 py-3 min-h-[76px] rounded-2xl text-[11px] font-semibold leading-tight ${
                          active ? 'bg-beetz-yellow text-beetz-dark' : 'bg-beetz-gray/70 text-beetz-dark/75 active:bg-beetz-gray'
                        }`}
                      >
                        <Icon size={20} className="shrink-0" />
                        {item.label}
                      </NavLink>
                    ) : (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                          active ? 'bg-beetz-yellow text-beetz-dark' : 'text-beetz-dark/75 hover:bg-beetz-gray'
                        }`}
                      >
                        <Icon size={17} className="shrink-0" />
                        {item.label}
                      </NavLink>
                    )
                  })}
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

      {/* pb com env(): no iPhone instalado, o traço de fechar (home indicator)
          passa por cima da barra — sem esse respiro os botões ficam embaixo dele. */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-beetz-dark border-t border-white/10 flex justify-around pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-40">
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
