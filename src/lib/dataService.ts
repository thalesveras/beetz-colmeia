import { isDemoMode, supabase } from './supabaseClient'
import {
  mockAppSettings, mockBadgeDefConfigs, mockBadges, mockCashierSettlements, mockCompliments,
  mockDepartments, mockEventMembers, mockEventModalities, mockEventProducts, mockEvents,
  mockEventStaffingRequirements, mockExpenseCategories, mockExpenses, mockHiveLevelConfigs,
  mockHoneyPoints, mockPaymentMethods, mockProducers, mockProductionConsumption, mockProducts,
  mockProfiles, mockRolePermissions, mockServiceModalities, mockStockLocations, mockStockMovements,
  mockSuppliers, mockTransferRequests
} from './mockData'
import { badgesFromStats, getHiveLevel } from './levels'
import type {
  AppSettings, Badge, BadgeDefConfig, CashierSettlement, Compliment, Department, EventFinancialSummary,
  EventItem, EventMember, EventModality, EventProduct, EventStaffingRequirement, Expense,
  ExpenseCategory, HiveLevelConfig, HoneyPoint, MovementType, PaymentMethodOption, Product,
  ProductionConsumption, Producer, Profile, ProfileStats, RolePermissions, ServiceModality,
  PendingProfileDirectoryItem, PendingProfilePickerItem, StockBalance, StockLocation, StockMovement,
  Supplier, TransferRequest, TransferRequestStatus, ZohoPendingProfile
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
  transferRequests: [...mockTransferRequests],
  producers: [...mockProducers],
  serviceModalities: [...mockServiceModalities],
  eventModalities: [...mockEventModalities],
  eventStaffingRequirements: [...mockEventStaffingRequirements]
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
// A Turma e os seletores de escalação só mostram gente com o perfil completo
// E já aprovada pela Diretoria — quem está pendente ainda não aparece pra equipe.
export async function listProfiles(): Promise<Profile[]> {
  if (isDemoMode) return demoState.profiles.filter((p) => p.onboarding_completed && p.approval_status === 'Aprovado')
  const { data, error } = await supabase.from('profiles').select('*')
    .eq('onboarding_completed', true).eq('approval_status', 'Aprovado')
  if (error) throw error
  return data as Profile[]
}

export async function listPendingProfiles(): Promise<Profile[]> {
  if (isDemoMode) return demoState.profiles.filter((p) => p.onboarding_completed && p.approval_status === 'Pendente')
  const { data, error } = await supabase.from('profiles').select('*')
    .eq('onboarding_completed', true).eq('approval_status', 'Pendente')
  if (error) throw error
  return data as Profile[]
}

export async function setProfileApproval(profileId: string, status: 'Aprovado' | 'Rejeitado'): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.profiles.findIndex((p) => p.id === profileId)
    if (idx >= 0) demoState.profiles[idx] = { ...demoState.profiles[idx], approval_status: status }
    return
  }
  const { error } = await supabase.from('profiles').update({ approval_status: status }).eq('id', profileId)
  if (error) throw error
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
    const dept = demoState.departments.find((d) => d.id === departmentId)
    if (idx >= 0) {
      demoState.profiles[idx] = {
        ...demoState.profiles[idx],
        department_id: departmentId,
        // Promover alguém pra Diretoria já aprova a pessoa automaticamente.
        approval_status: dept?.slug === 'diretoria' ? 'Aprovado' : demoState.profiles[idx].approval_status
      }
    }
    return
  }
  const { data: dept } = await supabase.from('departments').select('slug').eq('id', departmentId).maybeSingle()
  const patch: Partial<Profile> = { department_id: departmentId }
  if (dept?.slug === 'diretoria') patch.approval_status = 'Aprovado'
  const { error } = await supabase.from('profiles').update(patch).eq('id', profileId)
  if (error) throw error
}

// Tenta casar o e-mail de quem está se cadastrando com um perfil pré-importado
// (hoje, do histórico do Zoho) e, se achar, pré-preenche o perfil recém-criado
// com esses dados — a pessoa só revisa e confirma no /cadastro, em vez de
// digitar tudo do zero. Não existe staging em modo demo, então isso é um no-op.
export async function claimPendingProfile(userId: string, email: string): Promise<void> {
  if (isDemoMode || !email) return
  const { error } = await supabase.rpc('claim_pending_profile', { p_user_id: userId, p_email: email })
  if (error) console.error('Falha ao casar perfil pendente:', error)
}

