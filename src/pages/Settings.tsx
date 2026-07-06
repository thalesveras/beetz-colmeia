import { useEffect, useState } from 'react'
import { Plus, X, Save, Settings as SettingsIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useConfig } from '../contexts/ConfigContext'
import { ACCESS_ROLE_LABELS, canManageUsers, type AccessRole } from '../lib/permissions'
import {
  createExpenseCategory, createPaymentMethod, deleteExpenseCategory, deletePaymentMethod,
  listBadgeDefsConfig, listExpenseCategories, listHiveLevelsConfig, listPaymentMethods,
  listRolePermissions, updateAppSettings, updateBadgeDef, updateHiveLevel, updateRolePermission
} from '../lib/dataService'
import type {
  AppSettings, BadgeDefConfig, ExpenseCategory, HiveLevelConfig, PaymentMethodOption, RolePermissions
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
      { key: 'can_edit_stock', label: 'Editar ou cancelar movimentação', description: 'Corrigir a quantidade de uma movimentação ou cancelá-la.' }
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
      <GamificationSection onSaved={refreshConfig} />
      <BrandSection />
    </div>
  )
}

// ---------- Perfis de acesso ----------
// Em vez de uma tabela larga (uma coluna por permissão), usamos um seletor de
// perfil + uma lista vertical de permissões agrupadas — os perfis quase nunca
// mudam, mas o número de permissões deve crescer, e listas escalam melhor que colunas.
function RolePermissionsSection({ onSaved }: { onSaved: () => void }) {
  const [permissions, setPermissions] = useState<RolePermissions[]>([])
  const [selectedRole, setSelectedRole] = useState<AccessRole>('diretoria')
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setPermissions(await listRolePermissions())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const current = permissions.find((p) => p.role === selectedRole)

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
            {ACCESS_ROLE_LABELS[role]}
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
