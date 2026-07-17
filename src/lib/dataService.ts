import { isDemoMode, supabase } from './supabaseClient'
import {
  mockAppSettings, mockBadgeDefConfigs, mockBadges, mockCashierSettlements, mockCompliments,
  mockDepartments, mockEventMembers, mockEventModalities, mockEventProducts, mockEventRepasses, mockEvents,
  mockEventStaffingRequirements, mockExpenseCategories, mockExpenses, mockHiveLevelConfigs,
  mockHoneyPoints, mockPaymentMethods, mockProducers, mockProductionConsumption, mockProducts,
  mockProfiles, mockRolePermissions, mockServiceModalities, mockStockLocations, mockStockMovements,
  mockSuppliers, mockTransferRequests
} from './mockData'
import { badgesFromStats, getHiveLevel } from './levels'
import type {
  AppNotification, AppSettings, Badge, BadgeDefConfig, CashierSettlement, Compliment, Department, DnsSubdomain, DnsRecordType,
  EventFinancialSummary,
  EventChangeLogEntry, EventItem, EventMember, EventModality, EventProduct, EventRepasse, EventStaffingApplication, EventStaffingRequirement, Expense,
  ExpenseCategory, ExpenseStatus, HiveLevelConfig, HoneyPoint, LinkRedirect, MovementType, OpenStaffingSlot, PaymentMethodOption, Product,
  ProductionConsumption, Producer, Profile, ProfileStats, RolePermissions, ServiceModality,
  PendingProfileDirectoryItem, PendingProfilePickerItem, PendingProfileSensitive, StaffingApplicationStatus, StockAvailable, StockBalance, StockReservation, ReservationStatus, ProductAvgCost, StockLocation, StockMovement,
  Supplier, TransferRequest, TransferRequestStatus, ZohoPendingProfile, EmailKind, EmailLogEntry
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
  eventStaffingRequirements: [...mockEventStaffingRequirements],
  eventRepasses: [...mockEventRepasses],
  linkRedirects: [] as LinkRedirect[],
  dnsSubdomains: [] as DnsSubdomain[],
  staffingApplications: [] as EventStaffingApplication[],
  notifications: [] as AppNotification[]
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

// Editável pela Diretoria em /configuracoes — troca a que perfil de acesso
// (Diretoria/Garçom/Caixa/Operacional/Colaborador) um departamento aponta.
export async function updateDepartmentAccessRole(departmentId: string, accessRole: string): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.departments.findIndex((d) => d.id === departmentId)
    if (idx >= 0) demoState.departments[idx] = { ...demoState.departments[idx], access_role: accessRole }
    return
  }
  const { error } = await supabase.from('departments').update({ access_role: accessRole }).eq('id', departmentId)
  if (error) throw error
}

// Editar nome/ícone/descrição de um departamento no Mapa da Colmeia — via
// função no banco (update_department_details) em vez de update direto na
// tabela, de propósito: quem só tem a permissão "editar mapa" nunca consegue
// mexer no access_role por aqui (isso continua exclusivo da Diretoria).
export async function updateDepartmentDetails(
  departmentId: string, patch: { name: string; icon: string; description: string }
): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.departments.findIndex((d) => d.id === departmentId)
    if (idx >= 0) demoState.departments[idx] = { ...demoState.departments[idx], ...patch }
    return
  }
  const { error } = await supabase.rpc('update_department_details', {
    dept_id: departmentId, p_name: patch.name, p_icon: patch.icon, p_description: patch.description
  })
  if (error) throw error
}

// ---------- Perfis ----------
// A Turma e os seletores de escalação só mostram gente com o perfil completo
// E já aprovada pela Diretoria — quem está pendente ainda não aparece pra equipe.
// Ordena por nome no banco: sem .order() o Postgres devolve na ordem que for
// mais barata pra ele, que muda sozinha conforme a tabela é escrita. Como 18
// telas leem daqui (e várias viram <select> de gente), ordenar aqui conserta
// todas de uma vez — ordenar em cada tela seria a mesma regra escrita 18 vezes.
export async function listProfiles(): Promise<Profile[]> {
  if (isDemoMode) return demoState.profiles
    .filter((p) => p.onboarding_completed && p.approval_status === 'Aprovado')
    .sort(byProfileName)
  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase.from('profiles').select('*')
      .eq('onboarding_completed', true).eq('approval_status', 'Aprovado')
      .order('first_name', { ascending: true }).order('last_name', { ascending: true })
      .range(from, to)
    if (error) throw error
    return data as Profile[]
  })
}