export interface ImportZohoPendingResult {
  totalRows: number
  imported: number
  skippedNoEmail: number
  skippedAlreadyClaimed: number
}

// Usado pelo Importador de perfis (Configurações). Recebe linhas já mapeadas
// e limpas (ver ProfileImporterSection) e grava em zoho_pending_profiles —
// nunca mexe direto em `profiles`. Uma pessoa cujo e-mail já foi reivindicado
// (ela já se cadastrou e o cadastro dela já puxou esses dados uma vez) é
// pulada, pra não sobrescrever nada que a pessoa já tenha revisado/editado.
export async function importZohoPendingProfiles(rows: Partial<ZohoPendingProfile>[]): Promise<ImportZohoPendingResult> {
  const withEmail = rows.filter((r) => !!r.email)
  const skippedNoEmail = rows.length - withEmail.length

  if (isDemoMode) {
    return { totalRows: rows.length, imported: withEmail.length, skippedNoEmail, skippedAlreadyClaimed: 0 }
  }

  const emails = withEmail.map((r) => (r.email as string).toLowerCase())
  const { data: claimed, error: claimedError } = await supabase
    .from('zoho_pending_profiles')
    .select('email')
    .in('email', emails)
    .not('claimed_at', 'is', null)
  if (claimedError) throw claimedError

  const claimedSet = new Set((claimed ?? []).map((r: any) => r.email))
  const toUpsert = withEmail.filter((r) => !claimedSet.has((r.email as string).toLowerCase()))
    .map((r) => ({ ...r, email: (r.email as string).toLowerCase() }))

  if (toUpsert.length > 0) {
    const { error } = await supabase.from('zoho_pending_profiles').upsert(toUpsert, { onConflict: 'email' })
    if (error) throw error
  }

  return {
    totalRows: rows.length,
    imported: toUpsert.length,
    skippedNoEmail,
    skippedAlreadyClaimed: claimedSet.size
  }
}

export interface ZohoPendingProfilesStats {
  total: number
  claimed: number
  waiting: number
}

// Contagem "ao vivo" de zoho_pending_profiles, direto do banco — não depende
// do resultado da última sincronização/importação, que só mostra o que
// aconteceu naquela rodada específica. Serve pra Diretoria conferir a
// qualquer momento quantos pré-cadastros existem no total e quantos já
// viraram perfil de verdade (claimed_at preenchido).
export async function getZohoPendingProfilesStats(): Promise<ZohoPendingProfilesStats> {
  if (isDemoMode) {
    return { total: 0, claimed: 0, waiting: 0 }
  }
  const { count: total, error: totalError } = await supabase
    .from('zoho_pending_profiles')
    .select('*', { count: 'exact', head: true })
  if (totalError) throw totalError

  const { count: claimed, error: claimedError } = await supabase
    .from('zoho_pending_profiles')
    .select('*', { count: 'exact', head: true })
    .not('claimed_at', 'is', null)
  if (claimedError) throw claimedError

  const totalCount = total ?? 0
  const claimedCount = claimed ?? 0
  return { total: totalCount, claimed: claimedCount, waiting: totalCount - claimedCount }
}

export interface SyncZohoCreatorResult {
  totalFetched: number
  imported: number
  skippedNoEmail: number
  skippedAlreadyClaimed: number
}

// O cliente do supabase-js só lança "Edge Function returned a non-2xx status
// code" por padrão quando a function responde com erro — a mensagem de verdade
// (que a nossa function manda no corpo JSON) fica em error.context, que é o
// Response bruto e precisa ser lido à parte.
async function extractFunctionErrorMessage(error: any): Promise<string> {
  const ctx = error?.context
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const body = await ctx.clone().json()
      if (body?.error) return body.error
    } catch {
      try {
        const text = await ctx.clone().text()
        if (text) return text
      } catch {
        // segue pro fallback abaixo
      }
    }
  }
  return error?.message ?? 'Erro desconhecido ao chamar a Edge Function.'
}

