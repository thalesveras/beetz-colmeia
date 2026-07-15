import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ClipboardList, Users, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  listEventStaffingApplications, listEventStaffingRequirements, listProfiles, updateStaffingApplicationStatus
} from '../../lib/dataService'
import type { EventStaffingApplication, EventStaffingRequirement, Profile, StaffingApplicationStatus } from '../../lib/types'
import Avatar from '../../components/ui/Avatar'

// Visão do líder: quem se candidatou pra cada vaga do evento, e o botão de
// confirmar/recusar. Ao confirmar, o banco cria o vínculo de membro do evento
// sozinho (trigger) e dispara a notificação pra pessoa.

const STATUS_STYLES: Record<StaffingApplicationStatus, string> = {
  Candidatado: 'bg-amber-100 text-amber-700',
  Confirmado: 'bg-green-100 text-green-700',
  Recusado: 'bg-red-100 text-red-700',
  Cancelado: 'bg-beetz-dark/10 text-beetz-dark/50'
}

interface Props {
  eventId: string
  canManage: boolean
}

export default function StaffingTab({ eventId, canManage }: Props) {
  const { userId } = useAuth()
  const [requirements, setRequirements] = useState<EventStaffingRequirement[]>([])
  const [applications, setApplications] = useState<EventStaffingApplication[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
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
      setError(err instanceof Error ? err.message : 'Erro ao carregar a escala.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [eventId])

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar a candidatura.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-beetz-dark/50 text-sm">Carregando...</p>

  if (requirements.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
        <p className="text-sm text-beetz-dark/50">
          Nenhuma vaga cadastrada nesse evento ainda. Cadastre as vagas no resumo do evento
          (ex: "10 garçons") pra turma poder se candidatar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="font-bold flex items-center gap-2"><ClipboardList size={18} /> Escala do evento</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {requirements.map((req) => {
        const forSlot = applications.filter((a) => a.requirement_id === req.id && a.status !== 'Cancelado')
        const confirmed = forSlot.filter((a) => a.status === 'Confirmado')
        const waiting = forSlot.filter((a) => a.status === 'Candidatado')
        const full = confirmed.length >= req.quantity

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

            {/* barra de preenchimento — leitura rápida de quanto falta */}
            <div className="h-1.5 bg-beetz-gray rounded-full overflow-hidden mb-4">
              <div
                className={full ? 'h-full bg-green-500' : 'h-full honey-gradient'}
                style={{ width: `${Math.min(100, (confirmed.length / Math.max(1, req.quantity)) * 100)}%` }}
              />
            </div>

            {forSlot.length === 0 ? (
              <p className="text-xs text-beetz-dark/40 flex items-center gap-1.5">
                <Users size={13} /> Ninguém se candidatou ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {[...waiting, ...confirmed, ...forSlot.filter((a) => a.status === 'Recusado')].map((app) => (
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
      })}
    </div>
  )
}
