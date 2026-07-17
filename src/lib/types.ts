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

export type ApprovalStatus = 'Pendente' | 'Aprovado' | 'Rejeitado'
export type MembershipStatus = 'Pendente' | 'Aprovado' | 'Recusado'
export type CashierStatus = 'Pendente' | 'Aprovado' | 'Rejeitado'
export type MovementStatus = 'Ativo' | 'Cancelado'

// Registro "pré-cadastrado" — vem de uma importação (ex: exportação de um
// sistema antigo) e vira perfil de verdade só quando alguém com esse e-mail
// se cadastra no app. Ver claim_pending_profile no banco.
export interface ZohoPendingProfile {
  email: string
  first_name: string | null
  last_name: string | null
  cpf: string | null
  phone: string | null
  mother_name: string | null
  father_name: string | null
  city: string | null
  state: string | null
  role_hint: string | null
  avatar_url: string | null
  about_me: string | null
  fun_fact: string | null
  favorite_events: string | null
  instagram: string | null
  personal_quote: string | null
  skills: string[]
  work_location: string | null
  experience_level: ExperienceLevel | null
  entry_date: string | null
  zoho_record_id: string | null
  department_hint: string | null
  // Só mês/dia do aniversário — nunca ano (minimização LGPD).
  birth_month: number | null
  birth_day: number | null
  // Chave Pix pra pagamento — dado financeiro sensível, nunca exposto no
  // diretório público (PendingProfileDirectoryItem não tem esses campos).
  pix_key: string | null
  pix_key_type: string | null
  pix_owner_name: string | null
}

export interface Department {
  id: string
  name: string
  slug: string
  icon: string
  description: string
  // A que perfil de acesso (AccessRole, em permissions.ts) esse departamento
  // aponta — editável pela Diretoria em /configuracoes. Guardado como string
  // solta aqui (em vez de importar AccessRole) pra não criar dependência
  // circular entre types.ts e permissions.ts.
  access_role: string
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
  // Fundo do perfil. Sempre URL do Storage — nunca base64 (ver
  // uploadProfileCover no dataService pra saber por quê).
  cover_url?: string | null
  onboarding_completed: boolean
  approval_status: ApprovalStatus
  created_at: string
  // Chave Pix pra pagamento — dado financeiro sensível. Opcional aqui só
  // pra não exigir tocar em cada perfil de exemplo do modo demo; trate como
  // presente em qualquer perfil real vindo do banco. Nunca exibir em telas
  // públicas (Turma, Mapa da Colmeia, perfil visto por outra pessoa) — só no
  // próprio cadastro (/cadastro) e na edição da Diretoria (Admin).
  pix_key?: string | null
  pix_key_type?: string | null
  pix_owner_name?: string | null
}

export type ContractStatus = 'Rascunho' | 'Aguardando assinatura' | 'Assinado' | 'Recusado'

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
  // Portal do produtor / contrato via ZapSign
  producer_id: string | null
  contract_status: ContractStatus
  zapsign_doc_token: string | null
  zapsign_signer_token: string | null
  zapsign_sign_url: string | null
  signed_file_url: string | null
  contract_signed_at: string | null
}

// ---------- Portal do produtor (conta externa, fora da equipe Beetz) ----------
export type ProducerStatus = 'Ativo' | 'Inativo' | 'Bloqueado'

// Ficha comercial da produtora. Importante: o id NÃO é o id do login — a ficha
// existe sem conta (a Diretoria cadastra antes) e auth_user_id só é preenchido
// quando o produtor entra no portal com o mesmo e-mail.
export interface Producer {
  id: string
  name: string
  company_name: string | null
  cpf_cnpj: string | null
  phone: string | null
  email: string
  created_at: string
  auth_user_id?: string | null
  status?: ProducerStatus
  phone_secondary?: string | null
  responsible_name?: string | null
  instagram?: string | null
  website?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  partner_since?: string | null
  // Só a Diretoria enxerga. Nunca exibir no portal do produtor.
  internal_notes?: string | null
  created_by?: string | null
}

export interface EventChangeLogEntry {
  id: string
  event_id: string
  field: string
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_at: string
}

export interface ServiceModality {
  id: string
  name: string
  description: string | null
  requires_staffing: boolean
  requires_products: boolean
  unit_label: string
  sort_order: number
  created_at: string
}

