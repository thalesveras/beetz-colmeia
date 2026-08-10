import { eventLabel } from '../../lib/eventLabel'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, CalendarDays, Filter, PieChart, Search, Users, Wallet, X
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canViewFinancialSummary } from '../../lib/permissions'
import { getCashReconciliation, getEventFinanceRows, getFinanceDataset, type CashReconRow, type EventFinanceRow, type FinanceDataset, type FinanceRow } from '../../lib/dataService'
import { Donut, HorizontalBars, MonthlyBars, formatMoney, formatMoneyFull, monthLabel, type ChartDatum } from '../../components/finance/Charts'

const inputClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

// Por qual campo agrupar o gráfico principal. É o "filtro de visualização":
// a mesma pergunta ("onde foi o dinheiro?") respondida por ângulos diferentes.
type GroupBy = 'category' | 'eventName' | 'supplierName' | 'personName' | 'status' | 'paymentMethod'
type ChartKind = 'barras' | 'rosca'

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'category', label: 'Categoria' },
  { key: 'eventName', label: 'Evento' },
  { key: 'supplierName', label: 'Fornecedor' },
  { key: 'personName', label: 'Colaborador' },
  { key: 'status', label: 'Status' },
  { key: 'paymentMethod', label: 'Forma de pagamento' }
]

const TOP_N = 8

function groupSum(rows: FinanceRow[], field: GroupBy): ChartDatum[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = String(r[field] ?? '—')
    map.set(k, (map.get(k) ?? 0) + r.total)
  }
  const all = [...map.entries()]
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((a, b) => b.value - a.value)

  // Com muitas fatias o gráfico vira sopa de letrinha — mostra as maiores e
  // junta o resto em "Outros", sem esconder o valor total.
  if (all.length <= TOP_N) return all
  const top = all.slice(0, TOP_N)
  const restSum = all.slice(TOP_N).reduce((s, d) => s + d.value, 0)
  return [...top, { key: '__outros__', label: `Outros (${all.length - TOP_N})`, value: restSum }]
}