// Puxa direto da API do Zoho Creator (relatório Equipe) em vez de depender de
// export manual de CSV. A troca de token e a chamada à API do Zoho acontecem
// na Edge Function zoho-creator-sync (os secrets do Zoho não passam pelo navegador).
export async function syncZohoCreator(): Promise<SyncZohoCreatorResult> {
  if (isDemoMode) {
    return { totalFetched: 0, imported: 0, skippedNoEmail: 0, skippedAlreadyClaimed: 0 }
  }
  const { data, error } = await supabase.functions.invoke('zoho-creator-sync', { body: {} })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data
}

export interface ZohoFieldInfo {
  link_name: string
  display_name: string
  type: number
}

// Modo diagnóstico: só lista os campos reais do formulário (ex: "Adicionar_equipe")
// no Zoho Creator, sem gravar nada — usado pra conferir/corrigir o mapeamento
// fixo no código da Edge Function antes de rodar a sincronização de verdade.
export async function inspectZohoCreatorFields(formLinkName?: string): Promise<{ formLinkName: string; fields: ZohoFieldInfo[] }> {
  if (isDemoMode) {
    return { formLinkName: formLinkName ?? 'Adicionar_equipe', fields: [] }
  }
  const { data, error } = await supabase.functions.invoke('zoho-creator-sync', {
    body: { inspect: true, form_link_name: formLinkName }
  })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data
}

export interface ImportPendingPhotosBatchResult {
  mode: 'avatar' | 'document'
  processed: number
  succeeded: number
  failed: number
  remaining: number
}

// Processa um lote de fotos (de perfil ou de documento) do pré-cadastro:
// baixa da fonte externa e sobe pro nosso Storage (avatars é público,
// documents é privado — ver import-pending-photos). Chamar repetidas vezes
// até remaining chegar a 0 é o que dá o efeito "por etapas" na UI.
export async function importPendingPhotosBatch(
  mode: 'avatar' | 'document', batchSize = 50
): Promise<ImportPendingPhotosBatchResult> {
  if (isDemoMode) {
    return { mode, processed: 0, succeeded: 0, failed: 0, remaining: 0 }
  }
  const { data, error } = await supabase.functions.invoke('import-pending-photos', {
    body: { mode, batchSize }
  })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data
}

// Link assinado de curta duração (5min) pra foto de documento de UMA pessoa
// — nunca fica salvo em lugar nenhum, é gerado sob demanda só quando a
// Diretoria pede pra ver aquela pessoa específica.
export async function getPendingDocumentSignedUrl(pendingProfileId: string): Promise<{ url: string; expiresInSeconds: number }> {
  const { data, error } = await supabase.functions.invoke('get-pending-document-url', {
    body: { id: pendingProfileId }
  })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data
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
      approval_status: 'Pendente', created_at: new Date().toISOString(), ...profile
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
  credits_bonus: 0, repasses: 0,
  producer_id: null, contract_status: 'Rascunho' as const, zapsign_doc_token: null,
  zapsign_signer_token: null, zapsign_sign_url: null, signed_file_url: null, contract_signed_at: null
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

// Escalação direta (feita por Diretoria/líder) — o vínculo já nasce Aprovado.
export async function addEventMember(eventId: string, profileId: string, roleInEvent: string): Promise<EventMember> {
  if (isDemoMode) {
    const newMember: EventMember = {
      id: uid('m'), event_id: eventId, profile_id: profileId, role_in_event: roleInEvent,
      status: 'Aprovado', created_at: new Date().toISOString()
    }
    demoState.eventMembers.push(newMember)
    return newMember
  }
  const { data, error } = await supabase.from('event_members')
    .insert({ event_id: eventId, profile_id: profileId, role_in_event: roleInEvent, status: 'Aprovado' }).select().single()
  if (error) throw error
  return data as EventMember
}

// Pedido de participação feito pelo próprio colaborador — nasce Pendente até
// a Diretoria aprovar.
export async function requestEventParticipation(eventId: string, profileId: string, roleInEvent: string): Promise<EventMember> {
  if (isDemoMode) {
    const newMember: EventMember = {
      id: uid('m'), event_id: eventId, profile_id: profileId, role_in_event: roleInEvent,
      status: 'Pendente', created_at: new Date().toISOString()
    }
    demoState.eventMembers.push(newMember)
    return newMember
  }
  const { data, error } = await supabase.from('event_members')
    .insert({ event_id: eventId, profile_id: profileId, role_in_event: roleInEvent, status: 'Pendente' }).select().single()
  if (error) throw error
  return data as EventMember
}

export async function updateEventMemberStatus(id: string, status: EventMember['status']): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.eventMembers.findIndex((m) => m.id === id)
    if (idx >= 0) demoState.eventMembers[idx] = { ...demoState.eventMembers[idx], status }
    return
  }
  const { error } = await supabase.from('event_members').update({ status }).eq('id', id)
  if (error) throw error
}