// pt-BR pra "Álvaro" vir antes de "Bruno" em vez de depois de "Zeca".
function byProfileName(a: { first_name?: string | null; last_name?: string | null }, b: { first_name?: string | null; last_name?: string | null }) {
  const name = (p: { first_name?: string | null; last_name?: string | null }) =>
    `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return name(a).localeCompare(name(b), 'pt-BR')
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

// ---------- Fundo (capa) do perfil ----------
// Vai pro Storage e guardamos só a URL — diferente do avatar, que hoje é salvo
// em base64 direto na coluna. Capa é imagem grande, e listProfiles() faz
// select('*') alimentando Turma/Dashboard/Ranking/Mapa: base64 aqui faria cada
// uma dessas telas baixar megabytes por pessoa.
const COVER_MAX_BYTES = 5 * 1024 * 1024 // o bucket avatars recusa acima disso
const COVER_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export async function uploadProfileCover(userId: string, file: File): Promise<string> {
  if (!COVER_MIME.includes(file.type)) {
    throw new Error('Formato não aceito. Use JPG, PNG, WEBP ou GIF.')
  }
  if (file.size > COVER_MAX_BYTES) {
    throw new Error(`Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). O limite é 5 MB.`)
  }

  if (isDemoMode) {
    const idx = demoState.profiles.findIndex((p) => p.id === userId)
    const fakeUrl = URL.createObjectURL(file)
    if (idx >= 0) demoState.profiles[idx] = { ...demoState.profiles[idx], cover_url: fakeUrl }
    return fakeUrl
  }

  // Caminho fixo + upsert: trocar o fundo sobrescreve o anterior em vez de
  // acumular arquivo órfão a cada troca. Como a URL não muda, o navegador
  // serviria a imagem velha do cache — daí o ?v= no final.
  const path = `${userId}/cover`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = `${pub.publicUrl}?v=${Date.now()}`

  const { error } = await supabase.from('profiles').update({ cover_url: url }).eq('id', userId)
  if (error) throw error
  return url
}

export async function removeProfileCover(userId: string): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.profiles.findIndex((p) => p.id === userId)
    if (idx >= 0) demoState.profiles[idx] = { ...demoState.profiles[idx], cover_url: null }
    return
  }
  // Apaga o arquivo primeiro; se falhar, ainda assim limpamos a referência pra
  // a pessoa não ficar presa com um fundo que não consegue tirar.
  await supabase.storage.from('avatars').remove([`${userId}/cover`])
  const { error } = await supabase.from('profiles').update({ cover_url: null }).eq('id', userId)
  if (error) throw error
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

// Edição de perfil feita pela Diretoria (tela de Administração) — igual à
// edição que a própria pessoa faz no /cadastro, só que qualquer campo pode
// ser corrigido por quem administra o time, não só o dono do perfil.
export async function adminUpdateProfile(profileId: string, patch: Partial<Profile>): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.profiles.findIndex((p) => p.id === profileId)
    if (idx >= 0) demoState.profiles[idx] = { ...demoState.profiles[idx], ...patch }
    return
  }
  const { error } = await supabase.from('profiles').update(patch).eq('id', profileId)
  if (error) throw error
}

// Apaga de vez a conta (auth + perfil, via Edge Function com service role).
// Não dá pra fazer isso com a chave anon direto no cliente — apagar uma conta
// de autenticação exige privilégio de admin, por isso passa pela function.
export async function adminDeleteProfile(profileId: string): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.profiles.findIndex((p) => p.id === profileId)
    if (idx >= 0) demoState.profiles.splice(idx, 1)
    return
  }
  const { data, error } = await supabase.functions.invoke('admin-delete-profile', { body: { id: profileId } })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
}

export interface InviteTeamMemberInput {
  email: string
  first_name: string
  last_name: string
  role_hint?: string
  department_hint?: string
}

// "Convidar para o time" reaproveita a mesma engrenagem do importador de
// CSV/Zoho: cria um pré-cadastro (zoho_pending_profiles) pra essa pessoa.
// Não dispara nenhum e-mail — quando ela entrar no app com Google usando
// esse mesmo endereço, o cadastro dela já nasce preenchido e liberado.
export async function inviteTeamMember(input: InviteTeamMemberInput): Promise<void> {
  await importZohoPendingProfiles([{
    email: input.email.trim().toLowerCase(),
    first_name: input.first_name.trim() || null,
    last_name: input.last_name.trim() || null,
    role_hint: input.role_hint?.trim() || null,
    department_hint: input.department_hint?.trim() || null,
    cpf: null, phone: null, mother_name: null, father_name: null, city: null, state: null,
    avatar_url: null, about_me: null, fun_fact: null, favorite_events: null, instagram: null,
    personal_quote: null, skills: [], work_location: null, experience_level: null, entry_date: null,
    zoho_record_id: null
  }])
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

export interface ZohoMetaItem {
  display_name: string
  link_name: string
  type?: string
}

// Modo de descoberta: lista todos os formulários e relatórios que existem no
// app "controle" do Zoho Creator (só leitura, não grava nada). Serve pra
// descobrir os nomes certos de Eventos/Despesas/etc antes de configurar uma
// nova importação, sem precisar adivinhar ou pedir pro Zoho na mão.
export async function listZohoMeta(): Promise<{ forms: ZohoMetaItem[]; reports: ZohoMetaItem[] }> {
  if (isDemoMode) return { forms: [], reports: [] }
  const { data, error } = await supabase.functions.invoke('zoho-creator-sync', { body: { list_meta: true } })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data
}

export interface ZohoReportPeek {
  reportLinkName: string
  records: Record<string, unknown>[]
  fieldNames: string[]
}

// Pré-visualização de um relatório qualquer do Zoho Creator (poucos registros,
// sem gravar nada) — usado pra entender o formato de um relatório novo antes
// de decidir se/como importar (ex: "Lista_de_transferencias").
export async function peekZohoReport(reportLinkName: string, maxRecords = 5): Promise<ZohoReportPeek> {
  if (isDemoMode) return { reportLinkName, records: [], fieldNames: [] }
  const { data, error } = await supabase.functions.invoke('zoho-creator-sync', {
    body: { peek: true, report_link_name: reportLinkName, max_records: maxRecords }
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
      approval_status: 'Aprovado', created_at: new Date().toISOString(), ...profile
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

// ---------- Dashboard financeiro ----------
// Junta despesa + evento + fornecedor + pessoa numa linha só, pronta pra
// filtrar e agrupar na tela sem ficar cruzando array em toda renderização.
//
// Sobre a data: NÃO usamos expenses.created_at como eixo de tempo. Esse campo
// é o momento em que a linha entrou no banco — e como as 85 despesas vieram
// de uma importação única do Zoho, todas têm o mesmo dia (07/07). Agrupar por
// ele empilharia tudo num mês só e mentiria. Usamos a data do EVENTO, que é
// quando o gasto de fato aconteceu; toda despesa tem evento vinculado.
export interface FinanceRow {
  id: string
  total: number
  status: ExpenseStatus
  category: string
  description: string
  paymentMethod: string
  eventId: string
  eventName: string
  // Data do evento (YYYY-MM-DD) — o eixo de tempo real.
  date: string
  // 'YYYY-MM', pré-calculado pra agrupar por mês sem refazer parse.
  month: string
  supplierId: string | null
  supplierName: string
  personId: string | null
  personName: string
}

export interface FinanceDataset {
  rows: FinanceRow[]
  events: EventItem[]
  // Faturamento lançado por evento. Fica separado das despesas de propósito:
  // hoje quase todo evento está com sales_amount 0, então a tela avisa em vez
  // de mostrar "lucro" calculado em cima de receita que ninguém lançou.
  revenueByEvent: Record<string, number>
  eventsWithoutRevenue: number
}

export async function getFinanceDataset(): Promise<FinanceDataset> {
  const [expenses, events, suppliers, profiles, pending] = await Promise.all([
    listAllExpenses(), listEvents(), listSuppliers(), listProfiles(), listPendingProfilesForPicker()
  ])

  const eventById = new Map(events.map((e) => [e.id, e]))
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const pendingById = new Map(pending.map((p) => [p.id, p]))

  const rows: FinanceRow[] = expenses.map((x) => {
    const ev = x.event_id ? eventById.get(x.event_id) : undefined
    // Despesa de evento usa a data do EVENTO (o eixo de tempo real da operação).
    // Despesa da empresa não tem evento — usa a própria data de lançamento,
    // que pra ela é honesta: foi quando o gasto aconteceu.
    const date = ev?.event_date ?? (x.event_id ? '' : x.created_at.slice(0, 10))
    // A despesa pode estar amarrada a um perfil real OU a um pré-cadastro —
    // os dois viram "pessoa" aqui, pra tela não precisar saber a diferença.
    const profile = x.team_member_id ? profileById.get(x.team_member_id) : null
    const pend = x.pending_team_member_id ? pendingById.get(x.pending_team_member_id) : null
    const personName = profile
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
      : pend
        ? `${pend.first_name ?? ''} ${pend.last_name ?? ''}`.trim()
        : ''

    return {
      id: x.id,
      total: Number(x.total) || 0,
      status: x.status,
      category: x.category || 'Sem categoria',
      description: x.description || '',
      paymentMethod: x.payment_method || 'Não informado',
      eventId: x.event_id ?? '',
      eventName: x.event_id ? (ev?.name ?? 'Evento removido') : 'Beetz (empresa)',
      date,
      month: date ? date.slice(0, 7) : '',
      supplierId: x.supplier_id,
      supplierName: x.supplier_id ? (supplierById.get(x.supplier_id)?.name ?? 'Fornecedor removido') : 'Sem fornecedor',
      personId: x.team_member_id ?? x.pending_team_member_id,
      personName: personName || 'Sem pessoa'
    }
  })

  const revenueByEvent: Record<string, number> = {}
  let eventsWithoutRevenue = 0
  for (const e of events) {
    const value = Number(e.sales_amount) || 0
    revenueByEvent[e.id] = value
    if (value <= 0 && e.status === 'Concluído') eventsWithoutRevenue++
  }

  return { rows, events, revenueByEvent, eventsWithoutRevenue }
}

// Lista enxuta (sem CPF/telefone/etc.) de quem ainda não se cadastrou, pra
// usar no seletor de "Equipe" das Despesas. Qualquer colaborador logado pode
// chamar isso (a function no banco confere is_staff), diferente da tabela
// zoho_pending_profiles completa, que continua só-Diretoria.

// O PostgREST devolve NO MÁXIMO 1000 linhas por requisição — silenciosamente.
// Com 1722 pré-cadastros ordenados por nome, o corte caía na letra L e 722
// pessoas sumiam da Turma e do seletor de Equipe, parecendo "importação pela
// metade". Este helper pagina até vir página incompleta.
async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const page = await fetchPage(from, from + PAGE - 1)
    all.push(...page)
    if (page.length < PAGE) break
  }
  return all
}

export async function listPendingProfilesForPicker(): Promise<PendingProfilePickerItem[]> {
  if (isDemoMode) return []
  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase.rpc('list_pending_profiles_for_picker').range(from, to)
    if (error) throw error
    return (data ?? []) as PendingProfilePickerItem[]
  })
}

// Igual ao picker acima, mas com cidade/cargo/departamento/foto — usado pra
// mostrar pré-cadastro na Turma e no Mapa da Colmeia (qualquer colaborador
// com perfil pode ver, a function no banco confere is_staff).
export async function listPendingProfilesForDirectory(): Promise<PendingProfileDirectoryItem[]> {
  if (isDemoMode) return []
  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase.rpc('list_pending_profiles_for_directory').range(from, to)
    if (error) throw error
    return (data ?? []) as PendingProfileDirectoryItem[]
  })
}

// Busca sob demanda (um perfil por vez) os campos sensíveis do pré-cadastro
// que listPendingProfilesForDirectory nunca traz. A function no banco só
// devolve linha se quem chamou for Diretoria — pra qualquer outra pessoa
// vem vazio, então o caller sempre trata null como "sem acesso/sem dado".
export async function getPendingProfileSensitiveDetails(pendingId: string): Promise<PendingProfileSensitive | null> {
  if (isDemoMode) return null
  const { data, error } = await supabase.rpc('get_pending_profile_sensitive', { pending_id: pendingId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return (row ?? null) as PendingProfileSensitive | null
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

// Move a despesa pra outro evento — separado de updateExpense de propósito,
// pra não deixar o formulário de edição comum trocar isso sem querer.
export async function moveExpenseToEvent(id: string, newEventId: string): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.expenses.findIndex((e) => e.id === id)
    if (idx >= 0) demoState.expenses[idx] = { ...demoState.expenses[idx], event_id: newEventId }
    return
  }
  const { error } = await supabase.from('expenses').update({ event_id: newEventId }).eq('id', id)
  if (error) throw error
}

// Exclusão definitiva — diferente de status='Cancelado' (que mantém o
// registro no histórico). Usada pra corrigir despesa lançada por engano.
export async function deleteExpense(id: string): Promise<void> {
  if (isDemoMode) {
    const idx = demoState.expenses.findIndex((e) => e.id === id)
    if (idx >= 0) demoState.expenses.splice(idx, 1)
    return
  }
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
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

// Todos os recebimentos (fechamentos de caixa), de todos os eventos — usado
// na visão financeira global (/financeiro/recebimentos), igual listAllExpenses()
// faz pra despesas.
export async function listAllCashierSettlements(): Promise<CashierSettlement[]> {
  if (isDemoMode) {
    return [...demoState.cashierSettlements].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }
  const { data, error } = await supabase.from('cashier_settlements').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as CashierSettlement[]
}

// ---------- Estoque multi-almoxarifado ----------
// Espelha o sinal de cada tipo de movimentação usado na view stock_balances
// (banco) — mantém os dois lugares em sincronia. 'Entrada'/'Saída' seguem
// como legado; os 6 tipos novos refletem o fluxo real (compra → envio pro
// evento → devolução, com ajuste e perda à parte).
const POSITIVE_MOVEMENT_TYPES: MovementType[] = ['Entrada', 'Compra', 'Devolução do Evento', 'Ajuste (entrada)']
export function isPositiveMovementType(type: MovementType): boolean {
  return POSITIVE_MOVEMENT_TYPES.includes(type)
}

export async function listStockLocations(): Promise<StockLocation[]> {
  if (isDemoMode) return demoState.stockLocations
  const { data, error } = await supabase.from('stock_locations').select('*').order('name')
  if (error) throw error
  return data as StockLocation[]
}

export async function createStockLocation(name: string, description: string | null): Promise<StockLocation> {
  if (isDemoMode) {
    const loc: StockLocation = { id: uid('sl'), name, description, event_id: null, created_at: new Date().toISOString() }
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

export async function createProduct(
  name: string, unit: string, category: string | null, lowStockThreshold: number | null = null
): Promise<Product> {
  if (isDemoMode) {
    const product: Product = {
      id: uid('pr'), name, unit, category, low_stock_threshold: lowStockThreshold, created_at: new Date().toISOString()
    }
    demoState.products.push(product)
    return product
  }
  const { data, error } = await supabase
    .from('products').insert({ name, unit, category, low_stock_threshold: lowStockThreshold }).select().single()
  if (error) throw error
  return data as Product
}

export async function updateProduct(id: string, patch: Partial<Pick<Product, 'name' | 'unit' | 'category' | 'low_stock_threshold'>>): Promise<Product> {
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
  // Só faz sentido em Compra — o formulário esconde nos demais tipos.
  unit_cost?: number | null
  notes: string | null
  created_by: string | null
}

export async function createStockMovement(input: NewStockMovementInput): Promise<StockMovement> {
  if (isDemoMode) {
    const movement: StockMovement = { ...input, unit_cost: input.unit_cost ?? null, id: uid('sm'), status: 'Ativo', created_at: new Date().toISOString() }
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
        const balance = movements.reduce((sum, m) => sum + (isPositiveMovementType(m.movement_type) ? m.quantity : -m.quantity), 0)
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

// ---------- Inteligência do estoque (Fase 1) ----------
// As views fazem a conta no banco; aqui só se lê. Custo médio vem das Compras
// com preço; disponível = físico - reservado.
export async function listStockAvailability(): Promise<StockAvailable[]> {
  if (isDemoMode) {
    const balances = await getStockBalances()
    return balances.map((b) => ({ ...b, reserved: 0, available: b.balance }))
  }
  const { data, error } = await supabase.from('stock_available').select('*')
  if (error) throw error
  return data as StockAvailable[]
}

export async function listProductAvgCosts(): Promise<ProductAvgCost[]> {
  if (isDemoMode) return demoState.products.map((p) => ({ product_id: p.id, product_name: p.name, avg_cost: null }))
  const { data, error } = await supabase.from('product_avg_costs').select('*')
  if (error) throw error
  return data as ProductAvgCost[]
}

export async function listStockReservations(onlyActive = true): Promise<StockReservation[]> {
  if (isDemoMode) return []
  let q = supabase.from('stock_reservations').select('*').order('created_at', { ascending: false })
  if (onlyActive) q = q.eq('status', 'Reservado')
  const { data, error } = await q
  if (error) throw error
  return data as StockReservation[]
}

export async function createStockReservation(input: Omit<StockReservation, 'id' | 'status' | 'created_at'>): Promise<StockReservation> {
  if (isDemoMode) throw new Error('Reservas não funcionam em modo demo.')
  const { data, error } = await supabase.from('stock_reservations')
    .insert({ ...input, status: 'Reservado' }).select().single()
  if (error) throw error
  return data as StockReservation
}

// Atender = o envio aconteceu (a reserva vira movimentação de verdade);
// cancelar = liberou o disponível. Nunca se apaga: histórico de reserva é o
// que explica por que um evento ficou sem produto.
export async function updateStockReservationStatus(id: string, status: ReservationStatus): Promise<void> {
  if (isDemoMode) return
  const { error } = await supabase.from('stock_reservations').update({ status }).eq('id', id)
  if (error) throw error
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

// ---------- Logo da marca ----------
// Vive no bucket 'brand' (não em 'avatars'): a política de lá exige que a
// primeira pasta seja o auth.uid() de quem envia, o que faz sentido pra foto de
// perfil e nenhum pra um arquivo da empresa. Escrita só da Diretoria, garantida
// por RLS no Storage — não por esconder o botão.
const LOGO_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const LOGO_MAX_BYTES = 2 * 1024 * 1024

export async function uploadBrandLogo(file: File): Promise<string> {
  if (!LOGO_MIME.includes(file.type)) {
    throw new Error('Formato não aceito. Use PNG, JPG, WEBP ou SVG.')
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error(`Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). O limite é 2 MB.`)
  }

  if (isDemoMode) {
    const fakeUrl = URL.createObjectURL(file)
    demoState.appSettings = { ...demoState.appSettings, logo_url: fakeUrl }
    return fakeUrl
  }

  // Caminho fixo + upsert: trocar o logo sobrescreve em vez de acumular órfão.
  // Como a URL não muda, o ?v= é o que faz o navegador largar a imagem velha.
  const ext = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1]
  const path = `logo.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('brand')
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data: pub } = supabase.storage.from('brand').getPublicUrl(path)
  const url = `${pub.publicUrl}?v=${Date.now()}`

  const { error } = await supabase.from('app_settings')
    .update({ logo_url: url, updated_at: new Date().toISOString() }).eq('id', true)
  if (error) throw error
  return url
}

