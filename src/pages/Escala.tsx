import { useEffect, useMemo, useRef, useState } from 'react'
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

// "Hoje" no fuso do celular (nunca UTC — lição da home: depois das 21h o
// evento da noite sumia). É a régua dos recortes temporais da Escala.
function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type RecorteEscala = 'hoje' | 'proximas' | 'passadas' | 'todas'

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
  // Recorte temporal: em dia de evento a tela JÁ ABRE em "Hoje" (decidido uma
  // vez só, na primeira carga — depois o dedo manda).
  const [recorte, setRecorte] = useState<RecorteEscala>('proximas')
  const decidiuRecorte = useRef(false)

  async function load() {
    setLoading(true)
    try {
      const [sl, rl] = await Promise.all([listOpenStaffingSlots(userId ?? null), listStaffingRoles()])
      setSlots(sl)
      setRoles(rl)
      // Padrão esperto: se tem vaga PRA HOJE, é nela que a pessoa cai.
      if (!decidiuRecorte.current) {
        decidiuRecorte.current = true
        if (sl.some((s) => s.event.event_date === hojeISO())) setRecorte('hoje')
      }
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

  // ---- Recorte temporal: Hoje / Próximas / Passadas / Todas ----
  // "Passadas" existem de verdade aqui: evento que virou a madrugada segue
  // com vaga aberta até a Diretoria fechar a escala — sem o recorte, elas
  // ficavam misturadas com as da semana que vem.
  const hoje = hojeISO()
  const contagens = useMemo(() => ({
    hoje: list.filter((s) => s.event.event_date === hoje).length,
    proximas: list.filter((s) => s.event.event_date >= hoje).length,
    passadas: list.filter((s) => s.event.event_date < hoje).length,
    todas: list.length
  }), [list, hoje])

  const recortadas = useMemo(() => {
    let base = list
    if (recorte === 'hoje') base = list.filter((s) => s.event.event_date === hoje)
    if (recorte === 'proximas') base = list.filter((s) => s.event.event_date >= hoje)
    if (recorte === 'passadas') base = list.filter((s) => s.event.event_date < hoje)
    // Futuras: mais perto primeiro. Passadas: mais recente primeiro.
    return [...base].sort((a, b) =>
      recorte === 'passadas'
        ? b.event.event_date.localeCompare(a.event.event_date)
        : a.event.event_date.localeCompare(b.event.event_date)
    )
  }, [list, recorte, hoje])

  // Troca de aba ou de recorte zera o filtro de evento (ele nasce da lista).
  useEffect(() => { setFilterEvent('') }, [tab, recorte])

  // Se o recorte ativo esvaziou (vaga preenchida, troca de aba), a pill dele
  // some — então a seleção volta pro porto seguro em vez de ficar fantasma.
  useEffect(() => {
    if ((recorte === 'hoje' && contagens.hoje === 0) || (recorte === 'passadas' && contagens.passadas === 0)) {
      setRecorte('proximas')
    }
  }, [recorte, contagens.hoje, contagens.passadas])

  const eventosDaLista = useMemo(() => {
    const m = new Map<string, { id: string; name: string; date: string; count: number }>()
    for (const s of recortadas) {
      const atual = m.get(s.event.id)
      if (atual) atual.count++
      else m.set(s.event.id, { id: s.event.id, name: s.event.name, date: s.event.event_date, count: 1 })
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [recortadas])

  const shown = useMemo(
    () => (filterEvent ? recortadas.filter((s) => s.event.id === filterEvent) : recortadas),
    [recortadas, filterEvent]
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

      {/* Recorte temporal: Hoje (só aparece — e pulsa — quando tem vaga do
          dia), Próximas, Passadas e Todas, sempre com contagem. No celular
          deslizam de lado; em dia de evento a tela já ABRE em Hoje. */}
      {!loading && list.length > 0 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible md:pb-0">
          {contagens.hoje > 0 && (
            <button
              onClick={() => setRecorte('hoje')}
              className={`shrink-0 flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
                recorte === 'hoje' ? 'bg-beetz-yellow text-beetz-dark' : 'bg-white text-beetz-dark/60 border border-beetz-dark/10'
              }`}
            >
              <span className={`w-2 h-2 rounded-full bg-beetz-dark ${recorte === 'hoje' ? 'animate-pulse' : 'opacity-30'}`} />
              🐝 Hoje ({contagens.hoje})
            </button>
          )}
          {([
            ['proximas', `Próximas (${contagens.proximas})`],
            ...(contagens.passadas > 0 ? [['passadas', `Passadas (${contagens.passadas})`] as [RecorteEscala, string]] : []),
            ['todas', `Todas (${contagens.todas})`]
          ] as [RecorteEscala, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRecorte(key)}
              className={`shrink-0 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
                recorte === key ? 'bg-beetz-dark text-white' : 'bg-white text-beetz-dark/60 border border-beetz-dark/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Filtro inteligente por evento — pills com data e contagem de vagas. */}
      {/* No celular os chips deslizam de lado (uma linha só, sem torre de
          filtros); no desktop quebram linha normalmente. */}
      {!loading && eventosDaLista.length > 1 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible md:pb-0">
          <button
            onClick={() => setFilterEvent('')}
            className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
              filterEvent === '' ? 'bg-beetz-dark border-beetz-dark text-white' : 'bg-white border-beetz-dark/12 text-beetz-dark/55'
            }`}
          >
            Todos ({recortadas.length})
          </button>
          {eventosDaLista.map((ev) => (
            <button
              key={ev.id}
              onClick={() => setFilterEvent(filterEvent === ev.id ? '' : ev.id)}
              title={ev.name}
              className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors max-w-[240px] truncate ${
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
              : recorte === 'hoje'
                ? 'Nenhuma vaga pra hoje — espia as Próximas! 🐝'
                : recorte === 'passadas'
                  ? 'Nada ficou pra trás — escala em dia. 🍯'
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
              <div key={slot.requirement.id} className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-4 sm:p-5">
                {/* Mobile-first: flyer + informação em cima; a AÇÃO vira botão
                    de largura total embaixo — do tamanho do polegar, sem
                    coluna espremida à direita. */}
                <div className="flex items-start gap-3 sm:gap-4">
                  <Link to={`/eventos/${slot.event.id}`} className="shrink-0" title={slot.event.name}>
                    {slot.event.flyer_url ? (
                      <img
                        src={slot.event.flyer_url}
                        alt=""
                        className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl object-cover border border-beetz-dark/8 shadow-sm"
                      />
                    ) : (
                      <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl dark-gradient flex flex-col items-center justify-center text-white border border-beetz-dark/8">
                        <span className="text-xl sm:text-2xl font-extrabold leading-none">{slot.event.event_date.split('-')[2]}</span>
                        <span className="text-[10px] uppercase tracking-widest text-white/60 mt-0.5">
                          {new Date(slot.event.event_date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                        </span>
                        <span className="mt-1 text-sm">🐝</span>
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-bold">{slot.requirement.role_label}</p>
                      {slot.event.event_date === hoje && (
                        <span className="text-[11px] font-extrabold bg-beetz-yellow text-beetz-dark px-2 py-0.5 rounded-full animate-pulse whitespace-nowrap">É HOJE 🐝</span>
                      )}
                      {slot.event.event_date < hoje && (
                        <span className="text-[11px] font-semibold bg-beetz-dark/8 text-beetz-dark/50 px-2 py-0.5 rounded-full whitespace-nowrap">já rolou</span>
                      )}
                      {/* Valor à vista pra quem está decidindo se pega a vaga. */}
                      {(() => {
                        const role = slot.requirement.role_id ? roles.find((r) => r.id === slot.requirement.role_id) : undefined
                        if (role?.pay_type === 'percent') {
                          return (
                            <span className="text-xs font-bold bg-beetz-yellow/25 px-2 py-0.5 rounded-full">
                              {role.default_percent ?? 0}% das suas vendas
                            </span>
                          )
                        }
                        if (slot.requirement.unit_cost != null && slot.requirement.unit_cost > 0) {
                          return (
                            <span className="text-xs font-bold bg-beetz-yellow/25 px-2 py-0.5 rounded-full">
                              {slot.requirement.unit_cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          )
                        }
                        return null
                      })()}
                      {app && (
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[app.status]}`}>
                          {STATUS_LABELS[app.status]}
                        </span>
                      )}
                    </div>
                    <Link to={`/eventos/${slot.event.id}`} className="block truncate text-sm text-beetz-dark/60 hover:text-beetz-dark font-medium">
                      {slot.event.name}
                    </Link>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-beetz-dark/50">
                      <span className="flex items-center gap-1"><CalendarDays size={12} /> {formatDate(slot.event.event_date)}</span>
                      {slot.event.start_time && <span className="flex items-center gap-1"><Clock3 size={12} /> {slot.event.start_time}</span>}
                      {slot.event.location && <span className="flex items-center gap-1"><MapPin size={12} /> {slot.event.location}</span>}
                    </div>

                    {/* Barra de vagas: o quanto a escala já encheu, num olhar. */}
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-[11px] text-beetz-dark/45 mb-1">
                        <span>{slot.confirmedCount} de {slot.requirement.quantity} confirmados</span>
                        {!app && (
                          <span className="font-bold text-beetz-dark/70">
                            {remaining} {remaining === 1 ? 'vaga' : 'vagas'}
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full bg-beetz-gray overflow-hidden">
                        <div
                          className="h-full honey-gradient rounded-full transition-all"
                          style={{ width: `${Math.min(100, slot.requirement.quantity > 0 ? (slot.confirmedCount / slot.requirement.quantity) * 100 : 0)}%` }}
                        />
                      </div>
                    </div>

                    {slot.requirement.notes && (
                      <p className="text-xs text-beetz-dark/50 mt-2 bg-beetz-gray rounded-lg px-2.5 py-1.5">{slot.requirement.notes}</p>
                    )}
                  </div>
                </div>

                {app && app.status !== 'Recusado' ? (
                  <div className="mt-3 sm:flex sm:justify-end">
                    <button
                      onClick={() => handleCancel(slot)}
                      disabled={busy}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-sm font-semibold text-beetz-dark/55 hover:text-red-600 border border-beetz-dark/10 px-4 py-2.5 sm:py-2 rounded-xl hover:bg-beetz-gray disabled:opacity-50 transition-colors"
                    >
                      <X size={14} /> {busy ? '...' : app.status === 'Confirmado' ? 'Desistir da vaga' : 'Cancelar candidatura'}
                    </button>
                  </div>
                ) : !app ? (
                  <div className="mt-3 sm:flex sm:justify-end">
                    <button
                      onClick={() => handleApply(slot)}
                      disabled={busy}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 honey-gradient text-beetz-dark font-bold px-5 py-3 sm:py-2 rounded-xl text-sm disabled:opacity-60"
                    >
                      <Check size={15} /> {busy ? 'Enviando...' : 'Quero essa'}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