export default function FinanceDashboard() {
  const { accessRole } = useAuth()
  const [data, setData] = useState<FinanceDataset | null>(null)
  const [loading, setLoading] = useState(true)

  // Filtros
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [eventId, setEventId] = useState('')
  const [category, setCategory] = useState('')
  const [supplier, setSupplier] = useState('')
  const [person, setPerson] = useState('')
  const [status, setStatus] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Visualização
  const [groupBy, setGroupBy] = useState<GroupBy>('category')
  const [chartKind, setChartKind] = useState<ChartKind>('barras')

  // As três visões do painel: "Caixa" (a conferência de espécie — quanto cada
  // evento tem a devolver pro caixa da empresa, ou quanto faltou), "Por
  // evento" (o P&L de cada festa) e "Despesas" (pra onde o dinheiro foi).
  // Caixa abre primeiro: é a conta que fecha a noite.
  const [visao, setVisao] = useState<'caixa' | 'eventos' | 'despesas'>('caixa')
  const [eventRows, setEventRows] = useState<EventFinanceRow[]>([])
  const [cashRows, setCashRows] = useState<CashReconRow[]>([])
  const [evStatus, setEvStatus] = useState('')
  type EvSortKey = 'name' | 'event_date' | 'pdv_faturado' | 'recebido_caixas' | 'despesas' | 'comissoes' | 'resultado'
  const [evSort, setEvSort] = useState<{ key: EvSortKey; asc: boolean }>({ key: 'event_date', asc: false })

  useEffect(() => {
    Promise.all([getFinanceDataset(), getEventFinanceRows(), getCashReconciliation().catch(() => [] as CashReconRow[])])
      .then(([d, ev, cx]) => { setData(d); setEventRows(ev); setCashRows(cx) })
      .finally(() => setLoading(false))
  }, [])

  const mesesEventos = useMemo(
    () => [...new Set(eventRows.map((r) => r.event_date.slice(0, 7)))].sort().reverse(),
    [eventRows]
  )
  const statusEventos = useMemo(() => [...new Set(eventRows.map((r) => r.status))], [eventRows])

  const eventosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    const dir = evSort.asc ? 1 : -1
    return eventRows
      .filter((r) =>
        (!month || r.event_date.slice(0, 7) === month) &&
        (!evStatus || r.status === evStatus) &&
        (!q || r.name.toLowerCase().includes(q))
      )
      .map((r) => ({
        ...r,
        resultado: r.pdv_faturado - r.despesas,
        margem: r.pdv_faturado > 0 ? ((r.pdv_faturado - r.despesas) / r.pdv_faturado) * 100 : null
      }))
      .sort((a, b) => {
        const va = (a as any)[evSort.key]
        const vb = (b as any)[evSort.key]
        if (evSort.key === 'name') return dir * String(va).localeCompare(String(vb), 'pt-BR')
        if (evSort.key === 'event_date') return dir * String(va).localeCompare(String(vb))
        return dir * (Number(va ?? 0) - Number(vb ?? 0))
      })
  }, [eventRows, month, evStatus, search, evSort])

  const totaisEv = useMemo(() => {
    const fat = eventosFiltrados.reduce((s, r) => s + r.pdv_faturado, 0)
    const desp = eventosFiltrados.reduce((s, r) => s + r.despesas, 0)
    const com = eventosFiltrados.reduce((s, r) => s + r.comissoes, 0)
    const receb = eventosFiltrados.reduce((s, r) => s + r.recebido_caixas, 0)
    return { fat, desp, com, receb, res: fat - desp }
  }, [eventosFiltrados])

  const eventosSemPdv = useMemo(
    () => eventosFiltrados.filter((r) => r.status === 'Concluído' && r.pdv_faturado === 0).length,
    [eventosFiltrados]
  )

  const fmtDataEv = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '')

  const rows = data?.rows ?? []

  const options = useMemo(() => {
    const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort()
    return {
      months: [...new Set(rows.map((r) => r.month).filter(Boolean))].sort(),
      categories: uniq(rows.map((r) => r.category)),
      suppliers: uniq(rows.map((r) => r.supplierName)),
      people: uniq(rows.map((r) => r.personName)),
      statuses: uniq(rows.map((r) => r.status))
    }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (month && r.month !== month) return false
      if (eventId && r.eventId !== eventId) return false
      if (category && r.category !== category) return false
      if (supplier && r.supplierName !== supplier) return false
      if (person && r.personName !== person) return false
      if (status && r.status !== status) return false
      if (q && !`${r.description} ${r.eventName} ${r.supplierName} ${r.personName}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, month, eventId, category, supplier, person, status, search])

  const totals = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.total, 0)
    const pendente = filtered.filter((r) => r.status === 'Pendente').reduce((s, r) => s + r.total, 0)
    const eventos = new Set(filtered.map((r) => r.eventId)).size
    const pessoas = new Set(filtered.filter((r) => r.personId).map((r) => r.personId)).size
    const fornecedores = new Set(filtered.filter((r) => r.supplierId).map((r) => r.supplierId)).size
    return { total, pendente, eventos, pessoas, fornecedores, lancamentos: filtered.length }
  }, [filtered])

  const chartData = useMemo(() => groupSum(filtered, groupBy), [filtered, groupBy])
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    // Meses vêm de TODAS as linhas, não das filtradas — senão filtrar um mês
    // apagaria os outros do gráfico e você perderia a comparação.
    for (const m of options.months) map.set(m, 0)
    for (const r of filtered) {
      if (r.month) map.set(r.month, (map.get(r.month) ?? 0) + r.total)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({ key, label: monthLabel(key), value }))
  }, [filtered, options.months])

  // Clicar numa barra aplica (ou tira) o filtro correspondente — é o
  // cruzamento: categoria "Equipe" -> vê só Equipe -> troca o agrupamento
  // pra Evento e descobre em qual festa a Equipe custou mais.
  function handleChartSelect(key: string) {
    if (key === '__outros__') return
    const setters: Record<GroupBy, (v: string) => void> = {
      category: setCategory, eventName: () => {}, supplierName: setSupplier,
      personName: setPerson, status: setStatus, paymentMethod: () => {}
    }
    if (groupBy === 'eventName') {
      const ev = data?.events.find((e) => e.name === key)
      setEventId((cur) => (ev && cur === ev.id ? '' : ev?.id ?? ''))
      return
    }
    if (groupBy === 'paymentMethod') return
    const current = { category, supplierName: supplier, personName: person, status }[groupBy as 'category' | 'supplierName' | 'personName' | 'status']
    setters[groupBy](current === key ? '' : key)
  }

  const selectedChartKey = useMemo(() => {
    if (groupBy === 'category') return category || null
    if (groupBy === 'supplierName') return supplier || null
    if (groupBy === 'personName') return person || null
    if (groupBy === 'status') return status || null
    if (groupBy === 'eventName') return data?.events.find((e) => e.id === eventId)?.name ?? null
    return null
  }, [groupBy, category, supplier, person, status, eventId, data])

  // Conferência de caixa: mesmos filtros da visão por evento (mês/status/busca).
  const caixaFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cashRows
      .filter((r) =>
        (!month || r.event_date.slice(0, 7) === month) &&
        (!evStatus || r.event_status === evStatus) &&
        (!q || r.event_name.toLowerCase().includes(q))
      )
      .map((r) => ({ ...r, saldo: r.cash_in - r.cash_out }))
  }, [cashRows, month, evStatus, search])

  const totaisCaixa = useMemo(() => {
    const devolver = caixaFiltrados.filter((r) => r.saldo > 0).reduce((s, r) => s + r.saldo, 0)
    const cobrir = caixaFiltrados.filter((r) => r.saldo < 0).reduce((s, r) => s + Math.abs(r.saldo), 0)
    const entrada = caixaFiltrados.reduce((s, r) => s + r.cash_in, 0)
    const saida = caixaFiltrados.reduce((s, r) => s + r.cash_out, 0)
    return { devolver, cobrir, entrada, saida, geral: entrada - saida }
  }, [caixaFiltrados])

  const activeFilters = visao === 'despesas'
    ? [month, eventId, category, supplier, person, status, search.trim()].filter(Boolean).length
    : [month, evStatus, search.trim()].filter(Boolean).length

  function clearFilters() {
    setMonth(''); setEventId(''); setCategory(''); setSupplier(''); setPerson(''); setStatus(''); setSearch(''); setEvStatus('')
  }

  if (!canViewFinancialSummary(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Essa área é exclusiva para a Diretoria.</p>
      </div>
    )
  }

  if (loading) return <p className="text-beetz-dark/50 p-8">Carregando o financeiro...</p>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Financeiro</h1>
          <p className="text-beetz-dark/60 mt-1 hidden sm:block">O raio-X de cada evento — e pra onde o dinheiro foi.</p>
        </div>
        <Link to="/financeiro/despesas" className="text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark border border-beetz-dark/15 px-4 py-2 rounded-xl">
          Lançar despesas →
        </Link>
      </div>

      {/* Barra de comando: GRUDA no topo na rolagem — visão, busca e filtros
          sempre à mão, sem subir a tela (a dor da versão anterior). A sangria
          -mx-4 é IGUAL ao p-4 do container no mobile: cola na borda sem vazar. */}
      <div className="sticky top-12 z-20 bg-beetz-gray/95 backdrop-blur-sm -mx-4 px-4 md:mx-0 md:px-0 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex bg-white rounded-xl p-1 border border-beetz-dark/10 shrink-0">
            <button
              onClick={() => setVisao('caixa')}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${visao === 'caixa' ? 'bg-beetz-dark text-white' : 'text-beetz-dark/50'}`}
            >
              💵 Caixa
            </button>
            <button
              onClick={() => setVisao('eventos')}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${visao === 'eventos' ? 'bg-beetz-dark text-white' : 'text-beetz-dark/50'}`}
            >
              Por evento
            </button>
            <button
              onClick={() => setVisao('despesas')}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${visao === 'despesas' ? 'bg-beetz-dark text-white' : 'text-beetz-dark/50'}`}
            >
              Despesas
            </button>
          </div>
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
            <input
              placeholder={visao === 'despesas' ? 'Buscar descrição, fornecedor, pessoa...' : 'Buscar evento...'}
              value={search} onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} w-full min-w-0 pl-9`}
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`shrink-0 flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border transition-colors ${
              showFilters || activeFilters > 0
                ? 'bg-beetz-dark text-white border-beetz-dark'
                : 'bg-white text-beetz-dark/70 border-beetz-dark/10 hover:bg-beetz-gray'
            }`}
          >
            <Filter size={14} /><span className="hidden sm:inline">Filtros</span>
            {activeFilters > 0 && (
              <span className="bg-beetz-yellow text-beetz-dark text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {showFilters && (visao !== 'despesas' ? (
          <div className="bg-white rounded-2xl p-3 border border-beetz-dark/5 shadow-soft grid grid-cols-2 gap-2">
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputClass} min-w-0`}>
              <option value="">Todos os meses</option>
              {mesesEventos.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={evStatus} onChange={(e) => setEvStatus(e.target.value)} className={`${inputClass} min-w-0`}>
              <option value="">Todos os status</option>
              {statusEventos.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="col-span-2 text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark flex items-center gap-1 justify-end">
                <X size={12} /> Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 border border-beetz-dark/5 shadow-soft grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputClass} min-w-0`}>
              <option value="">Todos os meses</option>
              {options.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={`${inputClass} min-w-0`}>
              <option value="">Todos os eventos</option>
              {data?.events.map((e) => <option key={e.id} value={e.id}>{eventLabel(e)}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClass} min-w-0`}>
              <option value="">Todas as categorias</option>
              {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={`${inputClass} min-w-0`}>
              <option value="">Todos os fornecedores</option>
              {options.suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={person} onChange={(e) => setPerson(e.target.value)} className={`${inputClass} min-w-0`}>
              <option value="">Todos os colaboradores</option>
              {options.people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} min-w-0`}>
              <option value="">Todos os status</option>
              {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="col-span-2 sm:col-span-3 text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark flex items-center gap-1 justify-end">
                <X size={12} /> Limpar filtros
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ============ VISÃO CAIXA: conferência de espécie por evento ============
          Recebido em dinheiro pelos caixas − despesas em Dinheiro do evento.
          Positivo: o evento tem dinheiro a DEVOLVER pro caixa da empresa.
          Negativo: faltou — a empresa precisa INCLUIR essa diferença.
          Só leitura: nenhuma despesa é alterada aqui. */}
      {visao === 'caixa' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-beetz-dark text-white rounded-2xl p-4">
              <p className={`text-2xl font-extrabold leading-none ${totaisCaixa.geral < 0 ? 'text-red-400' : 'text-beetz-yellow'}`}>
                {totaisCaixa.geral < 0 ? '−' : ''}{formatMoney(Math.abs(totaisCaixa.geral))}
              </p>
              <p className="text-xs text-white/60 mt-1.5">Saldo geral {totaisCaixa.geral < 0 ? '(faltando)' : 'a entrar no caixa'}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className="text-2xl font-extrabold leading-none text-green-700">{formatMoney(totaisCaixa.devolver)}</p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">A devolver ao caixa ({caixaFiltrados.filter((r) => r.saldo > 0).length} eventos)</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className="text-2xl font-extrabold leading-none text-red-600">{formatMoney(totaisCaixa.cobrir)}</p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">A incluir no caixa ({caixaFiltrados.filter((r) => r.saldo < 0).length} eventos)</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className="text-lg font-extrabold leading-tight">{formatMoney(totaisCaixa.entrada)}<span className="text-beetz-dark/35 font-semibold text-sm"> − {formatMoney(totaisCaixa.saida)}</span></p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">Recebido em dinheiro − despesas em dinheiro</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-beetz-dark/5 flex items-center justify-between gap-2">
              <p className="font-bold text-sm">Conferência evento por evento</p>
              <p className="text-xs text-beetz-dark/40">{caixaFiltrados.length} eventos com movimento em espécie</p>
            </div>

            {caixaFiltrados.length === 0 ? (
              <p className="text-sm text-beetz-dark/40 p-8 text-center">Nenhum evento com dinheiro em espécie nesse filtro.</p>
            ) : (
              <div className="divide-y divide-beetz-dark/5">
                {caixaFiltrados.map((r) => (
                  <Link
                    key={r.event_id}
                    to={`/eventos/${r.event_id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-beetz-gray transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{r.event_name}</p>
                      <p className="text-[11px] text-beetz-dark/40 mt-0.5">
                        {fmtDataEv(r.event_date)} · {r.event_status}
                        {r.cash_out_pendente > 0.004 && (
                          <span className="text-amber-700"> · inclui {formatMoneyFull(r.cash_out_pendente)} em dinheiro ainda pendente</span>
                        )}
                      </p>
                      {/* A conta escrita por extenso — é uma tela de conferência,
                          o número tem que ser auditável de olho. */}
                      <p className="text-[11px] text-beetz-dark/50 mt-0.5 tabular-nums">
                        💵 {formatMoneyFull(r.cash_in)} recebido − {formatMoneyFull(r.cash_out)} em despesas
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-extrabold tabular-nums ${r.saldo < -0.004 ? 'text-red-600' : 'text-green-700'}`}>
                        {r.saldo < 0 ? '−' : ''}{formatMoneyFull(Math.abs(r.saldo))}
                      </p>
                      <p className={`text-[10px] font-bold uppercase tracking-wide ${r.saldo < -0.004 ? 'text-red-500' : 'text-green-600'}`}>
                        {r.saldo < -0.004 ? 'incluir no caixa' : 'devolver ao caixa'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Rodapé com a soma da conferência filtrada */}
            <div className="px-4 py-3 bg-beetz-dark text-white flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white/60">Saldo dos eventos listados</p>
              <p className={`font-extrabold tabular-nums ${totaisCaixa.geral < 0 ? 'text-red-400' : 'text-beetz-yellow'}`}>
                {totaisCaixa.geral < 0 ? '−' : ''}{formatMoneyFull(Math.abs(totaisCaixa.geral))}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-beetz-dark/40">
            Entram na conta: valores em <strong>Dinheiro</strong> dos recebimentos dos caixas (fechamentos não rejeitados) e todas as
            despesas do evento com forma de pagamento <strong>Dinheiro</strong>. Nada é alterado — é só conferência.
          </p>
        </>
      )}

      {/* ============ VISÃO POR EVENTO: o P&L de cada festa ============ */}
      {visao === 'eventos' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-beetz-dark text-white rounded-2xl p-4">
              <p className="text-2xl font-extrabold leading-none">{formatMoney(totaisEv.fat)}</p>
              <p className="text-xs text-white/60 mt-1.5">Faturado (PDV real)</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className="text-2xl font-extrabold leading-none">{formatMoney(totaisEv.desp)}</p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">Despesas</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className={`text-2xl font-extrabold leading-none ${totaisEv.res >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {formatMoney(totaisEv.res)}
              </p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">Resultado (fat − desp)</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className="text-2xl font-extrabold leading-none">{formatMoney(totaisEv.com)}</p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">Comissões · caixas {formatMoney(totaisEv.receb)}</p>
            </div>
          </div>

          {eventosSemPdv > 0 && (
            <p className="text-xs text-beetz-dark/50 bg-beetz-yellow/15 border border-beetz-yellow/40 rounded-xl px-3 py-2">
              ⚠️ {eventosSemPdv} evento(s) concluído(s) sem relatório de PDV importado — o faturado deles está zerado
              aqui até subir o CSV em Evento → Produtos.
            </p>
          )}

          {/* Celular: cards com os 3 números que decidem; toque abre o evento. */}
          <div className="md:hidden space-y-3">
            {eventosFiltrados.map((r) => (
              <Link key={r.id} to={`/eventos/${r.id}`} className="block bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 min-w-0 overflow-hidden">
                <div className="flex items-center gap-3">
                  {r.flyer_url ? (
                    <img src={r.flyer_url} alt="" className="w-11 h-14 rounded-lg object-cover shrink-0 border border-beetz-dark/10" />
                  ) : (
                    <div className="w-11 h-14 rounded-lg dark-gradient flex items-center justify-center text-white text-lg shrink-0">🐝</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold leading-snug truncate">{r.name}</p>
                    <p className="text-[11px] text-beetz-dark/50">{fmtDataEv(r.event_date)} · {r.status}</p>
                  </div>
                  {r.margem !== null && (
                    <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      r.margem >= 30 ? 'bg-green-100 text-green-700' : r.margem >= 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {Math.round(r.margem)}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-beetz-gray/60 rounded-xl py-2">
                    <p className="text-sm font-extrabold">{formatMoney(r.pdv_faturado)}</p>
                    <p className="text-[10px] text-beetz-dark/45">Faturado</p>
                  </div>
                  <div className="bg-beetz-gray/60 rounded-xl py-2">
                    <p className="text-sm font-extrabold">{formatMoney(r.despesas)}</p>
                    <p className="text-[10px] text-beetz-dark/45">Despesas</p>
                  </div>
                  <div className="bg-beetz-gray/60 rounded-xl py-2">
                    <p className={`text-sm font-extrabold ${r.resultado >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoney(r.resultado)}</p>
                    <p className="text-[10px] text-beetz-dark/45">Resultado</p>
                  </div>
                </div>
              </Link>
            ))}
            {eventosFiltrados.length === 0 && (
              <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 text-center border border-beetz-dark/5">Nenhum evento com esses filtros.</p>
            )}
          </div>

          {/* Desktop: a tabela completa, ordenável por qualquer coluna. */}
          <div className="hidden md:block bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-beetz-dark/40 border-b border-beetz-dark/10">
                  {([
                    ['name', 'Evento', false],
                    ['event_date', 'Data', false],
                    ['pdv_faturado', 'Faturado (PDV)', true],
                    ['recebido_caixas', 'Recebido caixas', true],
                    ['despesas', 'Despesas', true],
                    ['comissoes', 'Comissões', true],
                    ['resultado', 'Resultado', true]
                  ] as [EvSortKey, string, boolean][]).map(([k, label, right]) => (
                    <th
                      key={k}
                      onClick={() => setEvSort((s) => ({ key: k, asc: s.key === k ? !s.asc : false }))}
                      className={`px-4 py-3 cursor-pointer select-none hover:text-beetz-dark ${right ? 'text-right' : ''}`}
                    >
                      {label}{evSort.key === k ? (evSort.asc ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beetz-dark/5">
                {eventosFiltrados.map((r) => (
                  <tr key={r.id} className="hover:bg-beetz-gray/50">
                    <td className="px-4 py-3">
                      <Link to={`/eventos/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                      <span className="ml-2 text-[10px] text-beetz-dark/40">{r.status}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-beetz-dark/60">{fmtDataEv(r.event_date)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{r.pdv_faturado > 0 ? formatMoneyFull(r.pdv_faturado) : <span className="text-beetz-dark/30">—</span>}</td>
                    <td className="px-4 py-3 text-right">{r.recebido_caixas > 0 ? formatMoneyFull(r.recebido_caixas) : <span className="text-beetz-dark/30">—</span>}</td>
                    <td className="px-4 py-3 text-right">{r.despesas > 0 ? formatMoneyFull(r.despesas) : <span className="text-beetz-dark/30">—</span>}</td>
                    <td className="px-4 py-3 text-right">{r.comissoes > 0 ? formatMoneyFull(r.comissoes) : <span className="text-beetz-dark/30">—</span>}</td>
                    <td className={`px-4 py-3 text-right font-bold ${r.resultado > 0 ? 'text-green-700' : r.resultado < 0 ? 'text-red-600' : 'text-beetz-dark/30'}`}>
                      {r.pdv_faturado > 0 || r.despesas > 0 ? formatMoneyFull(r.resultado) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.margem !== null ? (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          r.margem >= 30 ? 'bg-green-100 text-green-700' : r.margem >= 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {Math.round(r.margem)}%
                        </span>
                      ) : <span className="text-beetz-dark/30">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-beetz-dark/10 font-extrabold bg-beetz-gray/40">
                  <td className="px-4 py-3" colSpan={2}>Total · {eventosFiltrados.length} evento(s)</td>
                  <td className="px-4 py-3 text-right">{formatMoneyFull(totaisEv.fat)}</td>
                  <td className="px-4 py-3 text-right">{formatMoneyFull(totaisEv.receb)}</td>
                  <td className="px-4 py-3 text-right">{formatMoneyFull(totaisEv.desp)}</td>
                  <td className="px-4 py-3 text-right">{formatMoneyFull(totaisEv.com)}</td>
                  <td className={`px-4 py-3 text-right ${totaisEv.res >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoneyFull(totaisEv.res)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
            {eventosFiltrados.length === 0 && (
              <p className="text-sm text-beetz-dark/50 p-6 text-center">Nenhum evento com esses filtros.</p>
            )}
          </div>

          <p className="text-[11px] text-beetz-dark/35">
            Faturado = relatório oficial do PDV (Evento → Produtos). Resultado = faturado − despesas não canceladas.
            Recebido caixas e comissões vêm dos recebimentos de garçons/caixas (sem os rejeitados).
          </p>
        </>
      )}

      {/* ============ VISÃO DESPESAS: o painel clássico ============ */}
      {visao === 'despesas' && (
        <>
      {/* A receita quase não é lançada — melhor dizer isso na cara do que
          mostrar um "lucro" calculado em cima de zero. */}
      {data && data.eventsWithoutRevenue > 0 && (
        <div className="flex items-start gap-3 bg-beetz-yellow/15 border border-beetz-yellow/40 rounded-2xl p-4">
          <AlertTriangle size={18} className="text-beetz-dark/70 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">
              {data.eventsWithoutRevenue} {data.eventsWithoutRevenue === 1 ? 'evento concluído está' : 'eventos concluídos estão'} sem faturamento lançado
            </p>
            <p className="text-sm text-beetz-dark/60 mt-0.5">
              Por isso esse painel mostra custos, e não lucro. Preencha o faturamento no resumo de cada evento
              pra margem fazer sentido.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-beetz-dark text-white rounded-2xl p-4">
          <p className="text-2xl font-extrabold leading-none">{formatMoney(totals.total)}</p>
          <p className="text-xs text-white/60 mt-1.5">Total em despesas</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
          <p className="text-2xl font-extrabold leading-none">{formatMoney(totals.pendente)}</p>
          <p className="text-xs text-beetz-dark/50 mt-1.5">Ainda pendente</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
          <p className="text-2xl font-extrabold leading-none">{totals.lancamentos}</p>
          <p className="text-xs text-beetz-dark/50 mt-1.5">Lançamentos · {totals.eventos} evento(s)</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
          <p className="text-2xl font-extrabold leading-none">{totals.pessoas}</p>
          <p className="text-xs text-beetz-dark/50 mt-1.5">Pessoas · {totals.fornecedores} fornecedor(es)</p>
        </div>
      </div>

      {/* ---------- Gráfico principal, com seletor de ângulo ---------- */}
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-bold flex items-center gap-2"><Wallet size={17} /> Despesas por</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={`${inputClass} font-semibold`}>
              {GROUP_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <div className="flex bg-beetz-gray rounded-xl p-1">
              <button
                onClick={() => setChartKind('barras')}
                title="Barras"
                className={`p-1.5 rounded-lg ${chartKind === 'barras' ? 'bg-white shadow-sm' : 'text-beetz-dark/40'}`}
              >
                <BarChart3 size={15} />
              </button>
              <button
                onClick={() => setChartKind('rosca')}
                title="Rosca"
                className={`p-1.5 rounded-lg ${chartKind === 'rosca' ? 'bg-white shadow-sm' : 'text-beetz-dark/40'}`}
              >
                <PieChart size={15} />
              </button>
            </div>
          </div>
        </div>

        {chartKind === 'barras' ? (
          <HorizontalBars data={chartData} onSelect={handleChartSelect} selectedKey={selectedChartKey} />
        ) : (
          <Donut data={chartData} onSelect={handleChartSelect} selectedKey={selectedChartKey} />
        )}
        <p className="text-[11px] text-beetz-dark/35 mt-4">Clique numa barra pra filtrar o painel inteiro por ela.</p>
      </div>

      {/* ---------- Tempo ---------- */}
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
        <h2 className="font-bold flex items-center gap-2 mb-1"><CalendarDays size={17} /> Por mês</h2>
        <p className="text-[11px] text-beetz-dark/40 mb-2">
          Agrupado pela data do evento — não pela data em que a despesa foi lançada no sistema.
        </p>
        <MonthlyBars data={monthlyData} onSelect={(k) => setMonth((cur) => (cur === k ? '' : k))} selectedKey={month || null} />
      </div>

      {/* ---------- Detalhe ---------- */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold flex items-center gap-2"><Users size={17} /> Lançamentos</h2>
          <p className="text-xs text-beetz-dark/40">{filtered.length} de {rows.length}</p>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 text-center border border-beetz-dark/5">
            Nenhum lançamento com esses filtros.
          </p>
        ) : (
          <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5 max-h-[420px] overflow-y-auto">
            {filtered.slice(0, 100).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-semibold truncate">{r.description || '(sem descrição)'}</p>
                  <p className="text-[11px] text-beetz-dark/45 truncate">
                    {r.eventName} · {r.category}
                    {r.personName !== 'Sem pessoa' && ` · ${r.personName}`}
                    {r.supplierName !== 'Sem fornecedor' && ` · ${r.supplierName}`}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  r.status === 'Pendente' ? 'bg-amber-100 text-amber-700'
                    : r.status === 'Aprovado' ? 'bg-green-100 text-green-700'
                    : 'bg-beetz-dark/10 text-beetz-dark/50'
                }`}>
                  {r.status}
                </span>
                <span className="text-sm font-bold w-24 text-right">{formatMoneyFull(r.total)}</span>
              </div>
            ))}
            {filtered.length > 100 && (
              <p className="text-xs text-beetz-dark/40 p-3 text-center">
                Mostrando os 100 primeiros. Use os filtros pra afunilar.
              </p>
            )}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}
