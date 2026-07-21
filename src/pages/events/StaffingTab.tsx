import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, Users, Wallet, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  applyToStaffingSlot, generateScalePayments, getEventById, listCashierSettlementsForEvent, listEventStaffingApplications,
  listEventStaffingRequirements, listProfiles, listStaffingRoles, updateEvent, updateStaffingApplicationPercent,
  updateStaffingApplicationStatus, updateStaffingApplicationValue
} from '../../lib/dataService'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
import type {
  EventStaffingApplication, EventStaffingRequirement, Profile, StaffingApplicationStatus, StaffingRole
} from '../../lib/types'
import Avatar from '../../components/ui/Avatar'
import StaffingRequirementsEditor from './StaffingRequirementsEditor'

// Vagas do evento e quem está nelas.
//
// Isso já foi uma aba "Escala" separada da aba "Equipe", o que era um erro:
// as duas faziam a mesma coisa por caminhos diferentes (uma com vaga
// estruturada, outra com função em texto livre), as duas geravam fila de
// aprovação, e confirmar numa criava membro na outra. Agora é uma coisa só.

const STATUS_STYLES: Record<StaffingApplicationStatus, string> = {
  Candidatado: 'bg-amber-100 text-amber-700',
  Confirmado: 'bg-green-100 text-green-700',
  Recusado: 'bg-red-100 text-red-700',
  Cancelado: 'bg-beetz-dark/10 text-beetz-dark/50'
}

interface Props {
  eventId: string
  canManage: boolean
  // Avisa o EventDetail pra recarregar a lista de membros — confirmar uma
  // candidatura cria o membro do evento por trigger no banco.
  onTeamChanged?: () => void
}

