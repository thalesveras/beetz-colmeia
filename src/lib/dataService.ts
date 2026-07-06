import { isDemoMode, supabase } from './supabaseClient'
import {
  mockAppSettings, mockBadgeDefConfigs, mockBadges, mockCashierSettlements, mockCompliments,
  mockDepartments, mockEventMembers, mockEventProducts, mockEvents, mockExpenseCategories,
  mockExpenses, mockHiveLevelConfigs, mockHoneyPoints, mockPaymentMethods,
  mockProductionConsumption, mockProducts, mockProfiles, mockRolePermissions, mockStockLocations,
  mockStockMovements, mockSuppliers, mockTransferRequests
} from './mockData'
import { badgesFromStats, getHiveLevel } from './levels'
import type {
  AppSettings, Badge, BadgeDefConfig, CashierSettlement, Compliment, Department, EventFinancialSummary,
  EventItem, EventMember, EventProduct, Expense, ExpenseCategory, HiveLevelConfig, HoneyPoint,
  MovementType, PaymentMethodOption, Product, ProductionConsumption, Profile, ProfileStats,
  RolePermissions, StockBalance, StockLocation, StockMovement, Supplier, TransferRequest,
  TransferRequestStatus
} from './types'

// ---------- Estado em memória para o modo demonstração ----------
const demoState = {
  departments: [...mockDepartments],
  profiles: [...mockProfiles],
  events: [...mockEvents],
  eventMembers: [...mockEventMembers],
  honeyPoints: [...mockHoneyPoints],
  compliments: [...mockCompliments],
  badges: [...mockBadges],
  expenses: [...mockExpenses],
  cashierSettlements: [...mockCashierSettlements],
  stockLocations: [...mockStockLocations],
  products: [...mockProducts],
  stockMovements: [...mockStockMovements],
  rolePermissions: [...mockRolePermissions],
  expenseCategories: [...mockExpenseCategories],
  paymentMethods: [...mockPaymentMethods],
  hiveLevels: [...mockHiveLevelConfigs],
  badgeDefs: [...mockBadgeDefConfigs],
  appSettings: { ...mockAppSettings },
  suppliers: [...mockSuppliers],
  eventProducts: [...mockEventProducts],
  productionConsumption: [...mockProductionConsumption],
  transferRequests: [...mockTransferRequests]
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------- Departamentos ----------
export async function listDepartments(): Promise<Department[]> {
  if (isDemoMode) return demoState.departments
  const { data, error } = await supabase.from('departments').select('*').order('name')
  if (error) throw error
  return data as Department[]
}

// ---------- Perfis ----------
export async function listProfiles(): Promise<Profile[]> {
  if (isDemoMode) return demoState.profiles.filter((p) => p.onboarding_completed)
  const { data, error } = await supabase.from('profiles').select('*').eq('onboarding_completed', true)
  if (error) throw error
  return data as Profile[]
}

export async function getProfileById(id: string): Promise<Profile | null> {
  if (isDemoMode) return demoState.profiles.find((p) => p.id === id) ?? null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function updateProfileDepartment(profileId: string, departmentId: string): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.profiles.findIndex((p) => p.id === profileId)
    if (idx >= 0) demoState.profiles[idx] = { ...demoState.profiles[idx], department_id: departmentId }
    return
  }
  const { error } = await supabase.from('profiles').update({ department_id: departmentId }).eq('id', profileId)
  if (error) throw error
}