export async function removeBrandLogo(): Promise<void> {
  if (isDemoMode) {
    demoState.appSettings = { ...demoState.appSettings, logo_url: null }
    return
  }
  // Limpa a referência primeiro: se o arquivo sumir e a coluna ficar, a tela
  // mostra imagem quebrada — pior que voltar pro 🐝.
  const { error } = await supabase.from('app_settings')
    .update({ logo_url: null, updated_at: new Date().toISOString() }).eq('id', true)
  if (error) throw error

  const { data: list } = await supabase.storage.from('brand').list('')
  const files = (list ?? []).filter((f: any) => f.name.startsWith('logo.')).map((f: any) => f.name)
  if (files.length) await supabase.storage.from('brand').remove(files)
}

// ---------- Fornecedores ----------
export async function listSuppliers(): Promise<Supplier[]> {
  if (isDemoMode) return demoState.suppliers
  const { data, error } = await supabase.from('suppliers').select('*').order('name')
  if (error) throw error
  return data as Supplier[]
}

export type NewSupplierInput = Partial<Omit<Supplier, 'id' | 'created_at' | 'name'>> & { name: string }

export async function createSupplier(input: NewSupplierInput): Promise<Supplier> {
  const row = {
    name: input.name, contact: input.contact ?? null, cnpj: input.cnpj ?? null,
    phone: input.phone ?? null, email: input.email ?? null,
    pix_key: input.pix_key ?? null, pix_key_type: input.pix_key_type ?? null,
    notes: input.notes ?? null
  }
  if (isDemoMode) {
    const supplier: Supplier = { ...row, id: uid('sup'), created_at: new Date().toISOString() }
    demoState.suppliers.push(supplier)
    return supplier
  }
  const { data, error } = await supabase.from('suppliers').insert(row).select().single()
  if (error) throw error
  return data as Supplier
}