export default function StaffingTab({ eventId, canManage, onTeamChanged }: Props) {
  const { userId } = useAuth()
  const [requirements, setRequirements] = useState<EventStaffingRequirement[]>([])
  const [applications, setApplications] = useState<EventStaffingApplication[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [roles, setRoles] = useState<StaffingRole[]>([])
  // Vendas por pessoa vindas dos RECEBIMENTOS do evento: é daqui que a
  // comissão do garçom nasce — a escala só espelha.
  const [salesByProfile, setSalesByProfile] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Valor por pessoa: herda o da vaga, mas o líder pode ajustar caso a caso.
  const [editingValueId, setEditingValueId] = useState<string | null>(null)
  const [valueDraft, setValueDraft] = useState('')
  const [generating, setGenerating] = useState(false)
  const [payMessage, setPayMessage] = useState<string | null>(null)

  // Vagas fecham SÓ por comando da Diretoria — nunca pela data. O flag mora
  // no evento; o botão vive aqui na Equipe.
  const [staffingClosed, setStaffingClosed] = useState(false)
  const [togglingVagas, setTogglingVagas] = useState(false)

  async function load() {
    try {
      const [reqs, apps, profs, rls, settlements, ev] = await Promise.all([
        listEventStaffingRequirements(eventId),
        listEventStaffingApplications(eventId),
        listProfiles(),
        listStaffingRoles(),
        listCashierSettlementsForEvent(eventId).catch(() => []),
        getEventById(eventId).catch(() => null)
      ])
      setRequirements(reqs)
      setApplications(apps)
      setProfiles(profs)
      setRoles(rls)
      setStaffingClosed(!!ev?.staffing_closed)
      const sales = new Map<string, number>()
      for (const st of settlements) {
        // Sem pessoa vinculada não soma pra ninguém (e Rejeitado não conta).
        if (st.status === 'Rejeitado' || !st.profile_id) continue
        sales.set(st.profile_id, (sales.get(st.profile_id) ?? 0) + st.total)
      }
      setSalesByProfile(sales)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar as vagas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [eventId])

  async function toggleStaffingClosed() {
    setTogglingVagas(true)
    try {
      await updateEvent(eventId, { staffing_closed: !staffingClosed })
      setStaffingClosed((v) => !v)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar as vagas.')
    } finally {
      setTogglingVagas(false)
    }
  }

  const confirmedByRequirement = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of requirements) {
      map[r.id] = applications.filter((a) => a.requirement_id === r.id && a.status === 'Confirmado').length
    }
    return map
  }, [requirements, applications])

  function personName(profileId: string) {
    const p = profiles.find((x) => x.id === profileId)
    return p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Abelha' : 'Abelha'
  }

  function personAvatar(profileId: string) {
    return profiles.find((x) => x.id === profileId)?.avatar_url ?? null
  }

  // Cadeia de herança do valor: pessoa (agreed_value) → vaga (unit_cost).
  // O padrão da função já entrou no unit_cost quando a vaga foi criada.
  function resolvedValue(app: EventStaffingApplication): number {
    if (app.agreed_value != null) return app.agreed_value
    const req = requirements.find((r) => r.id === app.requirement_id)
    return req?.unit_cost ?? 0
  }

  // Vaga comissionada: a função paga % sobre os recebimentos da pessoa —
  // o "valor" dela só nasce quando o acerto é lançado no evento.
  function roleForReq(req: EventStaffingRequirement | undefined): StaffingRole | undefined {
    return req?.role_id ? roles.find((r) => r.id === req.role_id) : undefined
  }
  function isPercentApp(app: EventStaffingApplication): boolean {
    return roleForReq(requirements.find((r) => r.id === app.requirement_id))?.pay_type === 'percent'
  }
  function resolvedPercent(app: EventStaffingApplication): number {
    const role = roleForReq(requirements.find((r) => r.id === app.requirement_id))
    return app.agreed_percent ?? role?.default_percent ?? 0
  }

  const confirmedApps = useMemo(
    () => applications.filter((a) => a.status === 'Confirmado'),
    [applications]
  )
  const scaleTotal = useMemo(
    () => confirmedApps.reduce((sum, a) => sum + (isPercentApp(a) ? 0 : resolvedValue(a)), 0),
    [confirmedApps, requirements, roles]
  )
  const percentCount = useMemo(
    () => confirmedApps.filter((a) => isPercentApp(a)).length,
    [confirmedApps, requirements, roles]
  )
  // Estimativa ao vivo: % combinado × o que cada pessoa já registrou em
  // Recebimentos. Zero enquanto os acertos não são lançados no fim do evento.
  const estimatedCommissions = useMemo(
    () => confirmedApps.reduce((sum, a) => {
      if (!isPercentApp(a)) return sum
      const sales = salesByProfile.get(a.profile_id) ?? 0
      return sum + Math.round(sales * resolvedPercent(a)) / 100
    }, 0),
    [confirmedApps, requirements, roles, salesByProfile]
  )

  async function saveValue(app: EventStaffingApplication) {
    const parsed = valueDraft.trim() ? Number(valueDraft.replace(',', '.')) : null
    const clean = parsed != null && !Number.isNaN(parsed) ? parsed : null
    setBusyId(app.id)
    try {
      if (isPercentApp(app)) await updateStaffingApplicationPercent(app.id, clean)
      else await updateStaffingApplicationValue(app.id, clean)
      setEditingValueId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar o valor.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleGeneratePayments() {
    setGenerating(true)
    setPayMessage(null)
    setError(null)
    try {
      const res = await generateScalePayments(eventId, userId ?? null)
      const parts: string[] = []
      parts.push(res.created > 0
        ? `${res.created} pagamento${res.created > 1 ? 's' : ''} criado${res.created > 1 ? 's' : ''} como despesa Pendente`
        : 'Nenhum pagamento novo pra criar')
      if (res.skippedExisting > 0) parts.push(`${res.skippedExisting} já tinha${res.skippedExisting > 1 ? 'm' : ''} despesa`)
      if (res.skippedNoValue > 0) parts.push(`${res.skippedNoValue} sem valor definido (pulado${res.skippedNoValue > 1 ? 's' : ''})`)
      if (res.skippedNoSales > 0) parts.push(`${res.skippedNoSales} comissionado${res.skippedNoSales > 1 ? 's' : ''} sem acerto em Recebimentos ainda (pulado${res.skippedNoSales > 1 ? 's' : ''} — lance o acerto e gere de novo)`)
      setPayMessage(parts.join(' · '))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar os pagamentos.')
    } finally {
      setGenerating(false)
    }
  }

  async function decide(app: EventStaffingApplication, status: StaffingApplicationStatus) {
    setBusyId(app.id)
    setError(null)
    try {
      await updateStaffingApplicationStatus(app.id, status, userId ?? null)
      await load()
      onTeamChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar a candidatura.')
    } finally {
      setBusyId(null)
    }
  }

  async function applyToSlot(req: EventStaffingRequirement) {
    if (!userId) return
    setBusyId(req.id)
    setError(null)
    try {
      await applyToStaffingSlot(req.id, eventId, userId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao se candidatar.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-beetz-dark/50 text-sm">Carregando...</p>

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {confirmedApps.length > 0 && (
        <div className="bg-beetz-dark text-white rounded-2xl p-5 shadow-soft flex flex-wrap items-center gap-4">
          <div className="bg-beetz-yellow/20 text-beetz-yellow rounded-xl p-2.5"><Wallet size={20} /></div>
          <div className="flex-1 min-w-[160px]">
            <p className="text-xl font-extrabold leading-none">
              {brl(scaleTotal)}
              {percentCount > 0 ? (estimatedCommissions > 0 ? ` + ≈ ${brl(estimatedCommissions)} de comissões` : ' + comissões') : ''}
            </p>
            <p className="text-xs text-white/50 mt-1">
              Custo da escala · {confirmedApps.length} confirmado{confirmedApps.length > 1 ? 's' : ''}
              {percentCount > 0 && (
                estimatedCommissions > 0
                  ? ` · comissões calculadas sobre os Recebimentos já lançados`
                  : ` · ${percentCount} comissionado${percentCount > 1 ? 's' : ''}: a despesa nasce dos Recebimentos, lançados no fim do evento`
              )}
            </p>
          </div>
          {canManage && (
            <button
              onClick={handleGeneratePayments}
              disabled={generating}
              className="honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-60"
              title="Cria uma despesa Pendente por pessoa confirmada, com o valor combinado — sem duplicar quem já tem."
            >
              {generating ? 'Gerando...' : 'Gerar pagamentos'}
            </button>
          )}
          {payMessage && <p className="w-full text-xs text-beetz-yellow/90">{payMessage}</p>}
        </div>
      )}

      {/* Vagas fecham SÓ por este botão — nunca pela data. Enquanto abertas,
          aparecem na /escala mesmo com o evento rolando (garçom entrando de
          madrugada continua conseguindo se candidatar e lançar recebimento). */}
      {canManage && (
        <div className={`rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border ${
          staffingClosed ? 'bg-beetz-dark/5 border-beetz-dark/10' : 'bg-green-50 border-green-200'
        }`}>
          <div>
            <p className={`text-sm font-bold ${staffingClosed ? 'text-beetz-dark/60' : 'text-green-800'}`}>
              {staffingClosed ? 'Vagas encerradas pela Diretoria' : 'Vagas abertas na /escala'}
            </p>
            <p className="text-xs text-beetz-dark/50 mt-0.5">
              {staffingClosed
                ? 'Ninguém mais consegue se candidatar. Reabra se ainda falta gente.'
                : 'As vagas ficam visíveis até você encerrar aqui — a data do evento não fecha nada sozinha.'}
            </p>
          </div>
          <button
            onClick={toggleStaffingClosed}
            disabled={togglingVagas}
            className={`text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-60 ${
              staffingClosed ? 'honey-gradient text-beetz-dark' : 'bg-beetz-dark text-white hover:bg-black'
            }`}
          >
            {togglingVagas ? '...' : staffingClosed ? 'Reabrir vagas' : 'Encerrar vagas'}
          </button>
        </div>
      )}

      {canManage && (
        <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
          <StaffingRequirementsEditor
            eventId={eventId}
            confirmedByRequirement={confirmedByRequirement}
            onChanged={load}
          />
        </div>
      )}

      {requirements.length === 0 ? (
        !canManage && (
          <div className="bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
            <p className="text-sm text-beetz-dark/50">
              Nenhuma vaga aberta nesse evento ainda. Se quiser participar, use o campo de
              interesse acima — a Diretoria avalia.
            </p>
          </div>
        )
      ) : (
        requirements.map((req) => {
          const forSlot = applications.filter((a) => a.requirement_id === req.id && a.status !== 'Cancelado')
          const confirmed = forSlot.filter((a) => a.status === 'Confirmado')
          const waiting = forSlot.filter((a) => a.status === 'Candidatado')
          const refused = forSlot.filter((a) => a.status === 'Recusado')
          const full = confirmed.length >= req.quantity
          const mine = forSlot.find((a) => a.profile_id === userId)

          return (
            <div key={req.id} className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-bold">
                    {req.role_label}
                    {roleForReq(req)?.pay_type === 'percent' ? (
                      <span className="ml-2 text-xs font-bold bg-beetz-yellow/25 px-2 py-0.5 rounded-full align-middle">
                        {roleForReq(req)?.default_percent ?? 0}% das vendas/pessoa
                      </span>
                    ) : req.unit_cost != null && req.unit_cost > 0 && (
                      <span className="ml-2 text-xs font-bold bg-beetz-yellow/25 px-2 py-0.5 rounded-full align-middle">{brl(req.unit_cost)}/pessoa</span>
                    )}
                  </p>
                  {req.notes && <p className="text-xs text-beetz-dark/50 mt-0.5">{req.notes}</p>}
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  full ? 'bg-green-100 text-green-700' : 'bg-beetz-yellow/20 text-beetz-dark'
                }`}>
                  {confirmed.length} de {req.quantity} confirmados
                </span>
              </div>

              <div className="h-1.5 bg-beetz-gray rounded-full overflow-hidden mb-4">
                <div
                  className={full ? 'h-full bg-green-500' : 'h-full honey-gradient'}
                  style={{ width: `${Math.min(100, (confirmed.length / Math.max(1, req.quantity)) * 100)}%` }}
                />
              </div>

              {/* Quem não é líder consegue pegar a vaga aqui mesmo, sem ir na
                  tela Escala — é o mesmo lugar onde ele vê quanto falta. */}
              {!mine && !full && userId && (
                <button
                  onClick={() => applyToSlot(req)}
                  disabled={busyId === req.id}
                  className="mb-3 flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
                >
                  <Check size={14} /> {busyId === req.id ? 'Enviando...' : 'Quero essa vaga'}
                </button>
              )}
              {mine && (
                <p className="mb-3 text-xs font-semibold text-beetz-dark/60">
                  Sua candidatura: <span className={`px-2 py-0.5 rounded-full ${STATUS_STYLES[mine.status]}`}>{mine.status}</span>
                </p>
              )}

              {forSlot.length === 0 ? (
                <p className="text-xs text-beetz-dark/40 flex items-center gap-1.5">
                  <Users size={13} /> Ninguém se candidatou ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {[...waiting, ...confirmed, ...refused].map((app) => (
                    <div key={app.id} className="flex flex-wrap items-center gap-2.5 py-2 border-t border-beetz-dark/5 first:border-0">
                      <Avatar src={personAvatar(app.profile_id)} name={personName(app.profile_id)} size="sm" />
                      <Link to={`/perfil/${app.profile_id}`} className="flex-1 min-w-[120px] text-sm font-semibold hover:text-beetz-dark/60">
                        {personName(app.profile_id)}
                      </Link>
                      {app.status === 'Confirmado' && (
                        editingValueId === app.id ? (
                          <span className="flex items-center gap-1">
                            <input
                              type="text" inputMode="decimal" autoFocus
                              className="w-20 border border-beetz-dark/15 rounded-lg px-2 py-1 text-xs"
                              value={valueDraft} onChange={(e) => setValueDraft(e.target.value)}
                              placeholder={isPercentApp(app) ? '%' : 'R$'}
                            />
                            <button onClick={() => saveValue(app)} disabled={busyId === app.id} className="text-green-600 p-1 rounded hover:bg-green-50"><Check size={13} /></button>
                            <button onClick={() => setEditingValueId(null)} className="text-beetz-dark/40 p-1 rounded hover:bg-beetz-gray"><X size={13} /></button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-bold flex-wrap">
                            {isPercentApp(app) ? (
                              <>
                                {resolvedPercent(app)}% das vendas
                                {(salesByProfile.get(app.profile_id) ?? 0) > 0 ? (
                                  <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full text-[10px] font-bold" title="Estimativa sobre o que a pessoa já registrou em Recebimentos neste evento">
                                    ≈ {brl(Math.round((salesByProfile.get(app.profile_id) ?? 0) * resolvedPercent(app)) / 100)}
                                  </span>
                                ) : (
                                  <span className="text-beetz-dark/40 text-[10px] font-semibold" title="A comissão é calculada sobre o acerto que a pessoa lança em Recebimentos no fim do evento">
                                    aguarda acerto
                                  </span>
                                )}
                              </>
                            ) : brl(resolvedValue(app))}
                            {(isPercentApp(app) ? app.agreed_percent != null : app.agreed_value != null) && (
                              <span className="text-[10px] font-semibold text-beetz-dark/40" title="Combinado ajustado só pra essa pessoa">ajustado</span>
                            )}
                            {canManage && (
                              <button
                                onClick={() => {
                                  setEditingValueId(app.id)
                                  setValueDraft(isPercentApp(app)
                                    ? (app.agreed_percent != null ? String(app.agreed_percent) : '')
                                    : (app.agreed_value != null ? String(app.agreed_value) : ''))
                                }}
                                className="text-beetz-dark/30 hover:text-beetz-dark p-0.5 rounded"
                                title={isPercentApp(app)
                                  ? 'Ajustar o % só desta pessoa (os 8 viram 9 ou 10 aqui; vazio herda o da função)'
                                  : 'Ajustar valor só desta pessoa (vazio volta a herdar o da vaga)'}
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </span>
                        )
                      )}
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[app.status]}`}>
                        {app.status}
                      </span>

                      {canManage && app.status !== 'Confirmado' && (
                        <button
                          onClick={() => decide(app, 'Confirmado')}
                          disabled={busyId === app.id || (full && app.status === 'Candidatado')}
                          title={full ? 'Vagas já preenchidas' : 'Confirmar'}
                          className="flex items-center gap-1 text-xs font-semibold bg-beetz-dark text-white px-2.5 py-1.5 rounded-lg disabled:opacity-40"
                        >
                          <Check size={12} /> Confirmar
                        </button>
                      )}
                      {canManage && app.status !== 'Recusado' && (
                        <button
                          onClick={() => decide(app, 'Recusado')}
                          disabled={busyId === app.id}
                          className="flex items-center gap-1 text-xs font-semibold text-beetz-dark/50 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-beetz-gray disabled:opacity-40"
                        >
                          <X size={12} /> Recusar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
