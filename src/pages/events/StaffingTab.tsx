import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ClipboardList, Users, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  applyToStaffingSlot, listEventStaffingApplications, listEventStaffingRequirements,
  listProfiles, updateStaffingApplicationStatus
} from '../../lib/dataService'
import type {
  EventStaffingApplication, EventStaffingRequirement, Profile, StaffingApplicationStatus
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
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const [reqs, apps, profs] = await Promise.all([
        listEventStaffingRequirements(eventId),
        listEventStaffingApplications(eventId),
        listProfiles()
      ])
      setRequirements(reqs)
      setApplications(apps)
      setProfiles(profs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar as vagas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [eventId])

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
                  <p className="font-bold">{req.role_label}</p>
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