export async function updateSupplier(id: string, patch: Partial<Omit<Supplier, 'id' | 'created_at'>>): Promise<Supplier> {
  if (isDemoMode) {
    const idx = demoState.suppliers.findIndex((s) => s.id === id)
    if (idx < 0) throw new Error('Fornecedor não encontrado')
    demoState.suppliers[idx] = { ...demoState.suppliers[idx], ...patch }
    return demoState.suppliers[idx]
  }
  const { data, error } = await supabase.from('suppliers').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Supplier
}

// Mesma lógica de guarda das outras exclusões de cadastro (produto/estoque):
// fornecedor com despesa vinculada não pode ser excluído (edite o cadastro em vez disso).
export async function deleteSupplier(id: string): Promise<void> {
  const expenses = await listAllExpenses()
  if (expenses.some((e) => e.supplier_id === id)) {
    throw new Error('Não é possível excluir: este fornecedor já tem despesas vinculadas.')
  }
  if (isDemoMode) {
    demoState.suppliers = demoState.suppliers.filter((s) => s.id !== id)
    return
  }
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) throw error
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
export type NewTransferRequestInput = Omit<TransferRequest, 'id' | 'created_at' | 'status' | 'returned_quantity'>

// eventId omitido = todas as solicitações (usado na visão global da aba Estoque);
// informado = só as daquele evento (usado dentro do EventDetail).
export async function listTransferRequests(eventId?: string): Promise<TransferRequest[]> {
  if (isDemoMode) {
    const all = [...demoState.transferRequests].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return eventId ? all.filter((t) => t.event_id === eventId) : all
  }
  let query = supabase.from('transfer_requests').select('*').order('created_at', { ascending: false })
  if (eventId) query = query.eq('event_id', eventId)
  const { data, error } = await query
  if (error) throw error
  return data as TransferRequest[]
}

