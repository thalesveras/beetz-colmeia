import type { AlertFlagKey, Department, Profile, RolePermissions } from './types'

// String, não union: perfis agora nascem pela tela de Configurações. Os cinco
// de fábrica seguem garantidos pelos defaults abaixo; os criados chegam do
// banco via setRolePermissions e entram nas listas em tempo de execução.
export type AccessRole = string

// Mutável de propósito (mutado in-place pra manter os imports vivos):
// setRolePermissions reconstrói a ordem — diretoria primeiro, resto por rótulo.
export const ACCESS_ROLES: AccessRole[] = ['diretoria', 'garcom', 'caixa', 'operacional', 'colaborador']

// Pra qual papel de acesso um departamento aponta. Vários departamentos podem
// apontar pro mesmo papel (ex: Bar, Produção, Segurança, Credenciamento e
// Limpeza todos caem em "operacional") — as permissões são por papel, não por
// departamento individual. Editável pela Diretoria em /configuracoes
// (departments.access_role no banco); antes disso era fixo aqui no código.
export function departmentToAccessRole(dept: Pick<Department, 'access_role'>): AccessRole {
  return dept.access_role in ROLE_PERMISSIONS ? dept.access_role : 'colaborador'
}

export function computeAccessRole(profile: Profile | null | undefined, departments: Department[]): AccessRole {
  if (!profile?.department_id) return 'colaborador'
  const dept = departments.find((d) => d.id === profile.department_id)
  if (!dept) return 'colaborador'
  return departmentToAccessRole(dept)
}

export const ACCESS_ROLE_LABELS: Record<AccessRole, string> = {
  diretoria: 'Diretoria (acesso completo)',
  garcom: 'Garçom (fechamento de caixa)',
  caixa: 'Caixa (fechamento de caixa)',
  operacional: 'Operacional (estoque)',
  colaborador: 'Colaborador (sem papel especial)'
}

// Perfil recém-criado pode aparecer antes das permissões carregarem (corrida
// de load) — cai no colaborador, o perfil mais restrito, nunca num crash.
function permsOf(role: AccessRole): Omit<RolePermissions, 'role' | 'label' | 'builtin' | 'updated_at'> {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS['colaborador']
}