export interface EventModality {
  id: string
  event_id: string
  modality_id: string
  quantity: number
  unit_price: number
  total: number
  notes: string | null
  created_at: string
}

export interface EventStaffingRequirement {
  id: string
  event_id: string
  role_label: string
  quantity: number
  unit_cost: number | null
  notes: string | null
  created_at: string
}

export interface EventMember {
  id: string
  event_id: string
  profile_id: string
  role_in_event: string | null
  status: MembershipStatus
  created_at: string
}

// ---------- Escala ----------
// A vaga (EventStaffingRequirement) diz "preciso de 10 garçons"; a candidatura
// é uma pessoa levantando a mão pra uma dessas vagas. Quando o líder confirma,
// um trigger no banco cria o event_member correspondente automaticamente.
export type StaffingApplicationStatus = 'Candidatado' | 'Confirmado' | 'Recusado' | 'Cancelado'

export interface EventStaffingApplication {
  id: string
  requirement_id: string
  event_id: string
  profile_id: string
  status: StaffingApplicationStatus
  note: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

// Vaga aberta enriquecida com dados do evento e contagem — o que a turma vê
// na tela /escala.
export interface OpenStaffingSlot {
  requirement: EventStaffingRequirement
  event: EventItem
  confirmedCount: number
  myApplication: EventStaffingApplication | null
}

// ---------- Notificações ----------
export type NotificationKind = 'Geral' | 'Escala' | 'Despesa' | 'Estoque' | 'Evento' | 'Fechamento'

export interface AppNotification {
  id: string
  profile_id: string
  kind: NotificationKind
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
  // Qual alerta do catálogo (lib/alerts.ts) gerou esta linha. Nulo nas linhas
  // antigas, de antes do catálogo existir — a tela trata como 'Geral'.
  alert_key: AlertFlagKey | null
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

export type ExpenseStatus = 'Pendente' | 'Aprovado' | 'Pago' | 'Rejeitado' | 'Cancelado'
// Antes era uma união fixa; agora as formas de pagamento são editáveis em
// /configuracoes, então qualquer texto cadastrado ali é um valor válido.
export type PaymentMethod = string

export interface Expense {
  id: string
  // Nulo = despesa da EMPRESA (aluguel, contador, compra de estoque) — custo
  // geral, de nenhuma festa. Preenchido = despesa daquele evento.
  event_id: string | null
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
  // Preenchido quando a despesa é lançada pra alguém que ainda não se
  // cadastrou no app (só existe como pré-cadastro do Zoho/CSV). Mutuamente
  // exclusivo com team_member_id — quando a pessoa se cadastra,
  // claim_pending_profile() migra o valor pra team_member_id automaticamente.
  // Qual Compra de estoque esta despesa paga (opcional; único por compra).
  stock_movement_id?: string | null
  pending_team_member_id: string | null
  supplier_id: string | null
  created_at: string
}

// Versão enxuta de ZohoPendingProfile (sem CPF/telefone/etc.) usada só pra
// popular seletores de "quem é" em telas como Despesas — qualquer
// colaborador pode ver isso, não só a Diretoria.
export interface PendingProfilePickerItem {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
}

// Versão pra exibição pública (Turma, Mapa da Colmeia) — ainda minimizada
// (sem CPF/telefone/pais/e-mail), mas com os campos "sociais" que também
// aparecem no perfil de quem já tem conta (ver ProfilePage.tsx), pra dar
// mais contexto quando alguém clica pra ver detalhes de um pré-cadastro.
export interface PendingProfileDirectoryItem {
  id: string
  first_name: string | null
  last_name: string | null
  city: string | null
  state: string | null
  role_hint: string | null
  department_hint: string | null
  avatar_url: string | null
  about_me: string | null
  fun_fact: string | null
  favorite_events: string | null
  instagram: string | null
  personal_quote: string | null
  skills: string[]
  work_location: string | null
  experience_level: ExperienceLevel | null
  entry_date: string | null
  // Só mês/dia — nunca ano (minimização: não expõe idade de quem ainda nem
  // se cadastrou de verdade). Ver birth_date em Profile pra quem já tem conta.
  birth_month: number | null
  birth_day: number | null
}

// Campos sensíveis do pré-cadastro (vieram do Zoho junto com o resto, mas
// list_pending_profiles_for_directory nunca devolve isso pra ninguém). Só a
// função get_pending_profile_sensitive() no banco expõe — e ela mesma só
// devolve linha se quem chamou for Diretoria (ver is_diretoria na migração).
// Buscado sob demanda, um perfil por vez, quando a Diretoria abre o popup.
export interface PendingProfileSensitive {
  id: string
  cpf: string | null
  phone: string | null
  mother_name: string | null
  father_name: string | null
  pix_key: string | null
  pix_key_type: string | null
  pix_owner_name: string | null
}

// Redirecionador de caminho pro site público beetz.bar (ex: /cardapio -> um
// link externo). Lido em tempo real por uma Netlify Edge Function no site
// estático — mudanças aqui valem na hora, sem precisar reimplantar o site.
export interface LinkRedirect {
  id: string
  path: string
  destination_url: string
  is_active: boolean
  notes: string | null
  created_by: string | null
  created_at: string
}

export type DnsSubdomainStatus = 'Ativo' | 'Erro' | 'Removido'
export type DnsRecordType = 'CNAME' | 'A'

// Registro de DNS de subdomínio (ex: app.beetz.bar) criado via API do
// Cloudflare pela edge function manage-subdomain. cloudflare_record_id
// guarda o ID do registro lá no Cloudflare, necessário pra apagar depois.
export interface DnsSubdomain {
  id: string
  subdomain: string
  target_type: DnsRecordType
  target_value: string
  proxied: boolean
  status: DnsSubdomainStatus
  cloudflare_record_id: string | null
  error_message: string | null
  created_by: string | null
  created_at: string
}

export type PixKeyType = 'CPF' | 'CNPJ' | 'E-mail' | 'Telefone' | 'Aleatória'

export interface Supplier {
  id: string
  name: string
  // 'contact' é legado: era um campo só onde cabia telefone, e-mail e o que
  // mais viesse. Continua lendo o que já existe, mas o cadastro novo separa.
  contact: string | null
  cnpj: string | null
  phone: string | null
  email: string | null
  // O que realmente importa na hora de pagar: pra onde vai o dinheiro.
  pix_key: string | null
  pix_key_type: PixKeyType | null
  notes: string | null
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
  // Quanto já retornou ao estoque central pra esse pedido (null = ainda não
  // devolvido). Só faz sentido depois que o pedido está Aprovado.
  returned_quantity: number | null
}

// Ledger de lançamentos individuais de repasse por evento — substitui, como
// fonte de verdade, o campo único events.repasses (mantido só como histórico).
export interface EventRepasse {
  id: string
  event_id: string
  amount: number
  paid_at: string
  notes: string | null
  created_by: string | null
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
  status: CashierStatus
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface StockLocation {
  id: string
  name: string
  description: string | null
  // Quando preenchido, este local É um evento — nasce sozinho no primeiro
  // envio e morre com o evento. É o que permite transferir festa→festa e
  // perguntar "quanto tem na Vaquejada agora?".
  event_id: string | null
  created_at: string
}

export interface Product {
  id: string
  name: string
  unit: string
  category: string | null
  created_at: string
  // Limite de saldo baixo específico desse produto — null usa o padrão da
  // tela de Estoque (5). Cada produto tem sua própria noção de "pouco":
  // cerveja em latas e guardanapo em pacotes não deveriam alertar no mesmo número.
  low_stock_threshold: number | null
}

// 'Entrada'/'Saída' seguem válidos como legado (dados antigos e lançamentos
// avulsos que não se encaixem nos tipos específicos) — mas o formulário de
// nova movimentação só oferece os 6 tipos que refletem o fluxo real da
// operação de bar em eventos (compra → envio → devolução, com perda e ajuste
// à parte). Ver stock_balances (view no banco) pro sinal de cada tipo.
export type MovementType =
  | 'Entrada' | 'Saída'
  | 'Compra' | 'Envio para Evento' | 'Devolução do Evento'
  | 'Ajuste (entrada)' | 'Ajuste (saída)' | 'Perda'
  | 'Consumo Interno' | 'Quebra'

export interface StockMovement {
  id: string
  product_id: string
  stock_location_id: string
  event_id: string | null
  movement_type: MovementType
  quantity: number
  // Preenchido nas Compras: alimenta o custo médio ponderado (product_avg_costs
  // no banco), que é a base do "valor do estoque" em R$.
  unit_cost: number | null
  notes: string | null
  created_by: string | null
  status: MovementStatus
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

// View stock_available: balance é o físico; reserved é o separado pra eventos
// futuros (stock_reservations com status Reservado); available = o que sobra
// pra prometer. As três colunas juntas evitam a pergunta "tem no estoque mas
// posso usar?" — que é onde reserva de papel e planilha sempre quebram.
export interface StockAvailable extends StockBalance {
  reserved: number
  available: number
}

export interface ProductAvgCost {
  product_id: string
  product_name: string
  avg_cost: number | null
}

export type ReservationStatus = 'Reservado' | 'Atendida' | 'Cancelada'

export interface StockReservation {
  id: string
  event_id: string
  product_id: string
  stock_location_id: string
  quantity: number
  status: ReservationStatus
  notes: string | null
  created_by: string | null
  created_at: string
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
  can_approve_users: boolean
  can_review_cashier: boolean
  can_edit_expense: boolean
  can_edit_stock: boolean
  can_approve_event_requests: boolean
  can_manage_stock_catalog: boolean
  can_edit_own_stock: boolean
  // Menu Comunidade (Turma, Mapa da Colmeia, Ranking, Aniversariantes)
  can_view_team_directory: boolean
  can_view_pending_details: boolean
  can_give_recognition: boolean
  can_view_ranking: boolean
  can_view_hive_map: boolean
  can_edit_hive_map: boolean
  can_view_birthdays: boolean
  // Separado de can_view_birthdays porque o e-mail sai do endereço oficial da
  // Beetz — ver a lista é uma coisa, falar em nome da empresa é outra.
  can_send_birthday_email: boolean
  // Alertas: quais avisos cada cargo recebe no sininho. Quem decide é a
  // Diretoria em /alertas; o trigger no banco lê a mesma flag antes de gravar,
  // então desligar aqui não é cosmético — a notificação nem nasce.
  can_receive_alert_staffing_decision: boolean
  can_receive_alert_staffing_application: boolean
  can_receive_alert_staffing_new_slot: boolean
  can_receive_alert_stock_low: boolean
  can_receive_alert_expense_reviewed: boolean
  can_receive_alert_event_changed: boolean
  // Fase 3: os dois primeiros nascem de rotina diária (ausência de movimento
  // não dispara trigger); divergência é trigger no ajuste de inventário.
  can_receive_alert_stock_idle: boolean
  can_receive_alert_inventory_diff: boolean
  can_receive_alert_pending_return: boolean
  updated_at: string
}

// As seis flags acima, num formato que a tela de Alertas consegue percorrer.
// 'escopo' separa o que é sobre VOCÊ do que é sobre a operação — é o que divide
// as abas Pessoais e Globais.
export type AlertFlagKey =
  | 'can_receive_alert_staffing_decision'
  | 'can_receive_alert_staffing_application'
  | 'can_receive_alert_staffing_new_slot'
  | 'can_receive_alert_stock_low'
  | 'can_receive_alert_expense_reviewed'
  | 'can_receive_alert_event_changed'
  | 'can_receive_alert_stock_idle'
  | 'can_receive_alert_inventory_diff'
  | 'can_receive_alert_pending_return'

export interface AlertTypeDef {
  key: AlertFlagKey
  label: string
  description: string
  kind: NotificationKind
  escopo: 'pessoal' | 'global'
  gatilho: string
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
  // O "Colmeia" embaixo do nome, no menu e no login.
  short_name: string
  // Sobe pro bucket 'brand'. Nulo = cai no 🐝 padrão.
  logo_url: string | null
  welcome_title: string
  welcome_subtitle: string
  login_title: string
  login_subtitle: string
  info_text: string | null
  // Só valem pra quem instalar o app DEPOIS da mudança: o celular grava nome e
  // ícone no momento da instalação e não volta a perguntar.
  pwa_name: string
  pwa_short_name: string
  pwa_description: string
  updated_at: string
}

export type EmailKind = 'transactional' | 'campaign'

export interface EmailLogEntry {
  id: string
  to_email: string
  subject: string
  kind: EmailKind
  status: 'sent' | 'failed'
  error: string | null
  sent_by: string | null
  created_at: string
}