export async function upsertProfile(profile: Partial<Profile> & { id: string }): Promise<Profile> {
  if (isDemoMode) {
    const idx = demoState.profiles.findIndex((p) => p.id === profile.id)
    if (idx >= 0) {
      demoState.profiles[idx] = { ...demoState.profiles[idx], ...profile }
      return demoState.profiles[idx]
    }
    const blank: Profile = {
      id: profile.id, first_name: '', last_name: '', birth_date: null, cpf: null, phone: null,
      email: profile.email ?? '', city: null, state: null, mother_name: null, father_name: null,
      emergency_contact_name: null, emergency_contact_phone: null, department_id: null, role: null,
      experience_level: null, entry_date: null, work_location: null, skills: [], health_conditions: null,
      allergies: null, important_notes: null, about_me: null, fun_fact: null, favorite_events: null,
      instagram: null, personal_quote: null, avatar_url: null, onboarding_completed: false,
      created_at: new Date().toISOString(), ...profile
    }
    demoState.profiles.push(blank)
    return blank
  }
  const { data, error } = await supabase.from('profiles').upsert(profile).select().single()
  if (error) throw error
  return data as Profile
}

// ---------- Eventos ----------
export async function listEvents(): Promise<EventItem[]> {
  if (isDemoMode) return [...demoState.events].sort((a, b) => a.event_date < b.event_date ? 1 : -1)
  const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false })
  if (error) throw error
  return data as EventItem[]
}

export async function getEventById(id: string): Promise<EventItem | null> {
  if (isDemoMode) return demoState.events.find((e) => e.id === id) ?? null
  const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as EventItem | null
}

export async function updateEvent(id: string, patch: Partial<Omit<EventItem, 'id' | 'created_at'>>): Promise<EventItem> {
  if (isDemoMode) {
    const idx = demoState.events.findIndex((e) => e.id === id)
    if (idx < 0) throw new Error('Evento não encontrado')
    demoState.events[idx] = { ...demoState.events[idx], ...patch }
    return demoState.events[idx]
  }
  const { data, error } = await supabase.from('events').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as EventItem
}

// Só os campos essenciais são obrigatórios ao criar; o resumo do evento e os
// campos financeiros do fechamento podem ser preenchidos depois, na página do evento.
export type NewEventInput =
  Pick<EventItem, 'name' | 'event_date' | 'location' | 'city' | 'status' | 'leader_id'> &
  Partial<Omit<EventItem, 'id' | 'created_at' | 'name' | 'event_date' | 'location' | 'city' | 'status' | 'leader_id'>>

const eventResumoDefaults = {
  producer_name: null, producer_auth_email: null, producer_auth_email_secondary: null,
  address: null, start_time: null, end_date: null, end_time: null, link: null,
  music_style: null, flyer_url: null, sales_amount: 0, commission_percentage: 0,
  credits_bonus: 0, repasses: 0
}

export async function createEvent(event: NewEventInput): Promise<EventItem> {
  if (isDemoMode) {
    const newEvent: EventItem = { ...eventResumoDefaults, ...event, id: uid('e'), created_at: new Date().toISOString() }
    demoState.events.push(newEvent)
    return newEvent
  }
  const { data, error } = await supabase.from('events').insert(event).select().single()
  if (error) throw error
  return data as EventItem
}

export async function listEventMembers(eventId: string): Promise<EventMember[]> {
  if (isDemoMode) return demoState.eventMembers.filter((m) => m.event_id === eventId)
  const { data, error } = await supabase.from('event_members').select('*').eq('event_id', eventId)
  if (error) throw error
  return data as EventMember[]
}

export async function addEventMember(eventId: string, profileId: string, roleInEvent: string): Promise<EventMember> {
  if (isDemoMode) {
    const newMember: EventMember = { id: uid('m'), event_id: eventId, profile_id: profileId, role_in_event: roleInEvent, created_at: new Date().toISOString() }
    demoState.eventMembers.push(newMember)
    return newMember
  }
  const { data, error } = await supabase.from('event_members')
    .insert({ event_id: eventId, profile_id: profileId, role_in_event: roleInEvent }).select().single()
  if (error) throw error
  return data as EventMember
}

export async function listEventsForProfile(profileId: string): Promise<EventItem[]> {
  const allMembers = isDemoMode
    ? demoState.eventMembers.filter((m) => m.profile_id === profileId)
    : (await supabase.from('event_members').select('*').eq('profile_id', profileId)).data ?? []
  const eventIds = new Set(allMembers.map((m: EventMember) => m.event_id))
  const all = await listEvents()
  return all.filter((e) => eventIds.has(e.id))
}

