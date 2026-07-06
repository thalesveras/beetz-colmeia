import type { Department, Profile, RolePermissions } from './types'

export type AccessRole = 'diretoria' | 'garcom' | 'caixa' | 'operacional' | 'colaborador'

// Departamentos "de mão na massa" que dão acesso operacional (estoque)
const OPERATIONAL_SLUGS = ['producao', 'bar', 'seguranca', 'credenciamento', 'limpeza']

export function computeAccessRole(profile: Profile | null | undefined, departments: Department[]): AccessRole {
  if (!profile?.department_id) return 'colaborador'
  const dept = departments.find((d) => d.id === profile.department_id)
  if (!dept) return 'colaborador'
  if (dept.slug === 'diretoria') return 'diretoria'
  if (dept.slug === 'garcons') return 'garcom'
  if (dept.slug === 'caixa') return 'caixa'
  if (OPERATIONAL_SLUGS.includes(dept.slug)) return 'operacional'
  return 'colaborador'
}

export const ACCESS_ROLE_LABELS: Record<AccessRole, string> = {
  diretoria: 'Diretoria (acesso completo)',
  garcom: 'Garçom (fechamento de caixa)',
  caixa: 'Caixa (fechamento de caixa)',
  operacional: 'Operacional (estoque)',
  colaborador: 'Colaborador (sem papel especial)'
}

// Valores padrão — substituídos em tempo de execução pelo ConfigContext assim que
// as permissões (editáveis em /configuracoes) são carregadas do banco.
const ROLE_PERMISSIONS: Record<AccessRole, Omit<RolePermissions, 'role' | 'updated_at'>> = {
  diretoria: {
    can_add_expense: true, can_review_expense: true, can_add_cashier: true, can_add_stock: true,
    can_manage_users: true, can_view_financial_summary: true, can_approve_users: true,
    can_review_cashier: true, can_edit_expense: true, can_edit_stock: true, can_approve_event_requests: true,
    can_manage_stock_catalog: true, can_edit_own_stock: true
  },
  garcom: {
    can_add_expense: false, can_review_expense: false, can_add_cashier: true, can_add_stock: false,
    can_manage_users: false, can_view_financial_summary: false, can_approve_users: false,
    can_review_cashier: false, can_edit_expense: false, can_edit_stock: false, can_approve_event_requests: false,
    can_manage_stock_catalog: false, can_edit_own_stock: false
  },
  caixa: {
    can_add_expense: false, can_review_expense: false, can_add_cashier: true, can_add_stock: false,
    can_manage_users: false, can_view_financial_summary: false, can_approve_users: false,
    can_review_cashier: false, can_edit_expense: false, can_edit_stock: false, can_approve_event_requests: false,
    can_manage_stock_catalog: false, can_edit_own_stock: false
  },
  // Operacional cobre o time de bar/produção/segurança/etc — ganham autonomia pra
  // manter o catálogo de produtos/estoques em dia e corrigir os próprios lançamentos.
  operacional: {
    can_add_expense: false, can_review_expense: false, can_add_cashier: false, can_add_stock: true,
    can_manage_users: false, can_view_financial_summary: false, can_approve_users: false,
    can_review_cashier: false, can_edit_expense: false, can_edit_stock: false, can_approve_event_requests: false,
    can_manage_stock_catalog: true, can_edit_own_stock: true
  },
  colaborador: {
    can_add_expense: false, can_review_expense: false, can_add_cashier: false, can_add_stock: false,
    can_manage_users: false, can_view_financial_summary: false, can_approve_users: false,
    can_review_cashier: false, can_edit_expense: false, can_edit_stock: false, can_approve_event_requests: false,
    can_manage_stock_catalog: false, can_edit_own_stock: false
  }
}

export function setRolePermissions(configs: RolePermissions[]) {
  if (!configs.length) return
  for (const config of configs) {
    if (!(config.role in ROLE_PERMISSIONS)) continue
    const { role, updated_at, ...rest } = config
    ROLE_PERMISSIONS[role] = rest
  }
}

export function getRolePermissionsMap() {
  return ROLE_PERMISSIONS
}

export function canManageUsers(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_manage_users
}

export function canAddExpense(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_add_expense
}

export function canReviewExpense(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_review_expense
}

export function canViewExpensesTab(role: AccessRole) {
  return canAddExpense(role)
}

export function canAddCashierSettlement(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_add_cashier
}

export function canViewCashierTab(role: AccessRole) {
  return canAddCashierSettlement(role)
}

export function canAddStockMovement(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_add_stock
}

export function canViewStockTab(role: AccessRole) {
  return canAddStockMovement(role)
}

export function canViewFinancialSummary(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_view_financial_summary
}

export function canApproveUsers(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_approve_users
}

export function canReviewCashier(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_review_cashier
}

export function canEditExpense(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_edit_expense
}

export function canEditStock(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_edit_stock
}

export function canApproveEventRequests(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_approve_event_requests
}

export function canManageStockCatalog(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_manage_stock_catalog
}

export function canEditOwnStock(role: AccessRole) {
  return ROLE_PERMISSIONS[role].can_edit_own_stock
}
