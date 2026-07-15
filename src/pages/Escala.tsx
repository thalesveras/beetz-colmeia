import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, ClipboardList, Clock3, MapPin, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { applyToStaffingSlot, listOpenStaffingSlots, updateStaffingApplicationStatus } from '../lib/dataService'
import type { OpenStaffingSlot, StaffingApplicationStatus } from '../lib/types'

// Tela da turma: vagas abertas nos próximos eventos + status das minhas
// candidaturas. Quem confirma é o líder, na aba Escala do evento.

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const STATUS_STYLES: Record<StaffingApplicationStatus, string> = {
  Candidatado: 'bg-amber-100 text-amber-700',
  Confirmado: 'bg-green-100 text-green-700',
  Recusado: 'bg-red-100 text-red-700',
  Cancelado: 'bg-beetz-dark/10 text-beetz-dark/50'
}

const STATUS_LABELS: Record<StaffingApplicationStatus, string> = {
  Candidatado: 'Aguardando confirmação',
  Confirmado: 'Confirmado 🐝',
  Recusado: 'Não aprovado',
  Cancelado: 'Cancelado'
}

export default function Escala() {
  const { userId } = useAuth()
  const [slots, setSlots] = useState<OpenStaffingSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'abertas' | 'minhas'>('abertas')

  async function load() {
    setLoading(true)
    try {
      setSlots(await listOpenStaffingSlots(userId ?? null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar as vagas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])

  const mySlots = useMemo(() => slots.filter((s) => s.myApplication), [slots])
  // Vaga aberta = ainda tem posição sobrando e eu não estou nela.
  const openSlots = useMemo(
    () => slots.filter((s) => !s.myApplication && s.confirmedCount < s.requirement.quantity),
    [slots]
  )

  async function handleApply(slot: OpenStaffingSlot) {
    if (!userId) return
    setBusyId(slot.requirement.id)
    setError(null)
    try {
      await applyToStaffingSlot(slot.requirement.id, slot.event.id, userId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao se candidatar.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleCancel(slot: OpenStaffingSlot) {
    if (!slot.myApplication) return
    setBusyId(slot.requirement.id)
    setError(null)
    try {
      await updateStaffingApplicationStatus(slot.myApplication.id, 'Cancelado')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar.')
    } finally {
      setBusyId(null)
    }
  }

  const list = tab === 'abertas' ? openSlots : mySlots

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto pb-24 md:pb-8">
      <h1 className="text-2xl font-extrabold mb-1 flex items-center gap-2">
        <ClipboardList size={24} /> Escala
      </h1>
      <p className="text-sm text-beetz-dark/50 mb-5">
        Levante a mão pros eventos que você quer trabalhar. O líder confirma e você recebe um aviso.
      </p>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab('abertas')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'abertas' ? 'bg-beetz-dark text-white' : 'bg-white text-beetz-dark/60 hover:bg-beetz-gray'
          }`}
        >
          Vagas abertas {openSlots.length > 0 && `(${openSlots.length})`}
        </button>
        <button
          onClick={() => setTab('minhas')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'minhas' ? 'bg-beetz-dark text-white' : 'bg-white text-beetz-dark/60 hover:bg-beetz-gray'
          }`}
        >
          Minhas candidaturas {mySlots.length > 0 && `(${mySlots.length})`}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando...</p>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
          <p className="text-sm text-beetz-dark/50">
            {tab === 'abertas'
              ? 'Nenhuma vaga aberta nos próximos eventos por enquanto. Volte depois! 🐝'
              : 'Você ainda não se candidatou pra nenhuma vaga.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((slot) => {
            const app = slot.myApplication
            const remaining = slot.requirement.quantity - slot.confirmedCount
            const busy = busyId === slot.requirement.id
            return (
              <div key={slot.requirement.id} className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-bold">{slot.requirement.role_label}</p>
                    <Link to={`/eventos/${slot.event.id}`} className="text-sm text-beetz-dark/60 hover:text-beetz-dark font-medium">
                      {slot.event.name}
                    </Link>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-beetz-dark/50">
                      <span className="flex items-center gap-1"><CalendarDays size={12} /> {formatDate(slot.event.event_date)}</span>
                      {slot.event.start_time && <span className="flex items-center gap-1"><Clock3 size={12} /> {slot.event.start_time}</span>}
                      {slot.event.location && <span className="flex items-center gap-1"><MapPin size={12} /> {slot.event.location}</span>}
                    </div>
                    {slot.requirement.notes && (
                      <p className="text-xs text-beetz-dark/50 mt-2 bg-beetz-gray rounded-lg px-2.5 py-1.5">{slot.requirement.notes}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {app ? (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[app.status]}`}>
                        {STATUS_LABELS[app.status]}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-beetz-yellow/20 text-beetz-dark">
                        {remaining} {remaining === 1 ? 'vaga' : 'vagas'}
                      </span>
                    )}
                    <p className="text-[11px] text-beetz-dark/40">
                      {slot.confirmedCount} de {slot.requirement.quantity} confirmados
                    </p>

                    {app && app.status !== 'Recusado' ? (
                      <button
                        onClick={() => handleCancel(slot)}
                        disabled={busy}
                        className="flex items-center gap-1 text-xs font-semibold text-beetz-dark/50 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-beetz-gray disabled:opacity-50"
                      >
                        <X size={13} /> {busy ? '...' : app.status === 'Confirmado' ? 'Desistir' : 'Cancelar'}
                      </button>
                    ) : !app ? (
                      <button
                        onClick={() => handleApply(slot)}
                        disabled={busy}
                        className="flex items-center gap-1 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
                      >
                        <Check size={14} /> {busy ? 'Enviando...' : 'Quero essa'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