// ---------- Mel & Elogios ----------
export async function giveHoney(fromId: string, toId: string, amount: number, reason: string): Promise<HoneyPoint> {
  if (isDemoMode) {
    const hp: HoneyPoint = { id: uid('h'), from_profile_id: fromId, to_profile_id: toId, amount, reason, created_at: new Date().toISOString() }
    demoState.honeyPoints.push(hp)
    return hp
  }
  const { data, error } = await supabase.from('honey_points')
    .insert({ from_profile_id: fromId, to_profile_id: toId, amount, reason }).select().single()
  if (error) throw error
  return data as HoneyPoint
}

export async function giveCompliment(fromId: string, toId: string, message: string): Promise<Compliment> {
  if (isDemoMode) {
    const c: Compliment = { id: uid('c'), from_profile_id: fromId, to_profile_id: toId, message, created_at: new Date().toISOString() }
    demoState.compliments.push(c)
    return c
  }
  const { data, error } = await supabase.from('compliments')
    .insert({ from_profile_id: fromId, to_profile_id: toId, message }).select().single()
  if (error) throw error
  return data as Compliment
}

export async function listComplimentsForProfile(profileId: string): Promise<Compliment[]> {
  if (isDemoMode) return demoState.compliments.filter((c) => c.to_profile_id === profileId)
  const { data, error } = await supabase.from('compliments').select('*').eq('to_profile_id', profileId).order('created_at', { ascending: false })
  if (error) throw error
  return data as Compliment[]
}

export async function listBadgesForProfile(profileId: string): Promise<Badge[]> {
  if (isDemoMode) return demoState.badges.filter((b) => b.profile_id === profileId)
  const { data, error } = await supabase.from('badges').select('*').eq('profile_id', profileId)
  if (error) throw error
  return data as Badge[]
}

// ---------- Estatísticas agregadas ----------
export async function getProfileStats(profileId: string): Promise<ProfileStats> {
  const events = await listEventsForProfile(profileId)
  const honeyList = isDemoMode
    ? demoState.honeyPoints.filter((h) => h.to_profile_id === profileId)
    : ((await supabase.from('honey_points').select('*').eq('to_profile_id', profileId)).data ?? [])
  const compliments = await listComplimentsForProfile(profileId)
  const manualBadges = await listBadgesForProfile(profileId)

  const honeyReceived = honeyList.reduce((sum: number, h: HoneyPoint) => sum + (h.amount ?? 0), 0)
  const eventsCount = events.length
  const hiveLevel = getHiveLevel(eventsCount).level
  const autoBadges = badgesFromStats(eventsCount, compliments.length)
  const allBadgeTypes = Array.from(new Set([...autoBadges, ...manualBadges.map((b) => b.badge_type)]))

  return {
    eventsCount,
    honeyReceived,
    complimentsReceived: compliments.length,
    hiveLevel,
    badges: allBadgeTypes
  }
}

export interface RankingEntry {
  profile: Profile
  honeyReceived: number
  complimentsReceived: number
  eventsCount: number
  score: number
}

export async function getRanking(): Promise<RankingEntry[]> {
  const profiles = await listProfiles()
  const entries: RankingEntry[] = []
  for (const profile of profiles) {
    const stats = await getProfileStats(profile.id)
    entries.push({
      profile,
      honeyReceived: stats.honeyReceived,
      complimentsReceived: stats.complimentsReceived,
      eventsCount: stats.eventsCount,
      score: stats.honeyReceived + stats.complimentsReceived * 2
    })
  }
  return entries.sort((a, b) => b.score - a.score)
}

// ---------- Despesas ----------
export type NewExpenseInput = Omit<Expense, 'id' | 'created_at' | 'total'>