// Valores padrão — substituídos em tempo de execução pelo ConfigContext assim que
// as permissões (editáveis em /configuracoes) são carregadas do banco.
const ROLE_PERMISSIONS: Record<AccessRole, Omit<RolePermissions, 'role' | 'label' | 'builtin' | 'updated_at'>> = {
  diretoria: {
    can_add_expense: true, can_review_expense: true, can_add_cashier: true, can_add_stock: true,
    can_manage_users: true, can_view_financial_summary: true, can_approve_users: true,
    can_review_cashier: true, can_edit_expense: true, can_edit_stock: true, can_approve_event_requests: true,
    can_manage_stock_catalog: true, can_edit_own_stock: true,
    can_view_pending_details: true, can_give_recognition: true, can_view_ranking: true,
    can_view_hive_map: true, can_edit_hive_map: true, can_view_team_directory: true,
    can_view_birthdays: true, can_send_birthday_email: true,
    can_receive_alert_staffing_decision: true, can_receive_alert_staffing_application: true,
    can_receive_alert_staffing_new_slot: true, can_receive_alert_stock_low: true,
    can_receive_alert_expense_reviewed: true, can_receive_alert_event_changed: true,
    can_receive_alert_stock_idle: true, can_receive_alert_inventory_diff: true, can_receive_alert_pending_return: true
  },
  garcom: {
    can_add_expense: false, can_review_expense: false, can_add_cashier: true, can_add_stock: false,
    can_manage_users: false, can_view_financial_summary: false, can_approve_users: false,
    can_review_cashier: false, can_edit_expense: false, can_edit_stock: false, can_approve_event_requests: false,
    can_manage_stock_catalog: false, can_edit_own_stock: false,
    can_view_pending_details: true, can_give_recognition: true, can_view_ranking: true,
    can_view_hive_map: true, can_edit_hive_map: false, can_view_team_directory: true,
    can_view_birthdays: true, can_send_birthday_email: false,
    can_receive_alert_staffing_decision: true, can_receive_alert_staffing_application: false,
    can_receive_alert_staffing_new_slot: true, can_receive_alert_stock_low: false,
    can_receive_alert_expense_reviewed: true, can_receive_alert_event_changed: true,
    can_receive_alert_stock_idle: false, can_receive_alert_inventory_diff: false, can_receive_alert_pending_return: false
  },
  caixa: {
    can_add_expense: false, can_review_expense: false, can_add_cashier: true, can_add_stock: false,
    can_manage_users: false, can_view_financial_summary: false, can_approve_users: false,
    can_review_cashier: false, can_edit_expense: false, can_edit_stock: false, can_approve_event_requests: false,
    can_manage_stock_catalog: false, can_edit_own_stock: false,
    can_view_pending_details: true, can_give_recognition: true, can_view_ranking: true,
    can_view_hive_map: true, can_edit_hive_map: false, can_view_team_directory: true,
    can_view_birthdays: true, can_send_birthday_email: false,
    can_receive_alert_staffing_decision: true, can_receive_alert_staffing_application: false,
    can_receive_alert_staffing_new_slot: true, can_receive_alert_stock_low: false,
    can_receive_alert_expense_reviewed: true, can_receive_alert_event_changed: true,
    can_receive_alert_stock_idle: false, can_receive_alert_inventory_diff: false, can_receive_alert_pending_return: false
  },
  // Operacional cobre o time de bar/produção/segurança/etc — ganham autonomia pra
  // manter o catálogo de produtos/estoques em dia e corrigir os próprios lançamentos.
  operacional: {
    can_add_expense: false, can_review_expense: false, can_add_cashier: false, can_add_stock: true,
    can_manage_users: false, can_view_financial_summary: false, can_approve_users: false,
    can_review_cashier: false, can_edit_expense: false, can_edit_stock: false, can_approve_event_requests: false,
    can_manage_stock_catalog: true, can_edit_own_stock: true,
    can_view_pending_details: true, can_give_recognition: true, can_view_ranking: true,
    can_view_hive_map: true, can_edit_hive_map: false, can_view_team_directory: true,
    can_view_birthdays: true, can_send_birthday_email: false,
    can_receive_alert_staffing_decision: true, can_receive_alert_staffing_application: false,
    can_receive_alert_staffing_new_slot: true, can_receive_alert_stock_low: true,
    can_receive_alert_expense_reviewed: true, can_receive_alert_event_changed: true,
    can_receive_alert_stock_idle: true, can_receive_alert_inventory_diff: true, can_receive_alert_pending_return: true
  },
  colaborador: {
    can_add_expense: false, can_review_expense: false, can_add_cashier: false, can_add_stock: false,
    can_manage_users: false, can_view_financial_summary: false, can_approve_users: false,
    can_review_cashier: false, can_edit_expense: false, can_edit_stock: false, can_approve_event_requests: false,
    can_manage_stock_catalog: false, can_edit_own_stock: false,
    can_view_pending_details: true, can_give_recognition: true, can_view_ranking: true,
    can_view_hive_map: true, can_edit_hive_map: false, can_view_team_directory: true,
    can_view_birthdays: true, can_send_birthday_email: false,
    can_receive_alert_staffing_decision: true, can_receive_alert_staffing_application: false,
    can_receive_alert_staffing_new_slot: true, can_receive_alert_stock_low: false,
    can_receive_alert_expense_reviewed: true, can_receive_alert_event_changed: true,
    can_receive_alert_stock_idle: false, can_receive_alert_inventory_diff: false, can_receive_alert_pending_return: false
  }
}

