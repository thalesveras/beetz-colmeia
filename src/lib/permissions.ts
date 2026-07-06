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
  diretoria: { can_add_expense: true, can_review_expense: true, can_add_cashier: true, can_add_stock: true, can_manage_users: true, can_view_financial_summary: true },
  garcom: { can_add_expense: false, can_review_expense: false, can_add_cashier: true, can_add_stock: false, can_manage_users: false, can_view_financial_summary: false },
  caixa: { can_add_expense: false, can_review_expense: false, can_add_cashier: true, can_add_stock: false, can_manage_users: false, can_view_financial_summary: false },
  operacional: { can_add_expense: false, can_review_expense: false, can_add_cashier: false, can_add_stock: true, can_manage_users: false, can_view_financial_summary: false },
  colaborador: { can_add_expense: false, can_review_expense: false, can_add_cashier: false, can_add_stock: false, can_manage_users: false, can_view_financial_summary: false }
}

export function setRolePermissions(configs: RolePermissions[]) {
  if (!configs.length) return
  for (const config of configs) {
    if (!(config.role in ROLE_PERMISSIONS)) continue
    ROLE_PERMISSIONS[config.role] = {
      can_add_expense: config.can_add_expense,
      can_review_expense: config.can_review_expense,
      can_add_cashier: config.can_add_cashier,
      can_add_stock: config.can_add_stock,
      can_manage_users: config.can_manage_users,
      can_view_financial_summary: config.can_view_financial_summary
    }
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
