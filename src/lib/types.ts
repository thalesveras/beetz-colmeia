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
export type PaymentMethod = 'Dinheiro' | 'Débito' | 'Crédito' | 'Pix' | 'Transferência'

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
  created_at: string
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
