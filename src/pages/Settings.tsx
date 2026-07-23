import { useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import {
  AlertTriangle, Image, Plus, RefreshCw, Search, Upload, X, Save, Settings as SettingsIcon, ShieldAlert, Trash2,
  Users, ListChecks, Layers, Trophy, Palette, Database, Mail, Send, Wallet
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import StaffingRolesSection from '../components/settings/StaffingRolesSection'
import { useConfig } from '../contexts/ConfigContext'
import { ACCESS_ROLE_LABELS, canManageUsers, departmentToAccessRole, type AccessRole } from '../lib/permissions'
import { ALERT_TYPES } from '../lib/alerts'
import {
  createExpenseCategory, createPaymentMethod, createServiceModality, deleteExpenseCategory,
  deletePaymentMethod, deleteServiceModality, getZohoPendingProfilesStats, importPendingPhotosBatch,
  authorizeZohoWithCode, createDepartment, createRolePermission, deleteDepartment, deleteRolePermission,
  importZohoPendingProfiles, inspectZohoCreatorFields, listBadgeDefsConfig, listDepartments,
  listExpenseCategories, listEmailLog, listHiveLevelsConfig, listPaymentMethods, listRolePermissions,
  listServiceModalities, listTeamEmails, listZohoMeta, peekZohoReport, sendCampaignEmail, sendEmail,
  removeBrandLogo, syncZohoCreator, updateAppSettings, updateBadgeDef, updateDepartmentAccessRole,
  updateHiveLevel, updateRolePermission, updateServiceModality, uploadBrandLogo
} from '../lib/dataService'
import type { ZohoAuthorizeResult, ZohoMetaItem, ZohoPendingProfilesStats, ZohoReportPeek } from '../lib/dataService'
import type {
  AppSettings, BadgeDefConfig, Department, EmailLogEntry, ExperienceLevel, ExpenseCategory, HiveLevelConfig,
  PaymentMethodOption, RolePermissions, ServiceModality, ZohoPendingProfile
} from '../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const cardClass = 'bg-white rounded-2xl p-5 md:p-6 shadow-soft border border-beetz-dark/5'

type PermissionKey = keyof Omit<RolePermissions, 'role' | 'updated_at'>

const PERMISSION_GROUPS: { title: string; fields: { key: PermissionKey; label: string; description: string }[] }[] = [
  {
    title: 'Despesas',
    fields: [
      { key: 'can_add_expense', label: 'Adicionar despesa', description: 'Cadastrar novas despesas em um evento.' },
      { key: 'can_edit_expense', label: 'Editar ou cancelar despesa', description: 'Alterar dados de uma despesa já lançada ou cancelá-la (mantendo o histórico).' },
      { key: 'can_review_expense', label: 'Revisar status da despesa', description: 'Mudar o status entre Pendente, Aprovado, Pago e Rejeitado.' }
    ]
  },
  {
    title: 'Estoque',
    fields: [
      { key: 'can_add_stock', label: 'Movimentar estoque', description: 'Lançar entradas e saídas de produtos.' },
      { key: 'can_edit_stock', label: 'Editar ou cancelar qualquer movimentação', description: 'Corrigir a quantidade de qualquer movimentação (de qualquer colaborador) ou cancelá-la.' },
      { key: 'can_edit_own_stock', label: 'Editar as próprias movimentações', description: 'Corrigir ou cancelar apenas as movimentações que a própria pessoa registrou.' },
      { key: 'can_manage_stock_catalog', label: 'Gerenciar produtos e estoques', description: 'Criar, editar e excluir produtos e estoques/almoxarifados.' }
    ]
  },
  {
    title: 'Recebimentos (fechamento de caixa)',
    fields: [
      { key: 'can_add_cashier', label: 'Lançar fechamento de caixa', description: 'Registrar dinheiro, débito, crédito e Pix apurados em um evento.' },
      { key: 'can_review_cashier', label: 'Aprovar fechamento de caixa', description: 'Mudar o status entre Pendente, Aprovado e Rejeitado.' },
      { key: 'can_move_settlement_event', label: 'Trocar o evento de um recebimento', description: 'Mover um fechamento lançado no evento errado — o valor sai do apurado de um e entra no outro.' }
    ]
  },
  {
    title: 'Eventos',
    fields: [
      { key: 'can_approve_event_requests', label: 'Aprovar pedidos de participação', description: 'Aceitar ou recusar pedidos de colaboradores pra entrar num evento.' }
    ]
  },
  {
    title: 'Usuários e visão financeira',
    fields: [
      { key: 'can_approve_users', label: 'Aprovar novos cadastros', description: 'Liberar (ou recusar) quem acabou de se cadastrar no app.' },
      { key: 'can_manage_users', label: 'Gerenciar departamentos e perfis', description: 'Trocar o departamento de qualquer colaborador (e, com isso, seu papel de acesso).' },
      { key: 'can_view_financial_summary', label: 'Ver fechamento — visão diretoria', description: 'Ver vendas, percentual, custos e lucro/perda de um evento.' }
    ]
  },
  {
    title: 'Comunidade (Turma, Mapa da Colmeia, Ranking, Aniversariantes)',
    fields: [
      { key: 'can_view_team_directory', label: 'Ver Conhecer a turma', description: 'Acessar a página com a lista de todos os colaboradores da Beetz.' },
      { key: 'can_view_hive_map', label: 'Ver o Mapa da Colmeia', description: 'Acessar a página com os departamentos e quem faz parte de cada um.' },
      { key: 'can_view_pending_details', label: 'Ver detalhes de pré-cadastro', description: 'Clicar num card de pré-cadastro (Turma, Mapa da Colmeia, Aniversariantes) e ver o modal com mais informações da pessoa.' },
      { key: 'can_give_recognition', label: 'Dar Mel e elogiar', description: 'Enviar reconhecimento (mel) e elogios pra outros colaboradores.' },
      { key: 'can_view_ranking', label: 'Ver o Ranking', description: 'Acessar a página de ranking/colocação dos colaboradores.' },
      { key: 'can_view_birthdays', label: 'Ver os Aniversariantes', description: 'Acessar a página com quem faz aniversário no mês.' },
      { key: 'can_send_birthday_email', label: 'Enviar e-mail de parabéns', description: 'Mandar o e-mail de aniversário — sai do endereço oficial da Beetz e fica registrado no log.' },
      { key: 'can_edit_hive_map', label: 'Editar o Mapa da Colmeia', description: 'Alterar nome, ícone e descrição dos departamentos no Mapa da Colmeia.' },
      { key: 'can_view_praise_insights', label: 'Ver panorama de elogios (Gestão)', description: 'Acessar Gestão → Elogios: quem recebe e quem dá reconhecimento na equipe, com mensagens. Hoje é da Diretoria; marcar aqui abre pra outros cargos.' }
    ]
  },
  {
    // As flags de alerta SEMPRE existiram no banco, mas não tinham onde ser
    // ajustadas — por isso os alertas "não chegavam pros departamentos".
    // Aqui é o TETO por perfil de acesso; cada pessoa ainda pode desligar
    // tipos no /alertas → Meus avisos (a preferência pessoal só desliga,
    // nunca liga). A lista nasce do catálogo canônico (lib/alerts) — tipo
    // novo lá aparece aqui sozinho.
    title: 'Alertas (quem recebe cada tipo de aviso)',
    fields: ALERT_TYPES.map((a) => ({
      key: a.key as PermissionKey,
      label: a.label,
      description: a.description
    }))
  }
]


type SettingsTabKey = 'perfis' | 'listas' | 'funcoes' | 'modalidades' | 'gamificacao' | 'marca' | 'dados' | 'comunicacao'

const SETTINGS_TABS: { key: SettingsTabKey; label: string; icon: typeof Users }[] = [
  { key: 'perfis', label: 'Perfis de acesso', icon: Users },
  { key: 'listas', label: 'Listas de opções', icon: ListChecks },
  { key: 'funcoes', label: 'Funções & Valores', icon: Wallet },
  { key: 'modalidades', label: 'Modalidades de serviço', icon: Layers },
  { key: 'gamificacao', label: 'Gamificação', icon: Trophy },
  { key: 'marca', label: 'Dados gerais da marca', icon: Palette },
  { key: 'dados', label: 'Importador de dados', icon: Database },
  { key: 'comunicacao', label: 'Comunicação', icon: Mail }
]

export default function Settings() {
  const { accessRole } = useAuth()
  const { refreshConfig } = useConfig()
  const [tab, setTab] = useState<SettingsTabKey>('perfis')

  if (!canManageUsers(accessRole)) {
    return (
      <div className={`${cardClass} text-center`}>
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Essa área é exclusiva para a Diretoria.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
          <SettingsIcon size={26} className="text-beetz-yellow" /> Configurações
        </h1>
        <p className="text-beetz-dark/60 mt-1">Ajuste os flags e listas que controlam o comportamento do dashboard.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-beetz-dark/10 pb-3">
        {SETTINGS_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
              tab === key ? 'bg-beetz-dark text-white' : 'bg-beetz-gray text-beetz-dark/70 hover:bg-beetz-dark/10'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'perfis' && <RolePermissionsSection onSaved={refreshConfig} />}
      {tab === 'listas' && <ListsSection />}
      {tab === 'modalidades' && <ModalitiesSection />}
      {tab === 'gamificacao' && <GamificationSection onSaved={refreshConfig} />}
      {tab === 'funcoes' && <StaffingRolesSection />}
      {tab === 'marca' && <BrandSection />}
      {tab === 'dados' && <DataImporterSection />}
      {tab === 'comunicacao' && <EmailDispatcherSection />}
    </div>
  )
}

// ---------- Perfis de acesso ----------
// Em vez de uma tabela larga (uma coluna por permissão), usamos um seletor de
// perfil + uma lista vertical de permissões agrupadas — os perfis quase nunca
// mudam, mas o número de permissões deve crescer, e listas escalam melhor que colunas.
function RolePermissionsSection({ onSaved }: { onSaved: () => void }) {
  const [permissions, setPermissions] = useState<RolePermissions[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedRole, setSelectedRole] = useState<AccessRole>('diretoria')
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [perms, depts] = await Promise.all([listRolePermissions(), listDepartments()])
    setPermissions(perms)
    setDepartments(depts)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const current = permissions.find((p) => p.role === selectedRole)

  // Cada papel de acesso pode corresponder a mais de um departamento
  // cadastrado (ex: Bar, Produção, Segurança, Credenciamento e Limpeza todos
  // caem em "Operacional") — mostramos os nomes reais dos departamentos em
  // vez de uma descrição fixa, pra ficar claro quem cada perfil afeta.
  // Perfis dinâmicos: a ordem e os rótulos saem do banco (diretoria primeiro).
  const roleOrder: AccessRole[] = [...permissions]
    .sort((a, b) => {
      if (a.role === 'diretoria') return -1
      if (b.role === 'diretoria') return 1
      return a.label.localeCompare(b.label, 'pt-BR')
    })
    .map((p) => p.role)
  const deptNamesByRole: Record<string, string[]> = {}
  for (const dept of departments) {
    const r = departmentToAccessRole(dept)
    deptNamesByRole[r] = [...(deptNamesByRole[r] ?? []), dept.name]
  }
  function roleLabel(role: AccessRole): string {
    const base = permissions.find((p) => p.role === role)?.label ?? ACCESS_ROLE_LABELS[role] ?? role
    const names = deptNamesByRole[role] ?? []
    const roleName = base.split(' (')[0]
    return names.length === 0 ? roleName : `${roleName} (${names.join(', ')})`
  }

  const [newRoleName, setNewRoleName] = useState('')
  const [creatingRole, setCreatingRole] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)

  async function handleCreateRole() {
    if (!newRoleName.trim()) return
    setCreatingRole(true); setRoleError(null)
    try {
      const created = await createRolePermission(newRoleName)
      setNewRoleName('')
      await load()
      await onSaved()
      setSelectedRole(created.role)
    } catch (e: any) {
      setRoleError(e?.message ?? 'Não foi possível criar o perfil.')
    } finally {
      setCreatingRole(false)
    }
  }

  async function handleDeleteRole(role: AccessRole) {
    if (!window.confirm('Excluir este perfil? Departamentos apontando pra ele impedem a exclusão.')) return
    setRoleError(null)
    try {
      await deleteRolePermission(role)
      setSelectedRole('diretoria')
      await load()
      await onSaved()
    } catch (e: any) {
      setRoleError(e?.message ?? 'Não foi possível excluir o perfil.')
    }
  }

  async function toggle(field: PermissionKey, currentValue: boolean) {
    setSavingKey(field)
    await updateRolePermission(selectedRole, { [field]: !currentValue })
    await load()
    await onSaved()
    setSavingKey(null)
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-bold mb-1">Perfis de acesso</h2>
      <p className="text-sm text-beetz-dark/60 mb-4">
        Defina o que cada papel pode fazer. A Diretoria continua sendo o único perfil que não pode se autocadastrar.
      </p>

      <DepartmentRoleMappingSection departments={departments} roles={permissions} onChanged={load} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {roleOrder.map((role) => (
          <button
            key={role}
            onClick={() => setSelectedRole(role)}
            className={`text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
              selectedRole === role ? 'bg-beetz-dark text-white' : 'bg-beetz-gray text-beetz-dark/70 hover:bg-beetz-dark/10'
            }`}
          >
            {roleLabel(role)}
          </button>
        ))}
        {/* Perfil novo nasce com tudo desligado — a matriz abaixo liga o que
            ele pode. Depois é só apontar departamentos pra ele. */}
        <span className="inline-flex items-center gap-1.5">
          <input
            className="border border-dashed border-beetz-dark/25 rounded-xl px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
            placeholder="Novo perfil (ex: Gerente)"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateRole() }}
          />
          <button
            onClick={handleCreateRole}
            disabled={creatingRole || !newRoleName.trim()}
            className="text-sm font-bold bg-beetz-dark text-white px-3 py-2 rounded-xl disabled:opacity-40"
          >
            {creatingRole ? '...' : '+'}
          </button>
        </span>
      </div>
      {roleError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">{roleError}</p>}
      {current && !current.builtin && (
        <button
          onClick={() => handleDeleteRole(current.role)}
          className="text-xs font-semibold text-red-500 hover:text-red-700 mb-4"
        >
          Excluir o perfil "{current.label}"
        </button>
      )}

      {loading || !current ? (
        <p className="text-sm text-beetz-dark/50">Carregando...</p>
      ) : (
        <div className="space-y-5">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-2">{group.title}</h3>
              <div className="divide-y divide-beetz-dark/5 border border-beetz-dark/5 rounded-xl overflow-hidden">
                {group.fields.map((f) => (
                  <label
                    key={f.key}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-beetz-gray/60 transition-colors ${
                      savingKey === f.key ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(current[f.key])}
                      disabled={savingKey === f.key}
                      onChange={() => toggle(f.key, Boolean(current[f.key]))}
                      className="w-4 h-4 accent-beetz-yellow cursor-pointer shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{f.label}</p>
                      <p className="text-xs text-beetz-dark/50">{f.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Antes o mapeamento departamento -> perfil de acesso era fixo no código
// (só mostrado, não editável). Agora é um filtro de verdade: cada
// departamento cadastrado tem um seletor pra escolher a que perfil ele
// aponta, salvo direto em departments.access_role.
function DepartmentRoleMappingSection({ departments, roles, onChanged }: {
  departments: Department[]
  roles: RolePermissions[]
  onChanged: () => void
}) {
  const [savingId, setSavingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('🐝')
  const [newRole, setNewRole] = useState('colaborador')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleOptions = [...roles].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  const roleLabelOf = (slug: string) => roles.find((r) => r.role === slug)?.label ?? slug

  async function handleChange(deptId: string, role: AccessRole) {
    setSavingId(deptId)
    await updateDepartmentAccessRole(deptId, role)
    await onChanged()
    setSavingId(null)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true); setError(null)
    try {
      await createDepartment({ name: newName, icon: newIcon.trim() || '🐝', access_role: newRole })
      setNewName(''); setNewIcon('🐝')
      await onChanged()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível criar o departamento.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(dept: Department) {
    if (!window.confirm(`Excluir o departamento "${dept.name}"? Só é possível sem pessoas vinculadas.`)) return
    setError(null)
    try {
      await deleteDepartment(dept.id)
      await onChanged()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível excluir.')
    }
  }

  return (
    <div className="mb-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-2">Departamentos → perfil de acesso</h3>
      <p className="text-xs text-beetz-dark/50 mb-3">
        Escolha a que perfil cada departamento aponta — ou crie um departamento novo, que já nasce no
        cadastro, no Mapa da Colmeia e nos filtros. Vários departamentos podem apontar pro mesmo perfil.
      </p>

      {/* Criar departamento: emoji + nome + perfil apontado. */}
      <div className="bg-beetz-gray/60 rounded-xl p-2.5 mb-3 grid grid-cols-[3.2rem_1fr] sm:grid-cols-[3.2rem_1fr_auto_auto] gap-2">
        <input
          className="border border-beetz-dark/15 rounded-lg px-2 py-2 text-center text-lg bg-white"
          value={newIcon} onChange={(e) => setNewIcon(e.target.value)} maxLength={4} title="Emoji do departamento"
        />
        <input
          className="border border-beetz-dark/15 rounded-lg px-3 py-2 text-sm bg-white min-w-0"
          placeholder="Novo departamento (ex: Gerência)"
          value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
        />
        <select
          className="col-span-2 sm:col-span-1 border border-beetz-dark/15 rounded-lg px-2.5 py-2 text-sm bg-white"
          value={newRole} onChange={(e) => setNewRole(e.target.value)}
        >
          {roleOptions.map((r) => <option key={r.role} value={r.role}>{r.label.split(' (')[0]}</option>)}
        </select>
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="col-span-2 sm:col-span-1 text-sm font-bold bg-beetz-dark text-white px-4 py-2 rounded-lg disabled:opacity-40"
        >
          {creating ? '...' : 'Criar'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">{error}</p>}

      <div className="divide-y divide-beetz-dark/5 border border-beetz-dark/5 rounded-xl overflow-hidden">
        {departments.map((dept) => (
          <div key={dept.id} className={`flex items-center gap-3 px-4 py-2.5 ${savingId === dept.id ? 'opacity-50' : ''}`}>
            <span className="text-lg shrink-0">{dept.icon}</span>
            <span className="text-sm font-medium flex-1 min-w-0 truncate">{dept.name}</span>
            <select
              className="text-sm border border-beetz-dark/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow max-w-[45%]"
              value={dept.access_role}
              disabled={savingId === dept.id}
              onChange={(e) => handleChange(dept.id, e.target.value as AccessRole)}
              title={`Aponta pra: ${roleLabelOf(dept.access_role)}`}
            >
              {roleOptions.map((r) => (
                <option key={r.role} value={r.role}>{r.label.split(' (')[0]}</option>
              ))}
            </select>
            {dept.slug !== 'diretoria' && (
              <button
                onClick={() => handleDelete(dept)}
                className="text-beetz-dark/30 hover:text-red-600 p-1.5 rounded-lg hover:bg-beetz-gray shrink-0"
                title="Excluir departamento (só sem pessoas vinculadas)"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {departments.length === 0 && <p className="text-xs text-beetz-dark/40 px-4 py-3">Nenhum departamento cadastrado.</p>}
      </div>
    </div>
  )
}

// ---------- Categorias de despesa & Formas de pagamento ----------
function ListsSection() {
  return (
    <section className={cardClass}>
      <h2 className="text-lg font-bold mb-1">Listas de opções</h2>
      <p className="text-sm text-beetz-dark/60 mb-4">Categorias e formas de pagamento usadas no cadastro de despesas.</p>
      <div className="grid md:grid-cols-2 gap-6">
        <EditableChipList
          title="Categorias de despesa"
          load={listExpenseCategories}
          create={createExpenseCategory}
          remove={deleteExpenseCategory}
          placeholder="Ex: Marketing"
        />
        <EditableChipList
          title="Formas de pagamento"
          load={listPaymentMethods}
          create={createPaymentMethod}
          remove={deletePaymentMethod}
          placeholder="Ex: Vale-refeição"
        />
      </div>
    </section>
  )
}

function EditableChipList({
  title, load, create, remove, placeholder
}: {
  title: string
  load: () => Promise<(ExpenseCategory | PaymentMethodOption)[]>
  create: (name: string) => Promise<ExpenseCategory | PaymentMethodOption>
  remove: (id: string) => Promise<void>
  placeholder: string
}) {
  const [items, setItems] = useState<(ExpenseCategory | PaymentMethodOption)[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function refresh() {
    setLoading(true)
    setItems(await load())
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    await create(name)
    setNewName('')
    await refresh()
    setSaving(false)
  }

  async function handleRemove(id: string) {
    setSaving(true)
    await remove(id)
    await refresh()
    setSaving(false)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {loading ? (
        <p className="text-sm text-beetz-dark/50">Carregando...</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {items.map((item) => (
            <span key={item.id} className="flex items-center gap-1.5 bg-beetz-gray text-xs font-medium px-2.5 py-1.5 rounded-full">
              {item.name}
              <button onClick={() => handleRemove(item.id)} disabled={saving} className="text-beetz-dark/40 hover:text-red-600">
                <X size={12} />
              </button>
            </span>
          ))}
          {items.length === 0 && <p className="text-xs text-beetz-dark/40">Nenhum item cadastrado.</p>}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder={placeholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !newName.trim()}
          className="shrink-0 flex items-center gap-1 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors disabled:opacity-50"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------- Modalidades de serviço (usadas no Portal do Produtor) ----------
function ModalitiesSection() {
  const [modalities, setModalities] = useState<ServiceModality[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('un')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setModalities(await listServiceModalities())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!newName.trim()) return
    setSaving(true)
    await createServiceModality({
      name: newName.trim(), description: null, unit_label: newUnit.trim() || 'un',
      requires_staffing: false, requires_products: false, sort_order: modalities.length + 1
    })
    setNewName(''); setNewUnit('un')
    await load()
    setSaving(false)
  }

  async function handleRemove(id: string) {
    setSaving(true)
    await deleteServiceModality(id)
    await load()
    setSaving(false)
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-bold mb-1">Modalidades de serviço</h2>
      <p className="text-sm text-beetz-dark/60 mb-4">
        O que o produtor pode contratar no Portal do Produtor (ex: serviço completo, máquinas de cartão,
        aluguel de mesa/grade). Ele pode combinar mais de uma no mesmo evento.
      </p>

      {loading ? (
        <p className="text-sm text-beetz-dark/50">Carregando...</p>
      ) : (
        <div className="space-y-2 mb-4">
          {modalities.map((m) => (
            <ModalityRow key={m.id} modality={m} onSaved={load} onRemove={() => handleRemove(m.id)} disabled={saving} />
          ))}
          {modalities.length === 0 && <p className="text-xs text-beetz-dark/40">Nenhuma modalidade cadastrada.</p>}
        </div>
      )}

      <div className="flex gap-2">
        <input className={inputClass} placeholder="Nova modalidade (ex: Aluguel de palco)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input className="w-28 border border-beetz-dark/15 rounded-xl px-2 py-2 text-sm" placeholder="unidade" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
        <button
          onClick={handleAdd} disabled={saving || !newName.trim()}
          className="shrink-0 flex items-center gap-1 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors disabled:opacity-50"
        >
          <Plus size={16} />
        </button>
      </div>
    </section>
  )
}

function ModalityRow({ modality, onSaved, onRemove, disabled }: { modality: ServiceModality; onSaved: () => void; onRemove: () => void; disabled: boolean }) {
  const [description, setDescription] = useState(modality.description ?? '')
  const [requiresStaffing, setRequiresStaffing] = useState(modality.requires_staffing)
  const [requiresProducts, setRequiresProducts] = useState(modality.requires_products)
  const [saving, setSaving] = useState(false)
  const dirty = description !== (modality.description ?? '') || requiresStaffing !== modality.requires_staffing || requiresProducts !== modality.requires_products

  async function handleSave() {
    setSaving(true)
    await updateServiceModality(modality.id, { description: description || null, requires_staffing: requiresStaffing, requires_products: requiresProducts })
    await onSaved()
    setSaving(false)
  }

  return (
    <div className="bg-beetz-gray rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-sm min-w-[160px]">{modality.name}</span>
        <span className="text-xs text-beetz-dark/50">unidade: {modality.unit_label}</span>
        <div className="flex-1" />
        <button onClick={onRemove} disabled={disabled} className="text-beetz-dark/40 hover:text-red-600 p-1.5 rounded-lg hover:bg-beetz-dark/5">
          <Trash2 size={14} />
        </button>
      </div>
      <input
        className="w-full border border-beetz-dark/15 rounded-lg px-2 py-1.5 text-sm"
        value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (aparece pro produtor)"
      />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-beetz-dark/70">
          <input type="checkbox" checked={requiresStaffing} onChange={(e) => setRequiresStaffing(e.target.checked)} className="accent-beetz-yellow" />
          Exige equipe (pergunta quantidade de pessoal)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-beetz-dark/70">
          <input type="checkbox" checked={requiresProducts} onChange={(e) => setRequiresProducts(e.target.checked)} className="accent-beetz-yellow" />
          Envolve produtos de bar/cozinha
        </label>
        <button
          onClick={handleSave} disabled={!dirty || saving}
          className="ml-auto shrink-0 flex items-center gap-1 text-xs font-semibold bg-beetz-dark text-white px-3 py-1.5 rounded-lg hover:bg-black transition-colors disabled:opacity-40"
        >
          <Save size={12} /> Salvar
        </button>
      </div>
    </div>
  )
}

// ---------- Gamificação: níveis e medalhas ----------
function GamificationSection({ onSaved }: { onSaved: () => void }) {
  const [levels, setLevels] = useState<HiveLevelConfig[]>([])
  const [badges, setBadges] = useState<BadgeDefConfig[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [l, b] = await Promise.all([listHiveLevelsConfig(), listBadgeDefsConfig()])
    setLevels(l)
    setBadges(b)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-bold mb-1">Gamificação</h2>
      <p className="text-sm text-beetz-dark/60 mb-4">Ajuste os níveis da colmeia e as medalhas conquistáveis.</p>

      {loading ? (
        <p className="text-sm text-beetz-dark/50">Carregando...</p>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-2">Níveis da colmeia</h3>
            <div className="space-y-2">
              {levels.sort((a, b) => a.sort_order - b.sort_order).map((level) => (
                <HiveLevelRow key={level.id} level={level} onSaved={async () => { await load(); await onSaved() }} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Medalhas</h3>
            <div className="space-y-2">
              {badges.map((badge) => (
                <BadgeRow key={badge.id} badge={badge} onSaved={async () => { await load(); await onSaved() }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function HiveLevelRow({ level, onSaved }: { level: HiveLevelConfig; onSaved: () => void }) {
  const [icon, setIcon] = useState(level.icon ?? '')
  const [minEvents, setMinEvents] = useState(level.min_events)
  const [description, setDescription] = useState(level.description ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = icon !== (level.icon ?? '') || minEvents !== level.min_events || description !== (level.description ?? '')

  async function handleSave() {
    setSaving(true)
    await updateHiveLevel(level.id, { icon, min_events: minEvents, description })
    await onSaved()
    setSaving(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-beetz-gray rounded-xl p-3">
      <input className="w-14 text-center border border-beetz-dark/15 rounded-lg px-2 py-1.5 text-sm" value={icon} onChange={(e) => setIcon(e.target.value)} />
      <span className="font-semibold text-sm min-w-[160px]">{level.level}</span>
      <label className="flex items-center gap-1.5 text-xs text-beetz-dark/60">
        Mín. eventos
        <input
          type="number" min={0} className="w-16 border border-beetz-dark/15 rounded-lg px-2 py-1.5 text-sm"
          value={minEvents} onChange={(e) => setMinEvents(Number(e.target.value))}
        />
      </label>
      <input
        className="flex-1 min-w-[160px] border border-beetz-dark/15 rounded-lg px-2 py-1.5 text-sm"
        value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição"
      />
      <button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="shrink-0 flex items-center gap-1 text-xs font-semibold bg-beetz-dark text-white px-3 py-2 rounded-lg hover:bg-black transition-colors disabled:opacity-40"
      >
        <Save size={13} /> Salvar
      </button>
    </div>
  )
}

function BadgeRow({ badge, onSaved }: { badge: BadgeDefConfig; onSaved: () => void }) {
  const [icon, setIcon] = useState(badge.icon ?? '')
  const [label, setLabel] = useState(badge.label)
  const [description, setDescription] = useState(badge.description ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = icon !== (badge.icon ?? '') || label !== badge.label || description !== (badge.description ?? '')

  async function handleSave() {
    setSaving(true)
    await updateBadgeDef(badge.id, { icon, label, description })
    await onSaved()
    setSaving(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-beetz-gray rounded-xl p-3">
      <input className="w-14 text-center border border-beetz-dark/15 rounded-lg px-2 py-1.5 text-sm" value={icon} onChange={(e) => setIcon(e.target.value)} />
      <input
        className="min-w-[140px] border border-beetz-dark/15 rounded-lg px-2 py-1.5 text-sm font-semibold"
        value={label} onChange={(e) => setLabel(e.target.value)}
      />
      <input
        className="flex-1 min-w-[160px] border border-beetz-dark/15 rounded-lg px-2 py-1.5 text-sm"
        value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição"
      />
      <button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="shrink-0 flex items-center gap-1 text-xs font-semibold bg-beetz-dark text-white px-3 py-2 rounded-lg hover:bg-black transition-colors disabled:opacity-40"
      >
        <Save size={13} /> Salvar
      </button>
    </div>
  )
}

// ---------- Dados gerais da marca ----------
// Um form só pra tudo que é identidade: símbolo, nomes e textos. O que NÃO está
// aqui é tão importante quanto o que está — os ícones do PWA e as cores são
// arquivo/classe no repo, e a tela diz isso em vez de fingir que dá.
type BrandForm = Pick<AppSettings,
  'company_name' | 'short_name' | 'welcome_title' | 'welcome_subtitle' |
  'login_title' | 'login_subtitle' | 'pwa_name' | 'pwa_short_name' | 'pwa_description'
> & { info_text: string; default_tax_percentage: string }

function BrandSection() {
  const { appSettings, refreshConfig } = useConfig()
  const [form, setForm] = useState<BrandForm>(pickBrand(appSettings))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  function pickBrand(s: AppSettings): BrandForm {
    return {
      company_name: s.company_name, short_name: s.short_name,
      welcome_title: s.welcome_title, welcome_subtitle: s.welcome_subtitle,
      login_title: s.login_title, login_subtitle: s.login_subtitle,
      pwa_name: s.pwa_name, pwa_short_name: s.pwa_short_name,
      pwa_description: s.pwa_description, info_text: s.info_text ?? '',
      default_tax_percentage: String(s.default_tax_percentage ?? 0)
    }
  }

  useEffect(() => { setForm(pickBrand(appSettings)) }, [appSettings])
  const set = (k: keyof BrandForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoBusy(true); setError(null)
    try {
      await uploadBrandLogo(file)
      await refreshConfig()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar o logo.')
    } finally {
      setLogoBusy(false)
      // Zera o input pra dar pra reenviar o mesmo arquivo depois de um erro.
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleLogoRemove() {
    setLogoBusy(true); setError(null)
    try {
      await removeBrandLogo()
      await refreshConfig()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover o logo.')
    } finally {
      setLogoBusy(false)
    }
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null)
    try {
      await updateAppSettings({
        ...form,
        info_text: form.info_text.trim() || null,
        default_tax_percentage: Number(form.default_tax_percentage.replace(',', '.')) || 0
      })
      await refreshConfig()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-bold mb-1">Dados gerais da marca</h2>
      <p className="text-sm text-beetz-dark/60 mb-5">
        O símbolo, os nomes e os textos que a turma vê. Muda na hora, sem publicar nada.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      <div className="space-y-6 max-w-xl">
        {/* Símbolo */}
        <div>
          <label className="text-sm font-medium block mb-2">Símbolo da marca</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl border border-beetz-dark/10 overflow-hidden flex items-center justify-center bg-white shrink-0">
              {appSettings.logo_url
                ? <img src={appSettings.logo_url} alt="" className="w-full h-full object-contain" />
                : <span className="text-3xl">🐝</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={`flex items-center gap-1.5 text-sm font-semibold border border-beetz-dark/15 px-3.5 py-2 rounded-xl cursor-pointer hover:bg-beetz-gray ${logoBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                <Upload size={15} />
                {logoBusy ? 'Enviando...' : appSettings.logo_url ? 'Trocar logo' : 'Enviar logo'}
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden" onChange={handleLogoChange} />
              </label>
              {appSettings.logo_url && (
                <button onClick={handleLogoRemove} disabled={logoBusy}
                  className="flex items-center gap-1.5 text-sm font-semibold text-beetz-dark/60 hover:text-red-600 px-3 py-2 rounded-xl hover:bg-beetz-gray disabled:opacity-60">
                  <Trash2 size={15} /> Remover
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-beetz-dark/40 mt-2">
            PNG, JPG, WEBP ou SVG, até 2 MB. Aparece no menu, no login e no portal do produtor.
            Sem logo, fica o 🐝.
          </p>
        </div>

        {/* Nomes */}
        <div className="grid sm:grid-cols-2 gap-4 pt-5 border-t border-beetz-dark/5">
          <div>
            <label className="text-sm font-medium block mb-1">Nome da empresa</label>
            <input className={inputClass} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Nome curto</label>
            <input className={inputClass} value={form.short_name} onChange={(e) => set('short_name', e.target.value)} />
            <p className="text-xs text-beetz-dark/40 mt-1">O que aparece embaixo do nome, no menu.</p>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Imposto padrão sobre a receita (%)</label>
            <input
              className={inputClass} type="text" inputMode="decimal" placeholder="Ex: 6"
              value={form.default_tax_percentage} onChange={(e) => set('default_tax_percentage', e.target.value)}
            />
            <p className="text-xs text-beetz-dark/40 mt-1">
              Usado no fechamento dos eventos, sobre a receita da Beetz (comissão + créditos). Cada evento pode sobrescrever.
            </p>
          </div>
        </div>

        {/* Boas-vindas */}
        <div className="space-y-4 pt-5 border-t border-beetz-dark/5">
          <p className="text-xs font-bold uppercase tracking-wide text-beetz-dark/35">Tela de boas-vindas</p>
          <div>
            <label className="text-sm font-medium block mb-1">Título</label>
            <input className={inputClass} value={form.welcome_title} onChange={(e) => set('welcome_title', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Subtítulo</label>
            <input className={inputClass} value={form.welcome_subtitle} onChange={(e) => set('welcome_subtitle', e.target.value)} />
          </div>
        </div>

        {/* Login */}
        <div className="space-y-4 pt-5 border-t border-beetz-dark/5">
          <p className="text-xs font-bold uppercase tracking-wide text-beetz-dark/35">Tela de login</p>
          <div>
            <label className="text-sm font-medium block mb-1">Título</label>
            <input className={inputClass} value={form.login_title} onChange={(e) => set('login_title', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Subtítulo</label>
            <input className={inputClass} value={form.login_subtitle} onChange={(e) => set('login_subtitle', e.target.value)} />
          </div>
          <p className="text-xs text-beetz-dark/40">
            Vale só pra quem está entrando. A tela de criar conta tem texto próprio, fixo.
          </p>
        </div>

        {/* Informações */}
        <div className="pt-5 border-t border-beetz-dark/5">
          <label className="text-sm font-medium block mb-1">Texto da página Informações</label>
          <textarea className={`${inputClass} min-h-[90px]`} value={form.info_text}
            onChange={(e) => set('info_text', e.target.value)}
            placeholder="Deixe em branco para usar o texto padrão do app." />
        </div>

        {/* PWA */}
        <div className="space-y-4 pt-5 border-t border-beetz-dark/5">
          <p className="text-xs font-bold uppercase tracking-wide text-beetz-dark/35">App instalado no celular</p>
          <div className="bg-beetz-dark text-white rounded-2xl p-4 flex gap-3">
            <ShieldAlert size={18} className="shrink-0 text-beetz-yellow mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold mb-1">Só vale pra quem instalar depois.</p>
              <p className="text-white/60">
                O celular grava o nome e o ícone no momento em que o app é instalado. Quem já
                instalou continua vendo o antigo até desinstalar e instalar de novo — é regra do
                sistema, não dá pra forçar daqui. O <strong className="font-semibold text-white/80">ícone</strong> vem
                do logo enviado na seção acima: ao trocá-lo, geramos os tamanhos de app
                automaticamente.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Nome do app</label>
              <input className={inputClass} value={form.pwa_name} onChange={(e) => set('pwa_name', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Nome curto (embaixo do ícone)</label>
              <input className={inputClass} value={form.pwa_short_name} onChange={(e) => set('pwa_short_name', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Descrição</label>
            <input className={inputClass} value={form.pwa_description} onChange={(e) => set('pwa_description', e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-5 border-t border-beetz-dark/5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60"
          >
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">Salvo!</span>}
        </div>
      </div>
    </section>
  )
}

// ---------- Importador de perfis (CSV) ----------
// Sobe um .csv, mapeia colunas pros campos de pré-cadastro e grava em
// zoho_pending_profiles (nunca em profiles direto). Quem tiver o e-mail nessa
// lista pré-preenche o cadastro sozinho ao entrar pela primeira vez — ver
// claim_pending_profile / AuthContext.
type CsvRow = Record<string, string>

const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Nova abelha', 'Em treinamento', 'Colaborador frequente', 'Líder de bar']

const IMPORT_FIELDS: { key: keyof ZohoPendingProfile; label: string; synonyms: string[] }[] = [
  { key: 'email', label: 'E-mail (obrigatório)', synonyms: ['email', 'e-mail', 'mail'] },
  { key: 'first_name', label: 'Nome', synonyms: ['nome', 'first_name', 'primeiro_nome'] },
  { key: 'last_name', label: 'Sobrenome', synonyms: ['sobrenome', 'last_name', 'ultimo_nome'] },
  { key: 'cpf', label: 'CPF', synonyms: ['cpf'] },
  { key: 'phone', label: 'Telefone', synonyms: ['telefone', 'phone', 'celular', 'telefone_trabalho'] },
  { key: 'mother_name', label: 'Nome da mãe', synonyms: ['nome_da_mae', 'mother_name'] },
  { key: 'father_name', label: 'Nome do pai', synonyms: ['nome_do_pai', 'father_name'] },
  { key: 'city', label: 'Cidade', synonyms: ['cidade', 'city'] },
  { key: 'state', label: 'Estado', synonyms: ['estado', 'state', 'uf'] },
  { key: 'role_hint', label: 'Função/cargo', synonyms: ['funcao', 'função', 'role_hint', 'cargo'] },
  { key: 'avatar_url', label: 'Foto (URL)', synonyms: ['foto_url', 'avatar_url', 'photo_url'] },
  { key: 'about_me', label: 'Sobre mim', synonyms: ['sobre_mim', 'about_me'] },
  { key: 'fun_fact', label: 'Curiosidade', synonyms: ['curiosidade', 'fun_fact'] },
  { key: 'favorite_events', label: 'Eventos favoritos', synonyms: ['eventos_favoritos', 'favorite_events'] },
  { key: 'instagram', label: 'Instagram', synonyms: ['instagram'] },
  { key: 'personal_quote', label: 'Frase pessoal', synonyms: ['frase', 'personal_quote'] },
  { key: 'skills', label: 'Habilidades', synonyms: ['habilidades', 'skills'] },
  { key: 'work_location', label: 'Local de trabalho', synonyms: ['local_trabalho', 'work_location'] },
  { key: 'experience_level', label: 'Nível de experiência', synonyms: ['experiencia', 'experience_level'] },
  { key: 'entry_date', label: 'Data de entrada', synonyms: ['data_entrada', 'entry_date'] },
  { key: 'zoho_record_id', label: 'ID no sistema de origem', synonyms: ['zoho_record_id', 'id_funcionario', 'id'] }
]

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizeCpf(v: any): string | null {
  if (!v) return null
  const digits = String(v).replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 11 ? digits.padStart(11, '0') : null
}

function normalizeExperience(v: any): ExperienceLevel | null {
  const s = String(v || '').trim()
  return (EXPERIENCE_LEVELS as string[]).includes(s) ? (s as ExperienceLevel) : null
}

function normalizeSkills(v: any): string[] {
  const s = String(v || '').trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.map(String).map((x) => x.trim()).filter(Boolean)
  } catch { /* não era JSON, tenta o formato de array do Postgres abaixo */ }
  return s.replace(/^\{|\}$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean)
}

function normalizeDate(v: any): string | null {
  const s = String(v || '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

// Extrai dados de uma coluna JSON solta na planilha (ex: raw_zoho) — usado
// como reforço/fallback quando a coluna direta correspondente vier vazia.
// Só pega o que é realmente necessário: propositalmente NÃO extrai idade,
// data de nascimento, conta bancária nem endereço completo (minimização de dado).
function extractFromJsonColumn(raw: string): Partial<ZohoPendingProfile> {
  try {
    const obj = JSON.parse(raw)
    const nome = obj.Nome || {}
    const enderec = obj.Enderec || {}
    return {
      email: obj.Email ? String(obj.Email).trim().toLowerCase() : undefined,
      cpf: normalizeCpf(obj.CPF) ?? undefined,
      phone: obj.Telefone ? String(obj.Telefone).trim() : undefined,
      mother_name: obj.Nome_da_mae ? String(obj.Nome_da_mae).trim() : undefined,
      father_name: obj.Nome_do_pai ? String(obj.Nome_do_pai).trim() : undefined,
      role_hint: obj.Funcao ? String(obj.Funcao).trim() : undefined,
      city: enderec.district_city ? String(enderec.district_city).trim() : undefined,
      state: enderec.state_province ? String(enderec.state_province).trim() : undefined,
      first_name: nome.first_name ? String(nome.first_name).trim() : undefined,
      last_name: nome.last_name ? String(nome.last_name).trim() : undefined,
      experience_level: normalizeExperience(obj.Experiencia) ?? undefined
    }
  } catch {
    return {}
  }
}

function looksLikeJsonObjectColumn(rows: CsvRow[], header: string): boolean {
  const sample = rows.find((r) => r[header] && r[header].trim().startsWith('{'))
  if (!sample) return false
  try {
    const parsed = JSON.parse(sample[header])
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

function buildRow(csvRow: CsvRow, mapping: Record<string, string>, jsonColumn: string): Partial<ZohoPendingProfile> {
  const fromFlat: Partial<ZohoPendingProfile> = {}
  for (const field of IMPORT_FIELDS) {
    const header = mapping[field.key]
    if (!header) continue
    const raw = csvRow[header]
    if (raw === undefined || raw === null || raw === '') continue
    switch (field.key) {
      case 'cpf': fromFlat.cpf = normalizeCpf(raw); break
      case 'skills': fromFlat.skills = normalizeSkills(raw); break
      case 'experience_level': fromFlat.experience_level = normalizeExperience(raw); break
      case 'entry_date': fromFlat.entry_date = normalizeDate(raw); break
      case 'email': fromFlat.email = raw.trim().toLowerCase(); break
      default: (fromFlat as any)[field.key] = raw.trim()
    }
  }

  const fromJson = jsonColumn && csvRow[jsonColumn] ? extractFromJsonColumn(csvRow[jsonColumn]) : {}

  // A coluna direta manda; o JSON só preenche o que ficou faltando.
  const merged: Partial<ZohoPendingProfile> = { ...fromJson, ...fromFlat }
  if (!merged.email && fromJson.email) merged.email = fromJson.email
  if (!merged.skills) merged.skills = []
  return merged
}

function DataImporterSection() {
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [jsonColumn, setJsonColumn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ totalRows: number; imported: number; skippedNoEmail: number; skippedAlreadyClaimed: number } | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ totalFetched: number; imported: number; skippedNoEmail: number; skippedAlreadyClaimed: number } | null>(null)

  const [inspecting, setInspecting] = useState(false)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [inspectFields, setInspectFields] = useState<{ link_name: string; display_name: string; type: number }[] | null>(null)

  const [listingMeta, setListingMeta] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ forms: ZohoMetaItem[]; reports: ZohoMetaItem[] } | null>(null)

  const [peekReportLinkName, setPeekReportLinkName] = useState('')
  const [peeking, setPeeking] = useState(false)
  const [peekError, setPeekError] = useState<string | null>(null)
  const [peekResult, setPeekResult] = useState<ZohoReportPeek | null>(null)

  type PhotoProgress = { running: boolean; succeeded: number; failed: number; remaining: number | null; error: string | null }
  const [avatarProgress, setAvatarProgress] = useState<PhotoProgress>({ running: false, succeeded: 0, failed: 0, remaining: null, error: null })
  const [docProgress, setDocProgress] = useState<PhotoProgress>({ running: false, succeeded: 0, failed: 0, remaining: null, error: null })

  // Roda em lotes até acabar (remaining chega a 0), atualizando o progresso na
  // tela a cada rodada — é isso que dá o efeito "por etapas" pedido, em vez de
  // um import silencioso de uma vez só.
  async function runPhotoImport(mode: 'avatar' | 'document') {
    const setProgress = mode === 'avatar' ? setAvatarProgress : setDocProgress
    setProgress({ running: true, succeeded: 0, failed: 0, remaining: null, error: null })
    let totalSucceeded = 0
    let totalFailed = 0
    try {
      while (true) {
        const res = await importPendingPhotosBatch(mode, 50)
        totalSucceeded += res.succeeded
        totalFailed += res.failed
        setProgress({ running: true, succeeded: totalSucceeded, failed: totalFailed, remaining: res.remaining, error: null })
        if (res.remaining <= 0 || res.processed === 0) break
      }
    } catch (err: any) {
      // "Não autenticado" nesse contexto quase sempre é sessão expirada no
      // meio de um processo longo (várias dezenas de lotes) — deixa isso
      // explícito em vez do erro seco, pra não parecer que travou.
      const raw: string = err?.message ?? 'Erro ao importar fotos.'
      const friendly = raw.toLowerCase().includes('não autenticado') || raw.toLowerCase().includes('nao autenticado')
        ? 'Sua sessão expirou no meio do processo. Atualize a página, entre de novo e clique no botão pra continuar de onde parou.'
        : raw
      setProgress({ running: false, succeeded: totalSucceeded, failed: totalFailed, remaining: null, error: friendly })
      return
    }
    setProgress((p) => ({ ...p, running: false }))
  }

  // Contagem "ao vivo" do banco — não depende do resultado da última
  // sincronização, então dá pra conferir a qualquer momento se está tudo
  // sincronizado (e não só o que a última rodada trouxe).
  const [stats, setStats] = useState<ZohoPendingProfilesStats | null>(null)
  async function loadStats() {
    try {
      setStats(await getZohoPendingProfilesStats())
    } catch {
      // Não trava a tela por causa disso — é só um número informativo.
    }
  }
  useEffect(() => { loadStats() }, [])

  const [authCode, setAuthCode] = useState('')
  const [authorizing, setAuthorizing] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authResult, setAuthResult] = useState<ZohoAuthorizeResult | null>(null)

  // Troca o código colado por refresh token DENTRO da edge function — nasceu
  // do dia em que renovar o token exigia curl no terminal e o terminal venceu
  // a briga. O token não passa nem pelo navegador: vai direto pro cofre.
  async function handleAuthorize(e: React.FormEvent) {
    e.preventDefault()
    if (!authCode.trim()) return
    setAuthorizing(true)
    setAuthError(null)
    setAuthResult(null)
    try {
      const res = await authorizeZohoWithCode(authCode.trim())
      setAuthResult(res)
      setAuthCode('')
      await loadStats()
    } catch (err: any) {
      setAuthError(err?.message ?? 'Erro ao autorizar o Zoho.')
    } finally {
      setAuthorizing(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    setSyncResult(null)
    // Limpa também o resultado/erro do diagnóstico — os dois botões mexem no
    // mesmo cartão, e um banner de um botão ficando na tela depois de clicar
    // no outro só confunde (parecia "conectou mas não sincronizou").
    setInspectError(null)
    setInspectFields(null)
    try {
      const res = await syncZohoCreator()
      setSyncResult(res)
      await loadStats()
    } catch (err: any) {
      setSyncError(err?.message ?? 'Erro ao sincronizar com o Zoho Creator.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleInspect() {
    setInspecting(true)
    setInspectError(null)
    setInspectFields(null)
    setSyncError(null)
    setSyncResult(null)
    try {
      const res = await inspectZohoCreatorFields()
      setInspectFields(res.fields)
    } catch (err: any) {
      setInspectError(err?.message ?? 'Erro ao consultar os campos do Zoho Creator.')
    } finally {
      setInspecting(false)
    }
  }

  async function handleListMeta() {
    setListingMeta(true)
    setMetaError(null)
    setMeta(null)
    try {
      const res = await listZohoMeta()
      setMeta(res)
    } catch (err: any) {
      setMetaError(err?.message ?? 'Erro ao listar formulários e relatórios do Zoho.')
    } finally {
      setListingMeta(false)
    }
  }

  async function handlePeek(e: React.FormEvent) {
    e.preventDefault()
    if (!peekReportLinkName.trim()) return
    setPeeking(true)
    setPeekError(null)
    setPeekResult(null)
    try {
      const res = await peekZohoReport(peekReportLinkName.trim())
      setPeekResult(res)
    } catch (err: any) {
      setPeekError(err?.message ?? 'Erro ao pré-visualizar o relatório.')
    } finally {
      setPeeking(false)
    }
  }

  function reset() {
    setStep('upload'); setFileName(''); setHeaders([]); setRows([]); setMapping({}); setJsonColumn(''); setError(null); setResult(null)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setFileName(file.name)
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res: any) => {
        const fields: string[] = res.meta.fields ?? []
        if (fields.length === 0) {
          setError('Não consegui ler colunas nesse arquivo. Confirma que é um .csv com cabeçalho na primeira linha.')
          return
        }
        const data: CsvRow[] = res.data
        const autoMapping: Record<string, string> = {}
        for (const field of IMPORT_FIELDS) {
          const match = fields.find((h) => field.synonyms.includes(normalizeHeader(h)))
          if (match) autoMapping[field.key] = match
        }
        const jsonCandidate = fields.find((h) => looksLikeJsonObjectColumn(data, h))
        setHeaders(fields)
        setRows(data)
        setMapping(autoMapping)
        setJsonColumn(jsonCandidate ?? '')
        setStep('map')
      },
      error: (err: any) => setError(err?.message ?? 'Erro ao ler o arquivo.')
    })
  }

  const previewRows = rows.slice(0, 6).map((r) => buildRow(r, mapping, jsonColumn))
  const allMapped = rows.map((r) => buildRow(r, mapping, jsonColumn))
  const withEmailCount = allMapped.filter((r) => !!r.email).length

  async function handleConfirm() {
    setImporting(true)
    setError(null)
    try {
      const res = await importZohoPendingProfiles(allMapped)
      setResult(res)
      setStep('done')
      await loadStats()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao importar. Tente novamente.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Database size={18} /> Importador de dados</h2>
      <p className="text-sm text-beetz-dark/60 mb-4">
        Tudo que dá pra trazer do sistema antigo (Zoho Creator) pro Colmeia: perfis de colaboradores,
        fotos, documentos e, mais abaixo, um jeito de descobrir quais outros relatórios do Zoho (eventos,
        fechamento, repasses) ainda dá pra importar pro BI. Ninguém vira usuário automaticamente — os dados
        de um pré-cadastro só entram no perfil da pessoa quando ela mesma se cadastra com o e-mail
        correspondente, e ela revisa tudo antes de confirmar.
      </p>

      <div className="bg-beetz-gray rounded-xl p-4 mb-5">
        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Search size={14} /> O que já foi trazido do Zoho x o que falta</p>
        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-white rounded-lg p-3 border border-beetz-dark/5">
            <p className="font-semibold text-green-700 mb-1">✓ Já integrado</p>
            <ul className="space-y-1 text-beetz-dark/70 list-disc list-inside">
              <li>Perfis/equipe (relatório Equipe, sincronização abaixo)</li>
              <li>Fotos de perfil e de documento</li>
              <li>Despesas (importação única já feita — ver /financeiro)</li>
            </ul>
          </div>
          <div className="bg-white rounded-lg p-3 border border-beetz-dark/5">
            <p className="font-semibold text-amber-700 mb-1">○ Ainda não importado</p>
            <ul className="space-y-1 text-beetz-dark/70 list-disc list-inside">
              <li>Eventos passados (datas, locais, produtoras)</li>
              <li>Fechamento financeiro por evento</li>
              <li>Repasses às produtoras</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-beetz-dark/60 mt-3">
          Pra trazer os itens da segunda lista, o primeiro passo é clicar em <strong>"Ver formulários e
          relatórios (descoberta)"</strong> mais abaixo — ele lista todos os relatórios que existem no app do
          Zoho com o nome técnico exato de cada um. Assim que eu souber o nome do relatório de Eventos (e dos
          campos de fechamento/repasse dentro dele), dá pra construir a importação real, no mesmo padrão do
          que já existe pra perfis e despesas.
        </p>
      </div>

      {stats && (
        <div className="flex flex-wrap gap-4 bg-beetz-gray rounded-xl p-3.5 mb-4 text-sm">
          <div>
            <span className="font-bold">{stats.total}</span>
            <span className="text-beetz-dark/60"> pré-cadastro(s) no total</span>
          </div>
          <div className="w-px bg-beetz-dark/10" />
          <div>
            <span className="font-bold">{stats.claimed}</span>
            <span className="text-beetz-dark/60"> já viraram perfil (a pessoa se cadastrou)</span>
          </div>
          <div className="w-px bg-beetz-dark/10" />
          <div>
            <span className="font-bold">{stats.waiting}</span>
            <span className="text-beetz-dark/60"> esperando a pessoa se cadastrar</span>
          </div>
        </div>
      )}

      <div className="bg-beetz-gray rounded-xl p-4 mb-5 space-y-4">
        <div>
          <p className="text-sm font-semibold mb-1 flex items-center gap-1.5"><Image size={14} /> Fotos de perfil</p>
          <p className="text-xs text-beetz-dark/60 mb-3">
            Baixa a foto de cada pré-cadastro (hospedada num sistema externo) e sobe pro nosso Storage, em lotes de 50 até terminar.
            Fica público, igual foto de perfil de quem já tem conta.
          </p>
          <button
            onClick={() => runPhotoImport('avatar')}
            disabled={avatarProgress.running}
            className="flex items-center gap-2 bg-beetz-dark text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-black transition-colors disabled:opacity-60"
          >
            <RefreshCw size={15} className={avatarProgress.running ? 'animate-spin' : ''} />
            {avatarProgress.running ? `Baixando... (${avatarProgress.succeeded} ok, ${avatarProgress.remaining ?? '?'} restando)` : 'Baixar fotos de perfil'}
          </button>
          {avatarProgress.error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-3 mt-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {avatarProgress.error}
            </div>
          )}
          {!avatarProgress.running && avatarProgress.remaining === 0 && (
            <p className="text-sm text-green-700 mt-3">
              Concluído: {avatarProgress.succeeded} foto(s) baixada(s){avatarProgress.failed > 0 ? `, ${avatarProgress.failed} falharam (link expirado ou indisponível)` : ''}.
            </p>
          )}
        </div>

        <div className="border-t border-beetz-dark/10 pt-4">
          <p className="text-sm font-semibold mb-1 flex items-center gap-1.5"><ShieldAlert size={14} /> Fotos de documento (dado sensível)</p>
          <p className="text-xs text-beetz-dark/60 mb-3">
            Baixa a foto do documento de identidade de cada pré-cadastro direto da API do Zoho e guarda num Storage
            <strong> privado</strong> — ninguém consegue abrir por link direto. Só a Diretoria consegue ver, uma pessoa
            por vez, através de um link temporário que expira em 5 minutos.
          </p>
          <button
            onClick={() => runPhotoImport('document')}
            disabled={docProgress.running}
            className="flex items-center gap-2 border border-beetz-dark/20 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-white transition-colors disabled:opacity-60"
          >
            <RefreshCw size={15} className={docProgress.running ? 'animate-spin' : ''} />
            {docProgress.running ? `Baixando... (${docProgress.succeeded} ok, ${docProgress.remaining ?? '?'} restando)` : 'Baixar fotos de documento'}
          </button>
          {docProgress.error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-3 mt-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {docProgress.error}
            </div>
          )}
          {!docProgress.running && docProgress.remaining === 0 && (
            <p className="text-sm text-green-700 mt-3">
              Concluído: {docProgress.succeeded} documento(s) baixado(s){docProgress.failed > 0 ? `, ${docProgress.failed} falharam` : ''}.
            </p>
          )}
        </div>
      </div>

      <div className="bg-beetz-gray rounded-xl p-4 mb-5">
        <p className="text-sm font-semibold mb-1 flex items-center gap-1.5"><RefreshCw size={14} /> Sincronizar direto com o Zoho Creator</p>
        <p className="text-xs text-beetz-dark/60 mb-3">
          Busca os registros do relatório Equipe direto na API do Zoho, sem precisar exportar .csv na mão.
          Precisa ter client ID e client secret do Zoho nos secrets da Edge Function
          <code className="bg-white px-1 py-0.5 rounded mx-1">zoho-creator-sync</code>.
          O refresh token é guardado pelo cartão de reautorização abaixo.
        </p>

        {/* Reautorização sem terminal: cola o código do api-console e pronto.
            A troca código→token acontece no servidor; o token vai pro cofre
            no banco e não aparece em lugar nenhum. */}
        <div className="bg-white rounded-xl p-4 border border-beetz-dark/10 mb-4">
          <p className="font-semibold text-sm mb-1 flex items-center gap-1.5">
            <RefreshCw size={14} /> Reautorizar acesso ao Zoho
          </p>
          <p className="text-xs text-beetz-dark/60 mb-2">
            Quando a sincronização reclamar de token ou permissão: entra em <strong>api-console.zoho.com</strong>,
            abre o <strong>Self Client</strong> da integração → aba <strong>Generate Code</strong>, usa o scope
            <code className="bg-beetz-gray px-1 py-0.5 rounded mx-1">ZohoCreator.report.READ,ZohoCreator.meta.READ</code>
            (duração: 10 minutos) e cola o código gerado aqui. Cada código vale uma vez só.
          </p>
          <form onSubmit={handleAuthorize} className="flex flex-wrap gap-2">
            <input
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="Cole o código aqui (começa com 1000.)"
              className="flex-1 min-w-[240px] rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
            />
            <button
              type="submit"
              disabled={authorizing || !authCode.trim()}
              className="flex items-center gap-2 bg-beetz-dark text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-black transition-colors disabled:opacity-60"
            >
              {authorizing ? 'Autorizando...' : 'Autorizar'}
            </button>
          </form>
          {authError && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-3 mt-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {authError}
            </div>
          )}
          {authResult && (
            <div className={`rounded-xl p-3 mt-3 text-sm ${authResult.scope_ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              {authResult.scope_ok
                ? 'Autorizado e testado: a leitura do relatório funcionou. Agora é só clicar em "Sincronizar agora".'
                : (authResult.scope_detail ?? 'Token salvo, mas o teste de leitura falhou — gere o código de novo com o scope indicado acima.')}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-beetz-dark text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-black transition-colors disabled:opacity-60"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
          <button
            onClick={handleInspect}
            disabled={inspecting}
            className="flex items-center gap-2 border border-beetz-dark/15 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-white transition-colors disabled:opacity-60"
            title="Consulta os campos reais do formulário Colaboradores no Zoho, sem gravar nada — útil pra conferir se o mapeamento fixo no código está certo."
          >
            <Search size={15} /> {inspecting ? 'Consultando...' : 'Ver campos do formulário (diagnóstico)'}
          </button>
          <button
            onClick={handleListMeta}
            disabled={listingMeta}
            className="flex items-center gap-2 border border-beetz-dark/15 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-white transition-colors disabled:opacity-60"
            title="Lista todos os formulários e relatórios que existem no app do Zoho, com o link_name de cada um — útil pra descobrir nomes antes de configurar uma nova importação (eventos, despesas etc)."
          >
            <Search size={15} /> {listingMeta ? 'Consultando...' : 'Ver formulários e relatórios (descoberta)'}
          </button>
        </div>
        {syncError && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-3 mt-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {syncError}
          </div>
        )}
        {syncResult && (
          <div className="bg-green-50 text-green-700 rounded-xl p-3 mt-3 text-sm space-y-1">
            <p className="font-semibold">Sincronização concluída — {syncResult.totalFetched} registro(s) encontrado(s) no Zoho.</p>
            <p>{syncResult.imported} pré-cadastrado(s) ou atualizado(s).</p>
            {syncResult.skippedNoEmail > 0 && <p>{syncResult.skippedNoEmail} sem e-mail, ignorado(s).</p>}
            {syncResult.skippedAlreadyClaimed > 0 && <p>{syncResult.skippedAlreadyClaimed} já pertenciam a alguém que já se cadastrou.</p>}
          </div>
        )}
        {inspectError && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-3 mt-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {inspectError}
          </div>
        )}
        {inspectFields && (
          <div className="mt-3">
            <p className="text-xs text-beetz-dark/60 mb-2">
              {inspectFields.length === 0
                ? 'Nenhum campo retornado.'
                : `${inspectFields.length} campo(s) encontrado(s) no formulário. Confira os "link name" abaixo — são esses nomes que precisam bater com o que a Edge Function espera.`}
            </p>
            {inspectFields.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-beetz-dark/10 max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white text-left sticky top-0">
                    <tr>
                      <th className="p-2">Link name (é isso que vai no código)</th>
                      <th className="p-2">Nome exibido no Zoho</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beetz-dark/5 bg-white">
                    {inspectFields.map((f) => (
                      <tr key={f.link_name}>
                        <td className="p-2 font-mono">{f.link_name}</td>
                        <td className="p-2">{f.display_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {metaError && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-3 mt-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {metaError}
          </div>
        )}
        {meta && (
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-xs font-semibold text-beetz-dark/60 mb-2">
                {meta.reports.length} relatório(s) — o "link name" é o que precisa ir na configuração de uma nova importação.
              </p>
              <div className="overflow-x-auto rounded-xl border border-beetz-dark/10 max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white text-left sticky top-0">
                    <tr><th className="p-2">Link name</th><th className="p-2">Nome exibido</th><th className="p-2">Tipo</th></tr>
                  </thead>
                  <tbody className="divide-y divide-beetz-dark/5 bg-white">
                    {meta.reports.map((r) => (
                      <tr key={r.link_name}>
                        <td className="p-2 font-mono">{r.link_name}</td>
                        <td className="p-2">{r.display_name}</td>
                        <td className="p-2">{r.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-beetz-dark/60 mb-2">{meta.forms.length} formulário(s)</p>
              <div className="overflow-x-auto rounded-xl border border-beetz-dark/10 max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white text-left sticky top-0">
                    <tr><th className="p-2">Link name</th><th className="p-2">Nome exibido</th></tr>
                  </thead>
                  <tbody className="divide-y divide-beetz-dark/5 bg-white">
                    {meta.forms.map((f) => (
                      <tr key={f.link_name}>
                        <td className="p-2 font-mono">{f.link_name}</td>
                        <td className="p-2">{f.display_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-beetz-gray rounded-xl p-4 mb-5">
        <p className="text-sm font-semibold mb-1 flex items-center gap-1.5"><Search size={14} /> Pré-visualizar um relatório qualquer</p>
        <p className="text-xs text-beetz-dark/60 mb-3">
          Cole o "link name" de qualquer relatório do app do Zoho (descoberto no botão acima) e veja uma amostra
          de até 5 registros brutos — sem gravar nada no banco. Serve pra entender o formato de um relatório novo
          antes de decidir se/como importar (ex: eventos, fechamento, repasses às produtoras).
        </p>
        <form onSubmit={handlePeek} className="flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-[220px] border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
            placeholder="Ex: Lista_de_transferencias"
            value={peekReportLinkName}
            onChange={(e) => setPeekReportLinkName(e.target.value)}
          />
          <button
            type="submit"
            disabled={peeking || !peekReportLinkName.trim()}
            className="flex items-center gap-2 border border-beetz-dark/15 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-white transition-colors disabled:opacity-60"
          >
            <Search size={15} /> {peeking ? 'Consultando...' : 'Ver amostra'}
          </button>
        </form>
        {peekError && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-3 mt-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {peekError}
          </div>
        )}
        {peekResult && (
          <div className="mt-3">
            <p className="text-xs text-beetz-dark/60 mb-2">
              {peekResult.records.length === 0
                ? 'Nenhum registro encontrado nesse relatório.'
                : `${peekResult.records.length} registro(s) de amostra · campos: ${peekResult.fieldNames.join(', ')}`}
            </p>
            {peekResult.records.length > 0 && (
              <pre className="overflow-auto rounded-xl border border-beetz-dark/10 bg-white text-xs p-3 max-h-72">
                {JSON.stringify(peekResult.records, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-beetz-dark/10" />
        <span className="text-xs text-beetz-dark/40">ou importe um arquivo manualmente</span>
        <div className="flex-1 h-px bg-beetz-dark/10" />
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-3 mb-4">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {step === 'upload' && (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-beetz-dark/15 rounded-xl p-8 cursor-pointer hover:bg-beetz-gray transition-colors">
          <Upload size={22} className="text-beetz-dark/40" />
          <span className="text-sm font-medium">Clique pra escolher um arquivo .csv</span>
          <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </label>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <p className="text-sm text-beetz-dark/70">
            <strong>{fileName}</strong> — {rows.length} linha(s), {headers.length} coluna(s) encontrada(s).
            Confira o mapeamento (já tentei adivinhar sozinho) e ajuste o que precisar.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {IMPORT_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-xs font-medium text-beetz-dark/60 block mb-1">{field.label}</label>
                <select
                  className={inputClass}
                  value={mapping[field.key] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                >
                  <option value="">Nenhuma coluna</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="border-t border-beetz-dark/10 pt-4">
            <label className="text-xs font-medium text-beetz-dark/60 block mb-1">
              Coluna extra em JSON (opcional — usada só pra completar o que faltar nas colunas acima, ex: e-mail escondido dentro de um campo bruto)
            </label>
            <select className={inputClass} value={jsonColumn} onChange={(e) => setJsonColumn(e.target.value)}>
              <option value="">Nenhuma</option>
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-beetz-dark/15 hover:bg-beetz-gray transition-colors">Cancelar</button>
            <button onClick={() => setStep('preview')} className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm">
              Pré-visualizar
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="bg-beetz-gray px-3 py-1.5 rounded-full font-medium">{rows.length} linha(s) no arquivo</span>
            <span className="bg-green-50 text-green-700 px-3 py-1.5 rounded-full font-medium">{withEmailCount} com e-mail válido</span>
            {rows.length - withEmailCount > 0 && (
              <span className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-medium">{rows.length - withEmailCount} sem e-mail (não serão importadas)</span>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-beetz-dark/10">
            <table className="w-full text-xs">
              <thead className="bg-beetz-gray text-left">
                <tr>
                  <th className="p-2">E-mail</th>
                  <th className="p-2">Nome</th>
                  <th className="p-2">CPF</th>
                  <th className="p-2">Cargo</th>
                  <th className="p-2">Cidade/UF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beetz-dark/5">
                {previewRows.map((r, i) => (
                  <tr key={i}>
                    <td className="p-2">{r.email || <span className="text-red-500">sem e-mail</span>}</td>
                    <td className="p-2">{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="p-2">{r.cpf || '—'}</td>
                    <td className="p-2">{r.role_hint || '—'}</td>
                    <td className="p-2">{[r.city, r.state].filter(Boolean).join('/') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-beetz-dark/50">Mostrando as primeiras {previewRows.length} de {rows.length} linhas.</p>
          <div className="flex gap-2">
            <button onClick={() => setStep('map')} className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-beetz-dark/15 hover:bg-beetz-gray transition-colors">Voltar</button>
            <button
              onClick={handleConfirm}
              disabled={importing || withEmailCount === 0}
              className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60"
            >
              {importing ? 'Importando...' : `Confirmar importação de ${withEmailCount} perfil(is)`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="bg-green-50 text-green-700 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold">Importação concluída.</p>
            <p>{result.imported} perfil(is) pré-cadastrado(s) ou atualizado(s).</p>
            {result.skippedNoEmail > 0 && <p>{result.skippedNoEmail} linha(s) ignorada(s) por não ter e-mail.</p>}
            {result.skippedAlreadyClaimed > 0 && <p>{result.skippedAlreadyClaimed} e-mail(s) já pertenciam a alguém que já se cadastrou — não foram sobrescritos.</p>}
          </div>
          <button onClick={reset} className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-beetz-dark/15 hover:bg-beetz-gray transition-colors">
            Importar outro arquivo
          </button>
        </div>
      )}
    </section>
  )
}

// ---------- Disparador de e-mails ----------
// Compõe e envia um e-mail avulso ou pra toda a equipe, via Edge Function
// send-email (SMTP). Depende dos secrets SMTP_HOST/SMTP_PORT/SMTP_USER/
// SMTP_PASS/SMTP_FROM cadastrados na Edge Function — sem eles o envio falha
// com uma mensagem de erro clara, mas a tela funciona normalmente.
function EmailDispatcherSection() {
  const [audience, setAudience] = useState<'single' | 'team'>('single')
  const [singleEmail, setSingleEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<{ sent: number; failed: number; remaining: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null)
  const [teamCount, setTeamCount] = useState<number | null>(null)

  const [log, setLog] = useState<EmailLogEntry[]>([])
  const [loadingLog, setLoadingLog] = useState(true)

  async function loadLog() {
    setLoadingLog(true)
    try {
      setLog(await listEmailLog())
    } catch {
      // Histórico é só informativo — não trava a tela se falhar.
    }
    setLoadingLog(false)
  }

  useEffect(() => { loadLog() }, [])
  useEffect(() => {
    if (audience === 'team' && teamCount === null) {
      listTeamEmails().then((emails) => setTeamCount(emails.length)).catch(() => setTeamCount(0))
    }
  }, [audience, teamCount])

  function htmlFromPlainText(text: string): string {
    return text
      .split('\n\n')
      .map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    setError(null)
    setResult(null)
    setProgress(null)
    const html = htmlFromPlainText(body.trim())
    try {
      if (audience === 'single') {
        if (!singleEmail.trim()) throw new Error('Informe o e-mail do destinatário.')
        await sendEmail(singleEmail.trim(), subject.trim(), html)
        setResult({ sent: 1, failed: 0 })
      } else {
        const emails = await listTeamEmails()
        setTeamCount(emails.length)
        const res = await sendCampaignEmail(emails, subject.trim(), html, (sent, failed, remaining) =>
          setProgress({ sent, failed, remaining })
        )
        setResult({ sent: res.sent, failed: res.failed })
      }
      setSubject('')
      setBody('')
      setSingleEmail('')
      await loadLog()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao enviar e-mail.')
    } finally {
      setSending(false)
    }
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <section className={cardClass}>
      <h2 className="font-bold text-lg mb-1 flex items-center gap-2"><Mail size={18} /> Disparador de e-mails</h2>
      <p className="text-sm text-beetz-dark/60 mb-5">
        Envia e-mails a partir do endereço padrão da Beetz (configurado nos secrets da Edge Function
        <code className="bg-beetz-gray px-1 py-0.5 rounded mx-1">send-email</code>). Pra um destinatário
        específico ou pra toda a equipe de uma vez.
      </p>

      <form onSubmit={handleSend} className="bg-beetz-gray rounded-xl p-4 space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1.5">Destinatário</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button" onClick={() => setAudience('single')}
              className={`text-sm font-medium px-3 py-2.5 rounded-xl border transition-colors ${
                audience === 'single' ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 bg-white'
              }`}
            >
              Um e-mail específico
            </button>
            <button
              type="button" onClick={() => setAudience('team')}
              className={`text-sm font-medium px-3 py-2.5 rounded-xl border transition-colors ${
                audience === 'team' ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 bg-white'
              }`}
            >
              Toda a equipe{teamCount !== null ? ` (${teamCount})` : ''}
            </button>
          </div>
        </div>

        {audience === 'single' && (
          <div>
            <label className="text-sm font-medium block mb-1">E-mail do destinatário</label>
            <input type="email" required className={inputClass} placeholder="alguem@exemplo.com" value={singleEmail} onChange={(e) => setSingleEmail(e.target.value)} />
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1">Assunto</label>
          <input required className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Mensagem</label>
          <textarea required rows={6} className={inputClass} placeholder="Escreva o corpo do e-mail — parágrafos separados por linha em branco viram parágrafos no e-mail." value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <button type="submit" disabled={sending} className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">
          <Send size={15} /> {sending ? 'Enviando...' : audience === 'team' ? 'Enviar pra toda a equipe' : 'Enviar'}
        </button>

        {sending && progress && (
          <p className="text-sm text-beetz-dark/60">
            Enviando... {progress.sent} ok, {progress.failed} falharam, {progress.remaining} restando.
          </p>
        )}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl p-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {result && !sending && (
          <div className="bg-green-50 text-green-700 rounded-xl p-3 text-sm">
            {result.sent} e-mail(s) enviado(s){result.failed > 0 ? `, ${result.failed} falharam (veja o histórico abaixo)` : ''}.
          </div>
        )}
      </form>

      <div className="mt-6">
        <h3 className="font-bold text-sm mb-3">Histórico recente</h3>
        {loadingLog ? (
          <p className="text-sm text-beetz-dark/50">Carregando...</p>
        ) : log.length === 0 ? (
          <p className="text-sm text-beetz-dark/50">Nenhum e-mail enviado ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-beetz-dark/10">
            <table className="w-full text-xs">
              <thead className="bg-beetz-gray text-left">
                <tr>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Destinatário</th>
                  <th className="p-2.5">Assunto</th>
                  <th className="p-2.5">Tipo</th>
                  <th className="p-2.5">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beetz-dark/5 bg-white">
                {log.map((entry) => (
                  <tr key={entry.id}>
                    <td className="p-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {entry.status === 'sent' ? 'Enviado' : 'Falhou'}
                      </span>
                    </td>
                    <td className="p-2.5">{entry.to_email}</td>
                    <td className="p-2.5">{entry.subject}</td>
                    <td className="p-2.5">{entry.kind === 'campaign' ? 'Campanha' : 'Automático'}</td>
                    <td className="p-2.5 text-beetz-dark/50">{formatDateTime(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
