import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, Globe, ListChecks, Mail, Send, Settings as SettingsIcon, ShieldAlert, Smartphone, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ALERT_TYPES } from '../lib/alerts'
import { canConfigureAlerts, ACCESS_ROLES, ACCESS_ROLE_LABELS } from '../lib/permissions'
import {
  disablePushOnThisDevice, enablePushOnThisDevice, isPushEnabledHere, listAlertChannels,
  listNotifications, listProfiles, listPushProfileIds, listRolePermissions,
  markAllNotificationsRead, markNotificationRead, pushSupportedHere, sendManualPush,
  updateAlertChannel, updateRolePermission
} from '../lib/dataService'
import type { AlertChannelSetting, AlertFlagKey, AppNotification, Profile, RolePermissions } from '../lib/types'

type TabKey = 'pessoais' | 'globais' | 'escala' | 'enviar' | 'config'

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'pessoais', label: 'Pessoais', icon: User },
  { key: 'globais', label: 'Globais', icon: Globe },
  { key: 'escala', label: 'Escala', icon: ListChecks },
  { key: 'enviar', label: 'Enviar aviso', icon: Send },
  { key: 'config', label: 'Configurações', icon: SettingsIcon }
]

const DIRETORIA_TABS: TabKey[] = ['enviar', 'config']

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  })
}

export default function Alerts() {
  const { accessRole, userId } = useAuth()
  const [tab, setTab] = useState<TabKey>('pessoais')
  const isDiretoria = canConfigureAlerts(accessRole)

  // Abas de gestão (enviar aviso, configurações) não existem pra quem não
  // configura — e por link direto, a pessoa cai em Pessoais, não em tela vazia.
  const tabs = TABS.filter((t) => !DIRETORIA_TABS.includes(t.key) || isDiretoria)
  useEffect(() => {
    if (DIRETORIA_TABS.includes(tab) && !isDiretoria) setTab('pessoais')
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

      {/* Pills no padrão das Configurações: quebram linha no celular em vez
          de esconder abas atrás de um scroll com barra amarela por cima. */}
      <div className="flex flex-wrap gap-2 border-b border-beetz-dark/10 pb-3 mb-5">
        {tabs.map(({ key, label, icon: Icon }) => (
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

      {tab === 'config' && isDiretoria && <AlertSettingsTab />}
      {tab === 'enviar' && isDiretoria && <ManualPushTab />}
      {tab !== 'config' && tab !== 'enviar' && <AlertFeed tab={tab} profileId={userId} />}
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

// Aviso manual da Diretoria: escreve uma vez, chega como push em quem tem
// aparelho registrado e fica no sininho de todos os destinatários — quem não
// ativou push não fica de fora, só recebe de forma mais silenciosa.
function ManualPushTab() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pushIds, setPushIds] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const [mode, setMode] = useState<'all' | 'some'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listProfiles(), listPushProfileIds()])
      .then(([p, ids]) => { setProfiles(p); setPushIds(new Set(ids)) })
      .catch((e: any) => setError(e?.message ?? 'Não foi possível carregar as pessoas.'))
  }, [])

  const shown = profiles.filter((p) =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.trim().toLowerCase())
  )

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSend() {
    setError(null)
    setResult(null)
    if (!title.trim()) { setError('Dê um título ao aviso.'); return }
    if (mode === 'some' && selected.size === 0) { setError('Escolha ao menos uma pessoa.'); return }
    setSending(true)
    try {
      const res = await sendManualPush({
        title: title.trim(),
        body: message.trim(),
        link: link.trim() || undefined,
        target: mode === 'all' ? 'all' : Array.from(selected)
      })
      setResult(`Aviso enviado a ${res.recipients} pessoa${res.recipients === 1 ? '' : 's'} — push chegou em ${res.push_sent} de ${res.devices} aparelho${res.devices === 1 ? '' : 's'} registrado${res.devices === 1 ? '' : 's'}. Todos veem no sininho.`)
      setTitle(''); setMessage(''); setLink(''); setSelected(new Set())
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível enviar. Tente de novo.')
    } finally {
      setSending(false)
    }
  }

  const inputClass = 'w-full bg-white border border-beetz-dark/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-beetz-yellow transition-colors'

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-2xl border border-beetz-dark/8 p-5 space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">Título do aviso</label>
          <input className={inputClass} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Reunião geral sexta às 15h" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Mensagem</label>
          <textarea className={`${inputClass} min-h-[90px] resize-y`} maxLength={300} value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Detalhe o recado. Aparece no push e no sininho." />
          <p className="text-xs text-beetz-dark/35 mt-1 text-right">{message.length}/300</p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Abrir em (opcional)</label>
          <input className={inputClass} value={link} onChange={(e) => setLink(e.target.value)}
            placeholder="/eventos — tela aberta ao tocar no aviso" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-beetz-dark/8 p-5 space-y-3">
        <p className="text-sm font-bold">Destinatários</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMode('all')}
            className={`text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
              mode === 'all' ? 'bg-beetz-dark text-white' : 'bg-beetz-gray text-beetz-dark/70 hover:bg-beetz-dark/10'
            }`}>
            Toda a colmeia
          </button>
          <button onClick={() => setMode('some')}
            className={`text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
              mode === 'some' ? 'bg-beetz-dark text-white' : 'bg-beetz-gray text-beetz-dark/70 hover:bg-beetz-dark/10'
            }`}>
            Escolher pessoas{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>

        {mode === 'some' && (
          <div className="space-y-2">
            <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pelo nome..." />
            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto pr-1">
              {shown.map((p) => {
                const on = selected.has(p.id)
                const hasPush = pushIds.has(p.id)
                return (
                  <button key={p.id} onClick={() => toggleSelected(p.id)}
                    title={hasPush ? 'Tem push ativo em algum aparelho' : 'Sem push — recebe só no sininho'}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      on ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'bg-white border-beetz-dark/12 text-beetz-dark/55 hover:border-beetz-dark/25'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasPush ? 'bg-green-500' : 'bg-beetz-dark/20'}`} />
                    {p.first_name} {p.last_name}
                  </button>
                )
              })}
              {shown.length === 0 && <p className="text-xs text-beetz-dark/40">Ninguém com esse nome.</p>}
            </div>
            <p className="text-xs text-beetz-dark/40">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1 align-middle" />
              push ativo · os demais recebem só no sininho
            </p>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{error}</div>}
      {result && <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-sm text-green-800">{result}</div>}

      <button onClick={handleSend} disabled={sending}
        className="honey-gradient text-beetz-dark font-bold px-5 py-3 rounded-2xl shadow-glow hover:brightness-105 transition disabled:opacity-50 flex items-center gap-2">
        <Send size={16} /> {sending ? 'Enviando...' : 'Enviar aviso'}
      </button>
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
