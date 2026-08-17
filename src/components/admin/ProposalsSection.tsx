import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Plus, Trash2, X } from 'lucide-react'
import {
  createServiceModality, deleteServiceModality, getAppSettings, listEventModalities, listEvents,
  listProducerNames, listServiceModalities, updateAppSettings, updateEvent, updateServiceModality
} from '../../lib/dataService'
import { eventLabel } from '../../lib/eventLabel'
import type { EventItem, EventModality, ServiceModality } from '../../lib/types'

// Controle de propostas do painel do produtor (produtor.beetz.bar), num
// lugar só: a FILA (aprovar/recusar o que chegou) e a CONFIGURAÇÃO do
// formulário (interruptor de propostas + catálogo de modalidades).

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const inputClass = 'border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

const CHIP: Record<string, string> = {
  Pendente: 'bg-amber-100 text-amber-700',
  Aprovada: 'bg-green-100 text-green-700',
  Recusada: 'bg-red-100 text-red-700'
}

export default function ProposalsSection() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [producerNames, setProducerNames] = useState<Map<string, string>>(new Map())
  const [modalities, setModalities] = useState<ServiceModality[]>([])
  const [proposalsOpen, setProposalsOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Detalhe expandido: modalidades pedidas naquela proposta.
  const [openId, setOpenId] = useState<string | null>(null)
  const [detalhes, setDetalhes] = useState<Map<string, EventModality[]>>(new Map())

  async function load() {
    setLoading(true)
    try {
      const [evs, prods, mods, cfg] = await Promise.all([
        listEvents(),
        listProducerNames().catch(() => new Map<string, string>()),
        listServiceModalities().catch(() => [] as ServiceModality[]),
        getAppSettings().catch(() => null)
      ])
      setEvents(evs)
      setProducerNames(prods)
      setModalities(mods)
      setProposalsOpen(cfg?.proposals_open ?? true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const propostas = useMemo(
    () => events
      .filter((e) => e.proposal_status)
      .sort((a, b) => {
        // Pendentes primeiro; dentro do grupo, mais recentes em cima.
        const pa = a.proposal_status === 'Pendente' ? 0 : 1
        const pb = b.proposal_status === 'Pendente' ? 0 : 1
        if (pa !== pb) return pa - pb
        return a.event_date < b.event_date ? 1 : -1
      }),
    [events]
  )
  const pendentes = propostas.filter((p) => p.proposal_status === 'Pendente').length

  async function toggleDetalhe(ev: EventItem) {
    if (openId === ev.id) { setOpenId(null); return }
    setOpenId(ev.id)
    if (!detalhes.has(ev.id)) {
      try {
        const mods = await listEventModalities(ev.id)
        setDetalhes((m) => new Map(m).set(ev.id, mods))
      } catch {
        setDetalhes((m) => new Map(m).set(ev.id, []))
      }
    }
  }

  // Aprovar: a proposta vira evento Confirmado (segue pro fluxo normal —
  // contrato, escala, estoque). Recusar: marca Recusada e cancela o evento.
  // NADA é apagado — histórico completo preservado.
  async function decidir(ev: EventItem, decisao: 'Aprovada' | 'Recusada') {
    if (decisao === 'Recusada' && !window.confirm(`Recusar a proposta "${ev.name}"? O evento fica Cancelado (nada é apagado).`)) return
    setBusyId(ev.id)
    setError(null)
    try {
      await updateEvent(ev.id, {
        proposal_status: decisao,
        status: decisao === 'Aprovada' ? 'Confirmado' : 'Cancelado'
      } as Partial<EventItem>)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra salvar a decisão.')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleProposalsOpen() {
    const novo = !proposalsOpen
    setProposalsOpen(novo)
    try {
      await updateAppSettings({ proposals_open: novo })
    } catch {
      setProposalsOpen(!novo)
      setError('Não deu pra salvar o interruptor agora.')
    }
  }

  // ---- Catálogo de modalidades (o cardápio do formulário de proposta) ----
  const [novoNome, setNovoNome] = useState('')
  const [novaUnidade, setNovaUnidade] = useState('un')
  const [modBusy, setModBusy] = useState<string | null>(null)

  async function addModalidade() {
    const nome = novoNome.trim()
    if (!nome) return
    setModBusy('nova')
    try {
      await createServiceModality({
        name: nome, description: null, requires_staffing: false, requires_products: false,
        unit_label: novaUnidade.trim() || 'un', sort_order: (modalities[modalities.length - 1]?.sort_order ?? 0) + 1
      })
      setNovoNome('')
      setModalities(await listServiceModalities())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra criar a modalidade.')
    } finally {
      setModBusy(null)
    }
  }

  async function toggleFlag(m: ServiceModality, campo: 'requires_staffing' | 'requires_products') {
    setModBusy(m.id)
    try {
      await updateServiceModality(m.id, { [campo]: !m[campo] } as Partial<ServiceModality>)
      setModalities((prev) => prev.map((x) => (x.id === m.id ? { ...x, [campo]: !m[campo] } : x)))
    } catch { /* mantém como estava */ } finally {
      setModBusy(null)
    }
  }

  async function removerModalidade(m: ServiceModality) {
    if (!window.confirm(`Tirar "${m.name}" do formulário de propostas? Propostas antigas que já a usaram não mudam.`)) return
    setModBusy(m.id)
    try {
      await deleteServiceModality(m.id)
      setModalities((prev) => prev.filter((x) => x.id !== m.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra remover (pode estar em uso).')
    } finally {
      setModBusy(null)
    }
  }

  if (loading) return <p className="text-beetz-dark/50 text-sm">Carregando propostas...</p>

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

      {/* Interruptor geral */}
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">Receber novas propostas</h2>
          <p className="text-xs text-beetz-dark/50 mt-0.5">
            Desligado, o painel do produtor (produtor.beetz.bar) mostra que as propostas estão pausadas — as já enviadas continuam aqui.
          </p>
        </div>
        <button
          onClick={toggleProposalsOpen}
          aria-label={proposalsOpen ? 'Fechar propostas' : 'Abrir propostas'}
          className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${proposalsOpen ? 'bg-beetz-yellow' : 'bg-beetz-dark/15'}`}
        >
          <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${proposalsOpen ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {/* Fila de propostas */}
      <div>
        <h2 className="font-bold mb-1">Fila de propostas {pendentes > 0 && <span className="text-xs font-extrabold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full align-middle ml-1">{pendentes} pendente{pendentes > 1 ? 's' : ''}</span>}</h2>
        <p className="text-xs text-beetz-dark/50 mb-3">
          Aprovar transforma a proposta em evento Confirmado (segue pro fluxo normal). Recusar marca e cancela — nada é apagado.
        </p>
        {propostas.length === 0 ? (
          <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 text-center border border-beetz-dark/5">
            Nenhuma proposta recebida ainda. Compartilhe produtor.beetz.bar com os produtores. 🤝
          </p>
        ) : (
          <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
            {propostas.map((ev) => {
              const dets = detalhes.get(ev.id)
              return (
                <div key={ev.id} className="p-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <Link to={`/eventos/${ev.id}`} className="font-bold text-sm hover:text-beetz-yellow transition-colors">
                        {eventLabel(ev)}
                      </Link>
                      <p className="text-[11px] text-beetz-dark/50 mt-0.5 truncate">
                        🤝 {(ev.producer_id && producerNames.get(ev.producer_id)) || ev.producer_name || 'Produtor'}
                        {ev.location ? ` · ${ev.location}` : ''}{ev.city ? ` · ${ev.city}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${CHIP[ev.proposal_status ?? 'Pendente']}`}>
                      {ev.proposal_status}
                    </span>
                    <button
                      onClick={() => toggleDetalhe(ev)}
                      className={`shrink-0 p-1.5 rounded-lg border transition-colors ${openId === ev.id ? 'bg-beetz-dark text-white border-beetz-dark' : 'text-beetz-dark/40 border-beetz-dark/10 hover:bg-beetz-gray'}`}
                      title="Ver o que foi pedido"
                    >
                      <ChevronDown size={13} className={`transition-transform ${openId === ev.id ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {openId === ev.id && (
                    <div className="mt-2 bg-beetz-gray/70 border border-beetz-dark/5 rounded-xl p-3 text-xs space-y-1">
                      {!dets ? (
                        <p className="text-beetz-dark/40">Carregando o pedido...</p>
                      ) : dets.length === 0 ? (
                        <p className="text-beetz-dark/40">Sem modalidades detalhadas nesta proposta.</p>
                      ) : (
                        <>
                          {dets.map((d) => {
                            const m = modalities.find((x) => x.id === d.modality_id)
                            return (
                              <p key={d.id} className="text-beetz-dark/70">
                                • {m?.name ?? 'Modalidade'} — {d.quantity} {m?.unit_label ?? 'un'} × {currency(d.unit_price)} = <strong>{currency(d.total)}</strong>
                                {d.notes ? <span className="text-beetz-dark/45"> · {d.notes}</span> : null}
                              </p>
                            )
                          })}
                          <p className="font-bold text-beetz-dark pt-1 border-t border-beetz-dark/10">
                            Total da proposta: {currency(dets.reduce((s, d) => s + d.total, 0))}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {ev.proposal_status === 'Pendente' && (
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <button
                        onClick={() => decidir(ev, 'Aprovada')}
                        disabled={busyId === ev.id}
                        className="flex items-center gap-1.5 text-xs font-bold bg-beetz-dark text-white px-3.5 py-2 rounded-xl disabled:opacity-50"
                      >
                        <Check size={13} /> Aprovar (vira evento Confirmado)
                      </button>
                      <button
                        onClick={() => decidir(ev, 'Recusada')}
                        disabled={busyId === ev.id}
                        className="flex items-center gap-1.5 text-xs font-semibold text-beetz-dark/50 hover:text-red-600 px-3 py-2 rounded-xl hover:bg-beetz-gray disabled:opacity-50"
                      >
                        <X size={13} /> Recusar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Catálogo do formulário */}
      <div>
        <h2 className="font-bold mb-1">Modalidades do formulário</h2>
        <p className="text-xs text-beetz-dark/50 mb-3">
          É o cardápio que o produtor vê ao montar a proposta. "Escala" e "Produtos" marcam o que cada modalidade exige da casa.
        </p>
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
          {modalities.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 p-3">
              <p className="font-semibold text-sm flex-1 min-w-[140px]">{m.name} <span className="text-beetz-dark/40 font-normal text-xs">({m.unit_label})</span></p>
              <button
                onClick={() => toggleFlag(m, 'requires_staffing')}
                disabled={modBusy === m.id}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${m.requires_staffing ? 'bg-beetz-yellow border-beetz-yellow' : 'border-beetz-dark/15 text-beetz-dark/40'}`}
              >
                Escala
              </button>
              <button
                onClick={() => toggleFlag(m, 'requires_products')}
                disabled={modBusy === m.id}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${m.requires_products ? 'bg-beetz-yellow border-beetz-yellow' : 'border-beetz-dark/15 text-beetz-dark/40'}`}
              >
                Produtos
              </button>
              <button
                onClick={() => removerModalidade(m)}
                disabled={modBusy === m.id}
                className="text-beetz-dark/30 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50"
                title="Tirar do formulário"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 p-3">
            <input
              className={`${inputClass} flex-1 min-w-[160px]`}
              placeholder="Nova modalidade... Ex.: Open bar premium"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addModalidade() }}
            />
            <input
              className={`${inputClass} w-24`}
              placeholder="unidade"
              value={novaUnidade}
              onChange={(e) => setNovaUnidade(e.target.value)}
              title="Como se conta: un, hora, pessoa..."
            />
            <button
              onClick={addModalidade}
              disabled={modBusy === 'nova' || !novoNome.trim()}
              className="flex items-center gap-1 text-xs font-bold bg-beetz-dark text-white px-3.5 py-2 rounded-xl disabled:opacity-50"
            >
              <Plus size={13} /> Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
