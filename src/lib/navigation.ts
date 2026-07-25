import {
  BarChart3, Bell, Building2, Cake, CalendarDays, ClipboardList, HandCoins, Heart, Hexagon, Home, Info,
  Package, Receipt, ShieldCheck, Settings, Trophy, Truck, UserCircle, Users, Wallet
} from 'lucide-react'
import {
  canApproveUsers, canManageUsers, canViewBirthdays, canViewFinancialSummary, canViewHiveMap,
  canViewPraiseInsights, canViewRanking, canViewStockTab, canViewTeamDirectory, getRolePermissionsMap
} from './permissions'
import type { AccessRole } from './permissions'

export interface NavItem {
  to: string
  label: string
  icon: any
}

export interface NavGroup {
  key: string
  label: string
  icon: any
  items: NavItem[]
}

// Fonte única do menu. Antes Sidebar.tsx e MobileNav.tsx tinham cada um a sua
// cópia da lista — e já tinham divergido ("Aniversariantes do mês" no desktop,
// "Aniversariantes" no celular). Toda regra de permissão mora aqui: se um item
// não aparece, é porque o cargo não tem a flag, não porque alguém esqueceu de
// copiar a condição pro outro arquivo.
//
// Os rótulos são curtos de propósito: no menu de 256px, "Todos os fechamentos"
// e "Aniversariantes do mês" quebravam em duas linhas e desalinhavam os ícones.

export const HOME_LINK: NavItem = { to: '/dashboard', label: 'Início', icon: Home }
export const INFO_LINK: NavItem = { to: '/informacoes', label: 'Informações', icon: Info }

// pt-BR pra "Ãnimo" não cair depois de "Zebra": localeCompare entende acento,
// comparação com < não entende.
const byLabel = (a: NavItem, b: NavItem) => a.label.localeCompare(b.label, 'pt-BR')
const byGroupLabel = (a: NavGroup, b: NavGroup) => a.label.localeCompare(b.label, 'pt-BR')

export function navGroupsFor(role: AccessRole): NavGroup[] {
  const groups: NavGroup[] = [
    {
      key: 'comunidade',
      label: 'Comunidade',
      icon: Users,
      items: [
        ...(canViewBirthdays(role) ? [{ to: '/aniversariantes', label: 'Aniversariantes', icon: Cake }] : []),
        ...(canViewTeamDirectory(role) ? [{ to: '/turma', label: 'Conhecer a turma', icon: Users }] : []),
        ...(canViewHiveMap(role) ? [{ to: '/mapa', label: 'Mapa da colmeia', icon: Hexagon }] : []),
        { to: '/perfil/me', label: 'Meu perfil', icon: UserCircle },
        ...(canViewRanking(role) ? [{ to: '/ranking', label: 'Ranking', icon: Trophy }] : [])
      ]
    },
    {
      key: 'eventos',
      label: 'Eventos',
      icon: CalendarDays,
      items: [
        { to: '/escala', label: 'Escala', icon: ClipboardList },
        ...(canViewStockTab(role) ? [{ to: '/estoque', label: 'Estoque', icon: Package }] : []),
        { to: '/eventos', label: 'Eventos', icon: CalendarDays },
        // Produtoras carrega faturamento, repasses e notas internas da Diretoria:
        // enquanto não existe flag própria, anda junto do resumo financeiro —
        // que é a mesma informação sensível. As páginas também barram por dentro.
        ...(canViewFinancialSummary(role) ? [{ to: '/produtoras', label: 'Produtoras', icon: Building2 }] : [])
      ]
    },
    ...(canViewFinancialSummary(role)
      ? [{
          key: 'financeiro',
          label: 'Financeiro',
          icon: Wallet,
          items: [
            { to: '/financeiro/despesas', label: 'Despesas', icon: Wallet },
            { to: '/financeiro/fechamentos', label: 'Fechamentos', icon: ClipboardList },
            { to: '/financeiro/fornecedores', label: 'Fornecedores', icon: Truck },
            { to: '/financeiro', label: 'Painel', icon: BarChart3 },
            { to: '/financeiro/recebimentos', label: 'Recebimentos', icon: Receipt },
            { to: '/financeiro/repasses', label: 'Repasses', icon: HandCoins }
          ]
        }]
      : []),
    ...(canManageUsers(role) || canApproveUsers(role) || canViewPraiseInsights(role)
      ? [{
          key: 'gestao',
          label: 'Gestão',
          icon: ShieldCheck,
          items: [
            ...(canManageUsers(role) || canApproveUsers(role)
              ? [{ to: '/admin', label: 'Administração', icon: ShieldCheck }]
              : []),
            // Ver os próprios alertas é de todo mundo; a aba de configuração
            // dentro da página é que some pra quem não é Diretoria. O item vive
            // em Gestão porque é lá que se configura — mas o /alertas em si não
            // tem trava de entrada.
            ...(canManageUsers(role) || canApproveUsers(role)
              ? [{ to: '/alertas', label: 'Alertas', icon: Bell }]
              : []),
            ...(canViewPraiseInsights(role) ? [{ to: '/gestao/elogios', label: 'Elogios', icon: Heart }] : []),
            ...(canManageUsers(role) ? [{ to: '/configuracoes', label: 'Configurações', icon: Settings }] : [])
          ]
        }]
      : [])
  ]

  return groups
    .map((g) => ({ ...g, items: [...g.items].sort(byLabel) }))
    .filter((g) => g.items.length > 0)
    .sort(byGroupLabel)
}