export async function createTransferRequest(input: NewTransferRequestInput): Promise<TransferRequest> {
  if (isDemoMode) {
    const record: TransferRequest = { ...input, id: uid('tr'), status: 'Pendente', returned_quantity: null, created_at: new Date().toISOString() }
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

// Aprovar transferência gera a movimentação real de estoque.
//
// CORREÇÃO DE ERRO CRÍTICO: até aqui isto criava UMA linha só — a saída da
// origem. O to_location_id era gravado no pedido e nunca virava entrada em
// lugar nenhum, ou seja, o produto saía de A e não chegava em B: partida
// simples onde estoque exige partida dobrada, e a mercadoria evaporava. Não
// doía porque só existe um almoxarifado — no segundo, todo transporte viraria
// perda invisível.
//
// Agora há dois casos, e eles são diferentes de verdade:
//  - destino é OUTRO estoque  -> par 'Saída' (A) + 'Entrada' (B). Saldo total
//    da empresa não muda; só mudou de prateleira.
//  - destino é o evento (sem to_location, ou igual à origem) -> 'Envio para
//    Evento' só na origem. O produto sai do almoxarifado pra festa.
export async function approveTransferRequest(request: TransferRequest, approvedBy: string | null): Promise<void> {
  if (!request.from_location_id) {
    throw new Error('Esse pedido não tem estoque de origem definido — não dá pra gerar a movimentação.')
  }
  const tag = `Transferência aprovada (#${request.id.slice(0, 8)})`
  const entreEstoques = !!request.to_location_id && request.to_location_id !== request.from_location_id

  const linhas = entreEstoques
    ? [
        {
          product_id: request.product_id, stock_location_id: request.from_location_id,
          event_id: request.event_id, movement_type: 'Saída' as MovementType, quantity: request.quantity,
          unit_cost: null, notes: `${tag} — saída`, created_by: approvedBy, status: 'Ativo' as const
        },
        {
          product_id: request.product_id, stock_location_id: request.to_location_id!,
          event_id: request.event_id, movement_type: 'Entrada' as MovementType, quantity: request.quantity,
          unit_cost: null, notes: `${tag} — entrada`, created_by: approvedBy, status: 'Ativo' as const
        }
      ]
    : [
        {
          product_id: request.product_id, stock_location_id: request.from_location_id,
          event_id: request.event_id, movement_type: 'Envio para Evento' as MovementType, quantity: request.quantity,
          unit_cost: null, notes: tag, created_by: approvedBy, status: 'Ativo' as const
        }
      ]

  if (isDemoMode) {
    const idx = demoState.transferRequests.findIndex((t) => t.id === request.id)
    if (idx >= 0) demoState.transferRequests[idx] = { ...demoState.transferRequests[idx], status: 'Aprovado' }
    for (const l of linhas) {
      demoState.stockMovements.push({ ...l, id: uid('sm'), created_at: new Date().toISOString() })
    }
    return
  }

  // Insert em lote: as duas pernas da transferência entram na mesma requisição,
  // então ou as duas gravam ou nenhuma. Sequencial deixaria a saída gravada e
  // a entrada não — que é justamente o bug que estou consertando.
  const { error: moveErr } = await supabase.from('stock_movements').insert(linhas)
  if (moveErr) throw moveErr
  const { error: statusErr } = await supabase.from('transfer_requests').update({ status: 'Aprovado' }).eq('id', request.id)
  if (statusErr) throw statusErr
}

// Registra o quanto voltou pro estoque central depois do evento (sobra física)
// — gera uma movimentação 'Devolução do Evento' e marca o pedido com o total
// já devolvido, pra não deixar registrar duas vezes por engano.
export async function registerTransferReturn(request: TransferRequest, returnedQuantity: number, returnedBy: string | null): Promise<void> {
  if (!request.from_location_id) {
    throw new Error('Esse pedido não tem estoque de origem definido — não dá pra registrar a devolução.')
  }
  if (returnedQuantity <= 0) throw new Error('Informe uma quantidade de devolução maior que zero.')
  if (isDemoMode) {
    const idx = demoState.transferRequests.findIndex((t) => t.id === request.id)
    if (idx >= 0) demoState.transferRequests[idx] = { ...demoState.transferRequests[idx], returned_quantity: returnedQuantity }
    demoState.stockMovements.push({
      id: uid('sm'), product_id: request.product_id, stock_location_id: request.from_location_id,
      event_id: request.event_id, movement_type: 'Devolução do Evento', quantity: returnedQuantity, unit_cost: null,
      notes: `Sobra devolvida (#${request.id.slice(0, 8)})`, created_by: returnedBy,
      status: 'Ativo', created_at: new Date().toISOString()
    })
    return
  }
  const { error: moveErr } = await supabase.from('stock_movements').insert({
    product_id: request.product_id, stock_location_id: request.from_location_id, event_id: request.event_id,
    movement_type: 'Devolução do Evento', quantity: returnedQuantity,
    notes: `Sobra devolvida (#${request.id.slice(0, 8)})`, created_by: returnedBy, status: 'Ativo'
  })
  if (moveErr) throw moveErr
  const { error: returnErr } = await supabase.from('transfer_requests').update({ returned_quantity: returnedQuantity }).eq('id', request.id)
  if (returnErr) throw returnErr
}

// ---------- Repasses (ledger de lançamentos por evento) ----------
// Substitui, como fonte de verdade, o antigo campo único events.repasses
// (mantido só como histórico/rollback — ver migração de backfill). Cada
// pagamento de repasse à produtora agora é um lançamento próprio, com data e
// observação, em vez de um número só editável.
export type NewEventRepasseInput = Omit<EventRepasse, 'id' | 'created_at'>

export async function listEventRepasses(eventId: string): Promise<EventRepasse[]> {
  if (isDemoMode) {
    return demoState.eventRepasses.filter((r) => r.event_id === eventId).sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))
  }
  const { data, error } = await supabase.from('event_repasses').select('*').eq('event_id', eventId).order('paid_at', { ascending: false })
  if (error) throw error
  return data as EventRepasse[]
}

// eventId omitido = todos os lançamentos, de todos os eventos (usado na
// visão global /financeiro/repasses); informado = só os daquele evento.
export async function listAllEventRepasses(eventId?: string): Promise<EventRepasse[]> {
  if (isDemoMode) {
    const all = [...demoState.eventRepasses].sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))
    return eventId ? all.filter((r) => r.event_id === eventId) : all
  }
  let query = supabase.from('event_repasses').select('*').order('paid_at', { ascending: false })
  if (eventId) query = query.eq('event_id', eventId)
  const { data, error } = await query
  if (error) throw error
  return data as EventRepasse[]
}

export async function createEventRepasse(input: NewEventRepasseInput): Promise<EventRepasse> {
  if (isDemoMode) {
    const record: EventRepasse = { ...input, id: uid('rep'), created_at: new Date().toISOString() }
    demoState.eventRepasses.push(record)
    return record
  }
  const { data, error } = await supabase.from('event_repasses').insert(input).select().single()
  if (error) throw error
  return data as EventRepasse
}

export async function deleteEventRepasse(id: string): Promise<void> {
  if (isDemoMode) {
    demoState.eventRepasses = demoState.eventRepasses.filter((r) => r.id !== id)
    return
  }
  const { error } = await supabase.from('event_repasses').delete().eq('id', id)
  if (error) throw error
}

// ---------- Fechamento financeiro do evento (visão diretoria) ----------
export async function getEventFinancialSummary(eventId: string): Promise<EventFinancialSummary> {
  const [expenses, eventProducts, consumption, event, repassesLancamentos] = await Promise.all([
    listExpensesForEvent(eventId),
    listEventProducts(eventId),
    listProductionConsumption(eventId),
    getEventById(eventId),
    listEventRepasses(eventId)
  ])

  const despesas = expenses.filter((e) => e.status !== 'Cancelado').reduce((sum, e) => sum + e.total, 0)
  const custoProdutos = eventProducts.reduce((sum, p) => sum + p.total, 0)
  const consumoProducao = consumption.reduce((sum, c) => sum + c.total_cost, 0)

  const vendas = event?.sales_amount ?? 0
  const percentual = event?.commission_percentage ?? 0
  const creditosOuBonificacoes = event?.credits_bonus ?? 0
  // Antes lia direto de event.repasses (número único editável); agora é a soma
  // dos lançamentos do ledger event_repasses.
  const repasses = repassesLancamentos.reduce((sum, r) => sum + r.amount, 0)

  const aReceber = vendas * (percentual / 100)
  const saldoAReceberDaProdutora = aReceber + creditosOuBonificacoes - repasses
  const lucroOuPerda = aReceber + creditosOuBonificacoes - despesas - custoProdutos - consumoProducao

  return {
    despesas, custoProdutos, consumoProducao, vendas, percentual, aReceber,
    creditosOuBonificacoes, repasses, saldoAReceberDaProdutora, lucroOuPerda
  }
}

