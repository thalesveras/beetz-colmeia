import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react'
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
  // Percentual padrão do produtor sobre as vendas — a regra da casa (40).
  const [percent, setPercent] = useState('40')
  const [percentBusy, setPercentBusy] = useState(false)
  const [percentOk, setPercentOk] = useState(false)
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
      setPercent(String(cfg?.proposal_producer_percent ?? 40))
      setTaxaDp(String(cfg?.proposal_fee_debit_pix ?? 0))
      setTaxaCr(String(cfg?.proposal_fee_credit ?? 0))
      setTaxaGe(String(cfg?.proposal_fee_management ?? 0))
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

  // Taxas da operação — aparecem no formulário e ficam congeladas na proposta.
  const [taxaDp, setTaxaDp] = useState('0')
  const [taxaCr, setTaxaCr] = useState('0')
  const [taxaGe, setTaxaGe] = useState('0')
  const [taxasBusy, setTaxasBusy] = useState(false)
  const [taxasOk, setTaxasOk] = useState(false)

  async function salvarTaxas() {
    const dp = Number(taxaDp.replace(',', '.'))
    const cr = Number(taxaCr.replace(',', '.'))
    const ge = Number(taxaGe.replace(',', '.'))
    if ([dp, cr, ge].some((v) => !Number.isFinite(v) || v < 0 || v > 100)) { setError('Taxas precisam estar entre 0 e 100.'); return }
    setTaxasBusy(true)
    setError(null)
    try {
      await updateAppSettings({ proposal_fee_debit_pix: dp, proposal_fee_credit: cr, proposal_fee_management: ge })
      setTaxasOk(true)
      setTimeout(() => setTaxasOk(false), 2500)
    } catch {
      setError('Não deu pra salvar as taxas agora.')
    } finally {
      setTaxasBusy(false)
    }
  }

  async function salvarPercent() {
    const v = Number(percent.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0 || v > 100) { setError('Percentual precisa estar entre 1 e 100.'); return }
    setPercentBusy(true)
    setError(null)
    try {
      await updateAppSettings({ proposal_producer_percent: v })
      setPercentOk(true)
      setTimeout(() => setPercentOk(false), 2500)
    } catch {
      setError('Não deu pra salvar o percentual agora.')
    } finally {
      setPercentBusy(false)
    }
  }

  // ---- Catálogo de modalidades (o cardápio do formulário de proposta) ----
  const [novoNome, setNovoNome] = useState('')
  const [novaUnidade, setNovaUnidade] = useState('un')
  const [novoPreco, setNovoPreco] = useState('')
  const [modBusy, setModBusy] = useState<string | null>(null)

  // Edição inline: nome, unidade e o PREÇO DA CASA (que o produtor aceita).
  const [editId, setEditId] = useState<string | null>(null)
  const [eNome, setENome] = useState('')
  const [eUnidade, setEUnidade] = useState('')
  const [ePreco, setEPreco] = useState('')

  function abrirEdicao(m: ServiceModality) {
    setEditId(m.id)
    setENome(m.name)
    setEUnidade(m.unit_label)
    setEPreco(m.default_price != null ? String(m.default_price) : '')
  }

  async function salvarEdicao(m: ServiceModality) {
    const precoNum = ePreco.trim() === '' ? null : Number(ePreco.replace(',', '.'))
    if (precoNum != null && (!Number.isFinite(precoNum) || precoNum < 0)) { setError('Preço inválido.'); return }
    setModBusy(m.id)
    setError(null)
    try {
      await updateServiceModality(m.id, {
        name: eNome.trim() || m.name,
        unit_label: eUnidade.trim() || m.unit_label,
        default_price: precoNum
      } as Partial<ServiceModality>)
      setModalities(await listServiceModalities())
      setEditId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra salvar a modalidade.')
    } finally {
      setModBusy(null)
    }
  }

  async function addModalidade() {
    const nome = novoNome.trim()
    if (!nome) return
    const precoNum = novoPreco.trim() === '' ? null : Number(novoPreco.replace(',', '.'))
    setModBusy('nova')
    try {
      await createServiceModality({
        name: nome, description: null, requires_staffing: false, requires_products: false,
        unit_label: novaUnidade.trim() || 'un', sort_order: (modalities[modalities.length - 1]?.sort_order ?? 0) + 1,
        default_price: precoNum != null && Number.isFinite(precoNum) ? precoNum : null
      } as Parameters<typeof createServiceModality>[0])
      setNovoNome('')
      setNovoPreco('')
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

      {/* Percentual padrão do produtor — o formulário EXIGE este valor. */}
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">Percentual do produtor</h2>
          <p className="text-xs text-beetz-dark/50 mt-0.5">
            É o repasse sobre as vendas que aparece travado no formulário de proposta — a casa trabalha com 40%.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="text" inputMode="decimal"
            className={`${inputClass} w-20 text-center font-bold`}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
          <span className="text-sm font-bold text-beetz-dark/50">%</span>
          <button
            onClick={salvarPercent}
            disabled={percentBusy}
            className="text-xs font-bold bg-beetz-dark text-white px-3.5 py-2 rounded-xl disabled:opacity-50"
          >
            {percentBusy ? 'Salvando...' : percentOk ? 'Salvo ✓' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Taxas da operação: aparecem no formulário do produtor e ficam
          CONGELADAS na proposta enviada (snapshot). */}
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="font-bold">Taxas da operação</h2>
            <p className="text-xs text-beetz-dark/50 mt-0.5">
              O produtor vê e aceita ao enviar a proposta — o aceite fica registrado no evento.
            </p>
          </div>
          <button
            onClick={salvarTaxas}
            disabled={taxasBusy}
            className="text-xs font-bold bg-beetz-dark text-white px-3.5 py-2 rounded-xl disabled:opacity-50"
          >
            {taxasBusy ? 'Salvando...' : taxasOk ? 'Salvo ✓' : 'Salvar taxas'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold block mb-1 text-beetz-dark/60">Débito/Pix (%)</label>
            <input className={`${inputClass} w-full text-center font-bold`} inputMode="decimal" value={taxaDp} onChange={(e) => setTaxaDp(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1 text-beetz-dark/60">Crédito (%)</label>
            <input className={`${inputClass} w-full text-center font-bold`} inputMode="decimal" value={taxaCr} onChange={(e) => setTaxaCr(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1 text-beetz-dark/60">Gestão (%)</label>
            <input className={`${inputClass} w-full text-center font-bold`} inputMode="decimal" value={taxaGe} onChange={(e) => setTaxaGe(e.target.value)} />
          </div>
        </div>
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
                      {/* As respostas comerciais do produtor — decisão com tudo na mesa. */}
                      <p className="text-beetz-dark/70">
                        💰 Repasse ao produtor: <strong>{ev.commission_percentage ?? 0}%</strong>
                        {ev.min_sales_target != null && <> · Mínimo de vendas: <strong>{currency(Number(ev.min_sales_target))}</strong></>}
                        {ev.sales_amount ? <> · Estimadas: {currency(Number(ev.sales_amount))}</> : null}
                      </p>
                      {(ev.has_other_beverage_partners != null || ev.has_official_beer != null) && (
                        <p className="text-beetz-dark/70 pb-1 border-b border-beetz-dark/10">
                          🍺 Outros parceiros de bebida: <strong>{ev.has_other_beverage_partners ? `Sim — ${ev.beverage_partners_notes ?? ''}` : 'Não'}</strong>
                          {' · '}Cerveja oficial: <strong>{ev.has_official_beer ? `Sim — ${ev.official_beer_brand ?? ''}` : 'Não'}</strong>
                        </p>
                      )}
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
            <div key={m.id} className="p-3">
              {editId === m.id ? (
                /* Edição inline: nome, unidade e preço da casa. */
                <div className="flex flex-wrap items-center gap-2">
                  <input className={`${inputClass} flex-1 min-w-[140px]`} value={eNome} onChange={(e) => setENome(e.target.value)} placeholder="Nome" />
                  <input className={`${inputClass} w-20`} value={eUnidade} onChange={(e) => setEUnidade(e.target.value)} placeholder="unidade" title="Como se conta: un, hora, máquina..." />
                  <input className={`${inputClass} w-28`} value={ePreco} onChange={(e) => setEPreco(e.target.value)} inputMode="decimal" placeholder="Preço R$" title="Preço da casa — o produtor aceita este valor no formulário. Vazio = produtor digita." />
                  <button onClick={() => salvarEdicao(m)} disabled={modBusy === m.id} className="text-xs font-bold bg-beetz-dark text-white px-3 py-2 rounded-xl disabled:opacity-50">
                    {modBusy === m.id ? '...' : 'Salvar'}
                  </button>
                  <button onClick={() => setEditId(null)} className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm flex-1 min-w-[140px]">
                    {m.name} <span className="text-beetz-dark/40 font-normal text-xs">({m.unit_label})</span>
                    {m.default_price != null && (
                      <span className="ml-1.5 text-[11px] font-bold bg-beetz-yellow/25 text-beetz-dark px-2 py-0.5 rounded-full">
                        {currency(m.default_price)} / {m.unit_label}
                      </span>
                    )}
                  </p>
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
                    onClick={() => abrirEdicao(m)}
                    className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray"
                    title="Editar nome, unidade e preço da casa"
                  >
                    <Pencil size={14} />
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
              )}
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
              className={`${inputClass} w-20`}
              placeholder="unidade"
              value={novaUnidade}
              onChange={(e) => setNovaUnidade(e.target.value)}
              title="Como se conta: un, hora, pessoa..."
            />
            <input
              className={`${inputClass} w-28`}
              placeholder="Preço R$"
              inputMode="decimal"
              value={novoPreco}
              onChange={(e) => setNovoPreco(e.target.value)}
              title="Preço da casa — vazio deixa o produtor digitar"
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