export async function listExpensesForEvent(eventId: string): Promise<Expense[]> {
  if (isDemoMode) {
    return demoState.expenses.filter((e) => e.event_id === eventId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }
  const { data, error } = await supabase.from('expenses').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
  if (error) throw error
  return data as Expense[]
}

export async function createExpense(input: NewExpenseInput): Promise<Expense> {
  if (isDemoMode) {
    const total = input.quantity * input.unit_value + input.dex_fee
    const expense: Expense = { ...input, id: uid('ex'), total, created_at: new Date().toISOString() }
    demoState.expenses.push(expense)
    return expense
  }
  const { data, error } = await supabase.from('expenses').insert(input).select().single()
  if (error) throw error
  return data as Expense
}

export async function updateExpenseStatus(id: string, status: Expense['status']): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.expenses.findIndex((e) => e.id === id)
    if (idx >= 0) demoState.expenses[idx] = { ...demoState.expenses[idx], status }
    return
  }
  const { error } = await supabase.from('expenses').update({ status }).eq('id', id)
  if (error) throw error
}

// ---------- Recebimentos (caixas) ----------
export type NewCashierSettlementInput = Omit<CashierSettlement, 'id' | 'created_at' | 'total' | 'commission_amount'>

export async function listCashierSettlementsForEvent(eventId: string): Promise<CashierSettlement[]> {
  if (isDemoMode) return demoState.cashierSettlements.filter((c) => c.event_id === eventId)
  const { data, error } = await supabase.from('cashier_settlements').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
  if (error) throw error
  return data as CashierSettlement[]
}

export async function createCashierSettlement(input: NewCashierSettlementInput): Promise<CashierSettlement> {
  if (isDemoMode) {
    const total = input.cash_amount + input.debit_amount + input.credit_amount + input.pix_amount
    const commission_amount = input.role_type === 'Garçom' ? total * 0.1 : 0
    const settlement: CashierSettlement = { ...input, id: uid('cs'), total, commission_amount, created_at: new Date().toISOString() }
    demoState.cashierSettlements.push(settlement)
    return settlement
  }
  const { data, error } = await supabase.from('cashier_settlements').insert(input).select().single()
  if (error) throw error
  return data as CashierSettlement
}

// ---------- Estoque multi-almoxarifado ----------
export async function listStockLocations(): Promise<StockLocation[]> {
  if (isDemoMode) return demoState.stockLocations
  const { data, error } = await supabase.from('stock_locations').select('*').order('name')
  if (error) throw error
  return data as StockLocation[]
}

export async function createStockLocation(name: string, description: string | null): Promise<StockLocation> {
  if (isDemoMode) {
    const loc: StockLocation = { id: uid('sl'), name, description, created_at: new Date().toISOString() }
    demoState.stockLocations.push(loc)
    return loc
  }
  const { data, error } = await supabase.from('stock_locations').insert({ name, description }).select().single()
  if (error) throw error
  return data as StockLocation
}

export async function listProducts(): Promise<Product[]> {
  if (isDemoMode) return demoState.products
  const { data, error } = await supabase.from('products').select('*').order('name')
  if (error) throw error
  return data as Product[]
}

export async function createProduct(name: string, unit: string, category: string | null): Promise<Product> {
  if (isDemoMode) {
    const product: Product = { id: uid('pr'), name, unit, category, created_at: new Date().toISOString() }
    demoState.products.push(product)
    return product
  }
  const { data, error } = await supabase.from('products').insert({ name, unit, category }).select().single()
  if (error) throw error
  return data as Product
}

export async function listStockMovements(eventId?: string): Promise<StockMovement[]> {
  if (isDemoMode) {
    const all = [...demoState.stockMovements].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return eventId ? all.filter((m) => m.event_id === eventId) : all
  }
  let query = supabase.from('stock_movements').select('*').order('created_at', { ascending: false })
  if (eventId) query = query.eq('event_id', eventId)
  const { data, error } = await query
  if (error) throw error
  return data as StockMovement[]
}