// ---------- Portal do produtor: contas ----------
// A ficha do produtor deixou de ser a mesma coisa que a conta de login: agora
// tem id próprio e o login é o auth_user_id. Isso é o que permite a Diretoria
// cadastrar um produtor que nunca entrou no app.
export async function getProducerById(id: string): Promise<Producer | null> {
  if (isDemoMode) return demoState.producers.find((p) => p.id === id) ?? null
  const { data, error } = await supabase.from('producers').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Producer | null
}

// Acha a ficha a partir da CONTA logada. Se a Diretoria já tinha cadastrado
// esse produtor pelo e-mail, claim_producer_profile liga os dois aqui — sem
// isso ele criaria uma ficha nova e a duplicação voltaria.
export async function getProducerForAuthUser(authUserId: string): Promise<Producer | null> {
  if (isDemoMode) {
    return demoState.producers.find((p) => p.auth_user_id === authUserId || p.id === authUserId) ?? null
  }
  const { data, error } = await supabase
    .from('producers').select('*').eq('auth_user_id', authUserId).maybeSingle()
  if (error) throw error
  if (data) return data as Producer

  const { data: claimedId, error: claimErr } = await supabase.rpc('claim_producer_profile')
  if (claimErr) throw claimErr
  if (!claimedId) return null
  return getProducerById(claimedId as string)
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
      email: producer.email ?? '', status: 'Ativo', created_at: new Date().toISOString(), ...producer
    }
    demoState.producers.push(blank)
    return blank
  }
  const { data, error } = await supabase.from('producers').upsert(producer).select().single()
  if (error) throw error
  return data as Producer
}

// ---------- Cadastro de produtores (Diretoria) ----------
export type NewProducerInput = Pick<Producer, 'name' | 'email'> &
  Partial<Omit<Producer, 'id' | 'created_at' | 'auth_user_id'>>

export async function listProducers(): Promise<Producer[]> {
  if (isDemoMode) return [...demoState.producers].sort((a, b) => a.name.localeCompare(b.name))
  const { data, error } = await supabase.from('producers').select('*').order('name')
  if (error) throw error
  return data as Producer[]
}

export async function createProducer(input: NewProducerInput, createdBy: string | null): Promise<Producer> {
  if (isDemoMode) {
    const record: Producer = {
      id: uid('prod'), name: input.name, company_name: null, cpf_cnpj: null, phone: null,
      email: input.email, status: 'Ativo', created_at: new Date().toISOString(), ...input
    }
    demoState.producers.push(record)
    return record
  }
  const { data, error } = await supabase
    .from('producers').insert({ ...input, created_by: createdBy }).select().single()
  if (error) throw error
  return data as Producer
}

export async function updateProducer(id: string, patch: Partial<Producer>): Promise<Producer> {
  if (isDemoMode) {
    const idx = demoState.producers.findIndex((p) => p.id === id)
    if (idx < 0) throw new Error('Produtor não encontrado')
    demoState.producers[idx] = { ...demoState.producers[idx], ...patch }
    return demoState.producers[idx]
  }
  const { data, error } = await supabase.from('producers').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Producer
}

export async function deleteProducer(id: string): Promise<void> {
  if (isDemoMode) {
    demoState.producers = demoState.producers.filter((p) => p.id !== id)
    return
  }
  const { error } = await supabase.from('producers').delete().eq('id', id)
  if (error) throw error
}

// Números do produtor: o que responde "conheço meu produtor". Tudo derivado
// dos eventos vinculados — por isso o vínculo importa mais que a ficha bonita.
export interface ProducerStats {
  eventCount: number
  totalRevenue: number
  totalExpenses: number
  totalRepasses: number
  avgRevenuePerEvent: number
  lastEventDate: string | null
}

export async function getProducerStats(producerId: string): Promise<{ stats: ProducerStats; events: EventItem[] }> {
  const events = (await listEvents()).filter((e) => e.producer_id === producerId)
  const eventIds = new Set(events.map((e) => e.id))

  const [expenses, repasses] = await Promise.all([listAllExpenses(), listAllEventRepasses()])
  const totalExpenses = expenses
    .filter((x) => eventIds.has(x.event_id) && x.status !== 'Cancelado')
    .reduce((s, x) => s + (Number(x.total) || 0), 0)
  const totalRepasses = repasses
    .filter((r) => eventIds.has(r.event_id))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const totalRevenue = events.reduce((s, e) => s + (Number(e.sales_amount) || 0), 0)
  const sorted = [...events].sort((a, b) => (a.event_date < b.event_date ? 1 : -1))

  return {
    events: sorted,
    stats: {
      eventCount: events.length,
      totalRevenue,
      totalExpenses,
      totalRepasses,
      avgRevenuePerEvent: events.length ? totalRevenue / events.length : 0,
      lastEventDate: sorted[0]?.event_date ?? null
    }
  }
}

// ---------- Histórico de alterações do evento ----------
export async function listEventChangeLog(eventId: string): Promise<EventChangeLogEntry[]> {
  if (isDemoMode) return []
  const { data, error } = await supabase
    .from('event_change_log').select('*').eq('event_id', eventId)
    .order('changed_at', { ascending: false }).limit(50)
  if (error) throw error
  return data as EventChangeLogEntry[]
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

export async function updateEventStaffingRequirement(
  id: string, patch: Partial<Pick<EventStaffingRequirement, 'role_label' | 'quantity' | 'unit_cost' | 'notes'>>
): Promise<EventStaffingRequirement> {
  if (isDemoMode) {
    const idx = demoState.eventStaffingRequirements.findIndex((s) => s.id === id)
    if (idx < 0) throw new Error('Vaga não encontrada')
    demoState.eventStaffingRequirements[idx] = { ...demoState.eventStaffingRequirements[idx], ...patch }
    return demoState.eventStaffingRequirements[idx]
  }
  const { data, error } = await supabase
    .from('event_staffing_requirements').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as EventStaffingRequirement
}

// Apagar a vaga leva junto as candidaturas dela (o banco tem
// on delete cascade em event_staffing_applications.requirement_id) — quem já
// estava confirmado continua como membro do evento, porque isso é outra tabela.
export async function deleteEventStaffingRequirement(id: string): Promise<void> {
  if (isDemoMode) {
    demoState.eventStaffingRequirements = demoState.eventStaffingRequirements.filter((s) => s.id !== id)
    demoState.staffingApplications = demoState.staffingApplications.filter((a) => a.requirement_id !== id)
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

// ---------- Disparador de e-mails (SMTP via Edge Function send-email) ----------
export interface SendEmailBatchResult {
  sent: number
  failed: number
  results: { to: string; status: 'sent' | 'failed'; error?: string }[]
}

// A própria Edge Function limita a 40 destinatários por chamada (ver
// MAX_RECIPIENTS_PER_CALL lá) — esse valor espelha isso pro loop de lotes.
const EMAIL_BATCH_SIZE = 40

async function sendEmailBatch(recipients: string[], subject: string, html: string, kind: EmailKind): Promise<SendEmailBatchResult> {
  if (isDemoMode) {
    return { sent: recipients.length, failed: 0, results: recipients.map((to) => ({ to, status: 'sent' as const })) }
  }
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { recipients, subject, html, kind }
  })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data
}

// Envia pra um único destinatário (avisos automáticos do sistema).
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await sendEmailBatch([to], subject, html, 'transactional')
  if (res.failed > 0) throw new Error(res.results[0]?.error ?? 'Falha ao enviar e-mail.')
}