export function setRolePermissions(configs: RolePermissions[]) {
  if (!configs.length) return
  for (const config of configs) {
    // Sem o guard antigo: perfil criado pela tela entra aqui na primeira carga.
    const { role, label, builtin, updated_at, ...rest } = config
    ROLE_PERMISSIONS[role] = rest
    if (label) ACCESS_ROLE_LABELS[role] = label
  }
  // Reconstrói a lista in-place (imports de ACCESS_ROLES continuam válidos):
  // diretoria primeiro, demais por rótulo. Perfis que sumiram do banco saem.
  const ordered = configs
    .map((c) => c.role)
    .sort((a, b) => {
      if (a === 'diretoria') return -1
      if (b === 'diretoria') return 1
      return (ACCESS_ROLE_LABELS[a] ?? a).localeCompare(ACCESS_ROLE_LABELS[b] ?? b, 'pt-BR')
    })
  ACCESS_ROLES.splice(0, ACCESS_ROLES.length, ...ordered)
}

export function getRolePermissionsMap() {
  return ROLE_PERMISSIONS
}

export function canManageUsers(role: AccessRole) {
  return permsOf(role).can_manage_users
}

export function canAddExpense(role: AccessRole) {
  return permsOf(role).can_add_expense
}

export function canReviewExpense(role: AccessRole) {
  return permsOf(role).can_review_expense
}

export function canViewExpensesTab(role: AccessRole) {
  return canAddExpense(role)
}

export function canAddCashierSettlement(role: AccessRole) {
  return permsOf(role).can_add_cashier
}

export function canViewCashierTab(role: AccessRole) {
  return canAddCashierSettlement(role)
}

export function canAddStockMovement(role: AccessRole) {
  return permsOf(role).can_add_stock
}

export function canViewStockTab(role: AccessRole) {
  return canAddStockMovement(role)
}

export function canViewFinancialSummary(role: AccessRole) {
  return permsOf(role).can_view_financial_summary
}

export function canApproveUsers(role: AccessRole) {
  return permsOf(role).can_approve_users
}

export function canReviewCashier(role: AccessRole) {
  return permsOf(role).can_review_cashier
}

export function canEditExpense(role: AccessRole) {
  return permsOf(role).can_edit_expense
}

export function canEditStock(role: AccessRole) {
  return permsOf(role).can_edit_stock
}

export function canApproveEventRequests(role: AccessRole) {
  return permsOf(role).can_approve_event_requests
}

export function canManageStockCatalog(role: AccessRole) {
  return permsOf(role).can_manage_stock_catalog
}

export function canEditOwnStock(role: AccessRole) {
  return permsOf(role).can_edit_own_stock
}

export function canViewPendingProfileDetails(role: AccessRole) {
  return permsOf(role).can_view_pending_details
}

export function canGiveRecognition(role: AccessRole) {
  return permsOf(role).can_give_recognition
}

export function canViewRanking(role: AccessRole) {
  return permsOf(role).can_view_ranking
}

export function canEditHiveMap(role: AccessRole) {
  return permsOf(role).can_edit_hive_map
}

export function canViewHiveMap(role: AccessRole) {
  return permsOf(role).can_view_hive_map
}

export function canViewTeamDirectory(role: AccessRole) {
  return permsOf(role).can_view_team_directory
}

export function canViewBirthdays(role: AccessRole) {
  return permsOf(role).can_view_birthdays
}

// Ver quem faz aniversário é uma coisa; mandar e-mail em nome da Beetz é
// outra — por isso duas flags. A edge function send-birthday-email confere
// Diretoria no servidor de qualquer jeito; essa flag controla a interface.
export function canSendBirthdayEmail(role: AccessRole) {
  return permsOf(role).can_send_birthday_email
}

// Só a Diretoria configura quais alertas cada cargo recebe. Ver a própria caixa
// de alertas, porém, é de todo mundo — por isso não há flag pra abrir /alertas:
// as abas Pessoais e Escala mostram o que é seu, e a aba Configurações some
// pra quem não é Diretoria.
export function canConfigureAlerts(role: AccessRole) {
  return permsOf(role).can_manage_users
}

// Espelha o alert_enabled() do banco. Aqui serve só pra tela não prometer o que
// não vem; quem realmente barra é o trigger, que lê a mesma coluna.
export function canReceiveAlert(role: AccessRole, flag: AlertFlagKey) {
  return ROLE_PERMISSIONS[role][flag]
}
