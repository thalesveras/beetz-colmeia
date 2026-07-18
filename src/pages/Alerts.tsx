import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, Globe, ListChecks, Mail, Settings as SettingsIcon, ShieldAlert, Smartphone, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ALERT_TYPES } from '../lib/alerts'
import { canConfigureAlerts, ACCESS_ROLES, ACCESS_ROLE_LABELS } from '../lib/permissions'
import {
  disablePushOnThisDevice, enablePushOnThisDevice, isPushEnabledHere, listAlertChannels,
  listNotifications, listRolePermissions, markAllNotificationsRead, markNotificationRead,
  pushSupportedHere, updateAlertChannel, updateRolePermission
} from '../lib/dataService'
import type { AlertChannelSetting, AlertFlagKey, AppNotification, RolePermissions } from '../lib/types'

type TabKey = 'pessoais' | 'globais' | 'escala' | 'config'

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'pessoais', label: 'Alertas pessoais', icon: User },
  { key: 'globais', label: 'Alertas globais', icon: Globe },
  { key: 'escala', label: 'Alertas de escala', icon: ListChecks },
  { key: 'config', label: 'Configurações', icon: SettingsIcon }
]

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  })
}

export default function Alerts() {
  const { accessRole, userId } = useAuth()
  const [tab, setTab] = useState<TabKey>('pessoais')
  const isDiretoria = canConfigureAlerts(accessRole)

  // A aba de configuração não existe pra quem não configura — e se alguém
  // chegar nela por link direto, cai em Pessoais em vez de ver tela vazia.
  const tabs = TABS.filter((t) => t.key !== 'config' || isDiretoria)
  useEffect(() => {
    if (tab === 'config' && !isDiretoria) setTab('pessoais')
  }, [tab, isDiretoria])

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <Bell size={22} /> Alertas
        </h1>
        <p className="text-sm text-beetz-dark/50 mt-1">
          Tudo o que a Colmeia te avisa — e, para a Diretoria, quem recebe o quê.
        </p>
      </div>

      <PushDeviceCard profileId={userId} />

      <div className="flex gap-1 border-b border-beetz-dark/10 mb-5 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-beetz-yellow text-beetz-dark'
                : 'border-transparent text-beetz-dark/45 hover:text-beetz-dark/70'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'config' && isDiretoria && <AlertSettingsTab />}
      {tab !== 'config' && <AlertFeed tab={tab} profileId={userId} />}
    </div>
  )
}