// Parabéns pro aniversariante. Repare que não passamos e-mail nenhum daqui:
// mandamos só QUEM é a pessoa, e a edge function resolve o endereço no
// servidor. Isso existe porque o e-mail do pré-cadastro é privado de propósito
// (o diretório omite esse campo) — então a tela não precisa, e não deve, ter
// acesso a ele só pra mandar parabéns.
export type BirthdayEmailTarget =
  | { kind: 'profile'; id: string }
  | { kind: 'pending'; id: string }

export async function sendBirthdayEmail(
  target: BirthdayEmailTarget, subject: string, message: string
): Promise<void> {
  if (isDemoMode) return
  const { data, error } = await supabase.functions.invoke('send-birthday-email', {
    body: {
      ...(target.kind === 'profile' ? { profile_id: target.id } : { pending_id: target.id }),
      subject,
      message
    }
  })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
}

// Envia em massa, em lotes de EMAIL_BATCH_SIZE, chamando onProgress a cada
// lote concluído — mesmo padrão de "roda até acabar, mostrando progresso" já
// usado pra importação de fotos do pré-cadastro em Settings.tsx.
export async function sendCampaignEmail(
  recipients: string[],
  subject: string,
  html: string,
  onProgress?: (sent: number, failed: number, remaining: number) => void
): Promise<SendEmailBatchResult> {
  let totalSent = 0
  let totalFailed = 0
  const allResults: SendEmailBatchResult['results'] = []
  for (let i = 0; i < recipients.length; i += EMAIL_BATCH_SIZE) {
    const batch = recipients.slice(i, i + EMAIL_BATCH_SIZE)
    const res = await sendEmailBatch(batch, subject, html, 'campaign')
    totalSent += res.sent
    totalFailed += res.failed
    allResults.push(...res.results)
    const remaining = Math.max(0, recipients.length - (i + batch.length))
    onProgress?.(totalSent, totalFailed, remaining)
  }
  return { sent: totalSent, failed: totalFailed, results: allResults }
}

// Lista de e-mails do time (perfis já cadastrados na Colmeia) — usada como
// "toda a equipe" no disparador. Só e-mails preenchidos, sem duplicar.
export async function listTeamEmails(): Promise<string[]> {
  if (isDemoMode) return Array.from(new Set(demoState.profiles.map((p) => p.email).filter(Boolean)))
  const { data, error } = await supabase.from('profiles').select('email').not('email', 'is', null)
  if (error) throw error
  return Array.from(new Set((data as { email: string }[]).map((p) => p.email).filter(Boolean)))
}