// Conta como "evento da pessoa" (pra gamificação e listagens) só quem já
// teve a participação Aprovada — pedido pendente ainda não conta.
export async function listEventsForProfile(profileId: string): Promise<EventItem[]> {
  const allMembers = isDemoMode
    ? demoState.eventMembers.filter((m) => m.profile_id === profileId && m.status === 'Aprovado')
    : (await supabase.from('event_members').select('*').eq('profile_id', profileId).eq('status', 'Aprovado')).data ?? []
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

// Todas as despesas, de todos os eventos — usado na visão financeira global
// (/financeiro), que cruza com listEvents() pra filtrar por mês/produtor/evento.
export async function listAllExpenses(): Promise<Expense[]> {
  if (isDemoMode) {
    return [...demoState.expenses].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }
  const { data, error } = await supabase.from('expenses').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as Expense[]
}

// Lista enxuta (sem CPF/telefone/etc.) de quem ainda não se cadastrou, pra
// usar no seletor de "Equipe" das Despesas. Qualquer colaborador logado pode
// chamar isso (a function no banco confere is_staff), diferente da tabela
// zoho_pending_profiles completa, que continua só-Diretoria.
export async function listPendingProfilesForPicker(): Promise<PendingProfilePickerItem[]> {
  if (isDemoMode) return []
  const { data, error } = await supabase.rpc('list_pending_profiles_for_picker')
  if (error) throw error
  return (data ?? []) as PendingProfilePickerItem[]
}

// Igual ao picker acima, mas com cidade/cargo/departamento/foto — usado pra
// mostrar pré-cadastro na Turma e no Mapa da Colmeia (qualquer colaborador
// com perfil pode ver, a function no banco confere is_staff).
export async function listPendingProfilesForDirectory(): Promise<PendingProfileDirectoryItem[]> {
  if (isDemoMode) return []
  const { data, error } = await supabase.rpc('list_pending_profiles_for_directory')
  if (error) throw error
  return (data ?? []) as PendingProfileDirectoryItem[]
}

// Mesma tradução usada pela function claim_pending_profile() no banco — o
// texto cru do dropdown do Zoho ("Garçons"/"Caixas"/"Operacional") pro slug
// de departamento da Beetz. Mantém as duas em sincronia se algum dia mudar.
export function pendingDepartmentHintToSlug(hint: string | null): string | null {
  switch ((hint ?? '').trim()) {
    case 'Garçons': return 'garcons'
    case 'Caixas': return 'caixa'
    case 'Operacional': return 'bar'
    default: return null
  }
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

// Edição de conteúdo da despesa (categoria, valores, fornecedor etc.) — "excluir"
// uma despesa na prática é trocar o status pra Cancelado (mantém o histórico).
export async function updateExpense(id: string, patch: Partial<Omit<Expense, 'id' | 'created_at' | 'event_id' | 'total'>>): Promise<Expense> {
  if (isDemoMode) {
    const idx = demoState.expenses.findIndex((e) => e.id === id)
    if (idx < 0) throw new Error('Despesa não encontrada')
    const updated = { ...demoState.expenses[idx], ...patch }
    updated.total = updated.quantity * updated.unit_value + updated.dex_fee
    demoState.expenses[idx] = updated
    return updated
  }
  const { data, error } = await supabase.from('expenses').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Expense
}

// ---------- Recebimentos (caixas) ----------
export type NewCashierSettlementInput = Omit<CashierSettlement, 'id' | 'created_at' | 'total' | 'commission_amount' | 'status'>

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
    const settlement: CashierSettlement = { ...input, id: uid('cs'), total, commission_amount, status: 'Pendente', created_at: new Date().toISOString() }
    demoState.cashierSettlements.push(settlement)
    return settlement
  }
  const { data, error } = await supabase.from('cashier_settlements').insert({ ...input, status: 'Pendente' }).select().single()
  if (error) throw error
  return data as CashierSettlement
}