export interface NewStockMovementInput {
  product_id: string
  stock_location_id: string
  event_id: string | null
  movement_type: MovementType
  quantity: number
  notes: string | null
  created_by: string | null
}

export async function createStockMovement(input: NewStockMovementInput): Promise<StockMovement> {
  if (isDemoMode) {
    const movement: StockMovement = { ...input, id: uid('sm'), created_at: new Date().toISOString() }
    demoState.stockMovements.push(movement)
    return movement
  }
  const { data, error } = await supabase.from('stock_movements').insert(input).select().single()
  if (error) throw error
  return data as StockMovement
}

export async function getStockBalances(): Promise<StockBalance[]> {
  if (isDemoMode) {
    const balances: StockBalance[] = []
    for (const product of demoState.products) {
      for (const loc of demoState.stockLocations) {
        const movements = demoState.stockMovements.filter((m) => m.product_id === product.id && m.stock_location_id === loc.id)
        const balance = movements.reduce((sum, m) => sum + (m.movement_type === 'Entrada' ? m.quantity : -m.quantity), 0)
        balances.push({
          product_id: product.id, product_name: product.name, product_unit: product.unit,
          stock_location_id: loc.id, stock_location_name: loc.name, balance
        })
      }
    }
    return balances
  }
  const { data, error } = await supabase.from('stock_balances').select('*')
  if (error) throw error
  return data as StockBalance[]
}

// ---------- Configurações: Perfis de acesso ----------
export async function listRolePermissions(): Promise<RolePermissions[]> {
  if (isDemoMode) return demoState.rolePermissions
  const { data, error } = await supabase.from('role_permissions').select('*')
  if (error) throw error
  return data as RolePermissions[]
}

export async function updateRolePermission(
  role: RolePermissions['role'],
  patch: Partial<Omit<RolePermissions, 'role' | 'updated_at'>>
): Promise<RolePermissions> {
  if (isDemoMode) {
    const idx = demoState.rolePermissions.findIndex((r) => r.role === role)
    if (idx >= 0) {
      demoState.rolePermissions[idx] = { ...demoState.rolePermissions[idx], ...patch, updated_at: new Date().toISOString() }
      return demoState.rolePermissions[idx]
    }
    throw new Error('Perfil não encontrado')
  }
  const { data, error } = await supabase.from('role_permissions')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('role', role).select().single()
  if (error) throw error
  return data as RolePermissions
}

// ---------- Configurações: Categorias de despesa ----------
export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  if (isDemoMode) return demoState.expenseCategories
  const { data, error } = await supabase.from('expense_categories').select('*').order('name')
  if (error) throw error
  return data as ExpenseCategory[]
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  if (isDemoMode) {
    const category: ExpenseCategory = { id: uid('ec'), name }
    demoState.expenseCategories.push(category)
    return category
  }
  const { data, error } = await supabase.from('expense_categories').insert({ name }).select().single()
  if (error) throw error
  return data as ExpenseCategory
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  if (isDemoMode) {
    demoState.expenseCategories = demoState.expenseCategories.filter((c) => c.id !== id)
    return
  }
  const { error } = await supabase.from('expense_categories').delete().eq('id', id)
  if (error) throw error
}

// ---------- Configurações: Formas de pagamento ----------
export async function listPaymentMethods(): Promise<PaymentMethodOption[]> {
  if (isDemoMode) return demoState.paymentMethods
  const { data, error } = await supabase.from('payment_methods').select('*').order('name')
  if (error) throw error
  return data as PaymentMethodOption[]
}

export async function createPaymentMethod(name: string): Promise<PaymentMethodOption> {
  if (isDemoMode) {
    const method: PaymentMethodOption = { id: uid('pm'), name }
    demoState.paymentMethods.push(method)
    return method
  }
  const { data, error } = await supabase.from('payment_methods').insert({ name }).select().single()
  if (error) throw error
  return data as PaymentMethodOption
}