// Cartão de push do aparelho: cada navegador que aceitar a permissão vira uma
// inscrição em push_subscriptions — o aviso chega mesmo com o app fechado.
// Visível pra todo mundo, porque a inscrição é pessoal, não da Diretoria.
function PushDeviceCard({ profileId }: { profileId: string | null }) {
  const supported = pushSupportedHere()
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    isPushEnabledHere().then(setEnabled).catch(() => setEnabled(false))
  }, [])

  async function toggle() {
    if (!profileId) return
    setBusy(true)
    setMsg(null)
    try {
      if (enabled) {
        await disablePushOnThisDevice()
        setEnabled(false)
        setMsg('Notificações desativadas neste aparelho.')
      } else {
        await enablePushOnThisDevice(profileId)
        setEnabled(true)
        setMsg('Pronto! Este aparelho vai receber os alertas com push ligado.')
      }
    } catch (e: any) {
      setMsg(e?.message ?? 'Não deu certo. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-beetz-dark/8 p-4 mb-5 flex flex-wrap items-center gap-3">
      <div className={`rounded-xl p-2.5 ${enabled ? 'bg-beetz-yellow/25' : 'bg-beetz-dark/5'}`}>
        <Smartphone size={20} className={enabled ? 'text-beetz-dark' : 'text-beetz-dark/40'} />
      </div>
      <div className="flex-1 min-w-[200px]">
        <p className="font-bold text-sm">Notificações neste aparelho</p>
        <p className="text-xs text-beetz-dark/50 mt-0.5">
          {supported
            ? enabled
              ? 'Ativadas — os alertas com push ligado chegam mesmo com o app fechado.'
              : 'Receba os alertas no celular ou computador, mesmo com o app fechado.'
            : 'Este navegador não suporta push. No iPhone, instale o app na tela de início e ative por lá.'}
        </p>
        {msg && <p className="text-xs text-beetz-dark/70 mt-1 font-medium">{msg}</p>}
      </div>
      {supported && (
        <button
          onClick={toggle}
          disabled={busy || !profileId}
          className={`text-sm font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50 ${
            enabled
              ? 'bg-white border border-beetz-dark/15 text-beetz-dark/60 hover:border-beetz-dark/30'
              : 'honey-gradient text-beetz-dark shadow-glow hover:brightness-105'
          }`}
        >
          {busy ? 'Um instante...' : enabled ? 'Desativar' : 'Ativar'}
        </button>
      )}
    </div>
  )
}

// As três abas de leitura são a mesma lista com recortes diferentes. Não são
// caixas separadas: toda notificação pertence a uma pessoa (notifications.profile_id).
// "Global" quer dizer que o assunto é a operação, não que a linha seja de todos.
function AlertFeed({ tab, profileId }: { tab: TabKey; profileId: string | null }) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!profileId) return
    setLoading(true)
    try {
      setItems(await listNotifications(profileId, 100))
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível carregar seus alertas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [profileId])

  const filtered = useMemo(() => {
    const byKey = new Map(ALERT_TYPES.map((a) => [a.key, a]))
    return items.filter((n) => {
      const def = n.alert_key ? byKey.get(n.alert_key) : undefined
      if (tab === 'escala') return def?.kind === 'Escala'
      // Linha antiga sem alert_key cai em Pessoais: veio do sininho de antes do
      // catálogo, e era sempre sobre a própria pessoa.
      if (tab === 'pessoais') return !def || def.escopo === 'pessoal'
      return def?.escopo === 'global'
    })
  }, [items, tab])

  const unread = filtered.filter((n) => !n.read_at).length

  async function readAll() {
    if (!profileId) return
    await markAllNotificationsRead(profileId)
    load()
  }

  if (loading) return <p className="text-sm text-beetz-dark/40">Carregando alertas...</p>
  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700">{error}</div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-14">
        <Bell size={30} className="mx-auto text-beetz-dark/15 mb-3" />
        <p className="font-semibold text-beetz-dark/70">Nenhum alerta por aqui</p>
        <p className="text-sm text-beetz-dark/40 mt-1 max-w-md mx-auto">
          {tab === 'globais'
            ? 'Alertas de estoque e de mudança em evento aparecem aqui quando acontecerem.'
            : 'Quando houver novidade sobre você, ela aparece aqui e no sininho.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      {unread > 0 && (
        <div className="flex justify-end mb-2">
          <button
            onClick={readAll}
            className="flex items-center gap-1.5 text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark px-2.5 py-1.5 rounded-lg hover:bg-beetz-gray"
          >
            <CheckCheck size={14} /> Marcar todos como lidos ({unread})
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {filtered.map((n) => (
          <AlertRow key={n.id} n={n} onRead={() => { markNotificationRead(n.id).then(load) }} />
        ))}
      </div>
    </div>
  )
}

