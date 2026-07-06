export type ExperienceLevel =
  | 'Nova abelha'
  | 'Em treinamento'
  | 'Colaborador frequente'
  | 'Líder de bar'

export type HiveLevel =
  | 'Nova Abelha'
  | 'Abelha em Treinamento'
  | 'Coletor de Mel'
  | 'Abelha Operacional'
  | 'Líder da Colmeia'
  | 'Lenda Beetz'

export type EventStatus = 'Planejado' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'

export type BadgeType =
  | 'first_event'
  | 'ten_events'
  | 'fifty_events'
  | 'leader_highlight'
  | 'punctuality'
  | 'most_complimented'

export interface Department {
  id: string
  name: string
  slug: string
  icon: string
  description: string
}

export interface Profile {
  id: string
  first_name: string
  last_name: string
  birth_date: string | null
  cpf: string | null
  phone: string | null
  email: string
  city: string | null
  state: string | null
  mother_name: string | null
  father_name: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  department_id: string | null
  role: string | null
  experience_level: ExperienceLevel | null
  entry_date: string | null
  work_location: string | null
  skills: string[]
  health_conditions: string | null
  allergies: string | null
  important_notes: string | null
  about_me: string | null
  fun_fact: string | null
  favorite_events: string | null
  instagram: string | null
  personal_quote: string | null
  avatar_url: string | null
  onboarding_completed: boolean
  created_at: string
}

export interface EventItem {
  id: string
  name: string
  event_date: string
  location: string
  city: string
  status: EventStatus
  leader_id: string | null
  created_at: string
  // Resumo do evento
  producer_name: string | null
  producer_auth_email: string | null
  producer_auth_email_secondary: string | null
  address: string | null
  start_time: string | null
  end_date: string | null
  end_time: string | null
  link: string | null
  music_style: string | null
  flyer_url: string | null
  // Fechamento — visão diretoria (entradas manuais)
  sales_amount: number
  commission_percentage: number
  credits_bonus: number
  repasses: number
}

export interface EventMember {
  id: string
  event_id: string
  profile_id: string
  role_in_event: string | null
  created_at: string
}

export interface Compliment {
  id: string
  from_profile_id: string
  to_profile_id: string
  message: string
  created_at: string
}

export interface HoneyPoint {
  id: string
  from_profile_id: string
  to_profile_id: string
  amount: number
  reason: string | null
  created_at: string
}

export interface Badge {
  id: string
  profile_id: string
  badge_type: BadgeType
  awarded_at: string
}

export interface ProfileStats {
  eventsCount: number
  honeyReceived: number
  complimentsReceived: number
  hiveLevel: HiveLevel
  badges: BadgeType[]
}

export type ExpenseStatus = 'Pendente' | 'Aprovado' | 'Pago' | 'Rejeitado'
// Antes era uma união fixa; agora as formas de pagamento são editáveis em
// /configuracoes, então qualquer texto cadastrado ali é um valor válido.
export type PaymentMethod = string

export interface Expense {
  id: string
  event_id: string
  status: ExpenseStatus
  category: string | null
  receipt_data: string | null
  payment_method: PaymentMethod | null
  description: string | null
  quantity: number
  unit_value: number
  dex_fee: number
  total: number
  signature_data: string | null
  repasse_data: string | null
  created_by: string | null
  team_member_id: string | null
  supplier_id: string | null
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  contact: string | null
  created_at: string
}

export interface EventProduct {
  id: string
  event_id: string
  product_id: string
  quantity: number
  unit_price: number
  total: number
  notes: string | null
  created_at: string
}

export interface ProductionConsumption {
  id: string
  event_id: string
  product_id: string
  quantity: number
  unit_cost: number
  total_cost: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export type TransferRequestStatus = 'Pendente' | 'Aprovado' | 'Negado'

export interface TransferRequest {
  id: string
  event_id: string
  product_id: string
  quantity: number
  from_location_id: string | null
  to_location_id: string | null
  requested_by: string | null
  status: TransferRequestStatus
  notes: string | null
  created_at: string
}

export interface EventFinancialSummary {
  despesas: number
  custoProdutos: number
  consumoProducao: number
  vendas: number
  percentual: number
  aReceber: number
  creditosOuBonificacoes: number
  repasses: number
  saldoAReceberDaProdutora: number
  lucroOuPerda: number
}

export type CashierRoleType = 'Caixa' | 'Garçom'

export interface CashierSettlement {
  id: string
  event_id: string
  profile_id: string | null
  role_type: CashierRoleType
  cash_amount: number
  debit_amount: number
  credit_amount: number
  pix_amount: number
  total: number
  commission_amount: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface StockLocation {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface Product {
  id: string
  name: string
  unit: string
  category: string | null
  created_at: string
}

export type MovementType = 'Entrada' | 'Saída'

export interface StockMovement {
  id: string
  product_id: string
  stock_location_id: string
  event_id: string | null
  movement_type: MovementType
  quantity: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface StockBalance {
  product_id: string
  product_name: string
  product_unit: string
  stock_location_id: string
  stock_location_name: string
  balance: number
}

export type AccessRoleKey = 'diretoria' | 'garcom' | 'caixa' | 'operacional' | 'colaborador'

export interface RolePermissions {
  role: AccessRoleKey
  can_add_expense: boolean
  can_review_expense: boolean
  can_add_cashier: boolean
  can_add_stock: boolean
  can_manage_users: boolean
  can_view_financial_summary: boolean
  updated_at: string
}

export interface ExpenseCategory {
  id: string
  name: string
}

export interface PaymentMethodOption {
  id: string
  name: string
}

export interface HiveLevelConfig {
  id: string
  level: string
  min_events: number
  icon: string | null
  color: string | null
  description: string | null
  sort_order: number
}

export interface BadgeDefConfig {
  id: string
  type: string
  label: string
  icon: string | null
  description: string | null
}

export interface AppSettings {
  id: boolean
  company_name: string
  welcome_title: string
  welcome_subtitle: string
  updated_at: string
}