export async function deletePaymentMethod(id: string): Promise<void> {
  if (isDemoMode) {
    demoState.paymentMethods = demoState.paymentMethods.filter((m) => m.id !== id)
    return
  }
  const { error } = await supabase.from('payment_methods').delete().eq('id', id)
  if (error) throw error
}

// ---------- Configurações: Níveis da colmeia ----------
export async function listHiveLevelsConfig(): Promise<HiveLevelConfig[]> {
  if (isDemoMode) return [...demoState.hiveLevels].sort((a, b) => a.sort_order - b.sort_order)
  const { data, error } = await supabase.from('hive_levels').select('*').order('sort_order')
  if (error) throw error
  return data as HiveLevelConfig[]
}

export async function updateHiveLevel(id: string, patch: Partial<HiveLevelConfig>): Promise<HiveLevelConfig> {
  if (isDemoMode) {
    const idx = demoState.hiveLevels.findIndex((l) => l.id === id)
    if (idx >= 0) {
      demoState.hiveLevels[idx] = { ...demoState.hiveLevels[idx], ...patch }
      return demoState.hiveLevels[idx]
    }
    throw new Error('Nível não encontrado')
  }
  const { data, error } = await supabase.from('hive_levels').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as HiveLevelConfig
}

// ---------- Configurações: Medalhas ----------
export async function listBadgeDefsConfig(): Promise<BadgeDefConfig[]> {
  if (isDemoMode) return demoState.badgeDefs
  const { data, error } = await supabase.from('badge_defs').select('*')
  if (error) throw error
  return data as BadgeDefConfig[]
}

export async function updateBadgeDef(id: string, patch: Partial<BadgeDefConfig>): Promise<BadgeDefConfig> {
  if (isDemoMode) {
    const idx = demoState.badgeDefs.findIndex((b) => b.id === id)
    if (idx >= 0) {
      demoState.badgeDefs[idx] = { ...demoState.badgeDefs[idx], ...patch }
      return demoState.badgeDefs[idx]
    }
    throw new Error('Medalha não encontrada')
  }
  const { data, error } = await supabase.from('badge_defs').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as BadgeDefConfig
}

// ---------- Configurações: Dados gerais da Beetz ----------
export async function getAppSettings(): Promise<AppSettings> {
  if (isDemoMode) return demoState.appSettings
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', true).maybeSingle()
  if (error) throw error
  return (data as AppSettings) ?? mockAppSettings
}

export async function updateAppSettings(patch: Partial<Omit<AppSettings, 'id' | 'updated_at'>>): Promise<AppSettings> {
  if (isDemoMode) {
    demoState.appSettings = { ...demoState.appSettings, ...patch, updated_at: new Date().toISOString() }
    return demoState.appSettings
  }
  const { data, error } = await supabase.from('app_settings')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', true).select().single()
  if (error) throw error
  return data as AppSettings
}

// ---------- Fornecedores ----------
export async function listSuppliers(): Promise<Supplier[]> {
  if (isDemoMode) return demoState.suppliers
  const { data, error } = await supabase.from('suppliers').select('*').order('name')
  if (error) throw error
  return data as Supplier[]
}

export async function createSupplier(name: string, contact: string | null): Promise<Supplier> {
  if (isDemoMode) {
    const supplier: Supplier = { id: uid('sup'), name, contact, created_at: new Date().toISOString() }
    demoState.suppliers.push(supplier)
    return supplier
  }
  const { data, error } = await supabase.from('suppliers').insert({ name, contact }).select().single()
  if (error) throw error
  return data as Supplier
}

// ---------- Produtos do evento ----------
export type NewEventProductInput = Omit<EventProduct, 'id' | 'created_at' | 'total'>

export async function listEventProducts(eventId: string): Promise<EventProduct[]> {
  if (isDemoMode) return demoState.eventProducts.filter((p) => p.event_id === eventId)
  const { data, error } = await supabase.from('event_products').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
  if (error) throw error
  return data as EventProduct[]
}