// ---------------------------------------------------------------------------
// Barra inferior do celular: 4 atalhos + "Mais". A Diretoria pode montar a
// barra de cada perfil em Configurações (role_permissions.mobile_nav); sem
// escolha salva, vale o padrão por cargo. Toda opção respeita a permissão do
// cargo — escolher "Financeiro" pra quem não pode ver não fura a trava: o
// item é filtrado aqui e as páginas continuam barrando por dentro.
// ---------------------------------------------------------------------------

export interface MobileNavOption {
  key: string
  item: NavItem
  allow: (role: AccessRole) => boolean
}

export const MOBILE_NAV_OPTIONS: MobileNavOption[] = [
  { key: 'inicio', item: HOME_LINK, allow: () => true },
  { key: 'eventos', item: { to: '/eventos', label: 'Eventos', icon: CalendarDays }, allow: () => true },
  { key: 'escala', item: { to: '/escala', label: 'Escala', icon: ClipboardList }, allow: () => true },
  { key: 'perfil', item: { to: '/perfil/me', label: 'Perfil', icon: UserCircle }, allow: () => true },
  { key: 'turma', item: { to: '/turma', label: 'Turma', icon: Users }, allow: canViewTeamDirectory },
  { key: 'ranking', item: { to: '/ranking', label: 'Ranking', icon: Trophy }, allow: canViewRanking },
  { key: 'mapa', item: { to: '/mapa', label: 'Mapa', icon: Hexagon }, allow: canViewHiveMap },
  { key: 'aniversariantes', item: { to: '/aniversariantes', label: 'Nivers', icon: Cake }, allow: canViewBirthdays },
  { key: 'estoque', item: { to: '/estoque', label: 'Estoque', icon: Package }, allow: canViewStockTab },
  { key: 'financeiro', item: { to: '/financeiro', label: 'Financeiro', icon: Wallet }, allow: canViewFinancialSummary },
  { key: 'recebimentos', item: { to: '/financeiro/recebimentos', label: 'Receber', icon: Receipt }, allow: canViewFinancialSummary },
  { key: 'admin', item: { to: '/admin', label: 'Admin', icon: ShieldCheck }, allow: (r) => canManageUsers(r) || canApproveUsers(r) }
]

// Padrões por cargo. Fora da Diretoria e do Operacional, o 4º atalho agora é
// o PERFIL da própria pessoa — a Turma continua a um toque, dentro do "Mais".
export const DEFAULT_MOBILE_NAV: Record<string, string[]> = {
  diretoria: ['inicio', 'eventos', 'financeiro', 'admin'],
  operacional: ['inicio', 'eventos', 'estoque', 'escala']
}
const FALLBACK_MOBILE_NAV = ['inicio', 'eventos', 'escala', 'perfil']

export function defaultMobileNavKeys(role: AccessRole): string[] {
  return DEFAULT_MOBILE_NAV[role] ?? FALLBACK_MOBILE_NAV
}

export function mobileNavFor(role: AccessRole): NavItem[] {
  const salvo = getRolePermissionsMap()[role]?.mobile_nav
  const keys = (salvo && salvo.length > 0 ? salvo : defaultMobileNavKeys(role)).slice(0, 4)
  const items = keys
    .map((k) => MOBILE_NAV_OPTIONS.find((o) => o.key === k))
    .filter((o): o is MobileNavOption => Boolean(o && o.allow(role)))
    .map((o) => o.item)
  // Se a escolha salva ficou toda sem permissão (cargo mudou), volta pro
  // padrão de fábrica — barra nunca aparece vazia.
  return items.length > 0
    ? items
    : FALLBACK_MOBILE_NAV.map((k) => MOBILE_NAV_OPTIONS.find((o) => o.key === k)!.item)
}

// O item ativo: o /financeiro (Painel) casaria com /financeiro/despesas se a
// comparação fosse startsWith, acendendo dois itens ao mesmo tempo. Ganha o
// prefixo mais longo — ou seja, o mais específico.
export function isItemActive(item: NavItem, pathname: string, siblings: NavItem[]) {
  const matches = (to: string) => pathname === to || pathname.startsWith(`${to}/`)
  if (!matches(item.to)) return false
  return !siblings.some((other) => other.to !== item.to && other.to.length > item.to.length && matches(other.to))
}

export function groupHasActive(group: NavGroup, pathname: string) {
  return group.items.some((item) => isItemActive(item, pathname, group.items))
}