function AlertRow({ n, onRead }: { n: AppNotification; onRead: () => void }) {
  const def = ALERT_TYPES.find((a) => a.key === n.alert_key)
  const body = (
    <div className={`rounded-2xl border p-3.5 transition-colors ${
      n.read_at ? 'bg-white border-beetz-dark/8' : 'bg-beetz-yellow/8 border-beetz-yellow/40'
    }`}>
      <div className="flex items-start gap-2.5">
        {!n.read_at && <span className="w-2 h-2 rounded-full bg-beetz-yellow shrink-0 mt-1.5" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{n.title}</p>
          {n.body && <p className="text-sm text-beetz-dark/60 mt-0.5">{n.body}</p>}
          <p className="text-[11px] text-beetz-dark/35 mt-1.5">
            {def?.label ?? n.kind} · {formatWhen(n.created_at)}
          </p>
        </div>
      </div>
    </div>
  )

  if (n.link) {
    return <Link to={n.link} onClick={onRead} className="block">{body}</Link>
  }
  return <button onClick={onRead} className="block w-full text-left">{body}</button>
}

// A tabela de flags: 6 alertas x 5 cargos. Cada clique grava na hora — não tem
// botão Salvar, igual ao resto de /configuracoes.
function AlertSettingsTab() {
  const [perms, setPerms] = useState<RolePermissions[]>([])
  const [channels, setChannels] = useState<AlertChannelSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listRolePermissions(), listAlertChannels()])
      .then(([p, c]) => { setPerms(p); setChannels(c) })
      .catch((e: any) => setError(e?.message ?? 'Não foi possível carregar as permissões.'))
      .finally(() => setLoading(false))
  }, [])

  async function toggle(role: string, key: AlertFlagKey, value: boolean) {
    setSaving(`${role}:${key}`)
    setError(null)
    try {
      const saved = await updateRolePermission(role as RolePermissions['role'], { [key]: value } as any)
      setPerms((prev) => prev.map((p) => (p.role === role ? saved : p)))
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível salvar. Tente de novo.')
    } finally {
      setSaving(null)
    }
  }

  // Canais valem pro TIPO de alerta, não por cargo: quem recebe continua
  // decidido pelas flags de cargo acima; aqui é COMO a entrega acontece além
  // do sininho. Push só chega em quem ativou o aparelho; e-mail vai pro
  // endereço do perfil.
  async function toggleChannel(key: AlertFlagKey, field: 'send_push' | 'send_email', value: boolean) {
    setSaving(`canal:${key}:${field}`)
    setError(null)
    try {
      const saved = await updateAlertChannel(key, { [field]: value })
      setChannels((prev) => prev.map((c) => (c.alert_key === key ? saved : c)))
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível salvar o canal. Tente de novo.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="text-sm text-beetz-dark/40">Carregando configurações...</p>

  return (
    <div>
      <div className="bg-beetz-dark text-white rounded-2xl p-4 mb-5 flex gap-3">
        <ShieldAlert size={18} className="shrink-0 text-beetz-yellow mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold mb-1">Desligar aqui não é só esconder.</p>
          <p className="text-white/60">
            A trava está no banco: com a flag desligada, a notificação nem chega a ser criada
            para esse cargo. Ninguém vai ver depois nem receber atrasado.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      <div className="space-y-3">
        {ALERT_TYPES.map((def) => (
          <div key={def.key} className="bg-white rounded-2xl border border-beetz-dark/8 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm">{def.label}</p>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    def.escopo === 'global' ? 'bg-beetz-dark/8 text-beetz-dark/60' : 'bg-beetz-yellow/25 text-beetz-dark/70'
                  }`}>
                    {def.escopo === 'global' ? 'Global' : 'Pessoal'}
                  </span>
                </div>
                <p className="text-xs text-beetz-dark/55 mt-1">{def.description}</p>
                <p className="text-[11px] text-beetz-dark/35 mt-1">Dispara: {def.gatilho}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-3 border-t border-beetz-dark/5">
              {ACCESS_ROLES.map((role) => {
                const p = perms.find((x) => x.role === role)
                const on = p ? Boolean(p[def.key]) : false
                const busy = saving === `${role}:${def.key}`
                return (
                  <button
                    key={role}
                    disabled={!p || busy}
                    onClick={() => toggle(role, def.key, !on)}
                    title={ACCESS_ROLE_LABELS[role]}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                      on
                        ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark'
                        : 'bg-white border-beetz-dark/12 text-beetz-dark/40 hover:border-beetz-dark/25'
                    }`}
                  >
                    {ACCESS_ROLE_LABELS[role].split(' (')[0]}
                  </button>
                )
              })}
            </div>

            {/* Canais extras do tipo: sininho é sempre; push/e-mail são opt-in. */}
            {(() => {
              const ch = channels.find((c) => c.alert_key === def.key)
              if (!ch) return null
              const items: { field: 'send_push' | 'send_email'; label: string; Icon: typeof Smartphone }[] = [
                { field: 'send_push', label: 'Push no aparelho', Icon: Smartphone },
                { field: 'send_email', label: 'E-mail', Icon: Mail }
              ]
              return (
                <div className="flex flex-wrap items-center gap-1.5 pt-3 mt-3 border-t border-beetz-dark/5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-beetz-dark/35 mr-1">Entrega</span>
                  {items.map(({ field, label, Icon }) => {
                    const on = ch[field]
                    const busy = saving === `canal:${def.key}:${field}`
                    return (
                      <button
                        key={field}
                        disabled={busy}
                        onClick={() => toggleChannel(def.key, field, !on)}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                          on
                            ? 'bg-beetz-dark border-beetz-dark text-beetz-yellow'
                            : 'bg-white border-beetz-dark/12 text-beetz-dark/40 hover:border-beetz-dark/25'
                        }`}
                      >
                        <Icon size={13} /> {label}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        ))}
      </div>
    </div>
  )
}