export async function listEmailLog(limit = 30): Promise<EmailLogEntry[]> {
  if (isDemoMode) return []
  const { data, error } = await supabase
    .from('email_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as EmailLogEntry[]
}

// ---------- Redirecionadores do site beetz.bar ----------
// CRUD simples numa tabela lida em tempo real pela Netlify Edge Function do
// site estático (ver netlify/edge-functions/redirects.ts no projeto Beetz
// Bar Site) — qualquer mudança aqui já vale no próximo acesso ao site, sem
// precisar reimplantar nada.
export type NewLinkRedirectInput = Pick<LinkRedirect, 'path' | 'destination_url' | 'notes'> & { created_by: string | null }

function normalizeRedirectPath(path: string): string {
  const trimmed = path.trim()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export async function listLinkRedirects(): Promise<LinkRedirect[]> {
  if (isDemoMode) return [...demoState.linkRedirects].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const { data, error } = await supabase.from('link_redirects').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as LinkRedirect[]
}

export async function createLinkRedirect(input: NewLinkRedirectInput): Promise<LinkRedirect> {
  const path = normalizeRedirectPath(input.path)
  if (isDemoMode) {
    const record: LinkRedirect = {
      id: uid('lr'), path, destination_url: input.destination_url, notes: input.notes,
      is_active: true, created_by: input.created_by, created_at: new Date().toISOString()
    }
    demoState.linkRedirects.push(record)
    return record
  }
  const { data, error } = await supabase
    .from('link_redirects')
    .insert({ path, destination_url: input.destination_url, notes: input.notes, created_by: input.created_by })
    .select().single()
  if (error) throw error
  return data as LinkRedirect
}

export async function updateLinkRedirect(
  id: string, patch: Partial<Pick<LinkRedirect, 'path' | 'destination_url' | 'notes' | 'is_active'>>
): Promise<LinkRedirect> {
  const normalizedPatch = patch.path ? { ...patch, path: normalizeRedirectPath(patch.path) } : patch
  if (isDemoMode) {
    const idx = demoState.linkRedirects.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error('Redirecionador não encontrado')
    demoState.linkRedirects[idx] = { ...demoState.linkRedirects[idx], ...normalizedPatch }
    return demoState.linkRedirects[idx]
  }
  const { data, error } = await supabase.from('link_redirects').update(normalizedPatch).eq('id', id).select().single()
  if (error) throw error
  return data as LinkRedirect
}

export async function deleteLinkRedirect(id: string): Promise<void> {
  if (isDemoMode) {
    demoState.linkRedirects = demoState.linkRedirects.filter((r) => r.id !== id)
    return
  }
  const { error } = await supabase.from('link_redirects').delete().eq('id', id)
  if (error) throw error
}

// ---------- Subdomínios (registros DNS via Cloudflare) ----------
// Cria/apaga o registro de verdade no Cloudflare através da edge function
// manage-subdomain (que segura o token e o zone id como secrets — nunca
// tocamos nisso aqui no front). O front só manda a intenção e recebe de
// volta o resultado (sucesso com o id do registro, ou erro).
export interface CreateSubdomainInput {
  subdomain: string
  target_type: DnsRecordType
  target_value: string
  proxied: boolean
}

export async function listDnsSubdomains(): Promise<DnsSubdomain[]> {
  if (isDemoMode) return [...demoState.dnsSubdomains].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const { data, error } = await supabase.from('dns_subdomains').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as DnsSubdomain[]
}

export async function createDnsSubdomain(input: CreateSubdomainInput): Promise<DnsSubdomain> {
  if (isDemoMode) {
    const record: DnsSubdomain = {
      id: uid('dns'), ...input, status: 'Ativo', cloudflare_record_id: 'demo-record', error_message: null,
      created_by: null, created_at: new Date().toISOString()
    }
    demoState.dnsSubdomains.push(record)
    return record
  }
  const { data, error } = await supabase.functions.invoke('manage-subdomain', {
    body: { action: 'create', ...input }
  })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data as DnsSubdomain
}

export async function deleteDnsSubdomain(record: DnsSubdomain): Promise<void> {
  if (isDemoMode) {
    demoState.dnsSubdomains = demoState.dnsSubdomains.filter((r) => r.id !== record.id)
    return
  }
  const { data, error } = await supabase.functions.invoke('manage-subdomain', {
    body: { action: 'delete', id: record.id, cloudflare_record_id: record.cloudflare_record_id }
  })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
}

// Publica (ou atualiza) o Cloudflare Worker que faz os redirecionamentos
// valerem de verdade no beetz.bar (que hoje é WordPress — por isso o
// redirecionamento precisa acontecer na borda do Cloudflare, não no site).
// Só precisa ser clicado uma vez (ou de novo se o mecanismo mudar); depois
// disso as regras da tabela link_redirects já valem na hora.
export interface DeployRedirectWorkerResult {
  success: boolean
  host?: string
  pattern?: string
  script?: string
  route_action?: 'created' | 'updated'
  // O que precisou ser feito no DNS do links.beetz.bar: criado, proxy ligado,
  // ou já estava ok. Útil pra tela dizer o que aconteceu de verdade.
  dns_action?: string
  removed_old_route?: boolean
}

export async function deployRedirectWorker(): Promise<DeployRedirectWorkerResult> {
  if (isDemoMode) {
    return {
      success: true, host: 'links.beetz.bar', pattern: 'links.beetz.bar/*',
      script: 'beetz-bar-redirects', route_action: 'created', dns_action: 'criado'
    }
  }
  const { data, error } = await supabase.functions.invoke('deploy-redirect-worker', { body: {} })
  if (error) throw new Error(await extractFunctionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data as DeployRedirectWorkerResult
}

// ---------- Escala (candidaturas às vagas dos eventos) ----------
// Fluxo: a Diretoria cadastra a vaga no evento ("10 garçons"), a turma se
// candidata aqui, o líder confirma. Ao confirmar, um trigger no banco cria o
// event_member correspondente — não precisamos fazer isso no front.

export async function listEventStaffingApplications(eventId: string): Promise<EventStaffingApplication[]> {
  if (isDemoMode) return demoState.staffingApplications.filter((a) => a.event_id === eventId)
  const { data, error } = await supabase
    .from('event_staffing_applications').select('*').eq('event_id', eventId).order('created_at')
  if (error) throw error
  return data as EventStaffingApplication[]
}

export async function listMyStaffingApplications(profileId: string): Promise<EventStaffingApplication[]> {
  if (isDemoMode) return demoState.staffingApplications.filter((a) => a.profile_id === profileId)
  const { data, error } = await supabase
    .from('event_staffing_applications').select('*').eq('profile_id', profileId).order('created_at', { ascending: false })
  if (error) throw error
  return data as EventStaffingApplication[]
}

// Vagas de eventos que ainda vão acontecer, já com a contagem de confirmados e
// a candidatura da própria pessoa (se existir) — é o que alimenta a tela /escala.
export async function listOpenStaffingSlots(profileId: string | null): Promise<OpenStaffingSlot[]> {
  const today = new Date().toISOString().slice(0, 10)

  const events = (await listEvents()).filter(
    (e) => e.event_date >= today && e.status !== 'Cancelado' && e.status !== 'Concluído'
  )
  if (!events.length) return []
  const eventIds = events.map((e) => e.id)

  let requirements: EventStaffingRequirement[]
  let applications: EventStaffingApplication[]

  if (isDemoMode) {
    requirements = demoState.eventStaffingRequirements.filter((r) => eventIds.includes(r.event_id))
    applications = demoState.staffingApplications.filter((a) => eventIds.includes(a.event_id))
  } else {
    const [reqRes, appRes] = await Promise.all([
      supabase.from('event_staffing_requirements').select('*').in('event_id', eventIds),
      supabase.from('event_staffing_applications').select('*').in('event_id', eventIds)
    ])
    if (reqRes.error) throw reqRes.error
    if (appRes.error) throw appRes.error
    requirements = reqRes.data as EventStaffingRequirement[]
    applications = appRes.data as EventStaffingApplication[]
  }

  return requirements
    .map((requirement) => {
      const event = events.find((e) => e.id === requirement.event_id)!
      const forSlot = applications.filter((a) => a.requirement_id === requirement.id)
      return {
        requirement,
        event,
        confirmedCount: forSlot.filter((a) => a.status === 'Confirmado').length,
        myApplication: profileId
          ? forSlot.find((a) => a.profile_id === profileId && a.status !== 'Cancelado') ?? null
          : null
      }
    })
    .sort((a, b) => (a.event.event_date < b.event.event_date ? -1 : 1))
}

export async function applyToStaffingSlot(
  requirementId: string, eventId: string, profileId: string, note: string | null = null
): Promise<EventStaffingApplication> {
  if (isDemoMode) {
    const existing = demoState.staffingApplications.find(
      (a) => a.requirement_id === requirementId && a.profile_id === profileId
    )
    if (existing) {
      existing.status = 'Candidatado'
      existing.note = note
      return existing
    }
    const record: EventStaffingApplication = {
      id: uid('app'), requirement_id: requirementId, event_id: eventId, profile_id: profileId,
      status: 'Candidatado', note, decided_by: null, decided_at: null, created_at: new Date().toISOString()
    }
    demoState.staffingApplications.push(record)
    return record
  }
  // upsert: se a pessoa já tinha cancelado antes, candidatar de novo reaproveita a linha
  const { data, error } = await supabase
    .from('event_staffing_applications')
    .upsert(
      { requirement_id: requirementId, event_id: eventId, profile_id: profileId, status: 'Candidatado', note },
      { onConflict: 'requirement_id,profile_id' }
    )
    .select().single()
  if (error) throw error
  return data as EventStaffingApplication
}

export async function updateStaffingApplicationStatus(
  id: string, status: StaffingApplicationStatus, decidedBy: string | null = null
): Promise<EventStaffingApplication> {
  if (isDemoMode) {
    const app = demoState.staffingApplications.find((a) => a.id === id)
    if (!app) throw new Error('Candidatura não encontrada')
    app.status = status
    app.decided_by = decidedBy
    app.decided_at = new Date().toISOString()
    return app
  }
  const patch: Record<string, unknown> = { status }
  // Cancelamento é ação do próprio candidato, não uma decisão de líder.
  if (status !== 'Cancelado') {
    patch.decided_by = decidedBy
    patch.decided_at = new Date().toISOString()
  }
  const { data, error } = await supabase
    .from('event_staffing_applications').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as EventStaffingApplication
}

// ---------- Notificações ----------
export async function listNotifications(profileId: string, limit = 30): Promise<AppNotification[]> {
  if (isDemoMode) {
    return [...demoState.notifications].filter((n) => n.profile_id === profileId).slice(0, limit)
  }
  const { data, error } = await supabase
    .from('notifications').select('*').eq('profile_id', profileId)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data as AppNotification[]
}

export async function countUnreadNotifications(profileId: string): Promise<number> {
  if (isDemoMode) {
    return demoState.notifications.filter((n) => n.profile_id === profileId && !n.read_at).length
  }
  const { count, error } = await supabase
    .from('notifications').select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId).is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isDemoMode) {
    const n = demoState.notifications.find((x) => x.id === id)
    if (n) n.read_at = new Date().toISOString()
    return
  }
  const { error } = await supabase
    .from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(profileId: string): Promise<void> {
  if (isDemoMode) {
    demoState.notifications.forEach((n) => {
      if (n.profile_id === profileId && !n.read_at) n.read_at = new Date().toISOString()
    })
    return
  }
  const { error } = await supabase
    .from('notifications').update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId).is('read_at', null)
  if (error) throw error
}