export async function updateCashierSettlementStatus(id: string, status: CashierSettlement['status']): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.cashierSettlements.findIndex((c) => c.id === id)
    if (idx >= 0) demoState.cashierSettlements[idx] = { ...demoState.cashierSettlements[idx], status }
    return
  }
  const { error } = await supabase.from('cashier_settlements').update({ status }).eq('id', id)
  if (error) throw error
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

export async function updateStockLocation(id: string, patch: Partial<Pick<StockLocation, 'name' | 'description'>>): Promise<StockLocation> {
  if (isDemoMode) {
    const idx = demoState.stockLocations.findIndex((l) => l.id === id)
    if (idx < 0) throw new Error('Estoque não encontrado')
    demoState.stockLocations[idx] = { ...demoState.stockLocations[idx], ...patch }
    return demoState.stockLocations[idx]
  }
  const { data, error } = await supabase.from('stock_locations').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as StockLocation
}

// Só deixa excluir um estoque/almoxarifado se não houver nenhuma movimentação
// (ativa ou cancelada) vinculada a ele — evita órfãos no histórico.
export async function deleteStockLocation(id: string): Promise<void> {
  const movements = await listStockMovements()
  if (movements.some((m) => m.stock_location_id === id)) {
    throw new Error('Não é possível excluir: este estoque já tem movimentações registradas.')
  }
  if (isDemoMode) {
    demoState.stockLocations = demoState.stockLocations.filter((l) => l.id !== id)
    return
  }
  const { error } = await supabase.from('stock_locations').delete().eq('id', id)
  if (error) throw error
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

export async function updateProduct(id: string, patch: Partial<Pick<Product, 'name' | 'unit' | 'category'>>): Promise<Product> {
  if (isDemoMode) {
    const idx = demoState.products.findIndex((p) => p.id === id)
    if (idx < 0) throw new Error('Produto não encontrado')
    demoState.products[idx] = { ...demoState.products[idx], ...patch }
    return demoState.products[idx]
  }
  const { data, error } = await supabase.from('products').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Product
}

// Mesma lógica de guarda do estoque: produto com histórico de movimentação não
// pode ser excluído (edite o cadastro em vez disso).
export async function deleteProduct(id: string): Promise<void> {
  const movements = await listStockMovements()
  if (movements.some((m) => m.product_id === id)) {
    throw new Error('Não é possível excluir: este produto já tem movimentações registradas.')
  }
  if (isDemoMode) {
    demoState.products = demoState.products.filter((p) => p.id !== id)
    return
  }
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
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
    const movement: StockMovement = { ...input, id: uid('sm'), status: 'Ativo', created_at: new Date().toISOString() }
    demoState.stockMovements.push(movement)
    return movement
  }
  const { data, error } = await supabase.from('stock_movements').insert({ ...input, status: 'Ativo' }).select().single()
  if (error) throw error
  return data as StockMovement
}

// Edição de uma movimentação (quantidade, tipo etc.) — "excluir" na prática é
// trocar o status pra Cancelado, que fica fora do saldo mas continua no histórico.
export async function updateStockMovement(id: string, patch: Partial<Omit<StockMovement, 'id' | 'created_at'>>): Promise<StockMovement> {
  if (isDemoMode) {
    const idx = demoState.stockMovements.findIndex((m) => m.id === id)
    if (idx < 0) throw new Error('Movimentação não encontrada')
    demoState.stockMovements[idx] = { ...demoState.stockMovements[idx], ...patch }
    return demoState.stockMovements[idx]
  }
  const { data, error } = await supabase.from('stock_movements').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as StockMovement
}