export async function createEventProduct(input: NewEventProductInput): Promise<EventProduct> {
  if (isDemoMode) {
    const total = input.quantity * input.unit_price
    const record: EventProduct = { ...input, id: uid('ep'), total, created_at: new Date().toISOString() }
    demoState.eventProducts.push(record)
    return record
  }
  const { data, error } = await supabase.from('event_products').insert(input).select().single()
  if (error) throw error
  return data as EventProduct
}

// ---------- Consumo da produção ----------
export type NewProductionConsumptionInput = Omit<ProductionConsumption, 'id' | 'created_at' | 'total_cost'>

export async function listProductionConsumption(eventId: string): Promise<ProductionConsumption[]> {
  if (isDemoMode) return demoState.productionConsumption.filter((c) => c.event_id === eventId)
  const { data, error } = await supabase.from('production_consumption').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
  if (error) throw error
  return data as ProductionConsumption[]
}

export async function createProductionConsumption(input: NewProductionConsumptionInput): Promise<ProductionConsumption> {
  if (isDemoMode) {
    const total_cost = input.quantity * input.unit_cost
    const record: ProductionConsumption = { ...input, id: uid('pc'), total_cost, created_at: new Date().toISOString() }
    demoState.productionConsumption.push(record)
    return record
  }
  const { data, error } = await supabase.from('production_consumption').insert(input).select().single()
  if (error) throw error
  return data as ProductionConsumption
}

// ---------- Transferências solicitadas pela produção ----------
export type NewTransferRequestInput = Omit<TransferRequest, 'id' | 'created_at' | 'status'>

export async function listTransferRequests(eventId: string): Promise<TransferRequest[]> {
  if (isDemoMode) return demoState.transferRequests.filter((t) => t.event_id === eventId)
  const { data, error } = await supabase.from('transfer_requests').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
  if (error) throw error
  return data as TransferRequest[]
}

export async function createTransferRequest(input: NewTransferRequestInput): Promise<TransferRequest> {
  if (isDemoMode) {
    const record: TransferRequest = { ...input, id: uid('tr'), status: 'Pendente', created_at: new Date().toISOString() }
    demoState.transferRequests.push(record)
    return record
  }
  const { data, error } = await supabase.from('transfer_requests').insert({ ...input, status: 'Pendente' }).select().single()
  if (error) throw error
  return data as TransferRequest
}

export async function updateTransferRequestStatus(id: string, status: TransferRequestStatus): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.transferRequests.findIndex((t) => t.id === id)
    if (idx >= 0) demoState.transferRequests[idx] = { ...demoState.transferRequests[idx], status }
    return
  }
  const { error } = await supabase.from('transfer_requests').update({ status }).eq('id', id)
  if (error) throw error
}

// ---------- Fechamento financeiro do evento (visão diretoria) ----------
export async function getEventFinancialSummary(eventId: string): Promise<EventFinancialSummary> {
  const [expenses, eventProducts, consumption, event] = await Promise.all([
    listExpensesForEvent(eventId),
    listEventProducts(eventId),
    listProductionConsumption(eventId),
    getEventById(eventId)
  ])

  const despesas = expenses.reduce((sum, e) => sum + e.total, 0)
  const custoProdutos = eventProducts.reduce((sum, p) => sum + p.total, 0)
  const consumoProducao = consumption.reduce((sum, c) => sum + c.total_cost, 0)

  const vendas = event?.sales_amount ?? 0
  const percentual = event?.commission_percentage ?? 0
  const creditosOuBonificacoes = event?.credits_bonus ?? 0
  const repasses = event?.repasses ?? 0

  const aReceber = vendas * (percentual / 100)
  const saldoAReceberDaProdutora = aReceber + creditosOuBonificacoes - repasses
  const lucroOuPerda = aReceber + creditosOuBonificacoes - despesas - custoProdutos - consumoProducao

  return {
    despesas, custoProdutos, consumoProducao, vendas, percentual, aReceber,
    creditosOuBonificacoes, repasses, saldoAReceberDaProdutora, lucroOuPerda
  }
}
