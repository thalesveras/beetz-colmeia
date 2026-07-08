import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { AlertTriangle, Image, Plus, RefreshCw, Search, Upload, X, Save, Settings as SettingsIcon, ShieldAlert, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useConfig } from '../contexts/ConfigContext'
import { ACCESS_ROLE_LABELS, canManageUsers, departmentToAccessRole, type AccessRole } from '../lib/permissions'
import {
  createExpenseCategory, createPaymentMethod, createServiceModality, deleteExpenseCategory,
  deletePaymentMethod, deleteServiceModality, getZohoPendingProfilesStats, importPendingPhotosBatch,
  importZohoPendingProfiles, inspectZohoCreatorFields, listBadgeDefsConfig, listDepartments,
  listExpenseCategories, listHiveLevelsConfig, listPaymentMethods, listRolePermissions,
  listServiceModalities, syncZohoCreator, updateAppSettings, updateBadgeDef, updateHiveLevel,
  updateRolePermission, updateServiceModality
} from '../lib/dataService'
import type { ZohoPendingProfilesStats } from '../lib/dataService'
import type {
  AppSettings, BadgeDefConfig, Department, ExperienceLevel, ExpenseCategory, HiveLevelConfig,
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
      { key: 'can_review_cashier', label: 'Aprovar fechamento de caixa', description: 'Mudar o status entre Pendente, Aprovado e Rejeitado.' }
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
  }
]

const ROLE_ORDER: AccessRole[] = ['diretoria', 'garcom', 'caixa', 'operacional', 'colaborador']

export default function Settings() {
  const { accessRole } = useAuth()
  const { refreshConfig } = useConfig()

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

      <RolePermissionsSection onSaved={refreshConfig} />
      <ListsSection />
      <ModalitiesSection />
      <GamificationSection onSaved={refreshConfig} />
      <BrandSection />
      <ProfileImporterSection />
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
  const deptNamesByRole: Record<AccessRole, string[]> = { diretoria: [], garcom: [], caixa: [], operacional: [], colaborador: [] }
  for (const dept of departments) {
    deptNamesByRole[departmentToAccessRole(dept)].push(dept.name)
  }
  function roleLabel(role: AccessRole): string {
    const names = deptNamesByRole[role]
    if (names.length === 0) return ACCESS_ROLE_LABELS[role]
    const roleName = ACCESS_ROLE_LABELS[role].split(' (')[0]
    return `${roleName} (${names.join(', ')})`
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

      <div className="flex flex-wrap gap-2 mb-5">
        {ROLE_ORDER.map((role) => (
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
      </div>

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
                      checked={current[f.key]}
                      disabled={savingKey === f.key}
                      onChange={() => toggle(f.key, current[f.key])}
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

// ---------- Dados gerais da Beetz ----------
function BrandSection() {
  const { appSettings, refreshConfig } = useConfig()
  const [companyName, setCompanyName] = useState(appSettings.company_name)
  const [welcomeTitle, setWelcomeTitle] = useState(appSettings.welcome_title)
  const [welcomeSubtitle, setWelcomeSubtitle] = useState(appSettings.welcome_subtitle)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setCompanyName(appSettings.company_name)
    setWelcomeTitle(appSettings.welcome_title)
    setWelcomeSubtitle(appSettings.welcome_subtitle)
  }, [appSettings])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await updateAppSettings({ company_name: companyName, welcome_title: welcomeTitle, welcome_subtitle: welcomeSubtitle })
    await refreshConfig()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-bold mb-1">Dados gerais da marca</h2>
      <p className="text-sm text-beetz-dark/60 mb-4">
        Nome da empresa e textos da tela de boas-vindas. As cores continuam fixas no código por enquanto —
        mudar isso exigiria uma reestruturação maior do tema.
      </p>
      <div className="space-y-4 max-w-xl">
        <div>
          <label className="text-sm font-medium block mb-1">Nome da empresa</label>
          <input className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Título da tela de boas-vindas</label>
          <input className={inputClass} value={welcomeTitle} onChange={(e) => setWelcomeTitle(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Subtítulo da tela de boas-vindas</label>
          <input className={inputClass} value={welcomeSubtitle} onChange={(e) => setWelcomeSubtitle(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
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

function ProfileImporterSection() {
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
      setProgress({ running: false, succeeded: totalSucceeded, failed: totalFailed, remaining: null, error: err?.message ?? 'Erro ao importar fotos.' })
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
      <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Upload size={18} /> Importador de perfis</h2>
      <p className="text-sm text-beetz-dark/60 mb-4">
        Sobe uma planilha (.csv) de um sistema antigo pra pré-cadastrar quem ainda não criou conta aqui.
        Ninguém vira usuário automaticamente — os dados só entram no perfil da pessoa quando ela mesma se
        cadastra com o e-mail correspondente, e ela revisa tudo antes de confirmar.
      </p>

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
          Precisa ter os secrets do Zoho (client ID, client secret e refresh token) cadastrados na Edge Function
          <code className="bg-white px-1 py-0.5 rounded mx-1">zoho-creator-sync</code>.
        </p>
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