export async function getStockBalances(): Promise<StockBalance[]> {
  if (isDemoMode) {
    const balances: StockBalance[] = []
    for (const product of demoState.products) {
      for (const loc of demoState.stockLocations) {
        const movements = demoState.stockMovements.filter(
          (m) => m.product_id === product.id && m.stock_location_id === loc.id && m.status !== 'Cancelado'
        )
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

  const despesas = expenses.filter((e) => e.status !== 'Cancelado').reduce((sum, e) => sum + e.total, 0)
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

// ---------- Portal do produtor: contas ----------
export async function getProducerById(id: string): Promise<Producer | null> {
  if (isDemoMode) return demoState.producers.find((p) => p.id === id) ?? null
  const { data, error } = await supabase.from('producers').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Producer | null
}

export async function upsertProducer(producer: Partial<Producer> & { id: string }): Promise<Producer> {
  if (isDemoMode) {
    const idx = demoState.producers.findIndex((p) => p.id === producer.id)
    if (idx >= 0) {
      demoState.producers[idx] = { ...demoState.producers[idx], ...producer }
      return demoState.producers[idx]
    }
    const blank: Producer = {
      id: producer.id, name: '', company_name: null, cpf_cnpj: null, phone: null,
      email: producer.email ?? '', created_at: new Date().toISOString(), ...producer
    }
    demoState.producers.push(blank)
    return blank
  }
  const { data, error } = await supabase.from('producers').upsert(producer).select().single()
  if (error) throw error
  return data as Producer
}

// ---------- Eventos vistos/criados pelo produtor ----------
export async function listEventsForProducer(producerId: string): Promise<EventItem[]> {
  if (isDemoMode) {
    return [...demoState.events].filter((e) => e.producer_id === producerId).sort((a, b) => (a.event_date < b.event_date ? 1 : -1))
  }
  const { data, error } = await supabase.from('events').select('*').eq('producer_id', producerId).order('event_date', { ascending: false })
  if (error) throw error
  return data as EventItem[]
}

// O produtor monta a proposta sozinho — cria o próprio evento (rascunho) vinculado à sua conta.
export async function createEventAsProducer(producerId: string, event: NewEventInput): Promise<EventItem> {
  return createEvent({ ...event, producer_id: producerId, contract_status: 'Rascunho' })
}

// ---------- Configurações: modalidades de serviço ----------
export async function listServiceModalities(): Promise<ServiceModality[]> {
  if (isDemoMode) return [...demoState.serviceModalities].sort((a, b) => a.sort_order - b.sort_order)
  const { data, error } = await supabase.from('service_modalities').select('*').order('sort_order')
  if (error) throw error
  return data as ServiceModality[]
}

export type NewServiceModalityInput = Omit<ServiceModality, 'id' | 'created_at'>

export async function createServiceModality(input: NewServiceModalityInput): Promise<ServiceModality> {
  if (isDemoMode) {
    const modality: ServiceModality = { ...input, id: uid('svc'), created_at: new Date().toISOString() }
    demoState.serviceModalities.push(modality)
    return modality
  }
  const { data, error } = await supabase.from('service_modalities').insert(input).select().single()
  if (error) throw error
  return data as ServiceModality
}

export async function updateServiceModality(id: string, patch: Partial<NewServiceModalityInput>): Promise<ServiceModality> {
  if (isDemoMode) {
    const idx = demoState.serviceModalities.findIndex((m) => m.id === id)
    if (idx < 0) throw new Error('Modalidade não encontrada')
    demoState.serviceModalities[idx] = { ...demoState.serviceModalities[idx], ...patch }
    return demoState.serviceModalities[idx]
  }
  const { data, error } = await supabase.from('service_modalities').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as ServiceModality
}

export async function deleteServiceModality(id: string): Promise<void> {
  if (isDemoMode) {
    demoState.serviceModalities = demoState.serviceModalities.filter((m) => m.id !== id)
    return
  }
  const { error } = await supabase.from('service_modalities').delete().eq('id', id)
  if (error) throw error
}

// ---------- Modalidades contratadas por evento ----------
export type NewEventModalityInput = Omit<EventModality, 'id' | 'created_at' | 'total'>

export async function listEventModalities(eventId: string): Promise<EventModality[]> {
  if (isDemoMode) return demoState.eventModalities.filter((m) => m.event_id === eventId)
  const { data, error } = await supabase.from('event_modalities').select('*').eq('event_id', eventId).order('created_at')
  if (error) throw error
  return data as EventModality[]
}

export async function createEventModality(input: NewEventModalityInput): Promise<EventModality> {
  if (isDemoMode) {
    const total = input.quantity * input.unit_price
    const record: EventModality = { ...input, id: uid('em'), total, created_at: new Date().toISOString() }
    demoState.eventModalities.push(record)
    return record
  }
  const { data, error } = await supabase.from('event_modalities').insert(input).select().single()
  if (error) throw error
  return data as EventModality
}

export async function deleteEventModality(id: string): Promise<void> {
  if (isDemoMode) {
    demoState.eventModalities = demoState.eventModalities.filter((m) => m.id !== id)
    return
  }
  const { error } = await supabase.from('event_modalities').delete().eq('id', id)
  if (error) throw error
}

// ---------- Equipe necessária por evento (definida na proposta) ----------
export type NewEventStaffingInput = Omit<EventStaffingRequirement, 'id' | 'created_at'>

export async function listEventStaffingRequirements(eventId: string): Promise<EventStaffingRequirement[]> {
  if (isDemoMode) return demoState.eventStaffingRequirements.filter((s) => s.event_id === eventId)
  const { data, error } = await supabase.from('event_staffing_requirements').select('*').eq('event_id', eventId).order('created_at')
  if (error) throw error
  return data as EventStaffingRequirement[]
}

export async function createEventStaffingRequirement(input: NewEventStaffingInput): Promise<EventStaffingRequirement> {
  if (isDemoMode) {
    const record: EventStaffingRequirement = { ...input, id: uid('esr'), created_at: new Date().toISOString() }
    demoState.eventStaffingRequirements.push(record)
    return record
  }
  const { data, error } = await supabase.from('event_staffing_requirements').insert(input).select().single()
  if (error) throw error
  return data as EventStaffingRequirement
}

export async function deleteEventStaffingRequirement(id: string): Promise<void> {
  if (isDemoMode) {
    demoState.eventStaffingRequirements = demoState.eventStaffingRequirements.filter((s) => s.id !== id)
    return
  }
  const { error } = await supabase.from('event_staffing_requirements').delete().eq('id', id)
  if (error) throw error
}

// ---------- Contrato via ZapSign ----------
// Em modo demo simulamos a criação do documento (não existe ZapSign de verdade
// pra chamar); em produção isso invoca a Edge Function que fala com a API real.
export async function requestContractSignature(eventId: string): Promise<{ sign_url: string | null; doc_token: string }> {
  if (isDemoMode) {
    const idx = demoState.events.findIndex((e) => e.id === eventId)
    if (idx < 0) throw new Error('Evento não encontrado')
    const doc_token = uid('zap')
    const sign_url = `https://app.zapsign.com.br/verificar/${doc_token}`
    demoState.events[idx] = {
      ...demoState.events[idx], contract_status: 'Aguardando assinatura',
      zapsign_doc_token: doc_token, zapsign_sign_url: sign_url
    }
    return { sign_url, doc_token }
  }
  const { data, error } = await supabase.functions.invoke('zapsign-create-contract', { body: { event_id: eventId } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// Atalho manual pra Diretoria confirmar a assinatura sem depender do webhook
// (útil em demo e como plano B enquanto o webhook do ZapSign não está configurado).
export async function markContractSigned(eventId: string): Promise<void> {
  const patch = { contract_status: 'Assinado' as const, contract_signed_at: new Date().toISOString() }
  if (isDemoMode) {
    const idx = demoState.events.findIndex((e) => e.id === eventId)
    if (idx >= 0) demoState.events[idx] = { ...demoState.events[idx], ...patch }
    return
  }
  const { error } = await supabase.from('events').update(patch).eq('id', eventId)
  if (error) throw error
}
