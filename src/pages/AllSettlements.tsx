import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, ClipboardList, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getEventFinancialSummary, listEvents } from '../lib/dataService'
import { eventLabel } from '../lib/eventLabel'
import type { EventFinancialSummary, EventItem } from '../lib/types'
import { canViewFinancialSummary } from '../lib/permissions'

// Cada fechamento é um CÁLCULO caro (várias consultas por evento). A versão
// antiga calculava TODOS os eventos ao abrir a rota — centenas de requisições
// antes do primeiro pixel útil. Agora: a rota abre leve, você recorta os
// eventos e o Aplicar calcula só o que interessa, em lotes e com progresso.

const selectClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow bg-white'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthLabelOf(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

interface Row {
  event: EventItem
  summary: EventFinancialSummary
}

type SortDir = 'asc' | 'desc'

export default function AllSettlements() {
  const { accessRole } = useAuth()
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [events, setEvents] = useState<EventItem[]>([])
  // Multi-seleção de eventos: o select acumula; os marcados viram chips.
  const [eventFilter, setEventFilter] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null)

  // Rota abre LEVE: só a lista de eventos pros filtros. Nenhum cálculo ainda.
  useEffect(() => { listEvents().then(setEvents).catch(() => setEvents([])) }, [])

  const eventsById = useMemo(() => new Map(events.map((ev) => [ev.id, ev] as [string, EventItem])), [events])

  // Alvo do cálculo: o recorte de eventos (chips + mês + status). Sem nada
  // marcado, calcula todos — mas aí a escolha foi sua, com progresso na tela.
  const alvo = useMemo(() => {
    return events
      .filter((ev) => eventFilter.length === 0 || eventFilter.includes(ev.id))
      .filter((ev) => !monthFilter || ev.event_date.slice(0, 7) === monthFilter)
      .filter((ev) => !statusFilter || ev.status === statusFilter)
  }, [events, eventFilter, monthFilter, statusFilter])

  const meses = useMemo(() => [...new Set(events.map((ev) => ev.event_date.slice(0, 7)))].sort().reverse(), [events])
  const statuses = useMemo(() => [...new Set(events.map((ev) => ev.status))], [events])

  async function aplicar() {
    setLoading(true)
    setProgresso({ feito: 0, total: alvo.length })
    try {
      // Lotes de 6: paralelo o bastante pra ser rápido, educado o bastante
      // pra não afogar a conexão com dezenas de consultas simultâneas.
      const out: Row[] = []
      for (let i = 0; i < alvo.length; i += 6) {
        const lote = alvo.slice(i, i + 6)
        const sums = await Promise.all(lote.map((ev) => getEventFinancialSummary(ev.id)))
        lote.forEach((event, j) => out.push({ event, summary: sums[j] }))
        setProgresso({ feito: Math.min(i + 6, alvo.length), total: alvo.length })
      }
      setRows(out)
      setLoaded(true)
    } finally {
      setLoading(false)
      setProgresso(null)
    }
  }

  // Busca por nome: client-side sobre o que já foi calculado — instantânea.
  const sortedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const dir = sortDir === 'asc' ? 1 : -1
    return rows
      .filter((r) => !q || r.event.name.toLowerCase().includes(q))
      .sort((a, b) => dir * (a.event.event_date < b.event.event_date ? -1 : 1))
  }, [rows, sortDir, search])

  const totals = useMemo(() => {
    return sortedRows.reduce(
      (acc, r) => ({
        vendas: acc.vendas + r.summary.vendas,
        despesas: acc.despesas + r.summary.despesas,
        custoProdutos: acc.custoProdutos + r.summary.custoProdutos,
        consumoProducao: acc.consumoProducao + r.summary.consumoProducao,
        repasses: acc.repasses + r.summary.repasses,
        aReceber: acc.aReceber + r.summary.aReceber,
        saldoAPagarProdutora: acc.saldoAPagarProdutora + r.summary.saldoAPagarProdutora,
        lucroOuPerda: acc.lucroOuPerda + r.summary.lucroOuPerda
      }),
      { vendas: 0, despesas: 0, custoProdutos: 0, consumoProducao: 0, repasses: 0, aReceber: 0, saldoAPagarProdutora: 0, lucroOuPerda: 0 }
    )
  }, [sortedRows])

  if (!canViewFinancialSummary(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Essa área é exclusiva para a Diretoria.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
          <ClipboardList size={26} /> Todos os fechamentos
        </h1>
        <p className="text-beetz-dark/60 mt-1">Resumo financeiro (visão diretoria) dos eventos que você escolher, lado a lado.</p>
      </div>

      {/* Filtro avançado no padrão das outras telas: recorte + Aplicar. */}
      <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-2 lg:gap-3">
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (id && !eventFilter.includes(id)) setEventFilter((prev) => [...prev, id])
            }}
            className={`${selectClass} w-full lg:w-auto`}
          >
            <option value="">{eventFilter.length > 0 ? `+ Adicionar evento (${eventFilter.length})` : 'Todos os eventos'}</option>
            {events.filter((ev) => !eventFilter.includes(ev.id)).map((ev) => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
          </select>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={`${selectClass} w-full lg:w-auto`}>
            <option value="">Todos os meses</option>
            {meses.map((m) => <option key={m} value={m}>{monthLabelOf(m)}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectClass} w-full lg:w-auto`}>
            <option value="">Todos os status</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            className={`${selectClass} w-full lg:w-52`}
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {eventFilter.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {eventFilter.map((id) => {
              const ev = eventsById.get(id)
              return (
                <span key={id} className="flex items-center gap-1.5 text-xs font-semibold bg-beetz-yellow/25 border border-beetz-yellow/60 px-2.5 py-1 rounded-full">
                  {ev ? eventLabel(ev) : 'Evento'}
                  <button onClick={() => setEventFilter((prev) => prev.filter((x) => x !== id))} className="text-beetz-dark/40 hover:text-beetz-dark">
                    <X size={12} />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={aplicar}
            disabled={loading || alvo.length === 0}
            className="w-full sm:w-auto honey-gradient text-beetz-dark font-bold px-6 py-2.5 rounded-xl text-sm disabled:opacity-60 active:scale-[0.99] transition-transform"
          >
            {loading
              ? `Calculando${progresso ? ` ${progresso.feito} de ${progresso.total}` : ''}...`
              : `🔎 Calcular fechamentos (${alvo.length} evento${alvo.length === 1 ? '' : 's'})`}
          </button>
          {(eventFilter.length > 0 || monthFilter || statusFilter || search.trim()) && (
            <button
              onClick={() => { setEventFilter([]); setMonthFilter(''); setStatusFilter(''); setSearch('') }}
              className="text-xs font-semibold text-beetz-dark/50 hover:text-red-600 px-2 py-2"
            >
              Limpar filtros
            </button>
          )}
          {!loaded && !loading && (
            <p className="text-xs text-beetz-dark/45">
              Nada calcula sozinho: cada fechamento custa várias consultas — recorte os eventos e aplique.
            </p>
          )}
        </div>
      </div>

      {loading && !loaded ? (
        <p className="text-beetz-dark/50 text-sm">
          Calculando fechamentos{progresso ? ` (${progresso.feito} de ${progresso.total})` : ''}...
        </p>
      ) : !loaded ? (
        <div className="bg-white rounded-2xl p-10 shadow-soft border border-beetz-dark/5 text-center">
          <p className="text-4xl mb-3">🔎</p>
          <p className="font-bold">Escolha o recorte e calcule</p>
          <p className="text-sm text-beetz-dark/50 mt-1 max-w-md mx-auto">
            Marque um ou mais eventos (ou filtre por mês/status) e toque em Calcular fechamentos.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-beetz-dark/10 text-left">
                <th className="p-3 cursor-pointer select-none" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  <span className="flex items-center gap-1">Evento <ArrowUpDown size={12} className="text-beetz-dark/30" /></span>
                </th>
                <th className="p-3 text-right">Vendas</th>
                <th className="p-3 text-right">Despesas</th>
                <th className="p-3 text-right">Custo produtos</th>
                <th className="p-3 text-right">Consumo produção</th>
                <th className="p-3 text-right">Repasses</th>
                <th className="p-3 text-right">A receber</th>
                <th className="p-3 text-right">Saldo a repassar</th>
                <th className="p-3 text-right">Lucro/perda</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(({ event, summary }) => (
                <tr key={event.id} className="border-b border-beetz-dark/5 last:border-0">
                  <td className="p-3">
                    <Link to={`/eventos/${event.id}`} className="font-semibold hover:text-beetz-yellow transition-colors">{event.name}</Link>
                    <p className="text-xs text-beetz-dark/50">{formatDate(event.event_date)}</p>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.vendas)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.despesas)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.custoProdutos)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.consumoProducao)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.repasses)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.aReceber)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.saldoAPagarProdutora)}</td>
                  <td className={`p-3 text-right font-bold whitespace-nowrap ${summary.lucroOuPerda >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {currency(summary.lucroOuPerda)}
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-beetz-dark/50">Nenhum evento nesse recorte.</td></tr>
              )}
            </tbody>
            {sortedRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-beetz-dark/10 bg-beetz-gray/50 font-bold">
                  <td className="p-3">Total ({sortedRows.length})</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.vendas)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.despesas)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.custoProdutos)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.consumoProducao)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.repasses)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.aReceber)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.saldoAPagarProdutora)}</td>
                  <td className={`p-3 text-right whitespace-nowrap ${totals.lucroOuPerda >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {currency(totals.lucroOuPerda)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
