import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, ClipboardList, Clock3, MapPin, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { applyToStaffingSlot, listOpenStaffingSlots, listStaffingRoles, updateStaffingApplicationStatus } from '../lib/dataService'
import type { OpenStaffingSlot, StaffingApplicationStatus, StaffingRole } from '../lib/types'

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
  const [roles, setRoles] = useState<StaffingRole[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'abertas' | 'minhas'>('abertas')
  // Filtro por evento: nasce da própria lista (só eventos que têm vaga),
  // com contagem — e some sozinho quando só existe um evento em jogo.
  const [filterEvent, setFilterEvent] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [sl, rl] = await Promise.all([listOpenStaffingSlots(userId ?? null), listStaffingRoles()])
      setSlots(sl)
      setRoles(rl)
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

  const eventosDaLista = useMemo(() => {
    const m = new Map<string, { id: string; name: string; date: string; count: number }>()
    for (const s of list) {
      const atual = m.get(s.event.id)
      if (atual) atual.count++
      else m.set(s.event.id, { id: s.event.id, name: s.event.name, date: s.event.event_date, count: 1 })
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [list])

  const shown = useMemo(
    () => (filterEvent ? list.filter((s) => s.event.id === filterEvent) : list),
    [list, filterEvent]
  )

  const diaMes = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${d}/${m}`
  }

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

      {/* Filtro inteligente por evento — pills com data e contagem de vagas. */}
      {!loading && eventosDaLista.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setFilterEvent('')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              filterEvent === '' ? 'bg-beetz-dark border-beetz-dark text-white' : 'bg-white border-beetz-dark/12 text-beetz-dark/55'
            }`}
          >
            Todos ({list.length})
          </button>
          {eventosDaLista.map((ev) => (
            <button
              key={ev.id}
              onClick={() => setFilterEvent(filterEvent === ev.id ? '' : ev.id)}
              title={ev.name}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors max-w-[240px] truncate ${
                filterEvent === ev.id ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'bg-white border-beetz-dark/12 text-beetz-dark/55'
              }`}
            >
              {diaMes(ev.date)} · {ev.name} ({ev.count})
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando...</p>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
          <p className="text-sm text-beetz-dark/50">
            {filterEvent
              ? 'Nenhuma vaga nesse evento com esse recorte.'
              : tab === 'abertas'
                ? 'Nenhuma vaga aberta nos próximos eventos por enquanto. Volte depois! 🐝'
                : 'Você ainda não se candidatou pra nenhuma vaga.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((slot) => {
            const app = slot.myApplication
            const remaining = slot.requirement.quantity - slot.confirmedCount
            const busy = busyId === slot.requirement.id
            return (
              <div key={slot.requirement.id} className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5">
                <div className="flex flex-wrap items-start gap-4">
                  {/* Flyer do evento à esquerda — e quando não tem, um
                      "bilhete" com a data segura a identidade do card. */}
                  <Link to={`/eventos/${slot.event.id}`} className="shrink-0" title={slot.event.name}>
                    {slot.event.flyer_url ? (
                      <img
                        src={slot.event.flyer_url}
                        alt=""
                        className="w-20 h-24 rounded-xl object-cover border border-beetz-dark/8 shadow-sm"
                      />
                    ) : (
                      <div className="w-20 h-24 rounded-xl dark-gradient flex flex-col items-center justify-center text-white border border-beetz-dark/8">
                        <span className="text-2xl font-extrabold leading-none">{slot.event.event_date.split('-')[2]}</span>
                        <span className="text-[10px] uppercase tracking-widest text-white/60 mt-0.5">
                          {new Date(slot.event.event_date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                        </span>
                        <span className="mt-1.5 text-sm">🐝</span>
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-bold">
                      {slot.requirement.role_label}
                      {/* Valor à vista pra quem está decidindo se pega a vaga —
                          transparência combinada com o dono: atrai candidatura
                          e evita surpresa na hora do pagamento. */}
                      {(() => {
                        const role = slot.requirement.role_id ? roles.find((r) => r.id === slot.requirement.role_id) : undefined
                        if (role?.pay_type === 'percent') {
                          return (
                            <span className="ml-2 text-xs font-bold bg-beetz-yellow/25 px-2 py-0.5 rounded-full align-middle">
                              {role.default_percent ?? 0}% das suas vendas
                            </span>
                          )
                        }
                        if (slot.requirement.unit_cost != null && slot.requirement.unit_cost > 0) {
                          return (
                            <span className="ml-2 text-xs font-bold bg-beetz-yellow/25 px-2 py-0.5 rounded-full align-middle">
                              {slot.requirement.unit_cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          )
                        }
                        return null
                      })()}
                    </p>
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
