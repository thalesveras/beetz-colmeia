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
